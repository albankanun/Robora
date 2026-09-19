// ============================================================================
// server.js — Robora virtual sales & reservation assistant
//   /              chat widget (voice suspended)
//   /chat          chat widget
//   /dashboard     staff dashboard (PASSWORD PROTECTED if env vars set)
//   /api/chat      text chat endpoint (Gemini + tools)
//   /api/web-order website cart posts reservations here (tagged "web")
//   /api/state     dashboard data (protected)
//   /ws/dashboard  realtime dashboard feed (protected)
// The Gemini API key stays on the server; the browser never sees it.
// ============================================================================
require("dotenv").config();
const http = require("http");
const path = require("path");
const express = require("express");
const { WebSocketServer, WebSocket } = require("ws");
const { AGENT, SYSTEM_PROMPT, TOOLS, BUSINESS, CATALOG } = require("./config");
const db = require("./db");
const mailer = require("./mailer");
const mysqlstore = require("./mysqlstore");
mysqlstore.init().catch(e => console.error("MySQL init failed (using file fallback):", e.message));

const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) console.warn("\u26A0\uFE0F  GEMINI_API_KEY missing — set it in the environment.");

const GEMINI_WS =
  "wss://generativelanguage.googleapis.com/ws/" +
  "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent" +
  `?key=${GEMINI_KEY}`;
const GEMINI_REST =
  "https://generativelanguage.googleapis.com/v1beta/models/" +
  `${AGENT.textModel}:generateContent`;

const app = express();
app.use(express.json());

// Allow robora.eu to embed the chat in an iframe.
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy",
    "frame-ancestors 'self' https://robora.eu https://www.robora.eu");
  next();
});

// --- Dashboard password protection (HTTP Basic Auth) ---
function dashboardAuth(req, res, next) {
  const USER = (process.env.DASHBOARD_USER || "").trim();
  const PASS = (process.env.DASHBOARD_PASS || "").trim();
  if (!USER || !PASS) return next(); // not configured -> open (warning at startup)
  const hdr = req.headers.authorization || "";
  const [scheme, encoded] = hdr.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString();
    const idx = decoded.indexOf(":");
    const u = decoded.slice(0, idx);
    const p = decoded.slice(idx + 1);   // everything after first colon = password (handles colons in password)
    if (u === USER && p === PASS) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Robora Dashboard"');
  return res.status(401).send("Authentication required.");
}

// --- Voice suspension routing (before static so it wins) ---
if (!AGENT.voiceEnabled) {
  app.get(["/", "/index.html", "/voice", "/voice.html"], (req, res) => {
    if (req.path === "/") return res.sendFile(path.join(__dirname, "public", "chat.html"));
    return res.redirect("/chat");
  });
} else {
  app.get("/voice", (_req, res) => res.sendFile(path.join(__dirname, "public", "voice.html")));
}
app.get("/dashboard.html", (_req, res) => res.redirect("/dashboard"));
app.use(express.static(path.join(__dirname, "public"), { index: AGENT.voiceEnabled ? "index.html" : false }));

app.get("/chat", (_req, res) => res.sendFile(path.join(__dirname, "public", "chat.html")));
app.get("/dashboard", dashboardAuth, (req, res) => {
  // Inject the auth token so the page's WebSocket can authenticate (browsers can't send Basic Auth on WS).
  const hdr = req.headers.authorization || "";
  const token = hdr.split(" ")[1] || "";
  const fs = require("fs");
  let html = fs.readFileSync(path.join(__dirname, "public", "dashboard.html"), "utf8");
  html = html.replace("</head>", `<script>window.ROBORA_WS_TOKEN=${JSON.stringify(token)};</script></head>`);
  res.type("html").send(html);
});
app.get("/api/state", dashboardAuth, async (_req, res) => {
  if (mysqlstore.ENABLED) { try { return res.json(await mysqlstore.loadAll()); } catch(e){ console.error("MySQL load:",e.message); } }
  res.json(db.snapshot());
});
app.get("/api/catalog", (_req, res) => res.json(CATALOG.map(p => ({
  ...p, price: db.preof(p.retail),
}))));

const server = http.createServer(app);

// ---------------------------------------------------------------------------
// Dashboard realtime bus
// ---------------------------------------------------------------------------
const dashboardClients = new Set();
function broadcast(event) {
  const payload = JSON.stringify(event);
  for (const ws of dashboardClients)
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
}

// ---------------------------------------------------------------------------
// Website cart -> dashboard (tagged "web"), also emailed by the website itself
// ---------------------------------------------------------------------------
app.post("/api/web-order", (req, res) => {
  try {
    const { name, email, phone, order, total } = req.body || {};
    if (!name || !email || !order) return res.status(400).json({ ok: false, error: "missing fields" });
    const rec = db.recordWebOrder({ name, email, phone, order, total });
    broadcast({ type: "preorder", order: rec, channel: "web", at: new Date().toISOString() });
    mailer.emailBuyerConfirmation(rec);
    mysqlstore.saveReservation(rec).catch(e=>console.error("MySQL save:",e.message));
    res.json({ ok: true, id: rec.id });
  } catch (e) {
    console.error("web-order error:", e.message);
    res.status(500).json({ ok: false });
  }
});

// ---------------------------------------------------------------------------
// Tool dispatch (chat) — runs a tool, notifies dashboard, emails reservations
// ---------------------------------------------------------------------------
function runTool(name, args, channel) {
  let result;
  try {
    if (name === "create_preorder")   result = db.createPreorder(args || {});
    else if (name === "check_price")  result = db.checkPrice(args || {});
    else if (name === "take_message") result = db.takeMessage(args || {});
    else                              result = { success: false, message: `Unknown tool ${name}` };
  } catch (e) { result = { success: false, message: "Tool error: " + e.message }; }

  if (result && result._event) {
    broadcast({ ...result._event, channel, at: new Date().toISOString() });
    if (result._event.type === "preorder") { mailer.emailPreorder(result._event.order); mailer.emailBuyerConfirmation(result._event.order); mysqlstore.saveReservation(result._event.order).catch(e=>console.error("MySQL save:",e.message)); }
    else if (result._event.type === "message") { mailer.emailMessage(result._event.msg); mysqlstore.saveMessage(result._event.msg).catch(e=>console.error("MySQL save:",e.message)); }
    delete result._event;
  }
  return result;
}

// ===========================================================================
// TEXT CHAT — /api/chat
// ===========================================================================
app.post("/api/chat", async (req, res) => {
  try {
    const { history = [], message, lang } = req.body || {};
    if (!message) return res.status(400).json({ error: "message required" });

    const contents = [];
    for (const h of history) contents.push({ role: h.role === "model" ? "model" : "user", parts: [{ text: h.text }] });
    contents.push({ role: "user", parts: [{ text: message }] });

    const LANG_NAMES = { en: "English", sq: "Albanian (Shqip)", de: "German (Deutsch)", it: "Italian (Italiano)" };
    let sysPrompt = SYSTEM_PROMPT;
    if (lang && LANG_NAMES[lang]) {
      sysPrompt += `\n\n# CURRENT CONVERSATION LANGUAGE\nThe customer opened the chat from the ${LANG_NAMES[lang]} version of the website. Begin and continue in ${LANG_NAMES[lang]} unless the customer clearly switches.`;
    }

    const body = {
      systemInstruction: { parts: [{ text: sysPrompt }] },
      contents,
      tools: [{ functionDeclarations: TOOLS }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
        thinkingConfig: { thinkingLevel: "low" },
      },
    };

    let reply = "";
    for (let hop = 0; hop < 5; hop++) {
      const r = await fetch(GEMINI_REST, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (data.error) { console.error("Gemini error:", data.error); return res.status(500).json({ error: data.error.message }); }
      const cand = data.candidates && data.candidates[0];
      const parts = (cand && cand.content && cand.content.parts) || [];
      const calls = parts.filter(p => p.functionCall).map(p => p.functionCall);

      if (calls.length) {
        body.contents.push({ role: "model", parts });
        body.contents.push({ role: "user", parts: calls.map(c => ({
          functionResponse: { name: c.name, response: runTool(c.name, c.args, "chat") },
        })) });
        continue;
      }
      reply = parts.filter(p => p.text).map(p => p.text).join("").trim();
      break;
    }
    res.json({ reply: reply || "Sorry, I didn't catch that — could you rephrase?" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "chat failed" });
  }
});

// ===========================================================================
// DASHBOARD WS
// ===========================================================================
const wssDash = new WebSocketServer({ noServer: true });
wssDash.on("connection", async (ws) => {
  dashboardClients.add(ws);
  let snap = db.snapshot();
  if (mysqlstore.ENABLED) { try { snap = await mysqlstore.loadAll(); } catch(e){ console.error("MySQL load:",e.message); } }
  ws.send(JSON.stringify({ type: "snapshot", data: snap, at: new Date().toISOString() }));
  ws.on("close", () => dashboardClients.delete(ws));
});

// ===========================================================================
// VOICE WS — only active if AGENT.voiceEnabled
// ===========================================================================
const wssVoice = new WebSocketServer({ noServer: true });
wssVoice.on("connection", (client) => {
  if (!AGENT.voiceEnabled) { client.close(1000, "voice disabled"); return; }
  if (!GEMINI_KEY) { client.close(1011, "no api key"); return; }
  const gem = new WebSocket(GEMINI_WS);
  let gemReady = false; const queue = [];
  gem.on("open", () => {
    gem.send(JSON.stringify({ setup: {
      model: `models/${AGENT.model}`,
      generationConfig: { responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: AGENT.voice } } } },
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      tools: [{ functionDeclarations: TOOLS }],
    } }));
  });
  gem.on("message", (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.setupComplete) { gemReady = true; while (queue.length) gem.send(queue.shift()); client.send(JSON.stringify({ type: "ready" })); return; }
    if (msg.toolCall && msg.toolCall.functionCalls) {
      gem.send(JSON.stringify({ toolResponse: { functionResponses: msg.toolCall.functionCalls.map(fc => ({
        id: fc.id, name: fc.name, response: runTool(fc.name, fc.args, "voice") })) } }));
      return;
    }
    const sc = msg.serverContent;
    if (sc) {
      if (sc.modelTurn && sc.modelTurn.parts) for (const part of sc.modelTurn.parts) {
        if (part.inlineData && part.inlineData.data) client.send(JSON.stringify({ type: "audio", data: part.inlineData.data }));
        if (part.text) client.send(JSON.stringify({ type: "text", text: part.text }));
      }
      if (sc.turnComplete) client.send(JSON.stringify({ type: "turn_complete" }));
    }
  });
  gem.on("close", () => { try { client.close(); } catch {} });
  gem.on("error", () => { try { client.close(); } catch {} });
  client.on("message", (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === "audio" && msg.data) {
      const frame = JSON.stringify({ realtimeInput: { mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: msg.data }] } });
      gemReady ? gem.send(frame) : queue.push(frame);
    }
  });
  client.on("close", () => { try { gem.close(); } catch {} });
});

// ---------------------------------------------------------------------------
// Upgrade routing (dashboard WS protected by same basic auth)
// ---------------------------------------------------------------------------
server.on("upgrade", (req, socket, head) => {
  const { url } = req;
  if (url.startsWith("/ws/voice")) {
    wssVoice.handleUpgrade(req, socket, head, (ws) => wssVoice.emit("connection", ws, req));
  } else if (url.startsWith("/ws/dashboard")) {
    const USER = (process.env.DASHBOARD_USER || "").trim(), PASS = (process.env.DASHBOARD_PASS || "").trim();
    if (USER && PASS) {
      let ok = false;
      // Token from the URL (?token=base64) — used by the browser WebSocket.
      const m = url.match(/[?&]token=([^&]+)/);
      if (m) {
        try {
          const decoded = Buffer.from(decodeURIComponent(m[1]), "base64").toString();
          const idx = decoded.indexOf(":");
          ok = (decoded.slice(0, idx) === USER && decoded.slice(idx + 1) === PASS);
        } catch {}
      }
      // Fallback: Authorization header (non-browser clients)
      if (!ok) {
        const hdr = req.headers.authorization || "";
        const [scheme, encoded] = hdr.split(" ");
        if (scheme === "Basic" && encoded) {
          const decoded = Buffer.from(encoded, "base64").toString();
          const idx = decoded.indexOf(":");
          ok = (decoded.slice(0, idx) === USER && decoded.slice(idx + 1) === PASS);
        }
      }
      if (!ok) { socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); socket.destroy(); return; }
    }
    wssDash.handleUpgrade(req, socket, head, (ws) => wssDash.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`\n\uD83E\uDD16  ${BUSINESS.name} assistant "${AGENT.name}"`);
  console.log(`   Chat:      http://localhost:${PORT}/  (and /chat)`);
  console.log(`   Dashboard: http://localhost:${PORT}/dashboard`);
  if (!process.env.DASHBOARD_USER || !process.env.DASHBOARD_PASS)
    console.warn("\u26A0\uFE0F  Dashboard NOT password-protected. Set DASHBOARD_USER and DASHBOARD_PASS.");
  if (!process.env.SMTP_PASS)
    console.warn("\u26A0\uFE0F  Reservation emails OFF. Set SMTP_PASS (+ SMTP_USER/HOST) to email info@robora.eu.\n");
});

// ============================================================================
// server.js — Robora virtual sales assistant
//   /                caller-facing VOICE widget
//   /chat            customer TEXT chat widget
//   /dashboard       staff dashboard (realtime)
//   /ws/voice        browser <-> server <-> Gemini Live audio proxy
//   /ws/dashboard    realtime events for the dashboard
//   /api/chat        text chat endpoint (REST, uses Gemini + same tools)
//   /api/state       full data snapshot (dashboard bootstrap)
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

const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) console.warn("\u26A0\uFE0F  GEMINI_API_KEY missing — set it in .env");

const GEMINI_WS =
  "wss://generativelanguage.googleapis.com/ws/" +
  "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent" +
  `?key=${GEMINI_KEY}`;
const GEMINI_REST =
  "https://generativelanguage.googleapis.com/v1beta/models/" +
  `${AGENT.textModel}:generateContent`;

const app = express();
app.use(express.json());

// Allow robora.eu (and its subdomains) to embed the chat widget in an iframe.
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://robora.eu https://www.robora.eu"
  );
  next();
});
// --- Voice suspension routing (must be BEFORE static so it wins) ---
if (!AGENT.voiceEnabled) {
  app.get(["/", "/index.html", "/voice", "/voice.html"], (_req, res) => {
    if (_req.path === "/") return res.sendFile(path.join(__dirname, "public", "chat.html"));
    return res.redirect("/chat");
  });
} else {
  app.get("/voice", (_req, res) => res.sendFile(path.join(__dirname, "public", "voice.html")));
}
app.use(express.static(path.join(__dirname, "public"), { index: AGENT.voiceEnabled ? "index.html" : false }));
app.get("/chat", (_req, res) => res.sendFile(path.join(__dirname, "public", "chat.html")));
// --- Dashboard password protection (HTTP Basic Auth) ---
// Set DASHBOARD_USER and DASHBOARD_PASS in Render. If unset, dashboard is open (dev only).
function dashboardAuth(req, res, next) {
  const USER = process.env.DASHBOARD_USER;
  const PASS = process.env.DASHBOARD_PASS;
  if (!USER || !PASS) return next(); // not configured -> allow (you'll see a warning at startup)
  const hdr = req.headers.authorization || "";
  const [scheme, encoded] = hdr.split(" ");
  if (scheme === "Basic" && encoded) {
    const [u, p] = Buffer.from(encoded, "base64").toString().split(":");
    if (u === USER && p === PASS) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Robora Dashboard"');
  return res.status(401).send("Authentication required.");
}

app.get("/dashboard", dashboardAuth, (_req, res) => res.sendFile(path.join(__dirname, "public", "dashboard.html")));
app.get("/api/state", dashboardAuth, (_req, res) => res.json(db.snapshot()));
app.get("/api/catalog", (_req, res) => res.json(CATALOG.map(p => ({
  ...p, preorder: db.preof(p.retail), you_save: db.saveof(p.retail),
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
// Tool dispatch — executes a function the model called, returns the result,
// and notifies the dashboard ("FROM ASSISTANT" toasts).
// ---------------------------------------------------------------------------
function runTool(name, args, channel) {
  let result;
  try {
    if (name === "create_preorder")      result = db.createPreorder(args || {});
    else if (name === "check_price")     result = db.checkPrice(args || {});
    else if (name === "take_message")    result = db.takeMessage(args || {});
    else                                 result = { success: false, message: `Unknown tool ${name}` };
  } catch (e) {
    result = { success: false, message: "Tool error: " + e.message };
  }
  // fire dashboard events + send email notifications
  if (result && result._event) {
    broadcast({ ...result._event, channel, at: new Date().toISOString() });
    if (result._event.type === "preorder") mailer.emailPreorder(result._event.order);
    else if (result._event.type === "message") mailer.emailMessage(result._event.msg);
    delete result._event;
  }
  return result;
}

// ===========================================================================
// TEXT CHAT — /api/chat  (REST, multi-turn via history in the request)
// body: { history: [{role:'user'|'model', text:'...'}], message: '...' }
// ===========================================================================
app.post("/api/chat", async (req, res) => {
  try {
    const { history = [], message, lang } = req.body || {};
    if (!message) return res.status(400).json({ error: "message required" });

    const contents = [];
    for (const h of history) {
      contents.push({ role: h.role === "model" ? "model" : "user", parts: [{ text: h.text }] });
    }
    contents.push({ role: "user", parts: [{ text: message }] });

    const LANG_NAMES = { en: "English", sq: "Albanian (Shqip)", de: "German (Deutsch)", it: "Italian (Italiano)" };
    let sysPrompt = SYSTEM_PROMPT;
    if (lang && LANG_NAMES[lang]) {
      sysPrompt += `\n\n# CURRENT CONVERSATION LANGUAGE\nThe customer opened the chat from the ${LANG_NAMES[lang]} version of the website. Begin and continue in ${LANG_NAMES[lang]} unless the customer clearly switches to another language.`;
    }

    const body = {
      systemInstruction: { parts: [{ text: sysPrompt }] },
      contents,
      tools: [{ functionDeclarations: TOOLS }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,          // sales replies are short — caps latency
        thinkingConfig: { thinkingLevel: "low" }, // minimise thinking for speed (Gemini 3.x)
      },
    };

    // Tool loop: call model, run any tool calls, feed results back, repeat.
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
        const responseParts = calls.map(c => ({
          functionResponse: { name: c.name, response: runTool(c.name, c.args, "chat") },
        }));
        body.contents.push({ role: "user", parts: responseParts });
        continue; // let the model speak after seeing tool results
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
wssDash.on("connection", (ws) => {
  dashboardClients.add(ws);
  ws.send(JSON.stringify({ type: "snapshot", data: db.snapshot(), at: new Date().toISOString() }));
  ws.on("close", () => dashboardClients.delete(ws));
});

// ===========================================================================
// VOICE WS — browser <-> server <-> Gemini Live
//   Browser sends 16 kHz PCM mic frames; server relays to Gemini Live.
//   Gemini streams 24 kHz PCM audio back + toolCall frames (run server-side).
// ===========================================================================
const wssVoice = new WebSocketServer({ noServer: true });
wssVoice.on("connection", (client) => {
  if (!AGENT.voiceEnabled) { client.close(1000, "voice disabled"); return; }
  if (!GEMINI_KEY) { client.close(1011, "no api key"); return; }
  const gem = new WebSocket(GEMINI_WS);
  let gemReady = false;
  const queue = [];

  gem.on("open", () => {
    gem.send(JSON.stringify({
      setup: {
        model: `models/${AGENT.model}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: AGENT.voice } } },
        },
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        tools: [{ functionDeclarations: TOOLS }],
      },
    }));
  });

  gem.on("message", (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.setupComplete) {
      gemReady = true;
      while (queue.length) gem.send(queue.shift());
      client.send(JSON.stringify({ type: "ready" }));
      return;
    }
    // Tool calls from Gemini Live
    if (msg.toolCall && msg.toolCall.functionCalls) {
      const responses = msg.toolCall.functionCalls.map(fc => ({
        id: fc.id, name: fc.name, response: runTool(fc.name, fc.args, "voice"),
      }));
      gem.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
      client.send(JSON.stringify({ type: "tool", names: msg.toolCall.functionCalls.map(f => f.name) }));
      return;
    }
    // Model audio + transcripts
    const sc = msg.serverContent;
    if (sc) {
      if (sc.modelTurn && sc.modelTurn.parts) {
        for (const part of sc.modelTurn.parts) {
          if (part.inlineData && part.inlineData.data) {
            client.send(JSON.stringify({ type: "audio", data: part.inlineData.data })); // base64 24k PCM
          }
          if (part.text) client.send(JSON.stringify({ type: "text", text: part.text }));
        }
      }
      if (sc.turnComplete) client.send(JSON.stringify({ type: "turn_complete" }));
      if (sc.interrupted) client.send(JSON.stringify({ type: "interrupted" }));
    }
  });

  gem.on("close", () => { try { client.close(); } catch {} });
  gem.on("error", (e) => { console.error("Gemini WS error:", e.message); try { client.close(); } catch {} });

  // Browser -> server
  client.on("message", (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === "audio" && msg.data) {
      const frame = JSON.stringify({
        realtimeInput: { mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: msg.data }] },
      });
      gemReady ? gem.send(frame) : queue.push(frame);
    } else if (msg.type === "text" && msg.text) {
      const frame = JSON.stringify({
        clientContent: { turns: [{ role: "user", parts: [{ text: msg.text }] }], turnComplete: true },
      });
      gemReady ? gem.send(frame) : queue.push(frame);
    }
  });
  client.on("close", () => { try { gem.close(); } catch {} });
});

// ---------------------------------------------------------------------------
// Upgrade routing
// ---------------------------------------------------------------------------
server.on("upgrade", (req, socket, head) => {
  const { url } = req;
  if (url.startsWith("/ws/voice")) {
    wssVoice.handleUpgrade(req, socket, head, (ws) => wssVoice.emit("connection", ws, req));
  } else if (url.startsWith("/ws/dashboard")) {
    // Require the same basic-auth credentials for the realtime feed
    const USER = process.env.DASHBOARD_USER, PASS = process.env.DASHBOARD_PASS;
    if (USER && PASS) {
      const hdr = req.headers.authorization || "";
      const [scheme, encoded] = hdr.split(" ");
      let ok = false;
      if (scheme === "Basic" && encoded) {
        const [u, p] = Buffer.from(encoded, "base64").toString().split(":");
        ok = (u === USER && p === PASS);
      }
      if (!ok) { socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); socket.destroy(); return; }
    }
    wssDash.handleUpgrade(req, socket, head, (ws) => wssDash.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`\n\uD83E\uDD16  ${BUSINESS.name} virtual assistant "${AGENT.name}"`);
  console.log(`   Chat widget:     http://localhost:${PORT}/  (and /chat)`);
  console.log(`   Voice widget:    ${AGENT.voiceEnabled ? "http://localhost:"+PORT+"/voice" : "SUSPENDED (set AGENT.voiceEnabled=true to enable)"}`);
  console.log(`   Staff dashboard: http://localhost:${PORT}/dashboard\n`);
  if (!process.env.DASHBOARD_USER || !process.env.DASHBOARD_PASS)
    console.warn("\u26A0\uFE0F  Dashboard is NOT password-protected. Set DASHBOARD_USER and DASHBOARD_PASS in Render.");
  if (!process.env.SMTP_PASS)
    console.warn("\u26A0\uFE0F  Reservation emails OFF. Set SMTP_PASS (and SMTP_USER/HOST) in Render to email info@robora.eu.");
});

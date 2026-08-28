// ============================================================================
// db.js — Robora assistant data + business logic
//   JSON-file store. The single module to replace when moving to a real DB
//   or wiring pre-orders into email/CRM. All pricing math lives here.
// ============================================================================
const fs = require("fs");
const path = require("path");
const { CATALOG, BUSINESS, POLICIES } = require("./config");

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "robora-db.json");

function load() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return { preorders: [], messages: [] }; }
}
function save(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
function newId(prefix) {
  return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const DISC = BUSINESS.preorderDiscount;           // 0.20
const byId = Object.fromEntries(CATALOG.map(p => [p.id, p]));

function preof(retail) { return +(retail * (1 - DISC)).toFixed(2); }
function saveof(retail) { return +(retail * DISC).toFixed(2); }

// ---- price lookup -----------------------------------------------------------
function checkPrice({ product_id, quantity = 1 }) {
  const p = byId[product_id];
  if (!p) return { success: false, message: `Unknown product "${product_id}".` };
  const q = Math.max(1, Math.min(POLICIES.maxQtyPerItem, quantity | 0 || 1));
  const pre = preof(p.retail);
  return {
    success: true,
    product: p.name,
    category: p.category,
    quantity: q,
    retail_each: p.retail,
    preorder_each: pre,
    retail_total: +(p.retail * q).toFixed(2),
    preorder_total: +(pre * q).toFixed(2),
    you_save: +(saveof(p.retail) * q).toFixed(2),
    currency: "EUR",
  };
}

// ---- create a pre-order -----------------------------------------------------
function createPreorder({ name, email, phone, items, language, note }) {
  if (!name || !email || !phone) return { success: false, message: "Name, email and phone are required." };
  if (!Array.isArray(items) || items.length === 0) return { success: false, message: "No products selected." };

  const lines = [];
  let retailTotal = 0, preTotal = 0;
  for (const it of items) {
    const p = byId[it.product_id];
    if (!p) return { success: false, message: `Unknown product "${it.product_id}".` };
    const q = Math.max(1, Math.min(POLICIES.maxQtyPerItem, (it.quantity | 0) || 1));
    const pre = preof(p.retail);
    lines.push({ product_id: p.id, name: p.name, quantity: q, preorder_each: pre, line_total: +(pre * q).toFixed(2) });
    retailTotal += p.retail * q;
    preTotal += pre * q;
  }
  retailTotal = +retailTotal.toFixed(2);
  preTotal = +preTotal.toFixed(2);

  const db = load();
  const order = {
    id: newId("PRE"),
    name, email, phone,
    language: language || "English",
    note: note || "",
    lines,
    retail_total: retailTotal,
    preorder_total: preTotal,
    you_save: +(retailTotal - preTotal).toFixed(2),
    currency: "EUR",
    status: "new",
    createdAt: new Date().toISOString(),
  };
  db.preorders.push(order);
  save(db);

  return {
    success: true,
    order_id: order.id,
    summary: lines.map(l => `${l.name} × ${l.quantity} = €${l.line_total.toFixed(2)}`).join("; "),
    preorder_total: preTotal,
    you_save: order.you_save,
    message: `Pre-order recorded. The team will email ${email} to confirm and arrange delivery by ${POLICIES.deliveryWindow}. No payment is taken now.`,
    _event: { type: "preorder", order },
  };
}

// ---- take a message ---------------------------------------------------------
function takeMessage({ name, contact, topic, message }) {
  const db = load();
  const msg = {
    id: newId("MSG"),
    name: name || "", contact: contact || "", topic: topic || "general",
    message, status: "new", source: "assistant",
    createdAt: new Date().toISOString(),
  };
  db.messages.push(msg);
  save(db);
  return { success: true, message: "Message recorded — the team will follow up.", _event: { type: "message", msg } };
}

function snapshot() { return load(); }

module.exports = { checkPrice, createPreorder, takeMessage, snapshot, preof, saveof };

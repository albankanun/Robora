// ============================================================================
// mysqlstore.js — permanent reservation storage in MySQL (InMotion).
//   Activates only when DB_HOST/DB_USER/DB_PASS/DB_NAME are set (in Render).
//   If not set, the assistant falls back to the JSON file (db.js).
//   Creates its tables automatically on first connect.
// ============================================================================
const mysql = require("mysql2/promise");

const CFG = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || "3306", 10),
};

const ENABLED = !!(CFG.host && CFG.user && CFG.password && CFG.database);
let pool = null;

async function init() {
  if (!ENABLED) return false;
  pool = mysql.createPool({ ...CFG, waitForConnections: true, connectionLimit: 5, charset: "utf8mb4" });
  // Create tables if they don't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservations (
      id VARCHAR(40) PRIMARY KEY,
      source VARCHAR(10),
      name VARCHAR(200),
      email VARCHAR(255),
      phone VARCHAR(60),
      language VARCHAR(40),
      note TEXT,
      lines_json TEXT,
      raw_order TEXT,
      retail_total DECIMAL(10,2),
      preorder_total DECIMAL(10,2),
      you_save DECIMAL(10,2),
      status VARCHAR(20) DEFAULT 'new',
      created_at DATETIME
    ) CHARACTER SET utf8mb4`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id VARCHAR(40) PRIMARY KEY,
      source VARCHAR(10),
      name VARCHAR(200),
      contact VARCHAR(255),
      topic VARCHAR(80),
      message TEXT,
      status VARCHAR(20) DEFAULT 'new',
      created_at DATETIME
    ) CHARACTER SET utf8mb4`);
  console.log("\u2705  MySQL connected — reservations are now permanent.");
  return true;
}

async function saveReservation(o) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO reservations (id,source,name,email,phone,language,note,lines_json,raw_order,retail_total,preorder_total,you_save,status,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [o.id, o.source||'', o.name||'', o.email||'', o.phone||'', o.language||'', o.note||'',
     JSON.stringify(o.lines||[]), o.raw_order||'', o.retail_total||0, o.preorder_total||0,
     o.you_save||0, o.status||'new', toMysqlDate(o.createdAt)]
  );
}

async function saveMessage(m) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO messages (id,source,name,contact,topic,message,status,created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [m.id, m.source||'', m.name||'', m.contact||'', m.topic||'', m.message||'', m.status||'new', toMysqlDate(m.createdAt)]
  );
}

async function loadAll() {
  if (!pool) return { preorders: [], messages: [] };
  const [rows] = await pool.query("SELECT * FROM reservations ORDER BY created_at ASC");
  const [msgs] = await pool.query("SELECT * FROM messages ORDER BY created_at ASC");
  const preorders = rows.map(r => ({
    id: r.id, source: r.source, name: r.name, email: r.email, phone: r.phone,
    language: r.language, note: r.note,
    lines: safeParse(r.lines_json), raw_order: r.raw_order,
    retail_total: +r.retail_total, preorder_total: +r.preorder_total, you_save: +r.you_save,
    status: r.status, createdAt: r.created_at,
  }));
  const messages = msgs.map(m => ({
    id: m.id, source: m.source, name: m.name, contact: m.contact, topic: m.topic,
    message: m.message, status: m.status, createdAt: m.created_at,
  }));
  return { preorders, messages };
}

function toMysqlDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function safeParse(s) { try { return JSON.parse(s); } catch { return []; } }

module.exports = { ENABLED, init, saveReservation, saveMessage, loadAll };

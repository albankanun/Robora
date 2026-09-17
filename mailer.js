// ============================================================================
// mailer.js — emails chat reservations & messages to info@robora.eu via SMTP.
//   Credentials come from environment variables (set them in Render).
//   If SMTP_PASS isn't set, emailing is skipped (dashboard still records).
// ============================================================================
const nodemailer = require("nodemailer");

const HOST = process.env.SMTP_HOST || "mail.robora.eu";
const PORT = parseInt(process.env.SMTP_PORT || "465", 10);
const USER = process.env.SMTP_USER || "form@robora.eu";
const PASS = process.env.SMTP_PASS || "";
const TO   = process.env.MAIL_TO   || "info@robora.eu";
const FROM = process.env.MAIL_FROM || "Robora Assistant <form@robora.eu>";

let transporter = null;
if (PASS) {
  transporter = nodemailer.createTransport({
    host: HOST, port: PORT, secure: PORT === 465, auth: { user: USER, pass: PASS },
  });
} else {
  console.warn("\u26A0\uFE0F  SMTP_PASS not set — reservation emails are OFF (dashboard still records them).");
}

function eur(n) { return "\u20AC" + Number(n).toFixed(2); }

async function emailPreorder(order) {
  if (!transporter) return;
  const lines = (order.lines && order.lines.length)
    ? order.lines.map(l => `  • ${l.name} \u00D7 ${l.quantity} = ${eur(l.line_total)}`).join("\n")
    : (order.raw_order || "");
  const body =
`New RESERVATION (${order.source === "web" ? "website" : "chat assistant"})
=====================================================
Name:  ${order.name}
Email: ${order.email}
Phone: ${order.phone}
${order.language ? "Language: " + order.language + "\n" : ""}Time:  ${new Date(order.createdAt).toLocaleString()}
-----------------------------------------------------
${lines}
-----------------------------------------------------
Total: ${eur(order.preorder_total)}
${order.note ? "\nNote: " + order.note : ""}
=====================================================
Reply to this email to contact the customer (${order.email}).`;
  try {
    await transporter.sendMail({
      from: FROM, to: TO, replyTo: `${order.name} <${order.email}>`,
      subject: `New reservation from ${order.name} — ${eur(order.preorder_total)}`,
      text: body,
    });
    console.log("\u2709\uFE0F  Reservation emailed to", TO, "(", order.id, ")");
  } catch (e) { console.error("Reservation email failed:", e.message); }
}

async function emailMessage(msg) {
  if (!transporter) return;
  const body =
`New MESSAGE from the website chat assistant (Rina)
==================================================
Name:    ${msg.name || "(not given)"}
Contact: ${msg.contact || "(not given)"}
Topic:   ${msg.topic || "general"}
Time:    ${new Date(msg.createdAt).toLocaleString()}
--------------------------------------------------
${msg.message}
==================================================`;
  try {
    await transporter.sendMail({
      from: FROM, to: TO, replyTo: msg.contact || undefined,
      subject: `Chat message (${msg.topic || "general"}) — ${msg.name || "website visitor"}`,
      text: body,
    });
    console.log("\u2709\uFE0F  Message emailed to", TO, "(", msg.id, ")");
  } catch (e) { console.error("Message email failed:", e.message); }
}

module.exports = { emailPreorder, emailMessage };

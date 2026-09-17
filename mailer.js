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

// ---- confirmation email sent TO THE BUYER ----
const BUYER_MESSAGES = {
  English: {
    subject: "We received your Robora reservation",
    greeting: (name) => `Hi ${name},`,
    body: "Thank you for your reservation with Robora! We've received it and our team will contact you shortly to confirm the details and arrange delivery by the end of September. No payment is needed now.",
    order: "Your reservation:",
    total: "Total",
    footer: "If you have any questions, just reply to this email or write to info@robora.eu.\n\nWarm regards,\nThe Robora team\nengineered for tomorrow",
  },
  Albanian: {
    subject: "E morëm rezervimin tuaj në Robora",
    greeting: (name) => `Përshëndetje ${name},`,
    body: "Faleminderit për rezervimin tuaj në Robora! E kemi marrë dhe ekipi ynë do t'ju kontaktojë së shpejti për të konfirmuar detajet dhe për të organizuar dërgesën deri në fund të shtatorit. Nuk nevojitet pagesë tani.",
    order: "Rezervimi juaj:",
    total: "Totali",
    footer: "Për çdo pyetje, thjesht përgjigjuni këtij emaili ose na shkruani te info@robora.eu.\n\nMe respekt,\nEkipi i Robora\nengineered for tomorrow",
  },
  German: {
    subject: "Wir haben Ihre Robora-Reservierung erhalten",
    greeting: (name) => `Hallo ${name},`,
    body: "Vielen Dank für Ihre Reservierung bei Robora! Wir haben sie erhalten und unser Team wird Sie in Kürze kontaktieren, um die Details zu bestätigen und die Lieferung bis Ende September zu vereinbaren. Es ist jetzt keine Zahlung erforderlich.",
    order: "Ihre Reservierung:",
    total: "Gesamt",
    footer: "Bei Fragen antworten Sie einfach auf diese E-Mail oder schreiben Sie an info@robora.eu.\n\nHerzliche Grüße,\nIhr Robora-Team\nengineered for tomorrow",
  },
  Italian: {
    subject: "Abbiamo ricevuto la tua prenotazione Robora",
    greeting: (name) => `Ciao ${name},`,
    body: "Grazie per la tua prenotazione con Robora! L'abbiamo ricevuta e il nostro team ti contatterà a breve per confermare i dettagli e organizzare la consegna entro fine settembre. Non è richiesto alcun pagamento ora.",
    order: "La tua prenotazione:",
    total: "Totale",
    footer: "Per qualsiasi domanda, rispondi a questa email o scrivi a info@robora.eu.\n\nCordiali saluti,\nIl team Robora\nengineered for tomorrow",
  },
};

async function emailBuyerConfirmation(order) {
  if (!transporter) return;
  if (!order.email) return;
  const lang = order.language && BUYER_MESSAGES[order.language] ? order.language : "English";
  const M = BUYER_MESSAGES[lang];
  const lines = (order.lines && order.lines.length)
    ? order.lines.map(l => `  • ${l.name} \u00D7 ${l.quantity}`).join("\n")
    : (order.raw_order || "");
  const body =
`${M.greeting(order.name)}

${M.body}

${M.order}
${lines}
${M.total}: ${eur(order.preorder_total)}

${M.footer}`;
  try {
    await transporter.sendMail({
      from: FROM, to: order.email,
      subject: M.subject,
      text: body,
    });
    console.log("\u2709\uFE0F  Buyer confirmation sent to", order.email, "(", lang, ")");
  } catch (e) { console.error("Buyer confirmation failed:", e.message); }
}

module.exports = { emailPreorder, emailMessage, emailBuyerConfirmation };

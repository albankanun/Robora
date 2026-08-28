# Robora — Virtual Sales & Pre-order Assistant ("Rina")

A multilingual (EN / SQ / DE / IT) AI assistant for Robora that answers product
questions and takes pre-orders — available as **voice**, **chat**, and a live
**staff dashboard**, all sharing one brain (config + tools).

Same architecture as the Lithos/Peugeot builds: Google **Gemini Live** for
speech-to-speech voice, Gemini for text chat, server-side function calling, and
a realtime dashboard. The API key never leaves the server.

```
Browser voice widget ─WS→ server.js ─WS→ Gemini Live  (speech ↔ speech)
Browser chat widget  ─HTTP→ /api/chat → Gemini        (text, same tools)
                              │  runs tool calls server-side
                              ▼
                            db.js  (pre-orders / messages / pricing)
                              │
Staff dashboard  ←WS── event bus  (live toasts + tables)
```

## What Rina does
- Explains the products (Hutt window robots + Mamibot vacuums/mops/etc.), specs and prices
- Explains the **20% pre-order discount**, no payment now, delivery by end of September
- Takes **multi-item pre-orders** (name, email, phone, products, quantities) with correct totals
- Mentions **free delivery** to Kosovo, Albania and North Macedonia
- Detects and replies in **English, Albanian, German or Italian**
- Takes a message / routes anything she can't do (support, reseller enquiries)

## 1. Run it locally (5 minutes)
1. Install **Node.js 18+** (you have it if `node --version` works).
2. Get a free **Gemini API key**: https://aistudio.google.com → *Get API key* → *Create API key*.
3. In this folder:
   ```bash
   cp .env.example .env        # Windows: copy .env.example .env
   ```
   Open `.env` and paste your key: `GEMINI_API_KEY=AIza...`
4. Then:
   ```bash
   npm install
   npm start
   ```
   You'll see:
   ```
   🤖  Robora virtual assistant "Rina"
      Voice widget:    http://localhost:3000/
      Chat widget:     http://localhost:3000/chat
      Staff dashboard: http://localhost:3000/dashboard
   ```

## 2. Test it
Open the **dashboard** and a customer widget side by side:

- **Chat:** open `http://localhost:3000/chat`, type *"What's the cheapest robot?"*
  or *"Dua të porosis një Hutt 10"* (Albanian) — Rina answers in that language,
  prices it, collects your details, and books the pre-order. It appears on the
  dashboard instantly with a toast.
- **Voice:** open `http://localhost:3000/`, click **Start talking**, allow the
  mic, and just speak. Try *"Sa kushton T20?"* or *"Ich möchte den Hutt S10 vorbestellen."*

Things to try: multi-item orders ("a Hutt 10 and two T20s"), price questions,
switching language mid-conversation, and "can I talk to a human" (→ message).

## 3. Put the chat on robora.eu
The chat widget is a single page you can iframe, or lift the `/chat` markup into
a floating bubble. Simplest embed:
```html
<iframe src="https://YOUR-AGENT-HOST/chat" style="position:fixed;bottom:20px;right:20px;
  width:400px;height:640px;border:none;border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,.4);z-index:9999"></iframe>
```
Point `YOUR-AGENT-HOST` at wherever you deploy this (below). For voice on the
site, iframe `/` the same way.

## 4. Deploy
Any Node host works (Railway, Render, Fly.io):
- Set `GEMINI_API_KEY` in the host's environment.
- Mount a persistent volume for `data/` (so pre-orders survive restarts).
- Put the **dashboard behind a password** (basic auth or the host's access control) before going public.

## 5. Real phone number (optional, later)
The voice widget runs in the browser (great for the website and demos). To answer
an actual phone line:
1. Buy a number on **Twilio**, point it at a Media Streams webhook.
2. Bridge Twilio's 8 kHz μ-law audio to this server's `/ws/voice` (resample
   8k↔16k in, 24k→8k out). Or use **Vapi / Retell / Bland**, which handle
   telephony and reuse the same system prompt + tools via webhook.

## 6. Connect pre-orders to email / your site
Right now pre-orders are stored in `data/robora-db.json` and shown on the dashboard.
To also email them to `info@robora.eu`, wire `createPreorder` in **db.js** to your
mail sender (e.g. the same SMTP the website's `preorder.php` uses), or POST them to
an endpoint on robora.eu. It's the single place to change.

## Files you'll edit most
| Where | What |
|---|---|
| `config.js` → `BUSINESS` | company facts, discount %, delivery window, free-delivery regions |
| `config.js` → `CATALOG` | products, prices, blurbs, features (keep in sync with the website) |
| `config.js` → `AGENT` | assistant name, Gemini voice (Aoede/Kore/Puck…), models |
| `config.js` → `SYSTEM_PROMPT` | tone, rules, how she pitches and takes orders |
| `db.js` | pricing logic + where orders/messages go (hook up email/CRM here) |

## Notes
- **Prices** live in `config.js` `CATALOG` and are computed (retail × 0.8). Keep them matching robora.eu.
- Rina is told to be honest that Robora is a **reseller** of Hutt and Mamibot.
- She never takes payment — pre-orders are free to place; the team confirms by email.
- **Coming soon** categories (pool robots, garden mowers) are off-limits for orders.

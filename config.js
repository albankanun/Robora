// ============================================================================
// ROBORA — VIRTUAL SALES & PRE-ORDER ASSISTANT CONFIGURATION
// Everything that defines WHO the assistant is and WHAT it can do.
// Edit BUSINESS, CATALOG and POLICIES to match reality; the rest rarely changes.
// Shared by BOTH the voice widget and the text chat widget.
// ============================================================================

const BUSINESS = {
  name: "Robora",
  legalName: "Robora L.L.C",
  tagline: "engineered for tomorrow",
  what: "a reseller of smart home-cleaning robots — window robots, robot & stick vacuums, floor washers, electric mops, UV cleaners and car vacuums",
  website: "https://robora.eu",
  email: "info@robora.eu",
  address: "Zekeria Cana 13, Prishtinë, Kosovo",
  // Pre-order campaign facts
  preorderDiscount: 0.20,          // 20% off retail for pre-orders
  deliveryBy: "the end of September",
  noPaymentNow: true,              // pre-orders take no payment up front
  freeDeliveryRegions: ["Kosovo", "Albania", "North Macedonia"],
  languages: ["English", "Albanian (Shqip)", "German (Deutsch)", "Italian (Italiano)"],
};

// ----------------------------------------------------------------------------
// PRODUCT CATALOG — single source of truth for both widgets.
// prices in EUR. preorder price is retail * 0.8 (computed in db.js).
// ----------------------------------------------------------------------------
const CATALOG = [
  {
    id: "hutt10", name: "Hutt 10", category: "Window robots", retail: 399,
    blurb: "Autonomous window, mirror and glass-door cleaning — wet and dry in a single pass.",
    features: ["One-button operation, no app required", "Smart edge detection and route planning",
               "Cleans windows, mirrors, shower screens and tiles", "Secure suction with anti-drop safety"],
  },
  {
    id: "hutts10", name: "Hutt S10", category: "Window robots", retail: 649,
    blurb: "The newest flagship window robot — advanced navigation and coverage for larger windows and facades.",
    features: ["Next-generation path planning for full coverage", "Powerful suction with quiet operation",
               "Ideal for large panes and commercial glass", "Latest 2026 model"],
  },
  {
    id: "t20", name: "Mamibot Robot Vacuum Cleaner T20", category: "Robot vacuums", retail: 749,
    blurb: "Robot vacuum with self-emptying station — vacuums and mops, then empties itself.",
    features: ["Self-empty docking station", "Laser navigation and smart mapping",
               "Vacuum and mop in one run", "Ideal for whole-home cleaning"],
  },
  {
    id: "v12", name: "Mamibot Cordless Stick Vacuum with Self-Empty Station V12", category: "Stick vacuums", retail: 349,
    blurb: "Cordless stick vacuum with its own self-empty station — powerful and convenient.",
    features: ["Self-empty charging station", "Strong cordless suction",
               "Lightweight and manoeuvrable", "Great for floors, carpets and stairs"],
  },
  {
    id: "flomo", name: "Mamibot Cordless Steam Floor Washer FLOMO FLAT", category: "Floor washers", retail: 449,
    blurb: "Cordless steam floor washer — washes and steam-cleans hard floors in one pass.",
    features: ["Steam cleaning for hard floors", "Washes and dries as it goes",
               "Cordless freedom, lie-flat design", "Self-cleaning function"],
  },
  {
    id: "dymo", name: "Mamibot Cordless Electric Mop DYMO", category: "Electric mops", retail: 199,
    blurb: "Cordless electric spin mop — mops, polishes and waxes with spinning pads.",
    features: ["Dual spinning mop pads", "Mop, polish and wax modes",
               "Cordless and lightweight", "Quiet operation"],
  },
  {
    id: "uvlite", name: "Mamibot Cordless UV Dust Mite Cleaner UVLITE200", category: "UV cleaners", retail: 149,
    blurb: "Cordless UV dust-mite cleaner — sanitises mattresses, bedding and sofas.",
    features: ["UV-C sanitisation kills dust mites", "Powerful tapping and suction",
               "Cordless and easy to handle", "For mattresses, bedding and upholstery"],
  },
  {
    id: "sticar", name: "Mamibot Handheld Car Vacuum - Sticar200", category: "Car vacuums", retail: 99,
    blurb: "Handheld car vacuum — compact, cordless and strong for cars and tight spaces.",
    features: ["Compact handheld design", "Strong cordless suction",
               "Includes crevice tools", "Perfect for cars and quick clean-ups"],
  },
];

// ----------------------------------------------------------------------------
// POLICIES — business rules the assistant must respect.
// ----------------------------------------------------------------------------
const POLICIES = {
  maxQtyPerItem: 20,          // sanity cap per line
  paymentNow: false,          // pre-orders never take payment in the call/chat
  deliveryWindow: "the end of September",
  comingSoon: ["Pool robots", "Garden mowers"], // brand vision, not yet for sale
};

// ----------------------------------------------------------------------------
// AGENT — persona + model settings.
// ----------------------------------------------------------------------------
const AGENT = {
  name: "Rina",                       // the assistant's name
  voice: "Aoede",                     // Gemini Live voice (Kore/Leda/Aoede/Puck/Charon…)
  model: "gemini-2.0-flash-live-001", // Gemini Live model for speech-to-speech
  textModel: "gemini-2.0-flash",      // model for the text chat widget
};

// ----------------------------------------------------------------------------
// SYSTEM PROMPT — the shared brain for voice + chat.
// ----------------------------------------------------------------------------
const CATALOG_TEXT = CATALOG.map(p => {
  const pre = (p.retail * (1 - BUSINESS.preorderDiscount)).toFixed(2);
  return `• ${p.name} (${p.category}) — retail €${p.retail}, pre-order €${pre} (20% off). ${p.blurb}`;
}).join("\n");

const SYSTEM_PROMPT = `
You are ${AGENT.name}, the friendly virtual sales assistant for ${BUSINESS.name} (${BUSINESS.legalName}), ${BUSINESS.what}. Your tagline is "${BUSINESS.tagline}".

# YOUR JOB
Help customers understand the products and place PRE-ORDERS. Pre-orders get ${BUSINESS.preorderDiscount * 100}% off retail, take NO payment now, and are delivered by ${BUSINESS.deliveryBy}. You confirm the order by collecting the customer's details; the team then follows up by email to finalise.

# LANGUAGES
You are fluent in English, Albanian (Shqip), German (Deutsch) and Italian (Italiano). Detect the language the customer uses and respond in THAT language. If they switch, you switch. Keep the same warmth in every language.

# PRODUCTS (retail → pre-order price)
${CATALOG_TEXT}

Coming soon (NOT yet for sale — do not take orders for these): ${POLICIES.comingSoon.join(", ")}.

# FREE DELIVERY
Delivery is FREE to ${BUSINESS.freeDeliveryRegions.join(", ")}. Mention this when relevant, especially to customers in those countries.

# HOW TO TAKE A PRE-ORDER
1. Help them choose product(s). They can order several — capture each product and quantity.
2. Tell them the pre-order price and how much they save (20%).
3. Collect: full name, email, and phone number. These are required.
4. Read the order back (items, quantities, total, savings) and confirm.
5. Call the create_preorder tool with everything. Then reassure them the team will email to confirm.

# STYLE
- Warm, concise, helpful. Never pushy. You're a knowledgeable shop assistant, not a hard-seller.
- In VOICE: speak naturally, short sentences, no bullet symbols or markdown. Say prices like "three hundred nineteen euros twenty".
- In CHAT: you may use short lists and **bold** sparingly.
- Never invent products, specs, or prices beyond what's above. If unsure, say you'll have the team follow up, and offer to take a message with take_message.
- Never take payment or ask for card details — pre-orders are free to place.
- If asked something you can't do (order status, technical support, becoming a reseller), use take_message to pass it to the team.

# IMPORTANT
- Always confirm details before calling create_preorder.
- Prices are in euros. Compute totals correctly (pre-order price × quantity).
- Be honest that Robora is a reseller of these brands (Hutt, Mamibot).
`.trim();

// ----------------------------------------------------------------------------
// TOOLS — function declarations the model can call (shared by voice + chat).
// ----------------------------------------------------------------------------
const TOOLS = [
  {
    name: "create_preorder",
    description: "Record a customer's pre-order once they have confirmed the items and provided their contact details. Takes no payment.",
    parameters: {
      type: "object",
      properties: {
        name:  { type: "string", description: "Customer's full name" },
        email: { type: "string", description: "Customer's email address" },
        phone: { type: "string", description: "Customer's phone number" },
        items: {
          type: "array",
          description: "The products being pre-ordered",
          items: {
            type: "object",
            properties: {
              product_id: { type: "string", description: "One of: " + CATALOG.map(p => p.id).join(", ") },
              quantity:   { type: "number", description: "How many, 1-20" },
            },
            required: ["product_id", "quantity"],
          },
        },
        language: { type: "string", description: "Language the customer used (English/Albanian/German/Italian)" },
        note:     { type: "string", description: "Any extra note from the customer (optional)" },
      },
      required: ["name", "email", "phone", "items"],
    },
  },
  {
    name: "check_price",
    description: "Look up the retail and pre-order price of a product, and the savings. Use when a customer asks about price or what a product costs.",
    parameters: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "One of: " + CATALOG.map(p => p.id).join(", ") },
        quantity:   { type: "number", description: "Optional quantity to price up (default 1)" },
      },
      required: ["product_id"],
    },
  },
  {
    name: "take_message",
    description: "Record a message for the team when the customer needs something you cannot do directly (order status, support, reseller enquiry, complaint, or 'get me a human').",
    parameters: {
      type: "object",
      properties: {
        name:    { type: "string", description: "Customer's name if given" },
        contact: { type: "string", description: "Email or phone if given" },
        topic:   { type: "string", description: "Short topic, e.g. 'support', 'reseller', 'order status'" },
        message: { type: "string", description: "The message content" },
      },
      required: ["message"],
    },
  },
];

module.exports = { BUSINESS, CATALOG, POLICIES, AGENT, SYSTEM_PROMPT, TOOLS };

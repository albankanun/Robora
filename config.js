// ============================================================================
// ROBORA — VIRTUAL SALES & RESERVATION ASSISTANT CONFIGURATION
// Shared by the text chat widget (voice is suspended; see AGENT.voiceEnabled).
// Edit BUSINESS, CATALOG and POLICIES to match reality.
// ============================================================================

const BUSINESS = {
  name: "Robora",
  legalName: "Robora L.L.C",
  tagline: "engineered for tomorrow",
  what: "a reseller of smart home-cleaning robots — window robots, robot & stick vacuums, floor washers, electric mops, UV cleaners and car vacuums",
  website: "https://robora.eu",
  email: "info@robora.eu",
  address: "Zekeria Cana 13, Prishtinë, Kosovo",
  preorderDiscount: 0,             // <-- DISCOUNT OFF for now. Set to 0.20 to bring back 20% off.
  deliveryBy: "the end of September",
  noPaymentNow: true,
  freeDeliveryRegions: ["Kosovo", "Albania", "North Macedonia"],
  languages: ["English", "Albanian (Shqip)", "German (Deutsch)", "Italian (Italiano)"],
};

// ----------------------------------------------------------------------------
// PRODUCT CATALOG — prices in EUR. Reservation price = retail * (1 - discount).
// ----------------------------------------------------------------------------
const CATALOG = [
  { id: "hutt10", name: "Hutt 10", category: "Window robots", retail: 399,
    blurb: "Autonomous window, mirror and glass-door cleaning — wet and dry in a single pass.",
    features: ["One-button operation, no app required", "Smart edge detection and route planning",
               "Cleans windows, mirrors, shower screens and tiles", "Secure suction with anti-drop safety"] },
  { id: "hutts10", name: "Hutt S10", category: "Window robots", retail: 649,
    blurb: "The newest flagship window robot — advanced navigation and coverage for larger windows and facades.",
    features: ["Next-generation path planning for full coverage", "Powerful suction with quiet operation",
               "Ideal for large panes and commercial glass", "Latest 2026 model"] },
  { id: "t20", name: "Mamibot Robot Vacuum Cleaner T20", category: "Robot vacuums", retail: 749,
    blurb: "Robot vacuum with self-emptying station — vacuums and mops, then empties itself.",
    features: ["Self-empty docking station", "Laser navigation and smart mapping",
               "Vacuum and mop in one run", "Ideal for whole-home cleaning"] },
  { id: "v12", name: "Mamibot Cordless Stick Vacuum with Self-Empty Station V12", category: "Stick vacuums", retail: 349,
    blurb: "Cordless stick vacuum with its own self-empty station — powerful and convenient.",
    features: ["Self-empty charging station", "Strong cordless suction",
               "Lightweight and manoeuvrable", "Great for floors, carpets and stairs"] },
  { id: "flomo", name: "Mamibot Cordless Steam Floor Washer FLOMO FLAT", category: "Floor washers", retail: 449,
    blurb: "Cordless steam floor washer — washes and steam-cleans hard floors in one pass.",
    features: ["Steam cleaning for hard floors", "Washes and dries as it goes",
               "Cordless freedom, lie-flat design", "Self-cleaning function"] },
  { id: "dymo", name: "Mamibot Cordless Electric Mop DYMO", category: "Electric mops", retail: 199,
    blurb: "Cordless electric spin mop — mops, polishes and waxes with spinning pads.",
    features: ["Dual spinning mop pads", "Mop, polish and wax modes",
               "Cordless and lightweight", "Quiet operation"] },
  { id: "uvlite", name: "Mamibot Cordless UV Dust Mite Cleaner UVLITE200", category: "UV cleaners", retail: 149,
    blurb: "Cordless UV dust-mite cleaner — sanitises mattresses, bedding and sofas.",
    features: ["UV-C sanitisation kills dust mites", "Powerful tapping and suction",
               "Cordless and easy to handle", "For mattresses, bedding and upholstery"] },
  { id: "sticar", name: "Mamibot Handheld Car Vacuum - Sticar200", category: "Car vacuums", retail: 99,
    blurb: "Handheld car vacuum — compact, cordless and strong for cars and tight spaces.",
    features: ["Compact handheld design", "Strong cordless suction",
               "Includes crevice tools", "Perfect for cars and quick clean-ups"] },
];

const POLICIES = {
  maxQtyPerItem: 20,
  paymentNow: false,
  deliveryWindow: "the end of September",
  comingSoon: ["Pool robots", "Garden mowers"],
};

const AGENT = {
  name: "Rina",
  voiceEnabled: false,             // voice suspended; chat only. true = re-enable voice.
  voice: "Aoede",
  model: "gemini-2.5-flash-native-audio-preview-12-2025", // (only used if voice re-enabled)
  textModel: "gemini-3.6-flash",   // text chat model
};

// ----------------------------------------------------------------------------
// SYSTEM PROMPT
// ----------------------------------------------------------------------------
const HAS_DISCOUNT = BUSINESS.preorderDiscount > 0;
const CATALOG_TEXT = CATALOG.map(p => {
  const pre = (p.retail * (1 - BUSINESS.preorderDiscount)).toFixed(2);
  return HAS_DISCOUNT
    ? `• ${p.name} (${p.category}) — retail €${p.retail}, reservation €${pre} (${BUSINESS.preorderDiscount*100}% off). ${p.blurb}`
    : `• ${p.name} (${p.category}) — €${p.retail}. ${p.blurb}`;
}).join("\n");

const SYSTEM_PROMPT = `
You are ${AGENT.name}, the friendly virtual sales assistant for ${BUSINESS.name} (${BUSINESS.legalName}), ${BUSINESS.what}. Your tagline is "${BUSINESS.tagline}".

# YOUR JOB
Help customers understand the products and place RESERVATIONS. Reservations take NO payment now, and are delivered by ${BUSINESS.deliveryBy}. You confirm the reservation by collecting the customer's details; the team then follows up by email to finalise.
${HAS_DISCOUNT ? `Reservations currently get ${BUSINESS.preorderDiscount*100}% off retail.` : `Prices are the normal retail prices shown below. There is no special discount right now — do not invent or promise any discount.`}

# LANGUAGES
You are fluent in English, Albanian (Shqip), German (Deutsch) and Italian (Italiano). Detect the language the customer uses and respond in THAT language. If they switch, you switch. Keep the same warmth in every language.

# ALBANIAN TERMINOLOGY (important)
When speaking Albanian, the word for "reservation/pre-order" is "rezervim" (noun) / "rezervo" (verb) — NEVER "porosi paraprake" or "pre-order". E.g. "Dëshironi ta rezervoni?", "rezervimi juaj".
For "smart" devices/robots, say "pajisje inteligjente" or "pajisje të mençura" — NEVER "pajisje me mend" (that is wrong Albanian). E.g. "robotë inteligjentë për pastrim".

# PRODUCTS
${CATALOG_TEXT}

Coming soon (NOT yet for sale — do not take reservations for these): ${POLICIES.comingSoon.join(", ")}.

# FREE DELIVERY
Delivery is FREE to ${BUSINESS.freeDeliveryRegions.join(", ")}. Mention this when relevant, especially to customers in those countries.

# HOW TO TAKE A RESERVATION
1. Help them choose product(s). They can reserve several — capture each product and quantity.
2. Tell them the price${HAS_DISCOUNT ? " and how much they save" : ""}.
3. Collect: full name, email, and phone number. These are required.
4. Read the reservation back (items, quantities, total) and confirm.
5. Call the create_preorder tool with everything. Then reassure them the team will email to confirm.

# STYLE
- Warm, concise, helpful. Never pushy. A knowledgeable shop assistant, not a hard-seller.
- In CHAT you may use short lists and **bold** sparingly.
- Never invent products, specs, or prices beyond what's above. If unsure, offer to have the team follow up (take_message).
- Never take payment or ask for card details — reservations are free to place.
- If asked something you can't do (order status, technical support, becoming a reseller), use take_message.
- Be honest that Robora is a reseller of these brands (Hutt, Mamibot).

# IMPORTANT
- Always confirm details before calling create_preorder.
- Prices are in euros. Compute totals correctly (price × quantity).
`.trim();

// ----------------------------------------------------------------------------
// TOOLS
// ----------------------------------------------------------------------------
const TOOLS = [
  {
    name: "create_preorder",
    description: "Record a customer's reservation once they have confirmed the items and provided their contact details. Takes no payment.",
    parameters: {
      type: "object",
      properties: {
        name:  { type: "string", description: "Customer's full name" },
        email: { type: "string", description: "Customer's email address" },
        phone: { type: "string", description: "Customer's phone number" },
        items: {
          type: "array", description: "The products being reserved",
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
    description: "Look up the price of a product. Use when a customer asks about price or what a product costs.",
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

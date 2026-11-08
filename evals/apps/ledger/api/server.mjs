#!/usr/bin/env node
// Ledger's data service: Clay & Paper's books, in memory.
//
//   node api/server.mjs [--port=8370] [--today=YYYY-MM-DD]
//
// Two years of history ending today (the machine's calendar date at start, or
// --today). The history is DETERMINISTIC for a given today: every calendar day's
// events come from a PRNG seeded by that date, so two starts on the same day
// serve identical bytes. Writes live for the life of the process.
//
// Money is integer cents everywhere. Dates are calendar-date strings and all
// date arithmetic is done on UTC day numbers, so nothing shifts with a zone.
//
// Reconciliation is by construction: every transaction decomposes into pieces
// (a sale's or refund's lines, an expense's parts or its single category), and
// every read — list, summary, every aggregate — sums the pieces that survive
// the same filter. Opening an aggregate's records with the matching filter
// therefore sums exactly the pieces that made the aggregate.

import { createServer } from "node:http";

const flag = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const pad = (n, w = 2) => String(n).padStart(w, "0");

// ── dates as UTC day numbers ─────────────────────────────────────────────────
const DAY_MS = 86400000;
const dnum = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY_MS;
const dstr = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && dstr(dnum(s)) === s;
const weekday = (n) => new Date(n * DAY_MS).getUTCDay(); // 0 = Sunday
const monthOf = (s) => s.slice(0, 7);
const addMonths = (ym, k) => {
  const i = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + k;
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
};
const monthEnd = (ym) => dstr(dnum(`${addMonths(ym, 1)}-01`) - 1);

const PORT = Number(flag("port", 8370));
const TODAY = (() => {
  const given = flag("today", null);
  if (given) {
    if (!isDate(given)) { console.error(`--today must be YYYY-MM-DD`); process.exit(2); }
    return given;
  }
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();

// ── seeded randomness ────────────────────────────────────────────────────────
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
function rngFor(key) {
  let a = hash(`ledger:${key}`);
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r(); r();
  return r;
}
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const pickW = (r, items, weights) => {
  let total = 0; for (const w of weights) total += w;
  let x = r() * total;
  for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x < 0) return items[i]; }
  return items[items.length - 1];
};
// log-uniform cents between two dollar amounts: most values near the bottom
const skewed = (r, loDollars, hiDollars) =>
  Math.round(loDollars * 100 * Math.pow(hiDollars / loDollars, r()));
function poisson(r, lambda) {
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
}

// ── the business ─────────────────────────────────────────────────────────────
const CATEGORIES = [
  ["product-sales", "Product sales", "income"],
  ["custom-orders", "Custom orders", "income"],
  ["other-income", "Other income", "income"],
  ["stock", "Stock & materials", "expense"],
  ["packaging", "Packaging", "expense"],
  ["shipping", "Shipping & postage", "expense"],
  ["rent", "Rent & stall fees", "expense"],
  ["software", "Software", "expense"],
  ["advertising", "Advertising", "expense"],
  ["contractors", "Contractors", "expense"],
  ["other", "Other", "expense"],
  ["travel", "Travel", "expense", true],
].map(([id, name, kind, archived], i) => ({ id, name, kind, colour: i, archived: !!archived }));
const CAT = new Map(CATEGORIES.map((c) => [c.id, c]));

const CHANNELS = [
  { id: "online", name: "Online shop" },
  { id: "market", name: "Market" },
  { id: "wholesale", name: "Wholesale" },
];
const CHANNEL = new Map(CHANNELS.map((c) => [c.id, c]));

const PRODUCTS = [
  ["speckled-mug", "Speckled mug", 3200, 950, 18],
  ["tall-mug", "Tall mug", 3600, 1100, 12],
  ["espresso-cup", "Espresso cup", 2200, 600, 8],
  ["serving-bowl", "Serving bowl", 5800, 1800, 4],
  ["print-a4", "Art print A4", 2400, 450, 14],
  ["print-a3", "Art print A3", 3800, 700, 8],
  ["riso-print", "Risograph print", 1800, 300, 10],
  ["greeting-card", "Greeting card", 500, 90, 10],
  ["tote-bag", "Canvas tote bag", 2800, 800, 9],
  ["zip-pouch", "Zip pouch", 1800, 500, 7],
].map(([id, name, price, unitCost, weight]) => ({ id, name, price, unitCost, archived: false, weight }));
const PRODUCT = new Map(PRODUCTS.map((p) => [p.id, p]));
const PRODUCT_IDS = PRODUCTS.map((p) => p.id);
const PRODUCT_WEIGHTS = PRODUCTS.map((p) => p.weight);

// contacts: vendors (with a usual category), wholesale shops, online customers
const CONTACTS = [];
const CONTACT = new Map();
let contactSeq = 0;
function addContact(name, type, usualCategoryId = null) {
  const c = { id: `c${pad(++contactSeq, 3)}`, name, type, usualCategoryId: type === "vendor" ? usualCategoryId : null };
  CONTACTS.push(c); CONTACT.set(c.id, c);
  return c;
}
const V = {};
for (const [key, name, cat] of [
  ["clay", "Clayworks Supply", "stock"], ["glaze", "Glaze Lab", "stock"], ["paper", "Paper Mill Co.", "stock"],
  ["blanks", "Tote Blanks Co.", "stock"], ["riso", "Riso Studio", "stock"],
  ["ecowrap", "EcoWrap", "packaging"], ["boxco", "BoxCo", "packaging"],
  ["pirate", "Pirate Ship", "shipping"], ["usps", "USPS", "shipping"],
  ["studio", "Brickyard Studios", "rent"], ["riverside", "Riverside Market", "rent"],
  ["sunday", "Sunday Makers Market", "rent"], ["fair", "Holiday Craft Fair", "rent"],
  ["adobe", "Adobe", "software"], ["shopify", "Shopify", "software"], ["canva", "Canva", "software"],
  ["google", "Google Workspace", "software"],
  ["meta", "Meta Ads", "advertising"], ["pinterest", "Pinterest Ads", "advertising"],
  ["photo", "Jo Park Photography", "contractors"], ["books", "Sam Lee Bookkeeping", "contractors"],
  ["hardware", "Ace Hardware", "other"], ["office", "Office Depot", "other"],
  ["costco", "Costco", "other"], ["target", "Target", "other"],
  ["amtrak", "Amtrak", "travel"], ["hotel", "Lakeside Hotel", "travel"],
]) V[key] = addContact(name, "vendor", cat);
const SHOPS = ["Fern & Finch", "The Paper Nook", "Harbor General Store", "Little Wren Gifts", "Oak & Ember",
  "North Loop Goods", "Saltbox Shop"].map((n) => addContact(n, "customer"));
const ONLINE = [];
{
  const first = ["Maya", "Leo", "Priya", "Sam", "Hannah", "Omar", "Grace", "Theo", "Ava", "Jonah", "Nina", "Marcus",
    "Iris", "Ben", "Chloe", "Daniel", "Elena", "Felix", "Hazel", "Isaac", "June", "Kofi", "Lucy", "Mateo", "Nora",
    "Oscar", "Ruby", "Simone", "Tara", "Wes"];
  const last = ["Alvarez", "Brooks", "Chen", "Dubois", "Evans", "Fischer", "Garcia", "Hughes", "Ito", "Jensen",
    "Kim", "Lopez", "Morgan", "Nakamura", "Okafor", "Patel", "Quinn", "Reyes", "Santos", "Turner", "Usman",
    "Vance", "Walsh", "Xu", "Young", "Zimmer", "Bennett", "Carter", "Diaz", "Ellis"];
  const r = rngFor("customers");
  const seen = new Set();
  while (ONLINE.length < 96) {
    const name = `${first[int(r, 0, first.length - 1)]} ${last[int(r, 0, last.length - 1)]}`;
    if (seen.has(name)) continue;
    seen.add(name); ONLINE.push(addContact(name, "customer"));
  }
}

// ── the history ──────────────────────────────────────────────────────────────
const START = `${addMonths(monthOf(TODAY), -24)}-01`;
const SEASON = [0.7, 0.7, 0.85, 0.9, 1.0, 0.95, 0.9, 0.95, 1.0, 1.1, 1.45, 2.1];
const MARKET_SEASON = [0.7, 0.7, 0.85, 0.9, 1, 1, 1, 1, 1, 1.1, 1.3, 1.6];
const UNCATEGORISED = ["SQ *RIVERSIDE MKT", "AMZN MKTP US*2K4", "PAYPAL *ETSYINC", "POS PURCHASE 4412",
  "CHECK 1047", "VENMO PAYMENT", "TST* COFFEE BAR", "UBER *TRIP", "WALGREENS #0412", "CARD PURCHASE 7731"];
const CUSTOM = ["Custom dinnerware set", "Wedding mug set", "Commissioned print series", "Personalised tote bags"];

const RAW = []; // generated in date order; ids assigned after sorting
let orderNo = 1000, wholesaleNo = 0;

const line = (productId, quantity, unitPrice = PRODUCT.get(productId).price) => ({
  productId, description: PRODUCT.get(productId).name, quantity, unitPrice,
  amount: quantity * unitPrice, unitCost: PRODUCT.get(productId).unitCost,
});
const freeLine = (description, quantity, unitPrice, unitCost = 0) => ({
  productId: null, description, quantity, unitPrice, amount: quantity * unitPrice, unitCost,
});
function distinctProducts(r, n, pool = PRODUCT_IDS) {
  const weights = pool.map((id) => PRODUCT.get(id).weight);
  const out = [];
  while (out.length < n) { const p = pickW(r, pool, weights); if (!out.includes(p)) out.push(p); }
  return out;
}
const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
function sale(date, channel, contactId, description, lines, categoryId = "product-sales") {
  const s = { kind: "sale", date, description, contactId, channel, categoryId, parts: null, lines,
    amount: sum(lines, (l) => l.amount), refundOf: null };
  RAW.push(s);
  return s;
}
function expense(date, vendor, description, amount, categoryId = vendor ? vendor.usualCategoryId : null) {
  RAW.push({ kind: "expense", date, description, contactId: vendor ? vendor.id : null, channel: null,
    categoryId, parts: null, lines: [], amount, refundOf: null });
}
function splitExpense(r, date, vendor, description, total, cats) {
  const n = cats.length, parts = [];
  let left = total;
  for (let i = 0; i < n; i++) {
    const amt = i === n - 1 ? left : Math.max(100, Math.round(left * (0.3 + r() * 0.4)));
    parts.push({ categoryId: cats[i], amount: amt }); left -= amt;
  }
  RAW.push({ kind: "expense", date, description, contactId: vendor.id, channel: null, categoryId: null,
    parts, lines: [], amount: total, refundOf: null });
}
// a refund of some of a sale's lines; `take` is [lineIndex, quantity, amount]
function refundOf(s, date, description, take) {
  if (date > TODAY) return;
  const lines = take.map(([i, quantity, amount]) => {
    const l = s.lines[i];
    return { saleLine: l, productId: l.productId, description: l.description, quantity,
      unitPrice: l.unitPrice, amount, unitCost: l.unitCost };
  });
  RAW.push({ kind: "refund", date, description, contactId: s.contactId, channel: s.channel,
    categoryId: s.categoryId, parts: null, lines, amount: sum(lines, (l) => l.amount), sale: s });
}

function maybeRefund(r, s, n, label) {
  if (r() >= 0.03) return;
  const date = dstr(n + int(r, 3, 21));
  const i = int(r, 0, s.lines.length - 1), l = s.lines[i];
  const how = r();
  if (how < 0.35 && s.lines.length > 1) {
    refundOf(s, date, `Refund — ${label}`, s.lines.map((x, j) => [j, x.quantity, x.amount]));
  } else if (how < 0.75 || l.quantity === 1 && how < 0.8) {
    refundOf(s, date, `Refund — ${label}`, [[i, l.quantity, l.amount]]);
  } else if (l.quantity > 1) {
    refundOf(s, date, `Refund — ${label}`, [[i, 1, l.unitPrice]]);
  } else {
    refundOf(s, date, `Partial refund — ${label}`, [[i, 0, Math.round(l.amount / 2)]]);
  }
}

function marketDay(r, date, n, venue, base, season, growth) {
  const k = Math.max(3, Math.round((base + r() * base) * season * growth));
  for (let i = 0; i < k; i++) {
    const nLines = pickW(r, [1, 2], [75, 25]);
    const lines = distinctProducts(r, nLines).map((p) =>
      line(p, p === "greeting-card" ? int(r, 1, 4) : pickW(r, [1, 2, 3], [80, 15, 5])));
    const who = r() < 0.05 ? ONLINE[Math.floor(ONLINE.length * r())].id : null;
    sale(date, "market", who, venue.name, lines);
  }
  if (r() < 0.012) {
    RAW.push({ kind: "refund", date, description: "Market return", contactId: null, channel: "market",
      categoryId: "product-sales", parts: null, lines: [freeLine("Returned item", 1, pickW(r, [2400, 3200, 3600], [1, 2, 1]))],
      amount: 0, refundOf: null });
    RAW[RAW.length - 1].amount = RAW[RAW.length - 1].lines[0].amount;
  }
}

{
  const s0 = dnum(START), t0 = dnum(TODAY);
  const priceRise = dnum(`${addMonths(monthOf(TODAY), -14)}-01`);
  const rentRise = dnum(`${addMonths(monthOf(TODAY), -12)}-01`);
  const travelEnds = s0 + 270;
  const thisMonthFirst = `${monthOf(TODAY)}-01`;
  for (let n = s0; n <= t0; n++) {
    const date = dstr(n), r = rngFor(`day:${date}`);
    const m = +date.slice(5, 7), dom = +date.slice(8, 10), wd = weekday(n);
    const growth = 1 + 0.18 * ((n - s0) / 730);
    const season = SEASON[m - 1];

    // online orders
    for (let k = poisson(r, 2.1 * season * growth); k > 0; k--) {
      const nLines = pickW(r, [1, 2, 3], [60, 30, 10]);
      const lines = distinctProducts(r, nLines).map((p) =>
        line(p, p === "greeting-card" ? int(r, 1, 5) : pickW(r, [1, 2, 3], [85, 12, 3])));
      const who = ONLINE[Math.floor(ONLINE.length * Math.pow(r(), 1.8))];
      const label = `Order #${++orderNo}`;
      maybeRefund(r, sale(date, "online", who.id, label, lines), n, label);
    }
    // custom orders and workshops
    if (r() < 1 / 45) {
      const what = CUSTOM[int(r, 0, CUSTOM.length - 1)];
      const price = Math.round(skewed(r, 180, 480) / 500) * 500;
      sale(date, "online", ONLINE[int(r, 0, ONLINE.length - 1)].id, `Custom order — ${what}`,
        [freeLine(what, 1, price, Math.round(price * 0.35))], "custom-orders");
    }
    if (dom === 14 && m % 2 === 0) {
      sale(date, "online", null, "Pottery taster workshop",
        [freeLine("Workshop seat", int(r, 4, 8), 6500, 1200)], "other-income");
    }
    // wholesale
    if ((dom === 6 || dom === 21) && r() < 0.55) {
      const shop = SHOPS[int(r, 0, SHOPS.length - 1)];
      const pool = PRODUCT_IDS.filter((p) => p !== "serving-bowl" && p !== "print-a3");
      const lines = distinctProducts(r, int(r, 2, 4), pool).map((p) => {
        const q = p === "greeting-card" ? pickW(r, [24, 48], [2, 1]) : pickW(r, [6, 12, 18, 24], [3, 4, 2, 1]);
        return line(p, q, Math.round(PRODUCT.get(p).price * 0.5 / 50) * 50);
      });
      const label = `Wholesale order W-${pad(++wholesaleNo, 4)}`;
      const s = sale(date, "wholesale", shop.id, label, lines);
      if (r() < 0.12) {
        const i = int(r, 0, lines.length - 1), q = int(r, 1, 2);
        refundOf(s, dstr(n + int(r, 7, 14)), `Breakage credit — W-${pad(wholesaleNo, 4)}`, [[i, q, q * lines[i].unitPrice]]);
      }
    }
    // markets: Riverside on Saturdays, Sunday Makers on the first Sunday, a December fair
    const fair = m === 12 && dom <= 14 && (wd === 6 || wd === 0);
    if (fair) {
      marketDay(r, date, n, V.fair, 9, 1.6, growth);
      if (wd === 6) expense(date, V.fair, "Holiday Craft Fair — stall", 27500);
    } else if (wd === 6 && r() < (m <= 2 ? 0.5 : 0.88)) {
      marketDay(r, date, n, V.riverside, 7, MARKET_SEASON[m - 1], growth);
      expense(date, V.riverside, "Stall fee — Riverside Market", 5500);
    } else if (wd === 0 && dom <= 7 && r() < 0.85) {
      marketDay(r, date, n, V.sunday, 5, MARKET_SEASON[m - 1], growth);
      expense(date, V.sunday, "Stall fee — Sunday Makers Market", 4000);
    }

    // fixed monthly costs
    const monthName = new Date(n * DAY_MS).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    if (dom === 1) {
      expense(date, V.studio, `Studio rent — ${monthName}`, n >= rentRise ? 225000 : 215000);
      expense(date, V.google, "Google Workspace", 1440);
    }
    if (dom === 3) expense(date, V.shopify, "Shopify Basic plan", 3900);
    if (dom === 12) expense(date, V.adobe, "Adobe Creative Cloud", n >= priceRise ? 5999 : 5499);
    if (dom === 20) expense(date, V.canva, "Canva Pro", 1499);
    if (dom === 25 && r() < 0.4) expense(date, V.adobe, "Adobe Stock images", 2999);
    if (m === 2 && dom === 9) expense(date, V.adobe, "Adobe Acrobat Pro (annual)", 23988);
    if (dom === 8 && r() < 0.8) expense(date, V.glaze, "Glazes and oxides", skewed(r, 60, 240));
    if (dom === 10) expense(date, V.ecowrap, "Tissue, mailers and tape", Math.round(skewed(r, 45, 180) * Math.min(season, 1.5)));
    if (dom === 15) expense(date, V.meta, "Instagram ads", Math.round(skewed(r, 40, 160) * (m >= 11 ? 1.6 : 1)));
    if (dom === 18 && m % 3 === 0) expense(date, V.photo, "Product photography", skewed(r, 350, 600));
    if (m === 3 && dom === 22) expense(date, V.books, "Year-end bookkeeping", 85000);
    if (date === thisMonthFirst) expense(date, V.meta, "Holiday campaign — boosted posts", 18500);

    // irregular costs
    if (r() < Math.min(0.9, 0.33 * season * growth)) expense(date, V.pirate, "Postage labels", skewed(r, 18, 140));
    if (r() < 0.06) expense(date, V.usps, "Postage at the counter", skewed(r, 6, 32));
    if (r() < 1 / 21) expense(date, V.clay, "Stoneware clay", skewed(r, 180, 780));
    if (r() < 1 / 40) expense(date, V.paper, "Print paper", skewed(r, 90, 320));
    if (r() < 1 / 55) expense(date, V.blanks, "Tote and pouch blanks", skewed(r, 150, 420));
    if (r() < 1 / 35) expense(date, V.riso, "Risograph print run", skewed(r, 70, 260));
    if (r() < 1 / 50) expense(date, V.boxco, "Shipping boxes", skewed(r, 60, 220));
    if (r() < 1 / 45) expense(date, V.pinterest, "Pinterest promoted pins", skewed(r, 20, 90));
    if (r() < 1 / 14) expense(date, V.hardware, "Studio supplies", skewed(r, 8, 65));
    if (r() < 1 / 30) expense(date, V.office, "Office supplies", skewed(r, 12, 90));
    if (r() < 1 / 28) {
      const cats = r() < 0.5 ? ["stock", "packaging", "other"] : ["stock", "other"];
      splitExpense(r, date, V.costco, "Costco run", skewed(r, 60, 320), cats);
    }
    if (r() < 1 / 90) splitExpense(r, date, V.target, "Target", skewed(r, 30, 160), ["packaging", "other"]);
    if (n < travelEnds && r() < 1 / 30) expense(date, V.amtrak, "Train to supplier", skewed(r, 45, 140));
    if (n === s0 + 60 || n === s0 + 200) expense(date, V.hotel, "Trade fair hotel", skewed(r, 260, 340));
    // bank lines nobody has categorised yet, more of them recently
    if (r() < (n > t0 - 45 ? 0.27 : 0.035)) {
      expense(date, null, UNCATEGORISED[int(r, 0, UNCATEGORISED.length - 1)], skewed(r, 6, 120), null);
    }
  }
}

// ── the store ────────────────────────────────────────────────────────────────
const TX = [];            // every transaction, in no particular order
const BY_ID = new Map();
const REV = new Map();    // id → revision, bumped on every write (for undo)
const IDX = new WeakMap(); // transaction → { hay, amounts, pieces }
let VERSION = 0;
let txSeq = 0;
const SIGN = { sale: 1, refund: -1, expense: -1 };
const KINDS = ["sale", "refund", "expense"];
const newTxId = () => `t${pad(++txSeq, 5)}`;

{
  const order = RAW.map((t, i) => [t, i]).sort((a, b) => (a[0].date < b[0].date ? -1 : a[0].date > b[0].date ? 1 : a[1] - b[1]));
  for (const [t] of order) {
    t.id = newTxId();
    t.lines.forEach((l, j) => { l.id = `${t.id}.${j + 1}`; });
  }
  for (const [t] of order) {
    const rec = { id: t.id, kind: t.kind, date: t.date, description: t.description, contactId: t.contactId,
      channel: t.channel, categoryId: t.categoryId, parts: t.parts, amount: t.amount,
      refundOf: t.kind === "refund" ? (t.sale ? t.sale.id : null) : null,
      lines: t.lines.map((l) => {
        const out = { id: l.id };
        if (t.kind === "refund") out.saleLineId = l.saleLine ? l.saleLine.id : null;
        return Object.assign(out, { productId: l.productId, description: l.description, quantity: l.quantity,
          unitPrice: l.unitPrice, amount: l.amount, unitCost: l.unitCost });
      }) };
    store(rec);
  }
}

function norm(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function indexOf(t) {
  const c = t.contactId ? CONTACT.get(t.contactId) : null;
  const words = [t.description, c ? c.name : ""];
  const amounts = [t.amount];
  for (const l of t.lines) {
    words.push(l.description);
    if (l.productId) words.push(PRODUCT.get(l.productId)?.name ?? "");
    amounts.push(l.amount);
  }
  if (t.parts) for (const p of t.parts) amounts.push(p.amount);
  const s = SIGN[t.kind];
  const pieces = t.kind === "expense"
    ? (t.parts ? t.parts.map((p) => ({ cat: p.categoryId, product: undefined, amount: -p.amount, units: 0, cost: 0 }))
      : [{ cat: t.categoryId, product: undefined, amount: -t.amount, units: 0, cost: 0 }])
    : t.lines.map((l) => ({ cat: t.categoryId, product: l.productId ?? null, amount: s * l.amount,
      units: s * l.quantity, cost: s * l.quantity * l.unitCost }));
  return { hay: norm(words.join(" \u0001 ")), amounts, pieces };
}
function store(t) {
  const old = BY_ID.get(t.id);
  if (old) TX[TX.indexOf(old)] = t; else TX.push(t);
  BY_ID.set(t.id, t);
  IDX.set(t, indexOf(t));
  REV.set(t.id, (REV.get(t.id) ?? 0) + 1);
  VERSION++;
}
function unstore(id) {
  const old = BY_ID.get(id);
  if (!old) return;
  TX.splice(TX.indexOf(old), 1);
  BY_ID.delete(id);
  REV.set(id, (REV.get(id) ?? 0) + 1);
  VERSION++;
}
const clone = (t) => structuredClone(t);

// refunds by sale and by sale line, recomputed when anything changes
let DER = null, DER_V = -1;
function refunds() {
  if (DER_V === VERSION) return DER;
  const bySale = new Map(), byLine = new Map();
  for (const t of TX) {
    if (t.kind !== "refund" || !t.refundOf) continue;
    if (!bySale.has(t.refundOf)) bySale.set(t.refundOf, []);
    bySale.get(t.refundOf).push(t);
    for (const l of t.lines) {
      if (!l.saleLineId) continue;
      const acc = byLine.get(l.saleLineId) ?? { amount: 0, quantity: 0 };
      acc.amount += l.amount; acc.quantity += l.quantity;
      byLine.set(l.saleLineId, acc);
    }
  }
  DER = { bySale, byLine }; DER_V = VERSION;
  return DER;
}
const refundedTotal = (saleId) => sum(refunds().bySale.get(saleId) ?? [], (r) => r.amount);

// ── budgets: an amount per expense category, effective from a month onward ──
const BUDGETS = new Map(); // categoryId → [{ from: "YYYY-MM", amount | null }] sorted
function setBudget(categoryId, month, amount) {
  const list = (BUDGETS.get(categoryId) ?? []).filter((b) => b.from !== month);
  list.push({ from: month, amount });
  list.sort((a, b) => (a.from < b.from ? -1 : 1));
  BUDGETS.set(categoryId, list);
}
function budgetFor(categoryId, month) {
  let amount = null;
  for (const b of BUDGETS.get(categoryId) ?? []) if (b.from <= month) amount = b.amount;
  return amount;
}
{
  const from = addMonths(monthOf(TODAY), -5);
  setBudget("stock", from, 90000);
  setBudget("packaging", from, 15000);
  setBudget("shipping", from, 35000);
  setBudget("advertising", from, 15000);
}

// ── the filter model ─────────────────────────────────────────────────────────
const FILTER_KEYS = ["from", "to", "q", "min", "max", "kind", "category", "contact", "product", "ids", "except"];
// src: a URLSearchParams, a query string, or an object of the same keys
function filterSource(src) {
  if (typeof src === "string") src = new URLSearchParams(src.replace(/^\?/, ""));
  if (src instanceof URLSearchParams) {
    return {
      list: (k) => src.getAll(k).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean),
      text: (k) => src.getAll(k).join(" ").trim(),
      has: (k) => src.has(k),
    };
  }
  const o = src && typeof src === "object" ? src : {};
  const vals = (k) => (o[k] === undefined || o[k] === null ? [] : Array.isArray(o[k]) ? o[k] : [o[k]]);
  return {
    list: (k) => vals(k).flatMap((v) => String(v).split(",")).map((v) => v.trim()).filter(Boolean),
    text: (k) => vals(k).map(String).join(" ").trim(),
    has: (k) => o[k] !== undefined && o[k] !== null,
  };
}
const AMOUNT_WORD = /^\$?((?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.(\d{1,2}))?$/;
function parseFilter(src) {
  const s = filterSource(src);
  const P = [];
  const f = { words: [] };
  const last = (k) => { const v = s.list(k); return v.length ? v[v.length - 1] : null; };
  for (const k of ["from", "to"]) {
    const v = last(k);
    if (v === null) continue;
    if (!isDate(v)) P.push({ field: k, message: `${k} must be a calendar date, YYYY-MM-DD` }); else f[k] = v;
  }
  if (f.from && f.to && f.from > f.to) P.push({ field: "from", message: "from must be on or before to" });
  for (const w of s.text("q").split(/\s+/).filter(Boolean)) {
    const word = { text: norm(w), lo: null, hi: null };
    const m = w.match(AMOUNT_WORD);
    if (m) {
      const whole = Number(m[1].replace(/,/g, ""));
      if (m[2] !== undefined) { word.lo = word.hi = whole * 100 + Number(m[2].padEnd(2, "0")); }
      else { word.lo = whole * 100; word.hi = whole * 100 + 99; }
    }
    f.words.push(word);
  }
  for (const k of ["min", "max"]) {
    const v = last(k);
    if (v === null) continue;
    if (!/^\d+$/.test(v)) P.push({ field: k, message: `${k} must be a whole number of cents` }); else f[k] = Number(v);
  }
  if (f.min != null && f.max != null && f.min > f.max) P.push({ field: "min", message: "min must not exceed max" });
  const set = (k, valid, what) => {
    const v = s.list(k);
    if (!v.length) return null;
    for (const x of v) if (!valid(x)) P.push({ field: k, message: `Unknown ${what}: ${x}` });
    return new Set(v);
  };
  f.kinds = set("kind", (x) => KINDS.includes(x), "kind");
  f.cats = set("category", (x) => x === "none" || CAT.has(x), "category");
  f.contacts = set("contact", (x) => x === "none" || CONTACT.has(x), "contact");
  f.products = set("product", (x) => x === "none" || PRODUCT.has(x), "product");
  f.ids = set("ids", () => true, "id");
  f.except = set("except", () => true, "id");
  return { f, problems: P };
}
function canonical(f) {
  const o = {};
  for (const [k, v] of Object.entries(f)) o[k] = v instanceof Set ? [...v].sort() : v;
  return JSON.stringify(o);
}
const matchWord = (ix, w) => ix.hay.includes(w.text) || (w.lo !== null && ix.amounts.some((a) => a >= w.lo && a <= w.hi));

// The one evaluation every read goes through: the transactions that match, each
// with the pieces of it that the filter selects, and their signed sum.
function evaluate(f, skip = {}) {
  const out = [];
  for (const t of TX) {
    if (f.ids && !f.ids.has(t.id)) continue;
    if (f.except && f.except.has(t.id)) continue;
    if (f.from && t.date < f.from) continue;
    if (f.to && t.date > f.to) continue;
    if (f.kinds && !f.kinds.has(t.kind)) continue;
    if (f.contacts && !f.contacts.has(t.contactId ?? "none")) continue;
    if (!skip.amount && f.min != null && t.amount < f.min) continue;
    if (!skip.amount && f.max != null && t.amount > f.max) continue;
    const ix = IDX.get(t);
    if (f.words.length && !f.words.every((w) => matchWord(ix, w))) continue;
    let pieces = ix.pieces;
    if (f.products) pieces = pieces.filter((p) => p.product !== undefined && f.products.has(p.product ?? "none"));
    if (!skip.category && f.cats) pieces = pieces.filter((p) => f.cats.has(p.cat ?? "none"));
    if (!pieces.length) continue;
    let value = 0;
    for (const p of pieces) value += p.amount;
    out.push({ t, pieces, value });
  }
  return out;
}
function summarise(results) {
  let inn = 0, out = 0;
  for (const { value } of results) if (value > 0) inn += value; else out -= value;
  return { count: results.length, in: inn, out, net: inn - out };
}

// ── rows and detail ──────────────────────────────────────────────────────────
function row(t, value) {
  const c = t.contactId ? CONTACT.get(t.contactId) : null;
  const signed = SIGN[t.kind] * t.amount;
  return {
    id: t.id, kind: t.kind, date: t.date, description: t.description,
    contactId: t.contactId, contactName: c ? c.name : null,
    categoryId: t.categoryId,
    split: t.parts ? { parts: t.parts.length, categoryIds: t.parts.map((p) => p.categoryId) } : null,
    channel: t.channel, amount: t.amount, signed, inFilter: value ?? signed,
    lineCount: t.lines.length, refundOf: t.refundOf,
    refunded: t.kind === "sale" ? refundedTotal(t.id) : null,
  };
}
function detail(t) {
  const d = { ...row(t, null) };
  delete d.inFilter;
  d.parts = t.parts ? t.parts.map((p) => ({ ...p })) : null;
  if (t.kind === "sale") {
    const { bySale, byLine } = refunds();
    d.lines = t.lines.map((l) => {
      const r = byLine.get(l.id) ?? { amount: 0, quantity: 0 };
      return { ...l, refunded: r.amount, refundedQuantity: r.quantity,
        refundable: l.amount - r.amount, refundableQuantity: l.quantity - r.quantity };
    });
    d.refunds = (bySale.get(t.id) ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1))
      .map((r) => ({ id: r.id, date: r.date, amount: r.amount, description: r.description }));
    d.refundable = t.amount - d.refunded;
    d.cost = sum(t.lines, (l) => l.quantity * l.unitCost);
    d.margin = t.amount - d.cost;
  } else {
    d.lines = t.lines.map((l) => ({ ...l }));
  }
  if (t.kind === "refund") {
    const s = t.refundOf ? BY_ID.get(t.refundOf) : null;
    d.sale = s ? { id: s.id, date: s.date, description: s.description, amount: s.amount, channel: s.channel } : null;
  }
  return d;
}

// ── sorted, cached list results ──────────────────────────────────────────────
const SORTS = {
  date: (t) => t.date,
  amount: (t) => SIGN[t.kind] * t.amount,
  description: (t) => norm(t.description),
  contact: (t) => (t.contactId ? norm(CONTACT.get(t.contactId).name) : ""),
  category: (t) => (t.parts ? "split" : t.categoryId ? norm(CAT.get(t.categoryId).name) : ""),
  channel: (t) => (t.channel ? norm(CHANNEL.get(t.channel).name) : ""),
  kind: (t) => t.kind,
};
const LIST_CACHE = new Map();
let LIST_CACHE_V = -1;
function sortedResults(f, sort, dir) {
  if (LIST_CACHE_V !== VERSION) { LIST_CACHE.clear(); LIST_CACHE_V = VERSION; }
  const key = `${sort}:${dir}:${canonical(f)}`;
  let hit = LIST_CACHE.get(key);
  if (hit) { LIST_CACHE.delete(key); LIST_CACHE.set(key, hit); return hit; }
  const res = evaluate(f);
  const keyOf = SORTS[sort], m = dir === "asc" ? 1 : -1;
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const keyed = res.map((r) => ({ r, k: keyOf(r.t) }));
  keyed.sort((a, b) =>
    m * cmp(a.k, b.k) ||
    (sort === "date" ? m * cmp(a.r.t.id, b.r.t.id) : -cmp(a.r.t.date, b.r.t.date) || -cmp(a.r.t.id, b.r.t.id)));
  hit = { results: keyed.map((x) => x.r), summary: summarise(res) };
  LIST_CACHE.set(key, hit);
  if (LIST_CACHE.size > 40) LIST_CACHE.delete(LIST_CACHE.keys().next().value);
  return hit;
}

// ── aggregates ───────────────────────────────────────────────────────────────
const percent = (part, whole) => (whole === 0 ? null : Math.round((part * 1000) / whole) / 10);
function periodStart(n, by) {
  const s = dstr(n);
  if (by === "day") return n;
  if (by === "week") return n - ((weekday(n) + 6) % 7);
  if (by === "month") return dnum(`${s.slice(0, 7)}-01`);
  const q = Math.floor((+s.slice(5, 7) - 1) / 3);
  return dnum(`${s.slice(0, 4)}-${pad(q * 3 + 1)}-01`);
}
function periodNext(n, by) {
  if (by === "day") return n + 1;
  if (by === "week") return n + 7;
  const s = dstr(n).slice(0, 7);
  return dnum(`${addMonths(s, by === "month" ? 1 : 3)}-01`);
}
function periodKey(n, by) {
  const s = dstr(n);
  if (by === "month") return s.slice(0, 7);
  if (by === "quarter") return `${s.slice(0, 4)}-Q${Math.floor((+s.slice(5, 7) - 1) / 3) + 1}`;
  return s;
}
function emptyMeasures() {
  return { revenue: { amount: 0, count: 0 }, sales: { amount: 0, count: 0 }, refunds: { amount: 0, count: 0 },
    expenses: { amount: 0, count: 0 }, net: { amount: 0, count: 0 }, cogs: 0,
    grossMargin: { amount: 0, percent: null, count: 0 } };
}
function addTo(m, { t, pieces, value }) {
  m.net.amount += value; m.net.count++;
  if (t.kind === "expense") { m.expenses.amount -= value; m.expenses.count++; return; }
  m.revenue.amount += value; m.revenue.count++;
  for (const p of pieces) m.cogs += p.cost;
  if (t.kind === "sale") { m.sales.amount += value; m.sales.count++; }
  else { m.refunds.amount -= value; m.refunds.count++; }
}
function finish(m) {
  m.grossMargin = { amount: m.revenue.amount - m.cogs, percent: percent(m.revenue.amount - m.cogs, m.revenue.amount),
    count: m.revenue.count };
  return m;
}
function periods(f, by) {
  const res = evaluate(f);
  let lo = f.from, hi = f.to;
  if (!lo || !hi) {
    let min = TODAY, max = TODAY;
    for (const t of TX) { if (t.date < min) min = t.date; if (t.date > max) max = t.date; }
    lo = lo ?? min; hi = hi ?? max;
  }
  const out = [], byKey = new Map();
  const loN = dnum(lo), hiN = dnum(hi), todayN = dnum(TODAY);
  for (let n = periodStart(loN, by); n <= hiN; n = periodNext(n, by)) {
    if (out.length >= 3000) return null;
    const end = periodNext(n, by) - 1;
    const p = { period: periodKey(n, by), start: dstr(n), end: dstr(end), from: dstr(Math.max(n, loN)),
      to: dstr(Math.min(end, hiN)), partial: end > todayN, ...emptyMeasures() };
    out.push(p); byKey.set(p.period, p);
  }
  const total = emptyMeasures();
  for (const r of res) {
    addTo(byKey.get(periodKey(periodStart(dnum(r.t.date), by), by)), r);
    addTo(total, r);
  }
  out.forEach(finish);
  return { by, from: lo, to: hi, periods: out, total: finish(total) };
}
const sideKinds = (side) => (side === "income" ? ["sale", "refund"] : ["expense"]);
function byCategory(f, side) {
  const res = evaluate(f), kinds = sideKinds(side), sgn = side === "income" ? 1 : -1;
  const groups = new Map();
  let amount = 0, count = 0;
  for (const { t, pieces } of res) {
    if (!kinds.includes(t.kind)) continue;
    count++;
    const seen = new Set();
    for (const p of pieces) {
      const g = groups.get(p.cat) ?? { categoryId: p.cat, amount: 0, count: 0 };
      g.amount += sgn * p.amount; amount += sgn * p.amount;
      if (!seen.has(p.cat)) { g.count++; seen.add(p.cat); }
      groups.set(p.cat, g);
    }
  }
  const categories = [...groups.values()].sort((a, b) => b.amount - a.amount || String(a.categoryId).localeCompare(String(b.categoryId)));
  return { side, categories, total: { amount, count } };
}
function byProduct(f) {
  const groups = new Map();
  for (const { t, pieces } of evaluate(f)) {
    if (t.kind === "expense") continue;
    const seen = new Set();
    for (const p of pieces) {
      const g = groups.get(p.product) ?? { productId: p.product, units: 0, revenue: 0, cost: 0, count: 0 };
      g.units += p.units; g.revenue += p.amount; g.cost += p.cost;
      if (!seen.has(p.product)) { g.count++; seen.add(p.product); }
      groups.set(p.product, g);
    }
  }
  const products = [...groups.values()].map((g) => ({ ...g, margin: g.revenue - g.cost, marginPercent: percent(g.revenue - g.cost, g.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);
  return { products };
}
function byContact(f, side, limit) {
  const kinds = sideKinds(side), sgn = side === "income" ? 1 : -1;
  const groups = new Map();
  let amount = 0, count = 0;
  for (const { t, value } of evaluate(f)) {
    if (!kinds.includes(t.kind)) continue;
    const g = groups.get(t.contactId) ?? { contactId: t.contactId, contactName: t.contactId ? CONTACT.get(t.contactId).name : null, amount: 0, count: 0 };
    g.amount += sgn * value; g.count++; amount += sgn * value; count++;
    groups.set(t.contactId, g);
  }
  let contacts = [...groups.values()].sort((a, b) => b.amount - a.amount);
  if (limit) contacts = contacts.slice(0, limit);
  return { side, contacts, total: { amount, count } };
}
const EDGES = [0, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000, 75000, 100000,
  150000, 200000, 300000, 500000];
function histogram(f) {
  const buckets = EDGES.map((min, i) => ({ min, max: EDGES[i + 1] ?? null, count: 0 }));
  let lowest = null, highest = null, count = 0;
  for (const { t } of evaluate(f, { amount: true })) {
    const a = t.amount;
    let i = EDGES.length - 1;
    while (EDGES[i] > a) i--;
    buckets[i].count++; count++;
    if (lowest === null || a < lowest) lowest = a;
    if (highest === null || a > highest) highest = a;
  }
  return { buckets, count, lowest, highest };
}
function categoryCounts(f) {
  const counts = new Map(CATEGORIES.map((c) => [c.id, 0]));
  counts.set(null, 0);
  const res = evaluate(f, { category: true });
  for (const { pieces } of res) for (const cat of new Set(pieces.map((p) => p.cat))) counts.set(cat, counts.get(cat) + 1);
  const categories = [...counts].filter(([id, n]) => id === null || !CAT.get(id).archived || n > 0)
    .map(([categoryId, count]) => ({ categoryId, count }));
  return { categories, total: res.length };
}
function budgets(month, f) {
  const from = `${month}-01`, to = monthEnd(month);
  const spent = new Map(), counts = new Map();
  for (const { t, pieces } of evaluate({ ...f, from, to })) {
    if (t.kind !== "expense") continue;
    const seen = new Set();
    for (const p of pieces) {
      spent.set(p.cat, (spent.get(p.cat) ?? 0) - p.amount);
      if (!seen.has(p.cat)) { counts.set(p.cat, (counts.get(p.cat) ?? 0) + 1); seen.add(p.cat); }
    }
  }
  const rows = [];
  for (const c of CATEGORIES) {
    const amount = budgetFor(c.id, month);
    if (amount === null) continue;
    const s = spent.get(c.id) ?? 0;
    rows.push({ categoryId: c.id, amount, spent: s, remaining: amount - s, count: counts.get(c.id) ?? 0 });
  }
  return { month, from, to, budgets: rows };
}

// ── validating writes ────────────────────────────────────────────────────────
const isCents = (v) => Number.isInteger(v) && v > 0;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;

function checkCategory(P, field, id, want, previous) {
  const c = CAT.get(id);
  if (!c) return P.push({ field, message: "Unknown category" });
  if (c.kind !== want) return P.push({ field, message: want === "expense" ? "Choose an expense category" : "Choose an income category" });
  if (c.archived && !previous.has(id)) P.push({ field, message: "Category was archived" });
}
// One line of a sale (or a free-form refund line): a product or a description, quantity, unit price.
function buildLine(P, l, i, prev) {
  const at = (k) => `lines[${i}].${k}`;
  if (!l || typeof l !== "object") { P.push({ field: `lines[${i}]`, message: "A line must be an object" }); return null; }
  const product = l.productId != null ? PRODUCT.get(l.productId) : null;
  if (l.productId != null && !product) P.push({ field: at("productId"), message: "Unknown product" });
  const description = typeof l.description === "string" && l.description.trim() ? l.description.trim() : product ? product.name : "";
  if (!description) P.push({ field: at("description"), message: "Describe the item" });
  const quantity = l.quantity === undefined || l.quantity === null ? 1 : l.quantity;
  if (!Number.isInteger(quantity) || quantity < 1) P.push({ field: at("quantity"), message: "Quantity must be a positive whole number" });
  const unitPrice = l.unitPrice === undefined || l.unitPrice === null ? (product ? product.price : undefined) : l.unitPrice;
  if (unitPrice === undefined) P.push({ field: at("unitPrice"), message: "Price is required" });
  else if (!isCents(unitPrice)) P.push({ field: at("unitPrice"), message: "Price must be a positive whole number of cents" });
  const amount = Number.isInteger(quantity) && Number.isInteger(unitPrice) ? quantity * unitPrice : 0;
  if (l.amount !== undefined && l.amount !== null && l.amount !== amount) P.push({ field: at("amount"), message: "Line total must equal quantity × unit price" });
  const old = prev?.find((x) => x.id === l.id && x.productId === (l.productId ?? null));
  let unitCost = old ? old.unitCost : product ? product.unitCost : 0;
  if (!product && l.unitCost !== undefined && l.unitCost !== null) {
    if (!Number.isInteger(l.unitCost) || l.unitCost < 0) P.push({ field: at("unitCost"), message: "Unit cost must be a whole number of cents" });
    else unitCost = l.unitCost;
  }
  return { productId: product ? product.id : null, description, quantity, unitPrice, amount, unitCost };
}
function buildLines(P, input, prev) {
  if (!Array.isArray(input) || input.length === 0) { P.push({ field: "lines", message: "Add at least one line" }); return []; }
  return input.map((l, i) => buildLine(P, l, i, prev));
}
function otherRefunds(saleId, selfId) {
  return (refunds().bySale.get(saleId) ?? []).filter((r) => r.id !== selfId);
}

// Returns { record, problems }. `prev` is the stored record for an update.
function buildTransaction(input, prev) {
  const P = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { problems: [{ field: null, message: "Body must be a JSON object" }] };
  const kind = prev ? prev.kind : input.kind;
  if (prev && has(input, "kind") && input.kind !== prev.kind) P.push({ field: "kind", message: "A transaction's kind can't change" });
  if (!KINDS.includes(kind)) return { problems: [{ field: "kind", message: "Kind must be sale, refund or expense" }] };
  const val = (k, d = null) => (has(input, k) ? input[k] : prev ? prev[k] : d);
  const t = { id: prev ? prev.id : null, kind };

  t.date = val("date");
  if (t.date === null || t.date === "") P.push({ field: "date", message: "Date is required" });
  else if (!isDate(t.date)) P.push({ field: "date", message: "Date must be a calendar date, YYYY-MM-DD" });

  t.description = val("description", "") ?? "";
  if (typeof t.description !== "string") P.push({ field: "description", message: "Description must be text" });
  else if (t.description.length > 200) P.push({ field: "description", message: "Description is too long (200 characters at most)" });
  else t.description = t.description.trim();

  t.contactId = val("contactId");
  if (t.contactId !== null && !CONTACT.has(t.contactId)) P.push({ field: "contactId", message: "Unknown contact" });

  const previousCats = new Set(prev ? [prev.categoryId, ...(prev.parts ?? []).map((p) => p.categoryId)] : []);
  const amountGiven = has(input, "amount") && input.amount !== null;
  if (amountGiven && !isCents(input.amount)) P.push({ field: "amount", message: "Amount must be a positive whole number of cents" });

  if (kind === "expense") {
    t.channel = null; t.refundOf = null; t.lines = [];
    if (has(input, "lines") && input.lines !== null && !(Array.isArray(input.lines) && !input.lines.length))
      P.push({ field: "lines", message: "An expense has no lines; split it into parts instead" });
    t.amount = val("amount");
    if (t.amount === null) P.push({ field: "amount", message: "Amount is required" });
    else if (!isCents(t.amount) && !amountGiven) P.push({ field: "amount", message: "Amount must be a positive whole number of cents" });
    let parts = val("parts"), categoryId = val("categoryId");
    if (has(input, "categoryId") && input.categoryId !== null && !has(input, "parts")) parts = null;
    if (Array.isArray(parts) && parts.length === 0) parts = null;
    if (parts !== null) {
      categoryId = null;
      if (!Array.isArray(parts) || parts.length < 2) P.push({ field: "parts", message: "A split needs at least two parts" });
      else {
        let allValid = true;
        parts = parts.map((p, i) => {
          if (!p || typeof p !== "object") { allValid = false; P.push({ field: `parts[${i}]`, message: "A part must be an object" }); return null; }
          if (p.categoryId == null || p.categoryId === "") { allValid = false; P.push({ field: `parts[${i}].categoryId`, message: "Category is required" }); }
          else checkCategory(P, `parts[${i}].categoryId`, p.categoryId, "expense", previousCats);
          if (p.amount == null) { allValid = false; P.push({ field: `parts[${i}].amount`, message: "Amount is required" }); }
          else if (!isCents(p.amount)) { allValid = false; P.push({ field: `parts[${i}].amount`, message: "Amount must be a positive whole number of cents" }); }
          return { categoryId: p.categoryId, amount: p.amount };
        });
        if (allValid && isCents(t.amount)) {
          const total = sum(parts, (p) => p.amount);
          if (total !== t.amount) P.push({ field: "parts", message: "Split parts must add up to the total", remaining: t.amount - total });
        }
      }
    } else if (categoryId !== null) checkCategory(P, "categoryId", categoryId, "expense", previousCats);
    t.parts = parts; t.categoryId = categoryId;
    return { record: t, problems: P };
  }

  // sales and refunds
  t.parts = null;
  if (has(input, "parts") && input.parts !== null) P.push({ field: "parts", message: "Only an expense can be split" });
  t.refundOf = kind === "refund" ? (prev ? prev.refundOf : input.refundOf ?? null) : null;
  if (prev && kind === "refund" && has(input, "refundOf") && (input.refundOf ?? null) !== prev.refundOf)
    P.push({ field: "refundOf", message: "A refund's sale can't change" });
  const sale = t.refundOf ? BY_ID.get(t.refundOf) : null;
  if (t.refundOf && (!sale || sale.kind !== "sale")) return { problems: [...P, { field: "refundOf", message: "Choose a sale to refund" }] };

  const inherit = (k, d) => (has(input, k) ? input[k] : prev ? prev[k] : sale ? sale[k] : d);
  t.channel = inherit("channel", null);
  if (t.channel === null) { if (kind === "sale") P.push({ field: "channel", message: "Channel is required" }); }
  else if (!CHANNEL.has(t.channel)) P.push({ field: "channel", message: "Unknown channel" });
  if (!prev && sale && !has(input, "contactId")) t.contactId = sale.contactId;
  t.categoryId = inherit("categoryId", "product-sales");
  if (t.categoryId !== null) checkCategory(P, "categoryId", t.categoryId, "income", previousCats);

  if (kind === "sale" && prev && (has(input, "lines") || amountGiven) && refundedTotal(prev.id) > 0)
    return { problems: [...P, { field: has(input, "lines") ? "lines" : "amount", message: "This sale has refunds, so its lines can't change" }] };

  if (sale && sale.date && isDate(t.date) && t.date < sale.date) P.push({ field: "date", message: "A refund can't be dated before its sale" });

  let lines;
  if (has(input, "lines") && input.lines !== null) {
    if (sale) {
      // lines of a linked refund point at the sale's lines (or are free-form)
      if (!Array.isArray(input.lines) || input.lines.length === 0) { P.push({ field: "lines", message: "Add at least one line" }); lines = []; }
      else {
        lines = input.lines.map((l, i) => {
          const at = (k) => `lines[${i}].${k}`;
          if (!l || typeof l !== "object") { P.push({ field: `lines[${i}]`, message: "A line must be an object" }); return null; }
          if (l.saleLineId == null) { const free = buildLine(P, l, i, null); return free && { saleLineId: null, ...free }; }
          const sl = sale.lines.find((x) => x.id === l.saleLineId);
          if (!sl) { P.push({ field: at("saleLineId"), message: "That line isn't on the sale" }); return null; }
          const quantity = l.quantity == null ? (l.amount == null ? sl.quantity : 0) : l.quantity;
          if (!Number.isInteger(quantity) || quantity < 0) { P.push({ field: at("quantity"), message: "Quantity must be a whole number" }); return null; }
          const amount = l.amount == null ? quantity * sl.unitPrice : l.amount;
          if (!isCents(amount)) { P.push({ field: at(l.amount == null ? "quantity" : "amount"), message: l.amount == null ? "Refund at least one item or an amount" : "Amount must be a positive whole number of cents" }); return null; }
          return { saleLineId: sl.id, productId: sl.productId, description: sl.description, quantity,
            unitPrice: sl.unitPrice, amount, unitCost: sl.unitCost };
        });
      }
    } else lines = buildLines(P, input.lines, prev?.lines);
  } else if (prev && !amountGiven) {
    lines = prev.lines.map((l) => ({ ...l }));
  } else if (prev && amountGiven) {
    // a one-line transaction's amount edited directly
    if (prev.lines.length !== 1) { P.push({ field: "amount", message: "Only a one-line transaction's amount can be changed directly" }); lines = prev.lines; }
    else {
      const l = { ...prev.lines[0] };
      if (l.saleLineId) l.amount = input.amount;
      else if (input.amount % l.quantity !== 0) P.push({ field: "amount", message: `Amount must divide evenly by the quantity (${l.quantity})` });
      else { l.unitPrice = input.amount / l.quantity; l.amount = input.amount; }
      lines = [l];
    }
  } else if (kind === "refund" && amountGiven) {
    lines = [{ ...(sale ? { saleLineId: null } : {}), productId: null, description: "Refund", quantity: 1, unitPrice: input.amount, amount: input.amount, unitCost: 0 }];
  } else {
    P.push({ field: kind === "refund" ? "amount" : "lines", message: kind === "refund" ? "Refund some lines or an amount" : "Add at least one line" });
    lines = [];
  }
  lines = lines.filter(Boolean);
  if (!sale && kind === "refund") for (const l of lines) if (l.saleLineId !== undefined) delete l.saleLineId;
  t.lines = lines;
  t.amount = sum(lines, (l) => l.amount);
  if (amountGiven && has(input, "lines") && input.amount !== t.amount) P.push({ field: "amount", message: "Lines must add up to the total" });

  if (sale && !P.length) {
    // never more than is left to refund: per line, by quantity and amount, and in total
    const others = otherRefunds(sale.id, t.id);
    const used = new Map();
    for (const r of others) for (const l of r.lines) if (l.saleLineId) {
      const u = used.get(l.saleLineId) ?? { amount: 0, quantity: 0 };
      u.amount += l.amount; u.quantity += l.quantity; used.set(l.saleLineId, u);
    }
    const mine = new Map();
    lines.forEach((l, i) => {
      if (!l.saleLineId) return;
      const sl = sale.lines.find((x) => x.id === l.saleLineId);
      const u = used.get(sl.id) ?? { amount: 0, quantity: 0 };
      const m = mine.get(sl.id) ?? { amount: 0, quantity: 0 };
      m.amount += l.amount; m.quantity += l.quantity; mine.set(sl.id, m);
      if (m.quantity > sl.quantity - u.quantity)
        P.push({ field: `lines[${i}].quantity`, message: "Refund exceeds the original sale", remaining: sl.quantity - u.quantity - (m.quantity - l.quantity) });
      else if (m.amount > sl.amount - u.amount)
        P.push({ field: `lines[${i}].amount`, message: "Refund exceeds the original sale", remaining: sl.amount - u.amount - (m.amount - l.amount) });
    });
    const left = sale.amount - sum(others, (r) => r.amount);
    if (!P.length && t.amount > left) P.push({ field: "amount", message: "Refund exceeds the original sale", remaining: left });
  }
  return { record: t, problems: P };
}

// ── changes and undo ─────────────────────────────────────────────────────────
const CHANGES = new Map();
let changeSeq = 0;
function recordChange(action, pairs) {
  const id = `ch${++changeSeq}`;
  CHANGES.set(id, { id, action, undone: false,
    records: pairs.map(([before, after]) => ({ id: (before ?? after).id, before: before && clone(before),
      after: after && clone(after), rev: REV.get((before ?? after).id) })) });
  if (CHANGES.size > 500) CHANGES.delete(CHANGES.keys().next().value);
  return id;
}
// refunds must point at sales that exist and never exceed them
function refundsIntact(saleIds) {
  const { bySale, byLine } = refunds();
  for (const id of saleIds) {
    const rs = bySale.get(id);
    if (!rs) continue;
    const s = BY_ID.get(id);
    if (!s || s.kind !== "sale") return false;
    if (sum(rs, (r) => r.amount) > s.amount) return false;
    for (const l of s.lines) {
      const u = byLine.get(l.id);
      if (u && (u.amount > l.amount || u.quantity > l.quantity)) return false;
    }
  }
  return true;
}
function undo(change) {
  for (const r of change.records) {
    const now = BY_ID.get(r.id);
    if (r.after ? !now || REV.get(r.id) !== r.rev : !!now)
      return { conflict: "Some of these transactions changed since, so this can't be undone" };
  }
  const apply = (which) => { for (const r of change.records) { if (r[which]) store(clone(r[which])); else unstore(r.id); } };
  apply("before");
  const sales = new Set();
  for (const r of change.records) for (const x of [r.before, r.after]) if (x) sales.add(x.kind === "sale" ? x.id : x.refundOf);
  sales.delete(null);
  if (!refundsIntact(sales)) {
    apply("after");
    for (const r of change.records) r.rev = REV.get(r.id);
    return { conflict: "Refunds recorded since depend on these transactions, so this can't be undone" };
  }
  change.undone = true;
  return { undone: change.id, count: change.records.length, ids: change.records.map((r) => r.id) };
}

// ── plumbing ─────────────────────────────────────────────────────────────────
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};
const send = (res, code, body) => {
  res.writeHead(code, { ...CORS, "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};
const invalid = (res, problems, error = "invalid") => send(res, 400, { error, message: problems[0].message, problems });
const notFound = (res, what) => send(res, 404, { error: "not found", message: what });
const BAD_JSON = Symbol("bad json");
const readBody = (req) => new Promise((resolve) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve(BAD_JSON); } });
});
const nonNegInt = (v, d) => (v === null ? d : /^\d+$/.test(v) ? Number(v) : NaN);

function contactOut(c) {
  let count = 0, last = null;
  for (const t of TX) if (t.contactId === c.id) { count++; if (!last || t.date > last) last = t.date; }
  return { ...c, transactionCount: count, lastDate: last };
}

const routes = [];
const route = (method, pattern, fn) => routes.push({ method, pattern, fn });

route("GET", /^\/api\/today$/, (req, res) => send(res, 200, { today: TODAY }));
route("GET", /^\/api\/categories$/, (req, res) => send(res, 200, { categories: CATEGORIES }));
route("GET", /^\/api\/channels$/, (req, res) => send(res, 200, { channels: CHANNELS }));
route("GET", /^\/api\/products$/, (req, res) =>
  send(res, 200, { products: PRODUCTS.map(({ weight, ...p }) => p) }));

route("GET", /^\/api\/contacts$/, (req, res, url) => {
  const q = norm(url.searchParams.get("q") ?? "").trim();
  const type = url.searchParams.get("type");
  if (type && type !== "customer" && type !== "vendor") return invalid(res, [{ field: "type", message: "type must be customer or vendor" }]);
  const limit = nonNegInt(url.searchParams.get("limit"), 0);
  if (Number.isNaN(limit)) return invalid(res, [{ field: "limit", message: "limit must be a whole number" }]);
  const rank = (name) => {
    const n = norm(name);
    if (!q) return 0;
    if (n.startsWith(q)) return 0;
    if (n.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 1;
    return n.includes(q) ? 2 : -1;
  };
  let out = CONTACTS.filter((c) => (!type || c.type === type)).map((c) => [c, rank(c.name)]).filter(([, r]) => r >= 0)
    .sort((a, b) => a[1] - b[1] || a[0].name.localeCompare(b[0].name)).map(([c]) => c);
  if (limit) out = out.slice(0, limit);
  send(res, 200, { contacts: out.map(contactOut) });
});
route("GET", /^\/api\/contacts\/([^/]+)$/, (req, res, url, m) => {
  const c = CONTACT.get(m[1]);
  return c ? send(res, 200, contactOut(c)) : notFound(res, `No contact ${m[1]}`);
});
route("POST", /^\/api\/contacts$/, async (req, res) => {
  const b = await readBody(req);
  if (b === BAD_JSON || !b || typeof b !== "object") return invalid(res, [{ field: null, message: "Body must be a JSON object" }]);
  const P = [];
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
  if (!name) P.push({ field: "name", message: "Name is required" });
  else if (name.length > 80) P.push({ field: "name", message: "Name is too long (80 characters at most)" });
  if (b.type !== "customer" && b.type !== "vendor") P.push({ field: "type", message: "type must be customer or vendor" });
  const usual = b.usualCategoryId ?? null;
  if (usual !== null) {
    if (b.type !== "vendor") P.push({ field: "usualCategoryId", message: "Only a vendor has a usual category" });
    else checkCategory(P, "usualCategoryId", usual, "expense", new Set());
  }
  if (P.length) return invalid(res, P);
  const existing = CONTACTS.find((c) => norm(c.name) === norm(name));
  if (existing) return send(res, 409, { error: "conflict", message: "A contact with this name already exists",
    problems: [{ field: "name", message: "A contact with this name already exists" }], contact: contactOut(existing) });
  const c = addContact(name, b.type, usual);
  VERSION++;
  send(res, 201, contactOut(c));
});

function readFilter(res, src) {
  const { f, problems } = parseFilter(src);
  if (problems.length) { invalid(res, problems, "invalid filter"); return null; }
  return f;
}
route("GET", /^\/api\/transactions$/, (req, res, url) => {
  const f = readFilter(res, url.searchParams); if (!f) return;
  const sort = url.searchParams.get("sort") ?? "date", dir = url.searchParams.get("dir") ?? (sort === "date" || sort === "amount" ? "desc" : "asc");
  const offset = nonNegInt(url.searchParams.get("offset"), 0), limit = nonNegInt(url.searchParams.get("limit"), 100);
  const P = [];
  if (!SORTS[sort]) P.push({ field: "sort", message: `sort must be one of ${Object.keys(SORTS).join(", ")}` });
  if (dir !== "asc" && dir !== "desc") P.push({ field: "dir", message: "dir must be asc or desc" });
  if (Number.isNaN(offset)) P.push({ field: "offset", message: "offset must be a whole number" });
  if (Number.isNaN(limit) || limit > 10000) P.push({ field: "limit", message: "limit must be a whole number up to 10000" });
  if (P.length) return invalid(res, P);
  const { results, summary } = sortedResults(f, sort, dir);
  send(res, 200, { total: results.length, offset, limit, summary,
    rows: results.slice(offset, offset + limit).map((r) => row(r.t, r.value)) });
});
route("GET", /^\/api\/transactions\/([^/]+)$/, (req, res, url, m) => {
  const t = BY_ID.get(m[1]);
  return t ? send(res, 200, detail(t)) : notFound(res, `No transaction ${m[1]}`);
});
route("POST", /^\/api\/transactions$/, async (req, res) => {
  const b = await readBody(req);
  if (b === BAD_JSON) return invalid(res, [{ field: null, message: "Body must be JSON" }]);
  const { record, problems } = buildTransaction(b, null);
  if (problems.length) return invalid(res, problems);
  record.id = newTxId();
  record.lines.forEach((l, i) => { l.id = `${record.id}.${i + 1}`; });
  const t = orderFields(record);
  store(t);
  send(res, 201, { transaction: detail(t), changeId: recordChange("create", [[null, t]]) });
});
function orderFields(r) {
  return { id: r.id, kind: r.kind, date: r.date, description: r.description, contactId: r.contactId,
    channel: r.channel, categoryId: r.categoryId, parts: r.parts, amount: r.amount, refundOf: r.refundOf,
    lines: r.lines.map((l) => {
      const out = { id: l.id };
      if (r.kind === "refund") out.saleLineId = l.saleLineId ?? null;
      return Object.assign(out, { productId: l.productId, description: l.description, quantity: l.quantity,
        unitPrice: l.unitPrice, amount: l.amount, unitCost: l.unitCost });
    }) };
}
async function update(req, res, url, m) {
  const prev = BY_ID.get(m[1]);
  if (!prev) return notFound(res, `No transaction ${m[1]}`);
  const b = await readBody(req);
  if (b === BAD_JSON) return invalid(res, [{ field: null, message: "Body must be JSON" }]);
  const { record, problems } = buildTransaction(b, prev);
  if (problems.length) return invalid(res, problems);
  // keep ids of lines that were kept; number new ones after the highest
  let next = Math.max(0, ...prev.lines.map((l) => Number(l.id.split(".")[1])));
  const ids = new Set(prev.lines.map((l) => l.id));
  const given = Array.isArray(b.lines) ? b.lines : null;
  record.lines.forEach((l, i) => {
    const want = given ? given[i]?.id : prev.lines[i]?.id;
    l.id = want && ids.has(want) ? (ids.delete(want), want) : `${prev.id}.${++next}`;
  });
  const before = clone(prev);
  const t = orderFields(record);
  store(t);
  send(res, 200, { transaction: detail(t), changeId: recordChange("update", [[before, t]]) });
}
route("PATCH", /^\/api\/transactions\/([^/]+)$/, update);
route("PUT", /^\/api\/transactions\/([^/]+)$/, update);
route("DELETE", /^\/api\/transactions\/([^/]+)$/, (req, res, url, m) => {
  const t = BY_ID.get(m[1]);
  if (!t) return notFound(res, `No transaction ${m[1]}`);
  if (t.kind === "sale" && (refunds().bySale.get(t.id) ?? []).length)
    return send(res, 409, { error: "conflict", message: "This sale has refunds; delete them first", problems: [{ field: null, message: "This sale has refunds; delete them first" }] });
  const before = clone(t);
  unstore(t.id);
  send(res, 200, { deleted: t.id, changeId: recordChange("delete", [[before, null]]) });
});

route("POST", /^\/api\/transactions\/bulk$/, async (req, res) => {
  const b = await readBody(req);
  if (b === BAD_JSON || !b || typeof b !== "object") return invalid(res, [{ field: null, message: "Body must be a JSON object" }]);
  const P = [];
  const action = b.action;
  if (!["categorise", "set-contact", "delete"].includes(action)) P.push({ field: "action", message: "action must be categorise, set-contact or delete" });
  const where = b.where;
  const whereKeys = typeof where === "string" ? [...new URLSearchParams(where.replace(/^\?/, "")).keys()]
    : where && typeof where === "object" ? Object.keys(where).filter((k) => where[k] !== null && where[k] !== undefined) : [];
  if (!whereKeys.some((k) => FILTER_KEYS.includes(k))) P.push({ field: "where", message: "Say which transactions: ids or a filter" });
  let category = null;
  if (action === "categorise") {
    if (!has(b, "categoryId")) P.push({ field: "categoryId", message: "Category is required" });
    else if (b.categoryId !== null) {
      category = CAT.get(b.categoryId);
      if (!category) P.push({ field: "categoryId", message: "Unknown category" });
      else if (category.archived) P.push({ field: "categoryId", message: "Category was archived" });
    }
  }
  if (action === "set-contact") {
    if (!has(b, "contactId")) P.push({ field: "contactId", message: "Contact is required" });
    else if (b.contactId !== null && !CONTACT.has(b.contactId)) P.push({ field: "contactId", message: "Unknown contact" });
  }
  if (P.length) return invalid(res, P);
  const { f, problems } = parseFilter(where);
  if (problems.length) return invalid(res, problems.map((p) => ({ ...p, field: `where.${p.field}` })), "invalid filter");
  const matched = evaluate(f).map((r) => r.t);
  if (has(b, "expectedCount") && b.expectedCount !== matched.length)
    return send(res, 409, { error: "conflict", message: `The selection changed: ${matched.length} transactions match now`, count: matched.length });

  const pairs = [], skipped = [];
  if (action === "delete") {
    const going = new Set(matched.map((t) => t.id));
    for (const t of matched) {
      if (t.kind === "sale" && (refunds().bySale.get(t.id) ?? []).some((r) => !going.has(r.id))) { skipped.push({ id: t.id, reason: "has-refunds" }); going.delete(t.id); }
    }
    for (const t of matched) if (going.has(t.id)) pairs.push([clone(t), null]);
    for (const [before] of pairs) unstore(before.id);
  } else {
    for (const t of matched) {
      let next;
      if (action === "categorise") {
        if (category && (category.kind === "income") !== (t.kind !== "expense")) { skipped.push({ id: t.id, reason: "kind" }); continue; }
        if (t.categoryId === b.categoryId && !t.parts) continue;
        next = { ...clone(t), categoryId: b.categoryId, parts: null };
      } else {
        if (t.contactId === b.contactId) continue;
        next = { ...clone(t), contactId: b.contactId };
      }
      pairs.push([clone(t), next]);
    }
    for (const [, next] of pairs) store(next);
  }
  const ids = pairs.map(([before]) => before.id);
  send(res, 200, { action, matched: matched.length, count: ids.length, ids, skipped,
    changeId: ids.length ? recordChange(action, pairs) : null });
});
route("POST", /^\/api\/changes\/([^/]+)\/undo$/, (req, res, url, m) => {
  const c = CHANGES.get(m[1]);
  if (!c) return notFound(res, `No change ${m[1]}`);
  if (c.undone) return send(res, 409, { error: "conflict", message: "Already undone" });
  const out = undo(c);
  if (out.conflict) return send(res, 409, { error: "conflict", message: out.conflict });
  send(res, 200, out);
});

route("GET", /^\/api\/summary$/, (req, res, url) => {
  const f = readFilter(res, url.searchParams); if (!f) return;
  send(res, 200, summarise(evaluate(f)));
});
route("GET", /^\/api\/aggregates\/periods$/, (req, res, url) => {
  const f = readFilter(res, url.searchParams); if (!f) return;
  const by = url.searchParams.get("by") ?? "month";
  if (!["day", "week", "month", "quarter"].includes(by)) return invalid(res, [{ field: "by", message: "by must be day, week, month or quarter" }]);
  const out = periods(f, by);
  if (!out) return invalid(res, [{ field: "by", message: "Too many periods; choose a coarser one" }]);
  send(res, 200, out);
});
const readSide = (res, url, d) => {
  const side = url.searchParams.get("side") ?? d;
  if (side !== "income" && side !== "expense") { invalid(res, [{ field: "side", message: "side must be income or expense" }]); return null; }
  return side;
};
route("GET", /^\/api\/aggregates\/categories$/, (req, res, url) => {
  const f = readFilter(res, url.searchParams); if (!f) return;
  const side = readSide(res, url, "expense"); if (!side) return;
  send(res, 200, byCategory(f, side));
});
route("GET", /^\/api\/aggregates\/products$/, (req, res, url) => {
  const f = readFilter(res, url.searchParams); if (!f) return;
  send(res, 200, byProduct(f));
});
route("GET", /^\/api\/aggregates\/contacts$/, (req, res, url) => {
  const f = readFilter(res, url.searchParams); if (!f) return;
  const side = readSide(res, url, "income"); if (!side) return;
  const limit = nonNegInt(url.searchParams.get("limit"), 0);
  if (Number.isNaN(limit)) return invalid(res, [{ field: "limit", message: "limit must be a whole number" }]);
  send(res, 200, byContact(f, side, limit));
});
route("GET", /^\/api\/aggregates\/amounts$/, (req, res, url) => {
  const f = readFilter(res, url.searchParams); if (!f) return;
  send(res, 200, histogram(f));
});
route("GET", /^\/api\/aggregates\/category-counts$/, (req, res, url) => {
  const f = readFilter(res, url.searchParams); if (!f) return;
  send(res, 200, categoryCounts(f));
});

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
route("GET", /^\/api\/budgets$/, (req, res, url) => {
  const month = url.searchParams.get("month") ?? monthOf(TODAY);
  if (!MONTH.test(month)) return invalid(res, [{ field: "month", message: "month must be YYYY-MM" }]);
  const f = readFilter(res, url.searchParams); if (!f) return;
  send(res, 200, budgets(month, f));
});
route("PUT", /^\/api\/budgets\/([^/]+)\/([^/]+)$/, async (req, res, url, m) => {
  const [, month, categoryId] = m;
  const b = await readBody(req);
  if (b === BAD_JSON || !b || typeof b !== "object") return invalid(res, [{ field: null, message: "Body must be a JSON object" }]);
  const P = [];
  if (!MONTH.test(month)) P.push({ field: "month", message: "month must be YYYY-MM" });
  const c = CAT.get(categoryId);
  if (!c) P.push({ field: "categoryId", message: "Unknown category" });
  else if (c.kind !== "expense") P.push({ field: "categoryId", message: "Budgets are for expense categories" });
  else if (c.archived) P.push({ field: "categoryId", message: "Category was archived" });
  if (!has(b, "amount")) P.push({ field: "amount", message: "Amount is required" });
  else if (b.amount !== null && !isCents(b.amount)) P.push({ field: "amount", message: "Amount must be a positive whole number of cents" });
  if (P.length) return invalid(res, P);
  setBudget(categoryId, month, b.amount);
  VERSION++;
  const row = budgets(month, parseFilter("").f).budgets.find((x) => x.categoryId === categoryId) ?? { categoryId, amount: null };
  send(res, 200, { month, ...row });
});

const server = createServer({ maxHeaderSize: 4 * 1024 * 1024 }, async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname.replace(/\/+$/, "") || "/";
  let pathMatched = false;
  for (const r of routes) {
    const m = p.match(r.pattern);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== req.method) continue;
    try { return await r.fn(req, res, url, m); } catch (e) {
      console.error(e);
      return send(res, 500, { error: "server error", message: String(e?.message ?? e) });
    }
  }
  if (pathMatched) return send(res, 405, { error: "method not allowed", message: `${req.method} is not supported on ${p}` });
  send(res, 404, { error: "no such endpoint", message: `No endpoint ${p}`, path: p });
});

server.listen(PORT, "127.0.0.1", () => {
  const n = (k) => TX.filter((t) => t.kind === k).length;
  console.log(`ledger api — http://127.0.0.1:${PORT}`);
  console.log(`${TX.length} transactions (${n("sale")} sales, ${n("refund")} refunds, ${n("expense")} expenses) · ${START} to ${TODAY} · ${CONTACTS.length} contacts`);
});


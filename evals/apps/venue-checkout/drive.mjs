#!/usr/bin/env node
// drive.mjs — the hidden acceptance for venue-checkout. It drives a built app the way a
// screen reader finds things — by role and accessible name, from the browser's own
// accessibility tree — and judges by what the service was asked (its request log) and
// what the page then says. It knows nothing about how the app is built.
//
//   node evals/apps/venue-checkout/drive.mjs <app-url> [--service=http://127.0.0.1:8350]
//        [--only=a,b] [--out=dir] [--headful]
//
// The service must be this app's (api/server.mjs, with the _reset/_take/_log endpoints).
// Each scenario starts from a reset service, with the scripted sales off, in a fresh
// browser context (no cookies). What the brief fixes and this relies on: a seat's name
// is "Orchestra, row C, seat 14"; fields are named by their labels; the summary reads
// "N seats · $X"; the pay button reads "Pay $X"; "Sent to <email>"; the service's own
// sentences shown as written. Everything else is found by a loose match on its name.
import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchChrome } from "../../../tools/internal/chrome.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const APP = args.find((a) => !a.startsWith("--"));
if (!APP) { console.error("usage: drive.mjs <app-url> [--service=…] [--only=a,b] [--out=dir] [--headful]"); process.exit(2); }
const SERVICE = opt("service", "http://127.0.0.1:8350");
const ONLY = opt("only", "")?.split(",").filter(Boolean);
const OUT = opt("out", "/tmp/venue-drive");
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
mkdirSync(OUT, { recursive: true });

const api = async (path, body) => (await fetch(SERVICE + path, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const money = (c) => `$${(c / 100).toFixed(2)}`;

// ── the service's state ─────────────────────────────────────────────────────
async function freeSeats(pid, sectionKey, n) {
  const map = await api(`/api/performances/${pid}/seats`);
  const sec = map.sections.find((s) => s.key === sectionKey);
  for (const row of sec.rows) {
    const free = row.seats.filter((s) => s.status === "available");
    for (let i = 0; i + n <= free.length; i++) {
      const run = free.slice(i, i + n);
      if (run.at(-1).number - run[0].number === n - 1) {
        return run.map((s) => ({ id: s.id, name: `${sec.name}, row ${row.name}, seat ${s.number}`, priceCents: sec.priceCents, feeCents: sec.feeCents }));
      }
    }
  }
  throw new Error(`no ${n} adjacent free seats in ${sectionKey}`);
}
const orders = async () => (await api("/api/_log")).requests.filter((r) => r.method === "POST" && r.path.startsWith("/api/orders"));

// ── the page, by role and name ──────────────────────────────────────────────
const FIELD_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton", "TextField"]);
const ACTION_ROLES = new Set(["button", "link", "menuitem", "tab", "option", "radio", "checkbox", "switch", "row", "gridcell", "listitem", "cell", "treeitem", "menuitemradio"]);

async function nodes(page) {
  const out = [];
  const walk = (n) => { out.push(n); for (const c of n.children ?? []) walk(c); };
  const root = await page.accessibility.snapshot({ interestingOnly: true });
  if (root) walk(root);
  return out;
}
async function find(page, test, { timeout = 6000, what = "an element" } = {}) {
  const until = Date.now() + timeout;
  for (;;) {
    const hit = (await nodes(page)).find(test);
    if (hit) {
      // the tree's node may be a text node inside the element that carries the role
      let h = await hit.elementHandle();
      if (h) h = (await h.evaluateHandle((e) => (e.nodeType === 1 ? e : e.parentElement))).asElement();
      if (process.env.DEBUG) console.error(`  found ${hit.role} "${hit.name}"`);
      if (h) return { node: hit, handle: h };
    }
    if (Date.now() > until) throw new Error(`not found: ${what}`);
    await sleep(150);
  }
}
const nameMatches = (n, re) => typeof n.name === "string" && (typeof re === "string" ? n.name === re : re.test(n.name));
const button = (page, re, o = {}) => find(page, (n) => ACTION_ROLES.has(n.role) && nameMatches(n, re) && !n.disabled, { what: `a control named ${re}`, ...o });
const field = (page, re, o = {}) => find(page, (n) => FIELD_ROLES.has(n.role) && nameMatches(n, re), { what: `a field named ${re}`, ...o });
const maybe = async (p) => { try { return await p; } catch { return null; } };
async function press(page, el) {
  await el.handle.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await el.handle.click();
}
async function typeInto(page, re, text) {
  const el = await field(page, re);
  await press(page, el);
  await el.handle.evaluate((e) => { if ("value" in e) e.select?.(); });
  await page.keyboard.down("Meta"); await page.keyboard.press("a"); await page.keyboard.up("Meta");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text, { delay: 15 });
  return el;
}
const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
async function seeText(page, text, timeout = 6000) {
  const until = Date.now() + timeout;
  for (;;) {
    const t = await bodyText(page);
    const names = (await nodes(page)).map((n) => n.name ?? "").join(" | ");
    if ((typeof text === "string" ? t.includes(text) || names.includes(text) : text.test(t) || text.test(names))) return true;
    if (Date.now() > until) throw new Error(`never shown: ${text}`);
    await sleep(150);
  }
}
const summary = (n, cents) => `${n} seat${n === 1 ? "" : "s"} · ${money(cents)}`;

// ── the steps a person takes ────────────────────────────────────────────────
async function openPerformance(page) {
  await page.goto(APP, { waitUntil: "networkidle2" });
  // opening night, Friday 13 November: whatever the control is, its name carries the date
  const perf = await button(page, /\b13\b.*Nov|Nov.*\b13\b/i, { timeout: 15000 });
  await press(page, perf);
}
// A seat too small for a thumb may take a first tap to bring it close (the
// brief's own hard case) — so a seat that says whether it is chosen, and is
// not yet, is found again where it now is and tapped again, as a person would.
const chosen = (n) => n.pressed === true || n.checked === true || n.selected === true;
const tellsChosen = (n) => n.pressed !== undefined || n.checked !== undefined || n.selected !== undefined;
async function chooseSeats(page, seats) {
  for (const s of seats) {
    const seat = (n) => typeof n.name === "string" && (n.name === s.name || n.name.startsWith(s.name + ",") || n.name.startsWith(s.name + " "));
    for (let tap = 0; tap < 3; tap++) {
      const el = await find(page, seat, { what: `seat ${s.name}`, timeout: 12000 });
      if (tap > 0 && (!tellsChosen(el.node) || chosen(el.node))) break;
      await press(page, el);
      await sleep(600);   // a zoom travels
    }
  }
}
async function toCheckout(page) {
  // a step between the hall and the form, if there is one
  if (await maybe(field(page, /card number/i, { timeout: 800 }))) return;
  if (await maybe(field(page, /e-?mail/i, { timeout: 300 }))) return;
  const go = await button(page, /checkout|check out|continue|next|buy|book|review|proceed|^pay$/i);
  await press(page, go);
  await maybe(field(page, /e-?mail|card number/i, { timeout: 6000 }));
}
async function setCountry(page, country) {
  const re = new RegExp(country, "i");
  // a choice among the three (radios, a segmented control, a tab-like row)
  const choice = await maybe(find(page, (n) => ["radio", "tab", "option", "menuitemradio", "button"].includes(n.role) && re.test(n.name ?? ""), { timeout: 800 }));
  if (choice) { if (!choice.node.checked && !choice.node.selected && !choice.node.pressed) await press(page, choice); return; }
  const el = await maybe(field(page, /country/i, { timeout: 1000 }));
  if (!el) return;
  if (re.test(`${el.node.value ?? ""}`)) return;
  const tag = await el.handle.evaluate((e) => e.tagName);
  if (tag === "SELECT") { await el.handle.evaluate((e, c) => { const o = [...e.options].find((o) => new RegExp(c, "i").test(o.text)); if (o) { e.value = o.value; e.dispatchEvent(new Event("change", { bubbles: true })); } }, country); return; }
  await press(page, el);
  const opt = await maybe(button(page, re, { timeout: 1500 }));
  if (opt) { await press(page, opt); return; }
  await page.keyboard.type(country, { delay: 15 }); await page.keyboard.press("Enter");
}
async function fillNewCard(page, { email = "guest@example.com", number = "4242 4242 4242 4242", cvc = "123", postal = "62704", country = "United States", name = "Grace Hopper" } = {}) {
  await maybe(button(page, /new card|another card|add.*card|different card/i, { timeout: 400 }).then((b) => press(page, b)));
  await typeInto(page, /e-?mail/i, email);
  await typeInto(page, /name on (the )?card|cardholder|card ?holder/i, name);
  await typeInto(page, /card number/i, number);
  const expiry = await maybe(field(page, /expir|exp\b|MM ?\/ ?YY/i, { timeout: 500 }));
  if (expiry) await typeInto(page, /expir|exp\b|MM ?\/ ?YY/i, "04/28");
  else { await typeInto(page, /month/i, "04"); await typeInto(page, /year/i, "2028"); }
  await typeInto(page, /security code|cvc|cvv|csc/i, cvc);
  await setCountry(page, country);
  await typeInto(page, /street|address( line)? ?1|^address$|billing address/i, "1 Main Street");
  await typeInto(page, /city|town/i, "Springfield");
  await typeInto(page, /postal|post ?code|zip/i, postal);
}
const payButton = (page, cents) => button(page, `Pay ${money(cents)}`);
async function signIn(page, password = "correct horse battery") {
  const open = await maybe(button(page, /^sign in|^log in|^signin/i, { timeout: 4000 }));
  if (open) await press(page, open);
  // the sign-in form's email: the one in a group, or the first one found after opening
  await typeInto(page, /e-?mail/i, "ada@example.com");
  const pw = await typeInto(page, /password/i, password);
  const type = await pw.handle.evaluate((e) => e.type);
  await page.keyboard.press("Enter");
  return { concealed: type === "password" };
}
async function reading(page, s) {
  await openPerformance(page);
  await chooseSeats(page, s);
  await seeText(page, summary(s.length, s.reduce((a, x) => a + x.priceCents, 0)));
}

// ── the scenarios ───────────────────────────────────────────────────────────
const total = (seats) => seats.reduce((a, s) => a + s.priceCents + s.feeCents, 0);
const SCENARIOS = {
  async guest_pays(page) {
    const seats = await freeSeats("p01", "ORCH", 2);
    await reading(page, seats);
    await toCheckout(page);
    await fillNewCard(page);
    await press(page, await payButton(page, total(seats)));
    await seeText(page, "Sent to guest@example.com", 8000);
    const o = await orders();
    if (o.length !== 1) throw new Error(`${o.length} order requests`);
    if (o[0].body.payment?.card?.number?.replace(/\D/g, "") !== "4242424242424242") throw new Error("the card number sent was not the one typed");
  },
  async phone_guest_pays(page) {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    return SCENARIOS.guest_pays(page);
  },
  async double_press_sends_one(page) {
    const seats = await freeSeats("p01", "GT", 1);
    await reading(page, seats);
    await toCheckout(page);
    await fillNewCard(page);
    const pay = await payButton(page, total(seats));
    await pay.handle.evaluate((e) => e.scrollIntoView({ block: "center" }));
    await pay.handle.click({ count: 2 });
    await pay.handle.click().catch(() => {});
    await page.keyboard.press("Enter"); await page.keyboard.press("Enter");
    await seeText(page, "Sent to guest@example.com", 8000);
    await sleep(500);
    const o = await orders();
    if (o.length !== 1) throw new Error(`${o.length} order requests`);
  },
  async declined_then_retry(page) {
    const seats = await freeSeats("p01", "DC", 2);
    await reading(page, seats);
    await toCheckout(page);
    await fillNewCard(page, { number: "4000 0000 0000 0002" });
    await press(page, await payButton(page, total(seats)));
    await seeText(page, "Your bank declined the payment.", 8000);
    const email = await field(page, /e-?mail/i);
    if (!(email.node.value ?? "").includes("guest@example.com")) throw new Error("the email was lost after the decline");
    const cvc = await field(page, /security code|cvc|cvv|csc/i);
    if ((cvc.node.value ?? "") !== "") throw new Error("the security code was kept after the decline");
    await typeInto(page, /card number/i, "5555 5555 5555 4444");
    await typeInto(page, /security code|cvc|cvv|csc/i, "456");
    await press(page, await payButton(page, total(seats)));
    await seeText(page, "Sent to guest@example.com", 8000);
    if ((await orders()).length !== 2) throw new Error("expected two order requests");
  },
  async security_code_wrong(page) {
    const seats = await freeSeats("p01", "BALC", 1);
    await reading(page, seats);
    await toCheckout(page);
    await fillNewCard(page, { number: "4000 0000 0000 0127" });
    await press(page, await payButton(page, total(seats)));
    await seeText(page, "The security code doesn't match this card.", 8000);
    await sleep(300);
    const focused = await page.evaluate(() => { const e = document.activeElement; return e ? (e.getAttribute("aria-label") ?? e.labels?.[0]?.textContent ?? e.getAttribute("autocomplete") ?? e.tagName) : ""; });
    if (!/security|cvc|cvv|csc/i.test(focused)) throw new Error(`focus went to "${focused}", not the security code`);
  },
  async seat_taken_before_paying(page) {
    const seats = await freeSeats("p01", "ORCH", 2);
    await reading(page, seats);
    await toCheckout(page);
    await fillNewCard(page);
    await api("/api/_take", { performanceId: "p01", seatIds: [seats[1].id], silent: true });
    await press(page, await payButton(page, total(seats)));
    await seeText(page, `${seats[1].name} was just taken by someone else.`, 8000);
    await seeText(page, summary(1, seats[0].priceCents), 4000);
  },
  async seat_taken_while_choosing(page) {
    const seats = await freeSeats("p01", "GT", 2);
    await reading(page, seats);
    await sleep(500);
    await api("/api/_take", { performanceId: "p01", seatIds: [seats[0].id] });
    await seeText(page, summary(1, seats[1].priceCents), 6000);
    await seeText(page, new RegExp(`row ${seats[0].name.split("row ")[1].split(",")[0]}\\b.*seat ${seats[0].name.split("seat ")[1]}\\b|${seats[0].name}`), 3000);
  },
  async signed_in_saved_card(page) {
    const seats = await freeSeats("p01", "ORCH", 1);
    await reading(page, seats);
    await toCheckout(page);
    const { concealed } = await signIn(page);
    if (!concealed) throw new Error("the password field shows what is typed");
    const visa = await button(page, /4242/, { timeout: 8000 });
    const expired = await maybe(find(page, (n) => /4444/.test(n.name ?? ""), { timeout: 1000 }));
    if (!expired) throw new Error("the expired card is not shown");
    if (!expired.node.disabled && !/expired/i.test(expired.node.name ?? "")) throw new Error("the expired card is neither disabled nor named expired");
    await press(page, visa);
    await typeInto(page, /security code|cvc|cvv|csc/i, "123");
    await press(page, await payButton(page, total(seats)));
    await seeText(page, "Sent to ada@example.com", 8000);
    const o = await orders();
    if (o.length !== 1 || o[0].body.payment?.savedCardId !== "card_1") throw new Error("the order did not use the saved card");
    await page.reload({ waitUntil: "networkidle2" });
    await seeText(page, /Ada/, 6000);
  },
  async wrong_password(page) {
    await page.goto(APP, { waitUntil: "networkidle2" });
    await maybe(openPerformance(page));
    await signIn(page, "not the password");
    await seeText(page, "That email and password don't match.", 6000);
  },
  async bad_postcode_stays_home(page) {
    const seats = await freeSeats("p01", "DC", 1);
    await reading(page, seats);
    await toCheckout(page);
    await fillNewCard(page, { postal: "1234" });
    const pay = await payButton(page, total(seats));
    await press(page, pay);
    await sleep(2500);
    if ((await orders()).length !== 0) throw new Error("an order with a malformed postal code reached the service");
    const postal = await field(page, /postal|post ?code|zip/i);
    const marked = postal.node.invalid && postal.node.invalid !== "false";
    if (!marked) await seeText(page, /postal|zip|post ?code/i, 500);
  },
  async sign_in_midway_keeps_choice(page) {
    const seats = await freeSeats("p01", "ORCH", 2);
    await reading(page, seats);
    await toCheckout(page);
    await typeInto(page, /card number/i, "4242 4242");
    await signIn(page);
    await maybe(button(page, /4242/, { timeout: 6000 }));
    await seeText(page, summary(2, seats.reduce((a, s) => a + s.priceCents, 0)), 4000).catch(() => seeText(page, `Pay ${money(total(seats))}`, 2000));
  },
};

// ── run ─────────────────────────────────────────────────────────────────────
const browser = await launchChrome({ executablePath: CHROME, headless: !args.includes("--headful"), args: ["--no-sandbox"] });
const results = [];
for (const [name, run] of Object.entries(SCENARIOS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  await api("/api/_reset", { sales: false });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const t0 = Date.now();
  let error = null;
  try { await run(page); } catch (e) { error = e.message; }
  if (error) await page.screenshot({ path: join(OUT, `${name}.png`) }).catch(() => {});
  results.push({ name, pass: !error, error, ms: Date.now() - t0, requests: (await api("/api/_log")).requests.map((r) => `${r.method} ${r.path}`) });
  console.log(`${error ? "FAIL" : "pass"}  ${name}${error ? ` — ${error}` : ""}`);
  await ctx.close();
}
await browser.close();
await api("/api/_reset", {});
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
console.log(`${results.filter((r) => r.pass).length} of ${results.length} passed · ${OUT}/results.json`);
process.exit(results.every((r) => r.pass) ? 0 : 1);

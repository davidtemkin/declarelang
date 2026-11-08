#!/usr/bin/env node
// drive.mjs — the hidden acceptance for Conduit (RealWorld). It scores a frontend built from
// brief.md and spec/ against the RealWorld service (api/server.mjs, API in api/API.md), and knows
// nothing about how the app is built: it finds things in the browser's own accessibility tree by
// role and a loose name, and by the visible text the spec's templates fix ("Sign in", "Sign up",
// "Global Feed", "Your Feed", "Popular Tags", "Publish Article", "Post Comment", "Delete Article",
// "Edit Article", "Update Settings", "Or click here to logout.", "Edit Profile Settings",
// "Follow …", "Favorite …"); it acts with a real pointer and keyboard; and it judges by what the
// SERVICE stored (its --test-hooks state, GET /__test/state) and by what the page shows.
//
//   node evals/apps/realworld/drive.mjs <app-url> [--service-port=8381] [--only=a,b] [--out=dir] [--headful]
//
// The scenarios PORT the official RealWorld e2e suite (realworld-apps/realworld, specs/e2e, MIT):
// each scenario names the official test(s) it ports. The official suite reaches the page through
// a selector contract (SELECTORS.md: CSS classes, `name` attributes, a localStorage key,
// window.__conduit_debug__) that the spec handed to the builders does not contain, so where a test
// can only be said through such a hook it is ported to the nearest observable equivalent, and the
// adaptation is written beside it and recorded in the scenario's result:
//   - a CSS class with a visible meaning (.active, .btn-primary) → the ARIA state if the app gives
//     one (aria-current, aria-selected, aria-pressed), else the computed style swapping between the
//     two states (what a person sees);
//   - the token in localStorage / the debug interface → the app signed in through its own form,
//     and "the token was kept / cleared" judged by whether a plain reload comes back signed in;
//   - an invalid token → every request carrying an Authorization header answered 401
//     {"errors":{"token":["is invalid"]}}, exactly as the service answers an invalid token;
//   - `.error-messages` → a new visible line of text that reads as an error;
//   - URLs and wording the spec doesn't fix (/tag/:tag, ?feed=following, ?page=N, "Connecting",
//     "Unable to connect", "Your feed is empty") → the behaviour behind them, through the page.
// Network interception (CDP Fetch on the service's /api URLs) is network, not DOM, and is used as
// the official suite uses page.route().
//
// Before EACH scenario this starts a fresh `node api/server.mjs --port=<p> --test-hooks` of its
// own, waits until it listens, and stops that child (by its own pid) afterwards. If anything else
// already listens on the port it refuses to start (exit 2): it never stops a process it did not
// start. Each scenario runs in a fresh browser context. A scenario's verdict is PASS or FAIL with a
// reason (a grouped scenario lists each check); what it had to fall back on is recorded with it,
// and incidental observations go to NOTES.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChrome } from "../../../tools/internal/chrome.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const APP = args.find((a) => !a.startsWith("--"));
if (!APP) { console.error("usage: drive.mjs <app-url> [--service-port=8381] [--only=a,b] [--out=dir] [--headful]"); process.exit(2); }
const PORT = Number(opt("service-port", "8381"));
const SERVICE = `http://127.0.0.1:${PORT}`;
const API = `${SERVICE}/api`;
const ONLY = opt("only", "")?.split(",").filter(Boolean);
const OUT = opt("out", "/tmp/realworld-drive");
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
const DEFAULT_AVATAR = readFileSync(join(HERE, "spec/default-avatar.svg"), "utf8");
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NOTES = new Set();
const FIND_MS = 10000;
const GONE_MS = 1500;   // how long something must stay absent to count as not shown
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── the service: one fresh process per scenario ─────────────────────────────
function listening(port) {
  return new Promise((res) => {
    const s = createConnection({ host: "127.0.0.1", port });
    s.once("connect", () => { s.destroy(); res(true); });
    s.once("error", () => res(false));
  });
}
function whoListens(port) {
  try {
    const pids = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim().split(/\s+/).filter(Boolean);
    return pids.map((pid) => { let cmd = "?"; try { cmd = execFileSync("ps", ["-o", "command=", "-p", pid], { encoding: "utf8" }).trim(); } catch { /* gone */ } return `pid ${pid}: ${cmd}`; }).join("; ") || "unknown process";
  } catch { return "unknown process"; }
}
let SERVER = null;   // the child this process started, if running
async function startService() {
  if (await listening(PORT)) throw Object.assign(new Error(`port ${PORT} is already in use (${whoListens(PORT)})`), { refuse: true });
  const child = spawn(process.execPath, [join(HERE, "api/server.mjs"), `--port=${PORT}`, "--test-hooks"], { stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (d) => { log += d; });
  child.stderr.on("data", (d) => { log += d; });
  SERVER = child;
  const until = Date.now() + 15000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`the service exited at start: ${log.trim()}`);
    try { if ((await fetch(`${SERVICE}/__test/state`)).ok) return child; } catch { /* not yet */ }
    if (Date.now() > until) throw new Error(`the service never listened: ${log.trim()}`);
    await sleep(100);
  }
}
async function stopService() {
  const child = SERVER;
  SERVER = null;
  if (!child || child.exitCode !== null) return;
  const gone = new Promise((r) => child.once("exit", r));
  child.kill("SIGTERM");
  if (!(await Promise.race([gone.then(() => true), sleep(3000).then(() => false)]))) { child.kill("SIGKILL"); await gone; }
}
process.on("exit", () => { if (SERVER && SERVER.exitCode === null) try { SERVER.kill("SIGKILL"); } catch { /* gone */ } });

async function call(method, path, body, token) {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Token ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!r.ok) throw new Error(`service ${method} ${path}: ${r.status} ${text.slice(0, 160)}`);
  return data;
}
const state = async () => (await fetch(`${SERVICE}/__test/state`)).json();
let SEQ = 0;
const stamp = () => `${Date.now().toString(36)}${(SEQ++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
// generateUniqueUser(), with the official password
const newUser = () => { const s = stamp(); return { username: `testuser${s}`, email: `test${s}@example.com`, password: "password123" }; };
// generateUniqueArticle(), its tags made unique so a tag's name never collides with a title's words
const newArticle = () => { const s = stamp(); return { title: `Test Article ${s}`, description: `Description for test article ${s}`, body: `This is the body content for test article created at ${s}. It contains enough text to be meaningful.`, tags: [`test${s}`, `playwright${s}`] }; };
const apiRegister = async (u) => (await call("POST", "/users", { user: u })).user.token;
const apiArticle = async (token, a) => (await call("POST", "/articles", { article: { title: a.title, description: a.description, body: a.body, tagList: a.tags ?? a.tagList ?? [] } }, token)).article.slug;
const apiUpdateUser = (token, upd) => call("PUT", "/user", { user: upd }, token);
// What the service holds, once it holds: the app saves on its own schedule, so a check waits.
async function stored(test, what, timeout = 8000) {
  const until = Date.now() + timeout;
  let last;
  for (;;) {
    try { last = await test(await state()); if (last) return last; } catch (e) { last = e.message; }
    if (Date.now() > until) throw new Error(`never stored: ${what}`);
    await sleep(200);
  }
}

// ── the page, by role and name ──────────────────────────────────────────────
const ACTION_ROLES = new Set(["button", "link", "menuitem", "tab", "option", "radio", "checkbox", "switch", "togglebutton", "treeitem"]);
const FIELD_ROLES = new Set(["textbox", "searchbox", "combobox", "TextField"]);
const PLAIN = new Set(["generic", "none", "InlineTextBox", "LineBreak", "presentation", "paragraph", "group", "Section"]);
async function nodes(page) {
  const out = [];
  const walk = (n) => { if (!(PLAIN.has(n.role) && !n.name) && n.role !== "InlineTextBox") out.push(n); for (const c of n.children ?? []) walk(c); };
  const root = await page.accessibility.snapshot({ interestingOnly: false }).catch(() => null);
  if (root) walk(root);
  return out;
}
async function elementOf(n) {
  let h = await n.elementHandle().catch(() => null);
  if (h) h = (await h.evaluateHandle((e) => (e.nodeType === 1 ? e : e.parentElement))).asElement();
  return h;
}
// An icon font's glyph (a private-use character drawn by ::before) is part of the name Chrome
// computes; a person reads only the words
const nameOf = (n) => (typeof n.name === "string" ? n.name.replace(/[\uE000-\uF8FF\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim() : "");
const named = (n, re) => (typeof re === "string" ? nameOf(n) === re : re.test(nameOf(n)));
async function find(page, test, { timeout = FIND_MS, what = "an element" } = {}) {
  const until = Date.now() + timeout;
  for (;;) {
    const hits = (await nodes(page)).filter(test);
    for (const hit of hits) { const h = await elementOf(hit); if (h) return { node: hit, handle: h }; }
    if (Date.now() > until) throw new Error(`not found: ${what}`);
    await sleep(150);
  }
}
async function findAll(page, test) {
  const out = [];
  for (const n of (await nodes(page)).filter(test)) { const h = await elementOf(n); if (h) out.push({ node: n, handle: h }); }
  return out;
}
const maybe = async (p) => { try { return await p; } catch { return null; } };
const control = (page, re, o = {}) => find(page, (n) => ACTION_ROLES.has(n.role) && named(n, re) && !n.disabled, { what: `a control named ${re}`, ...o });
const button = (page, re, o = {}) => find(page, (n) => ["button", "togglebutton"].includes(n.role) && named(n, re) && !n.disabled, { what: `a button named ${re}`, ...o });
const link = (page, re, o = {}) => find(page, (n) => n.role === "link" && named(n, re), { what: `a link named ${re}`, ...o });
const field = (page, re, o = {}) => find(page, (n) => FIELD_ROLES.has(n.role) && named(n, re) && !n.disabled, { what: `a field named ${re}`, ...o });
// A title: a heading named for it (the templates' <h1>), else — noted — its text shown plainly
const norm = (x) => x.replace(/\s+/g, " ").trim();
const isTitle = (n, t) => ["heading", "StaticText", "link"].includes(n.role) && nameOf(n) === norm(t);
async function heading(page, text, o = {}) {
  const until = Date.now() + (o.timeout ?? FIND_MS);
  for (;;) {
    const ns = await nodes(page);
    const h = ns.find((n) => n.role === "heading" && nameOf(n) === norm(text));
    if (h) { const e = await elementOf(h); if (e) return { node: h, handle: e }; }
    // text of its own: more of it than controls named the same (a "Sign in" link's text isn't the page's title)
    const texts = ns.filter((n) => n.role === "StaticText" && nameOf(n) === norm(text));
    const ctls = ns.filter((n) => ACTION_ROLES.has(n.role) && nameOf(n) === norm(text)).length;
    if (texts.length > ctls) {
      for (const t of texts) {
        const e = await elementOf(t);
        if (e && !(await e.evaluate((x) => !!x.closest("a,button,[role=button],[role=link],[role=option],[role=tab]")))) {
          NOTES.add("titles and names the templates show as headings (the page title, article titles, the profile's name) are not headings in the tree; found as text");
          return { node: t, handle: e };
        }
      }
    }
    if (Date.now() > until) throw new Error(`not found: a heading "${text}"${o.what ? ` (${o.what})` : ""}`);
    await sleep(150);
  }
}
// Not shown: absent from the tree for GONE_MS (the page having settled on something first).
async function absent(page, test, ms = GONE_MS) {
  const until = Date.now() + ms;
  for (;;) {
    const hit = (await nodes(page)).find(test);
    if (hit) return hit;
    if (Date.now() > until) return null;
    await sleep(200);
  }
}
async function press(page, el) {
  await el.handle.evaluate((e) => e.scrollIntoView({ block: "center", inline: "nearest" }));
  await sleep(50);
  const b = await el.handle.boundingBox();
  if (!b || b.width === 0 || b.height === 0) { await el.handle.click(); return; }
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
async function focusIn(el, timeout = 1500) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await el.handle.evaluate((e) => { const a = document.activeElement; return !!a && (a === e || e.contains(a) || a.contains(e)); }).catch(() => false)) return true;
    await sleep(50);
  }
  return false;
}
async function selectAll(page) {
  // Command-A with the editing command it means: keys sent through DevTools on a Mac don't run
  // editing commands on their own
  await page.keyboard.down("Meta"); await page.keyboard.press("a", { commands: ["SelectAll"] }); await page.keyboard.up("Meta");
}
async function typeIn(page, el, text, { enter = false } = {}) {
  await press(page, el);
  if (!(await focusIn(el))) { await el.handle.focus(); NOTES.add(`a click on the field "${nameOf(el.node)}" did not put the caret in it; focused it directly`); }
  await selectAll(page);
  if (text === "") await page.keyboard.press("Backspace");
  else if (text.length > 200) { await page.keyboard.press("Backspace"); await page.keyboard.sendCharacter(text); }   // a long text arrives as one input, not 1,500 key presses
  else await page.keyboard.type(text);
  if (enter) await page.keyboard.press("Enter");
  return el;
}
const valueOf = (el) => el.handle.evaluate((e) => ("value" in e ? e.value : e.textContent) ?? "");
const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " ")).catch(() => "");
const allText = async (page) => `${await bodyText(page)} | ${(await nodes(page)).map((n) => `${n.name ?? ""} ${n.value ?? ""}`).join(" | ")}`;
async function seeText(page, text, timeout = FIND_MS) {
  const until = Date.now() + timeout;
  for (;;) {
    const t = await allText(page);
    const m = typeof text === "string" ? (t.includes(text) ? [text] : null) : text.exec(t);
    if (m) return m;
    if (Date.now() > until) throw new Error(`never shown: ${text}`);
    await sleep(150);
  }
}
const lines = async (page) => new Set((await page.evaluate(() => document.body.innerText).catch(() => "")).split("\n").map((s) => s.trim()).filter(Boolean));
// `.error-messages` → a new visible line that reads as an error (or an alert's text)
const ERRORISH = /error|invalid|fail|unable|can'?t|cannot|could ?n[o']t|wrong|forbidden|unauthori[sz]ed|not authori[sz]ed|denied|expired|connect|network|offline|try again|blank|taken|problem|not allowed|too short|must|sorry|logged in/i;
async function errorAppears(page, before, what, timeout = 6000) {
  const until = Date.now() + timeout;
  for (;;) {
    const now = await lines(page);
    const fresh = [...now].filter((l) => !before.has(l) && ERRORISH.test(l));
    if (fresh.length) return fresh[0].slice(0, 120);
    const alert = (await nodes(page)).find((n) => n.role === "alert" && nameOf(n) && ERRORISH.test(nameOf(n)));
    if (alert) return nameOf(alert).slice(0, 120);
    if (Date.now() > until) throw new Error(`${what}: no error message shown`);
    await sleep(200);
  }
}

// ── going places: the spec's routes (routing.md), by path or by hash ─────────
const BASE = new URL(APP);
const BASE_PATH = BASE.pathname.endsWith("/") ? BASE.pathname : `${BASE.pathname}/`;
let HASH = null;   // the app routes by "#/…", learned from its own links
// by hash: the app's own document (its URL as given, without a fragment) + "#/…"
const routeUrl = (path) => (HASH ? `${BASE.origin}${BASE.pathname}${BASE.search}#${path}` : `${BASE.origin}${BASE_PATH}${path.replace(/^\//, "")}`);
function routeOf(page) {
  const u = new URL(page.url());
  if (HASH) return decodeURIComponent((u.hash.replace(/^#/, "") || "/").split("?")[0]);   // no fragment is home
  let p = u.pathname;
  if (BASE_PATH !== "/" && p.startsWith(BASE_PATH)) p = `/${p.slice(BASE_PATH.length)}`;
  return decodeURIComponent(p.replace(/(.)\/$/, "$1"));
}
async function atRoute(page, want, what = "", timeout = FIND_MS) {
  const ok = () => (typeof want === "string" ? routeOf(page) === want : want.test(routeOf(page)));
  const until = Date.now() + timeout;
  while (!ok()) {
    if (Date.now() > until) throw new Error(`${what ? `${what}: ` : ""}the page is at ${routeOf(page)}, not ${want}`);
    await sleep(100);
  }
  return routeOf(page);
}
async function go(page, path) {
  if (HASH === null) {
    await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 20000 });
    const l = await maybe(link(page, /^(sign in|home)$/i, { timeout: 8000 }));
    const href = l ? await l.handle.evaluate((e) => e.closest("a")?.getAttribute("href") ?? "") : "";
    HASH = /#\//.test(href);
    if (HASH) NOTES.add("the app routes by hash (#/…); the spec's routes were taken as hash routes");
    if (path === "/") return;
  }
  // the same URL again would be a reload that keeps the history entry's state; a person typing
  // the address starts afresh
  // — and a hash-routed app gets a fresh load too, as a path-routed one does (a fragment change
  // alone would not reload the document)
  const sameDoc = (a, b) => { try { const x = new URL(a), y = new URL(b); return x.origin + x.pathname + x.search === y.origin + y.pathname + y.search; } catch { return false; } };
  if (page.url() === routeUrl(path) || (HASH && sameDoc(page.url(), routeUrl(path)))) await page.goto("about:blank");
  await page.goto(routeUrl(path), { waitUntil: "domcontentloaded", timeout: 20000 });
}
// Signed in as u, whatever state the last check left: the network restored, home, signed in
async function ensureSignedIn(page, net, u) {
  if (net) net.set([]);
  await go(page, "/");
  if (await signedInAs(page, u.username) !== true) await signIn(page, u);
}
// The app's frame: the brand and the Home link (`nav.navbar`, `a.navbar-brand`)
async function appShell(page, what = "") {
  await link(page, /^conduit$/i).catch(() => { throw new Error(`${what ? `${what}: ` : ""}no "conduit" brand link (the app's frame isn't shown)`); });
  await link(page, /^home$/i).catch(() => { throw new Error(`${what ? `${what}: ` : ""}no Home link in the header`); });
}
// The home page's banner (`.banner`): its "conduit" heading, or its tagline (templates.md)
const banner = (page, what = "") => find(page, (n) => (n.role === "heading" && /^conduit$/i.test(nameOf(n))) || /^a place to share your knowledge\.?$/i.test(nameOf(n)), { what: "the banner" }).catch(() => { throw new Error(`${what ? `${what}: ` : ""}no banner (heading "conduit" / "A place to share your knowledge.")`); });
// A page with content beyond the header and footer (`.article-page`, `.profile-page` rendered)
async function someContent(page, what) {
  const until = Date.now() + FIND_MS;
  for (;;) {
    const t = await page.evaluate(() => {
      const skip = new Set([...document.querySelectorAll("nav, header, footer, [role=navigation], [role=banner], [role=contentinfo]")]);
      const all = document.body.innerText;
      let chrome = 0;
      for (const e of skip) chrome += (e.innerText ?? "").length;
      return all.replace(/\s+/g, "").length - chrome;
    }).catch(() => 0);
    if (t > 3) return;
    if (Date.now() > until) throw new Error(`${what}: the page is blank between its header and footer`);
    await sleep(200);
  }
}
const profileLink = (page, username, o = {}) => link(page, new RegExp(`(^|\\s)${esc(username)}(\\s|$)`), { what: `a link to ${username}'s profile`, ...o });
const signedOut = async (page, what) => {
  await link(page, /^sign in$/i).catch(() => { throw new Error(`${what}: no Sign in link`); });
  await link(page, /^sign up$/i).catch(() => { throw new Error(`${what}: no Sign up link`); });
};

// ── signing up, in and out (helpers/auth.ts) ────────────────────────────────
const F = {
  username: /^(username|your name|name)$|user ?name/i,
  email: /e-?mail/i,
  password: /password/i,
  image: /picture|image|avatar|photo/i,
  bio: /\bbio\b/i,
  title: /title/i,
  description: /about|description|summary/i,
  body: /write your article|markdown|^body$|article body|content/i,
  tags: /tags?\b/i,
  comment: /comment/i,
};
async function registerUI(page, u, { expectHome = true } = {}) {
  await go(page, "/register");
  await typeIn(page, await field(page, F.username), u.username);
  await typeIn(page, await field(page, F.email), u.email);
  await typeIn(page, await field(page, F.password), u.password);
  await press(page, await button(page, /^sign up$/i));
  if (expectHome) {
    await atRoute(page, "/", "after signing up");
    await profileLink(page, u.username).catch(() => { throw new Error("signed up, but the header shows no link to the new user's profile"); });
  }
}
async function signIn(page, u, { expectHome = true } = {}) {
  await go(page, "/login");
  await typeIn(page, await field(page, F.email), u.email);
  await typeIn(page, await field(page, F.password), u.password);
  await press(page, await button(page, /^sign in$/i));
  if (expectHome) {
    await atRoute(page, "/", "after signing in");
    await profileLink(page, u.username).catch(() => { throw new Error("signed in, but the header shows no link to the user's profile"); });
  }
}
async function signOut(page) {
  await press(page, await link(page, /^settings$/i));
  await press(page, await button(page, /logout|log out|sign out/i));
  await atRoute(page, "/", "after logging out");
}
// Signed in, judged by the header: the user's profile link (else the Sign in link)
async function signedInAs(page, username, timeout = 6000) {
  const until = Date.now() + timeout;
  for (;;) {
    const ns = await nodes(page);
    if (ns.some((n) => n.role === "link" && /^sign in$/i.test(nameOf(n)))) return false;
    if (ns.some((n) => n.role === "link" && new RegExp(`(^|\\s)${esc(username)}(\\s|$)`).test(nameOf(n)))) return true;
    if (Date.now() > until) return null;
    await sleep(200);
  }
}

// ── articles (helpers/articles.ts) ──────────────────────────────────────────
async function addTags(page, tags) {
  for (const t of tags ?? []) {
    const f = await field(page, F.tags);
    await typeIn(page, f, t, { enter: true });
    await sleep(100);
  }
}
async function createArticleUI(page, a) {
  await go(page, "/editor");
  await typeIn(page, await field(page, F.title), a.title);
  await typeIn(page, await field(page, F.description), a.description);
  await typeIn(page, await field(page, F.body), a.body);
  await addTags(page, a.tags);
  await press(page, await button(page, /^publish( article)?$/i));
  const r = await atRoute(page, /^\/article\/.+/, "after Publish Article");
  return r.slice("/article/".length);
}
const FAV = /favou?rite/i, UNFAV = /unfavou?rite/i;
const isFav = (n) => (UNFAV.test(nameOf(n)) ? true : n.pressed === true ? true : n.pressed === false ? false : false);
const FOLLOW = /follow/i, UNFOLLOW = /unfollow/i;
const isFollowing = (n) => (UNFOLLOW.test(nameOf(n)) ? true : n.pressed === true);
// What a control looks like (the .btn-primary / .active a person sees)
const styleSig = (h) => h.evaluate((e) => { const s = getComputedStyle(e); return [s.color, s.backgroundColor, s.borderBottomColor, s.borderBottomWidth, s.borderBottomStyle, s.fontWeight, s.textDecorationLine].join("|"); }).catch(() => "");
// The ARIA "this is the current one" marker, if the app gives one
const ariaCurrent = (h) => h.evaluate((e) => { const a = e.closest("a,button,[role]") ?? e; const v = [a.getAttribute("aria-current"), a.getAttribute("aria-selected"), a.getAttribute("aria-pressed"), a.getAttribute("aria-checked")]; return v.some((x) => x && x !== "false") ? true : v.some((x) => x === "false") ? false : null; }).catch(() => null);
// Article titles the service holds, to tell a list's previews from other headings
async function titlesShown(page, titles) {
  const set = new Set(titles.map(norm));
  const ns = await nodes(page);
  const hs = ns.filter((n) => n.role === "heading" && set.has(nameOf(n))).map(nameOf);
  if (hs.length) return hs;
  const ts = ns.filter((n) => n.role === "StaticText" && set.has(nameOf(n))).map(nameOf);
  if (ts.length) NOTES.add("article titles in lists are not headings in the tree; counted as text");
  return ts;
}
async function listBecomes(page, want, what, timeout = FIND_MS) {
  const titles = (await state()).articles.map((a) => a.title.replace(/\s+/g, " ").trim());
  const until = Date.now() + timeout;
  let got;
  for (;;) {
    got = await titlesShown(page, titles);
    if (got.length === want.length && want.every((t) => got.includes(t))) return got;
    if (Date.now() > until) throw new Error(`${what}: the list shows ${got.length} article(s) (${got.slice(0, 3).map((t) => `"${t}"`).join(", ")}${got.length > 3 ? ", …" : ""}); the service's page has ${want.length} (${want.slice(0, 3).map((t) => `"${t}"`).join(", ")}${want.length > 3 ? ", …" : ""})`);
    await sleep(200);
  }
}
// The card a preview's heading sits in: the largest block holding that title and no other
async function cardOf(h, titles) {
  titles = titles.map(norm);
  return (await h.evaluateHandle((e, titles) => {
    let c = e;
    const t = (y) => (y.textContent ?? "").replace(/\s+/g, " ").trim();
    // the innermost elements that read exactly as a title
    const count = (x) => [...x.querySelectorAll("*")].filter((y) => titles.includes(t(y)) && ![...y.children].some((c) => t(c) === t(y))).length;
    while (c.parentElement && c.parentElement !== document.body && count(c.parentElement) <= 1) c = c.parentElement;
    return c;
  }, titles)).asElement();
}
const inside = (outer, inner) => outer.evaluate((o, i) => o.contains(i), inner).catch(() => false);
async function inCard(page, card, test) {
  for (const n of (await nodes(page)).filter(test)) { const h = await elementOf(n); if (h && await inside(card, h)) return { node: n, handle: h }; }
  return null;
}
// A sidebar tag: a link after "Popular Tags" named for the tag
async function sidebarTag(page, ctx, tagRe, timeout = FIND_MS) {
  const until = Date.now() + timeout;
  for (;;) {
    const ns = await nodes(page);
    const at = ns.findIndex((n) => /popular tags/i.test(nameOf(n)));
    const hit = at >= 0 ? ns.slice(at + 1).find((n) => ["link", "button"].includes(n.role) && named(n, tagRe)) : null;
    if (hit) { const h = await elementOf(hit); if (h) return { node: hit, handle: h }; }
    if (Date.now() > until) {
      if (at < 0) {
        const any = await maybe(control(page, tagRe, { timeout: 1 }));
        if (any) { ctx.fallback(`no "Popular Tags" sidebar heading; took the control named ${tagRe}`); return any; }
        throw new Error('no "Popular Tags" sidebar');
      }
      throw new Error(`no tag ${tagRe} under "Popular Tags"`);
    }
    await sleep(150);
  }
}

// ── avatars: what the page draws for each picture ───────────────────────────
// Every picture on screen: its source, whether it loaded, and whether it IS the spec's
// default-avatar.svg (drawn and compared pixel by pixel, so a bundled, renamed or inlined copy
// counts; a cross-origin picture can't be read and is not the default).
async function pictures(page) {
  return page.evaluate(async (svg) => {
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    const draw = (img) => { const c = document.createElement("canvas"); c.width = c.height = 24; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 24, 24); g.drawImage(img, 0, 0, 24, 24); return g.getImageData(0, 0, 24, 24).data; };
    const def = draw(await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`));
    const out = [];
    const els = [...document.querySelectorAll("body *")].filter((e) => {
      if (!e.checkVisibility()) return false;
      const r = e.getBoundingClientRect();
      if (r.width < 12 || r.height < 12) return false;
      if (e.tagName === "IMG") return true;
      if (e.tagName === "svg" && !e.closest("button,a")?.innerText?.trim()) return r.width >= 18 && !e.parentElement.closest("svg");
      const bg = getComputedStyle(e).backgroundImage;
      return /url\(/.test(bg);
    });
    for (const e of els) {
      const r = e.getBoundingClientRect();
      let src = "", loaded = false, img = null;
      if (e.tagName === "IMG") { src = e.currentSrc || e.src; loaded = e.complete && e.naturalWidth > 0; img = loaded ? await load(src) : null; }
      else if (e.tagName === "svg") { src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(e))}`; img = await load(src); loaded = !!img; }
      else { src = /url\(["']?(.*?)["']?\)/.exec(getComputedStyle(e).backgroundImage)?.[1] ?? ""; img = await load(src); loaded = !!img; }
      let isDefault = false;
      if (img) { try { const d = draw(img); let diff = 0; for (let i = 0; i < d.length; i += 4) diff += Math.abs(d[i] - def[i]) + Math.abs(d[i + 1] - def[i + 1]) + Math.abs(d[i + 2] - def[i + 2]); isDefault = diff / (24 * 24 * 3) < 12; } catch { /* cross-origin */ } }
      out.push({ src: src.slice(0, 200), loaded, isDefault, x: r.x, y: r.y + scrollY, w: r.width, h: r.height, alt: e.getAttribute("alt") ?? "" });
    }
    return out;
  }, DEFAULT_AVATAR);
}
async function picturesWhen(page, test, what, timeout = 6000) {
  const until = Date.now() + timeout;
  let last = [];
  for (;;) {
    last = await pictures(page);
    if (test(last)) return last;
    if (Date.now() > until) throw new Error(`${what} (pictures shown: ${last.map((p) => `${p.isDefault ? "default" : p.src.slice(0, 60)}${p.loaded ? "" : " (not loaded)"}`).join(", ") || "none"})`);
    await sleep(250);
  }
}
// Pictures in the header: those above the bottom of the brand link
async function headerBottom(page) {
  const b = await link(page, /^conduit$/i);
  const box = await b.handle.evaluate((e) => { const n = e.closest("nav,header") ?? e; const r = n.getBoundingClientRect(); return r.bottom + scrollY; });
  return box;
}

// ── network: the official page.route(), on the service's /api URLs ──────────
// rules: [{ when: /^GET \/user$/, act: { status, body } | { abort: "TimedOut" } | (req, n) => act }]
// The path is the request's path after /api, with its query.
async function mockApi(page) {
  const cdp = await page.createCDPSession();
  const ctl = { rules: [], seen: [], cdp };
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: `${API}/*`, requestStage: "Request" }] });
  cdp.on("Fetch.requestPaused", async (ev) => {
    const u = new URL(ev.request.url);
    const key = `${ev.request.method} ${u.pathname.replace(/^\/api/, "")}${u.search}`;
    const go = () => cdp.send("Fetch.continueRequest", { requestId: ev.requestId }).catch(() => {});
    if (ev.request.method === "OPTIONS") return go();
    const rule = ctl.rules.find((r) => r.when.test(key) && (!r.auth || ev.request.headers.Authorization || ev.request.headers.authorization));
    if (!rule) return go();
    rule.n = (rule.n ?? 0) + 1;
    ctl.seen.push(key);
    try {
      const act = typeof rule.act === "function" ? await rule.act(ev.request, rule.n) : rule.act;
      if (!act || act.pass) return go();
      if (act.abort) return cdp.send("Fetch.failRequest", { requestId: ev.requestId, errorReason: act.abort }).catch(() => {});
      const body = act.body === undefined ? "" : typeof act.body === "string" ? act.body : JSON.stringify(act.body);
      await cdp.send("Fetch.fulfillRequest", {
        requestId: ev.requestId, responseCode: act.status,
        responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" }, { name: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" }],
        body: Buffer.from(body).toString("base64"),
      }).catch(() => {});
    } catch { go(); }
  });
  ctl.set = (rules) => { ctl.rules = rules; ctl.seen = []; };
  ctl.off = async () => { ctl.rules = []; await cdp.send("Fetch.disable").catch(() => {}); };
  return ctl;
}
// The real request made from here, its answer changed: "let the server do it, change what the client sees"
async function realThen(req, status, body) {
  const headers = { ...req.headers };
  delete headers["Content-Length"]; delete headers["content-length"];
  await fetch(req.url, { method: req.method, headers, body: req.postData });
  return { status, body };
}
const json = (status, body) => ({ status, body });
const mockArticle = (author, extra = {}) => ({ slug: "test-article", title: "Test Article", description: "Test description", body: "Test body", tagList: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), favorited: false, favoritesCount: 0, author: { username: author, bio: "", image: "", following: false }, ...extra });

// ── the scenarios: the official e2e suite, ported ───────────────────────────
// ctx.check(name, fn): one ported test inside a grouped scenario; the scenario fails if any does.
const SCENARIOS = {
  // health.spec.ts — all four tests.
  async health(page, ctx) {
    await ctx.check("app should load successfully", async () => { await go(page, "/"); await appShell(page); });
    await ctx.check("API should be accessible", async () => { const r = await fetch(`${API}/tags`); if (!r.ok) throw new Error(`GET /api/tags → ${r.status}`); });
    await ctx.check("can navigate to login page", async () => {
      await go(page, "/login");
      await heading(page, "Sign in");
      await field(page, F.email);
    });
    await ctx.check("can navigate to register page", async () => {
      await go(page, "/register");
      await heading(page, "Sign up");
      await field(page, F.username);
    });
  },

  // auth.spec.ts › should register a new user
  async auth_register(page) {
    const u = newUser();
    await registerUI(page, u);
    await stored((s) => s.users.find((x) => x.username === u.username && x.email === u.email), "the new user");
    await press(page, await link(page, /new article/i));
    await atRoute(page, "/editor", "the New Article link");
  },

  // auth.spec.ts › should not register with a malformed email
  async auth_register_bad_email(page) {
    const u = newUser();
    await go(page, "/register");
    await typeIn(page, await field(page, F.username), u.username);
    await typeIn(page, await field(page, F.email), `${u.username}-not-an-email`);
    await typeIn(page, await field(page, F.password), u.password);
    await press(page, await button(page, /^sign up$/i));
    await sleep(1500);
    await atRoute(page, "/register", "a malformed email");
    if (await absent(page, (n) => n.role === "link" && nameOf(n).includes(u.username), 500)) throw new Error("signed in with a malformed email");
    await link(page, /^sign in$/i).catch(() => { throw new Error("no Sign in link in the header after the refused sign-up"); });
    if ((await state()).users.some((x) => x.username === u.username)) throw new Error("the service registered the user");
  },

  // auth.spec.ts › should login with existing user, should logout successfully
  async auth_login_logout(page, ctx) {
    const u = newUser();
    await registerUI(page, u);
    await ctx.check("should logout successfully", async () => {
      await signOut(page);
      await link(page, /^sign in$/i).catch(() => { throw new Error("logged out, but no Sign in link"); });
      await gone(page, (n) => n.role === "link" && new RegExp(`(^|\\s)${esc(u.username)}(\\s|$)`).test(nameOf(n)), "logged out, but the profile link is still shown");
    });
    await ctx.check("should login with existing user", async () => { await signIn(page, u); });
  },

  // auth.spec.ts › should show error for invalid login, should fail login with wrong password
  // (the second registers its user through the service, not the form: registering is
  // auth_register's test, and the user is the same)
  async auth_login_errors(page, ctx) {
    await ctx.check("should show error for invalid login", async () => {
      await go(page, "/login");
      await typeIn(page, await field(page, F.email), "nonexistent@example.com");
      await typeIn(page, await field(page, F.password), "wrongpassword");
      const before = await lines(page);
      await press(page, await button(page, /^sign in$/i));
      ctx.observed.invalid = await errorAppears(page, before, "an unknown email");
    });
    await ctx.check("should fail login with wrong password", async () => {
      const u = newUser();
      await apiRegister(u);
      await go(page, "/login");
      await typeIn(page, await field(page, F.email), u.email);
      await typeIn(page, await field(page, F.password), "wrongpassword123");
      const before = await lines(page);
      await press(page, await button(page, /^sign in$/i));
      ctx.observed.wrongPassword = await errorAppears(page, before, "a wrong password");
      await atRoute(page, "/login", "a wrong password");
    });
  },

  // auth.spec.ts › should prevent accessing editor when not logged in, should maintain session
  // after page reload
  async auth_guard_session(page, ctx) {
    await ctx.check("should prevent accessing editor when not logged in", async () => {
      await go(page, "/editor");
      await sleep(1500);
      if (routeOf(page) === "/editor") throw new Error("a signed-out visitor stays on /editor");
      ctx.observed.redirectedTo = routeOf(page);
    });
    await ctx.check("should maintain session after page reload", async () => {
      const u = newUser();
      await registerUI(page, u);
      await page.reload({ waitUntil: "domcontentloaded" });
      await profileLink(page, u.username).catch(() => { throw new Error("signed out by a reload"); });
    });
  },

  // auth.spec.ts › should handle invalid token on page reload gracefully. Adapted: the official
  // writes a bad token into localStorage and reads it back through window.__conduit_debug__; here
  // the app's own token is made invalid by answering every request that carries it as the service
  // answers an invalid token (401 {"errors":{"token":["is invalid"]}}); then the page must show
  // the signed-out header, and — the token cleared — a plain reload must stay signed out.
  async auth_invalid_token(page, ctx) {
    ctx.adapt("invalid token: every Authorization-bearing request answered 401 token is invalid; 'token cleared' judged by a reload with the network restored staying signed out");
    const u = newUser();
    await apiRegister(u);
    const net = await mockApi(page);
    await signIn(page, u);
    net.set([{ when: /^(GET|POST|PUT|DELETE) /, auth: true, act: json(401, { errors: { token: ["is invalid"] } }) }]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await signedOut(page, "with an invalid token");
    await appShell(page, "with an invalid token");
    await net.off();
    await page.reload({ waitUntil: "domcontentloaded" });
    if (await signedInAs(page, u.username) === true) throw new Error("the invalid token was kept: with the network restored, a reload signs the user back in");
  },

  // articles.spec.ts › should create a new article
  async article_create(page) {
    const u = newUser();
    await registerUI(page, u);
    const a = newArticle();
    const slug = await createArticleUI(page, a);
    await heading(page, a.title);
    await seeText(page, a.body).catch(() => { throw new Error("the article's body isn't shown"); });
    for (const t of a.tags) await seeText(page, t, 4000).catch(() => { throw new Error(`the tag "${t}" isn't shown on the article`); });
    const s = await stored((st) => st.articles.find((x) => x.slug === slug), "the article");
    if (s.title !== a.title || s.body !== a.body || s.description !== a.description || JSON.stringify(s.tagList) !== JSON.stringify(a.tags)) throw new Error(`stored ${JSON.stringify({ title: s.title, description: s.description, tagList: s.tagList })}`);
  },

  // articles.spec.ts › should edit an existing article
  async article_edit(page) {
    const u = newUser();
    await registerUI(page, u);
    const a = newArticle();
    const slug = await createArticleUI(page, a);
    await go(page, `/editor/${slug}`);
    const title = await field(page, F.title);
    for (const until = Date.now() + FIND_MS; (await valueOf(title)) === ""; await sleep(150)) if (Date.now() > until) throw new Error("the editor never filled in the article's title");
    const upd = { title: `Updated ${a.title}`, description: `Updated ${a.description}` };
    await typeIn(page, title, upd.title);
    await typeIn(page, await field(page, F.description), upd.description);
    await press(page, await button(page, /^publish( article)?$/i));
    const r = await atRoute(page, /^\/article\/.+/, "after publishing the edit");
    await heading(page, upd.title);
    const s = await stored((st) => st.articles.find((x) => x.title === upd.title), "the edited title");
    if (s.description !== upd.description) throw new Error(`stored description "${s.description}"`);
    if (r !== `/article/${s.slug}`) throw new Error(`after the edit the page is at ${r}; the article's slug is now ${s.slug}`);
  },

  // articles.spec.ts › should delete an article, should delete an article when server returns
  // 200 instead of 204
  async article_delete(page, ctx) {
    const u = newUser();
    await registerUI(page, u);
    const net = await mockApi(page);
    await ctx.check("should delete an article", async () => {
      const a = newArticle();
      const slug = await createArticleUI(page, a);
      await press(page, await button(page, /delete article/i));
      await atRoute(page, "/", "after Delete Article");
      await banner(page);
      await gone(page, (n) => isTitle(n, a.title), "the deleted article is still listed on the home page");
      await stored((st) => !st.articles.some((x) => x.slug === slug), "the deletion");
    });
    await ctx.check("should delete an article when server returns 200 instead of 204", async () => {
      const a = newArticle();
      const slug = await createArticleUI(page, a);
      net.set([{ when: /^DELETE \/articles\/[^/]+$/, act: (req) => realThen(req, 200, {}) }]);
      await press(page, await button(page, /delete article/i));
      await atRoute(page, "/", "after Delete Article answered 200");
      await stored((st) => !st.articles.some((x) => x.slug === slug), "the deletion");
      net.set([]);
    });
  },

  // articles.spec.ts › should favorite an article, should unfavorite an article. The favorited
  // state is read from the button's name (Unfavorite…) or aria-pressed, else its look (the
  // official reads .btn-primary).
  async article_favorite(page, ctx) {
    const u = newUser();
    await registerUI(page, u);
    const s0 = await state();
    const first = s0.articles.find((x) => x.author !== u.username);
    await go(page, "/");
    await press(page, await heading(page, first.title));
    await atRoute(page, /^\/article\/.+/, "the first article's title");
    const favBtn = () => find(page, (n) => ["button", "togglebutton", "link"].includes(n.role) && FAV.test(nameOf(n)), { what: "a Favorite button" });
    const b0 = await favBtn();
    if (isFav(b0.node)) throw new Error(`the article shows as favorited before favoriting ("${nameOf(b0.node)}")`);
    const look0 = await styleSig(b0.handle);
    const shown = async (want) => {
      const until = Date.now() + 6000;
      for (;;) {
        const b = await favBtn();
        if (isFav(b.node) === want) return nameOf(b.node);
        await page.mouse.move(1, 1);
        if (Date.now() > until) {
          const look = await styleSig(b.handle);
          if ((look !== look0) === want) { ctx.fallback(`favorited state shown only by the button's look ("${nameOf(b.node)}")`); return nameOf(b.node); }
          throw new Error(`the page doesn't show the article as ${want ? "favorited" : "not favorited"} ("${nameOf(b.node)}")`);
        }
        await sleep(200);
      }
    };
    await ctx.check("should favorite an article", async () => {
      await press(page, b0);
      await stored((st) => st.favorites.some((f) => f.article === first.slug && f.user === u.username), "the favorite");
      ctx.observed.favorited = await shown(true);
    });
    await ctx.check("should unfavorite an article", async () => {
      await press(page, await favBtn());
      await stored((st) => !st.favorites.some((f) => f.article === first.slug && f.user === u.username), "the unfavorite");
      ctx.observed.unfavorited = await shown(false);
    });
  },

  // articles.spec.ts › should view article from home feed, should display article preview correctly
  async article_from_feed(page, ctx) {
    const u = newUser();
    await registerUI(page, u);
    const a = newArticle();
    await createArticleUI(page, a);
    await go(page, "/");
    const titles = (await state()).articles.map((x) => x.title);
    await ctx.check("should display article preview correctly", async () => {
      const h = await heading(page, a.title);
      const shown = await titlesShown(page, titles);
      if (shown[0] !== a.title) throw new Error(`the first preview is "${shown[0]}", not the new article`);
      const card = await cardOf(h.handle, titles);
      const text = await card.evaluate((e) => e.innerText.replace(/\s+/g, " "));
      if (!text.includes(a.description)) throw new Error("the preview doesn't show the description");
      if (!(await inCard(page, card, (n) => n.role === "link" && nameOf(n) === u.username))) throw new Error("the preview has no author link");
      for (const t of a.tags) if (!text.includes(t)) throw new Error(`the preview doesn't show the tag "${t}"`);
    });
    await ctx.check("should view article from home feed", async () => {
      await press(page, await heading(page, a.title));
      await atRoute(page, /^\/article\/.+/, "the preview's title");
      await heading(page, a.title);
    });
  },

  // articles.spec.ts › should remove all tags when editing an article. The pill's delete control
  // is found by its name (Remove …/×), not `.tag-pill i`.
  async article_remove_tags(page, ctx) {
    const u = newUser();
    await registerUI(page, u);
    const a = newArticle();
    const slug = await createArticleUI(page, a);
    for (const t of a.tags) await seeText(page, t, 4000).catch(() => { throw new Error(`the tag "${t}" isn't shown on the article`); });
    await go(page, `/editor/${slug}`);
    const title = await field(page, F.title);
    for (const until = Date.now() + FIND_MS; (await valueOf(title)) === ""; await sleep(150)) if (Date.now() > until) throw new Error("the editor never filled in the article's title");
    for (const t of a.tags) {
      const rm = await maybe(find(page, (n) => ACTION_ROLES.has(n.role) && (named(n, new RegExp(`(remove|delete|clear).*${esc(t)}|${esc(t)}.*(remove|delete|clear)`, "i"))), { timeout: 2500 }))
        ?? await maybe(find(page, (n) => ACTION_ROLES.has(n.role) && named(n, new RegExp(`^(×|x|✕|remove|delete)?\\s*${esc(t)}\\s*(×|x|✕)?$`, "i")), { timeout: 1500 }));
      if (!rm) throw new Error(`no control to remove the tag "${t}" in the editor`);
      if (!/remove|delete|clear/i.test(nameOf(rm.node))) ctx.fallback(`removed "${t}" by the control named "${nameOf(rm.node)}"`);
      await press(page, rm);
      await sleep(150);
    }
    const net = await mockApi(page);
    let sent;
    net.set([{ when: /^PUT \/articles\//, act: (req) => { try { sent = JSON.parse(req.postData ?? "{}")?.article?.tagList; } catch { sent = "unparsable"; } return { pass: true }; } }]);
    await press(page, await button(page, /^publish( article)?$/i));
    await atRoute(page, /^\/article\/.+/, "after publishing");
    if (!Array.isArray(sent) || sent.length !== 0) throw new Error(`the update sent tagList ${JSON.stringify(sent)}, not []`);
    await stored((st) => st.articles.find((x) => x.slug === slug)?.tagList.length === 0, "an article with no tags");
    await heading(page, a.title);
    for (const t of a.tags) await gone(page, (n) => nameOf(n) === t, `the article page still shows the tag "${t}"`);
  },

  // articles.spec.ts › should only allow author to edit/delete article
  async article_author_only(page) {
    const u = newUser();
    await registerUI(page, u);
    const a = newArticle();
    const slug = await createArticleUI(page, a);
    await find(page, (n) => /edit article/i.test(nameOf(n)) && ACTION_ROLES.has(n.role), { what: "Edit Article for the author" });
    await button(page, /delete article/i);
    const bctx2 = await page.browser().createBrowserContext();
    try {
      const p2 = await bctx2.newPage();
      await p2.setViewport({ width: 1440, height: 900 });
      await registerUI(p2, newUser());
      await go(p2, `/article/${slug}`);
      await heading(p2, a.title);
      const hit = await absent(p2, (n) => /edit article|delete article/i.test(nameOf(n)) && ACTION_ROLES.has(n.role));
      if (hit) throw new Error(`another user sees "${nameOf(hit)}"`);
    } finally { await bctx2.close().catch(() => {}); }
  },

  // comments.spec.ts › should add a comment to an article, should delete own comment, should
  // delete comment when server returns 200 instead of 204. A comment's delete control is the
  // first control named Delete/Remove/trash after its text (the official: `.mod-options i.ion-trash-a`).
  async comment_add_delete(page, ctx) {
    const { slug } = await commentSetup(page);
    const net = await mockApi(page);
    await ctx.check("should add a comment to an article", async () => {
      await addComment(page, ctx, slug, "This is a test comment from Playwright!");
    });
    await ctx.check("should delete own comment", async () => {
      await addComment(page, ctx, slug, "Comment to be deleted");
      await deleteComment(page, ctx, slug, "Comment to be deleted");
    });
    await ctx.check("should delete comment when server returns 200 instead of 204", async () => {
      await addComment(page, ctx, slug, "Comment to test 200 status");
      net.set([{ when: /^DELETE \/articles\/[^/]+\/comments\/\d+$/, act: (req) => realThen(req, 200, {}) }]);
      await deleteComment(page, ctx, slug, "Comment to test 200 status");
      net.set([]);
    });
  },

  // comments.spec.ts › should display multiple comments, should handle long comments, should
  // preserve comments after page reload, should clear comment form after posting
  async comment_multiple(page, ctx) {
    const { slug } = await commentSetup(page);
    await ctx.check("should display multiple comments", async () => {
      for (const c of ["First comment", "Second comment", "Third comment"]) await addComment(page, ctx, slug, c);
      const mine = (await state()).comments.filter((c) => c.article === slug);
      if (mine.length !== 3) throw new Error(`the service holds ${mine.length} comments on the article`);
      for (const c of ["First comment", "Second comment", "Third comment"]) {
        const n = (await nodes(page)).filter((x) => x.role === "StaticText" && nameOf(x) === c).length;
        if (n !== 1) throw new Error(`"${c}" is shown ${n} times`);
      }
    });
    await ctx.check("should clear comment form after posting", async () => {
      const v = await valueOf(await field(page, F.comment));
      if (v !== "") throw new Error(`the comment field still holds "${v.slice(0, 40)}"`);
    });
    await ctx.check("should preserve comments after page reload", async () => {
      await addComment(page, ctx, slug, "Persistent comment");
      await page.reload({ waitUntil: "domcontentloaded" });
      for (const until = Date.now() + FIND_MS; !(await bodyText(page)).includes("Persistent comment"); await sleep(200)) if (Date.now() > until) throw new Error("the comment is gone after a reload");
    });
    await ctx.check("should handle long comments", async () => {
      const long = "This is a very long comment. ".repeat(50);
      await addComment(page, ctx, slug, long);   // shown whole, as text
    });
  },

  // comments.spec.ts › should require login to post comment
  async comment_requires_login(page) {
    const { a, slug } = await commentSetup(page);
    const bctx2 = await page.browser().createBrowserContext();
    try {
      const p2 = await bctx2.newPage();
      await p2.setViewport({ width: 1440, height: 900 });
      await go(p2, `/article/${slug}`);
      await heading(p2, a.title);
      await link(p2, /^sign in$/i);
      const f = await absent(p2, (n) => FIELD_ROLES.has(n.role) && F.comment.test(nameOf(n)));
      if (f) throw new Error(`a signed-out visitor is offered the comment field "${nameOf(f)}"`);
    } finally { await bctx2.close().catch(() => {}); }
  },

  // comments.spec.ts › should only allow comment author to delete
  async comment_author_only(page, ctx) {
    await commentSetup(page);
    const s = await state();
    await go(page, "/");
    const titles = s.articles.map((x) => x.title);
    const shown = await (async () => { for (const until = Date.now() + FIND_MS; ; await sleep(200)) { const t = await titlesShown(page, titles); if (t.length) return t; if (Date.now() > until) throw new Error("no articles on the home page"); } })();
    const art = s.articles.find((x) => x.title === shown[0]);
    await press(page, await heading(page, art.title));
    await atRoute(page, /^\/article\/.+/, "the first article");
    const theirs = s.comments.filter((c) => c.article === art.slug);
    ctx.observed.existingComments = theirs.length;
    if (theirs.length) {
      await seeText(page, theirs.at(-1).body.slice(0, 40)).catch(() => { throw new Error("the article's existing comments aren't shown"); });
      const del = await absent(page, (n) => ACTION_ROLES.has(n.role) && DELETE_COMMENT.test(nameOf(n)));
      if (del) throw new Error(`another user's comment offers "${nameOf(del)}"`);
    }
    const text = `Comment by logged in user ${Date.now()}`;
    await addComment(page, ctx, art.slug, text);
    const own = await deleteControlFor(page, ctx, text, (await state()).comments.filter((c) => c.article === art.slug).map((c) => c.body));
    if (!own) throw new Error("the user's own comment has no delete control");
  },

  // navigation.spec.ts › should navigate through main pages when logged out
  async nav_logged_out(page) {
    await go(page, "/");
    await link(page, /^conduit$/i);
    await press(page, await link(page, /^sign in$/i));
    await atRoute(page, "/login", "the Sign in link");
    await press(page, await link(page, /^sign up$/i));
    await atRoute(page, "/register", "the Sign up link");
    await press(page, await link(page, /^conduit$/i));
    await atRoute(page, "/", "the brand link");
  },

  // navigation.spec.ts › should navigate through main pages when logged in
  async nav_logged_in(page) {
    const u = newUser();
    await registerUI(page, u);
    await link(page, /^home$/i);
    await link(page, /new article/i);
    await link(page, /^settings$/i);
    await press(page, await link(page, /new article/i));
    await atRoute(page, "/editor", "the New Article link");
    await press(page, await link(page, /^settings$/i));
    await atRoute(page, "/settings", "the Settings link");
    await press(page, await profileLink(page, u.username));
    await atRoute(page, `/profile/${u.username}`, "the profile link");
  },

  // navigation.spec.ts › should filter articles by tag; url-navigation.spec.ts › /tag/:tag should
  // filter by tag, / should show Global Feed for everyone. Adapted: the spec routes no /tag/:tag
  // URL, so the tag is chosen in the sidebar; "active" is aria-current/selected, else the look
  // swapping from Global Feed to the tag's tab.
  async nav_tag_filter(page, ctx) {
    ctx.adapt("no /tag/:tag route in the spec: tag chosen from the sidebar; .active → aria or the look swapping between tabs");
    const tags = (await call("GET", "/tags")).tags;
    await ctx.check("/ should show Global Feed for everyone; /tag/:tag should filter by tag", async () => {
      await go(page, "/");
      await atRoute(page, "/", "the home page");
      const want = (await call("GET", "/articles?limit=10&offset=0")).articles.map((x) => x.title);
      await listBecomes(page, want, "the Global Feed");
      // signed out there is one tab: its look while current is the reference
      const before = await lookBefore(page, await control(page, /^global feed$/i), null);
      const t = await sidebarTag(page, ctx, new RegExp(`^#?\\s*(${tags.map(esc).join("|")})$`));
      const tag = nameOf(t.node).replace(/^#\s*/, "");
      ctx.observed.tag = tag;
      await press(page, t);
      const tagTab = () => find(page, (n) => ["link", "tab", "button", "option"].includes(n.role) && new RegExp(`^#?\\s*${esc(tag)}$`).test(nameOf(n)), { what: `a tab for the tag "${tag}"` });
      const wantTag = (await call("GET", `/articles?tag=${encodeURIComponent(tag)}&limit=10&offset=0`)).articles.map((x) => x.title);
      await listBecomes(page, wantTag, `the "${tag}" tab`);
      // the tab, not the sidebar's tag: the one before "Popular Tags"
      const ns = await nodes(page);
      const pt = ns.findIndex((n) => /popular tags/i.test(nameOf(n)));
      const tabNode = ns.find((n, i) => (pt < 0 || i < pt) && ["link", "tab", "button", "option"].includes(n.role) && new RegExp(`^#?\\s*${esc(tag)}$`).test(nameOf(n)));
      const clicked = tabNode ? { node: tabNode, handle: await elementOf(tabNode) } : await tagTab();
      await swappedFrom(page, ctx, before, { clicked, prev: await control(page, /^global feed$/i) }, `the "${tag}" tab`);
    });
    await ctx.check("should filter articles by tag", async () => {
      const u = newUser();
      await registerUI(page, u);
      const a = { ...newArticle(), tags: ["playwright-test", "automation"] };
      await createArticleUI(page, a);
      await go(page, "/");
      await press(page, await sidebarTag(page, ctx, /^#?\s*playwright-test$/));
      await find(page, (n) => ["link", "tab", "button", "option"].includes(n.role) && /^#?\s*playwright-test$/.test(nameOf(n)), { what: 'a tab for "playwright-test"' });
      await heading(page, a.title);
    });
  },

  // navigation.spec.ts › should switch between Global Feed and Your Feed; url-navigation.spec.ts ›
  // clicking Your Feed…, clicking Global Feed…, empty Your Feed shows helpful message…,
  // /?feed=following should redirect to /login when not authenticated, /?feed=following should
  // show Your Feed (authenticated), tabs should have correct href attributes. Adapted: the spec
  // routes no ?feed=following, so Your Feed is reached by its tab, "redirect when signed out" is
  // "no Your Feed tab when signed out" (templates: it "appears after logging in"), the hrefs are
  // what the tabs show, and "Your feed is empty" (wording the spec doesn't fix) is any visible
  // empty-state line with no articles listed.
  async nav_feeds(page, ctx) {
    ctx.adapt("no ?feed=following route in the spec: Your Feed by its tab; signed-out redirect → no Your Feed tab; empty-feed wording → any empty-state line; .active → aria or the look swapping");
    await ctx.check("/?feed=following … when not authenticated (no Your Feed tab)", async () => {
      await go(page, "/");
      await control(page, /^global feed$/i);
      const y = await absent(page, (n) => ACTION_ROLES.has(n.role) && /^your feed$/i.test(nameOf(n)));
      if (y) throw new Error("a signed-out visitor is offered Your Feed");
    });
    const u = newUser();
    await registerUI(page, u);
    const a = newArticle();
    await createArticleUI(page, a);
    await go(page, "/");
    const titles = (await state()).articles.map((x) => x.title);
    await ctx.check("should switch between Global Feed and Your Feed (Global Feed lists the new article)", async () => {
      await press(page, await control(page, /^global feed$/i));
      await heading(page, a.title);
    });
    await ctx.check("clicking Your Feed shows Your Feed (current); empty Your Feed shows a message", async () => {
      const before = await lookBefore(page, await control(page, /^global feed$/i), await control(page, /^your feed$/i));
      await press(page, await control(page, /^your feed$/i));
      const until = Date.now() + FIND_MS;
      while ((await titlesShown(page, titles)).length) { if (Date.now() > until) throw new Error("Your Feed of a user who follows no one lists articles"); await sleep(200); }
      await swappedFrom(page, ctx, before, { clicked: await control(page, /^your feed$/i), prev: await control(page, /^global feed$/i) }, "Your Feed");
      const msg = await maybe(seeText(page, /[^|.]{0,40}\b(no articles|empty|nothing|not following|follow (some|other)|yet)\b[^|.]{0,40}/i, 4000));
      if (!msg) throw new Error("the empty Your Feed shows no message");
      ctx.observed.emptyMessage = msg[0].trim();
    });
    await ctx.check("clicking Global Feed shows Global Feed (current)", async () => {
      const before = await lookBefore(page, await control(page, /^your feed$/i), await control(page, /^global feed$/i));
      await press(page, await control(page, /^global feed$/i));
      await heading(page, a.title);
      await atRoute(page, "/", "Global Feed");
      await swappedFrom(page, ctx, before, { clicked: await control(page, /^global feed$/i), prev: await control(page, /^your feed$/i) }, "Global Feed");
    });
  },

  // navigation.spec.ts › should display popular tags
  async nav_popular_tags(page, ctx) {
    const u = newUser();
    await registerUI(page, u);
    const a = { ...newArticle(), tags: ["popular", "trending"] };
    await createArticleUI(page, a);
    await go(page, "/");
    await sidebarTag(page, ctx, /^#?\s*popular$/);
    await sidebarTag(page, ctx, /^#?\s*trending$/);
  },

  // navigation.spec.ts › should paginate articles; url-navigation.spec.ts › Pagination: pagination
  // should update URL with ?page=N, pagination should work with /tag/:tag, tag pagination shows
  // correct articles per page, page should reset when switching feeds, pagination URL preserves
  // feed=following parameter. Adapted: the spec routes no /tag/:tag or ?page=N, so the tag is
  // chosen in the sidebar and page 2 by its link; what is judged is the articles each page shows
  // (10 a page) and which page is current (aria-current, else the look swapping). "Preserves
  // feed=following" → page 2 of Your Feed shows Your Feed's second page (jake follows four
  // people). Not ported: "should load correct page when navigating directly to ?page=N" (a URL
  // the spec doesn't define).
  async nav_pagination(page, ctx) {
    ctx.adapt("no /tag/:tag or ?page=N routes in the spec: tag from the sidebar, page 2 by its link; judged by the articles shown and the current page; direct ?page=N not ported");
    const tag = `pag${stamp()}`;
    const u = newUser();
    const token = await apiRegister(u);
    for (let i = 0; i < 15; i++) await apiArticle(token, { title: `Test Article ${tag} Number ${i}`, description: `Description for test article ${i}`, body: `Body content for test article ${i}.`, tags: [tag] });
    await signIn(page, u);
    const pageOf = async (q, offset) => (await call("GET", `/articles${q}${q.includes("?") ? "&" : "?"}limit=10&offset=${offset}`, null, q.includes("feed") ? (await call("POST", "/users/login", { user: { email: "jake@jake.jake", password: "jakejake" } })).user.token : undefined)).articles.map((x) => x.title);
    const pageLink = (n) => find(page, (x) => ["link", "button"].includes(x.role) && new RegExp(`^(page )?${n}$`, "i").test(nameOf(x)), { what: `a link to page ${n}` });
    await ctx.check("tag pagination shows correct articles per page; pagination should work with the tag", async () => {
      await go(page, "/");
      await press(page, await sidebarTag(page, ctx, new RegExp(`^#?\\s*${tag}$`)));
      await listBecomes(page, await pageOf(`?tag=${tag}`, 0), "page 1 of the tag");
      const before = await lookBefore(page, await pageLink(1), await pageLink(2));
      await press(page, await pageLink(2));
      await listBecomes(page, await pageOf(`?tag=${tag}`, 10), "page 2 of the tag (5 articles)");
      await swappedFrom(page, ctx, before, { clicked: await pageLink(2), prev: await pageLink(1) }, "page 2");
    });
    await ctx.check("page should reset when switching feeds", async () => {
      await press(page, await control(page, /^global feed$/i));
      await listBecomes(page, await pageOf("", 0), "Global Feed after page 2 of a tag");
    });
    await ctx.check("pagination preserves the feed (Your Feed's page 2)", async () => {
      await signOut(page);
      await signIn(page, { email: "jake@jake.jake", password: "jakejake", username: "jake" });
      await press(page, await control(page, /^your feed$/i));
      const want1 = await pageOf("/feed", 0), want2 = await pageOf("/feed", 10);
      await listBecomes(page, want1, "Your Feed, page 1");
      if (!want2.length) { ctx.observed.feedPages = 1; return; }
      await press(page, await pageLink(2));
      await listBecomes(page, want2, "Your Feed, page 2");
    });
  },

  // navigation.spec.ts › should navigate to article from author name
  async nav_author_link(page) {
    const u = newUser();
    await registerUI(page, u);
    const a = newArticle();
    await createArticleUI(page, a);
    await go(page, "/");
    const titles = (await state()).articles.map((x) => x.title);
    const card = await cardOf((await heading(page, a.title)).handle, titles);
    const au = await inCard(page, card, (n) => n.role === "link" && nameOf(n) === u.username);
    if (!au) throw new Error("the preview has no author link named for the author");
    await press(page, au);
    await atRoute(page, `/profile/${u.username}`, "the author's name");
  },

  // navigation.spec.ts › should show article count on profile tabs, should handle empty states
  // gracefully. The preview's favorite button is the one in the preview's card (the official:
  // `.article-preview:has-text(title) button.btn-outline-primary`).
  async nav_profile_counts(page, ctx) {
    const u = newUser();
    await registerUI(page, u);
    await ctx.check("should handle empty states gracefully", async () => {
      await go(page, `/profile/${u.username}`);
      await heading(page, u.username);
      await someContent(page, "an empty profile");
      const fav = await maybe(control(page, /favou?rited/i, { timeout: 3000 }));
      if (fav) { await press(page, fav); await sleep(600); await appShell(page, "an empty Favorited tab"); await heading(page, u.username); }
      else ctx.fallback("no Favorited tab on an empty profile");
    });
    await ctx.check("should show article count on profile tabs", async () => {
      const a1 = newArticle(); const slug1 = await createArticleUI(page, a1);
      const a2 = newArticle(); await createArticleUI(page, a2);
      await go(page, "/");
      const titles = (await state()).articles.map((x) => x.title);
      const card = await cardOf((await heading(page, a1.title)).handle, titles);
      const fb = await inCard(page, card, (n) => ["button", "togglebutton"].includes(n.role));
      if (!fb) throw new Error("the preview has no favorite button");
      await press(page, fb);
      await stored((st) => st.favorites.some((f) => f.article === slug1 && f.user === u.username), "the favorite of the first article");
      await go(page, `/profile/${u.username}`);
      await listBecomes(page, [a2.title, a1.title], "My Articles");
      await press(page, await control(page, /favou?rited/i));
      await listBecomes(page, [a1.title], "Favorited Articles");
    });
  },

  // settings.spec.ts › should update bio only, should display updated bio on profile page,
  // should preserve username in navbar after update, should allow navigation to settings again
  // after update. Adapted: getToken()/getCurrentUser() → still signed in after a reload, and the
  // settings form showing what was saved.
  async settings_bio(page, ctx) {
    ctx.adapt("getToken/getCurrentUser → signed in after a reload and the settings form showing the saved bio");
    const u = newUser();
    await registerUI(page, u);
    const bio1 = `Bio updated at ${Date.now()}`;
    await ctx.check("should update bio only", async () => {
      await go(page, "/settings");
      const un = await field(page, F.username);
      for (const until = Date.now() + 6000; (await valueOf(un)) !== u.username; await sleep(150)) if (Date.now() > until) throw new Error(`the username field reads "${await valueOf(un)}"`);
      await typeIn(page, await field(page, F.bio), bio1);
      const resp = page.waitForResponse((r) => r.url().startsWith(`${API}/user`) && r.request().method() === "PUT", { timeout: FIND_MS });
      await press(page, await button(page, /update settings/i));
      const r = await resp;
      const b = await r.json().catch(() => ({}));
      if (r.status() !== 200 || b.user?.bio !== bio1 || b.user?.username !== u.username || b.user?.email !== u.email) throw new Error(`PUT /user answered ${r.status()} ${JSON.stringify(b.user ?? b).slice(0, 160)}`);
      await atRoute(page, `/profile/${u.username}`, "after Update Settings");
      await stored((st) => st.users.find((x) => x.username === u.username)?.bio === bio1, "the bio");
      await page.reload({ waitUntil: "domcontentloaded" });
      if (await signedInAs(page, u.username) !== true) throw new Error("signed out by a reload after the update (the token was lost)");
    });
    await ctx.check("should display updated bio on profile page", async () => { await seeText(page, bio1); });
    await ctx.check("should preserve username in navbar after update", async () => { await profileLink(page, u.username); });
    await ctx.check("should allow navigation to settings again after update", async () => {
      await go(page, "/settings");
      const un = await field(page, F.username);
      for (const until = Date.now() + 6000; (await valueOf(un)) !== u.username; await sleep(150)) if (Date.now() > until) throw new Error(`the username field reads "${await valueOf(un)}"`);
      const bf = await field(page, F.bio);
      if ((await valueOf(bf)) !== bio1) throw new Error(`the bio field reads "${await valueOf(bf)}", not the saved bio`);
      const bio2 = `Second update ${Date.now()}`;
      await typeIn(page, bf, bio2);
      await press(page, await button(page, /update settings/i));
      await stored((st) => st.users.find((x) => x.username === u.username)?.bio === bio2, "the second bio");
      await atRoute(page, `/profile/${u.username}`, "after the second Update Settings");
      await go(page, "/settings");
      const bf2 = await field(page, F.bio);
      for (const until = Date.now() + 6000; (await valueOf(bf2)) !== bio2; await sleep(150)) if (Date.now() > until) throw new Error(`the settings form shows bio "${await valueOf(bf2)}" after the second update`);
    });
  },

  // settings.spec.ts › should update image only, should update bio and image together, should
  // display updated image on profile page. The image is one the service serves (the official's
  // is on the public internet); "src is the URL" is read from what the profile page draws.
  async settings_image(page, ctx) {
    const u = newUser();
    await registerUI(page, u);
    const img = `${SERVICE}/images/avatars/johndoe.svg`;
    const img2 = `${SERVICE}/images/avatars/mira_chen.svg`;
    const submit = async () => {
      const resp = page.waitForResponse((r) => r.url().startsWith(`${API}/user`) && r.request().method() === "PUT", { timeout: FIND_MS });
      await press(page, await button(page, /update settings/i));
      const r = await resp;
      return { status: r.status(), body: await r.json().catch(() => ({})) };
    };
    const profileShows = (src) => picturesWhen(page, (ps) => ps.some((p) => p.src === src && p.loaded && p.w >= 40), `the profile page doesn't show the picture ${src}`);
    await ctx.check("should update image only; should display updated image on profile page", async () => {
      await go(page, "/settings");
      const un = await field(page, F.username);
      for (const until = Date.now() + 6000; (await valueOf(un)) !== u.username; await sleep(150)) if (Date.now() > until) throw new Error(`the username field reads "${await valueOf(un)}"`);
      await typeIn(page, await field(page, F.image), img);
      const r = await submit();
      if (r.status !== 200 || r.body.user?.image !== img || r.body.user?.username !== u.username) throw new Error(`PUT /user answered ${r.status} ${JSON.stringify(r.body.user ?? r.body).slice(0, 160)}`);
      await atRoute(page, `/profile/${u.username}`, "after Update Settings");
      await profileShows(img);
      await page.reload({ waitUntil: "domcontentloaded" });
      if (await signedInAs(page, u.username) !== true) throw new Error("signed out by a reload after the update");
    });
    await ctx.check("should update bio and image together", async () => {
      await go(page, "/settings");
      const bio = `Multi-update bio ${Date.now()}`;
      const bf = await field(page, F.bio);
      for (const until = Date.now() + 6000; (await valueOf(await field(page, F.username))) !== u.username; await sleep(150)) if (Date.now() > until) throw new Error("the settings form never filled in");
      await typeIn(page, bf, bio);
      await typeIn(page, await field(page, F.image), img2);
      const r = await submit();
      if (r.status !== 200 || r.body.user?.bio !== bio || r.body.user?.image !== img2 || r.body.user?.username !== u.username || r.body.user?.email !== u.email) throw new Error(`PUT /user answered ${r.status} ${JSON.stringify(r.body.user ?? r.body).slice(0, 160)}`);
      await atRoute(page, `/profile/${u.username}`, "after Update Settings");
      await seeText(page, bio);
      await profileShows(img2);
    });
  },

  // social.spec.ts › should follow and unfollow a user. Followed state from the button's name
  // (Unfollow …) or aria-pressed, and the service's follows.
  async social_follow(page, ctx) {
    const u = newUser();
    await registerUI(page, u);
    const btn = () => find(page, (n) => ["button", "togglebutton"].includes(n.role) && FOLLOW.test(nameOf(n)), { what: "a Follow button" });
    const shows = async (want) => {
      const until = Date.now() + 6000;
      for (;;) { const b = await btn(); if (isFollowing(b.node) === want) return nameOf(b.node); if (Date.now() > until) throw new Error(`the button reads "${nameOf(b.node)}", not ${want ? "Unfollow" : "Follow"}`); await sleep(200); }
    };
    await ctx.check("follow johndoe", async () => {
      await go(page, "/profile/johndoe");
      const b = await btn();
      if (isFollowing(b.node)) throw new Error(`already shows "${nameOf(b.node)}"`);
      await press(page, b);
      await stored((st) => st.follows.some((f) => f.follower === u.username && f.following === "johndoe"), "the follow");
      ctx.observed.following = await shows(true);
    });
    await ctx.check("unfollow johndoe", async () => {
      await go(page, "/profile/johndoe");
      await press(page, await btn());
      await stored((st) => !st.follows.some((f) => f.follower === u.username && f.following === "johndoe"), "the unfollow");
      ctx.observed.unfollowed = await shows(false);
    });
  },

  // social.spec.ts › should view own profile, should view other user profile
  async social_profiles(page, ctx) {
    const u = newUser();
    await registerUI(page, u);
    await ctx.check("should view own profile", async () => {
      await press(page, await profileLink(page, u.username));
      await atRoute(page, `/profile/${u.username}`);
      await heading(page, u.username);
      await press(page, await control(page, /edit profile settings/i));
      await atRoute(page, "/settings", "Edit Profile Settings");
      await go(page, `/profile/${u.username}`);
      await heading(page, u.username);
      const f = await absent(page, (n) => ["button", "togglebutton"].includes(n.role) && FOLLOW.test(nameOf(n)));
      if (f) throw new Error(`the user's own profile offers "${nameOf(f)}"`);
    });
    await ctx.check("should view other user profile", async () => {
      await go(page, "/profile/johndoe");
      await heading(page, "johndoe");
      await button(page, FOLLOW);
      const e = await absent(page, (n) => /edit profile settings/i.test(nameOf(n)), 800);
      if (e) throw new Error("another user's profile offers Edit Profile Settings");
      const titles = (await state()).articles.filter((x) => x.author === "johndoe").map((x) => x.title);
      for (const until = Date.now() + FIND_MS; !(await titlesShown(page, titles)).length; await sleep(200)) if (Date.now() > until) throw new Error("johndoe's profile lists none of his articles");
    });
  },

  // social.spec.ts › should display user articles on profile, should display favorited articles
  // on profile
  async social_profile_articles(page, ctx) {
    const u = newUser();
    await registerUI(page, u);
    await ctx.check("should display user articles on profile", async () => {
      const a1 = newArticle(); await createArticleUI(page, a1);
      const a2 = newArticle(); await createArticleUI(page, a2);
      await go(page, `/profile/${u.username}`);
      await heading(page, a1.title);
      await heading(page, a2.title);
    });
    await ctx.check("should display favorited articles on profile", async () => {
      const s = await state();
      await go(page, "/");
      const titles = s.articles.map((x) => x.title);
      let first;
      for (const until = Date.now() + FIND_MS; !(first = (await titlesShown(page, titles)).find((t) => s.articles.find((a) => a.title === t)?.author !== u.username)); await sleep(200)) if (Date.now() > until) throw new Error("no article by someone else on the home page");
      const art = s.articles.find((x) => x.title === first);
      await press(page, await heading(page, first));
      await atRoute(page, /^\/article\/.+/);
      const fb = await find(page, (n) => ["button", "togglebutton"].includes(n.role) && FAV.test(nameOf(n)), { what: "a Favorite button" });
      if (!isFav(fb.node)) await press(page, fb);
      await stored((st) => st.favorites.some((f) => f.article === art.slug && f.user === u.username), "the favorite");
      await go(page, `/profile/${u.username}`);
      await press(page, await control(page, /favou?rited/i));
      await atRoute(page, `/profile/${u.username}/favorites`, "the Favorited tab");
      await heading(page, first);
    });
  },

  // social.spec.ts › should display followed users articles in feed
  async social_feed(page) {
    const u = newUser();
    await registerUI(page, u);
    await go(page, "/profile/johndoe");
    await press(page, await button(page, /^\W*follow\b/i));
    await stored((st) => st.follows.some((f) => f.follower === u.username && f.following === "johndoe"), "the follow");
    await go(page, "/");
    await press(page, await control(page, /^your feed$/i));
    const titles = (await state()).articles.filter((x) => x.author === "johndoe").map((x) => x.title);
    for (const until = Date.now() + FIND_MS; !(await titlesShown(page, titles)).length; await sleep(200)) if (Date.now() > until) throw new Error("Your Feed lists none of johndoe's articles after following him");
  },

  // null-fields.spec.ts › newly registered user should show default avatar on profile page /
  // in navbar / on article meta / in comment section. Adapted: `src contains default-avatar.svg`
  // → the picture drawn IS the spec's default-avatar.svg (compared pixel by pixel), for every
  // picture on pages where every picture is the new user's.
  async avatars_default(page, ctx) {
    ctx.adapt("src contains default-avatar.svg → the drawn picture is the spec's default-avatar.svg, pixel-compared");
    const u = newUser();
    await registerUI(page, u);
    await ctx.check("default avatar in navbar", async () => {
      const top = await headerBottom(page);
      await picturesWhen(page, (ps) => ps.some((p) => p.y < top && p.isDefault), "no default avatar in the header");
    });
    await ctx.check("default avatar on profile page", async () => {
      await go(page, `/profile/${u.username}`);
      await heading(page, u.username);
      await picturesWhen(page, (ps) => ps.some((p) => p.w >= 40 && p.isDefault) && ps.every((p) => p.isDefault), "the profile's pictures aren't all the default avatar");
    });
    await ctx.check("default avatar on article meta and in comment section", async () => {
      const a = newArticle();
      const slug = await createArticleUI(page, a);
      await addComment(page, ctx, slug, "Test comment for avatar check");
      const ps = await picturesWhen(page, (ps) => ps.length >= 4 && ps.every((p) => p.isDefault), "the article page's pictures (header, article meta, comment form, comment) aren't all the default avatar");
      ctx.observed.articlePictures = ps.length;
    });
  },

  // null-fields.spec.ts › setting image should display custom avatar on profile page, clearing
  // image to empty string should restore default avatar (set through the service, as the official
  // does with an external API; the image is one the service serves)
  async avatars_custom(page, ctx) {
    const img = `${SERVICE}/images/avatars/johndoe.svg`;
    await ctx.check("setting image should display custom avatar on profile page", async () => {
      const u = newUser(); const token = await apiRegister(u);
      await apiUpdateUser(token, { image: img });
      await signIn(page, u);
      await go(page, `/profile/${u.username}`);
      await heading(page, u.username);
      await picturesWhen(page, (ps) => ps.some((p) => p.w >= 40 && p.src === img), `the profile doesn't show ${img}`);
      await signOut(page);
    });
    await ctx.check("clearing image to empty string should restore default avatar", async () => {
      const u = newUser(); const token = await apiRegister(u);
      await apiUpdateUser(token, { image: img });
      await apiUpdateUser(token, { image: "" });
      await signIn(page, u);
      await go(page, `/profile/${u.username}`);
      await heading(page, u.username);
      await picturesWhen(page, (ps) => ps.some((p) => p.w >= 40 && p.isDefault), "the profile doesn't show the default avatar");
    });
  },

  // null-fields.spec.ts › null bio should not render as literal "null" on profile page, setting
  // then clearing bio should not show stale data, settings form should show empty string for null
  // image / null bio. Adapted: `.user-info p` is empty → nothing shown between the user's name and
  // the profile's controls but the name itself (no "null", no stale bio).
  async nulls_bio_fields(page, ctx) {
    const bioArea = async (username) => {
      await heading(page, username);
      await control(page, /edit profile settings|follow/i);
      return page.evaluate((name) => {
        const t = document.body.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
        const j = t.findIndex((s) => /edit profile settings|^\W*follow\b/i.test(s)), i = t.lastIndexOf(name, j);
        return i >= 0 && j > i ? t.slice(i + 1, j).join(" | ") : null;
      }, username);
    };
    await ctx.check('null bio should not render as literal "null" on profile page', async () => {
      const u = newUser();
      await registerUI(page, u);
      await go(page, `/profile/${u.username}`);
      const b = await bioArea(u.username);
      if (b === null) NOTES.add("nulls_bio_fields: couldn't place the bio between the name and the profile's controls; checked the whole page for \"null\"");
      if (/\bnull\b/.test(b ?? await bodyText(page))) throw new Error('the profile shows "null"');
      if (b) throw new Error(`a user with no bio has "${b}" under their name`);
    });
    await ctx.check("settings form should show empty string for null image / null bio", async () => {
      await go(page, "/settings");
      for (const until = Date.now() + 6000; !(await valueOf(await field(page, F.email))); await sleep(150)) if (Date.now() > until) throw new Error("the settings form never filled in");
      const im = await valueOf(await field(page, F.image)), bi = await valueOf(await field(page, F.bio));
      if (im !== "" || bi !== "") throw new Error(`with no image or bio, the fields read "${im}" and "${bi}"`);
      await signOut(page);
    });
    await ctx.check("setting then clearing bio should not show stale data", async () => {
      const u = newUser(); const token = await apiRegister(u);
      await apiUpdateUser(token, { bio: "This is a test bio" });
      await apiUpdateUser(token, { bio: "" });
      await signIn(page, u);
      await go(page, `/profile/${u.username}`);
      const b = await bioArea(u.username);
      if (/test bio|\bnull\b/.test(b ?? await bodyText(page))) throw new Error(`the cleared bio still shows ("${b}")`);
      if (b) throw new Error(`a cleared bio shows "${b}"`);
    });
  },

  // null-fields.spec.ts › author avatars should render on other user articles in feed
  async avatars_feed(page) {
    const s = await state();
    await go(page, "/");
    await press(page, await control(page, /^global feed$/i));
    const titles = s.articles.map((x) => x.title);
    let shown;
    for (const until = Date.now() + FIND_MS; (shown = await titlesShown(page, titles)).length < 2; await sleep(200)) if (Date.now() > until) throw new Error("fewer than two previews in the Global Feed");
    const authors = new Set(shown.map((t) => s.articles.find((a) => a.title === t).author));
    if (authors.size < 2) throw new Error("the feed's previews are all by one author");
    for (const t of shown) {
      const card = await cardOf((await heading(page, t)).handle, titles);
      const until = Date.now() + 2500;
      for (;;) {
        const ok = await card.evaluate((c) => [...c.querySelectorAll("img")].some((i) => i.checkVisibility() && i.complete && i.naturalWidth > 0) || [...c.querySelectorAll("div,span,a,i")].some((e) => /url\(/.test(getComputedStyle(e).backgroundImage) && e.checkVisibility()));
        if (ok) break;
        if (Date.now() > until) throw new Error(`the preview of "${t}" draws no author picture`);
        await sleep(100);
      }
    }
  },

  // xss-security.spec.ts › XSS Security - Image URL Injection: the five payloads on the profile,
  // the navbar, the comments. Signed in through the form (the official injects a token).
  async xss_images(page, ctx) {
    ctx.adapt("signed in through the form, not a token injected into localStorage; executable payloads looked for anywhere in the page, not under .user-img");
    let fired = 0;
    page.on("dialog", async (d) => { fired++; await d.dismiss().catch(() => {}); });
    const u = newUser(); const token = await apiRegister(u);
    await signIn(page, u);
    const PAYLOADS = [
      ["onerror attribute injection", 'https://example.com/img.jpg"onerror="alert(1)'],
      ["onerror with javascript protocol", 'https://example.com/img.jpg"onerror="javascript:alert(document.cookie)'],
      ["onload attribute injection", 'https://example.com/img.jpg"onload="alert(1)'],
      ["javascript protocol in src", "javascript:alert(1)"],
      ["data URI with script", "data:text/html,<script>alert(1)</script>"],
    ];
    for (const [name, payload] of PAYLOADS) {
      await ctx.check(`should prevent XSS via ${name}`, async () => {
        await apiUpdateUser(token, { image: payload });
        fired = 0;
        await go(page, `/profile/${u.username}`);
        await heading(page, u.username);
        await sleep(1500);
        if (fired) throw new Error("an alert fired");
        const bad = await executable(page);
        if (bad) throw new Error(`the page holds an executable payload: ${bad}`);
        await picturesWhen(page, (ps) => ps.some((p) => p.w >= 40), "the profile shows no picture");
      });
    }
    await ctx.check("should safely render malicious payload in navbar image", async () => {
      await apiUpdateUser(token, { image: 'https://x.com/img.jpg"onerror="alert(document.cookie)' });
      fired = 0;
      await go(page, "/"); await sleep(1000);
      await go(page, "/settings"); await sleep(1000);
      if (fired) throw new Error("an alert fired");
      const bad = await executable(page);
      if (bad) throw new Error(`the page holds an executable payload: ${bad}`);
    });
    await ctx.check("should safely render malicious payload in article comments", async () => {
      await apiUpdateUser(token, { image: 'https://x.com/img.jpg"onerror="alert(1)' });
      fired = 0;
      await go(page, "/");
      const titles = (await state()).articles.map((x) => x.title);
      let first;
      for (const until = Date.now() + FIND_MS; !(first = (await titlesShown(page, titles))[0]); await sleep(200)) if (Date.now() > until) throw new Error("no articles on the home page");
      await press(page, await heading(page, first));
      await atRoute(page, /^\/article\//);
      await sleep(1500);
      if (fired) throw new Error("an alert fired");
      const bad = await executable(page);
      if (bad) throw new Error(`the page holds an executable payload: ${bad}`);
    });
  },

  // xss-security.spec.ts › Article Description in Feed (3) and Article Body Markdown (6)
  async xss_content(page, ctx) {
    ctx.adapt("signed in through the form; `.article-preview p`/`.article-content` → the page's text and the whole page's markup");
    let fired = 0;
    page.on("dialog", async (d) => { fired++; await d.dismiss().catch(() => {}); });
    const u = newUser(); const token = await apiRegister(u);
    await signIn(page, u);
    const DESC = [["script tag", "<script>alert(1)</script>"], ["img onerror", '<img src=x onerror="alert(1)">'], ["svg onload", '<svg onload="alert(1)">']];
    for (const [name, payload] of DESC) {
      await ctx.check(`should sanitize ${name} in article description`, async () => {
        const title = `XSS Desc Test ${stamp()}`;
        await apiArticle(token, { title, description: `Before: ${payload} After`, body: "Normal body content" });
        fired = 0;
        await go(page, `/profile/${u.username}`);
        await heading(page, title);
        await sleep(1500);
        if (fired) throw new Error("an alert fired");
        await seeText(page, "Before:", 3000).catch(() => { throw new Error('the description\'s text ("Before: …") isn\'t shown'); });
        const bad = await executable(page);
        if (bad) throw new Error(`the page holds an executable payload: ${bad}`);
      });
    }
    const BODY = [["script tag", "<script>alert(1)</script>"], ["img onerror", '<img src=x onerror="alert(1)">'], ["svg onload", '<svg onload="alert(1)">'], ["iframe srcdoc", '<iframe srcdoc="<script>alert(1)</script>">'], ["anchor javascript href", '<a href="javascript:alert(1)">click me</a>'], ["event handler in div", '<div onmouseover="alert(1)">hover me</div>']];
    for (const [name, payload] of BODY) {
      await ctx.check(`should sanitize ${name} in article body`, async () => {
        const title = `XSS Test ${stamp()}`;
        const slug = await apiArticle(token, { title, description: "Testing XSS protection", body: `Before payload: ${payload} After payload` });
        fired = 0;
        await go(page, `/article/${slug}`);
        await heading(page, title);
        await seeText(page, "Before payload:", 4000).catch(() => { throw new Error("the article's body isn't shown"); });
        await sleep(1500);
        if (fired) throw new Error("an alert fired");
        const bad = await executable(page);
        if (bad) throw new Error(`the page holds an executable payload: ${bad}`);
      });
    }
  },

  // error-handling.spec.ts › 400 on login / registration with validation errors; Network Errors ›
  // error message on login / register form when network fails. Adapted: "Unable to connect"
  // (wording the spec doesn't fix) → any error line.
  async errors_auth_forms(page, ctx) {
    ctx.adapt('.error-messages → a new error line; "Unable to connect" wording → any error line');
    const net = await mockApi(page);
    await ctx.check("should handle 400 on login with validation errors", async () => {
      net.set([{ when: /^POST \/users\/login$/, act: json(400, { errors: { "email or password": ["is invalid"] } }) }]);
      await go(page, "/login");
      await typeIn(page, await field(page, F.email), "test@test.com");
      await typeIn(page, await field(page, F.password), "password");
      const before = await lines(page);
      await press(page, await button(page, /^sign in$/i));
      ctx.observed.login400 = await errorAppears(page, before, "a 400 on sign in");
      await atRoute(page, "/login");
      await field(page, F.email);
    });
    await ctx.check("should handle 400 on registration with validation errors", async () => {
      net.set([{ when: /^POST \/users$/, act: json(400, { errors: { email: ["is already taken"], username: ["is too short (minimum is 3 characters)"] } }) }]);
      await go(page, "/register");
      await typeIn(page, await field(page, F.username), "ab");
      await typeIn(page, await field(page, F.email), "taken@test.com");
      await typeIn(page, await field(page, F.password), "password123");
      const before = await lines(page);
      await press(page, await button(page, /^sign up$/i));
      ctx.observed.register400 = await errorAppears(page, before, "a 400 on sign up");
      await atRoute(page, "/register");
      await field(page, F.email);
    });
    await ctx.check("should show error message on login form when network fails", async () => {
      net.set([{ when: /^POST \/users\/login$/, act: { abort: "InternetDisconnected" } }]);
      await go(page, "/login");
      await typeIn(page, await field(page, F.email), "test@example.com");
      await typeIn(page, await field(page, F.password), "password123");
      const before = await lines(page);
      await press(page, await button(page, /^sign in$/i));
      ctx.observed.loginNetwork = await errorAppears(page, before, "sign in with the network down");
      await button(page, /^sign in$/i);
    });
    await ctx.check("should show error message on register form when network fails", async () => {
      net.set([{ when: /^POST \/users$/, act: { abort: "InternetDisconnected" } }]);
      await go(page, "/register");
      await typeIn(page, await field(page, F.username), "testuser");
      await typeIn(page, await field(page, F.email), "test@example.com");
      await typeIn(page, await field(page, F.password), "password123");
      const before = await lines(page);
      await press(page, await button(page, /^sign up$/i));
      ctx.observed.registerNetwork = await errorAppears(page, before, "sign up with the network down");
      await button(page, /^sign up$/i);
    });
  },

  // error-handling.spec.ts › 400 on article creation; 403 when updating article; Network Errors ›
  // create / update article form when network fails. Adapted: signed in for real through the
  // form (the official fakes a token and mocks GET /user); the mocked article's author is that user.
  async errors_editor(page, ctx) {
    ctx.adapt("signed in through the form instead of a fake token + mocked GET /user; .error-messages → a new error line; 'Unable to connect' → any error line");
    const u = newUser(); await apiRegister(u);
    const net = await mockApi(page);
    await signIn(page, u);
    const art = mockArticle(u.username);
    const openEdit = async () => {
      await go(page, "/editor/test-article");
      const t = await field(page, F.title);
      for (const until = Date.now() + FIND_MS; (await valueOf(t)) !== "Test Article"; await sleep(150)) if (Date.now() > until) throw new Error(`the editor's title reads "${await valueOf(t)}", not the article's`);
    };
    await ctx.check("should handle 400 on article creation", async () => {
      net.set([{ when: /^POST \/articles$/, act: json(400, { errors: { title: ["can't be blank"], body: ["can't be blank"] } }) }]);
      await go(page, "/editor");
      await typeIn(page, await field(page, F.description), "desc");
      const before = await lines(page);
      await press(page, await button(page, /^publish/i));
      ctx.observed.create400 = await errorAppears(page, before, "a 400 on publish");
      await field(page, F.title);
    });
    await ctx.check("should show error message on create article form when network fails", async () => {
      net.set([{ when: /^POST \/articles$/, act: { abort: "InternetDisconnected" } }]);
      await go(page, "/editor");
      await typeIn(page, await field(page, F.title), "Test Article");
      await typeIn(page, await field(page, F.description), "Test description");
      await typeIn(page, await field(page, F.body), "Test body content");
      const before = await lines(page);
      await press(page, await button(page, /^publish( article)?$/i));
      ctx.observed.createNetwork = await errorAppears(page, before, "publish with the network down");
      await button(page, /^publish( article)?$/i);
    });
    await ctx.check("should handle 403 when updating article", async () => {
      net.set([{ when: /^GET \/articles\/test-article$/, act: json(200, { article: art }) }, { when: /^PUT \/articles\/test-article$/, act: json(403, { errors: { message: ["You are not authorized to edit this article"] } }) }]);
      await openEdit();
      const before = await lines(page);
      await press(page, await button(page, /^publish/i));
      ctx.observed.update403 = await errorAppears(page, before, "a 403 on publishing an edit");
      await field(page, F.title);
    });
    await ctx.check("should show error message on update article form when network fails", async () => {
      net.set([{ when: /^GET \/articles\/test-article$/, act: json(200, { article: art }) }, { when: /^PUT \/articles\/test-article$/, act: { abort: "InternetDisconnected" } }]);
      await openEdit();
      const before = await lines(page);
      await press(page, await button(page, /^publish( article)?$/i));
      ctx.observed.updateNetwork = await errorAppears(page, before, "publishing an edit with the network down");
      await button(page, /^publish( article)?$/i);
    });
  },

  // error-handling.spec.ts › 401 when submitting settings form; 500 when submitting settings;
  // error message on settings form when network fails
  async errors_settings(page, ctx) {
    ctx.adapt("signed in through the form instead of a fake token + mocked GET /user; .error-messages → a new error line; 'Unable to connect' → any error line");
    const u = newUser(); await apiRegister(u);
    const net = await mockApi(page);
    await signIn(page, u);
    const open = async () => { await go(page, "/settings"); const e = await field(page, F.email); for (const until = Date.now() + 6000; !(await valueOf(e)); await sleep(150)) if (Date.now() > until) throw new Error("the settings form never filled in"); };
    await ctx.check("should handle 401 when submitting settings form", async () => {
      net.set([{ when: /^PUT \/user$/, act: json(401, { errors: { message: ["Session expired"] } }) }]);
      await open();
      const before = await lines(page);
      await press(page, await button(page, /update settings/i));
      ctx.observed.settings401 = await errorAppears(page, before, "a 401 on Update Settings");
      await field(page, F.email);
    });
    await ctx.check("should handle 500 when submitting settings", async () => {
      net.set([{ when: /^PUT \/user$/, act: json(500, { errors: { server: ["Failed to save settings"] } }) }]);
      if (await signedInAs(page, u.username) !== true) { await ensureSignedIn(page, net, u); net.set([{ when: /^PUT \/user$/, act: json(500, { errors: { server: ["Failed to save settings"] } }) }]); ctx.fallback("signed in again after the 401 (the app signed out on it)"); }
      await open();
      await press(page, await button(page, /update settings/i));
      await sleep(800);
      await appShell(page, "a 500 on Update Settings");
      await field(page, F.email);
    });
    await ctx.check("should show error message on settings form when network fails", async () => {
      net.set([{ when: /^PUT \/user$/, act: { abort: "InternetDisconnected" } }]);
      await open();
      const before = await lines(page);
      await press(page, await button(page, /update settings/i));
      ctx.observed.settingsNetwork = await errorAppears(page, before, "Update Settings with the network down");
      await button(page, /update settings/i);
    });
  },

  // error-handling.spec.ts › 401 when posting a comment; 403 when deleting another users comment;
  // error message when adding comment fails due to network; network error when favoriting article;
  // 500 / network error on article detail load; 404 for non-existent article. `.article-content`
  // visible → the article's body text shown; `.article-page` visible → the page isn't blank.
  async errors_article(page, ctx) {
    ctx.adapt("signed in through the form; .article-content → the body text shown; .article-page → content between header and footer; .error-messages → a new error line");
    const net = await mockApi(page);
    await ctx.check("should handle 500 on article detail load", async () => {
      net.set([{ when: /^GET \/articles\/some-article$/, act: json(500, { errors: { server: ["Failed to fetch article"] } }) }]);
      await go(page, "/article/some-article");
      await appShell(page, "a 500 on the article"); await someContent(page, "a 500 on the article");
    });
    await ctx.check("should handle network error on article detail load", async () => {
      net.set([{ when: /^GET \/articles\/some-article$/, act: { abort: "InternetDisconnected" } }]);
      await go(page, "/article/some-article");
      await appShell(page, "the article with the network down"); await someContent(page, "the article with the network down");
    });
    await ctx.check("should handle 404 for non-existent article", async () => {
      net.set([{ when: /^GET \/articles\/non-existent-slug$/, act: json(404, { errors: { article: ["not found"] } }) }]);
      await go(page, "/article/non-existent-slug");
      await appShell(page, "a 404 article"); await someContent(page, "a 404 article");
    });
    const u = newUser(); await apiRegister(u);
    net.set([]);
    await signIn(page, u);
    const other = mockArticle("otheruser");
    const articleRules = (comments, extra = []) => [...extra, { when: /^GET \/articles\/test-article$/, act: json(200, { article: other }) }, { when: /^GET \/articles\/test-article\/comments$/, act: json(200, { comments }) }];
    await ctx.check("should handle 401 when posting a comment", async () => {
      net.set(articleRules([], [{ when: /^POST \/articles\/test-article\/comments$/, act: json(401, { errors: { message: ["You must be logged in"] } }) }]));
      await go(page, "/article/test-article");
      await appShell(page);
      await seeText(page, "Test body").catch(() => { throw new Error("the article's body isn't shown"); });
    });
    await ctx.check("should handle 403 when deleting another users comment", async () => {
      const mine = { id: 1, body: "This is a comment", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), author: { username: u.username, bio: "", image: "", following: false } };
      net.set(articleRules([mine], [{ when: /^DELETE \/articles\/test-article\/comments\/1$/, act: json(403, { errors: { message: ["You are not authorized to delete this comment"] } }) }]));
      await go(page, "/article/test-article");
      await seeText(page, "This is a comment");
      const del = await deleteControlFor(page, ctx, "This is a comment");
      if (!del) throw new Error("the comment shows no delete control");
      const before = await lines(page);
      await press(page, del);
      ctx.observed.deleteComment403 = await errorAppears(page, before, "a 403 on deleting a comment");
      await seeText(page, "This is a comment", 2000).catch(() => { throw new Error("the comment vanished although the delete was refused"); });
      await seeText(page, "Test body", 2000).catch(() => { throw new Error("the article's body isn't shown"); });
    });
    await ctx.check("should show error message when adding comment fails due to network", async () => {
      net.set(articleRules([], [{ when: /^POST \/articles\/test-article\/comments$/, act: { abort: "InternetDisconnected" } }]));
      await go(page, "/article/test-article");
      await typeIn(page, await field(page, F.comment), "Test comment");
      const before = await lines(page);
      await press(page, await button(page, /post comment/i));
      ctx.observed.commentNetwork = await errorAppears(page, before, "posting a comment with the network down");
      await seeText(page, "Test body", 2000).catch(() => { throw new Error("the article's body isn't shown"); });
    });
    await ctx.check("should handle network error when favoriting article", async () => {
      net.set(articleRules([], [{ when: /^(POST|DELETE) \/articles\/test-article\/favorite$/, act: { abort: "InternetDisconnected" } }]));
      await go(page, "/article/test-article");
      await press(page, await find(page, (n) => ["button", "togglebutton"].includes(n.role) && FAV.test(nameOf(n)), { what: "a Favorite button" }));
      await sleep(800);
      await find(page, (n) => ["button", "togglebutton"].includes(n.role) && FAV.test(nameOf(n)), { what: "the Favorite button after the failure" });
      await seeText(page, "Test body", 2000).catch(() => { throw new Error("the article's body isn't shown"); });
    });
  },

  // error-handling.spec.ts › 403 when following user you are blocked by; network error when
  // following user; 500 / network error on user profile load; 404 for non-existent profile
  async errors_profile(page, ctx) {
    ctx.adapt("signed in through the form; .user-info/.profile-page → the user's name heading / content between header and footer");
    const net = await mockApi(page);
    for (const [name, rule, path] of [
      ["should handle 500 on user profile load", { when: /^GET \/profiles\/[^/]+$/, act: json(500, { errors: { server: ["Failed to fetch profile"] } }) }, "/profile/someuser"],
      ["should handle network error on user profile load", { when: /^GET \/profiles\/[^/]+$/, act: { abort: "InternetDisconnected" } }, "/profile/someuser"],
      ["should handle 404 for non-existent profile", { when: /^GET \/profiles\/nonexistentuser$/, act: json(404, { errors: { profile: ["not found"] } }) }, "/profile/nonexistentuser"],
    ]) {
      await ctx.check(name, async () => { net.set([rule]); await go(page, path); await appShell(page, name); await someContent(page, name); });
    }
    const u = newUser(); await apiRegister(u);
    net.set([]);
    await signIn(page, u);
    for (const [name, who, act] of [
      ["should handle 403 when following user you are blocked by", "blockeduser", json(403, { errors: { message: ["You cannot follow this user"] } })],
      ["should handle network error when following user", "otheruser", { abort: "InternetDisconnected" }],
    ]) {
      await ctx.check(name, async () => {
        net.set([
          { when: new RegExp(`^(POST|DELETE) /profiles/${who}/follow$`), act },
          { when: new RegExp(`^GET /profiles/${who}$`), act: json(200, { profile: { username: who, bio: "This user blocked you", image: "", following: false } }) },
          { when: new RegExp(`^GET /articles\\?.*author=${who}`), act: json(200, { articles: [], articlesCount: 0 }) },
        ]);
        await go(page, `/profile/${who}`);
        await press(page, await button(page, /^\W*follow\b/i));
        await sleep(800);
        const b = await button(page, FOLLOW);
        if (isFollowing(b.node)) throw new Error(`after the failed follow the button reads "${nameOf(b.node)}"`);
        await heading(page, who);
      });
    }
  },

  // error-handling.spec.ts › 500 on articles feed load; 500 / network error on tags load;
  // intermittent 500; network timeout; connection refused; malformed JSON; empty response body.
  // `.banner` → the "conduit" heading; `.feed-toggle` → the Global Feed tab.
  async errors_home(page, ctx) {
    const net = await mockApi(page);
    const empty = json(200, { articles: [], articlesCount: 0 });
    const cases = [
      ["should handle 500 on articles feed load", [{ when: /^GET \/articles(\?|$)/, act: json(500, { errors: { server: ["Internal server error"] } }) }], false],
      ["should handle 500 on tags load", [{ when: /^GET \/articles(\?|$)/, act: empty }, { when: /^GET \/tags$/, act: json(500, { errors: { server: ["Database connection failed"] } }) }], true],
      ["should handle network error on tags load", [{ when: /^GET \/articles(\?|$)/, act: empty }, { when: /^GET \/tags$/, act: { abort: "InternetDisconnected" } }], true],
      ["should handle intermittent 500 errors gracefully", [{ when: /^GET \/articles(\?|$)/, act: (req, n) => (n === 1 ? json(500, { errors: { server: ["Temporary failure"] } }) : empty) }], false],
      ["should handle network timeout", [{ when: /^GET \/articles(\?|$)/, act: { abort: "TimedOut" } }], false],
      ["should handle connection refused", [{ when: /^GET \/articles(\?|$)/, act: { abort: "ConnectionRefused" } }], false],
      ["should handle malformed JSON response", [{ when: /^GET \/articles(\?|$)/, act: json(200, "{ invalid json }}}") }], false],
      ["should handle empty response body", [{ when: /^GET \/articles(\?|$)/, act: json(204, "") }], false],
    ];
    for (const [name, rules, toggle] of cases) {
      await ctx.check(name, async () => {
        net.set(rules.map((r) => ({ ...r, n: 0 })));
        await go(page, "/");
        await appShell(page, name);
        await banner(page, name);
        if (toggle) await control(page, /^global feed$/i).catch(() => { throw new Error(`${name}: no Global Feed tab`); });
      });
    }
  },

  // user-fetch-errors.spec.ts › 4XX (should logout): 400, 401, 403, 404 on /api/user. Adapted:
  // the token is the app's own (signed in through the form); "token cleared" (read through the
  // debug interface) → with the network restored, a reload stays signed out.
  async user_fetch_4xx(page, ctx) {
    ctx.adapt("token from signing in through the form; getToken()==null → a reload with the network restored stays signed out");
    const u = newUser(); await apiRegister(u);
    const net = await mockApi(page);
    for (const [status, body] of [[400, { errors: { request: ["is malformed"] } }], [401, { errors: { message: ["Token is invalid or expired"] } }], [403, { errors: { message: ["Access forbidden"] } }], [404, { errors: { user: ["not found"] } }]]) {
      await ctx.check(`should handle ${status} on /api/user`, async () => {
        await ensureSignedIn(page, net, u);
        net.set([{ when: /^GET \/user$/, act: json(status, body) }]);
        await page.reload({ waitUntil: "domcontentloaded" });
        await appShell(page, `a ${status} on /api/user`);
        await signedOut(page, `a ${status} on /api/user`);
        if (status === 401) {
          const titles = (await state()).articles.map((x) => x.title);
          for (const until = Date.now() + FIND_MS; !(await titlesShown(page, titles)).length; await sleep(200)) if (Date.now() > until) throw new Error("a 401 on /api/user broke the article list");
        }
        net.set([]);
        await page.reload({ waitUntil: "domcontentloaded" });
        if (await signedInAs(page, u.username) === true) throw new Error(`the token was kept after a ${status} (a reload with the network restored signs the user back in)`);
      });
    }
  },

  // user-fetch-errors.spec.ts › 5XX (should enter unavailable mode): 500; browsing in unavailable
  // mode and keeping the token across reloads; network timeout; network failure; empty response;
  // malformed JSON. Adapted: "Connecting" (wording the spec doesn't fix) isn't required; what is
  // judged is the app still standing and the token kept (a reload with the network restored comes
  // back signed in).
  async user_fetch_5xx(page, ctx) {
    ctx.adapt('token from the form; getToken()!=null → a reload with the network restored comes back signed in; "Connecting" text recorded, not required');
    const u = newUser(); await apiRegister(u);
    const net = await mockApi(page);
    const kept = async (what) => {
      net.set([]);
      await page.reload({ waitUntil: "domcontentloaded" });
      if (await signedInAs(page, u.username) !== true) throw new Error(`${what}: the token was dropped (a reload with the network restored is signed out)`);
    };
    const cases = [
      ["should handle 500 Internal Server Error on /api/user", json(500, { errors: { server: ["Internal server error"] } }), true],
      ["should handle network timeout on /api/user", { abort: "TimedOut" }, true],
      ["should handle network failure on /api/user", { abort: "ConnectionRefused" }, true],
      ["should handle empty response on /api/user", json(200, ""), false],
      ["should handle malformed JSON on /api/user", json(200, "{ not valid json }}}}"), true],
    ];
    await signIn(page, u);
    for (const [name, act, keep] of cases) {
      await ctx.check(name, async () => {
        await ensureSignedIn(page, net, u);
        net.set([{ when: /^GET \/user$/, act }]);
        await page.reload({ waitUntil: "domcontentloaded" });
        await appShell(page, name);
        const conn = await maybe(seeText(page, /[^|]{0,30}\b(connecting|reconnect|offline|unavailable|can'?t reach|retry)\b[^|]{0,30}/i, 1500));
        if (conn) ctx.observed[`status: ${name}`] = conn[0].trim();
        if (keep) await kept(name);
      });
    }
    await ctx.check("should allow browsing app in unavailable mode and persist token across reloads", async () => {
      await ensureSignedIn(page, net, u);
      net.set([{ when: /^GET \/user$/, act: json(500, { errors: { server: ["Internal server error"] } }) }]);
      await page.reload({ waitUntil: "domcontentloaded" });
      await control(page, /^global feed$/i);
      const t = await maybe(sidebarTag(page, ctx, /^#?\s*[a-z]/i, 4000));
      if (t) { await press(page, t); await appShell(page); }
      await press(page, await link(page, /^home$/i));
      await control(page, /^global feed$/i);
      await page.reload({ waitUntil: "domcontentloaded" });
      await control(page, /^global feed$/i);
      await kept("browsing while /api/user fails");
    });
  },

  // user-fetch-errors.spec.ts › Protected Routes: redirect from /settings and /editor on 401;
  // 500 / network error on loading /settings
  async user_fetch_protected(page, ctx) {
    ctx.adapt("the token is the app's own, from signing in through the form");
    const u = newUser(); await apiRegister(u);
    const net = await mockApi(page);
    for (const [name, path, act, leaves] of [
      ["should redirect from /settings on 401", "/settings", json(401, { errors: { message: ["Unauthorized"] } }), true],
      ["should redirect from /editor on 401", "/editor", json(401, { errors: { message: ["Unauthorized"] } }), true],
      ["should handle 500 on loading /settings gracefully", "/settings", json(500, { errors: { server: ["Internal error"] } }), false],
      ["should handle network error on /settings gracefully", "/settings", { abort: "InternetDisconnected" }, false],
    ]) {
      await ctx.check(name, async () => {
        await ensureSignedIn(page, net, u);
        net.set([{ when: /^GET \/user$/, act }]);
        await go(page, path);
        await appShell(page, name);
        if (leaves) { await sleep(1200); if (routeOf(page) === path) throw new Error(`${name}: still at ${path}`); ctx.observed[name] = routeOf(page); }
        else await someContent(page, name);
      });
    }
  },
};

// ── comments (helpers/comments.ts) ──────────────────────────────────────────
const DELETE_COMMENT = /delete|remove|trash|^×$|^✕$/i;
async function commentSetup(page) {
  const u = newUser();
  await registerUI(page, u);
  const a = newArticle();
  const slug = await createArticleUI(page, a);
  return { u, a, slug };
}
async function addComment(page, ctx, slug, text) {
  const before = (await state()).comments.filter((c) => c.article === slug).length;
  const f = await field(page, F.comment);
  await typeIn(page, f, text);
  await press(page, await button(page, /post comment/i));
  await stored((st) => st.comments.filter((c) => c.article === slug).length === before + 1 && st.comments.some((c) => c.article === slug && c.body === text), `the comment "${text.slice(0, 30)}"`);
  // shown as text on the page (not still sitting in the field, whose value the tree also carries)
  const want = text.replace(/\s+/g, " ").trim();
  for (const until = Date.now() + 6000; !(await bodyText(page)).includes(want); await sleep(200)) if (Date.now() > until) throw new Error(`the comment "${text.slice(0, 30)}" isn't shown${text.length > 200 ? " whole" : ""}`);
}
// The delete control of the comment with this text: the first control named for deleting after
// its text, before the next comment's text (the official: `.card:has(text) .mod-options i.ion-trash-a`)
async function deleteControlFor(page, ctx, text, others = [], timeout = 4000) {
  const until = Date.now() + timeout;
  const norm = (x) => x.replace(/\s+/g, " ").trim();
  const otherSet = new Set(others.map(norm).filter((x) => x !== norm(text)));
  for (;;) {
    const ns = await nodes(page);
    const at = ns.findIndex((n) => n.role === "StaticText" && nameOf(n) === norm(text));
    if (at >= 0) {
      for (const n of ns.slice(at + 1)) {
        if (n.role === "StaticText" && otherSet.has(nameOf(n))) break;   // the next comment's text
        if (ACTION_ROLES.has(n.role) && DELETE_COMMENT.test(nameOf(n))) { const h = await elementOf(n); if (h) return { node: n, handle: h }; }
      }
    }
    if (Date.now() > until) return null;
    await sleep(200);
  }
}
async function deleteComment(page, ctx, slug, text) {
  const del = await deleteControlFor(page, ctx, text, (await state()).comments.filter((c) => c.article === slug).map((c) => c.body));
  if (!del) throw new Error(`the comment "${text}" shows no delete control`);
  await press(page, del);
  await stored((st) => !st.comments.some((c) => c.article === slug && c.body === text), `the deletion of "${text}"`);
  await gone(page, (n) => n.role === "StaticText" && nameOf(n) === text, `the deleted comment "${text}" is still shown`);
}
// Executable payloads anywhere in the page: an inline handler or javascript: URL that calls
// alert, a script or srcdoc carrying one
const executable = (page) => page.evaluate(() => {
  for (const e of document.querySelectorAll("*")) {
    for (const a of e.attributes) {
      if (/^on/i.test(a.name) && /alert/.test(a.value)) return `<${e.tagName.toLowerCase()} ${a.name}="${a.value.slice(0, 40)}">`;
      if (/^(href|src|action|formaction|srcdoc|data)$/i.test(a.name) && /^\s*javascript:|<script/i.test(a.value) && /alert/.test(a.value) && !(e.tagName === "IMG" && a.name === "src")) return `<${e.tagName.toLowerCase()} ${a.name}="${a.value.slice(0, 40)}">`;
    }
    if (e.tagName === "SCRIPT" && /alert\(/.test(e.textContent)) return "<script>alert(…)</script>";
  }
  return null;
});
// Which one is current, before and after a click: the clicked control is now marked (aria-current
// / aria-selected / aria-pressed) and the previous one isn't; or, with no such marker, the clicked
// one now looks as the previous one looked while it was current, and the previous one no longer
// does (as the other looked, when there was one to compare). `before`: { curLook, otherLook }
// taken before the click; `after`: { clicked, prev } handles found again after it.
async function lookBefore(page, cur, other) {
  await page.mouse.move(1, 1);
  await sleep(250);
  return { curLook: await styleSig(cur.handle), otherLook: other ? await styleSig(other.handle) : null, curAria: await ariaCurrent(cur.handle), otherAria: other ? await ariaCurrent(other.handle) : null };
}
async function swappedFrom(page, ctx, before, after, label) {
  const ca = await ariaCurrent(after.clicked.handle), pa = await ariaCurrent(after.prev.handle);
  if (ca !== null || pa !== null || before.curAria !== null || before.otherAria !== null) {
    if (ca === true && pa !== true) return "aria";
    throw new Error(`${label}: not marked current after the click (aria-current/selected: clicked ${ca}, previous ${pa})`);
  }
  await page.mouse.move(1, 1);
  await sleep(250);
  const sc = await styleSig(after.clicked.handle), sp = await styleSig(after.prev.handle);
  const ok = before.curLook && sc === before.curLook && sp !== before.curLook && (before.otherLook === null || (before.otherLook !== before.curLook && sp === before.otherLook));
  if (ok) { ctx.fallback(`${label}: current shown by its look (no aria-current/aria-selected)`); return "style"; }
  throw new Error(`${label}: the clicked one doesn't look current, or the previous one still does (no aria-current/selected; the looks didn't swap)`);
}
// Gone: absent from the tree within the timeout (what was shown may take a moment to go)
async function gone(page, test, what, timeout = 5000) {
  const until = Date.now() + timeout;
  for (;;) {
    const hit = (await nodes(page)).find(test);
    if (!hit) return;
    if (Date.now() > until) throw new Error(`${what} (still shown: "${nameOf(hit).slice(0, 60)}")`);
    await sleep(200);
  }
}

// ── run ─────────────────────────────────────────────────────────────────────
if (await listening(PORT)) { console.error(`refusing to start: port ${PORT} is already in use (${whoListens(PORT)}); this drive starts its own service there and never stops a process it didn't start`); process.exit(2); }
const browser = await launchChrome({ executablePath: CHROME, headless: !args.includes("--headful"), args: ["--no-sandbox"] });
const results = [];
const RUN_T0 = Date.now();
const SCENARIO_MS = 75000;   // a stuck app fails fast: each find gives up after 10 s
const RUN_MS = 480000;       // the whole run stays under eight minutes
for (const [name, run] of Object.entries(SCENARIOS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const ctx = {
    fallbacks: [], adaptations: [], observed: {}, checks: [],
    fallback(s) { if (!this.fallbacks.includes(s)) this.fallbacks.push(s); },
    adapt(s) { this.adaptations.push(s); },
    // one ported test: its own verdict; `pre` runs first, outside the verdict
    async check(test, fn, pre) {
      const t0 = Date.now();
      try { if (pre) await pre(); await fn(); this.checks.push({ test, pass: true, ms: Date.now() - t0 }); }
      catch (e) { this.checks.push({ test, pass: false, reason: e.message, ms: Date.now() - t0 }); }
    },
  };
  const t0 = Date.now();
  let error = null, page = null, bctx = null;
  try {
    if (Date.now() - RUN_T0 > RUN_MS) throw new Error(`not run: the whole run's ${RUN_MS / 60000} minutes were spent`);
    await startService();
    bctx = await browser.createBrowserContext();
    page = await bctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.setDefaultTimeout(FIND_MS);
    page.on("pageerror", (e) => NOTES.add(`${name}: page error: ${String(e.message).slice(0, 160)}`));
    const going = run(page, ctx);
    going.catch(() => {});   // a scenario that timed out may still fail later, on a closed page
    await Promise.race([going, sleep(SCENARIO_MS).then(() => { throw new Error(`timed out after ${SCENARIO_MS / 1000} s`); })]);
    const failed = ctx.checks.filter((c) => !c.pass);
    if (failed.length) error = failed.map((c) => `${c.test}: ${c.reason}`).join(" ‖ ");
  } catch (e) {
    if (e.refuse) { console.error(`refusing to go on: ${e.message}`); await browser.close(); process.exit(2); }
    error = e.message;
    const failed = ctx.checks.filter((c) => !c.pass);
    if (failed.length) error += ` ‖ ${failed.map((c) => `${c.test}: ${c.reason}`).join(" ‖ ")}`;
  }
  if (page) await page.screenshot({ path: join(OUT, `${name}.png`) }).catch(() => {});
  if (bctx) await bctx.close().catch(() => {});
  await stopService();
  const r = { name, pass: !error, reason: error ?? "met", ms: Date.now() - t0, checks: ctx.checks, adaptations: ctx.adaptations, fallbacks: ctx.fallbacks, observed: ctx.observed, screenshot: join(OUT, `${name}.png`) };
  results.push(r);
  console.log(`${error ? "FAIL" : "PASS"}  ${name}  (${(r.ms / 1000).toFixed(1)} s)${ctx.checks.length ? `  [${ctx.checks.filter((c) => c.pass).length}/${ctx.checks.length} checks]` : ""}${error ? ` — ${error}` : ""}`);
  for (const f of ctx.fallbacks) console.log(`      fallback: ${f}`);
}
await browser.close();
const lines_ = results.map((r) => `${r.pass ? "PASS" : "FAIL"}  ${r.name}  ${(r.ms / 1000).toFixed(1)} s  ${r.reason}${r.checks.length ? `\n      checks: ${r.checks.map((c) => `${c.pass ? "✓" : "✗"} ${c.test}`).join(" | ")}` : ""}${r.adaptations.length ? `\n      adapted: ${r.adaptations.join(" | ")}` : ""}${r.fallbacks.length ? `\n      fallbacks: ${r.fallbacks.join(" | ")}` : ""}`);
lines_.push(...[...NOTES].map((n) => `note  ${n}`));
const nChecks = results.reduce((s, r) => s + Math.max(1, r.checks.length), 0), nPass = results.reduce((s, r) => s + (r.checks.length ? r.checks.filter((c) => c.pass).length : r.pass ? 1 : 0), 0);
lines_.push(`${results.filter((r) => r.pass).length} of ${results.length} scenarios passed (${nPass} of ${nChecks} ported tests) in ${((Date.now() - RUN_T0) / 1000).toFixed(0)} s`);
writeFileSync(join(OUT, "results.json"), JSON.stringify({ app: APP, results, notes: [...NOTES] }, null, 2));
writeFileSync(join(OUT, "results.txt"), lines_.join("\n") + "\n");
for (const n of NOTES) console.log(`note  ${n}`);
console.log(`${results.filter((r) => r.pass).length} of ${results.length} scenarios passed (${nPass} of ${nChecks} ported tests) · ${OUT}/results.json`);
process.exit(results.every((r) => r.pass) ? 0 : 1);

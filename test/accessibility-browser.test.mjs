// test/accessibility-browser.test.mjs — the semantic tree realized on the DOM,
// in real Chrome (docs/system-design/accessibility.md §5.2, §10).
//
// The runtime's semantic tree is the oracle: what Chrome's own accessibility
// tree (CDP Accessibility.getFullAXTree) builds from the annotated elements must
// say the same — every control's role, name, state and value. Focus is one
// fact: the focus service moves the DOM's, and a DOM focus a screen reader
// moves comes back to the focus service. A press a screen reader makes — a
// click with no pointer behind it — runs the control's press(). An open modal
// leaves the rest of its app inert.

import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize } from "./harness.mjs";
import { launchChrome } from "../tools/internal/chrome.mjs";
import { compile } from "../compiler/dist/compile-node.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html;charset=utf-8", ".js": "text/javascript;charset=utf-8", ".json": "application/json", ".wasm": "application/wasm" };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
  catch { res.writeHead(400); return res.end("bad request"); }
  const fp = path.join(ROOT, pathname);
  if (fp !== ROOT && !fp.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end("forbidden"); }
  try {
    const st = fs.statSync(fp);
    if (st.isDirectory()) { res.writeHead(200, { "content-type": MIME[".html"] }); return res.end("<!doctype html><meta charset=utf-8><body style=margin:0>"); }
    res.writeHead(200, { "content-type": MIME[path.extname(fp).toLowerCase()] ?? "application/octet-stream" });
    res.end(fs.readFileSync(fp));
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await launchChrome({ args: ["--no-sandbox"] });

const SOURCE = `
class Wave extends Control [ width = 200, height = 30, position: number = 12, duration: number = 65,
    accessibilityRole = slider, accessibilityLabel = "Voice message",
    accessibilityMin = 0, accessibilityMax = { duration }, accessibilityValue = { position },
    accessibilityValueText = { position + " seconds of " + duration },
    accessibilityIncrement() { position = Math.min(duration, position + 5) },
    accessibilityDecrement() { position = Math.max(0, position - 5) } ]
App [ width = 500, height = 500, presses: number = 0, open: boolean = false, plain: boolean = false,
    col: View [ padding = 10, layout: SimpleLayout [ axis = y, spacing = 8 ],
        send: Button [ label = "Send", onClick() { app.presses = app.presses + 1 } ],
        mute: Checkbox [ label = "Mute", checked = true ],
        wifi: Switch [ accessibilityLabel = "Wi-Fi" ],
        vol: Slider [ accessibilityLabel = "Volume", value = 40 ],
        wave: Wave [ ],
        Text [ text = "Plain text" ],
        deco: Text [ text = "Decor text", accessibilityHidden = { !app.plain } ],
        find: SearchField [ width = 200, placeholder = "Search messages" ],
        pw: TextInput [ width = 200, purpose = password, accessibilityLabel = "Password", initial = "hunter2" ],
        card: TextInput [ width = 200, purpose = cardNumber, accessibilityLabel = "Card number" ] ],
    dlg: View [ x = 250, y = 10, width = 200, height = 120, visible = { app.open }, focusScope = modal,
        accessibilityRole = dialog, accessibilityLabel = "Confirm",
        ok: Button [ x = 10, y = 10, label = "OK" ] ] ]`;

const r = await compile(SOURCE);
const page = await browser.newPage();
await page.setViewport({ width: 600, height: 600 });
const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.evaluate(async (base, json) => {
  const rt = await import(base + "/runtime/dist/index.js");
  const sem = await import(base + "/runtime/dist/semantics.js");
  const dom = await import(base + "/runtime/dist/semantics-dom.js");
  await rt.kernelReady?.();
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:0;top:0;width:500px;height:500px";
  document.body.appendChild(host);
  const app = rt.buildProgram(JSON.parse(json));
  rt.mountApp(app, host, new rt.DomBackend());
  rt.settle();
  const frame = () => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
  const ready = async () => { rt.settle(); await frame(); dom.flushAnnotations(); rt.settle(); await frame(); };
  window.__t = { rt, sem, app, frame, ready, el: (v) => v.$surface.element };
  await ready();
}, BASE, JSON.stringify(r.program));
const cdp = await page.createCDPSession();

/** Chrome's own tree, as the nodes a person can act on or read: role, name, and
 *  the states and value it reports. */
async function chromeNodes() {
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  const prop = (n, name) => n.properties?.find((p) => p.name === name)?.value?.value;
  return nodes.filter((n) => !n.ignored && ["button", "checkbox", "switch", "slider", "dialog"].includes(n.role?.value))
    .map((n) => ({ role: n.role.value, name: n.name?.value ?? "", checked: prop(n, "checked"), value: n.value?.value, valuetext: prop(n, "valuetext") }));
}

await test("the DOM: every control's element carries its role and states, set from the class's own facts", async () => {
  await page.evaluate(() => window.__t.ready());
  const a = await page.evaluate(() => {
    const { app, el } = window.__t;
    const attrs = (v) => Object.fromEntries([...el(v).attributes].filter((x) => x.name === "role" || x.name.startsWith("aria-")).map((x) => [x.name, x.value]));
    return { send: attrs(app.col.send), mute: attrs(app.col.mute), wifi: attrs(app.col.wifi), vol: attrs(app.col.vol), wave: attrs(app.col.wave) };
  });
  assert.deepEqual(a.send, { role: "button" });
  assert.deepEqual(a.mute, { role: "checkbox", "aria-checked": "true" });
  assert.deepEqual(a.wifi, { role: "switch", "aria-label": "Wi-Fi", "aria-checked": "false" });
  assert.deepEqual(a.vol, { role: "slider", "aria-label": "Volume", "aria-valuenow": "40", "aria-valuemin": "0", "aria-valuemax": "100" });
  assert.equal(a.wave["aria-valuetext"], "12 seconds of 65");
});

await test("accessibilityHidden: aria-hidden on the element, out of Chrome's tree, and back when it turns off", async () => {
  await page.evaluate(() => window.__t.ready());
  const texts = async () => {
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    return nodes.filter((n) => !n.ignored && /text/i.test(n.role?.value ?? "")).map((n) => n.name?.value ?? "");
  };
  const hidden = () => page.evaluate(() => window.__t.el(window.__t.app.col.deco).getAttribute("aria-hidden"));
  assert.equal(await hidden(), "true");
  assert.ok((await texts()).includes("Plain text"), "the plain text is read");
  assert.ok(!(await texts()).includes("Decor text"), "the hidden text is not read");
  await page.evaluate(async () => { window.__t.app.plain = true; await window.__t.ready(); });
  assert.equal(await hidden(), null);
  assert.ok((await texts()).includes("Decor text"), "read once it is no longer hidden");
  await page.evaluate(async () => { window.__t.app.plain = false; await window.__t.ready(); });
});

await test("a search field is a searchbox on its own input, named by its placeholder", async () => {
  const a = await page.evaluate(() => {
    const { app, el } = window.__t;
    const input = el(app.col.find).querySelector("input");
    return { role: input?.getAttribute("role"), placeholder: input?.getAttribute("placeholder") };
  });
  assert.deepEqual(a, { role: "searchbox", placeholder: "Search messages" });
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  assert.ok(nodes.some((n) => !n.ignored && n.role?.value === "searchbox" && n.name?.value === "Search messages"), "Chrome reads it as a search box");
});

await test("a field's purpose reaches its input: autofill name, keyboard, and a hidden password that can be shown", async () => {
  const read = () => page.evaluate(() => {
    const { app, el } = window.__t;
    const at = (v) => { const i = el(v).querySelector("input");
      return { type: i.type, autocomplete: i.getAttribute("autocomplete"), inputmode: i.getAttribute("inputmode"), spellcheck: i.spellcheck }; };
    return { pw: at(app.col.pw), card: at(app.col.card) };
  });
  const a = await read();
  assert.deepEqual(a.pw, { type: "password", autocomplete: "current-password", inputmode: null, spellcheck: false });
  assert.deepEqual(a.card, { type: "text", autocomplete: "cc-number", inputmode: "numeric", spellcheck: false });
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  const pw = nodes.find((n) => !n.ignored && n.name?.value === "Password");
  assert.ok(pw, "Chrome sees the password field by its name");
  assert.notEqual(pw.value?.value, "hunter2", "Chrome does not read the password out");
  await page.evaluate(() => { window.__t.app.col.pw.concealed = false; });
  await page.evaluate(() => window.__t.ready());
  const b = await read();
  assert.equal(b.pw.type, "text", "shown, it is a plain field");
  assert.equal(b.pw.autocomplete, "current-password", "and still a password to a password manager");
});

await test("Chrome's accessibility tree says what the runtime's semantic tree says", async () => {
  const ours = await page.evaluate(() => {
    const { sem, app } = window.__t;
    const out = [];
    const walk = (n) => { if (["button", "checkbox", "switch", "slider", "dialog"].includes(n.role)) out.push(n); n.children.forEach(walk); };
    walk(sem.semanticTree(app));
    return out.map((n) => ({ role: n.role, name: n.name, checked: n.states.includes("checked") ? "true" : n.states.includes("unchecked") ? "false" : undefined, now: n.value?.now }));
  });
  const theirs = await chromeNodes();
  assert.deepEqual(theirs.map((n) => [n.role, n.name]), ours.map((n) => [n.role, n.name]), "roles and names, in order");
  for (let i = 0; i < ours.length; i++) {
    if (ours[i].checked !== undefined) assert.equal(String(theirs[i].checked), ours[i].checked, `${ours[i].name} checked`);
  }
  // the value it reports (CDP leaves an author's aria-valuetext out of its
  // summary; the element's own attribute is checked above)
  const wave = theirs.find((n) => n.name === "Voice message");
  assert.equal(wave.value, ours.find((n) => n.name === "Voice message").now);
});

await test("a state change reaches the element: the checkbox unchecked, the slider stepped", async () => {
  const a = await page.evaluate(async () => {
    const { app, el, ready } = window.__t;
    app.col.wifi.input(true);
    app.col.wave.accessibilityIncrement();
    await ready();
    return { wifi: el(app.col.wifi).getAttribute("aria-checked"), wave: el(app.col.wave).getAttribute("aria-valuenow") };
  });
  assert.deepEqual(a, { wifi: "true", wave: "17" });
});

await test("focus is one fact: the focus service moves the DOM's, and a DOM focus moves the service's", async () => {
  const a = await page.evaluate(async () => {
    const { app, el, ready, rt } = window.__t;
    rt.Focus.focus(app.col.send); await ready();
    const first = document.activeElement === el(app.col.send);
    el(app.col.mute).focus();                       // what a screen reader's focus move does
    await ready();
    return { first, followed: rt.Focus.getFocus() === app.col.mute, active: document.activeElement === el(app.col.mute) };
  });
  assert.deepEqual(a, { first: true, followed: true, active: true });
});

await test("Tab moves the DOM's focus with the app's, and Space still presses rather than scrolling", async () => {
  await page.evaluate(async () => { const { rt, app, ready } = window.__t; rt.Focus.focus(app.col.send); await ready(); });
  await page.keyboard.press("Tab");
  const after = await page.evaluate(async () => { const { el, app, ready } = window.__t; await ready(); return document.activeElement === el(app.col.mute); });
  assert.equal(after, true, "Tab landed on the checkbox's element");
  const before = await page.evaluate(() => window.__t.app.col.mute.checked);
  await page.keyboard.press("Space");
  const toggled = await page.evaluate(async () => { await window.__t.ready(); return [window.__t.app.col.mute.checked, window.scrollY]; });
  assert.deepEqual(toggled, [!before, 0]);
});

await test("a pointer press on the control that already has keyboard focus hides the focus ring", async () => {
  await page.evaluate(async () => { const { rt, app, ready } = window.__t; rt.Focus.focus(app.col.send); await ready(); });
  await page.keyboard.press("Tab");
  await page.evaluate(() => window.__t.ready());
  const ring = () => page.evaluate(() => {
    let r = null;
    const walk = (n) => { if (n?.constructor?.name?.includes("FocusRing")) r = n; for (const c of (n?.children ?? [])) walk(c); };
    walk(window.__t.app);
    return r === null ? null : r.shown;
  });
  assert.equal(await ring(), true, "keyboard focus shows the ring");
  const box = await page.evaluate(() => { const r = window.__t.el(window.__t.app.col.mute).getBoundingClientRect(); return { x: r.x + 6, y: r.y + r.height / 2 }; });
  await page.mouse.click(box.x, box.y);
  await page.evaluate(() => window.__t.ready());
  assert.equal(await ring(), false, "the press, though focus stays put, hides it");
});

await test("a press a screen reader makes (a click with no pointer behind it) runs the control's press()", async () => {
  const n = await page.evaluate(async () => {
    const { app, el, ready } = window.__t;
    const was = app.presses;
    el(app.col.send).click();
    await ready();
    return app.presses - was;
  });
  assert.equal(n, 1);
});

await test("an open modal leaves the rest of its app inert, and closing it gives it back", async () => {
  const a = await page.evaluate(async () => {
    const { app, el, ready } = window.__t;
    app.open = true; await ready();
    const open = { colInert: el(app.col).closest("[inert]") !== null, dialogInert: el(app.dlg).closest("[inert]") !== null };
    app.open = false; await ready();
    return { ...open, after: el(app.col).closest("[inert]") !== null };
  });
  assert.deepEqual(a, { colInert: true, dialogInert: false, after: false });
});


await test("an announcement reaches a live region, without moving the focus", async () => {
  const a = await page.evaluate(async () => {
    const { rt } = window.__t;
    const before = document.activeElement;
    const svc = await import(location.origin + "/runtime/dist/accessibility-service.js");
    svc.Accessibility.announce("Message sent");
    await new Promise((r) => setTimeout(r, 120));
    const region = [...document.querySelectorAll("[aria-live=polite]")].find((e) => e.textContent === "Message sent");
    return { found: region !== undefined, focusKept: document.activeElement === before };
  });
  assert.deepEqual(a, { found: true, focusKept: true });
});

await test("the page says its language: the App's (\"en\" by default) on <html>", async () => {
  const a = await page.evaluate(async () => {
    const { app, ready } = window.__t;
    const before = document.documentElement.lang;
    app.language = "fr"; await ready();
    const after = document.documentElement.lang;
    app.language = "en"; await ready();
    return [before, after];
  });
  assert.deepEqual(a, ["en", "fr"]);
});

// THE COMPOSITES, driven as a person drives them: the browser's focus must be
// where the runtime's is after an overlay opens and closes, by key or pointer,
// and the item the keys are on in a menu, a combobox's list and a listbox must
// be named to the browser (aria-activedescendant), with its selection said.
const COMPOSITES = `
App [ width = 500, height = 500,
    cities: Dataset { { "rows": [ { "name": "Boston" }, { "name": "Berlin" }, { "name": "Bern" } ] } },
    col: View [ padding = 10, layout: SimpleLayout [ axis = y, spacing = 8 ],
        ask: Button [ label = "Ask…", onClick() { app.dlg.ask("Save changes?", "Unsaved changes will be lost.", (id) => { }) } ],
        more: Button [ label = "More", menu = { app.m } ],
        city: Combobox [ width = 200, placeholder = "City", items = ["Boston", "Berlin", "Bern"] ],
        tbl: Table [ width = 200, height = 100, accessibilityLabel = "Cities", datapath = { app.cities.value },
            TableRow [ datapath = :rows[], height = 28, onContextMenu(e: PointerEvent) { app.ctx.open(this, e) },
                Text [ x = 8, y = center, text = :name ] ] ],
        save: Button [ label = "Save", tooltipLabel = "Save the draft" ] ],
    dlg: Dialog [ ],
    m: Menu [ items = { [ ({ id: "a", label: "Alpha" }), ({ id: "b", label: "Beta" }) ] } ],
    ctx: ContextMenu [ items = { [ ({ id: "open", label: "Open" }), ({ id: "pin", label: "Pin" }) ] } ] ]`;

await test("composites: focus follows overlays by key and by pointer, and the item the keys are on is named", async () => {
  const c = await compile(COMPOSITES);
  assert.equal(c.errors.length, 0, c.report);
  const pg = await browser.newPage();
  await pg.setViewport({ width: 600, height: 600 });
  const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await pg.evaluate(async (base, json) => {
    const rt = await import(base + "/runtime/dist/index.js");
    const dom = await import(base + "/runtime/dist/semantics-dom.js");
    await rt.kernelReady?.();
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:0;top:0;width:500px;height:500px";
    document.body.appendChild(host);
    const app = rt.buildProgram(JSON.parse(json));
    rt.mountApp(app, host, new rt.DomBackend());
    rt.settle();
    const frame = () => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
    rt.settle(); await frame(); dom.flushAnnotations(); rt.settle(); await frame();
    window.__c = { app };
  }, BASE, JSON.stringify(c.program));
  const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
  // an overlay animates out before it hands the focus back
  const key = async (k) => { await pg.keyboard.press(k); await wait(k === "Escape" ? 800 : 250); };
  // what has the browser's focus, and what it names as the item the keys are on
  const at = () => pg.evaluate(() => {
    const a = document.activeElement;
    const id = a.getAttribute("aria-activedescendant");
    const t = id ? document.getElementById(id) : null;
    const said = (e) => (e.getAttribute("aria-label") || e.innerText || e.value || "").trim();
    return { role: a.getAttribute("role") ?? a.tagName.toLowerCase(), name: said(a), item: t ? said(t) : null, selected: t ? t.getAttribute("aria-selected") : null };
  });

  await key("Tab");
  assert.equal((await at()).name, "Ask…");
  await key("Enter");
  assert.equal((await at()).name, "Yes", "a dialog opened from the keyboard has the browser's focus");
  await key("Escape");
  assert.equal((await at()).name, "Ask…", "and gives it back to its opener on close");
  const box = await pg.evaluate(() => { const e = [...document.querySelectorAll("[role=button]")].find((b) => b.innerText.trim() === "Ask…"); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await pg.mouse.click(box[0], box[1]); await wait(400);
  assert.equal((await at()).name, "Yes", "a dialog opened by the pointer has it too");
  await key("Escape");
  assert.equal((await at()).name, "Ask…");

  await key("Tab");
  assert.equal((await at()).name, "More");
  await key("Enter");
  assert.deepEqual([(await at()).role, (await at()).name], ["menu", "More"], "an open menu holds the focus, named for its opener");
  await key("ArrowDown");
  assert.equal((await at()).item, "Alpha");
  await key("ArrowDown");
  assert.equal((await at()).item, "Beta", "the menu names the row the keys are on");
  await key("Escape");
  assert.equal((await at()).name, "More", "closing it gives the focus back");

  await key("Tab");
  await pg.keyboard.type("Be"); await wait();
  await key("ArrowDown");
  assert.deepEqual([(await at()).role, (await at()).item], ["input", "Berlin"], "the field keeps the focus and names the suggestion");
  assert.deepEqual(await pg.evaluate(() => { const id = document.activeElement.getAttribute("aria-activedescendant"); const t = document.getElementById(id); return [t.getAttribute("role"), t.closest("[role]:not([role=option])")?.getAttribute("role"), document.querySelectorAll("[role=menu]").length]; }),
    ["option", "listbox", 0], "a combobox's list is a listbox of options, not a menu");
  await key("Escape");

  await key("Tab");
  assert.deepEqual([(await at()).role, (await at()).name], ["listbox", "Cities"]);
  await key("ArrowDown");
  assert.deepEqual([(await at()).item, (await at()).selected], ["Boston", "true"]);
  await key("ArrowDown");
  assert.deepEqual([(await at()).item, (await at()).selected], ["Berlin", "true"], "the option the keys are on, and its selection, are said");
  assert.equal(await pg.evaluate(() => document.activeElement.getAttribute("aria-multiselectable")), null, "a single-choice list does not say multiselectable");
  await pg.evaluate(() => { window.__c.app.col.tbl.selects = "multi"; });
  await wait(300);
  assert.equal(await pg.evaluate(() => document.activeElement.getAttribute("aria-multiselectable")), "true", "a multi-choice list says so");
  await pg.evaluate(() => { window.__c.app.col.tbl.selects = "single"; });
  await wait(300);
  const others = await pg.evaluate(() => [...document.querySelectorAll("[role=option]")].filter((o) => o.closest("[role=listbox][aria-label=Cities]")).map((o) => o.getAttribute("aria-selected")));
  assert.deepEqual(others, ["false", "true", "false"], "every option says whether it is selected");

  // the context menu from the keyboard: for the row the keys are on
  await pg.keyboard.down("Shift"); await pg.keyboard.press("F10"); await pg.keyboard.up("Shift"); await wait(400);
  assert.equal((await at()).role, "menu", "Shift+F10 opens the active row's context menu, holding the focus");
  await key("ArrowDown");
  assert.equal((await at()).item, "Open");
  await key("Escape");
  assert.deepEqual([(await at()).role, (await at()).item], ["listbox", "Berlin"], "Esc returns to the list, on the same row");

  // a tip shows for the keyboard's focus, and describes a control that has a name of its own
  const tipShown = () => pg.evaluate(() => [...document.querySelectorAll("body *")].some((e) => {
    if (e.childElementCount !== 0 || e.textContent !== "Save the draft" || e.getBoundingClientRect().width === 0) return false;
    for (let p = e; p !== null; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.5) return false; }
    return true;
  }));
  assert.equal(await tipShown(), false, "no tip before");
  await key("Tab");
  assert.equal((await at()).name, "Save");
  await wait(900);
  assert.equal(await tipShown(), true, "the tip shows for the keyboard's focus");
  assert.equal(await pg.evaluate(() => document.activeElement.getAttribute("aria-description")), "Save the draft");
  assert.deepEqual(errs, []);
  await pg.close();
});

// A TOAST's action is a Tab stop while it shows, the toast holds while the
// pointer is over it (or its action has the focus) and goes a moment after it is
// let go, and what it says is announced once.
await test("a toast: its action reachable, held while hovered, announced once", async () => {
  const c = await compile(`App [ width = 400, height = 300,
    go: Button [ x = 10, y = 10, label = "Notify", onClick() { app.t.say("Copied", ({ id: "undo", label: "Undo" })) } ],
    t: Toast [ duration = 1200 ] ]`);
  assert.equal(c.errors.length, 0, c.report);
  const pg = await browser.newPage();
  await pg.setViewport({ width: 400, height: 300 });
  await pg.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await pg.evaluate(async (base, json) => {
    const rt = await import(base + "/runtime/dist/index.js");
    const dom = await import(base + "/runtime/dist/semantics-dom.js");
    await rt.kernelReady?.();
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:0;top:0;width:400px;height:300px";
    document.body.appendChild(host);
    const app = rt.buildProgram(JSON.parse(json));
    rt.mountApp(app, host, new rt.DomBackend());
    rt.settle(); await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); dom.flushAnnotations(); rt.settle();
    window.__toast = app;
  }, BASE, JSON.stringify(c.program));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const undo = () => pg.evaluate(() => { const e = [...document.querySelectorAll("[role=button]")].find((b) => b.innerText.trim() === "Undo" && b.getBoundingClientRect().width > 0); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, tab: e.getAttribute("tabindex") }; });
  await pg.mouse.click(40, 25); await wait(400);
  const u = await undo();
  assert.ok(u !== null && u.tab === "0", "the action is a Tab stop");
  assert.equal(await pg.evaluate(() => document.querySelectorAll("[role=status]").length), 0, "announced once, not also as a status region");
  await pg.mouse.move(u.x, u.y); await wait(2200);
  assert.ok((await undo()) !== null, "held open past its time while the pointer is over it");
  await pg.mouse.move(5, 290); await wait(2400);
  assert.equal(await undo(), null, "and gone a moment after it is let go");
  await pg.close();
});

await test("no page errors through the whole run", () => {
  assert.deepEqual(errors, []);
});

await browser.close();
server.close();
summarize("accessibility (browser)");

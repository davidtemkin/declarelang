// silent-failures — what an agent met that went wrong without a word, each now
// either working or said: a whole dataset handed to a function goes stale no
// more; a write to a computed dataset and a rowIndex that is always 0 are
// warned of; a misplaced two-way arrow names the form that works; the semantic
// tree prints whole; a paragraph's direction reaches the page; a field the
// program owns is still judged by its validate(); a combobox picks the item
// autofill fills in; an input handler reads the caret after the keystroke, and
// a field that regroups as it is typed keeps the caret where the person was.
// And the tools' own: expect.visible answers what is SHOWN and expect.hidden
// refuses a path that names nothing; a script that does not parse names its
// line; --read of nothing and --js waiting on the app's clock are said, not
// passed or hung; a page loaded again on another device keeps the driven clock;
// R4 counts the layout findings it prints; `--rung 4` is read either way.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-silent-");
const run = (tool, file, ...args) => {
  const r = spawnSync("node", [join(ROOT, "tools", tool), file, ...args], { cwd: ROOT, encoding: "utf8" });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
};

const BOOK = join(DIR, "book.declare");
writeFileSync(BOOK, `App [ width = 400, height = 300, direction = rtl,
    book: Dataset { { "items": [ { "name": "a", "amount": 1 } ] } },
    saved: string = { JSON.stringify(app.book.value) },
    bump() { app.book.set(["items", 0, "amount"], 5) },
    todos: Dataset [ contents = { ({ rows: [] }) } ],
    add() { app.todos.insert(["rows"], 0, ({ t: "x" })) },
    list: View [ datapath = { app.book.value }, accessibilityRole = region, accessibilityLabel = "Items",
        group: View [ accessibilityRole = group, accessibilityLabel = "Inner",
            View [ datapath = :items[],
                tag: Text [ text = { "row " + rowIndex } ] ] ] ],
    note: Text [ y = 200, text = "مرحبا" ]
    ]`);

await test("a dataset's tree handed to JSON.stringify follows every write", () => {
  const r = run("look.mjs", BOOK, "--read", "app.saved", "--call", "app.bump()", "--read", "app.saved");
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /app\.saved = .*"amount\\":5/, r.out);
});

await test("warned: a write to a computed dataset, and rowIndex on a view that is not replicated", () => {
  const r = run("verify.mjs", BOOK);
  assert.match(r.out, /todos computes its value with contents, so it refuses writes — todos\.insert/);
  assert.match(r.out, /tag reads rowIndex, but tag is not replicated/);
});

await test("a two-way arrow on a control that is not an editor names the form that works", () => {
  const f = join(DIR, "box.declare");
  writeFileSync(f, `App [ width = 200, height = 100, Checkbox [ checked <-> :done ] ]`);
  const r = run("verify.mjs", f);
  assert.match(r.out, /write 'checked = :done, input\(v\) \{ :done = v \}'/);
});

await test("textAlign: start and end follow the run's direction; left and right are the page's sides", () => {
  const f = join(DIR, "align.declare");
  writeFileSync(f, `App [ width = 300, height = 200, layout: SimpleLayout [ axis = y ],
    ltr: View [ width = 300, height = 60, layout: SimpleLayout [ axis = y ],
        Text [ width = 200, text = "a1" ], Text [ width = 200, text = "a2", textAlign = end ] ],
    rtl: View [ width = 300, height = 80, direction = rtl, layout: SimpleLayout [ axis = y ],
        Text [ width = 200, text = "b1" ], Text [ width = 200, text = "b2", textAlign = end ],
        Text [ width = 200, text = "b3", textAlign = right ] ] ]`);
  const r = run("look.mjs", f, "--js", "['a1','a2','b1','b2','b3'].map((t) => getComputedStyle([...document.querySelectorAll('span')].find((d) => d.textContent === t)).textAlign).join(' ')");
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /js: "left right right left right"/, r.out);
});

await test("--semantics prints the whole tree, and direction reaches the page", () => {
  const r = run("look.mjs", BOOK, "--semantics", "--js", "document.querySelector('[data-declare-app]').dir + ' ' + getComputedStyle([...document.querySelectorAll('span')].find((d) => d.textContent === 'مرحبا')).textAlign");
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^ {6}text "row/m, "a fourth-level node is printed");
  assert.match(r.out, /js: "rtl right"/, "the App's direction is the element's dir, and its Text starts at the right");
});

await test("a field the program owns is judged by validate(), when typed and when the program sets it", () => {
  const f = join(DIR, "card.declare");
  writeFileSync(f, `App [ width = 400, height = 200, card: string = "",
    f: TextInput [ width = 300, accessibilityLabel = "Card", text = { app.card }, judgeOn = edit,
        onInput(t: string) { app.card = t.replace(/\\D/g, "") },
        validate(v: string) -> string { return v.length == 4 ? "" : "4 digits" } ],
    set: Button [ y = 100, label = "set", onClick() { app.card = "1234" } ] ]`);
  const r = run("look.mjs", f, "--click", "app.f", "--type", "1a2", "--read", "app.f.error", "--click", "app.set", "--read", "app.f.valid");
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /app\.f\.error = "4 digits"/, r.out);
  assert.match(r.out, /app\.f\.valid = true/, r.out);
});

await test("a combobox carries its purpose, and text that arrives whole and names one item picks it", () => {
  const f = join(DIR, "country.declare");
  writeFileSync(f, `App [ width = 400, height = 200, picked: string = "",
    c: Combobox [ width = 240, purpose = country, accessibilityLabel = "Country",
        items = { ["Ann", "Anna", "France"] }, input(v: object) { app.picked = "" + v } ] ]`);
  const r = run("look.mjs", f, "--click", "app.c.entry", "--type", "Ann", "--read", "app.picked",
    "--js", "(() => { const el = document.querySelector('input'); el.value = 'France'; el.dispatchEvent(new Event('input', { bubbles: true })); return el.autocomplete })()",
    "--read", "app.picked");
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /app\.picked = ""\n/, "typing through an item's name does not pick it");
  assert.match(r.out, /js: "country-name"/);
  assert.match(r.out, /app\.picked = "France"/);
});

await test("an input handler reads the caret after the keystroke; a regrouping field keeps it", () => {
  const f = join(DIR, "keys.declare");
  writeFileSync(f, `App [ width = 400, height = 200, seen: number = -1, digits: string = "",
    group(d: string) -> string { return d.replace(/(\\d{4})(?=\\d)/g, "$1 ") },
    f: TextInput [ width = 300, accessibilityLabel = "Plain", onInput(t: string) { app.seen = this.selectionStart } ],
    card: TextInput [ y = 60, width = 300, accessibilityLabel = "Card", text = { app.group(app.digits) },
        onInput(t: string) {
            const before = t.slice(0, this.selectionStart).replace(/\\D/g, "").length
            app.digits = t.replace(/\\D/g, "")
            const shown = app.group(app.digits)
            let i = 0, n = 0
            while (i < shown.length && n < before) { if (/\\d/.test(shown[i])) n++; i++ }
            this.select(i, i)
            } ] ]`);
  const r = run("look.mjs", f, "--click", "app.f", "--type", "abcd", "--key", "ArrowLeft", "--key", "ArrowLeft", "--type", "x", "--read", "app.seen",
    "--click", "app.card", "--type", "42424242", "--key", "ArrowLeft", "--key", "ArrowLeft", "--key", "ArrowLeft", "--type", "9",
    "--js", "(() => { const e = [...document.querySelectorAll('input')][1]; return e.value + '|' + e.selectionStart })()");
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /app\.seen = 3/, "the caret after the x, not before it");
  assert.match(r.out, /js: "4242 4924 2\|7"/, "the 9 lands mid-number and the caret stays after it");
});

const SHOWN = join(DIR, "shown.declare");
writeFileSync(SHOWN, `App [ width = 400, height = 300,
    panel: View [ visible = false, width = 200, height = 100,
        inner: View [ width = 50, height = 50, fill = #888888 ] ],
    open: View [ y = 120, width = 50, height = 50, fill = #888888 ]
    ]`);
const script = (name, body) => { const f = join(DIR, name); writeFileSync(f, `export default async ({ drive, expect, page }) => {\n${body}\n};\n`); return f; };

await test("the focus ring takes the theme of the control it rings, not the App's", () => {
  const f = join(DIR, "ring.declare");
  writeFileSync(f, `App [ width = 400, height = 300, theme = { SanFrancisco },
    panel: View [ x = 20, y = 20, width = 300, height = 200, theme = { SanFranciscoDark },
        go: Button [ x = 20, y = 20, label = "Go" ] ] ]`);
  const r = run("look.mjs", f, "--key", "Tab", "--wait", "300", "--js",
    "(() => { const ring = window.__declare.find('app').childViews.find((v) => v.constructor.name === 'FocusRing'); return String(ring._theme && ring._theme.accent) })()");
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /js: "3108832"/, "the dark panel's accent (#2F6FE0), not the light App's (#2E6FE0): " + r.out);
});

await test("a path by name reaches the field a person means: shown before hidden, a field before its label; select-all chords select", () => {
  const f = join(DIR, "names.declare");
  writeFileSync(f, `App [ width = 400, height = 300, pw: string = "correct horse battery", code: string = "123",
    savedBox: View [ visible = false, Field [ label = "Security code", TextInput [ width = 100, text = "999" ] ] ],
    f: Field [ x = 10, y = 10, label = "Password", TextInput [ width = 300, purpose = password, text = { app.pw }, onInput(v: string) { app.pw = v } ] ],
    g: Field [ x = 10, y = 80, label = "Security code", TextInput [ width = 100, text = { app.code }, onInput(v: string) { app.code = v } ] ] ]`);
  const r = run("verify.mjs", f, "--assert", script("names.mjs", `  await drive.selectAll('app."Password"');
  await drive.type("wrong");
  await expect.attr("app", "pw", "wrong");
  await drive.click('app."Security code"');
  await drive.key("Meta+a");
  await drive.type("456");
  await expect.attr("app", "code", "456");`), "--rung=5", "--no-boot");
  assert.equal(r.status, 0, r.out);
});

await test("expect.attr on an attribute of a node, written with a dot, says how to split the path", () => {
  const f = join(DIR, "nodeattr.declare");
  writeFileSync(f, `App [ width = 200, height = 100, weekCount: Node [ shown: number = 3 ] ]`);
  const r = run("verify.mjs", f, "--assert", script("nodeattr.mjs", `  await expect.attr("app", "weekCount.shown", 3);`), "--rung=5", "--no-boot");
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /'weekCount' is a node, not an attribute: the path is "app.weekCount" and the attribute "shown"/, r.out);
});

await test("a path that names nothing is answered with what is nearest there, by name or by what it says", () => {
  const f = join(DIR, "near.declare");
  writeFileSync(f, `App [ width = 300, height = 200, layout: SimpleLayout [ axis = y ],
    pay: View [ width = 300, height = 100, layout: SimpleLayout [ axis = y ], Button [ label = "Pay $245.00" ], Button [ label = "Cancel" ] ],
    other: View [ width = 10, height = 10 ] ]`);
  const said = run("verify.mjs", f, "--assert", script("near1.mjs", `  await expect.visible('app.pay."Pay $246.00"');`), "--rung=5", "--no-boot");
  assert.match(said.out, /'app\.pay' holds nothing called "Pay \$246\.00"; nearest there: "Pay \$245\.00"/, said.out);
  const named = run("verify.mjs", f, "--assert", script("near2.mjs", `  await expect.visible("app.paw");`), "--rung=5", "--no-boot");
  assert.match(named.out, /'app' holds nothing called paw; nearest there: pay/, named.out);
});

await test("focus that did nothing, or was dropped, is said beside the verdict", () => {
  const f = join(DIR, "focusw.declare");
  writeFileSync(f, `App [ width = 300, height = 200, layout: SimpleLayout [ axis = y ],
    heading: Text [ text = "Seats" ],
    side: View [ width = 200, height = 60, layout: SimpleLayout [ axis = y ], tabOrder() { return [this.ok] },
        hid: View [ width = 20, height = 20, focusable = true ], ok: View [ width = 20, height = 20, focusable = true ] ],
    go: Button [ label = "Go", onClick() { Focus.focus(app.heading) } ],
    go2: Button [ label = "Go2", onClick() { Focus.focus(app.side.hid) } ] ]`);
  const r = run("verify.mjs", f, "--assert", script("focusw.mjs", `  await drive.click('app."Go"');\n  await drive.click('app."Go2"');\n  await drive.settleMotion();\n  await expect.visible('app."Go"');`), "--rung=5", "--no-boot");
  assert.match(r.out, /note the runtime said: Focus\.focus\(app\.heading\): it is not focusable, so focus did not move/, r.out);
  assert.match(r.out, /note the runtime said: focus on app\.side\.hid was dropped: a container's tabOrder\(\) leaves it out/, r.out);
});

await test("accessibilityRole = alert is answered with the status idiom", () => {
  const f = join(DIR, "alert.declare");
  writeFileSync(f, `App [ width = 100, height = 50, Text [ text = "x", accessibilityRole = alert ] ]`);
  const r = run("verify.mjs", f);
  assert.match(r.out, /got 'alert' — an alert is `accessibilityRole = status` with `accessibilityLive = assertive`/, r.out);
});

await test("a class written without extends, given a leaf's attribute, is told which class has it", () => {
  const f = join(DIR, "nobase.declare");
  writeFileSync(f, `class Amount [ width = 96, textAlign = end ]\nApp [ width = 200, height = 100, Amount [ ] ]`);
  const r = run("verify.mjs", f);
  assert.match(r.out, /Amount is a View \(a class written without `extends` is one\), and 'textAlign' is Text's: `class Amount extends Text \[ … \]`/, r.out);
});

await test("an assert script that asserts nothing passes R5 only with that said", () => {
  const f = join(DIR, "noassert.declare");
  writeFileSync(f, `App [ width = 200, height = 100, b: Button [ label = "Go" ] ]`);
  const none = run("verify.mjs", f, "--assert", script("noassert.mjs", `  await drive.click('app."Go"');`), "--rung=5", "--no-boot");
  assert.equal(none.status, 0, none.out);
  assert.match(none.out, /R5 ✓ behavior \(1 steps?, real input; it asserted nothing/, none.out);
  const one = run("verify.mjs", f, "--assert", script("oneassert.mjs", `  await drive.click('app."Go"');\n  await expect.visible('app."Go"');`), "--rung=5", "--no-boot");
  assert.match(one.out, /R5 ✓ behavior \(\d+ steps?, real input, 1 assertion\)/, one.out);
});

await test("an assert script that writes to a live service is told what it left there", async () => {
  const { spawn } = await import("node:child_process");
  const svc = spawn("node", ["-e", `require("node:http").createServer((q, r) => { r.writeHead(q.method === "OPTIONS" ? 204 : 201, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, DELETE", "content-type": "application/json" }); r.end(q.method === "OPTIONS" ? "" : "{}"); }).listen(8397, "127.0.0.1", () => console.log("up"))`]);
  await new Promise((r) => svc.stdout.once("data", r));
  try {
    const f = join(DIR, "writes.declare");
    writeFileSync(f, `App [ width = 200, height = 100,
    add: DataSource [ url = "http://127.0.0.1:8397/api/things", method = "POST", body = { { name: "x" } } ] ]`);
    const r = run("verify.mjs", f, "--assert", script("writes.mjs", `  await page.evaluate(() => window.__declare.find("app.add").fetch());
  await drive.settleData();`), "--rung=5", "--no-boot");
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /note the script sent 1 write to the live service \(POST \/api\/things\)/, r.out);
  } finally { svc.kill(); }
});

await test("a run that fails after talking to a service earlier runs wrote to is told what may be the service's state", async () => {
  const { spawn } = await import("node:child_process");
  const svc = spawn("node", ["-e", `require("node:http").createServer((q, r) => { r.writeHead(q.method === "OPTIONS" ? 204 : 201, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, OPTIONS", "content-type": "application/json" }); r.end("{}"); }).listen(8398, () => console.log("up"));`]);
  await new Promise((r) => svc.stdout.once("data", r));
  try {
    const f = join(DIR, "remembers.declare");
    writeFileSync(f, `App [ width = 200, height = 100,
    add: DataSource [ url = "http://127.0.0.1:8398/api/seats", method = "POST", body = { { seat: "A-1" } } ] ]`);
    const buy = script("buy.mjs", `  await page.evaluate(() => window.__declare.find("app.add").fetch());
  await drive.settleData();`);
    assert.equal(run("verify.mjs", f, "--assert", buy, "--rung=5", "--no-boot").status, 0);
    const again = script("again.mjs", `  await page.evaluate(() => window.__declare.find("app.add").fetch());
  await drive.settleData();
  await expect.attr("app", "width", 999);`);
    const r = run("verify.mjs", f, "--assert", again, "--rung=5", "--no-boot");
    assert.notEqual(r.status, 0, r.out);
    assert.match(r.out, /note this run failed after talking to http:\/\/127\.0\.0\.1:8398, which earlier runs wrote to/, r.out);
  } finally { svc.kill(); }
});

await test("R4: a control another view takes the presses of is said, with the view that takes them", () => {
  const f = join(DIR, "cover.declare");
  writeFileSync(f, `App [ width = 400, height = 300,
    a: Button [ x = 20, y = 20, label = "Under" ],
    cover: View [ x = 0, y = 0, width = 200, height = 100, onClick() { } ],
    b: Button [ x = 20, y = 200, label = "Clear" ] ]`);
  const r = run("verify.mjs", f);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /control\(s\) another view takes the presses of: .*app\.a \(by app\.cover\)/, r.out);
  assert.doesNotMatch(r.out, /app\.b \(by/, "a control clear of the cover is not named");
});

await test("declare-look --url looks at an app where it is served, with no program file", async () => {
  const { spawn } = await import("node:child_process");
  const port = 8396;
  const srv = spawn("node", [join(ROOT, "server/index.mjs"), String(port)], { cwd: ROOT });
  try {
    await new Promise((ok, no) => {
      const t = setTimeout(() => no(new Error("the dev server never came up")), 20000);
      srv.stdout.on("data", (d) => { if (/Declare dev server/.test(String(d))) { clearTimeout(t); ok(); } });
    });
    const r = run("look.mjs", "--url", `http://127.0.0.1:${port}/apps/todo/todo.declare`, "--wait", "500", "--js", "location.pathname");
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /js: "\/apps\/todo\/todo.declare"/, r.out);
    // …and verify driving it there counts no write of the host's own: the dev
    // server compiling the page it serves is not the program writing to a service
    const v = run("verify.mjs", join(ROOT, "apps/todo/todo.declare"), "--url", `http://127.0.0.1:${port}/apps/todo/todo.declare`, "--no-boot",
      "--assert", script("served.mjs", `  await drive.settleData();`), "--rung=5");
    assert.equal(v.status, 0, v.out);
    assert.doesNotMatch(v.out, /\/compile/, v.out);
  } finally { srv.kill(); }
});

await test("DECLARE4026: sibling toggles each on for one value of the same thing are one of several — Segmented is named", () => {
  const f = join(DIR, "toggles.declare");
  writeFileSync(f, `class Choice extends Control [ width = 60, height = 44,
    on: boolean = false, label: string = "",
    accessibilityRole = toggle, accessibilityPressed = { on }, accessibilityLabel = { label } ]
App [ width = 400, height = 200, sport: string = "run",
    row: View [ layout: SimpleLayout [ axis = x, spacing = 6 ],
        Choice [ label = "Run", on = { app.sport == "run" }, press() { app.sport = "run" } ],
        Choice [ label = "Ride", on = { app.sport == "ride" }, press() { app.sport = "ride" } ] ],
    alone: Choice [ label = "Mute", on = { app.sport == "x" } ] ]`);
  const r = run("verify.mjs", f, "--rung", "3");
  assert.match(r.out, /DECLARE4026/, r.out);
  assert.match(r.out, /these 2 Choices are one choice among several/, r.out);
  assert.match(r.out, /use Segmented/, r.out);
});

await test("a slot's word written bare in { } where it is also a name (x, y) is answered with its quoted spelling", () => {
  const f = join(DIR, "wordname.declare");
  writeFileSync(f, `App [ width = 400, height = 200, wide: boolean = true,
    View [ layout: SimpleLayout [ axis = { app.wide ? x : y } ] ] ]`);
  const r = run("verify.mjs", f, "--rung", "3");
  assert.match(r.out, /DECLARE6001/, r.out);
  assert.match(r.out, /here 'x' is a name, read as the member it names, not the word\. Inside \{ \} a word is a string: "x"/, r.out);
});

await test("a press on a link in selectable text, half under a pinned bar, follows it: the browser's focus of its <a> is a press's, and does not scroll the page between press and release", () => {
  const f = join(DIR, "pinnedlink.declare");
  // in selectable text, where the browser's own press runs — and focuses the <a>
  writeFileSync(f, `App [ width = 400, height = 300, scrolls = y,
    col: View [ width = 400, selectable = true, layout: SimpleLayout [ axis = y ],
        View [ width = 400, height = 600 ],
        lk: Text [ height = 20, text = "Go there", link = "#there" ],
        View [ width = 400, height = 600, anchor = "there" ] ],
    bar: View [ ignoreScroll = true, width = 400, height = 40, fill = #10202C ] ]`);
  const script = join(DIR, "pinnedlink.mjs");
  writeFileSync(script, `export const device = { width: 400, height: 300 };
export default async ({ drive, expect }) => {
  // the link's top half under the bar (bar 0–40, link 25–45), pressed on its visible half
  await drive.page.evaluate(() => scrollTo(0, 600 - 25));
  await drive.waitReal(200);
  const before = await drive.page.evaluate(() => { addEventListener("pointerup", () => { window.__atRelease = scrollY; }, true); return scrollY; });
  await drive.page.mouse.click(30, 42);
  await drive.waitReal(200);
  const atRelease = await drive.page.evaluate(() => window.__atRelease);
  if (atRelease !== before) throw new Error("the page scrolled between press and release: " + before + " → " + atRelease);
  await expect.attr("app", "location", "@there");
};`);
  const r = run("verify.mjs", f, "--assert", script, "--rung=5", "--no-boot");
  assert.equal(r.status, 0, r.out);
});

await test("a disabled Button or ToolButton takes no click — the click is refused before its action — and takes it once enabled", () => {
  const f = join(DIR, "disabled.declare");
  writeFileSync(f, `App [ width = 300, height = 200, n: number = 0, off: boolean = true,
    b: Button [ x = 20, y = 20, label = "Go", disabled = { app.off }, onClick() { app.n = app.n + 1 } ],
    t: ToolButton [ x = 20, y = 100, label = "Bold", toggle = true, disabled = { app.off } ] ]`);
  const script = join(DIR, "disabled.mjs");
  writeFileSync(script, `export const device = { width: 300, height: 200 };
export default async ({ drive, expect }) => {
  const at = async (p) => { const n = await drive.page.evaluate((q) => window.__declare.inspect(q), p); return [n.rootX + n.width / 2, n.rootY + n.height / 2]; };
  const [bx, by] = await at("app.b"), [tx, ty] = await at("app.t");
  await drive.page.mouse.click(bx, by); await drive.page.mouse.click(tx, ty);
  await drive.waitReal(100);
  await expect.attr("app", "n", 0);
  await expect.attr("app.t", "on", false);
  await drive.set("app", "off", false);
  await drive.page.mouse.click(bx, by); await drive.page.mouse.click(tx, ty);
  await drive.waitReal(100);
  await expect.attr("app", "n", 1);
  await expect.attr("app.t", "on", true);
};`);
  const r = run("verify.mjs", f, "--assert", script, "--rung=5", "--no-boot");
  assert.equal(r.status, 0, r.out);
});

await test("rung 4's layout questions are asked where a script drives the program: what a press opens is checked, by name, once", () => {
  const f = join(DIR, "driven.declare");
  writeFileSync(f, `App [ width = 390, height = 700, more: boolean = false,
    go: Button [ x = 20, y = 20, label = "Open", onClick() { app.s.show() } ],
    moreBtn: Button [ x = 20, y = 90, label = "More", onClick() { app.more = true } ],
    pinned: View [ ignoreScroll = true, width = 390, height = 10 ],
    s: Sheet [ Text [ text = "Pick" ], tiny: Button [ height = 30, label = "x", onClick() { } ] ],
    panel: View [ y = 300, width = 390, height = 200, exists = { app.more },
        hidden: Button [ x = 20, y = 20, label = "Under", onClick() { } ],
        cover: View [ width = 390, height = 200, onClick() { } ] ] ]`);
  const script = join(DIR, "driven.mjs");
  writeFileSync(script, `export const device = { width: 390, height: 700, touch: true };
export default async ({ drive }) => {
  await drive.click("app.go"); await drive.settleMotion();
  await drive.key("Escape"); await drive.settleMotion();
  await drive.click("app.moreBtn"); await drive.settleData();
};`);
  const r = run("verify.mjs", f, "--assert", script, "--rung=5");
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /layout after tap app\.go: 1 control\(s\) smaller than 44 × 44, a finger's target: app\.s\.body\.tiny 41×30/, r.out);
  assert.match(r.out, /layout after tap app\.moreBtn: 1 control\(s\) another view takes the presses of: .*app\.panel\.hidden \(by app\.panel\.cover\)/, r.out);
  assert.doesNotMatch(r.out, /layout after[^\n]*app\.go 73/, "a control the boot reported is not reported again");
  assert.doesNotMatch(r.out, /\(by app\.s\b/, "what an open sheet covers is behind it by design");
});

await test("a driven check waits for the browser's scroll to come to rest: after a fling, what it reports is what is covered where the list stopped", () => {
  const f = join(DIR, "fling.declare");
  const rows = Array.from({ length: 30 }, (_, i) => `r${i}: Button [ width = 200, height = 50, label = "Row ${i}", onClick() { } ]`).join(",\n        ");
  writeFileSync(f, `App [ width = 390, height = 700,
    sc: View [ width = 390, height = 600, scrolls = y,
      layout: SimpleLayout [ axis = y ],
        ${rows} ],
    cover: View [ y = 400, width = 390, height = 200, onClick() { } ] ]`);
  const script = join(DIR, "fling.mjs");
  writeFileSync(script, `export const device = { width: 390, height: 700, touch: true };
export default async ({ drive, page }) => {
  await drive.drag("app.sc", 0, -260, 4);
  await drive.settleMotion();
  await drive.waitReal(1500);
  console.log("REST " + await page.evaluate(() => window.__declare.find("app.sc").scrollY));
};`);
  const r = run("verify.mjs", f, "--assert", script, "--rung=5", "--no-boot");
  assert.equal(r.status, 0, r.out);
  const rest = Number(/REST (\d+(?:\.\d+)?)/.exec(r.out)?.[1]);
  assert.ok(rest > 0, "the list scrolled: " + r.out);
  // a row's centre, at rest, under the layer (400–600) and inside the list (0–600)
  const under = Array.from({ length: 30 }, (_, i) => i).filter((i) => { const c = i * 50 + 25 - rest; return c >= 400 && c <= 600; });
  const line = r.out.split("\n").find((l) => l.includes("after drag app.sc") && l.includes("takes the presses of")) ?? "";
  assert.match(line, new RegExp(`${under.length} control\\(s\\) another view takes the presses of`), `at rest ${rest}, rows ${under.join(",")} are under the layer:\n${r.out}`);
  assert.ok(line.includes(`app.sc.r${under[0]} (by app.cover)`), line);
});

await test("a sheet a finger opens keeps the focus it gives its first field — the tap's late mousedown does not take it back — and a tap into a field still focuses it", () => {
  const f = join(DIR, "tapfocus.declare");
  writeFileSync(f, `App [ width = 390, height = 700,
    go: Button [ x = 20, y = 20, label = "Sign in", onClick() { app.s.show() } ],
    field: TextInput [ x = 20, y = 120, width = 300, accessibilityLabel = "Search" ],
    s: Sheet [ email: TextInput [ width = 300, name = "email", required = "Enter your email address.", accessibilityLabel = "Email" ] ] ]`);
  const script = join(DIR, "tapfocus.mjs");
  writeFileSync(script, `export const device = { width: 390, height: 700, touch: true };
export default async ({ drive, expect }) => {
  await drive.click("app.field");
  await drive.waitReal(200);
  await expect.attr("app.field", "focused", true);
  await drive.click("app.go");
  await drive.settleMotion();
  await drive.waitReal(300);
  await expect.attr("app.s.email", "focused", true);
  await expect.attr("app.s.email", "judged", false);
  await expect.attr("app.s.email", "error", "");
};`);
  const r = run("verify.mjs", f, "--assert", script, "--rung=5", "--no-boot");
  assert.equal(r.status, 0, r.out);
});

await test("an error a handler throws names the program's own code: the method that threw and what called it", () => {
  const f = join(DIR, "threw.declare");
  writeFileSync(f, `class Panel extends View [ width = 100, height = 40, items: any = null,
    count() -> number { return this.items.length },
    go() { this.count() } ]
App [ width = 300, height = 200,
    p: Panel [ ],
    b: Button [ y = 60, label = "Go", onClick() { app.p.go() } ] ]`);
  const script = join(DIR, "threw.mjs");
  writeFileSync(script, `export default async ({ drive }) => { await drive.click("app.b"); await drive.waitReal(200); };`);
  const r = run("verify.mjs", f, "--assert", script, "--rung=5", "--no-boot");
  assert.match(r.out, /threw: Cannot read properties of null \(reading 'length'\) — in Panel\.count \(line 2\), from Panel\.go \(line 3\)/, r.out);
});

await test("rung 6 asks the same layout questions in each named state", () => {
  const f = join(DIR, "driven6.declare");
  writeFileSync(f, `App [ width = 390, height = 700,
    go: Button [ x = 20, y = 20, width = 120, height = 48, label = "Open", onClick() { app.s.show() } ],
    s: Sheet [ Text [ text = "Pick" ], tiny: Button [ height = 30, label = "x", onClick() { } ] ] ]`);
  const states = join(DIR, "driven6.states.mjs");
  writeFileSync(states, `export default [ { name: "open", viewport: { width: 390, height: 700 }, touch: true,
  route: async ({ drive }) => { await drive.click("app.go"); await drive.settleMotion(); } } ];`);
  // the questions are asked as the state is captured: one blessing run shows them
  const r = run("verify.mjs", f, "--states", states, "--baselines", join(DIR, "driven6-baselines"), "--bless", "--rung=6");
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /layout in state 'open'[^\n]*app\.s\.body\.tiny 41×30/, r.out);
});

await test("a name missed on a class that a child of it holds is answered with the child's path", () => {
  const f = join(DIR, "dym.declare");
  writeFileSync(f, `class SignInForm [ width = 300,
    email: string = "",
    mailBox: View [ mail: TextInput [ width = 200, accessibilityLabel = "Mail" ] ],
    show() -> string { return this.mail.text } ]
App [ width = 400, height = 200, f: SignInForm [ ] ]`);
  const r = run("verify.mjs", f, "--rung", "3");
  assert.match(r.out, /'mail' is not a member of SignInForm — a child's is: 'mailBox\.mail'/, r.out);
  assert.doesNotMatch(r.out, /did you mean 'email'/, r.out);
});

await test("drive.wait is the program's time, not the world's; drive.waitReal waits for real", () => {
  const r = run("verify.mjs", SHOWN, "--assert", script("waits.mjs", `  const t0 = Date.now();
  await drive.wait(3000);
  const virtual = Date.now() - t0;
  const t1 = Date.now();
  await drive.waitReal(300);
  const real = Date.now() - t1;
  if (virtual > 1500) throw new Error("drive.wait(3000) took " + virtual + " ms of real time");
  if (real < 300) throw new Error("drive.waitReal(300) took only " + real + " ms");`), "--rung=5", "--no-boot");
  assert.equal(r.status, 0, r.out);
});

await test("expect.visible is what is shown: a view inside a hidden panel is not, and the panel is named", () => {
  const r = run("verify.mjs", SHOWN, "--assert", script("vis.mjs", `  await expect.visible("app.panel.inner");`), "--rung=5", "--no-boot");
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /expected 'app\.panel\.inner' visible — it isn't: 'app\.panel' above it is hidden/, r.out);
  const ok = run("verify.mjs", SHOWN, "--assert", script("vis2.mjs", `  await expect.visible("app.open");\n  await expect.hidden("app.panel.inner");`), "--rung=5", "--no-boot");
  assert.equal(ok.status, 0, ok.out);
});

await test("expect.hidden of a path that names nothing fails — a typo is not a pass", () => {
  const r = run("verify.mjs", SHOWN, "--assert", script("hid.mjs", `  await expect.hidden("app.panle.inner");`), "--rung=5", "--no-boot");
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /no node at 'app\.panle\.inner'/, r.out);
});

await test("an assert script that does not parse is said with its line, as the script's fault", () => {
  const r = run("verify.mjs", SHOWN, "--assert", script("bad.mjs", `  await drive.click("app.open";`), "--rung=5", "--no-boot");
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /bad\.mjs:2 — the script does not parse: missing \) after argument list/, r.out);
  assert.doesNotMatch(r.out, /behavior harness/, r.out);
});

await test("declare-look: --read of nothing fails with the reason; --js waiting on the app's clock is said in seconds", () => {
  const miss = run("look.mjs", SHOWN, "--read", "app.nothing.here");
  assert.equal(miss.status, 1, miss.out);
  assert.match(miss.out, /--read app\.nothing\.here: .*no/, miss.out);
  const t0 = Date.now();
  const js = run("look.mjs", SHOWN, "--js", "new Promise((r) => setTimeout(() => r(1), 500))");
  assert.equal(js.status, 1, js.out);
  assert.match(js.out, /--js is still waiting after 5 s: 1 timer is waiting on the app's clock/, js.out);
  assert.ok(Date.now() - t0 < 60_000, "said in seconds, not hung");
});

await test("drive.device(): the page loaded again on another device keeps its time on the driven clock", () => {
  const r = run("verify.mjs", SHOWN, "--assert", script("dev.mjs", `  await drive.device({ width: 390, height: 844, touch: true });
  await page.evaluate(() => { window.__fired = false; setTimeout(() => { window.__fired = true; }, 200); });
  await drive.wait(250);
  if (!(await page.evaluate(() => window.__fired))) await expect.fail("a timer in the reloaded page never fired under drive.wait");`), "--rung=5", "--no-boot");
  assert.equal(r.status, 0, r.out);
});

await test("verify reads `--rung N` with a space, before or after the file", () => {
  const before = run("verify.mjs", "--rung", "2", SHOWN);
  assert.equal(before.status, 0, before.out);
  assert.match(before.out, /clean through R2/, before.out);
  const r = spawnSync("node", [join(ROOT, "tools/verify.mjs"), SHOWN, "--rung", "3"], { cwd: ROOT, encoding: "utf8" });
  assert.match(r.stdout, /clean through R3/, r.stdout);
});

summarize("silent-failures");

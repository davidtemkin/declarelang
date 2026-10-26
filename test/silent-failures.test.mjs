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

await test("--semantics prints the whole tree, and direction reaches the page", () => {
  const r = run("look.mjs", BOOK, "--semantics", "--js", "document.querySelector('[data-declare-app]').dir + ' ' + getComputedStyle([...document.querySelectorAll('span')].find((d) => d.textContent === 'مرحبا')).textAlign");
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^ {6}text "row/m, "a fourth-level node is printed");
  assert.match(r.out, /js: "rtl right"/, "the App's direction is the element's dir, and its Text starts at the right");
});

await test("a field the program owns is judged by validate(), when typed and when the program sets it", () => {
  const f = join(DIR, "card.declare");
  writeFileSync(f, `App [ width = 400, height = 200, card: string = "",
    f: TextInput [ width = 300, accessibilityLabel = "Card", text = { app.card },
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

// silent-failures — what an agent met that went wrong without a word, each now
// either working or said: a whole dataset handed to a function goes stale no
// more; a write to a computed dataset and a rowIndex that is always 0 are
// warned of; a misplaced two-way arrow names the form that works; the semantic
// tree prints whole; a paragraph's direction reaches the page; a field the
// program owns is still judged by its validate(); a combobox picks the item
// autofill fills in; an input handler reads the caret after the keystroke, and
// a field that regroups as it is typed keeps the caret where the person was.
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

summarize("silent-failures");

// reader-overlay-semantics — what a reader of a value, a press through the
// overlays, and a screen reader are given, checked in Chrome through
// declare-verify; and the messages that name a mistake where it is made.
//   - a constraint reading a computed default that is evaluated at each read
//     (a schema-typed one) follows every input the default reads, including one
//     behind a closure the first evaluation never ran;
//   - overlays judge a press in the order they paint, so a toast said in the
//     press that opens a sheet is above it, not a press outside it;
//   - styled runs of rich text are words to a screen reader and to expect.text;
//   - a radio of your own is any direct child of a RadioGroup with a `choice`:
//     the group checks the one an arrow lands on;
//   - the messages: a member one level down, `->` in an arrow function, a field
//     two arrays deep, a key handler that drops the control's own, a padded view
//     its children count out, and `null` in an optional schema field.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-reader-overlay-");

/** verify `source` (with an assert script when given) and answer what it printed. */
function verify(name, source, script = null) {
  const file = join(DIR, name + ".declare");
  writeFileSync(file, source);
  const args = [join(ROOT, "tools/verify.mjs"), file];
  if (script !== null) { writeFileSync(join(DIR, name + ".mjs"), script); args.push("--assert", join(DIR, name + ".mjs")); }
  const p = spawnSync("node", args, { cwd: ROOT, encoding: "utf8" });
  return (p.stdout ?? "") + (p.stderr ?? "");
}

await test("a reader of a schema-typed computed default follows an input its closure reads only once the list has items", () => {
  const out = verify("live-default", `schema SavedCard [ id: string ]
App [ width = 200, height = 100, cards: SavedCard[] = [], pick: string = "a",
    saved: SavedCard? = { app.cards.find((c) => c.id == app.pick) ?? null },
    using: boolean = { app.saved != null } ]`, `export default async ({ drive, page, expect }) => {
  const set = (k, v) => page.evaluate((k, v) => { window.__declare.find("app")[k] = v; }, k, v);
  await drive.settleMotion();
  await set("cards", [{ id: "a" }]); await drive.settleMotion();
  await expect.attr("app", "using", true);
  await set("pick", "b"); await drive.settleMotion();
  await expect.attr("app", "using", false);
  await set("pick", "a"); await drive.settleMotion();
  await expect.attr("app", "using", true);
};`);
  assert.match(out, /R5 ✓/, out);
});

await test("a toast said as a sheet opens paints above it: a press on the sheet's button under the toast is the button's, and the sheet stays", () => {
  const out = verify("toast-sheet", `App [
    open: boolean = false, hits: number = 0,
    Button [ x = 20, y = 20, label = "Open", onClick() { app.open = true; app.toast.say("Logged", null) } ],
    s: Sheet [ edge = "end", shown = { app.open }, accessibilityLabel = "Detail", input(o: boolean) { app.open = o },
        View [ width = 100%, layout: SimpleLayout [ axis = y, spacing = 12 ],
            View [ width = 100%, height = 640 ],
            Button [ width = 100%, label = "Edit", onClick() { app.hits = app.hits + 1 } ] ] ],
    toast: Toast [ duration = 4000 ] ]`, `export const device = { width: 390, height: 844, touch: true };
export default async ({ drive, expect }) => {
  await drive.click('app."Open"');
  await drive.settleMotion();
  await expect.attr("app.toast", "shown", true);
  await drive.click('app.s."Edit"');
  await drive.settleMotion();
  await expect.attr("app", "hits", 1);
  await expect.attr("app", "open", true);
};`);
  assert.match(out, /R5 ✓/, out);
});

await test("styled runs are words: the semantic tree and expect.text read a figure set in its own style", () => {
  const out = verify("styled-runs", `App [ width = 400, height = 200,
    line: HTMLText [ x = 10, y = 10, width = 380, textStyles = { { fig: ({ fontSize: 40 }) } },
        html = "<span class='fig'>4</span> sessions · <span class='fig'>3</span>h <span class='fig'>40</span>m" ] ]`,
  `export default async ({ page, expect }) => {
  const sem = await page.evaluate(() => window.__declare.semantics());
  if (!sem.includes("4 sessions · 3h 40m")) throw new Error("semantics: " + sem);
  await expect.text("app.line", "4 sessions · 3h 40m");
};`);
  assert.match(out, /R5 ✓/, out);
});

await test("a radio of your own is a direct child with a choice: the group checks the one an arrow lands on", () => {
  const out = verify("own-radio", `class Box extends Control [ width = 60, height = 40, choice: string = "",
    accessibilityRole = radio, accessibilityLabel = { choice }, accessibilityChecked = { (parent as RadioGroup).value == choice },
    press() { (parent as RadioGroup).pick(choice) } ]
App [ width = 300, height = 100, picked: string = "a",
    g: RadioGroup [ x = 10, y = 10, value = { app.picked }, input(v: string) { app.picked = v },
        layout: SimpleLayout [ axis = x, spacing = 6 ],
        a: Box [ choice = "a" ], b: Box [ choice = "b" ], c: Box [ choice = "c" ] ] ]`,
  `export default async ({ drive, expect }) => {
  await drive.key("Tab");
  await drive.key("ArrowRight");
  await expect.attr("app", "picked", "b");
  await drive.key("ArrowRight");
  await expect.attr("app", "picked", "c");
};`);
  assert.match(out, /R5 ✓/, out);
});

await test("a member one level down is named: 'pages.listPage', not 'declare it'", () => {
  const out = verify("child-path", `App [ width = 200, height = 100,
    go() { Focus.focus(app.listPage.heading) },
    pages: View [ listPage: View [ heading: Text [ text = "x" ] ] ] ]`);
  assert.match(out, /a child's is: 'pages\.listPage'/, out);
});

await test("'->' in an arrow function says the arrow's own spelling", () => {
  const out = verify("arrow-ret", `App [ width = 10, height = 10,
    go() { const f = (c: number) -> number => c * 2; return f(1) } ]`);
  assert.match(out, /its return type is written '\(c: number\): number => …'/, out);
});

await test("a schema field two arrays deep says a field is one array deep", () => {
  const out = verify("nested-array", `schema Plan [ radii: number[][], w: number ]
App [ width = 10, height = 10 ]`);
  assert.match(out, /a schema field is one array deep/, out);
});

await test("an onKeyDown on a Control that never calls super is warned (DECLARE4031); one that hands on is not", () => {
  const bad = verify("keydown-bad", `class Seat extends Control [ width = 20, height = 20,
    onKeyDown(e: KeyEvent) { if (e.key == "ArrowLeft") app.n = app.n - 1 } ]
App [ width = 100, height = 100, n: number = 0, Seat [ ] ]`);
  assert.match(bad, /DECLARE4031/, bad);
  const good = verify("keydown-good", `class Seat extends Control [ width = 20, height = 20,
    onKeyDown(e: KeyEvent) { if (e.key == "ArrowLeft") app.n = app.n - 1; else super.onKeyDown(e) } ]
App [ width = 100, height = 100, n: number = 0, Seat [ ] ]`);
  assert.doesNotMatch(good, /DECLARE4031/, good);
});

await test("a padded view whose only child centres itself in it is said to be its padding; a label centred on a point is not", () => {
  const pill = verify("pill", `class Pill extends Control [ height = 40, padding = [0, 14, 0, 14],
    TextLabel [ x = center, y = center, text = "2 weeks" ] ]
App [ width = 300, height = 100, Pill [ x = 10, y = 10 ] ]`);
  assert.match(pill, /Pill\.width is only its padding/, pill);
  const pin = verify("pin", `App [ width = 300, height = 100, View [ x = 100, y = 50, Text [ x = center, y = center, text = "pin" ] ] ]`);
  assert.match(pin, /R4 ✓/, pin);
});

await test("an optional schema field takes null in a record the program builds", () => {
  const out = verify("optional-null", `schema Draft [ sport: string, km?: number ]
App [ width = 200, height = 100, has: boolean = true,
    draft: Draft = { { sport: "run", km: app.has ? 3 : null } } ]`);
  assert.match(out, /R3 ✓/, out);
});

for (const touch of [false, true]) {
  await test(`an assert script's page finds by role, label and text, as Playwright's does, and acts through the driver${touch ? " (a finger)" : ""}`, () => {
    const out = verify("locators" + (touch ? "-touch" : ""), `App [ width = 400, height = 300, said: string = "", size: string = "m",
    col: View [ x = 20, y = 20, layout: SimpleLayout [ axis = y, spacing = 10 ],
        Field [ label = "Email", TextInput [ width = 200, text = { app.said }, onInput(v: string) { app.said = v } ] ],
        RadioGroup [ value = { app.size }, input(v: string) { app.size = v },
            Radio [ choice = "s", label = "Small" ], Radio [ choice = "m", label = "Medium" ] ],
        Button [ label = { "Send " + app.said }, onClick() { app.said = "sent" } ] ] ]`,
    `${touch ? "export const device = { width: 390, height: 844, touch: true };\n" : ""}export default async ({ page, expect }) => {
  await page.getByLabel("Email").fill("ada@example.com");
  await expect.attr("app", "said", "ada@example.com");
  if (await page.getByRole("button", { name: "Send ada@example.com" }).count() !== 1) throw new Error("button not found by its name");
  await page.getByRole("radio", { name: "Small" }).check();
  await expect.attr("app", "size", "s");
  await page.getByRole("button", { name: /^Send/ }).click();
  await expect.attr("app", "said", "sent");
  await page.getByText("Medium").waitFor();
  let strict = null;
  try { await page.getByRole("radio").click(); } catch (e) { strict = e.message; }
  if (!/matches 2 elements/.test(strict ?? "")) throw new Error("strict mode: " + strict);
};`);
    assert.match(out, /R5 ✓/, out);
  });
}

await test("a surface that claims x takes the sideways wheel and leaves a vertical one to scroll the page", () => {
  const out = verify("wheel-axis", `App [ width = 400, height = 300, panned: number = 0,
    col: View [ width = 100%, layout: SimpleLayout [ axis = y ],
        chart: View [ width = 100%, height = 150, claim = x, fill = gainsboro,
            onWheel(e: WheelEvent) { app.panned = app.panned + e.deltaX } ],
        View [ width = 100%, height = 900 ] ] ]`, `export default async ({ drive, expect, page }) => {
  await drive.wheel("app.col.chart", 400);
  const y = await page.evaluate(() => window.__declare.find("app").scrollY);
  if (!(y > 0)) throw new Error("a vertical wheel over the chart did not scroll the page: scrollY " + y);
  await expect.attr("app", "panned", 0);
  await page.evaluate(() => window.__declare.find("app").scrollTo(0));
  await drive.settleMotion();
  await drive.wheel("app.col.chart", 0, 120);
  const p = await page.evaluate(() => window.__declare.find("app").panned);
  if (!(p > 0)) throw new Error("a sideways wheel did not reach the chart: panned " + p);
};`);
  assert.match(out, /R5 ✓/, out);
});

await test("a locator does not find what an open sheet puts out of reach", () => {
  const out = verify("locator-inert", `App [ width = 400, height = 300, open: boolean = false, signedIn: boolean = false,
    Button [ x = 20, y = 20, label = "Sign in", onClick() { app.open = true } ],
    s: Sheet [ edge = "end", accessibilityLabel = "Sign in", shown = { app.open }, input(o: boolean) { app.open = o },
        Button [ label = "Sign in", onClick() { app.signedIn = true } ] ] ]`, `export default async ({ page, drive, expect }) => {
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleMotion();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect.attr("app", "signedIn", true);
};`);
  assert.match(out, /R5 ✓/, out);
});

summarize("reader-overlay-semantics");

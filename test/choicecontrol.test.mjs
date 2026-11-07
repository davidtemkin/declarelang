// choicecontrol — a choice among several drawn as the author likes: a
// ChoiceControl holds what is chosen, its direct children with a `choice` are
// the items. One of several and several at once, by pointer and keyboard and
// as a screen reader hears them; anything else among the items is drawing; a
// RadioGroup is one with the radio's words, unchanged; an item outside a
// control is said where it is written.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-choice-");
const run = (...args) => {
  const r = spawnSync("node", [join(ROOT, "tools", "verify.mjs"), ...args], { cwd: ROOT, encoding: "utf8" });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
};
const file = (name, src) => { const f = join(DIR, name); writeFileSync(f, src); return f; };
const KEY = `class Key extends ChoiceItem [ width = 60, height = 40, fill = { on ? 0x1E2A38 : 0xE7EBF1 },
    TextLabel [ x = center, y = center, text = { classroot.choice } ] ]
`;
const tags = `(await page.evaluate(() => window.__declare.find("app").tags.join(",")))`;

await test("one of several and several at once: pointer, arrows, Space, and what a screen reader hears", () => {
  const f = file("both.declare", KEY + `App [ width = 400, height = 160,
    size: string = "M",
    tags: string[] = [],
    ChoiceControl [ x = 20, y = 20, value <-> app.size, accessibilityLabel = "Size",
        layout: SimpleLayout [ axis = x, spacing = 8 ],
        Text [ text = "Size" ],
        Key [ choice = "S" ], Key [ choice = "M" ], Key [ choice = "L" ] ],
    ChoiceControl [ x = 20, y = 80, multiple = true, values <-> app.tags, accessibilityLabel = "Extras",
        layout: SimpleLayout [ axis = x, spacing = 8 ],
        Key [ choice = "Ice" ], Key [ choice = "Milk" ], Key [ choice = "Shot" ] ] ]`);
  const s = file("both.mjs", `export default async ({ drive, expect, page }) => {
  await expect(page.getByRole("option", { name: "M", exact: true, selected: true })).toBeVisible();
  await page.getByRole("option", { name: "L", exact: true }).click();
  await expect.attr("app", "size", "L");
  await drive.key("ArrowLeft");
  await expect.attr("app", "size", "M");
  await drive.key("ArrowLeft"); await drive.key("ArrowLeft");
  await expect.attr("app", "size", "L");
  await page.getByRole("option", { name: "Milk", exact: true }).click();
  await page.getByRole("option", { name: "Ice", exact: true }).click();
  await expect.equal(${tags}, "Milk,Ice");
  await page.getByRole("option", { name: "Milk", exact: true }).click();
  await expect.equal(${tags}, "Ice");
  await drive.key("ArrowRight"); await drive.key(" ");
  await expect.equal(${tags}, "Ice,Shot");
  await expect(page.getByRole("listbox", { name: "Extras" })).toHaveAttribute("aria-multiselectable", "true");
  await expect.equal(await page.getByRole("listbox", { name: "Size" }).getAttribute("aria-multiselectable"), null);
};`);
  const r = run(f, "--assert", s, "--rung=5", "--no-boot");
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /R5 ✓/, r.out);
});

await test("a RadioGroup is a ChoiceControl said as radios, as before", () => {
  const f = file("radios.declare", `App [ width = 300, height = 160, size: string = "m",
    RadioGroup [ x = 20, y = 20, value <-> app.size, accessibilityLabel = "Size",
        Radio [ choice = "s", label = "Small" ], Radio [ choice = "m", label = "Medium" ], Radio [ choice = "l", label = "Large" ] ] ]`);
  const s = file("radios.mjs", `export default async ({ drive, expect, page }) => {
  await expect(page.getByRole("radiogroup", { name: "Size" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Medium" })).toBeChecked();
  await page.getByRole("radio", { name: "Large" }).click();
  await expect.attr("app", "size", "l");
  await drive.key("ArrowUp");
  await expect.attr("app", "size", "m");
  await expect.equal(await page.evaluate(() => document.querySelector("[role=radio][aria-selected]")), null);
};`);
  const r = run(f, "--assert", s, "--rung=5", "--no-boot");
  assert.equal(r.status, 0, r.out);
});

await test("several at once and required: none chosen is the problem", () => {
  const f = file("req.declare", KEY + `App [ width = 300, height = 100,
    extras: ChoiceControl [ multiple = true, required = "Pick one", accessibilityLabel = "Extras",
        layout: SimpleLayout [ axis = x ], Key [ choice = "a" ], Key [ choice = "b" ] ] ]`);
  const s = file("req.mjs", `export default async ({ drive, expect, page }) => {
  await expect.attr("app.extras", "problem", "Pick one");
  await page.getByRole("option", { name: "a", exact: true }).click();
  await expect.attr("app.extras", "problem", "");
};`);
  const r = run(f, "--assert", s, "--rung=5", "--no-boot");
  assert.equal(r.status, 0, r.out);
});

await test("an item outside a ChoiceControl is said where it is written; a misplaced Radio keeps its warning", () => {
  const f = file("alone.declare", KEY + `App [ width = 300, height = 100, layout: SimpleLayout [ axis = x ],
    Key [ choice = "a" ],
    View [ Radio [ choice = "b", label = "B" ] ] ]`);
  const r = run(f, "--rung=3");
  assert.match(r.out, /Key is a ChoiceItem outside a ChoiceControl[^\n]*\[DECLARE4036\] \(line 4/, r.out);
  assert.match(r.out, /Radio is a radio outside a RadioGroup[^\n]*DECLARE4032/, r.out);
});

summarize("choicecontrol");

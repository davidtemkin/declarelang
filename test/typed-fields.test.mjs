// typed-fields — what typing does at a field's edges, with real keys in Chrome:
// a Combobox settles the query a person typed letter by letter when they leave
// it, and Return under a Form's enterMoves walks only the fields typed into
// (Venue run 20, 2026-11-02: a country typed whole was never picked, and Return
// in a password field stopped on "Show password" instead of signing in).
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-typed-fields-");

function verify(name, program, script) {
  const app = join(DIR, `${name}.declare`), f = join(DIR, `${name}.assert.mjs`);
  writeFileSync(app, program);
  writeFileSync(f, script);
  return spawnSync(process.execPath, [join(ROOT, "tools/verify.mjs"), app, "--assert", f, "--rung=5", "--no-boot"], { cwd: ROOT, encoding: "utf8" });
}

await test("a Combobox picks what was typed letter by letter on leaving, and takes back a choice its text no longer names", () => {
  const r = verify("combo", `App [ width = 400, height = 300,
    col: View [ x = 20, y = 20, layout: SimpleLayout [ axis = y, spacing = 12 ],
        c: Combobox [ width = 240, accessibilityLabel = "Country", items = ["United States", "Canada", "United Kingdom"] ],
        next: TextInput [ width = 240, accessibilityLabel = "Postal code", text = "", onInput(v: string) { } ]
        ]
    ]`, `export default async ({ drive, expect, page }) => {
    await drive.click("app.col.c.entry");
    await page.keyboard.type("canada", { delay: 30 });
    await page.keyboard.press("Tab");
    await drive.wait(300);
    await expect.attr("app.col.c", "value", "Canada");
    await drive.click("app.col.c.entry");
    await page.keyboard.press("End");
    await page.keyboard.type("xx", { delay: 30 });
    await page.keyboard.press("Tab");
    await drive.wait(300);
    await expect.attr("app.col.c", "value", null);
  };`);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

await test("Return under enterMoves walks the fields typed into: a checkbox between is not a stop", () => {
  const r = verify("enter", `App [ width = 400, height = 300, sent: number = 0,
    f: Form [ x = 20, y = 20, width = 300, enterMoves = true,
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        send() { app.sent = app.sent + 1 },
        email: TextInput [ name = "email", width = 240, accessibilityLabel = "Email", text = "a@b.co", onInput(v: string) { } ],
        password: TextInput [ name = "password", width = 240, accessibilityLabel = "Password", text = "pw", onInput(v: string) { } ],
        show: Checkbox [ label = "Show password" ]
        ]
    ]`, `export default async ({ drive, expect, page }) => {
    await drive.click("app.f.email");
    await page.keyboard.press("Enter");
    await drive.wait(200);
    await expect.attr("app.f.password", "focused", true);
    await page.keyboard.press("Enter");
    await drive.wait(200);
    await expect.attr("app", "sent", 1);
  };`);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

summarize("typed-fields");

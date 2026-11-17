// unsaved-changes — `app.unsavedChanges` is a fact the program states; while it is
// true, leaving the page asks first (the browser's own "Leave site?"), and while it
// is false, nothing stands in the way. The Mac host's half (the window's edited mark,
// and the question on close and quit) is in mac-host.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await test("leaving the page asks while unsavedChanges is true, and not once it is false", () => {
  const dir = tempDir("declare-unsaved-");
  const app = join(dir, "unsaved.declare");
  writeFileSync(app, `App [ width = 300, height = 200, pending: number = 1, unsavedChanges = { app.pending > 0 } ]`);
  const flow = join(dir, "flow.mjs");
  writeFileSync(flow, `export default async ({ drive, page }) => {
    const asks = () => page.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    if (await asks() !== true) throw new Error("with changes unsaved, leaving should ask");
    await drive.set("app", "pending", 0);
    await drive.settleData();
    if (await asks() !== false) throw new Error("with everything saved, leaving should not ask");
  };`);
  const r = spawnSync(process.execPath, [join(ROOT, "tools/verify.mjs"), app, "--assert", flow, "--rung=5", "--no-boot"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

summarize("unsaved-changes");

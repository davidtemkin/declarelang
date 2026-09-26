// test/swatchbook.test.mjs — Swatchbook's matrix, DOM against canvas.
//
// One program holds every combination of what a view can look like (type,
// lines, rich text, paint, effects, transforms, images, drawing, and where they
// combine). This renders its matrix once per renderer and compares both ways
// tools/crossrender.mjs compares: every view's box and baseline, exactly, and
// every swatch's pixels against the per-swatch baseline recorded in
// apps/swatchbook/tests/pixels.json (anti-aliasing and resampling that were
// always there pass; a swatch that gets worse fails, and is named). The Mac is
// the native gate's to run.
//
//   node tools/crossrender.mjs apps/swatchbook/swatchbook.declare --hash matrix --pixels \
//     --baseline apps/swatchbook/tests/pixels.json --bless      # after an intended change

import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test, summarize } from "./harness.mjs";
import { createDeclareServer } from "../server/create.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});
const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${httpServer.address().port}`;

try {
  await test("the matrix lays out and paints alike on DOM and canvas", async () => {
    const out = await new Promise((resolve) => {
      execFile(process.execPath, [path.join(ROOT, "tools/crossrender.mjs"), "apps/swatchbook/swatchbook.declare",
        "--hash", "matrix", "--pixels", "--baseline", "apps/swatchbook/tests/pixels.json"],
        { cwd: ROOT, env: { ...process.env, DECLARE_ORIGIN: ORIGIN }, timeout: 180000 },
        (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, text: stdout + stderr }));
    });
    assert.equal(out.code, 0, "\n" + out.text.trim());
  });
} finally {
  httpServer.close();
}

summarize("swatchbook");

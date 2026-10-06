// kernel-growth — the capacities are an opening size, not a ceiling.
//
// Whole programs boot headlessly on kernels opened TINY (a few dozen cells,
// rules and reads), so the kernel grows many times while the program is built
// and settled: the WebAssembly kernel between settles and at allocating calls
// (kernel-loader.ts reserve), the JavaScript one as it goes. The settled tree —
// every view's geometry and visibility, every Text's words — must equal the
// same program booted at the default capacities, on both kernels. One program
// per child process: a process chooses its kernel once.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize } from "./harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TINY = JSON.stringify({ extra_elems: 8, extra_cells: 64, extra_rules: 16, dyn_edges: 64, code_words: 64, consts: 8 });

const CHILD = `
import { readFile } from "node:fs/promises";
import path from "node:path";
const [root, file, caps] = process.argv.slice(1);
const R = await import(path.join(root, "runtime/dist/reactive.js"));
await R.kernelReady(caps === "default" ? undefined : JSON.parse(caps));
const { compile } = await import(path.join(root, "compiler/dist/compile-node.js"));
const { settleSource } = await import(path.join(root, "compiler/dist/headless.js"));
const r = await compile(await readFile(file, "utf8"), { originDir: path.dirname(file), mainId: file });
if (r.errors.length) { console.log(JSON.stringify({ error: r.errors[0].message })); process.exit(0); }
const app = settleSource(r.source, { deps: r.deps });
const out = [];
const walk = (v, p) => {
  const t = typeof v.text === "string" ? v.text : null;
  out.push([p, v.x, v.y, v.width, v.height, v.visible, t]);
  (v.childViews ?? []).forEach((c, i) => walk(c, p + "/" + i));
};
walk(app, "app");
console.log(JSON.stringify({ kernel: globalThis.__declareKernelKind, stats: R.kernelStats(0), views: out }));
app.discard();
`;

function boot(file, caps, kernel) {
  const env = { ...process.env, ...(kernel === "js" ? { DECLARE_KERNEL: "js" } : {}) };
  const raw = execFileSync(process.execPath, ["--input-type=module", "-e", CHILD, ROOT, file, caps], { env, encoding: "utf8", maxBuffer: 64 << 20 });
  return JSON.parse(raw.trim().split("\n").pop());
}

for (const app of ["calendar", "weather", "tracker"]) {
  const file = path.join(ROOT, "apps", app, `${app}.declare`);
  await test(`${app}: a kernel opened tiny grows and settles the same tree, on WebAssembly and JavaScript`, () => {
    const base = boot(file, "default", "wasm");
    assert.ok(base.views?.length > 20, `${app} booted (${base.error ?? base.views?.length + " views"})`);
    for (const kernel of ["wasm", "js"]) {
      const tiny = boot(file, TINY, kernel);
      assert.equal(tiny.kernel, kernel, `the ${kernel} kernel ran`);
      assert.ok(tiny.stats.cells > 64, `${kernel}: grew past its opening capacity (${tiny.stats.cells} cells)`);
      assert.deepEqual(tiny.views, base.views, `${kernel}: the settled tree differs from the default boot`);
    }
  });
}

summarize("kernel-growth");

// sizemap — what the shipped calendar bundle weighs, and where. Builds the
// production bundle the size gate builds, then prices its parts: the embedded
// kernel (base64), and the same bundle from MAIN for the delta.
//
//   node mac-host/profile/sizemap.mjs [--root /Users/temkin/Code/Declare]
import { readFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const i = argv.indexOf("--root");
const ROOT = i >= 0 ? path.resolve(argv[i + 1]) : path.resolve(HERE, "../..");
const gz = (s) => zlib.gzipSync(typeof s === "string" ? Buffer.from(s) : s).length;
const kb = (n) => (n / 1024).toFixed(1) + " KB";

const { buildProduction } = await import(path.join(ROOT, "tools/declarec.mjs"));
const src = readFileSync(path.join(ROOT, "apps/calendar/calendar.declare"), "utf8");
const out = await buildProduction(src, { name: "calendar", originDir: path.join(ROOT, "apps/calendar") });
if (!out.ok) { console.error("build failed:", out.errors?.map((e) => e.message).join("; ")); process.exit(1); }
const app = out.files.find((f) => f.name.startsWith("app.")).contents;

console.log(`${path.basename(ROOT)}  app bundle  raw ${kb(app.length)}  gz ${kb(gz(app))}`);

// the embedded kernel: a long base64 string literal
const m = /"([A-Za-z0-9+/=]{2000,})"/.exec(app);
if (m) {
  const withoutBlob = app.replace(m[0], '""');
  const blobGz = gz(app) - gz(withoutBlob);
  const wasmRaw = Buffer.from(m[1], "base64");
  console.log(`  embedded kernel        base64 raw ${kb(m[1].length)}  costs gz ${kb(blobGz)}`);
  console.log(`  same module, RAW bytes            raw ${kb(wasmRaw.length)}  gz ${kb(gz(wasmRaw))}  → saving ${kb(blobGz - gz(wasmRaw))}`);
  console.log(`  bundle without it                 gz ${kb(gz(withoutBlob))}`);
} else console.log("  (no embedded kernel blob found)");

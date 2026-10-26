// test/page-api.test.mjs — browser/declare-boot.d.ts, the page's side of embedding,
// held to what the code really is. The file types the bundle for embedders AND is
// the source of the reference's Embedding entries (extract.mjs), so a declaration
// that drifts from the code misleads both at once. The handles' own members are
// pinned where the handles exist: Tenant in embed.test (a real browser), the
// island's handle in island.test.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { test, summarize } from "./harness.mjs";
import { PAGE_API_FILE as D, pageApiSource as sf, membersOf } from "./page-api.mjs";

const PAGE_API = { BootOptions: membersOf("BootOptions") };

await test("the bundle exports exactly what the declaration says: boot (default) and observe", () => {
  const bundle = readFileSync("bundles/declare-boot.js", "utf8");
  const m = bundle.match(/export\s*\{([^}]*)\}\s*;?\s*$/);
  assert.ok(m, "the bundle ends in one export statement");
  const exported = m[1].split(",").map((x) => x.trim().split(/\s+as\s+/).pop()).sort();
  const declared = sf.statements.filter((s) => ts.isFunctionDeclaration(s))
    .map((s) => (s.modifiers ?? []).some((x) => x.kind === ts.SyntaxKind.DefaultKeyword) ? "default" : s.name.text).sort();
  assert.deepEqual(exported, declared);
});

await test("every declared boot option is one the boot really reads", () => {
  const src = readdirSync("browser").filter((f) => f.endsWith(".js")).map((f) => readFileSync("browser/" + f, "utf8")).join("\n");
  for (const opt of PAGE_API.BootOptions) assert.match(src, new RegExp(`cfg\\.${opt}\\b`), `boot option '${opt}' is read nowhere (cfg.${opt})`);
});

await test("every declaration carries prose — it is what the reference and declare-help show", () => {
  const holes = [];
  const docOf = (n) => ts.getJSDocCommentsAndTags(n).filter(ts.isJSDoc).map((j) => ts.getTextOfJSDocComment(j.comment) ?? "").join("").trim();
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && !docOf(s)) holes.push(s.name.text);
    if (ts.isInterfaceDeclaration(s) && ["BootOptions", "Tenant", "IslandHandle"].includes(s.name.text)) {
      if (!docOf(s)) holes.push(s.name.text);
      for (const m of s.members) if (m.name && !docOf(m)) holes.push(`${s.name.text}.${m.name.getText(sf)}`);
    }
  }
  assert.deepEqual(holes, []);
});

await test("the bundle ships its types beside it", () => {
  assert.equal(readFileSync("bundles/declare-boot.d.ts", "utf8"), readFileSync(D, "utf8"));
});

summarize("page-api");

// gen-themes — library/themes/*.declare ──► runtime/src/themes-data.ts
//
// The theme presets are AUTHORED IN THE LANGUAGE: each city file carries
// `theme Name [ tokens ]` declarations, parsed by the real parser and validated
// by the checker's own token rules (checkThemeRecord + coerceToken — the same
// functions a program's own `theme` declaration goes through). This tool
// projects the records into a generated runtime module so themes.ts serves the
// presets by name from those objects — one authored source, no drift (the
// freshness gate is test/themes.test.mjs; run this after editing a theme).
//
//   node tools/internal/gen-themes.mjs            # regenerate
//   node tools/internal/gen-themes.mjs --check    # exit 1 when stale

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLibrary } from "../../runtime/dist/parser.js";
import { checkThemeRecord, coerceToken } from "../../runtime/dist/check.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(ROOT, "library/themes");
const OUT = path.join(ROOT, "runtime/src/themes-data.ts");
const CHECK = process.argv.includes("--check");

const records = [];
for (const f of readdirSync(SRC).filter((f) => f.endsWith(".declare")).sort()) {
  const source = readFileSync(path.join(SRC, f), "utf8");
  const lib = parseLibrary(source);
  for (const decl of lib.themes) {
    const rec = decl.body; // a `theme Name [ … ]` body IS the token record
    const errs = checkThemeRecord(`theme ${decl.name}`, rec);
    if (errs.length > 0) throw new Error("gen-themes: " + errs.map((e) => e.message).join("\n  "));
    // token order and literal form (color vs number) follow the authored source
    const tokens = rec.attrs.map((a) => ({
      name: a.name,
      value: coerceToken(a.value),
      color: a.value.kind === "hexColor" || (a.value.kind === "ident" && typeof coerceToken(a.value) === "number"),
    }));
    records.push({ name: decl.name, tokens });
  }
}
if (records.length === 0) throw new Error("gen-themes: no theme declarations found in library/themes/");

const emit = (t) => {
  if (t.color && typeof t.value === "number") return `0x${t.value.toString(16).toUpperCase().padStart(6, "0")}`;
  return JSON.stringify(t.value);
};
// Each record is its OWN named export so a consumer of one doesn't carry the
// others — the assembled THEME_RECORDS table below is the by-name surface
// themes.ts serves. `/* @__PURE__ */` marks each freeze side-effect-free so
// esbuild can tree-shake the records a build never references.
const decls = records
  .map((r) => `export const ${r.name}: Readonly<Record<string, unknown>> = /* @__PURE__ */ Object.freeze({\n${r.tokens.map((t) => `  ${t.name}: ${emit(t)},`).join("\n")}\n});`)
  .join("\n\n");
const body = records.map((r) => `  ${r.name},`).join("\n");
const next = `// GENERATED from library/themes/*.declare by tools/internal/gen-themes.mjs — DO NOT EDIT.
// The presets are authored in the language (theme Name [ … ]); this module is
// their projection into the runtime, so themes.ts serves the SAME objects the
// authored files declare, by name.

${decls}

export const THEME_RECORDS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = /* @__PURE__ */ Object.freeze({
${body}
});
`;

const current = (() => { try { return readFileSync(OUT, "utf8"); } catch { return null; } })();
if (current === next) {
  console.log(`gen-themes: fresh (${records.length} records)`);
} else if (CHECK) {
  console.log("gen-themes: STALE — run `node tools/internal/gen-themes.mjs` (library/themes/ changed)");
  process.exit(1);
} else {
  writeFileSync(OUT, next);
  console.log(`gen-themes: wrote runtime/src/themes-data.ts (${records.length} records: ${records.map((r) => r.name).join(", ")})`);
}

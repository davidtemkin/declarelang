// surfaces — ONE registry that owns the definition of "public surface".
//
// The question this exists to answer, in one place: *is everything a program can
// name reachable in the documentation?* Before this, that answer was spread across
// five tests in two files, each organized around whichever registry it happened to
// read — so the honest reply to "is every public interface exposed?" was "there are
// several tests, and I'd have to go look."
//
// That shape had already failed twice in one week, the same way both times: a gate
// enumerated the sources somebody remembered, so the source nobody listed went
// ungated and green. `App.createView`/`View.raise`/`Layout.laid` were supported,
// typechecked and absent from the reference for a year; then the gate written to
// fix that missed `declare const`, leaving `Themes` — the call the theme docs tell
// you to make — absent in turn.
//
// So the fix is the one `derive.mjs` already models for build order: make ONE thing
// own the definition, and iterate it. A surface is a row here or it is not gated,
// and an ungated row must say why — silence and a decision must not look the same
// (documentation.md §4a).
//
// Each row carries its own `check`, because the surfaces genuinely differ in what
// "documented" means: a class needs an entry AND a rail position, an attribute needs
// prose, the shared vocabulary needs projection, theme tokens need the preset to
// state them. Flattening those into one predicate would lose the specificity that
// makes each failure message actionable. What is unified is the ENUMERATION, which
// is the part that was missing.
//
// `spineKeys` ties a row to the assembled spine sections it covers, so
// `everySpineSectionHasASurface()` fails when a new registry reaches the spine
// without anyone deciding whether it is gated. That is the form-agnostic lesson,
// applied one level up.

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/** The PRELUDE text — the shared vocabulary declared into every check block. The
 *  literal closes with a backtick-semicolon at the END of its last line, so a
 *  "\n`;" split runs to EOF and silently scans the whole file. */
export function preludeText() {
  const src = read("compiler/src/scaffold.ts");
  const t = src.split("const PRELUDE = `")[1]?.split(/`;\s*$/m)[0] ?? "";
  if (!t.includes("interface Draw")) throw new Error("the PRELUDE boundary no longer matches — surfaces.mjs is reading the wrong text");
  return t;
}

const railNames = (model) => {
  const out = new Set();
  const walk = (nodes) => { for (const n of nodes ?? []) n.kind === "category" ? walk(n.children) : n.kind === "element" && out.add(n.name); };
  walk(model.browse);
  return out;
};

export const SURFACES = [
  {
    id: "components",
    label: "every component class — runtime and library",
    source: "runtime SCHEMAS + library/autoincludes.json",
    docsLive: "the reference, and the browse rail",
    spineKeys: ["schemas", "librarySchemas", "library"],
    gated: true,
    async check(model) {
      const { SCHEMAS } = await import("../../../runtime/dist/schema.js");
      const manifest = JSON.parse(read("library/autoincludes.json"));
      const expected = [...Object.keys(SCHEMAS), ...Object.keys(manifest).filter((k) => !k.startsWith("$"))];
      const rail = railNames(model);
      return expected.flatMap((n) => [
        ...(n in model.reference ? [] : [`${n} — no reference entry`]),
        ...(rail.has(n) ? [] : [`${n} — absent from the browse rail`]),
      ]);
    },
  },
  {
    id: "attributes",
    label: "every attribute in the reference carries prose",
    source: "the assembled reference",
    docsLive: "prose/<Class>.md (runtime) · the /* # Name … */ header (library)",
    spineKeys: [],
    gated: true,
    async check(model) {
      const { SCHEMAS } = await import("../../../runtime/dist/schema.js");
      const holes = [];
      for (const [id, e] of Object.entries(model.reference)) {
        if (e.kind !== "attribute" || e.api === false || e.internal === true) continue;
        if (typeof e.doc === "string" && e.doc.trim() !== "") continue;
        const cls = id.split(".")[0], name = id.split(".").pop();
        holes.push(SCHEMAS[cls] !== undefined
          ? `${id} — add '## ${name}' to tools/internal/doc/prose/${cls}.md`
          : `${id} — add '## ${name}' to the /* # ${cls} … */ header in library/`);
      }
      return holes;
    },
  },
  {
    id: "callables",
    label: "every method a { } body may call",
    source: "scaffold LANGUAGE_API + LANGUAGE_STATICS",
    docsLive: "the reference, under its class",
    spineKeys: ["api"],
    gated: true,
    async check(model) {
      const { LANGUAGE_API, LANGUAGE_STATICS } = await import("../../../compiler/dist/scaffold.js");
      const nameOf = (l) => (l.trim().match(/^(?:static\s+)?([A-Za-z_$][\w$]*)\s*[<(]/) ?? [])[1];
      const holes = [];
      for (const [reg, isStatic] of [[LANGUAGE_API, false], [LANGUAGE_STATICS, true]]) {
        for (const [cls, lines] of Object.entries(reg)) {
          for (const line of lines) {
            if (!isStatic && (/^\s*readonly\b/.test(line) || !line.includes("("))) continue;
            const n = nameOf(line.replace(/^\s*static\s+/, ""));
            if (!n) continue;
            const node = model.reference[`${cls}.method.${n}`];
            if (!node) holes.push(`${cls}.${n} — absent from the reference`);
            else if (!node.doc) holes.push(`${cls}.${n} — present but undocumented`);
          }
        }
      }
      return holes;
    },
  },
  {
    id: "vocabulary",
    label: "every shared type, payload and global function",
    source: "scaffold PRELUDE",
    docsLive: "Vocabulary → Types and functions",
    spineKeys: ["types", "events"],
    gated: true,
    async check(model) {
      // FORM-AGNOSTIC: scan every top-level declaration whatever its keyword, so a
      // form the projector does not yet parse fails here instead of being skipped.
      const declared = [...preludeText().matchAll(/^(?:declare\s+)?(?:interface|type|function|const|var|let|class|enum|namespace)\s+([A-Za-z]\w*)/gm)].map((m) => m[1]);
      const got = model.spine?.types?.shared;
      if (!got) return ["spine.types.shared is missing — the PRELUDE projection did not run"];
      const projected = new Set(Object.values(got).flat().map((x) => x.name));
      return [
        ...declared.filter((n) => n !== "console" && !projected.has(n)).map((n) => `${n} — declared in the check block, absent from the projection`),
        // an interface that parsed to nothing is how a broken parser announces itself
        ...got.interfaces.filter((i) => !i.members.length).map((i) => `${i.name} — projected with no members, so the parser lost its shape`),
      ];
    },
  },
  {
    id: "theme-tokens",
    label: "every theme token the library reads",
    source: "measured from library/*.declare",
    docsLive: "Vocabulary → Theme tokens",
    spineKeys: ["themeTokens"],
    gated: true,
    async check(model) {
      const t = model.spine?.themeTokens;
      if (!t?.required?.length) return ["spine.themeTokens.required is empty — the measurement broke"];
      return t.required.filter((r) => !r.stated)
        .map((r) => `${r.name} — read with no fallback, but the SanFrancisco preset does not state it`);
    },
  },
  {
    id: "guide-coverage",
    label: "every reference class is taught in the guide",
    source: "the assembled reference",
    docsLive: "docs/guide/",
    spineKeys: [],
    gated: true,
    async check(model) {
      const dir = join(ROOT, "docs/guide");
      const guide = readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
      const mentions = (n) => new RegExp(`(^|[^A-Za-z0-9_])${n}([^A-Za-z0-9_]|$)`).test(guide);
      // FAMILIES: teaching the base teaches the set — the guide shows how to write an
      // icon, it does not enumerate ten marks (the residency rule).
      const FAMILY = {
        Icon: ["ChevronIcon", "ArrowIcon", "CheckIcon", "CloseIcon", "PlusIcon", "MinusIcon",
               "LightbulbIcon", "SunIcon", "MoonIcon", "AutoIcon", "IconHost"],
        Segmented: ["SegmentedItem"], DataGrid: ["GridRow"], Table: ["TableRow"],
        Accordion: ["Pane"], RadioGroup: ["Radio"],
      };
      const headOf = {};
      for (const [head, kin] of Object.entries(FAMILY)) for (const k of kin) headOf[k] = head;
      const classes = Object.values(model.reference).filter((n) => n.kind === "class" && n.api !== false);
      return [...new Set(classes.map((c) => headOf[c.name] ?? c.name))]
        .filter((n) => !mentions(n))
        .map((n) => `${n} — in the reference, named nowhere in docs/guide/`);
    },
  },

  // ── UNGATED, on purpose and on the record ──────────────────────────────────
  // These reach the spine as name-only vocabularies: the projection carries them,
  // and there is no per-entry prose to be missing. Listed so "not gated" reads as a
  // decision rather than an oversight — and so the spine-coverage check below has
  // somewhere to point when one of them grows a description worth holding.
  {
    id: "enums", label: "enum token vocabularies", source: "schema enum types",
    docsLive: "Vocabulary → Enums", spineKeys: ["enums"], gated: false,
    why: "token lists, not prose — the tokens ARE the documentation, and the schema is their only source",
  },
  {
    id: "flags", label: "compiler flags", source: "FLAG_SPECS",
    docsLive: "Vocabulary → Flags · operational/flags.md", spineKeys: ["flags"], gated: false,
    why: "each spec carries its own description field, projected into a marker-injected table the assemble gate already holds byte-fresh",
  },
  {
    id: "diagnostics", label: "diagnostic codes", source: "the diagnostics catalog",
    docsLive: "Vocabulary → Diagnostics", spineKeys: ["diagnostics"], gated: false,
    why: "a diagnostic's text IS its documentation and ships in the compiler; the catalog here is the code index",
  },
  {
    id: "requests", label: "request types", source: "REQ",
    docsLive: "Vocabulary → Requests", spineKeys: ["requests"], gated: false,
    why: "the addressable URL surface, name-only; operational/ carries the prose",
  },
  {
    id: "commands", label: "the operations registry", source: "tools/internal/ops.mjs",
    docsLive: "operational/", spineKeys: ["commands"], gated: false,
    why: "gated by EXECUTION instead — ops.test runs every test:true entry against its declared expectation, which is stronger than a prose check",
  },
  {
    id: "concepts", label: "declare-help's concept table", source: "tools/internal/doc/concepts.json",
    docsLive: "operational/help.md", spineKeys: ["concepts"], gated: false,
    why: "gated by EXECUTION instead — declare-help.test asserts every synonym target resolves in the reference and every negative entry answers its trigger words with exit 0",
  },
];

/** Every spine section must be claimed by some surface — gated or explicitly not.
 *  A new registry that reaches the spine without a row here means nobody decided
 *  whether it needs documenting, which is exactly how the last two holes happened. */
export function everySpineSectionHasASurface(model) {
  const claimed = new Set(SURFACES.flatMap((s) => s.spineKeys));
  return Object.keys(model.spine ?? {}).filter((k) => !claimed.has(k))
    .map((k) => `spine.${k} — reaches the spine but no surfaces.mjs row claims it`);
}

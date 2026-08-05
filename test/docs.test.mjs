// docs — the no-drift invariant, mechanized (docs/system-design/verify-and-evals.md §2.9;
// docs/system-design/designing-a-language-for-llms.md §5). A model believes the
// documents it is given, so documentation that drifts from the compiler is a
// correctness bug in the system, not a docs chore. This test compiles every
// COMPLETE program in the LLM-facing docs on every test run:
//
//   - ```declare fences are complete programs and MUST compile clean;
//   - ```declare-fragment fences are member/expression excerpts and are skipped.
//
// NOT covered, deliberately: evals/baselines/declare-for-llms-2026-07.md. It is a
// FROZEN eval baseline, and compiling its fences here was a trap — as the language
// moves the test goes red, and the repair is to edit the baseline, which silently
// invalidates every measurement ever taken against it. A frozen artifact must be
// allowed to rot; that is what makes it a control. The guide's runnable fences are validated separately by
// tools/internal/prebuild.mjs (they become apps/docs/demos/seg_*.declare); folding
// that path into `npm test` is tracked in docs/system-design/verify-and-evals.md.
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compile } from "../compiler/dist/compile-node.js";
import { parseProgram } from "../runtime/dist/parser.js";
import { test, summarize } from "./harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const COVERED = [
  "docs/declare.md",
  "apps/homepage/getstarted.md",
];

for (const rel of COVERED) {
  const md = readFileSync(resolve(HERE, "..", rel), "utf8");
  const programs = [...md.matchAll(/```declare\n([\s\S]*?)```/g)].map((m) => m[1]);

  await test(`${rel}: has complete programs to check`, () => {
    if (programs.length < 1) throw new Error("no ```declare fences found — extraction regex or doc structure changed");
  });

  for (const [i, src] of programs.entries()) {
    const head = src.trim().split("\n")[0].slice(0, 56);
    await test(`${rel} program ${i + 1}: ${head}`, () => {
      const out = compile(src, {});
      if (out.errors.length) {
        throw new Error(out.errors.map((e) => e.message).join("\n      "));
      }
    });
  }

  // ```declare-fragment fences are member excerpts — they can't COMPILE (they
  // reference surrounding context), but they must PARSE: a fragment is exactly
  // what a model copies, and unparseable documented syntax is the worst class
  // of doc/compiler drift (it shipped once: a "canonical typed method form"
  // the tokenizer rejects). Wrap each in an App body and demand a clean parse.
  const fragments = [...md.matchAll(/```declare-fragment\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (const [i, frag] of fragments.entries()) {
    const head = frag.trim().split("\n")[0].slice(0, 56);
    await test(`${rel} fragment ${i + 1} parses: ${head}`, () => {
      // a fragment is one of three excerpts: a whole top-level program, a set
      // of top-level DECLARATIONS (class/style/font/…) with no root, or a
      // MEMBER list. Try each in turn — and note that a declaration excerpt
      // must get a ROOT appended, never an App body wrapped around it: wrapping
      // read `class Foo extends View [ … ]` as a run of members named `class`,
      // `Foo`, `extends`, which only "parsed" while the comma was optional.
      try { parseProgram(frag); return; } catch { /* not a whole program */ }
      if (/^\s*(class|style|stylesheet|font|include|script|use)\b/.test(frag)) {
        parseProgram(`${frag.trimEnd()}\n\nApp [ width = 1, height = 1 ]\n`);
        return;
      }
      parseProgram(`App [\n${frag.trimEnd()}\n]`);
    });
  }
}

// The dangling-link gate (docs/system-design/documentation.md §5): every
// `declare-docs:` symbolic link in the category-B corpus must resolve against
// the generated ID registry (tools/internal/doc/links.mjs) — a wrong target fails here,
// it never rots silently.
await test("declare-docs: links — every symbolic link resolves (links.mjs --check)", () => {
  const r = spawnSync(process.execPath, [resolve(HERE, "..", "tools/internal/doc/links.mjs"), "--check"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error((r.stdout + r.stderr).trim());
});

// The spine gate (docs/system-design/verification.md §5.2): the three assembled projections
// — declare-model.json, the marker-injected doc tables, the skill inventory —
// must match a fresh in-memory assembly of the live registries.
await test("spine: assembled projections are fresh (assemble.mjs --check)", () => {
  const r = spawnSync(process.execPath, [resolve(HERE, "..", "tools/internal/doc/assemble.mjs"), "--check"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error((r.stdout + r.stderr).trim());
});

// The COMPLETENESS gate: every component the platform exposes — the runtime's
// SCHEMAS registry and every class in the library's autoinclude manifest —
// must have a reference entry AND appear in the browse rail. This is what
// keeps a schema move or a new library class from silently vanishing from the
// documentation (the layout migration did exactly that to the rail's old
// readers: present in the model, but only where nobody was looking).
await test("reference: every runtime schema and library class is documented and browsable", async () => {
  const { SCHEMAS } = await import("../runtime/dist/schema.js");
  const model = JSON.parse(readFileSync(resolve(HERE, "..", "docs/declare-model.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(resolve(HERE, "..", "library/autoincludes.json"), "utf8"));
  const expected = [...Object.keys(SCHEMAS), ...Object.keys(manifest).filter((k) => !k.startsWith("$"))];
  const railed = new Set();
  const walk = (nodes) => { for (const n of nodes) n.kind === "category" ? walk(n.children ?? []) : n.kind === "element" && railed.add(n.name); };
  walk(model.browse);
  const missing = expected.filter((n) => !(n in model.reference) || !railed.has(n));
  if (missing.length) throw new Error("undocumented components: " + missing.join(", "));
});

// The CALLABLE-SURFACE gate (library-charter.md §2a): everything a `{ }` body may
// call must be documented. `LANGUAGE_API`/`LANGUAGE_STATICS` is the authoritative
// statement of that surface — the scaffold emits it into every program's check
// block — so a member there is supported for an app exactly as for a library
// component. Until 2026-08-05 the reference never read those registries, and the
// result was the charter's own promise failing quietly: `App.createView` taught
// four times in declare.md, `View.raise` called by every overlay in library/, and
// `Layout.laid` the thing every `place()` is written against — none of them in the
// reference at all. Supported, typechecked, undiscoverable.
await test("reference: every callable-surface member is documented", async () => {
  const { LANGUAGE_API, LANGUAGE_STATICS } = await import("../compiler/dist/scaffold.js");
  const model = JSON.parse(readFileSync(resolve(HERE, "..", "docs/declare-model.json"), "utf8"));
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
  if (holes.length) {
    throw new Error(
      `these are callable from any { } body but a reader cannot find them:\n      ` +
      holes.join("\n      ") +
      `\n      write prose in tools/internal/doc/prose/<Class>.md — a supported API that is\n` +
      `      undiscoverable is the privileged-library failure the charter promises against`);
  }
});

// The SHARED-VOCABULARY gate: everything the scaffold's PRELUDE declares into a
// program's check block — `Draw`, the event payloads, the value types, the global
// constructors — is typechecked for user code, so a reader must be able to find it.
// It was projected NOWHERE before 2026-08-05: `draw(d: Draw)` is a first-class
// member kind whose only specification was four examples and an ellipsis, and the
// reference documented `onKeyDown(e: KeyEvent)` while nothing said what is on `e`.
// The projection is parsed from the PRELUDE text, so this also catches a parser
// that silently stops matching when the prelude's shape changes.
await test("vocabulary: every shared type and global function is projected", () => {
  const model = JSON.parse(readFileSync(resolve(HERE, "..", "docs/declare-model.json"), "utf8"));
  const src = readFileSync(resolve(HERE, "..", "compiler/src/scaffold.ts"), "utf8");
  // the literal closes with `; at the END of a line — see the same note in assemble.mjs
  const prelude = src.split("const PRELUDE = `")[1]?.split(/`;\s*$/m)[0] ?? "";
  if (!prelude.includes("interface Draw")) throw new Error("the PRELUDE boundary no longer matches — this gate is scanning the wrong text");
  // FORM-AGNOSTIC on purpose. The first version of this gate enumerated the three
  // forms the parser happened to handle, so it passed while `declare const` — i.e.
  // `Themes`, the thing the theme docs tell you to call — was skipped entirely. A
  // gate that only checks what its parser already understands cannot catch the
  // parser's blind spot. So: scan EVERY top-level declaration, whatever its keyword,
  // and demand the projection carries the name. A new form fails here loudly.
  const declared = [...prelude.matchAll(/^(?:declare\s+)?(?:interface|type|function|const|var|let|class|enum|namespace)\s+([A-Za-z]\w*)/gm)]
    .map((m) => m[1]);
  const got = model.spine?.types?.shared;
  if (!got) throw new Error("spine.types.shared is missing — the PRELUDE projection did not run");
  const projected = new Set(Object.values(got).flat().map((x) => x.name));
  const holes = declared.filter((n) => n !== "console" && !projected.has(n))
    .map((n) => `${n} — declared in the check block, absent from the projection`);
  // an interface that parsed to nothing means the parser lost its shape
  for (const i of got.interfaces) if (!i.members.length) holes.push(`interfaces: ${i.name} parsed with no members`);
  if (holes.length) throw new Error("the check block declares these, but the reference does not carry them:\n      " + holes.join("\n      "));
});

// The THEME-TOKEN gate: the token vocabulary is measured from the library sources,
// so it cannot drift — but the measurement itself can rot (a comment-stripping bug
// silently reclassified nine tokens as required during the pass that added this).
// Assert the shape and the invariant that matters: every REQUIRED token — one read
// with no fallback — is stated by the shipped preset, or an app built on that preset
// meets an undefined token at runtime.
await test("theme: every required token is stated by the default preset", () => {
  const model = JSON.parse(readFileSync(resolve(HERE, "..", "docs/declare-model.json"), "utf8"));
  const t = model.spine?.themeTokens;
  if (!t?.required?.length) throw new Error("spine.themeTokens.required is empty — the measurement broke");
  const unstated = t.required.filter((r) => !r.stated).map((r) => r.name);
  if (unstated.length) {
    throw new Error(
      `these tokens are read with no fallback but the SanFrancisco preset does not state them: ${unstated.join(", ")}\n` +
      `      add them to library/themes/*.declare, or give the reader a guarded default`);
  }
});

// The BACKLINK gate (docs/system-design/documentation.md §4): "reference nodes with
// no inbound guide link are flagged holes. (This is what would have caught the
// un-taught component library.)" §4 claimed this was CI-blocking for a year while
// nothing implemented it, and the predicted failure happened exactly as written —
// one merge landed Segmented, SegmentedItem and the whole Icon family with zero
// guide coverage and nothing noticed. This is that check.
//
// GRANULARITY IS THE CLASS, not the member. The guide teaches concepts and names the
// components that carry them; the reference carries every attribute. Demanding a
// guide mention per member would drive the catalog into the narrative, which is the
// failure the residency rule exists to prevent (documentation.md §4a).
//
// FAMILIES — teaching the base teaches the set. The guide says "icons are drawn
// rather than typed, here is how to write one"; it must not enumerate ten marks. A
// family member is covered when its family head is taught, and only heads that are
// genuinely a *kind* belong here — not every base class, or `View` would cover the
// world.
const FAMILY = {
  Icon: ["ChevronIcon", "ArrowIcon", "CheckIcon", "CloseIcon", "PlusIcon", "MinusIcon",
         "LightbulbIcon", "SunIcon", "MoonIcon", "AutoIcon", "IconHost"],
  Segmented: ["SegmentedItem"],
  DataGrid: ["GridRow"],
  Table: ["TableRow"],
  Accordion: ["Pane"],
  RadioGroup: ["Radio"],
};

// UNTAUGHT — what the guide does not cover yet, dated, so a hole stays COUNTABLE
// instead of invisible; the same discipline §4a uses for library prose. This list
// only shrinks. Adding a name to it is a decision someone makes on purpose, which
// is the whole point: a new component that lands untaught fails this test instead
// of passing unnoticed.
// EMPTY as of 2026-08-05, and that is the point: the guide's component pass closed
// every hole this list was opened to carry. `Segmented` and `Icon` went with
// guide/11-make-your-own.md (Icon as a FAMILY head, clearing its ten marks with it);
// `Combobox`/`ContextMenu` with 12-above-the-flow; `DataGrid` with 10-scale;
// `Video`/`RichText`/`HTMLText` with 06-style; `Editor` with 09-data's forms section.
// Keep it empty. An entry here should be a deliberate, dated decision to defer — not
// a parking space for something nobody wanted to write.
const UNTAUGHT = new Set([]);

await test("backlink: every reference class is taught somewhere in the guide", () => {
  const model = JSON.parse(readFileSync(resolve(HERE, "..", "docs/declare-model.json"), "utf8"));
  const dir = resolve(HERE, "..", "docs/guide");
  const guide = readdirSync(dir).filter((f) => f.endsWith(".md"))
    .map((f) => readFileSync(resolve(dir, f), "utf8")).join("\n");
  // a mention is the bare class name on a word boundary (prose, a table row, or a
  // fence) or a `declare-docs:` link to it — the guide names components both ways
  const mentions = (name) =>
    new RegExp(`(^|[^A-Za-z0-9_])${name}([^A-Za-z0-9_]|$)`).test(guide);
  const headOf = {};
  for (const [head, kin] of Object.entries(FAMILY)) for (const k of kin) headOf[k] = head;
  // a family member's coverage is its HEAD's — so the icon set is one debt to pay
  // and one line to delete, never twelve
  const subject = (n) => headOf[n] ?? n;

  const classes = Object.values(model.reference).filter((n) => n.kind === "class" && n.api !== false);
  const holes = [...new Set(classes.map((c) => subject(c.name)))]
    .filter((n) => !mentions(n) && !UNTAUGHT.has(n));
  if (holes.length) {
    throw new Error(
      `these classes are in the reference but nothing in docs/guide/ names them: ${holes.join(", ")}\n` +
      `      teach each in the guide, add it to FAMILY under the base that teaches its kind,\n` +
      `      or — deliberately, dated — add it to UNTAUGHT in this file`);
  }
  // the debt list must not outlive its reason: an entry that IS now taught has to
  // leave, or the list quietly becomes the place real holes hide (§4a's rule for
  // the EXEMPT list, applied here)
  const stale = [...UNTAUGHT].filter((n) => mentions(n));
  if (stale.length) {
    throw new Error(
      `UNTAUGHT lists ${stale.join(", ")}, but the guide now teaches them — remove them from the list`);
  }
});

summarize("docs");

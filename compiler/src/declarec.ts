// declarec — Declare's production build (the compiler half).
//
// A dev page ships the app SOURCE and parses + typechecks it in the browser at
// boot, carrying the whole compiler (parser + checker) over the wire. That is
// convenient but not what you deploy. `declarec` moves parse + bare-name
// resolution + typecheck to BUILD time and emits the INSTANTIATED PROGRAM as
// JSON. A production deploy ships that program plus the runtime's run-path only
// (`renderProgram`) — never the parser or checker — exactly as React ships no
// JSX compiler.
//
// This module is the pure compiler half (source → serializable program), so it
// stays server- and browser-usable. The emit half (bundle the runtime with
// esbuild, write the dist tree, copy assets, gzip-measure) lives in the CLI and
// the server, which own the filesystem and the bundler.

import { compileTracked } from "./compile-node.js";
import type { Closure } from "./closure.js";
import { applyDeps } from "../../runtime/dist/deps.js";
import { freeIdentifiers } from "./free-idents.js";
import type { CompileOptions } from "./compile.js";
import { parseProgram, type Program, type Element } from "../../runtime/dist/parser.js";
import { resolveIncludes, NO_INCLUDES, referencedComponentNames } from "../../runtime/dist/include.js";
import { REGISTRY_NAMES } from "../../runtime/dist/registry.js";
import { check } from "../../runtime/dist/check.js";
import { toDiagnostic, renderReport, type Diagnostic } from "../../runtime/dist/diagnostics.js";
import type { NeoError } from "../../runtime/dist/errors.js";

export interface DeclarecOptions extends CompileOptions {
  /** Drop `pos` source-offset fields from the shipped program. They exist only
   *  for error messages, which a precompiled (already-checked) app never emits
   *  at runtime — stripping them roughly halves the program's raw size and cuts
   *  its gzip near in half. Default true. */
  stripPos?: boolean;
  /** The main source's own path — recorded in the build's closure so an edit
   *  to the app file itself invalidates a cached artifact. */
  mainId?: string;
  /** Build properties frozen into the closure (backend, slim, the toolchain
   *  fingerprint, …) — isUpToDate compares them, so a flag or toolchain change
   *  invalidates like a file change. */
  props?: Record<string, string>;
}

export interface ProgramBuild {
  /** The instantiate-ready program, or null when the source did not compile. */
  program: Program | null;
  errors: readonly NeoError[];
  warnings: readonly NeoError[];
  /** The unified structured view + its rendered form, threaded VERBATIM from
   *  the one compile() result (Compiled.diagnostics/report) — the CLI prints
   *  `report`; nothing here re-renders. */
  diagnostics: readonly Diagnostic[];
  report: string;
  /** The compile's dependency closure (closure.ts): the main file, every
   *  include, every auto-included library file, plus the frozen build props —
   *  THE freshness fact a cache checks (isUpToDate) to decide whether this
   *  build is still current. Present even on failure (a failed compile's
   *  closure says what to watch to retry). */
  closure: Closure;
  /** The built-in component NAMES this app can instantiate — the used-set a
   *  production build keeps (∩ the runtime registry), dropping every other
   *  component module (rich-text, etc.). Empty when the source did not compile. */
  usedComponents: readonly string[];
}

/** The component NAMES a program may instantiate: its STATIC tree references
 *  (tags + class bases) ∪ any component a `{ }` body constructs BY NAME
 *  (`new Markdown()`, scanned via free-idents) ∪ the explicit `use [ … ]`
 *  keep-list. Sound because Declare has no reflective new-by-value: every
 *  construction path is a compile-time literal, so this set is complete (a
 *  future create-by-STRING is what `use` covers). The scan vocabulary is the
 *  built-in registry plus the program's own class names, so only real component
 *  identifiers count — `Math`, `console`, locals, etc. are ignored, and a name
 *  shadowed by a local is (correctly) not free. */
export function usedComponentNames(program: Program): string[] {
  const vocab = new Set<string>([...REGISTRY_NAMES, ...program.classes.map((c) => c.name)]);
  const used = new Set<string>(referencedComponentNames(program));
  for (const name of program.uses) used.add(name);
  const scan = (src: string, expression: boolean, params: readonly string[]): void => {
    const ids = freeIdentifiers(src, { expression, bound: [...params] });
    if (ids === null) return; // unparseable body — the checker owns that error
    for (const id of ids) if (vocab.has(id.name)) used.add(id.name);
  };
  const walk = (el: Element): void => {
    for (const a of el.attrs) if (a.value.kind === "code") scan(a.value.src, true, []);
    for (const d of el.decls) if (d.def?.kind === "code") scan(d.def.src, true, []);
    for (const m of el.methods) scan(m.body, false, m.params);
    for (const c of el.children) walk(c);
  };
  walk(program.root);
  for (const cls of program.classes) walk(cls.body);
  return [...used];
}

/** Recursively delete `pos` keys. Mutates in place and returns the value. */
function stripPos<T>(node: T): T {
  if (Array.isArray(node)) {
    for (const el of node) stripPos(el);
  } else if (node !== null && typeof node === "object") {
    delete (node as Record<string, unknown>).pos;
    for (const k of Object.keys(node as Record<string, unknown>)) stripPos((node as Record<string, unknown>)[k]);
  }
  return node;
}

/** Compile a Declare source into a serializable, instantiate-ready program:
 *  resolve bare names + includes + typecheck (all the compiler's work), then
 *  parse the resolved source into the program the runtime's `renderProgram`
 *  consumes. On any error, `program` is null and `errors` carries every
 *  diagnostic (nothing is emitted). */
export function compileProgram(source: string, opts: DeclarecOptions = {}): ProgramBuild {
  // 1) The full Node-side compile: bare-name resolution + include/auto-include
  //    inlining. The tsc-over-bodies typecheck models element instance types
  //    (declared attributes included) and runs corpus-clean — zero false
  //    positives (diagnostics.md §2, the 2026-07-13 revision) — but stays off
  //    by default, matching the dev path, until verify flips it on as rung 3;
  //    the runtime schema `check()` below is the always-on gate. Opt in with
  //    `typecheck: true`.
  const { mainId, props, stripPos: strip, ...compileOpts } = opts;
  const c = compileTracked(source, { ...compileOpts, mainId, props, typecheck: opts.typecheck ?? false });
  if (c.source === null) {
    return { program: null, errors: c.errors, warnings: c.warnings, diagnostics: c.diagnostics, report: c.report, closure: c.closure, usedComponents: [] };
  }

  // 2) Parse the resolved source into a program. Includes are already inlined,
  //    so NO_INCLUDES is a guard, not a resolver.
  const parsed = parseProgram(c.source);
  const { program, errors: incErrors } = resolveIncludes(parsed, NO_INCLUDES, "");

  // 3) Belt-and-suspenders: typecheck the program we will actually ship (the
  //    resolved re-parse), so the emitted artifact is provably valid. A failure
  //    here is OUR bug (compile() accepted what the re-check rejects), so the
  //    structured view is composed the same way compile() composes its own.
  const errors = [...incErrors, ...check(program)];
  if (errors.length > 0) {
    const diagnostics = errors.map((e) => toDiagnostic(e, "error", "structure"));
    return { program: null, errors, warnings: c.warnings, diagnostics, report: renderReport(diagnostics), closure: c.closure, usedComponents: [] };
  }

  // Zip the extracted constraint dependencies (design/constraints.md §5) onto
  // the program we ship, so it boots on the runtime's static-constraint path.
  // compile() already ran the extraction (and would have BLOCKED on an
  // unanalyzable residue above), so we re-hydrate its walk-order list onto this
  // identical re-parse rather than extracting a second time.
  applyDeps(program, c.deps ?? []);

  // Compute the used-set BEFORE stripping positions (the scan walks bodies; it
  // needs nothing positional, but order it here so it reads the same program).
  const usedComponents = usedComponentNames(program);
  if (strip ?? true) stripPos(program);
  return { program, errors: [], warnings: c.warnings, diagnostics: c.diagnostics, report: c.report, closure: c.closure, usedComponents };
}

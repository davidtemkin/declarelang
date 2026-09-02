// include — the source-merge resolve phase (composition.md §1). On
// `include [ "x" ]` the compiler resolves and parses x, recursively resolves
// ITS includes, and folds every library's top-level declarations into the one
// program — into the flat namespace (no prefixes, all classes are peers).
//
// This module is PURE: it takes the file-access host as an injected parameter
// (composition.md §1 "resolution rides the host" — filesystem on CLI/server,
// fetch in the browser) and imports only the parser and the error type. So it
// stays inside the zero-dependency runtime graph (index.ts) exactly as the
// runtime does; the Node fs host lives in its own module (include-node.ts),
// which only the Node-side entry imports.
//
// Include-once by CANONICAL path (a visited set): this makes diamonds AND
// cycles terminate, and — just as importantly — keeps a diamond from folding a
// file's declarations twice and tripping a false name-collision. Every name is
// tracked to its origin file; an included declaration whose name is already
// present is a positioned collision error naming both files, and is skipped
// (the merged program stays instantiable). Within-file duplicates stay the
// checker's job, so the main program seeds the origin table with no self-check.

import { parseLibrary, type Program, type Library, type ClassDecl, type TopDecl, type Span, type Element, type ScriptBlock, type IncludeRef } from "./parser.js";
import { DeclareError } from "./errors.js";
import { Diag } from "./diagnostics.js";

/** Cut a source's `include [ … ]` directives out of its text, leaving the rest
 *  byte-for-byte (offsets after each cut shift left by its length). Splicing
 *  highest-offset first keeps earlier spans valid; directives never overlap.
 *  This is how a library's — or the main file's — source is made splice-ready
 *  for the merged, self-contained program (composition.md §1). */
/** Splice each `script [ "file.ts" ]` directive's span with the file's contents
 *  as a synthesized `script { … }` block — after which nothing downstream knows
 *  the script came from a file: the typecheck ambient, the resolver's names, the
 *  transpile pass, and the runtime all see an ordinary block. Paths resolve
 *  against `fromDir` (the directive's own file), through the same host as
 *  `include` — so the dependency closure records the file and the dev loop's
 *  freshness covers it. `export` modifiers on declarations are stripped (the
 *  module idiom, tolerated); a missing file is a positioned error. */
/** `dir` + a relative path, normalized with a plain segment stack — the include
 *  host's canonical coordinates (absolute paths on disk, URLs elsewhere). */
function joinPath(dir: string, rel: string): string {
  const lead = dir.startsWith("/") ? "/" : "";
  const stack = dir.replace(/\/+$/, "").split("/").filter((s) => s !== "");
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    else if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  return lead + stack.join("/");
}

export async function spliceScriptFiles(
  source: string,
  refs: readonly IncludeRef[] | undefined,
  spans: readonly Span[] | undefined,
  fromDir: string,
  host: IncludeHost,
  errors: DeclareError[],
  excise: readonly Span[] = []
): Promise<string> {
  if ((!refs || refs.length === 0 || !spans || spans.length === 0) && excise.length === 0) return source;
  // One directive may name several files; its span is replaced by their blocks
  // in order. Group refs to spans by position: a ref belongs to the last span
  // that starts before it.
  const bySpan = (spans ?? []).map((s) => ({ span: s, texts: [] as string[] }));
  for (const ref of refs ?? []) {
    let home = bySpan[0];
    for (const b of bySpan) if (b.span.start <= ref.pos.offset) home = b;
    const resolved = await host.resolve(fromDir, ref.path);
    if (resolved === null) {
      errors.push(Diag.missingInclude(ref.path, ref.pos));
      continue;
    }
    // `export function f` → `function f` (and const/let/var/class/enum): the
    // file is written as a module; here its top-level names enter program scope
    // the way an inline block's do. (`export { … }` lists and `export default`
    // stay — checkScripts refuses them with the reason.)
    let body = resolved.source.replace(/\bexport\s+(?=(async\s+)?(function|const|let|var|class|enum)\b)/g, "");
    // The file's own RELATIVE imports resolve against the FILE's directory —
    // but the spliced text lives in the program, whose bundler resolves
    // against the program's directory. Rewrite each relative specifier onto
    // the file's dir so the bundle reads the file the author meant.
    body = body.replace(/(\bfrom\s+|\bimport\s*\(\s*)(["'])(\.{1,2}\/[^"']*)\2/g,
      (_m, lead: string, q: string, spec: string) => `${lead}${q}${joinPath(resolved.dir, spec)}${q}`);
    home.texts.push(`script {\n${body}\n}`);
  }
  // ONE back-to-front pass over splices and excisions together: every span is
  // in the ORIGINAL text's coordinates, and applying either kind first would
  // shift the other's.
  const edits = [
    ...bySpan.map((b) => ({ start: b.span.start, end: b.span.end, text: b.texts.join("\n\n") })),
    ...excise.map((s) => ({ start: s.start, end: s.end, text: "" })),
  ].sort((a, c) => c.start - a.start);
  let out = source;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

export function exciseSpans(source: string, spans: readonly Span[]): string {
  let out = source;
  for (const s of [...spans].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, s.start) + out.slice(s.end);
  }
  return out;
}

/** The file-access abstraction include resolution rides (composition.md §1).
 *  `resolve` maps an include path (relative to the including file's dir) to a
 *  canonical key + the included file's own dir (for resolving ITS includes) +
 *  its source text, or null when the file does not exist. The canonical key is
 *  what include-once dedups on, so it must be stable per file (an absolute
 *  path on the fs host). */
export interface IncludeHost {
  resolve(fromDir: string, path: string): Resolved | null | Promise<Resolved | null>;
}

/** What a host hands back for one file. Named so the filesystem host and the
 *  fetch host state the same shape, and so `resolve` can say "or later". */
export interface Resolved { canonical: string; dir: string; source: string }

/** A host that resolves nothing — the default in the zero-dependency graph
 *  (index.ts): a source with no `include`s never calls it, so behavior is
 *  unchanged; a source WITH includes but no real host reports each as
 *  unresolvable rather than importing a filesystem into the runtime graph. */
export const NO_INCLUDES: IncludeHost = { resolve: () => null };

/** The HOSTLESS case, synchronously — the RUNTIME's path.
 *
 *  `compile()` emits one self-contained program (the walk splices every library's
 *  source ahead of the excised main), so at runtime there is nothing left to
 *  resolve: build() runs with NO_INCLUDES over an already-empty include list.
 *  Keeping that case here, sync, is what lets the seam above be async without
 *  making the runtime's build()/render() async for I/O nobody performs.
 *
 *  A source that still carries `include`s and has no host is the honest error the
 *  walk produced — one `missingInclude` per directive, same diagnostic, same order. */
export function resolveIncludesHostless(
  program: Program
): { program: Program; errors: DeclareError[] } {
  return {
    program: { ...program, includes: [], includeSpans: [] },
    errors: program.includes.map((inc) => Diag.missingInclude(inc.path, inc.pos)),
  };
}

/** Resolve a program's `include`s (composition.md §1): recursively parse each
 *  included library relative to the including file, fold every library's
 *  top-level declarations into the accumulator (the main program's first), and
 *  return the merged program with `includes` emptied. Collisions, missing
 *  files, and library parse errors are collected (positioned), never thrown —
 *  one report per problem, in resolve order.
 *
 *  ONE traversal, two products (so the Program-merge and the source-merge
 *  cannot drift): `program` is the folded declarations build()/instantiate
 *  consume; `sources` is each visited library's own source with ITS include
 *  directives excised, in DEPENDENCY-FIRST (post-order) order — a library is
 *  emitted only after the libraries it includes, so a base is always declared
 *  above its subclass. compile() concatenates `sources` ahead of the excised
 *  main source to emit ONE self-contained program the hostless runtime runs. */
export async function resolveIncludes(
  program: Program,
  host: IncludeHost,
  originDir: string
): Promise<{ program: Program; sources: string[]; sourceIds: string[]; errors: DeclareError[]; visited: Set<string> }> {
  const errors: DeclareError[] = [];
  const classes: ClassDecl[] = [...program.classes];
  const shapes = [...(program.shapes ?? [])];
  const stylesheets: TopDecl[] = [...program.stylesheets];
  const styles: TopDecl[] = [...program.styles];
  const fonts: TopDecl[] = [...program.fonts];
  // The keep-list folds across libraries too: a library declaring its own
  // `use [ … ]` contributes its dynamic deps to the merged program's list.
  const uses: string[] = [...program.uses];
  // A library's `script { … }` helpers travel with it, in include order — the
  // program's own blocks lead, then each library's, so a helper is defined
  // before anything that could reference it downstream.
  const scripts: ScriptBlock[] = [...program.scripts];
  const sources: string[] = [];
  // `sourceIds[i]` is the canonical identity of `sources[i]` — what compile()
  // needs to rebase a merged-text position back onto the file it came from.
  const sourceIds: string[] = [];

  // name → the file that declared it. The main program seeds it as "the app"
  // (composition.md §1's wording) with NO self-collision check: two decls of
  // one name WITHIN a file stay the checker's duplicate-name job.
  const MAIN = "the app";
  const origin = new Map<string, string>();
  for (const c of program.classes) origin.set(c.name, MAIN);
  for (const d of program.shapes ?? []) origin.set(d.name, MAIN);
  for (const s of program.stylesheets) origin.set(s.name, MAIN);
  for (const s of program.styles) origin.set(s.name, MAIN);
  for (const f of program.fonts) origin.set(f.name, MAIN);

  const visited = new Set<string>();

  /** Fold one included declaration into the flat namespace, or report a
   *  collision naming both files and skip it. Returns whether it was folded. */
  const fold = (name: string, pos: DeclareError["pos"], from: string): boolean => {
    const prev = origin.get(name);
    if (prev !== undefined) {
      errors.push(Diag.includeCollision(`'${name}' is declared twice — in "${from}" and "${prev}"`, pos));
      return false;
    }
    origin.set(name, from);
    return true;
  };

  // SEQUENTIAL, now that a host may answer later. The walk is order-dependent in
  // three ways a parallel fan-out would silently break: include-once dedups through
  // `visited` as it goes, collisions are reported in resolve order, and `sources`
  // must come out dependency-first (post-order) so a base is declared above its
  // subclass. A tracker recording the closure therefore sees the same sequence for
  // the same program, which is what keeps a compile-cache key stable. Awaiting one
  // file at a time costs latency on a fetch host and buys all four properties; any
  // faster shape has to preserve them to be correct.
  const walk = async (includes: readonly { path: string; pos: DeclareError["pos"] }[], fromDir: string): Promise<void> => {
    for (const inc of includes) {
      const resolved = await host.resolve(fromDir, inc.path);
      if (resolved === null) {
        errors.push(Diag.missingInclude(inc.path, inc.pos));
        continue;
      }
      if (visited.has(resolved.canonical)) continue; // include-once ⇒ diamonds + cycles terminate
      visited.add(resolved.canonical);
      let lib: Library;
      try {
        lib = parseLibrary(resolved.source);
      } catch (e) {
        if (e instanceof DeclareError) { errors.push(e); continue; }
        throw e;
      }
      // DEPENDENCY-FIRST: resolve the library's OWN includes before folding /
      // emitting the library itself, so an included base is declared above the
      // subclass that extends it (post-order, relative to the library's dir).
      await walk(lib.includes, resolved.dir);
      // The file is named by the path it was included as — the spelling the
      // author reads in the `include` directive (composition.md §1's collision
      // message form).
      const from = inc.path;
      for (const c of lib.classes) if (fold(c.name, c.pos, from)) classes.push(c);
      for (const d of lib.shapes ?? []) if (fold(d.name, d.pos, from)) shapes.push(d);
      for (const s of lib.stylesheets) if (fold(s.name, s.pos, from)) stylesheets.push(s);
      for (const s of lib.styles) if (fold(s.name, s.pos, from)) styles.push(s);
      for (const f of lib.fonts) if (fold(f.name, f.pos, from)) fonts.push(f);
      uses.push(...lib.uses);
      scripts.push(...lib.scripts);
      // Its splice-ready source — script files spliced in and include
      // directives cut out, in ONE coordinate-safe pass — after its
      // dependencies' sources (the post-order recursion just ran).
      sources.push(await spliceScriptFiles(resolved.source, lib.scriptFiles, lib.scriptFileSpans, resolved.dir, host, errors, lib.includeSpans));
      sourceIds.push(resolved.canonical);
    }
  };
  await walk(program.includes, originDir);

  return {
    program: { classes, shapes, stylesheets, styles, fonts, includes: [], includeSpans: [], uses: [...new Set(uses)], scripts, root: program.root },
    sources,
    sourceIds,
    errors,
    visited,
  };
}
/** The tags the auto-include manifest COULD supply, published for the checker's
 *  near-miss suggestion (see the note at the assignment below). Empty until an
 *  auto-include pass has run — a program compiled without the seam simply gets
 *  the runtime names, which is the behaviour that was there before. */
let autoIncludable: readonly string[] = [];
export function autoIncludableNames(): readonly string[] { return autoIncludable; }


/** A host that ALSO auto-includes component libraries by bare tag — the LZX
 *  `lzx-autoincludes` mechanism, ported (composition.md §1a). Using `Bar [ … ]`
 *  with no `include` and no inline `class Bar` pulls in the library that
 *  declares `Bar`. `autoincludes()` is the tag→library-path manifest;
 *  `resolveLibrary(path)` reads a library file, keyed the SAME canonical way
 *  `resolve` is so an explicit include and an auto-include of one file dedup
 *  through the shared visited set. A plain IncludeHost lacks these, so
 *  auto-include is a no-op there (single-file compiles stay byte-identical). */
export interface AutoIncludeHost extends IncludeHost {
  autoincludes(): Record<string, string>;
  resolveLibrary(path: string): Resolved | null | Promise<Resolved | null>;
}

/** The component TAGS a tree references — every child element's tag (named and
 *  anonymous alike live in `children`), plus each class's `extends` base.
 *  Attribute declarations (`decls`) carry value-type names, not component tags,
 *  so they are not references. Deduped, in encounter order. */
function referencedTags(
  root: Element | null,
  classes: readonly ClassDecl[]
): { tag: string; pos: Element["pos"] }[] {
  const out: { tag: string; pos: Element["pos"] }[] = [];
  const seen = new Set<string>();
  const add = (tag: string, pos: Element["pos"]): void => {
    if (tag !== "" && !seen.has(tag)) { seen.add(tag); out.push({ tag, pos }); }
  };
  const walk = (el: Element): void => {
    for (const child of el.children) { add(child.tag, child.pos); walk(child); }
  };
  if (root !== null) walk(root);
  for (const c of classes) { add(c.base, c.basePos); walk(c.body); }
  return out;
}

/** The component NAMES a program STATICALLY references — its tree tags (children,
 *  including component-valued members like `layout:`/`data:`/animators/states)
 *  and every class's `extends` base. The static half of the used-set a production
 *  build keeps (the compiler adds `{ }`-body construction refs and the `use`
 *  list). The same walk `resolveAutoIncludes` trusts to pull libraries — so it is
 *  proven to see every static reference. Deduped. */
export function referencedComponentNames(program: Program): string[] {
  const names = referencedTags(program.root, program.classes).map((r) => r.tag);
  names.push(program.root.tag); // the root's OWN tag (App) — walk() adds children, not the root itself
  return [...new Set(names)];
}

/** Pull the libraries that define a program's bare component tags — the
 *  auto-include phase, run AFTER explicit includes (composition.md §1a). A
 *  referenced tag that is neither provided (main or explicit include) nor a
 *  built-in is looked up in the manifest; if found, its library is spliced in
 *  exactly like an explicit include — dependency-first (a library's own magic
 *  bases/children are pulled before it is emitted), include-once through the
 *  shared `visited` set. A tag absent from the manifest is left alone: it is a
 *  genuine unknown component the checker reports after the merge.
 *
 *  Backends without the auto-include methods (NO_INCLUDES, a plain fs host)
 *  make this a no-op returning the program unchanged. */
export async function resolveAutoIncludes(
  program: Program,
  root: Element,
  host: IncludeHost,
  visited: Set<string>
): Promise<{ program: Program; sources: string[]; sourceIds: string[]; errors: DeclareError[] }> {
  const auto = host as Partial<AutoIncludeHost>;
  if (typeof auto.autoincludes !== "function" || typeof auto.resolveLibrary !== "function") {
    return { program, sources: [], sourceIds: [], errors: [] };
  }
  const manifest = auto.autoincludes();
  // Record what COULD have been auto-included, for the checker's near-miss.
  // A misspelled tag never matches the manifest, so it is never pulled, so it
  // never reaches `schemas` — which is why `Tex` used to suggest `Text` (a
  // runtime schema, always present) while `Buton` suggested nothing at all.
  // Every control lives in the library, so that was every name an author is
  // most likely to fumble. The checker cannot ask the host itself — `check()`
  // takes only the program — so the manifest's keys are published here, the
  // same module-level seam shape the runtime already uses for its providers.
  autoIncludable = Object.keys(manifest);
  const errors: DeclareError[] = [];
  const classes: ClassDecl[] = [...program.classes];
  const shapes = [...(program.shapes ?? [])];
  const stylesheets: TopDecl[] = [...program.stylesheets];
  const styles: TopDecl[] = [...program.styles];
  const fonts: TopDecl[] = [...program.fonts];
  const scripts: ScriptBlock[] = [...program.scripts];
  // the keep-list folds here exactly as in resolveIncludes: an auto-pulled
  // library's `use [ … ]` (its by-name construction deps) joins the program's
  const uses: string[] = [...program.uses];
  const sources: string[] = [];
  const sourceIds: string[] = [];                         // parallel to `sources`, as in resolveIncludes

  // name → the file that declared it (main + explicit includes seed it). A
  // referenced tag not present here and present in the manifest gets pulled;
  // built-in tags are never in the manifest, so they need no separate registry.
  const origin = new Map<string, string>();
  for (const c of program.classes) origin.set(c.name, "the app");
  for (const d of program.shapes ?? []) origin.set(d.name, "the app");
  for (const s of program.stylesheets) origin.set(s.name, "the app");
  for (const s of program.styles) origin.set(s.name, "the app");
  for (const f of program.fonts) origin.set(f.name, "the app");

  const foldOne = (name: string, pos: Element["pos"], from: string): boolean => {
    const prev = origin.get(name);
    if (prev !== undefined) {
      errors.push(Diag.includeCollision(`'${name}' is declared twice — in "${from}" and "${prev}"`, pos));
      return false;
    }
    origin.set(name, from);
    return true;
  };

  // Post-order: a library's OWN referenced magic tags are pulled before it is
  // emitted, so a base is declared above its subclass (dependency-first, like
  // explicit includes). `origin` reserves the file's names before recursion so
  // a self/mutual reference does not re-pull. The ROOT's own tag is pulled too
  // (referencedTags walks children only) — a root-position library tag then
  // reports its precise misplacement, not "unknown component".
  const pull = async (tag: string, pos: Element["pos"]): Promise<void> => {
    if (origin.has(tag)) return;
    const path = manifest[tag];
    if (path === undefined) return; // not a magic tag → unknownComponent, post-merge
    const resolved = await auto.resolveLibrary!(path);
    if (resolved === null) {
      errors.push(Diag.missingInclude(path, pos));
      origin.set(tag, path); // don't re-report per reference
      return;
    }
    if (visited.has(resolved.canonical)) { origin.set(tag, path); return; }
    visited.add(resolved.canonical);
    let lib: Library;
    try { lib = parseLibrary(resolved.source); }
    catch (e) { if (e instanceof DeclareError) { errors.push(e); return; } throw e; }
    const mine: ClassDecl[] = [];
    for (const c of lib.classes) if (foldOne(c.name, c.pos, path)) mine.push(c);
    // dependency-first: pull what this library references, then emit it
    for (const r of referencedTags(null, lib.classes)) await pull(r.tag, r.pos);
    for (const c of mine) classes.push(c);
    for (const d of lib.shapes ?? []) if (foldOne(d.name, d.pos, path)) shapes.push(d);
    for (const s of lib.stylesheets) if (foldOne(s.name, s.pos, path)) stylesheets.push(s);
    for (const s of lib.styles) if (foldOne(s.name, s.pos, path)) styles.push(s);
    for (const f of lib.fonts) if (foldOne(f.name, f.pos, path)) fonts.push(f);
    scripts.push(...lib.scripts);
    uses.push(...lib.uses);
    sources.push(await spliceScriptFiles(resolved.source, lib.scriptFiles, lib.scriptFileSpans, resolved.dir, host, errors, lib.includeSpans));
    sourceIds.push(resolved.canonical);
  };

  for (const r of referencedTags(root, program.classes)) await pull(r.tag, r.pos);
  await pull(root.tag, root.pos);
  // The keep-list is a reference too: `use [ Bar ]` pulls Bar's library even with
  // no static tag (the escape hatch for by-name construction). A built-in or
  // unknown name isn't in the manifest, so pull() no-ops — the checker validates
  // the name against the merged program afterwards. Indexed loop on purpose:
  // a pulled library can CONTRIBUTE uses (line ~139), and those pull too —
  // a component that `use`s what it createView's (Combobox → Menu) keeps its
  // dependency even when no static tag references it.
  for (let i = 0; i < uses.length; i++) await pull(uses[i], program.root.pos);

  return {
    // `uses` is the FOLDED list — the root's plus every included library's
    // (returning the root's alone silently dropped a library's keep-list,
    // which broke by-name construction inside components).
    program: { classes, shapes, stylesheets, styles, fonts, includes: [], includeSpans: [], uses: [...new Set(uses)], scripts, root: program.root },
    sources,
    sourceIds,
    errors,
  };
}

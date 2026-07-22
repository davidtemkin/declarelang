// check — the typecheck pass over a parsed tree. It validates every component
// tag and every literal attribute against the component schemas and reports
// EVERY problem, in source order, each with its exact position — never just
// the first. Messages name the component, the attribute, the expected type,
// and what was found.
//
// It is deliberately separable from instantiation: this module imports only
// the parse tree, the schemas, the value vocabulary, and the (runtime-free)
// expression compiler — no runtime classes — so the compiler front-end
// (APPROACH §5) runs it standalone. Bare-name scope resolution (R6) is NOT
// here: it needs real identifier analysis (the typescript package), which
// must stay out of the zero-dependency runtime graph — compile.ts owns it.
//
// A `{ }` value (R4) checks as: attribute must exist, body must be valid
// expression syntax (compileExpr, whose messages this shares with the
// binding path). Its *type* is deliberately not checked here — that is the
// tsc half of the compiler plan; the runtime path trusts the body (HANDOFF
// §R4 records the gap and the plan that closes it). Method members (R5)
// check the same way — name rules against the schema (attributes and
// methods share the member namespace; a handler must answer a declared
// event), statement-body syntax via compileBody.
//
// R6 adds the program level: user classes register as schemas (the checker's
// half of the twin tables — programSchemas), a class body checks as an
// instance of the class it declares, inline attribute declarations grow an
// element an anonymous schema, and named children join the one member
// namespace.

import type { Element, Attr, Method, AttrDecl, ClassDecl, Program, TopDecl, Literal } from "./parser.js";
import { DeclareError, type Pos } from "./errors.js";
import type { Plugin } from "./plugin.js";
import { assembleBlocks, dispatchBlockChecks } from "./plugin.js";
import { SCHEMAS, SUBSCRIPTION_SOURCES, attrType, isReadOnly, descendsFrom, eventOfHandler, eventsOf, handlerName, type ComponentSchema } from "./schema.js";
import { Diag } from "./diagnostics.js";
import { coerce, declaredType, describeLiteral, DECLARED_TYPE_NAMES, type AttrType, type AttrValue } from "./value.js";
import { validateExpr, validateBody, CONSTRUCTOR_NAMES } from "./expr.js";
import { faceWeight, FONT_WEIGHTS } from "./font.js";

/** The styling declarations in scope while an element tree checks: the
 *  program's style bundles (fields validated per application site — a
 *  bundle types against the class it lands on) and its stylesheet names
 *  (`stylesheet = Dark` resolves against these). */
export interface StyleEnv {
  readonly bundles: ReadonlyMap<string, Element>;
  readonly stylesheets: ReadonlySet<string>;
  readonly fonts: ReadonlySet<string>;
  /** (bundle, schema) pairs already validated — one report per pairing. */
  readonly validated: Set<string>;
}

const EMPTY_ENV: StyleEnv = { bundles: new Map(), stylesheets: new Set(), fonts: new Set(), validated: new Set() };

/** Attribute kinds a stylesheet entry or style bundle may never set —
 *  structural relationships, not values (recorded v1 refusals). */
const UNSTYLABLE: Partial<Record<AttrType["kind"], string>> = {
  component: "a component slot (layout) is structure",
  cursor: "a data cursor is structure",
  styles: "a bundle list cannot arrive through the styling channels",
  stylesheet: "a stylesheet cannot set the stylesheet",
};

/** The scope nouns of language §11 — never legal as member or parameter names.
 *  `app` is the running-App noun (compiles to `this.root`); reserving it here
 *  keeps it un-shadowable, so `app.hostWidth` always means the App. */
const NOUNS = ["this", "parent", "classroot", "app"];

/** The value-constructor names (styling rung) are reserved as member names:
 *  in call position a body's `gradient(…)` is always the constructor, so a
 *  member wearing the name would be unreachable there. (`fill`/`stroke`/
 *  `shadow` are already View attributes — the ordinary collision rules cover
 *  them; this catches the two that are not.) */
const RESERVED = CONSTRUCTOR_NAMES;

/** Typecheck a parsed tree — a whole Program (classes + root) or a bare
 *  Element fragment. Returns every error found, in source order — an empty
 *  array means the tree is well-typed and safe to instantiate. */
export function check(input: Element | Program, plugins: readonly Plugin[] = [], source: string = ""): DeclareError[] {
  const program: Program =
    "root" in input ? input : { classes: [], stylesheets: [], styles: [], fonts: [], includes: [], includeSpans: [], uses: [], blocks: [], root: input };
  const { infos, schemas, errors } = programSchemas(program.classes);
  const env = checkStyleDecls(program, schemas, errors);
  // A class body checks as an instance of its own (just-registered) class:
  // sets against declared + inherited attributes, handlers against inherited
  // events, children recursively — no class-specific checking machinery.
  // Its decls were consumed by registration, so only their namespace
  // membership is re-checked here (declsOwned).
  for (const info of infos) {
    checkBodyRootReplication(info.decl.body, errors, `class ${info.decl.name}'s own body`);
    checkElement(info.decl.body, errors, schemas, true, env, null, true);
  }
  checkBodyRootReplication(program.root, errors, "the program root");
  checkElement(program.root, errors, schemas, false, env);
  // The `use` keep-list (composition.md §1c): every name must resolve to a known
  // component — a built-in, or a class the program declares or auto-includes —
  // else it is a typo that would silently keep nothing. `schemas` is the merged
  // name→schema table (built-ins + user/auto-included classes); abstract bases
  // (`Layout`, `RichText`) are absent, so `use`-ing one is correctly rejected.
  for (const name of program.uses) {
    if (!Object.hasOwn(schemas, name)) {
      errors.push(new DeclareError(`use [ ${name} ]: unknown component '${name}' — a use entry names a built-in or a declared/included class`, program.root.pos));
    }
  }
  // (An 0xRRGGBBAA 8-hex literal is the `0x` twin of #RRGGBBAA — an alpha
  // color: compile.ts lowers it to colorWithAlpha(…) and the typecheck grounds
  // it as Color, so a color in a numeric slot fails there (or in coerce for a
  // literal attr). No source-scan lint needed.)
  // Members of different kinds interleave freely in source but are checked
  // per kind (attrs, then methods, then the child recursion); a stable sort
  // on position restores the promised source order. Every check error is
  // positioned, so the fallback never actually fires.
  // Block plugins: run each `keyword Name { … }` checker. `taken` is the full
  // non-block top-level namespace (classes/built-ins ∪ stylesheet/style/font
  // names) — so a block colliding with any of them is caught, in any source
  // order. Inert when no plugin was passed (blocks is empty → no dispatch).
  if (program.blocks.length > 0) {
    const blockMap = assembleBlocks(plugins);
    const taken = new Set<string>(Object.keys(schemas));
    for (const d of program.stylesheets) taken.add(d.name);
    for (const d of program.styles) taken.add(d.name);
    for (const d of program.fonts) taken.add(d.name);
    errors.push(...dispatchBlockChecks(program.blocks, blockMap, source, schemas, taken));
  }
  errors.sort((a, b) => (a.pos?.offset ?? 0) - (b.pos?.offset ?? 0));
  return errors;
}

// ── User classes: the schema half of the twin tables ───────────────────────

/** One registered user class: its declaration, its schema, and its declared
 *  attributes' coerced defaults (undefined = "no default; starts undefined
 *  until set"). instantiate.ts synthesizes the runtime twin from this. */
export interface ClassInfo {
  decl: ClassDecl;
  schema: ComponentSchema;
  defaults: Record<string, AttrValue | undefined>;
}

/** Register a program's classes: validate each declaration and produce the
 *  program's schema table — the built-ins plus one ComponentSchema per class,
 *  chained to its base exactly like the built-ins chain (the R2 "R6 plug-in
 *  shape", now plugged in). Per-PROGRAM on purpose: the global SCHEMAS stays
 *  built-ins only, so two programs' classes can never collide.
 *
 *  A base must be declared above its subclass (or be a built-in); children
 *  inside bodies may reference classes declared later — declaration order
 *  constrains inheritance, not composition. A class that (transitively)
 *  contains itself is an error here: it could never finish instantiating. */
export function programSchemas(classes: readonly ClassDecl[]): {
  infos: ClassInfo[];
  schemas: Record<string, ComponentSchema>;
  errors: DeclareError[];
} {
  const infos: ClassInfo[] = [];
  const schemas: Record<string, ComponentSchema> = { ...SCHEMAS };
  const errors: DeclareError[] = [];
  for (const decl of classes) {
    if (Object.hasOwn(schemas, decl.name)) {
      errors.push(new DeclareError(`there is already a component named '${decl.name}'`, decl.pos));
      continue;
    }
    if (!Object.hasOwn(schemas, decl.base)) {
      errors.push(new DeclareError(
        `unknown base '${decl.base}' — a class extends a built-in component or a class declared above it`,
        decl.basePos
      ));
      continue; // no schema to chain to; uses of this class report as unknown
    }
    const base = schemas[decl.base];
    // The general rule is that a class may be subclassed like any class. Three
    // roots are WIRED today: View (visual), Layout (a strategy — §5 "…and ones
    // you write"), and Node (the plain atom — a non-visual controller / service
    // / coordinator). The rest is a wiring gap, not a language rule: Dataset and
    // Animator are subclassable IN PRINCIPLE (their construct paths simply don't
    // yet install a subclass's own decls — the same plumbing D-7 did for Layout;
    // note DataSource already IS a Dataset subclass), and State is declarative,
    // with no computation to override. Hence "not wired yet", not "sealed".
    if (!descendsFrom(base, "View") && !descendsFrom(base, "Layout") && !descendsFrom(base, "Node")) {
      errors.push(new DeclareError(
        `subclassing '${decl.base}' is not wired yet — a class extends View, Layout, or Node today (Dataset/Animator want the same plumbing; State is declarative)`,
        decl.basePos
      ));
      continue;
    }
    const attrs: Record<string, AttrType> = {};
    const defaults: Record<string, AttrValue | undefined> = {};
    const prevailing: string[] = [];
    const readOnly: string[] = [];
    for (const d of decl.body.decls) {
      const r = checkDecl(base, d, decl.name);
      if (!r.ok) { errors.push(r.error); continue; }
      if (Object.hasOwn(attrs, d.name)) continue; // the namespace pass reports the duplicate
      attrs[d.name] = r.type;
      defaults[d.name] = r.value;
      if (d.prevailing) prevailing.push(d.name);
      if (d.readOnly) readOnly.push(d.name);
    }
    const schema: ComponentSchema = { name: decl.name, base, attrs, prevailing, readOnly };
    schemas[decl.name] = schema;
    infos.push({ decl, schema, defaults });
  }
  // Containment cycles: DFS over "class → user classes used in its body".
  const uses = new Map<string, Set<string>>();
  const collect = (el: Element, into: Set<string>): void => {
    for (const child of el.children) {
      if (uses.has(child.tag)) into.add(child.tag);
      collect(child, into);
    }
  };
  for (const info of infos) uses.set(info.decl.name, new Set());
  for (const info of infos) collect(info.decl.body, uses.get(info.decl.name)!);
  for (const info of infos) {
    const seen = new Set<string>();
    const reaches = (name: string): boolean => {
      if (seen.has(name)) return false;
      seen.add(name);
      const used = uses.get(name);
      return used !== undefined && (used.has(info.decl.name) || [...used].some(reaches));
    };
    if (uses.get(info.decl.name)!.has(info.decl.name) || [...uses.get(info.decl.name)!].some(reaches)) {
      errors.push(new DeclareError(
        `class ${info.decl.name} contains itself — a class may not appear inside its own body (directly or through another class)`,
        info.decl.pos
      ));
    }
  }
  return { infos, schemas, errors };
}

// ── Styling declarations: stylesheets + style bundles ───────────────────────

/** Validate a program's `stylesheet`/`style` declarations and produce the
 *  StyleEnv the element walk resolves against. One message source with
 *  instantiate: both consume the same helpers (checkAttr, coerceToken via
 *  checkThemeRecord/checkEntry), so a direct instantiate of an unchecked
 *  tree dies with the same wording. */
export function checkStyleDecls(
  program: Program,
  schemas: Readonly<Record<string, ComponentSchema>>,
  errors: DeclareError[]
): StyleEnv {
  const bundles = new Map<string, Element>();
  const stylesheets = new Set<string>();
  const fonts = new Set<string>();
  const taken = (name: string): boolean =>
    Object.hasOwn(schemas, name) || bundles.has(name) || stylesheets.has(name) || fonts.has(name);
  for (const s of program.styles) {
    if (taken(s.name)) {
      errors.push(new DeclareError(`there is already a component, stylesheet, style, or font named '${s.name}'`, s.pos));
      continue;
    }
    errors.push(...checkStyleBody(s));
    bundles.set(s.name, s.body);
  }
  for (const s of program.stylesheets) {
    if (taken(s.name)) {
      errors.push(new DeclareError(`there is already a component, stylesheet, style, or font named '${s.name}'`, s.pos));
      continue;
    }
    errors.push(...checkStylesheetBody(s, schemas));
    stylesheets.add(s.name);
  }
  for (const f of program.fonts) {
    if (taken(f.name)) {
      errors.push(new DeclareError(`there is already a component, stylesheet, style, or font named '${f.name}'`, f.pos));
      continue;
    }
    errors.push(...checkFontBody(f));
    fonts.add(f.name);
  }
  return { bundles, stylesheets, fonts, validated: new Set() };
}

/** A style bundle carries attribute sets only — a look, not a component.
 *  Its fields TYPE against each class it is applied to (checkBundleUse),
 *  so declaration-time checking is shape + the always-wrong names. */
function checkStyleBody(decl: TopDecl): DeclareError[] {
  const errors: DeclareError[] = [];
  const b = decl.body;
  for (const d of b.decls) errors.push(new DeclareError(`style ${decl.name}: a bundle declares no attributes — it is a look, not a component`, d.pos));
  for (const m of b.methods) errors.push(new DeclareError(`style ${decl.name}: a bundle has no methods`, m.pos));
  for (const c of b.children) errors.push(new DeclareError(`style ${decl.name}: a bundle has no children — attribute sets only`, c.pos));
  if (b.raw !== undefined) errors.push(new DeclareError(`style ${decl.name}: a bundle takes [ ] members, not a { } body`, b.raw.pos));
  return errors;
}

/** A font names a FAMILY that owns its faces (docs/system-design/fonts.md): an optional
 *  'family = "…"' (defaults to the name) and zero or more `Face` children; no
 *  faces = a system font. Reports every problem (like the bundle check); the
 *  buildFonts in font.ts is the throwing safety net. */
function checkFontBody(decl: TopDecl): DeclareError[] {
  const errors: DeclareError[] = [];
  const b = decl.body;
  for (const d of b.decls) errors.push(new DeclareError(`font ${decl.name}: a font has no declarations`, d.pos));
  for (const m of b.methods) errors.push(new DeclareError(`font ${decl.name}: a font has no methods`, m.pos));
  if (b.raw !== undefined) errors.push(new DeclareError(`font ${decl.name}: a font takes a [ ] body, not { }`, b.raw.pos));
  for (const a of b.attrs) {
    if (a.name === "family") {
      if (a.value.kind !== "string") errors.push(new DeclareError(`font ${decl.name}: family is a quoted string`, a.value.pos));
      continue;
    }
    errors.push(new DeclareError(`font ${decl.name}: a font body carries 'family = "…"' and Face children only — not '${a.name}'`, a.pos));
  }
  let faces = 0;
  for (const c of b.children) {
    if (c.tag !== "Face") { errors.push(new DeclareError(`font ${decl.name}: '${c.tag}' is not a Face`, c.pos)); continue; }
    errors.push(...checkFace(decl.name, c));
    faces++;
  }
  if (b.attrs.length === 0 && faces === 0) {
    errors.push(new DeclareError(`font ${decl.name}: declare a family ('family = "…"') or at least one Face`, decl.pos));
  }
  return errors;
}

/** One `Face [ src, weight?, italic? ]`. src is required; weight is a formalized
 *  token; italic is a boolean. */
function checkFace(fontName: string, face: Element): DeclareError[] {
  const errors: DeclareError[] = [];
  let hasSrc = false;
  for (const a of face.attrs) {
    if (a.name === "src") { errors.push(...checkSource(fontName, a.value)); hasSrc = true; continue; }
    if (a.name === "weight") {
      if (a.value.kind !== "ident" || faceWeight(a.value.name) === null)
        errors.push(new DeclareError(`font ${fontName}: a Face weight is a token (${Object.keys(FONT_WEIGHTS).join(", ")})`, a.value.pos));
      continue;
    }
    if (a.name === "italic") {
      if (a.value.kind !== "ident" || (a.value.name !== "true" && a.value.name !== "false"))
        errors.push(new DeclareError(`font ${fontName}: a Face's italic is true or false`, a.value.pos));
      continue;
    }
    errors.push(new DeclareError(`font ${fontName}: a Face has src, weight, italic — not '${a.name}'`, a.pos));
  }
  for (const c of face.children) errors.push(new DeclareError(`font ${fontName}: a Face has no children`, c.pos));
  if (!hasSrc) errors.push(new DeclareError(`font ${fontName}: a Face needs a src`, face.pos));
  return errors;
}

/** A Face source: a URL string, `url("…")` / `local("…")`, or a list of those. */
function checkSource(fontName: string, lit: Literal): DeclareError[] {
  if (lit.kind === "string") return [];
  if (lit.kind === "call") {
    if (lit.name !== "url" && lit.name !== "local")
      return [new DeclareError(`font ${fontName}: a face source is a URL string, url("…"), local("…"), or a list — not '${lit.name}(…)'`, lit.pos)];
    if (lit.args.length !== 1 || lit.args[0].kind !== "string")
      return [new DeclareError(`font ${fontName}: ${lit.name}(…) takes one quoted string`, lit.pos)];
    return [];
  }
  if (lit.kind === "list") {
    if (lit.items.length === 0) return [new DeclareError(`font ${fontName}: a face source list is empty`, lit.pos)];
    return lit.items.flatMap((i) => checkSource(fontName, i));
  }
  return [new DeclareError(`font ${fontName}: a face source is a URL string, url("…"), local("…"), or a list of them`, lit.pos)];
}

/** Validate one bundle against one applied-to schema (memoized per pairing
 *  by the caller): every field must be an attribute of that class, of a
 *  stylable kind — the loud, positioned failure the ruled design promises. */
function checkBundleUse(bundle: string, body: Element, schema: ComponentSchema, at: Pos): DeclareError[] {
  const errors: DeclareError[] = [];
  for (const a of body.attrs) {
    const type = attrType(schema, a.name);
    if (type === null) {
      errors.push(new DeclareError(
        `style ${bundle} sets '${a.name}', which ${schema.name} (styled at line ${at.line}, col ${at.col}) does not declare`,
        a.pos
      ));
      continue;
    }
    const bad = UNSTYLABLE[type.kind];
    if (bad !== undefined) {
      errors.push(new DeclareError(`style ${bundle}.${a.name}: ${bad}`, a.pos));
      continue;
    }
    const r = checkAttr(schema, a);
    if (!r.ok) errors.push(r.error);
  }
  return errors;
}

/** A stylesheet body: an optional `theme: Theme [ tokens ]` record plus
 *  class-keyed entries (`Button: [ sets ]`), nothing else. Entries validate
 *  against the named class's schema — a stale skin fails loudly (ruled). */
function checkStylesheetBody(
  decl: TopDecl,
  schemas: Readonly<Record<string, ComponentSchema>>
): DeclareError[] {
  const errors: DeclareError[] = [];
  const b = decl.body;
  const where = `stylesheet ${decl.name}`;
  for (const a of b.attrs) {
    errors.push(new DeclareError(
      `${where}: a stylesheet carries a theme record and class-keyed entries — write 'theme: Theme [ … ]' or 'ClassName: [ … ]'`,
      a.pos
    ));
  }
  for (const d of b.decls) errors.push(new DeclareError(`${where}: a stylesheet declares no attributes`, d.pos));
  for (const m of b.methods) errors.push(new DeclareError(`${where}: a stylesheet has no methods`, m.pos));
  if (b.raw !== undefined) errors.push(new DeclareError(`${where}: a stylesheet takes [ ] members, not a { } body`, b.raw.pos));
  const seen = new Map<string, Pos>();
  for (const child of b.children) {
    if (child.name === "theme" && child.tag === "Theme") {
      errors.push(...checkThemeRecord(where, child));
      continue;
    }
    if (child.entry !== true) {
      errors.push(new DeclareError(
        `${where}: a stylesheet's members are 'theme: Theme [ … ]' and class-keyed entries ('${child.tag}: [ … ]')`,
        child.pos
      ));
      continue;
    }
    const schema = Object.hasOwn(schemas, child.tag) ? schemas[child.tag] : null;
    if (schema === null) {
      errors.push(new DeclareError(`${where}: unknown component '${child.tag}' — an entry is keyed by a class name`, child.pos));
      continue;
    }
    if (!descendsFrom(schema, "View")) {
      errors.push(new DeclareError(`${where}: '${child.tag}' is not a View — only views are styled`, child.pos));
      continue;
    }
    const first = seen.get(child.tag);
    if (first !== undefined) {
      errors.push(new DeclareError(
        `${where}: '${child.tag}' has two entries (first at line ${first.line}, col ${first.col}) — one entry per class`,
        child.pos
      ));
      continue;
    }
    seen.set(child.tag, child.pos);
    errors.push(...checkEntry(where, child, schema));
  }
  return errors;
}

/** One class-keyed entry: attribute sets only, each an attribute the class
 *  declares (any public attribute — ruled uniformity), of a stylable kind,
 *  a literal or a `{ }` (evaluated with `this` = the styled view). */
export function checkEntry(where: string, entry: Element, schema: ComponentSchema): DeclareError[] {
  const errors: DeclareError[] = [];
  for (const d of entry.decls) errors.push(new DeclareError(`${where}.${entry.tag}: an entry declares nothing — attribute sets only`, d.pos));
  for (const m of entry.methods) errors.push(new DeclareError(`${where}.${entry.tag}: an entry has no methods`, m.pos));
  for (const c of entry.children) errors.push(new DeclareError(`${where}.${entry.tag}: an entry has no children — attribute sets only`, c.pos));
  const seen = new Map<string, Pos>();
  for (const a of entry.attrs) {
    const first = seen.get(a.name);
    if (first !== undefined) {
      errors.push(new DeclareError(`${where}.${entry.tag}.${a.name} is set twice (first set at line ${first.line}, col ${first.col})`, a.pos));
      continue;
    }
    seen.set(a.name, a.pos);
    const type = attrType(schema, a.name);
    if (type === null) {
      errors.push(new DeclareError(`${where}: ${entry.tag} has no attribute '${a.name}'${cssAttributeHint(a.name)}`, a.pos));
      continue;
    }
    const bad = UNSTYLABLE[type.kind];
    if (bad !== undefined) {
      errors.push(new DeclareError(`${where}.${entry.tag}.${a.name}: ${bad}`, a.pos));
      continue;
    }
    if (a.value.kind === "percent") {
      errors.push(new DeclareError(`${where}.${entry.tag}.${a.name}: a percent resolves against a parent — an entry carries values (use a { } reading parent.* if you mean it)`, a.value.pos));
      continue;
    }
    if (a.value.kind === "path") {
      errors.push(new DeclareError(`${where}.${entry.tag}.${a.name}: a :path reads a view's cursor — not stylesheet surface (v1)`, a.value.pos));
      continue;
    }
    const r = checkAttr(schema, a);
    if (!r.ok) errors.push(r.error);
  }
  return errors;
}

/** The skin's token record: `theme: Theme [ accent = #4F8EF7, radius = 6 ]`
 *  — token names are free (a Theme is schema-less in v1), values are plain
 *  literals or decoration constructors. */
export function checkThemeRecord(where: string, rec: Element): DeclareError[] {
  const errors: DeclareError[] = [];
  for (const d of rec.decls) errors.push(new DeclareError(`${where}.theme: a token record declares nothing`, d.pos));
  for (const m of rec.methods) errors.push(new DeclareError(`${where}.theme: a token record has no methods`, m.pos));
  for (const c of rec.children) errors.push(new DeclareError(`${where}.theme: a token record has no children`, c.pos));
  const seen = new Map<string, Pos>();
  for (const a of rec.attrs) {
    const first = seen.get(a.name);
    if (first !== undefined) {
      errors.push(new DeclareError(`${where}.theme.${a.name} is set twice (first set at line ${first.line}, col ${first.col})`, a.pos));
      continue;
    }
    seen.set(a.name, a.pos);
    const t = coerceToken(a.value);
    if (t === undefined) {
      errors.push(new DeclareError(
        `${where}.theme.${a.name}: a token is a number, string, boolean, color, or a value constructor (gradient/stroke/shadow) — got ${describeLiteral(a.value)}`,
        a.value.pos
      ));
    }
  }
  return errors;
}

/** A theme token's value, or undefined when the literal isn't token-shaped.
 *  Colors coerce through the Color grammar (alpha forms included); the
 *  decoration constructors coerce through their own slots' grammars. */
export function coerceToken(lit: Literal): unknown {
  switch (lit.kind) {
    case "number":
      return lit.value;
    case "string":
      return lit.value;
    case "hexColor": {
      const c = coerce({ kind: "color" }, lit);
      return c.ok ? c.value : undefined;
    }
    case "ident": {
      if (lit.name === "true") return true;
      if (lit.name === "false") return false;
      if (lit.name === "null") return null;
      const c = coerce({ kind: "color" }, lit); // named colors
      return c.ok ? c.value : undefined;
    }
    case "call": {
      const asFill = coerce({ kind: "fill" }, lit);
      if (asFill.ok) return asFill.value;
      const asStroke = coerce({ kind: "stroke" }, lit);
      if (asStroke.ok) return asStroke.value;
      const asShadow = coerce({ kind: "shadow" }, lit);
      return asShadow.ok ? asShadow.value : undefined;
    }
    default:
      return undefined;
  }
}

/** One checked attribute declaration: its resolved type and coerced default
 *  — or, since the styling rung, a default BINDING (`labelColor: Color =
 *  { theme.buttonText }`, the ruled R6 unlock: a live per-instance fallback
 *  below every provision) — or the (unthrown) error. Shared by class
 *  registration and by inline declarations on instances — one message
 *  source, like checkAttr. */
export type CheckedDecl =
  | { ok: true; type: AttrType; value: AttrValue | undefined; binding?: { src: string; pos: Pos } }
  | { ok: false; error: DeclareError };

export function checkDecl(schema: ComponentSchema, d: AttrDecl, owner: string = schema.name): CheckedDecl {
  const err = (message: string, pos: Pos): CheckedDecl => ({ ok: false, error: new DeclareError(message, pos) });
  if (NOUNS.includes(d.name)) {
    return err(`'${d.name}' is a scope noun (language §11) — it cannot be declared`, d.pos);
  }
  if (RESERVED.includes(d.name)) {
    return err(`'${d.name}' is a value constructor (gradient/stroke/shadow/stop) — it cannot be a member name`, d.pos);
  }
  if (attrType(schema, d.name) !== null) {
    // A read-only intrinsic must not advise "write name = …" — setting it is
    // ALSO an error (skill-arm finding: `contentWidth: number = …` got the
    // wrong fix named twice). Choose-another-name is the only repair.
    if (isReadOnly(schema, d.name)) {
      return err(
        `'${d.name}' is a built-in read-only intrinsic of ${schema.name} — it is computed for you; choose another name for your derived value`,
        d.pos
      );
    }
    return err(
      `${schema.name} already has an attribute '${d.name}' — a declaration introduces a new one; write '${d.name} = …' to set the existing one`,
      d.pos
    );
  }
  const type = declaredType(d.type);
  if (type === null) {
    return err(
      `unknown type '${d.type}' — a declared attribute's type is one of ${DECLARED_TYPE_NAMES.join(", ")}`,
      d.typePos
    );
  }
  if (d.def === null) return { ok: true, type, value: undefined };
  if (d.def.kind === "code") {
    // A default BINDING (styling rung, the ruled R6 unlock): a live
    // per-instance fallback — in effect only while nothing provides the
    // slot, so it never contends with any offer (`labelColor: Color =
    // { theme.buttonText }` is what lets components defer to tokens).
    const e = validateExpr(d.def.src);
    if (e !== null) {
      return err(`${owner}.${d.name}'s default = { … } ${e}`, d.def.pos);
    }
    return { ok: true, type, value: undefined, binding: { src: d.def.src, pos: d.def.pos } };
  }
  if (d.def.kind === "percent") {
    return err(
      `${owner}.${d.name}: a percent default would resolve against each instance's parent — set it per instance until percent defaults are designed`,
      d.def.pos
    );
  }
  const c = coerce(type, d.def);
  if (!c.ok) {
    // A raw :path default has one plausible intent — the { } binding form the
    // corpus itself uses (`rid: string = { :id }`): name it (Run-2 finding).
    const hint = d.def.kind === "path"
      ? ` — to seed from data, write a { } default: ${d.name}: ${d.type} = { :${d.def.path} }`
      : "";
    return err(
      `${owner}.${d.name}'s default expects ${c.expected}, got ${c.found ?? describeLiteral(d.def)}${hint}`,
      d.def.pos
    );
  }
  return { ok: true, type, value: c.value };
}

/** An element's schema plus its inline declarations — the anonymous one-off
 *  subclass of language §5, in the checker's currency. Validation of the
 *  decls themselves is the caller's (checkDecl); this only shapes the chain. */
export function withDecls(schema: ComponentSchema, decls: readonly AttrDecl[]): ComponentSchema {
  if (decls.length === 0) return schema;
  const attrs: Record<string, AttrType> = {};
  const prevailing: string[] = [];
  for (const d of decls) {
    const r = checkDecl(schema, d);
    if (r.ok && !Object.hasOwn(attrs, d.name)) {
      attrs[d.name] = r.type;
      if (d.prevailing) prevailing.push(d.name);
    }
  }
  return { name: schema.name, base: schema, attrs, prevailing };
}

// ── The element walk ────────────────────────────────────────────────────────

/** The many-path attribute (`datapath = :items[]`) that makes an element a
 *  replication template, or null. Type-directed: a many-path on a
 *  cursor-typed slot — today, View.datapath — is what replicates. */
export function manyPathOf(
  el: Element,
  schemas: Readonly<Record<string, ComponentSchema>>
): Attr | null {
  const schema = Object.hasOwn(schemas, el.tag) ? schemas[el.tag] : null;
  if (schema === null) return null;
  for (const a of el.attrs) {
    if (a.value.kind === "path" && a.value.many && attrType(schema, a.name)?.kind === "cursor") {
      return a;
    }
  }
  return null;
}

/** A body root cannot be a replication template: the program root is one
 *  view, and a class body replicating ITSELF would make every instantiation
 *  many (put the `:path[]` on the use site instead). */
function checkBodyRootReplication(el: Element, errors: DeclareError[], where: string): void {
  const many = el.attrs.find((a) => a.name === "datapath" && a.value.kind === "path" && a.value.many);
  if (many !== undefined) {
    errors.push(new DeclareError(
      `${where} cannot replicate — ':${(many.value as { path: string }).path}[]' makes many instances; put it on a child element (or a use site)`,
      many.value.pos
    ));
  }
}

function checkElement(
  el: Element,
  errors: DeclareError[],
  schemas: Readonly<Record<string, ComponentSchema>>,
  declsOwned: boolean,
  env: StyleEnv = EMPTY_ENV,
  /** The enclosing element's schema — the animator's TARGET context. Threaded
   *  so the one animation check (animation.md §3) can resolve `attribute`
   *  against the parent's numeric slots; null at the root / under an unknown
   *  parent (no target to check against). */
  parentSchema: ComponentSchema | null = null,
  /** True only for a class-declaration body root: the body IS a component
   *  definition, so the "a layout is not a child" guard — which catches a
   *  layout used as a tree child or the app root — must not fire on a legitimate
   *  `class X extends TweenLayout [ … ]`. */
  classRoot = false
): void {
  if (el.entry === true) {
    errors.push(new DeclareError(
      `'${el.tag}: [ … ]' is a class-keyed entry — it belongs in a stylesheet`,
      el.pos
    ));
    return;
  }
  // Own-key lookup: a tag named `constructor` must not resolve through
  // Object.prototype.
  const schema = Object.hasOwn(schemas, el.tag) ? schemas[el.tag] : null;
  // Elements consumed as component-typed attribute VALUES (a `layout:` member)
  // are checked by checkComponentValue, not as tree children.
  const consumed = new Set<Element>();
  if (schema === null) {
    errors.push(Diag.unknownComponent(el.tag, el.pos, Object.keys(schemas)));
  } else if (descendsFrom(schema, "Layout") && !classRoot) {
    // A layout reached as an element in the tree — anonymous, mis-named, or
    // the root. The doc's ruling (language §5, Appendix A): a layout is an
    // attribute, never a child. (A class-declaration body root is exempt — it
    // is the DEFINITION of a custom layout, not a misplaced use.)
    errors.push(new DeclareError(
      `'${el.tag}' is a layout — a layout is an attribute, not a child: write 'layout: ${el.tag} [ … ]' on the view it arranges`,
      el.pos
    ));
    return; // nothing beneath a misplaced layout to salvage
  } else if (descendsFrom(schema, "Dataset")) {
    checkDataNode(el, schema, errors);
    return; // a data node's whole surface was judged above — no subtree
  } else if (descendsFrom(schema, "Animator")) {
    checkAnimatorNode(el, schema, parentSchema, errors);
    return; // an animator's whole surface is judged here — no subtree
  } else if (descendsFrom(schema, "AnimatorGroup")) {
    checkAnimatorGroupNode(el, schema, schemas, parentSchema, errors, false);
    return; // a group judges its whole subtree (its members are animators)
  } else if (descendsFrom(schema, "State")) {
    checkStateNode(el, schema, schemas, parentSchema, env, errors);
    return; // a state judges its whole subtree (overrides + child views)
  } else {
    // Inline declarations (an instance carrying its own members, §5). On a
    // class body the registration pass already validated and absorbed them
    // into the class's schema (declsOwned), so only namespace membership
    // remains to check below.
    if (el.raw !== undefined) {
      errors.push(new DeclareError(
        `only a Dataset carries a { } body — a ${el.tag}'s members go in [ ]`,
        el.raw.pos
      ));
    }
    let eff = schema;
    if (!declsOwned) {
      for (const d of el.decls) {
        const r = checkDecl(schema, d);
        if (!r.ok) errors.push(r.error);
      }
      eff = withDecls(schema, el.decls);
    }
    checkNamespace(el, eff, errors);
    // `key = :field` is replication metadata (language §9): on a child whose
    // datapath matches many, it names each record's STABLE identity so a
    // re-derived collection reconciles by that key (reusing instances) instead
    // of by object identity (rebuilding every fresh object). It is magic ONLY
    // on a replication template — elsewhere `key` is an ordinary attribute
    // name — so the special case can't collide with a real `key` slot.
    const replicated = manyPathOf(el, schemas) !== null;
    for (const attr of el.attrs) {
      if (attr.name === "key" && replicated) {
        if (attr.value.kind !== "path" || attr.value.many) {
          errors.push(new DeclareError(
            `key = :field names each record's identity field (e.g. 'key = :id') — a single :path, not ${attr.value.kind === "path" ? "a many-path" : "a literal"}`,
            attr.value.pos
          ));
        }
        continue;
      }
      const t = attrType(eff, attr.name);
      // The two styling-channel slots resolve against PROGRAM declarations,
      // which the runtime-free coercion cannot see — routed here.
      if (t?.kind === "styles" && attr.value.kind === "list") {
        for (const n of attr.value.items) {
          if (n.kind !== "ident") {
            errors.push(new DeclareError(`a style list holds style names, not values`, n.pos));
            continue;
          }
          const bundle = env.bundles.get(n.name);
          if (bundle === undefined) {
            errors.push(new DeclareError(
              env.bundles.size > 0
                ? `no style named '${n.name}' — declared styles: ${[...env.bundles.keys()].join(", ")}`
                : `no style named '${n.name}' — this program declares no style bundles`,
              n.pos
            ));
            continue;
          }
          // A bundle types against the class it lands on — once per pairing.
          const key = `${n.name}@${eff.name}`;
          if (!env.validated.has(key)) {
            env.validated.add(key);
            errors.push(...checkBundleUse(n.name, bundle, eff, n.pos));
          }
        }
        continue;
      }
      if (t?.kind === "styles" && attr.value.kind === "code") {
        errors.push(new DeclareError(
          `${eff.name}.styles = { … }: the bundle list is static (ruled v1) — conditional looks are constraints on the slots themselves`,
          attr.value.pos
        ));
        continue;
      }
      if (t?.kind === "stylesheet" && attr.value.kind === "ident" && attr.value.name !== "null") {
        if (!env.stylesheets.has(attr.value.name)) {
          errors.push(new DeclareError(
            env.stylesheets.size > 0
              ? `no stylesheet named '${attr.value.name}' — declared stylesheets: ${[...env.stylesheets].join(", ")}`
              : `no stylesheet named '${attr.value.name}' — this program declares no stylesheets`,
            attr.value.pos
          ));
        }
        continue;
      }
      // `fontFamily = Name` / `[Name, "Helvetica", "sans-serif"]` resolves
      // against the program's `font` declarations — a name must be declared, a
      // string passes as a raw family (a bare string family falls through to
      // coercion). Routed here for the same reason as stylesheet — runtime-free
      // coercion cannot see the declarations.
      if (t?.kind === "font" && ((attr.value.kind === "ident" && attr.value.name !== "null") || attr.value.kind === "list")) {
        const items = attr.value.kind === "ident" ? [attr.value] : attr.value.items;
        for (const i of items) {
          if (i.kind === "string") continue;
          if (i.kind !== "ident") {
            errors.push(new DeclareError(`a fontFamily list holds font names and strings`, i.pos));
            continue;
          }
          if (!env.fonts.has(i.name)) {
            errors.push(new DeclareError(
              env.fonts.size > 0
                ? `no font named '${i.name}' — declared fonts: ${[...env.fonts].join(", ")}`
                : `no font named '${i.name}' — this program declares no fonts (use a raw family string, or add a 'font ${i.name} [ … ]')`,
              i.pos
            ));
          }
        }
        continue;
      }
      const r = checkAttr(eff, attr);
      if (!r.ok) errors.push(r.error);
    }
    for (const m of el.methods) {
      const r = checkMethod(eff, m);
      if (!r.ok) errors.push(r.error);
    }
    for (const child of el.children) {
      const many = manyPathOf(child, schemas);
      if (many !== null && child.name !== null) {
        errors.push(new DeclareError(
          `a replicated child cannot be named — ':${(many.value as { path: string }).path}[]' makes one instance per record, and '${child.name}' can only name one; reach the instances through their data`,
          child.pos
        ));
      }
      if (child.name === null) continue;
      const declared = attrType(eff, child.name);
      if (declared !== null && declared.kind === "component") {
        // The member `layout: SimpleLayout [ … ]` — a component-typed
        // attribute's VALUE in named-member clothing (the doc's layout
        // surface), not a tree child.
        consumed.add(child);
        errors.push(...checkComponentValue(schemas, schema.name, child.name, declared.of, child));
        continue;
      }
      // A named child is a member of THIS element (language §4: "reachable
      // as `bg` / `this.bg`") — so its name obeys the member namespace.
      if (NOUNS.includes(child.name)) {
        errors.push(new DeclareError(`'${child.name}' is a scope noun (language §11) — a child cannot take its name`, child.pos));
      } else if (declared !== null) {
        errors.push(new DeclareError(
          `${schema.name}.${child.name} is an attribute — a child may not take an attribute's name`,
          child.pos
        ));
      }
    }
  }
  // An unknown parent doesn't silence its subtree — child tags stand on
  // their own, so one typo can't mask every error beneath it. The children's
  // target context for the animation check is the parent's EFFECTIVE schema —
  // base + its inline attribute declarations — so a Spring/animator can target
  // a user-declared numeric attribute, not only a built-in slot. (A class body
  // already absorbed its decls into `schema`; an unknown parent stays null.)
  const childCtx = schema !== null && !declsOwned ? withDecls(schema, el.decls) : schema;
  for (const child of el.children) {
    if (!consumed.has(child)) checkElement(child, errors, schemas, false, env, childCtx);
  }
}

/** Validate a data node (R8: Dataset / DataSource — descendsFrom "Dataset").
 *  A data node is a NAMED member (bindings reach its lifecycle by name), it
 *  takes attributes only (its behavior is built in — no declarations,
 *  methods, or children), a Dataset carries its JSON in the raw `{ }` body
 *  (validated here, positioned), and a DataSource's data arrives from `url`
 *  instead. `:path` attributes are refused: a data node is where data LIVES,
 *  not a reader of some other cursor. */
function checkDataNode(el: Element, schema: ComponentSchema, errors: DeclareError[]): void {
  if (el.name === null) {
    errors.push(new DeclareError(
      `a ${el.tag} needs a name — write 'events: ${el.tag} …' so bindings can reach it`,
      el.pos
    ));
  }
  if (el.tag === "Dataset") {
    // A Dataset's value comes from EITHER a literal `{ }` JSON body OR a
    // derived `contents = { … }` constraint — one, not both, not neither.
    const derived = el.attrs.some((a) => a.name === "contents");
    if (el.raw === undefined && !derived) {
      errors.push(new DeclareError(
        `a Dataset needs data — a literal JSON body ('${el.name ?? "events"}: Dataset { … }') or a derived 'contents = { … }'`,
        el.pos
      ));
    } else if (el.raw !== undefined && derived) {
      errors.push(new DeclareError(
        `${el.name ?? el.tag}: a Dataset is EITHER a literal '{ … }' body OR a derived 'contents = { … }', not both`,
        el.raw.pos
      ));
    } else if (el.raw !== undefined) {
      try {
        JSON.parse(el.raw.src);
      } catch (e) {
        errors.push(new DeclareError(
          `${el.name ?? el.tag}: the Dataset body is not valid JSON — ${(e as Error).message}`,
          el.raw.pos
        ));
      }
    }
  } else if (el.raw !== undefined) {
    errors.push(new DeclareError(
      `a ${el.tag}'s data arrives from its url — only a Dataset embeds a { } body`,
      el.raw.pos
    ));
  }
  for (const d of el.decls) {
    errors.push(new DeclareError(`${el.tag}.${d.name}: a data node declares no new attributes`, d.pos));
  }
  for (const m of el.methods) {
    // event handlers pass: a DataSource declares `load` (schema events), so
    // `onLoad() { … }` is its arrival hook, not a new lifecycle method
    if (el.tag === "DataSource" && m.name === "onLoad") continue;
    errors.push(new DeclareError(
      `${el.tag}.${m.name}: a data node has no method members — its lifecycle (fetch, clear, set, …) is built in`,
      m.pos
    ));
  }
  for (const c of el.children) {
    errors.push(new DeclareError(`a data node has no children — its structure is its data`, c.pos));
  }
  for (const a of el.attrs) {
    if (a.name === "contents" && a.value.kind !== "code") {
      // A derived value is a constraint over other state, not a literal or a
      // cursor into itself: `contents = { app.buildGrid() }`.
      errors.push(new DeclareError(
        `${el.tag}.contents is a derived value — write 'contents = { … }' (a constraint over your reactive state)`,
        a.value.pos
      ));
      continue;
    }
    if (a.value.kind === "path") {
      errors.push(new DeclareError(
        `${el.tag}.${a.name} = :${a.value.path}: a data node is where data lives — a :path reads a view's cursor`,
        a.value.pos
      ));
      continue;
    }
    const r = checkAttr(schema, a);
    if (!r.ok) errors.push(r.error);
  }
}

/** Validate an animator node (animation.md §1–§3: descendsFrom "Animator").
 *  Like a data node it is a member that takes attributes only — no new
 *  declarations, no children, no { } body — BUT it carries the on* handlers
 *  (checkMethod against its declared events) and the built-in start()/stop()
 *  (guarded at instantiate, the runtime-member fact). The one animation
 *  compile check lives here, where the PARENT (the animator's target) is in
 *  context. */
function checkAnimatorNode(
  el: Element,
  schema: ComponentSchema,
  parentSchema: ComponentSchema | null,
  errors: DeclareError[],
  /** An enclosing AnimatorGroup already provides `attribute` (the LZX
   *  default-cascade) — so a member that omits its own `attribute` is legal. */
  attributeCascaded = false
): void {
  if (el.raw !== undefined) {
    errors.push(new DeclareError(`only a Dataset carries a { } body — an ${el.tag}'s members go in [ ]`, el.raw.pos));
  }
  for (const d of el.decls) {
    errors.push(new DeclareError(`${el.tag}.${d.name}: an animator declares no new attributes — its surface is built in`, d.pos));
  }
  for (const c of el.children) {
    errors.push(new DeclareError(`an animator drives a slot — it has no children`, c.pos));
  }
  // Handlers (onStart/onStop/onRepeat) and any plain method install like a
  // View's; checkMethod verifies a handler answers a declared event.
  for (const m of el.methods) {
    const r = checkMethod(schema, m);
    if (!r.ok) errors.push(r.error);
  }
  let hasAttribute = false;
  for (const a of el.attrs) {
    if (a.name === "attribute") {
      hasAttribute = true;
      // A bare token, not a value — the whole point is that a typo dies at
      // compile time (animation.md §1). `{ }` and `:path` are refused here.
      if (a.value.kind === "ident" && a.value.name !== "null") {
        checkTargetSlot(schema, a.value.name, parentSchema, a.value.pos, errors);
      } else {
        errors.push(new DeclareError(
          `${schema.name}.attribute names the target slot to drive as a bare token (like 'height' or 'x') — not ${describeLiteral(a.value)}`,
          a.value.pos
        ));
      }
      continue;
    }
    if (a.value.kind === "path") {
      errors.push(new DeclareError(
        `${schema.name}.${a.name} = :${a.value.path}: an animator attribute is a value or a { }, not a data read`,
        a.value.pos
      ));
      continue;
    }
    const r = checkAttr(schema, a);
    if (!r.ok) errors.push(r.error);
  }
  if (!hasAttribute && !attributeCascaded) {
    errors.push(new DeclareError(`an ${el.tag} needs 'attribute = <slot>' — the target slot it drives`, el.pos));
  }
}

/** Validate a state node (docs/system-design/states.md: descendsFrom "State"). Its
 *  body is special and does NOT walk as a generic component: `applied` is the
 *  one control slot (checked against StateSchema — boolean or a `{ }` gate),
 *  every OTHER attribute is an OVERRIDE checked against the ENCLOSING view's
 *  schema (the parent it targets), and the children are a conditional subtree
 *  checked as views in that same parent context. It carries the onApply /
 *  onRemove handlers; it declares no new attributes and takes no `{ }` body. */
function checkStateNode(
  el: Element,
  schema: ComponentSchema,
  schemas: Readonly<Record<string, ComponentSchema>>,
  parentSchema: ComponentSchema | null,
  env: StyleEnv,
  errors: DeclareError[]
): void {
  if (el.raw !== undefined) {
    errors.push(new DeclareError(`only a Dataset carries a { } body — a ${el.tag}'s members go in [ ]`, el.raw.pos));
  }
  for (const d of el.decls) {
    errors.push(new DeclareError(
      `${el.tag}.${d.name}: a state declares no new attributes — it overrides its view's slots and adds children`,
      d.pos
    ));
  }
  if (parentSchema === null) {
    errors.push(new DeclareError(
      `a ${el.tag} must be a member of a view — at the top level it has no slots to override`,
      el.pos
    ));
  }
  // Handlers (onApply / onRemove) install like a View's.
  for (const m of el.methods) {
    const r = checkMethod(schema, m);
    if (!r.ok) errors.push(r.error);
  }
  for (const a of el.attrs) {
    if (a.name === "applied") {
      const r = checkAttr(schema, a); // boolean literal or a { } gate
      if (!r.ok) errors.push(r.error);
      continue;
    }
    // Every other attribute overrides the ENCLOSING view — a value or a { },
    // never a data read (the override engine drives a literal or a constraint).
    if (a.value.kind === "path") {
      errors.push(new DeclareError(
        `${el.tag}.${a.name} = :${a.value.path}: a state override is a value or a { }, not a data read`,
        a.value.pos
      ));
      continue;
    }
    if (parentSchema === null) continue;
    const r = checkAttr(parentSchema, a);
    if (!r.ok) errors.push(r.error);
  }
  // Children: a conditional subtree for the enclosing view, checked as views in
  // the parent's context (their target, and the animation-check parent, is the
  // enclosing view — not the State).
  for (const child of el.children) {
    // E-6: `layout: SimpleLayout [ … ]` INSIDE a state — the responsive-switch
    // instinct. The generic layout-as-child guard would tell the author to
    // write exactly what they wrote; the real rule is the STATE context: an
    // override drives value slots, not component slots. Name the idioms.
    const cs = Object.hasOwn(schemas, child.tag) ? schemas[child.tag] : null;
    if (cs !== null && descendsFrom(cs, "Layout")) {
      errors.push(new DeclareError(
        `a state cannot swap '${child.tag}' in — an override drives the view's value slots, not its layout. Keep one layout and constrain geometry off the state's flag, or reassign the view's layout in an onApply()/onRemove() handler`,
        child.pos
      ));
      continue;
    }
    checkElement(child, errors, schemas, false, env, parentSchema);
  }
}

/** Validate an animatorgroup (animation.md §1, §4: descendsFrom
 *  "AnimatorGroup"). Like an animator it takes attributes + on* handlers only —
 *  no new declarations, no { } body — but its children ARE its members: each
 *  must be an Animator or a nested AnimatorGroup. The group's target is its
 *  PARENT (same as an animator's; `target =` is deferred), so its own
 *  `attribute` — and every member's — is checked against `parentSchema`, and
 *  that target is threaded UNCHANGED to the members (their target cascades from
 *  the group, not the group itself). A member may omit `attribute` when the
 *  group (or an enclosing group) supplies it — the LZX default-cascade. */
function checkAnimatorGroupNode(
  el: Element,
  schema: ComponentSchema,
  schemas: Readonly<Record<string, ComponentSchema>>,
  parentSchema: ComponentSchema | null,
  errors: DeclareError[],
  attributeCascaded: boolean
): void {
  if (el.raw !== undefined) {
    errors.push(new DeclareError(`only a Dataset carries a { } body — an ${el.tag}'s members go in [ ]`, el.raw.pos));
  }
  for (const d of el.decls) {
    errors.push(new DeclareError(`${el.tag}.${d.name}: an animatorgroup declares no new attributes — its surface is built in`, d.pos));
  }
  for (const m of el.methods) {
    const r = checkMethod(schema, m);
    if (!r.ok) errors.push(r.error);
  }
  // The group's own `attribute` (if any) cascades to members that omit theirs.
  let providesAttribute = attributeCascaded;
  for (const a of el.attrs) {
    if (a.name === "attribute") {
      providesAttribute = true;
      if (a.value.kind === "ident" && a.value.name !== "null") {
        checkTargetSlot(schema, a.value.name, parentSchema, a.value.pos, errors);
      } else {
        errors.push(new DeclareError(
          `${schema.name}.attribute names the target slot to drive as a bare token (like 'height' or 'x') — not ${describeLiteral(a.value)}`,
          a.value.pos
        ));
      }
      continue;
    }
    if (a.value.kind === "path") {
      errors.push(new DeclareError(
        `${schema.name}.${a.name} = :${a.value.path}: an animator attribute is a value or a { }, not a data read`,
        a.value.pos
      ));
      continue;
    }
    const r = checkAttr(schema, a);
    if (!r.ok) errors.push(r.error);
  }
  // Members: animators / nested groups, each targeting the SAME parent (the
  // group's target cascades to them), inheriting `attribute` if the group set it.
  for (const child of el.children) {
    const cs = Object.hasOwn(schemas, child.tag) ? schemas[child.tag] : null;
    if (cs !== null && descendsFrom(cs, "Animator")) {
      checkAnimatorNode(child, cs, parentSchema, errors, providesAttribute);
    } else if (cs !== null && descendsFrom(cs, "AnimatorGroup")) {
      checkAnimatorGroupNode(child, cs, schemas, parentSchema, errors, providesAttribute);
    } else {
      errors.push(new DeclareError(
        `an ${el.tag} coordinates animators — '${child.tag}' is not an Animator or AnimatorGroup`,
        child.pos
      ));
    }
  }
}

/** The one animation compile check (animation.md §3): the `attribute` token
 *  must name a NUMERIC slot (length | number) on the target — the parent
 *  component, since v1's target defaults to the parent (explicit `target =`
 *  deferred). A typo, or a non-numeric slot (`attribute = visible`), is a
 *  positioned compile error — the same shape as the existing `axis = y` enum
 *  check, nothing more. */
function checkTargetSlot(
  animSchema: ComponentSchema,
  slot: string,
  parentSchema: ComponentSchema | null,
  pos: Pos,
  errors: DeclareError[]
): void {
  if (parentSchema === null) return; // no resolvable target — the parent error already fired
  const t = attrType(parentSchema, slot);
  if (t === null) {
    errors.push(new DeclareError(
      `${animSchema.name}.attribute = ${slot}: ${parentSchema.name} has no slot '${slot}' to animate`,
      pos
    ));
    return;
  }
  if (t.kind !== "length" && t.kind !== "number") {
    errors.push(new DeclareError(
      `${animSchema.name}.attribute = ${slot}: only numeric slots animate — ${parentSchema.name}.${slot} is not a number`,
      pos
    ));
  }
}

/** Validate a component-typed attribute's element value (R7: the `layout:`
 *  member). The element must name a component descending from `of`, and —
 *  this rung — carry literal attributes only: a strategy has no children or
 *  methods by nature, and `{ }`-driven layout attributes are a recorded open
 *  question. One message source: check() collects these, instantiate()
 *  throws the first. */
export function checkComponentValue(
  schemas: Readonly<Record<string, ComponentSchema>>,
  owner: string,
  attrName: string,
  of: string,
  el: Element
): DeclareError[] {
  const schema = Object.hasOwn(schemas, el.tag) ? schemas[el.tag] : null;
  if (schema === null) return [Diag.unknownComponent(el.tag, el.pos, Object.keys(schemas))];
  if (!descendsFrom(schema, of)) {
    return [new DeclareError(`${owner}.${attrName} expects a ${of} — '${el.tag}' is not one`, el.pos)];
  }
  const errors: DeclareError[] = [];
  if (el.raw !== undefined) {
    errors.push(new DeclareError(`a layout takes [ ] members, not a { } body`, el.raw.pos));
  }
  for (const d of el.decls) {
    errors.push(new DeclareError(`${el.tag}.${d.name}: a layout declares no new attributes`, d.pos));
  }
  for (const m of el.methods) {
    errors.push(new DeclareError(`${el.tag}.${m.name}: a layout has no methods — it takes literal attributes only`, m.pos));
  }
  for (const c of el.children) {
    errors.push(new DeclareError(`a layout has no children — it arranges its view's`, c.pos));
  }
  for (const a of el.attrs) {
    if (a.value.kind === "code") {
      errors.push(new DeclareError(
        `${el.tag}.${a.name} = { … }: a layout attribute takes a literal — constraining it is not yet surface (swap the whole layout by assignment instead)`,
        a.value.pos
      ));
      continue;
    }
    if (a.value.kind === "path") {
      errors.push(new DeclareError(
        `${el.tag}.${a.name} = :${a.value.path}: a layout attribute takes a literal`,
        a.value.pos
      ));
      continue;
    }
    const r = checkAttr(schema, a);
    if (!r.ok) errors.push(r.error);
  }
  return errors;
}

/** Attributes, declarations, methods, and named children are ONE member
 *  namespace per element (language §4/§8) — walk them in source order and
 *  flag every reuse, keeping the established wordings for the two same-kind
 *  cases the earlier rungs pinned. */
function checkNamespace(el: Element, schema: ComponentSchema, errors: DeclareError[]): void {
  type Member = { name: string; pos: Pos; kind: "set" | "decl" | "method" | "child" };
  const members: Member[] = [
    ...el.attrs.map((a): Member => ({ name: a.name, pos: a.pos, kind: "set" })),
    ...el.decls.map((d): Member => ({ name: d.name, pos: d.pos, kind: "decl" })),
    ...el.methods.map((m): Member => ({ name: m.name, pos: m.pos, kind: "method" })),
    ...el.children.filter((c) => c.name !== null).map((c): Member => ({ name: c.name!, pos: c.pos, kind: "child" })),
  ].sort((a, b) => a.pos.offset - b.pos.offset);
  const seen = new Map<string, Member>();
  const kindName = { set: "set", decl: "declared", method: "a method", child: "a child" } as const;
  for (const m of members) {
    const first = seen.get(m.name);
    if (first === undefined) { seen.set(m.name, m); continue; }
    const at = `(first at line ${first.pos.line}, col ${first.pos.col})`;
    errors.push(new DeclareError(
      m.kind === "set" && first.kind === "set"
        ? `${schema.name}.${m.name} is set twice (first set at line ${first.pos.line}, col ${first.pos.col})`
        : m.kind === "method" && first.kind === "method"
          ? `${schema.name}.${m.name} is declared twice ${at}`
          : `${schema.name}.${m.name}: '${m.name}' is already ${kindName[first.kind]} ${at} — members share one namespace`,
      m.pos
    ));
  }
}

/** One checked attribute: a coerced literal value, a `{ }` binding to
 *  install, a `:path` data relationship (R8), or the (unthrown) error. */
export type CheckedAttr =
  | { ok: true; value: AttrValue }
  | { ok: true; binding: { src: string; pos: Pos } }
  | { ok: true; datapath: { path: string; many: boolean; pos: Pos } }
  | { ok: false; error: DeclareError };

/** The CSS-interference table (E-1 escalation 2, diagnostics.md §4): a model
 *  (or a web developer) reaches for the CSS name; the miss should name the
 *  Declare slot, because "has no attribute" alone states the rule and not the
 *  fix. Evidence-driven — entries earn their place by appearing in eval
 *  failures or having one true equivalent; vague CSS concepts stay out. */
const CSS_ATTRIBUTE_HINTS: Readonly<Record<string, string>> = {
  border: "a border is 'stroke = { stroke(1, 0xE2E5E9) }' — drawn inside the box",
  borderWidth: "a border is 'stroke = { stroke(1, 0xE2E5E9) }' — width and color travel together",
  borderColor: "a border is 'stroke = { stroke(1, 0xE2E5E9) }' — width and color travel together",
  borderStyle: "a border is 'stroke = { stroke(width, color) }' — solid only",
  boxShadow: "a shadow is 'shadow = { shadow(dx, dy, blur, 0x00000040) }'",
  background: "the paint slot is 'fill' (a color or gradient(…))",
  backgroundColor: "the paint slot is 'fill'",
  borderRadius: "rounding is 'cornerRadius'",
  color: "text color is 'textColor' (prevailing — set it on a container)",
  zIndex: "stacking is source order — later siblings draw above; there is no z-index",
  overflow: "clipping is 'clip = true'; scrolling is 'scrolls = true'",
  display: "arrangement is the 'layout' attribute — 'layout: SimpleLayout [ axis = y, spacing = 8 ]'",
  flexDirection: "arrangement is the 'layout' attribute — 'axis = x' or 'axis = y'",
  justifyContent: "arrangement is the 'layout' attribute; fine placement is x/y constraints",
  alignItems: "arrangement is the 'layout' attribute; fine placement is x/y constraints",
  gap: "spacing rides the layout — 'layout: SimpleLayout [ axis = y, spacing = 8 ]'",
  margin: "there is no margin — position with x/y, a layout's spacing, or a wrapping View",
  padding: "there is no padding — inset children with x/y or an inner View",
  onChange: "the edit event is 'onInput()'",
};

/** The CSS-instinct hint for an unknown attribute name, or "" when the miss
 *  isn't a known CSS name. */
export function cssAttributeHint(name: string): string {
  const h = Object.hasOwn(CSS_ATTRIBUTE_HINTS, name) ? CSS_ATTRIBUTE_HINTS[name] : "";
  return h ? ` — the CSS instinct: ${h}` : "";
}

/** Validate one attribute against a schema. check() collects the errors and
 *  instantiate() throws them — one message source, so the reporting and the
 *  running paths cannot drift apart. */
export function checkAttr(schema: ComponentSchema, attr: Attr): CheckedAttr {
  const type = attrType(schema, attr.name);
  if (type === null) {
    return { ok: false, error: new DeclareError(`${schema.name} has no attribute '${attr.name}'${cssAttributeHint(attr.name)}`, attr.pos) };
  }
  if (isReadOnly(schema, attr.name)) {
    return { ok: false, error: new DeclareError(`${schema.name}.${attr.name} is read-only — it is computed, so a constraint may read it but nothing may set it`, attr.pos) };
  }
  if (attr.bind === "two") {
    // `name <-> :path` — a two-way binding (language §9, the leaf-input
    // exception): only on an EDITOR's value slot, and only to a single writable
    // datapath. Caught here so misuse is a clear compile error, not a silent
    // one-way (or literal) degrade.
    if (!descendsFrom(schema, "Editor")) {
      return { ok: false, error: new DeclareError(
        `${schema.name}.${attr.name} <-> …: the two-way arrow edits a dataset value through an editor's value slot (e.g. 'TextInput.text') — ${schema.name} is not an editor`,
        attr.pos) };
    }
    // The bound field: a static datapath (`:field`) or a `{ }` that NAMES one at
    // runtime (a generic editor over `classroot.field`). Not a literal.
    if (attr.value.kind !== "path" && attr.value.kind !== "code") {
      return { ok: false, error: new DeclareError(
        `${schema.name}.${attr.name} <-> …: two-way binds a datapath — write '${attr.name} <-> :field' (or '<-> { expr }' for a runtime-named field)`,
        attr.value.pos) };
    }
    if (attr.value.kind === "path" && attr.value.many) {
      return { ok: false, error: new DeclareError(
        `${schema.name}.${attr.name} <-> :${attr.value.path}[]: a two-way binding edits one field, not a many-path`,
        attr.value.pos) };
    }
    // Valid — fall through to the ordinary :path handling, which returns the
    // datapath; instantiate.ts routes a two-way attr to the editor wiring.
  }
  if (attr.value.kind === "code" && type.kind === "component") {
    // The doc promises a swappable/constrainable layout slot; the swap is a
    // plain assignment today, the `{ }` form is a recorded open question.
    return {
      ok: false,
      error: new DeclareError(
        `${schema.name}.${attr.name} = { … }: a component slot takes a member ('${attr.name}: SimpleLayout [ … ]') or null — constraining it is not yet surface`,
        attr.value.pos
      ),
    };
  }
  if (attr.value.kind === "code") {
    const e = validateExpr(attr.value.src);
    if (e !== null) {
      return {
        ok: false,
        error: new DeclareError(`${schema.name}.${attr.name} = { … } ${e}`, attr.value.pos),
      };
    }
    return { ok: true, binding: { src: attr.value.src, pos: attr.value.pos } };
  }
  if (attr.value.kind === "path") {
    // A datapath (language §9). On the cursor slot it is the cursor (or the
    // replication form — legality of `[]` is contextual, checked at the
    // element walk); on a value slot it is a standing data read, whose type
    // resolves at runtime until schemas land (the doc's dynamic mode). A
    // many-path never fits a value slot: one slot, many records.
    if (type.kind === "component") {
      return {
        ok: false,
        error: new DeclareError(
          `${schema.name}.${attr.name} expects a ${type.of} — a :path reads data`,
          attr.value.pos
        ),
      };
    }
    if (attr.value.many && type.kind !== "cursor") {
      return {
        ok: false,
        error: new DeclareError(
          `${schema.name}.${attr.name} = :${attr.value.path}[] — a many-path replicates, which is 'datapath's meaning; a value slot reads a single :path`,
          attr.value.pos
        ),
      };
    }
    return { ok: true, datapath: { path: attr.value.path, many: attr.value.many, pos: attr.value.pos } };
  }
  const c = coerce(type, attr.value);
  if (c.ok && typeof c.value === "object" && c.value !== null && "align" in c.value &&
      attr.name !== "x" && attr.name !== "y") {
    return { ok: false, error: new DeclareError(
      `${schema.name}.${attr.name} = ${(c.value as { align: string }).align}: the position literals center | end are legal on x and y only — a size wants a number or a percent (width = 100%)`,
      attr.value.pos) };
  }
  if (!c.ok) {
    // A bare identifier in a value slot has exactly two plausible intents —
    // name them both (E-5: `text = label` cost eval cells that `text = { label }`
    // or `text = "label"` would have passed; the type rule alone names no fix).
    // Enum slots excepted: a bare ident there is a token typo, and c.expected
    // already lists the tokens.
    const hint = attr.value.kind === "ident" && type.kind !== "enum"
      ? ` — write { ${attr.value.name} } to bind the attribute${type.kind === "string" ? `, or "${attr.value.name}" for the literal text` : ""}`
      : "";
    return {
      ok: false,
      error: new DeclareError(
        `${schema.name}.${attr.name} expects ${c.expected}, got ${c.found ?? describeLiteral(attr.value)}${hint}`,
        attr.value.pos
      ),
    };
  }
  return { ok: true, value: c.value };
}

/** One checked method member: fine, or the (unthrown) error. */
export type CheckedMethod = { ok: true } | { ok: false; error: DeclareError };

/** Validate one method member against a schema (R5): its name must be free
 *  (not an attribute's — methods and attributes are one member namespace,
 *  language §4), a handler-shaped name must answer a declared event (the
 *  typo'd-handler compile error §8 promises), a parameter may not shadow
 *  a scope noun, and the body must be valid statement syntax. Like checkAttr,
 *  check() collects these and instantiate() throws them — one message
 *  source. */
export function checkMethod(schema: ComponentSchema, m: Method): CheckedMethod {
  const err = (message: string, pos: Pos): CheckedMethod =>
    ({ ok: false, error: new DeclareError(message, pos) });
  if (attrType(schema, m.name) !== null) {
    return err(`${schema.name}.${m.name} is an attribute — a method may not take an attribute's name`, m.pos);
  }
  if (RESERVED.includes(m.name)) {
    return err(`'${m.name}' is a value constructor (gradient/stroke/shadow/stop) — it cannot be a member name`, m.pos);
  }
  // A SUBSCRIPTION (`member(params) <- Source { body }`, language §8): the
  // member answers the SOURCE, not this component's own events — so it skips
  // the own-event handler check and is validated against the source table
  // instead. Both errors name the fix (diagnostics.md §4).
  if (m.source !== undefined) {
    const members = SUBSCRIPTION_SOURCES[m.source];
    if (members === undefined) {
      const known = Object.keys(SUBSCRIPTION_SOURCES).join(", ");
      return err(`'${m.source}' is not a subscribable source — subscribe to one of: ${known}`, m.sourcePos ?? m.pos);
    }
    if (!members.includes(m.name)) {
      return err(`${m.source} does not call '${m.name}' — its members: ${members.join(", ")} (the name matches the source's member literally)`, m.pos);
    }
  } else {
    const event = eventOfHandler(m.name);
    if (event !== null && !eventsOf(schema).includes(event)) {
      const known = eventsOf(schema).map(handlerName);
      return err(
        known.length > 0
          ? `${schema.name} has no '${m.name}' event — its handlers: ${known.join(", ")}`
          : `${schema.name} declares no events, so '${m.name}' can answer nothing`,
        m.pos
      );
    }
  }
  const noun = m.params.find((p) => p === "parent" || p === "classroot" || p === "app");
  if (noun !== undefined) {
    return err(`${schema.name}.${m.name}: a parameter may not be named '${noun}' — it is a scope noun (language §11)`, m.pos);
  }
  const e = validateBody(m.params, m.body);
  if (e !== null) {
    return err(`${schema.name}.${m.name}(…) ${e}`, m.bodyPos);
  }
  return { ok: true };
}

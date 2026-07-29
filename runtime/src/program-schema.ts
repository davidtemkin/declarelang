// program-schema — the schema half of a program's user classes, split from
// check.ts so the RUNNING half is separable from the VALIDATING half. A
// precompiled program (declarec) was fully checked at build time, so its
// production bundle ships this module — class registration, effective
// schemas, replication detection, token coercion — and substitutes check.js
// (the validator proper) with a stub, exactly like the registry/inspector
// slimming (tools/declarec.mjs). The dev path imports both and behaves as
// before; nothing here validates less — checkDecl keeps its full reporting,
// because class registration is one code path in both worlds.
//
// The split line is a dependency fact, not a taste: everything here leans
// only on the schemas (schema.ts), the value vocabulary (value.ts), and the
// expression validator (expr.ts) — modules the run-path carries anyway — so
// shipping it costs nothing beyond its own lines.

import type { Element, Attr, AttrDecl, ClassDecl, Literal } from "./parser.js";
import { DeclareError, type Pos } from "./errors.js";
import { SCHEMAS, attrType, isReadOnly, descendsFrom, type ComponentSchema } from "./schema.js";
import { coerce, declaredType, describeLiteral, DECLARED_TYPE_NAMES, type AttrType, type AttrValue } from "./value.js";
import { validateExpr, CONSTRUCTOR_NAMES } from "./expr.js";

/** The scope nouns of language §11 — never legal as member or parameter names.
 *  `app` is the running-App noun (compiles to `this.root`); reserving it here
 *  keeps it un-shadowable, so `app.hostWidth` always means the App. */
export const NOUNS = ["this", "parent", "classroot", "app"];

/** The value-constructor names (styling rung) are reserved as member names:
 *  in call position a body's `gradient(…)` is always the constructor, so a
 *  member wearing the name would be unreachable there. (`fill`/`stroke`/
 *  `shadow` are already View attributes — the ordinary collision rules cover
 *  them; this catches the two that are not.) */
export const RESERVED = CONSTRUCTOR_NAMES;

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
  // Every class NAME up front, so an attribute may be typed by a class declared
  // later — or by its own (`class Menu [ child: Menu = null ]`, the shape a
  // submenu chain needs). A component AttrType stores only the name, so no
  // schema has to exist yet; the scaffold emits the classes base-before-derived
  // regardless of source order. The stricter "declared above it" rule stays on
  // `extends`, where the base's ATTRIBUTES really are needed to build the chain.
  const classNames = new Set(classes.map((c) => c.name));
  const isComponentName = (n: string): boolean => Object.hasOwn(schemas, n) || classNames.has(n);
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
    // The WIRED subclassable roots. `descendsFrom(base, "Node")` no longer
    // discriminates — since 2026-07-28 every schema descends from Node (the
    // real runtime chain) — so the three are named directly, which is what the
    // rule always meant: View (visual), Layout (a strategy), and Node itself
    // (the plain atom). Dataset/Animator remain a wiring gap, not a law.
    const NODE_ROOTS = ["Dataset", "DataSource", "Animator", "AnimatorGroup", "Frames", "Keys", "Focus", "Tip", "State"];
    const wired = descendsFrom(base, "View") || descendsFrom(base, "Layout") ||
      (descendsFrom(base, "Node") && !NODE_ROOTS.some((n) => descendsFrom(base, n)));
    if (!wired) {
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
      const r = checkDecl(base, d, decl.name, isComponentName);
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

/** Coerce a theme-record token to its runtime value (checkThemeRecord vetted
 *  the shapes): numbers and strings pass through, hex/named colors ground as
 *  Color, `true`/`false`/`null` as themselves, and a constructor call as the
 *  first of fill/stroke/shadow that admits it. */
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

export function checkDecl(
  schema: ComponentSchema,
  d: AttrDecl,
  owner: string = schema.name,
  /** Is this name a component in the program? A declared attribute may be typed
   *  by a component class (`child: Menu = null`), not only by the value
   *  vocabulary — without it a slot holding an instance can say no more than
   *  `View`, and then NO parameter can be typed more precisely than the slot it
   *  is fed from. The asymmetry was accidental: the `component` AttrType and its
   *  coercion already existed for schema slots (`layout: Layout`); only the
   *  DECLARATION path could not name one. */
  isComponent: (n: string) => boolean = () => false
): CheckedDecl {
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
  const arrayOf = (n: string): AttrType | null => {
    if (!n.endsWith("[]")) return null;
    const base = n.slice(0, -2);
    // the element must itself be a sayable type — a primitive, a component, or
    // a deeper array; fn-element arrays wait for a need
    const okBase = declaredType(base) !== null || isComponent(base) || (base.endsWith("[]") && arrayOf(base) !== null);
    return okBase ? ({ kind: "array", of: base } as AttrType) : null;
  };
  const type = declaredType(d.type)
    ?? arrayOf(d.type)
    ?? (d.type.startsWith("(") ? { kind: "fn", written: d.type } as AttrType : null)
    ?? (isComponent(d.type) ? { kind: "component", of: d.type } as AttrType : null);
  if (type === null) {
    return err(
      `unknown type '${d.type}' — a declared attribute's type is one of ${DECLARED_TYPE_NAMES.join(", ")}, a component class, or a function type '(a: T) -> R'`,
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
  // A bare `[ … ]` default on an array slot is the ORDINARY literal form. The
  // parser produces a list node and leaves item kinds to the slot ("Which item
  // kinds a slot admits is the checker's", parser.ts); a generic array admits the
  // unambiguous scalars. Handled here rather than in coerce() because AttrValue
  // has no array arm — an array reaches its slot as a whole value. Without this,
  // `rows: array = [1, 2]` — the first thing anyone writes when seeding a list —
  // was refused, and the message sent the author to `{ [1, 2] }`, which spells a
  // static seed as a standing relationship.
  if (type.kind === "array" && d.def.kind === "list") {
    const items: unknown[] = [];
    for (const it of d.def.items) {
      if (it.kind === "number" || it.kind === "string") { items.push(it.value); continue; }
      if (it.kind === "hexColor" || (it.kind === "ident" && it.name !== "null" && it.name !== "true" && it.name !== "false")) {
        const cc = coerce({ kind: "color" }, it);
        if (!cc.ok) {
          return err(`${owner}.${d.name}: a bare list holds plain values — numbers, strings, booleans, null, colors. For anything computed, write the whole list as a { } binding`, it.pos);
        }
        items.push(cc.value); continue;
      }
      if (it.kind === "ident") { items.push(it.name === "null" ? null : it.name === "true"); continue; }
      return err(`${owner}.${d.name}: a bare list holds plain values — numbers, strings, booleans, null, colors. For anything computed, write the whole list as a { } binding`, it.pos);
    }
    return { ok: true, type, value: Object.freeze(items) as never };
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
export function withDecls(
  schema: ComponentSchema,
  decls: readonly AttrDecl[],
  isComponent: (n: string) => boolean = () => false
): ComponentSchema {
  if (decls.length === 0) return schema;
  const attrs: Record<string, AttrType> = {};
  const prevailing: string[] = [];
  for (const d of decls) {
    const r = checkDecl(schema, d, schema.name, isComponent);
    if (r.ok && !Object.hasOwn(attrs, d.name)) {
      attrs[d.name] = r.type;
      if (d.prevailing) prevailing.push(d.name);
    }
  }
  return { name: schema.name, base: schema, attrs, prevailing };
}

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

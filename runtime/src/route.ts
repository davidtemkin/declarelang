// route — HOW EACH ATTRIBUTE IS WIRED, decided from the schemas, ahead of
// instantiation.
//
// Instantiation wires most attributes by their value alone: a `{ }` is a
// constraint, a `:path` a data read, a literal a value. A few it wires by the
// TYPE of the slot as well — a `:path` on a cursor slot sets the record context
// instead of reading a value, a bare list on an array slot is the list itself,
// `theme = Brand` names a record, a named child on a class-typed slot is that
// slot's value and not a child, a State's attribute is the enclosing view's —
// and a data read converts what arrives to the slot's type. Those are questions
// for the schemas, which are the checker's currency, so they are answered here
// and written onto the tree (parser.ts Attr.route / slotType, Element.classSlot,
// AttrDecl.route / slotType). Instantiation reads the answers and never asks a
// schema.
//
// Two callers route. The compiler routes the program it has just checked
// (compiler/src/program-build.ts), so a built program carries its answers and a
// production build ships neither the schemas nor this module. Instantiation
// routes any program that arrives without them — a source handed to build(),
// the Inspector's evaluation, a rich text's inline view — before building it,
// with this module aboard (the `routing` capability in
// compiler/src/capabilities.ts).

import type { Program, Element, Attr, AttrDecl, Literal } from "./parser.js";
import type { Pos } from "./errors.js";
import { attrType, isReadOnly, descendsFrom, BUILTIN_PROVIDED, TextSchema, type ClassSchema } from "./schema.js";
import { programSchemas, withDecls, checkDecl, provisionValue } from "./program-schema.js";
import { shapeNames } from "./shape-resolve.js";
import type { AttrType } from "./value.js";

/** What a routing records. `all`: every attribute and declaration carries its
 *  slot's type — the program's literals are still as written, and each coerces
 *  by it. `ship`: only where the runtime still needs the type once the compile
 *  has turned the literals into values (lower-literals.ts) — a data read, a
 *  two-way binding, a literal that stayed as written. */
export type RouteMode = "all" | "ship";

/** One program's schemas, and the answers drawn from them. */
export interface Router {
  readonly schemas: Readonly<Record<string, ClassSchema>>;
  /** The effective schema of an element: its class plus its inline declarations. */
  effOf(tag: string, decls: readonly AttrDecl[]): ClassSchema | null;
  /** Route `el` and everything beneath it in place. `owner` is the effective
   *  schema of the node that holds it — what a State's overrides target. */
  routeElement(el: Element, owner: ClassSchema | null): void;
  /** Route a class body in place, against the class's own schema. */
  routeClass(name: string, body: Element): void;
  /** The declared type of `cls.name`, or null. */
  attrTypeOf(cls: string, name: string): AttrType | null;
  /** The declared type of `name` in an effective schema, or null. */
  typeIn(eff: ClassSchema, name: string): AttrType | null;
  readOnlyOf(cls: string, name: string): boolean;
  /** The value a literal provision provides (program-schema.ts provisionValue). */
  provisionValue(attr: Attr): unknown;
}

/** Literal kinds the runtime reads as they are: a value the compile shipped,
 *  and the standing relationships. Every other kind coerces by its slot's type. */
const SETTLED = new Set(["value", "code", "path"]);

/** Build the router for `program`. A program whose classes do not register (a
 *  duplicate name, an `extends` cycle, a class containing itself) throws the
 *  first error — the checker reports them all; instantiation only refuses. */
export function makeRouter(program: Program, mode: RouteMode = "all", unrouted?: Pos[]): Router {
  const shapes = shapeNames(program);
  const { schemas, errors } = programSchemas(program.classes, shapes);
  if (errors.length > 0) throw errors[0];
  const isClassName = (n: string): boolean => schemas[n] !== undefined;
  const isShape = (n: string): boolean => shapes.has(n);
  const effOf = (tag: string, decls: readonly AttrDecl[]): ClassSchema | null =>
    Object.hasOwn(schemas, tag) ? withDecls(schemas[tag], decls, isClassName, isShape) : null;
  const unlowered = (v: Literal): boolean => !SETTLED.has(v.kind);
  const miss = (pos: Pos): void => { unrouted?.push(pos); };

  /** Does a provision need no router at run time? A `{ }` and a shipped value
   *  do not, nor does `theme = Name` naming a theme the program declares
   *  (instantiation resolves it from the declaration). */
  const providedSettled = (a: Attr): boolean =>
    a.value.kind === "code" || a.value.kind === "value" || (a.name === "theme" && a.value.kind === "ident");

  /** Record the slot's type where the mode asks for it. */
  const typeFor = (a: Attr, t: AttrType | null, needed: boolean): void => {
    if (t !== null && (mode === "all" || needed)) a.slotType = t;
  };

  /** A declaration's default: the two bare-list forms by name, and the type a
   *  default that stayed as written coerces by. An inline declaration is
   *  validated here (a class's were, when the schemas registered). */
  const routeDecl = (d: AttrDecl, eff: ClassSchema, inline: ClassSchema | null): void => {
    if (inline !== null) {
      const r = checkDecl(inline, d, inline.name, isClassName, isShape);
      if (!r.ok) throw r.error;
    }
    const t = attrType(eff, d.name);
    const v = d.def;
    if (t === null || v === null) return;
    if (v.kind === "list" && (t.kind === "radius" || t.kind === "inset")) d.route = "corners";
    else if (v.kind === "list" && t.kind === "array") d.route = "list";
    else if (mode === "all" || unlowered(v)) d.slotType = t;
  };

  /** One attribute of a view: every type-directed form a view's construction
   *  distinguishes (instantiate.ts construct). */
  const routeViewAttr = (a: Attr, eff: ClassSchema): void => {
    const t = attrType(eff, a.name);
    const v = a.value;
    if (t === null) {
      if (BUILTIN_PROVIDED.has(a.name)) {
        a.route = "provision";
        if (mode === "ship" && !providedSettled(a)) miss(a.pos);
      }
      return;
    }
    if (t.kind === "cursor") a.route = "cursor";
    else if (t.kind === "class") a.route = "class";
    else if ((t.kind === "radius" || t.kind === "inset") && v.kind === "list") a.route = "corners";
    else if (t.kind === "array" && v.kind === "list") a.route = "list";
    else if (t.kind === "record" && t.name === "Theme" && v.kind === "ident" && v.name !== "null") a.route = "theme";
    else if (t.kind === "font" && ((v.kind === "ident" && v.name !== "null") || v.kind === "list")) a.route = "font";
    typeFor(a, t, (v.kind === "path" && t.kind !== "cursor") || a.bind === "two" || (a.route === undefined && unlowered(v)));
  };

  /** One attribute of a non-view node (a data node, an animator, a group, a
   *  source, a state's own slot): only a bare list on an array slot and a
   *  provision are told apart there (instantiate.ts landNodeAttr). */
  const routeNodeAttr = (a: Attr, eff: ClassSchema): void => {
    const t = attrType(eff, a.name);
    const v = a.value;
    if (t === null) {
      if (BUILTIN_PROVIDED.has(a.name)) {
        a.route = "provision";
        if (mode === "ship" && !providedSettled(a)) miss(a.pos);
      }
      return;
    }
    if (t.kind === "array" && v.kind === "list") a.route = "list";
    typeFor(a, t, a.route === undefined && unlowered(v));
  };

  /** A State's attribute that is not one of its own slots: an override of the
   *  enclosing view, coerced by that view's slot. A state CLASS's body is
   *  written for whatever view each use puts it in, so an override literal there
   *  that stayed as written has no type to carry — the runtime routes it where
   *  the view is known. */
  const routeOverride = (a: Attr, owner: ClassSchema | null): void => {
    a.route = "override";
    const v = a.value;
    if (owner === null) {
      if (unlowered(v)) miss(a.pos);
      return;
    }
    typeFor(a, attrType(owner, a.name), unlowered(v));
  };

  /** A layout element (the value of a class-typed slot): its attributes are
   *  literals or `{ }`s over the strategy's own slots. */
  const routeLayout = (el: Element): void => {
    const eff = effOf(el.tag, el.decls);
    if (eff === null) return;
    const base = schemas[el.tag];
    for (const d of el.decls) routeDecl(d, eff, base);
    for (const a of el.attrs) typeFor(a, attrType(eff, a.name), unlowered(a.value));
  };

  /** Route a body against `eff`: a use-site element (`inline` is its class's
   *  schema, its declarations validated against it) or a class body (`inline`
   *  null — the class schema already holds them). */
  const routeBody = (el: Element, eff: ClassSchema, inline: ClassSchema | null, owner: ClassSchema | null): void => {
    for (const d of el.decls) routeDecl(d, eff, inline);
    const state = descendsFrom(eff, "State");
    // the families instantiate builds on their own path (instantiate.ts
    // construct); everything else — a view, and a faceless Node, Time or model
    // class — is built as a view is
    const node = state || ["Dataset", "Animator", "AnimatorGroup", "Keys", "Focus", "Tooltips", "Stream", "Layout"].some((f) => descendsFrom(eff, f));
    for (const a of el.attrs) {
      if (state && attrType(eff, a.name) === null) routeOverride(a, owner);
      else if (node) routeNodeAttr(a, eff);
      else routeViewAttr(a, eff);
    }
    for (const c of el.children) {
      const t = c.name !== null ? attrType(eff, c.name) : null;
      if (t !== null && t.kind === "class") {
        c.classSlot = t.of;
        routeLayout(c);
        continue;
      }
      // a State's children are a subtree for the enclosing view, built when the
      // state applies — with no view of their own above them to override
      routeElement(c, state ? null : eff);
    }
  };

  const routeElement = (el: Element, owner: ClassSchema | null): void => {
    const schema = Object.hasOwn(schemas, el.tag) ? schemas[el.tag] : null;
    if (schema === null) return;   // unknown — the checker's report, instantiation's refusal
    routeBody(el, withDecls(schema, el.decls, isClassName, isShape), schema, owner);
  };

  return {
    schemas,
    effOf,
    routeElement,
    attrTypeOf: (cls, name) => (Object.hasOwn(schemas, cls) ? attrType(schemas[cls], name) : null),
    typeIn: attrType,
    readOnlyOf: (cls, name) => Object.hasOwn(schemas, cls) && isReadOnly(schemas[cls], name),
    routeClass: (name, body) => { if (Object.hasOwn(schemas, name)) routeBody(body, schemas[name], null, null); },
    provisionValue,
  };
}

/** Route a whole program in place and stamp it `routed`: every class body, the
 *  tree, and the style bundles (records of Text attributes). Returns the router
 *  and, in `ship` mode, the positions whose wiring the compile could not decide
 *  — a build that has any keeps this module aboard to decide them at run time. */
export function routeProgram(program: Program, mode: RouteMode = "all"): { router: Router; unrouted: Pos[] } {
  const unrouted: Pos[] = [];
  const router = makeRouter(program, mode, unrouted);
  for (const c of program.classes) router.routeClass(c.name, c.body);
  router.routeElement(program.root, null);
  for (const s of program.styles) {
    for (const a of s.body.attrs) {
      const t = attrType(TextSchema, a.name);
      if (t === null) continue;
      if (t.kind === "font" && a.value.kind === "list") a.route = "font";
      else if (mode === "all" || !SETTLED.has(a.value.kind)) a.slotType = t;
    }
  }
  program.routed = true;
  return { router, unrouted };
}

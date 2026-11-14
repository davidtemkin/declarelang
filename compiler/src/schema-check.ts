// Static `:path` checking against declared schemas (B4 — the second half of
// language §9's promise: "statically check every `:path` against the shape").
// Runs over the RESOLVED program (cursor expressions are explicit
// `this.$root.d.value` chains there), so the walk is: find the elements whose
// `datapath = { … }` matches the direct-cursor idiom onto a schema'd
// dataset, then check every path literal in that subtree — cursor
// extensions, replication paths, value reads, `<->` targets — against the
// shape, with the schema's own field lists in the errors.
//
// HONESTY OF SCOPE: this is best-effort by construction. A cursor derived
// through arbitrary code (`datapath = { cond ? a.value : b.value }`) is
// statically unknowable and its subtree is simply UNCHECKED (never refused);
// a `:path` island inside an attribute's `{ }` is checked as the bare form is
// (its deps name it), so `{ :reactions ?? "" }` dies where `:reactions` would;
// so is one in a method's body, a read or a write. What IS checked fails loudly with the fields named —
// the typo'd `:labell` dies at compile time, which is the promise.

import type { Program, Element, ShapeField } from "../../runtime/dist/parser.js";
import { DeclareError } from "../../runtime/dist/errors.js";
import { splitPath, type PathSeg } from "../../runtime/dist/datapath.js";

type Ctx =
  | { kind: "record"; fields: readonly ShapeField[] }
  | { kind: "array"; field: ShapeField } // resting at an array field
  | { kind: "scalar"; field: ShapeField }
  | { kind: "open" }; // beyond the declared world — unchecked

const OPEN: Ctx = { kind: "open" };

const fieldList = (fields: readonly ShapeField[]): string =>
  fields.map((f) => f.name + (f.array ? "[]" : "")).join(", ");

const describeCtx = (ctx: Ctx): string =>
  ctx.kind === "record" ? "a record" : ctx.kind === "array" ? "an array" : ctx.kind === "scalar" ? `a ${ctx.field.type}` : "unchecked";

/** Walk one plan from a context. Returns the endpoint context (plus whether
 *  a selective segment made it PLURAL — legal ground for `[]`) or an error. */
function walkPlan(start: Ctx, plan: readonly PathSeg[], spelled: string): { ctx: Ctx; plural: boolean } | { error: string } {
  let ctx = start;
  let plural = false;
  const enter = (f: ShapeField): Ctx =>
    f.fields !== undefined ? { kind: "record", fields: f.fields }
    : f.type === "any" ? OPEN
    : { kind: "scalar", field: f };
  for (const seg of plan) {
    if (ctx.kind === "open") return { ctx: OPEN, plural };
    if (typeof seg === "string") {
      if (ctx.kind === "scalar") {
        return { error: `':${spelled}' — '${ctx.field.name}' is a ${ctx.field.type}, not a structure` };
      }
      if (ctx.kind === "array") {
        return { error: `':${spelled}' — '${ctx.field.name}[]' is an array; select an element ([0], [*], a slice) before '.${seg}'` };
      }
      const f = ctx.fields.find((x) => x.name === seg);
      if (f === undefined) {
        return { error: `':${spelled}' — '${seg}' is not in the schema here; fields: ${fieldList(ctx.fields)}` };
      }
      ctx = f.array ? { kind: "array", field: f } : enter(f);
    } else if ("i" in seg) {
      if (ctx.kind !== "array") {
        return { error: `':${spelled}' — [${seg.i}] indexes an array, and the schema says this is ${describeCtx(ctx)}` };
      }
      ctx = enter(ctx.field);
    } else {
      // Slice / wildcard — a selection over the array's elements; further
      // names apply per element (RFC nodelist semantics).
      if (ctx.kind !== "array") {
        if ("w" in seg && ctx.kind === "record") { ctx = OPEN; plural = true; continue; } // [*] over a record's values — mixed shapes, unchecked
        return { error: `':${spelled}' — a ${"w" in seg ? "wildcard" : "slice"} selects from an array, and the schema says this is ${describeCtx(ctx)}` };
      }
      ctx = enter(ctx.field);
      plural = true;
    }
  }
  return { ctx, plural };
}

/** Check a program's path literals against its datasets' schemas. */
export function schemaCheck(program: Program): DeclareError[] {
  const errors: DeclareError[] = [];
  /** A control's declared value type, `string`, `number` or `boolean`, from its
   *  class chain's declaration of `attr`; null when not one of those or unknown. */
  const byName = new Map(program.classes.map((c) => [c.name, c]));
  const slotType = (tag: string, attr: string): "string" | "number" | "boolean" | null => {
    const seen = new Set<string>();
    for (let t: string | undefined = tag; t !== undefined && !seen.has(t); t = byName.get(t)?.base) {
      seen.add(t);
      const d = byName.get(t)?.body.decls.find((x) => x.name === attr);
      if (d !== undefined) return d.type === "string" || d.type === "number" || d.type === "boolean" ? d.type : null;
    }
    return null;
  };
  const article = (t: string): string => (t === "any" ? "any" : `a ${t}`);
  // A data node by its CHAIN: Dataset, DataSource, or a program class
  // extending either (`class Feed extends DataSource`).
  const bases = new Map(program.classes.map((c) => [c.name, c.base]));
  const isDataNode = (tag: string): boolean => {
    const seen = new Set<string>();
    for (let t: string | undefined = tag; t !== undefined && !seen.has(t); t = bases.get(t)) {
      seen.add(t);
      if (t === "Dataset" || t === "DataSource") return true;
    }
    return false;
  };
  /** The schema'd dataset `name` among `el`'s own children, as the document's
   *  starting CONTEXT: a record document stands at its fields; an array-root
   *  document (`schema = Task[]`, typed data) stands AT the array, so `:​[]` on
   *  the value replicates elements. Undefined when `el` has none so named. */
  const datasetOf = (el: Element, name: string): Ctx | undefined => {
    const c = el.children.find((ch) => ch.name === name && isDataNode(ch.tag));
    if (c === undefined) return undefined;
    // the instance's own `schema =`, else the nearest one along its class chain
    // (`class Plan extends DataSource [ schema = SeatPlan ]`)
    const own = (e: Element) => e.attrs.find((a) => a.name === "schema" && (a.value.kind === "schema" || (a.value.kind === "ident" && a.value.name === "null")));
    let sa = own(c);
    const seen = new Set<string>();
    for (let t: string | undefined = c.tag; sa === undefined && t !== undefined && !seen.has(t); t = bases.get(t)) {
      seen.add(t);
      const body = byName.get(t)?.body;
      if (body !== undefined) sa = own(body);
    }
    if (sa === undefined || sa.value.kind !== "schema") return undefined;
    const v = sa.value;
    return v.arrayRoot === true
      ? { kind: "array", field: { name: "(document)", array: true, optional: false, type: null, fields: [...v.shape] } }
      : { kind: "record", fields: v.shape };
  };
  /** Where a class's instances stand: the context each use site gives its
   *  body, and whether that use site sets the instance's datapath itself
   *  (overriding the body's own). A class body is checked only when EVERY use
   *  site agrees; mixed use sites leave it unchecked, as before. */
  type Seed = { ctx: Ctx; overridden: boolean };
  const sameCtx = (a: Ctx, b: Ctx): boolean =>
    a.kind === "record" ? b.kind === "record" && a.fields === b.fields
    : a.kind === "array" || a.kind === "scalar" ? b.kind === a.kind && a.field === b.field
    : false; // `open` agrees with nothing: an unknown use site may stand anywhere
  const isClass = (tag: string): boolean => byName.has(tag);
  // `record: Seat` — the record a class's (or an element's) `:` reads stand on,
  // written where its use sites give it records of different schemas
  const shapes = new Map((program.shapes ?? []).map((d) => [d.name, d]));
  const saidUnknown = new Set<string>();
  const recordCtx = (rt: { name: string; pos: unknown }): Ctx | undefined => {
    const d = shapes.get(rt.name);
    if (d !== undefined) return { kind: "record", fields: d.fields };
    if (!saidUnknown.has(rt.name)) {
      saidUnknown.add(rt.name);
      errors.push(new DeclareError(`'record: ${rt.name}' — ${rt.name} is not a schema this program declares${shapes.size > 0 ? `; schemas: ${[...shapes.keys()].join(", ")}` : ""}. record names the schema the ':' reads here stand on`, rt.pos as never));
    }
    return undefined;
  };
  /** The record a class declares, on it or on a class it extends. */
  const declaredRecord = (cls: string): { name: string; pos: unknown } | undefined => {
    const seen = new Set<string>();
    for (let t: string | undefined = cls; t !== undefined && !seen.has(t); t = bases.get(t)) {
      seen.add(t);
      const rt = byName.get(t)?.body.recordType;
      if (rt !== undefined) return rt;
    }
    return undefined;
  };
  /** Where a record `have` falls short of the declared `want`: its missing or
   *  differently typed fields, as a sentence, or null when it has them all. */
  const shortOf = (have: Ctx, want: Ctx & { kind: "record" }): string | null => {
    if (have.kind === "open") return null;
    if (have.kind !== "record") return `${describeCtx(have)}, not a record`;
    const missing: string[] = [], differ: string[] = [];
    for (const f of want.fields) {
      const g = have.fields.find((x) => x.name === f.name);
      if (g === undefined) { if (!f.optional) missing.push(f.name); continue; }
      if (g.array !== f.array || (f.type !== null && g.type !== null && f.type !== "any" && g.type !== "any" && f.type !== g.type)) differ.push(f.name);
    }
    if (missing.length === 0 && differ.length === 0) return null;
    return [missing.length > 0 ? `a record with no ${missing.map((m) => `'${m}'`).join(", ")}` : "",
      differ.length > 0 ? `${missing.length > 0 ? "and " : "a record whose "}${differ.map((m) => `'${m}'`).join(", ")} ${differ.length === 1 ? "is" : "are"} typed otherwise` : ""].filter(Boolean).join(" ");
  };
  const walkRoot = (root: Element, rootNouns: readonly string[], seed: Seed | undefined, use: (cls: string, s: Seed) => void, report: boolean): void => {
    // A cursor names its dataset through the element it is written on — the
    // resolved forms are `this.d.value` (its own child), `parent.d.value` and
    // `this.parent.d.value` (an ancestor's, one `parent` per level up) and the root's by its noun
    // (`app.d.value`, `classroot.d.value`) — so a nested element's own `items`
    // is that one, never the root's `items` of the same name. In a class body,
    // `app.d.value` (`this.$root.d.value`) names the program root's.
    const appNouns = ["this\\.\\$root", "app"];
    const idiom = new RegExp(`^\\s*(?:(${rootNouns.join("|")})|(${appNouns.join("|")})|(this|parent)((?:\\.parent)*))\\.([A-Za-z_$][\\w$]*)\\.value\\s*$`);
    const cursorOf = (src: string, chain: readonly Element[]): Ctx | undefined => {
      const m = src.match(idiom);
      if (m === null) return undefined;
      const up = (m[3] === "parent" ? 1 : 0) + (m[4]?.match(/\.parent/g) ?? []).length;
      const owner = m[1] !== undefined ? root : m[2] !== undefined ? program.root : chain[up];
      return owner === undefined ? undefined : datasetOf(owner, m[5]);
    };
    const push = (e: DeclareError): void => { if (report) errors.push(e); };
    const visit = (el: Element, ctx: Ctx, outer: readonly Element[]): void => {
      const chain = [el, ...outer];
      let here = ctx;
      // a use site's own datapath overrides the one its class body sets
      const dp = outer.length === 0 && seed?.overridden === true ? undefined : el.attrs.find((a) => a.name === "datapath");
      if (dp !== undefined) {
        if (dp.value.kind === "code") {
          here = cursorOf(dp.value.src, chain) ?? OPEN;
        } else if (dp.value.kind === "path") {
          const v = dp.value;
          const r = walkPlan(here, v.plan ?? splitPath(v.path), v.path);
          if ("error" in r) {
            push(new DeclareError(r.error, v.pos));
            here = OPEN;
          } else if (v.many) {
            if (r.ctx.kind === "record" && !r.plural) {
              push(new DeclareError(`':${v.path}[]' replicates an ARRAY, and the schema says '${v.path}' is a record`, v.pos));
              here = OPEN;
            } else if (r.ctx.kind === "scalar" && !r.plural) {
              push(new DeclareError(`':${v.path}[]' replicates an ARRAY, and the schema says '${v.path}' is a ${r.ctx.field.type}`, v.pos));
              here = OPEN;
            } else if (r.ctx.kind === "array") {
              // Replicating the array: each instance's cursor is an ELEMENT.
              here = r.ctx.field.fields !== undefined ? { kind: "record", fields: r.ctx.field.fields } : OPEN;
            } else {
              // A selective plan already stands at the elements.
              here = r.ctx;
            }
          } else {
            here = r.ctx;
          }
        } else {
          here = OPEN;
        }
      }
      // Every other path-valued attribute reads (or two-way binds) at `here`
      // — `identityKey = :field` included: after the many branch, `here` IS the
      // element shape, so a typo'd key field dies here too.
      // a `{ }` or a method reading `:field`, or writing `:field = v` — resolved to
      // `this.$data(["field", …])` / `this.$cell([…])` by now, a literal segment
      // list — gets the same check, in the same words
      // An attribute written on an element that moves its own cursor reads the
      // element's OWN record; when the field is one of the record above, say so,
      // and how a value from there is passed down.
      const ownRecord = (attr: string | undefined, segs: readonly PathSeg[], error: string): string => {
        if (attr === undefined || dp === undefined || dp.value.kind !== "path" || ctx.kind === "open") return error;
        const above = walkPlan(ctx, segs, "");
        if ("error" in above) return error;
        const via = `:${dp.value.path}${dp.value.many ? "[]" : ""}`;
        const spelled = segs.map((x) => (typeof x === "string" ? x : "")).join(".");
        const member = typeof segs.at(-1) === "string" ? (segs.at(-1) as string) : "value";
        const type = above.ctx.kind === "scalar" && above.ctx.field.type !== null && above.ctx.field.tokens === undefined ? above.ctx.field.type : "any";
        const decl = `${member}: ${type} = { :${spelled} }`;
        const pass = root !== program.root
          ? `declare it as a member of ${root.tag}, whose record holds it (${decl}), and read it here as classroot.${member}`
          : `declare a member on an element above, where that record is current (${decl}), and read that member here`;
        return `${error} — '${attr}' is written on the element whose datapath is '${via}', and an element's own attributes read its own record; '${spelled}' is in the record above. To pass it down, ${pass}`;
      };
      const islands = (src: string, pos: Element["pos"], attr?: string): void => {
        if (here.kind === "open") return;
        for (const m of src.matchAll(/this\.\$(?:data|cell)\(\[((?:\s*"(?:[^"\\]|\\.)*"\s*,?)*)\]\)/g)) {
          const segs = [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => JSON.parse(`"${x[1]}"`));
          if (segs.length === 0) continue;
          const r = walkPlan(here, segs, segs.join("."));
          if ("error" in r) push(new DeclareError(ownRecord(attr, segs, r.error), pos));
        }
      };
      for (const m of el.methods) islands(m.body, m.bodyPos);
      for (const a of el.attrs) {
        if (a.name !== "datapath" && a.value.kind === "code") islands(a.value.src, a.value.pos, a.name);
        if (a.name === "datapath" || a.value.kind !== "path") continue;
        const v = a.value;
        const plan = v.plan ?? splitPath(v.path);
        const r = walkPlan(here, plan, v.path);
        if ("error" in r) { push(new DeclareError(ownRecord(a.name, plan, r.error), v.pos)); continue; }
        // A `<->` edge's TYPE (typed data): the shorthand converts nothing, so
        // the field the schema names must hold what the control's value is —
        // a text field's `value` a string, a checkbox's `checked` a boolean —
        // and a leaf, not a record or a list. A conversion is the long form.
        if (a.shorthand === true) {
          const ctx = r.ctx;
          const want = slotType(el.tag, a.name);
          if (ctx.kind === "record" || ctx.kind === "array") {
            push(new DeclareError(
              `'${a.name} <-> :${v.path}' — the schema says this is ${ctx.kind === "array" ? "an array" : "a record"}; a control's value is a LEAF value — bind a field inside it, or edit a working copy (guide: forms)`, v.pos));
          } else if (ctx.kind === "scalar" && want !== null) {
            const have = ctx.field.tokens !== undefined ? (ctx.field.type ?? "string") : ctx.field.type;
            if (have !== null && have !== "any" && have !== want) {
              push(new DeclareError(
                `'${a.name} <-> :${v.path}' — the schema says '${ctx.field.name}' is ${article(have)}, and ${el.tag}'s ${a.name} is ${article(want)}: the shorthand converts nothing. Show it converted and convert back — '${a.name} = { … }' with a commit(v) that converts${want === "string" && have === "number" ? ` (${a.name} = { String(:${v.path}) }, and a commit that parses)` : ""}`, v.pos));
            }
          }
        }
      }
      // `record: Seat` written here: the reads below stand on a Seat, and what
      // this element stands on must be one
      if (el.recordType !== undefined) {
        const want = recordCtx(el.recordType);
        if (want !== undefined && want.kind === "record") {
          const atClassBody = outer.length === 0 && root !== program.root;
          const short = atClassBody ? null : shortOf(here, want);
          if (short !== null) push(new DeclareError(`'record: ${el.recordType.name}' — this stands on ${short}; ${el.recordType.name}'s fields: ${fieldList(want.fields)}`, el.recordType.pos as never));
          here = want;
        }
      }
      // a use of a program class — or, for a class body, of its base class,
      // whose body its instances also carry — records where it stands
      // (an unseeded body's own cursor may yet be overridden at its use sites,
      // so its base learns nothing from it)
      const atBody = outer.length === 0 && root !== program.root;
      const used = atBody ? bases.get(el.tag) : el.tag;
      // a use of a class that declares its record: what it stands on here must be one
      if (!atBody && used !== undefined && isClass(used) && el.recordType === undefined) {
        const rt = declaredRecord(used);
        const want = rt !== undefined ? recordCtx(rt) : undefined;
        const ownDp = byName.get(used)?.body.attrs.some((a) => a.name === "datapath") === true;
        if (rt !== undefined && want !== undefined && want.kind === "record" && !ownDp) {
          const short = shortOf(here, want);
          if (short !== null) push(new DeclareError(`${used} stands on ${rt.name} records (record: ${rt.name}), and here it stands on ${short}; ${rt.name}'s fields: ${fieldList(want.fields)}`, el.pos));
        }
      }
      if (used !== undefined && isClass(used)) {
        use(used, atBody && seed === undefined ? { ctx: OPEN, overridden: false } : { ctx: here, overridden: dp !== undefined || seed?.overridden === true });
      }
      for (const child of el.children) visit(child, here, chain);
    };
    visit(root, seed?.ctx ?? OPEN, []);
  };
  // Seeds settle by a fixpoint: a class's use sites inside another class body
  // stand somewhere known only once that body's seed is known. Each round can
  // only turn an unknown seed known, so it ends within one round per class.
  const seeds = new Map<string, Seed>();
  const round = (report: boolean): Map<string, Seed[]> => {
    const uses = new Map<string, Seed[]>();
    const use = (cls: string, s: Seed): void => { uses.set(cls, [...(uses.get(cls) ?? []), s]); };
    walkRoot(program.root, ["this\\.\\$root", "app"], undefined, use, report);
    for (const cls of program.classes) walkRoot(cls.body, ["classroot"], seeds.get(cls.name), use, report);
    return uses;
  };
  // A class named in code (`createView(Card)`, a keep-list `use`) can stand
  // anywhere its constructor puts it: it has use sites no walk sees.
  const code: string[] = [...program.uses, ...program.scripts.map((b) => b.src)];
  const gather = (el: Element): void => {
    for (const m of el.methods) code.push(m.body);
    for (const a of el.attrs) if (a.value.kind === "code") code.push(a.value.src);
    el.children.forEach(gather);
  };
  gather(program.root);
  for (const c of program.classes) gather(c.body);
  const named = (cls: string): boolean => code.some((t) => new RegExp(`(?<![\\w$])${cls}(?![\\w$])`).test(t));
  // a class that declares its record stands on it, whatever its use sites say
  for (const c of program.classes) {
    const rt = declaredRecord(c.name);
    const ctx = rt !== undefined ? recordCtx(rt) : undefined;
    if (ctx !== undefined) seeds.set(c.name, { ctx, overridden: false });
  }
  for (let i = 0; i <= program.classes.length; i++) {
    const uses = round(false);
    let changed = false;
    for (const [cls, all] of uses) {
      if (seeds.has(cls) || named(cls)) continue;
      const [first] = all;
      if (first.ctx.kind !== "open" && all.every((u) => sameCtx(u.ctx, first.ctx) && u.overridden === first.overridden)) {
        seeds.set(cls, first);
        changed = true;
      }
    }
    if (!changed) break;
  }
  round(true);
  return errors;
}

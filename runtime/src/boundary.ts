// boundary — the named values that cross a program's boundary: what a host
// provides to an app (App.hostValues, read by `hostProvided`), and what a
// hosted side exposes to its island (Island.exposedValues). Its own module so
// a program that reads no host value and hosts no island leaves it out (the
// `host-values` capability, compiler/src/capabilities.ts): App then holds no
// host values, and a page's `provide` has nothing to reach.

import { Cell } from "./reactive.js";
import { DeclareError } from "./errors.js";

/** The host values an App starts with: `seed` is build's `provides` (view.ts
 *  withHostProvides), so the app's very first evaluation already reads them. */
export function hostValuesFor(seed: Readonly<Record<string, unknown>> | null): BoundaryValues {
  const bv = new BoundaryValues("hostProvided");
  // every App constructed inside the one build reads the seed (not consumed:
  // instantiate may construct a throwaway App before the root; a program has
  // only one real App, and a tenant is always its own, later, build)
  if (seed !== null) for (const [k, v] of Object.entries(seed)) if (v !== undefined) bv.write(k, v);
  return bv;
}

/** A set of named reactive values crossing a boundary — what a host provides
 *  to an app (App.hostValues), what a hosted side exposes to its island
 *  (Island.exposedValues). Each name owns a cell, created on first read, so a
 *  write wakes exactly its readers; a write from outside a settle schedules
 *  one (reactive.ts touchCell), which is how a page or foreign code drives it. */
export class BoundaryValues {
  private readonly m = new Map<string, { has: boolean; v: unknown; cell: Cell }>();
  private readonly warned = new Set<string>();
  constructor(private readonly what: "hostProvided" | "exposed") {}
  private entry(name: string): { has: boolean; v: unknown; cell: Cell } {
    let e = this.m.get(name);
    if (e === undefined) { e = { has: false, v: undefined, cell: new Cell() }; this.m.set(name, e); }
    return e;
  }
  write(name: string, v: unknown): void {
    const e = this.entry(name);
    if (e.has && Object.is(e.v, v)) return;
    e.has = true;
    e.v = v;
    e.cell.changed();
  }
  clear(name: string): void {
    const e = this.m.get(name);
    if (e === undefined || !e.has) return;
    e.has = false;
    e.v = undefined;
    e.cell.changed();
  }
  names(): string[] { return [...this.m].filter(([, e]) => e.has).map(([n]) => n); }
  /** The tracked read. With a default: an absent value, or one of a different
   *  kind than the default, answers the default (the latter with a warning,
   *  once per name). With none: an absent value throws, naming it. */
  read(name: string, hasDefault: boolean, dflt: unknown): unknown {
    const e = this.entry(name);
    e.cell.track();
    if (!e.has) {
      if (hasDefault) return dflt;
      throw new DeclareError(`${this.what}("${name}"): nothing provides '${name}' here, and this read declares no default — give the read a default, or have the ${this.what === "hostProvided" ? "host list it in its island's `provides`" : "hosted side expose it"}`);
    }
    if (hasDefault && !sameKind(e.v, dflt)) {
      if (!this.warned.has(name)) {
        this.warned.add(name);
        console.warn(`[Declare] ${this.what}("${name}"): the value arriving is ${kindOf(e.v)}, but this read's default is ${kindOf(dflt)} — using the default`);
      }
      return dflt;
    }
    return e.v;
  }
}

/** The kind a boundary read compares — the default's kind is the read's type. */
function kindOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "an array";
  return typeof v === "object" ? "a record" : `a ${typeof v}`;
}
function sameKind(v: unknown, dflt: unknown): boolean {
  if (dflt === null || dflt === undefined) return true;   // a null default accepts any value
  return kindOf(v) === kindOf(dflt);
}

// A FONT AS A VALUE — what a `fontFamily` slot, a text style or a drawing holds.
//
// A font is an object in the tree (font.ts: `brand: Font [ Face [ … ] ]`), and a
// family slot holds it: `fontFamily = { app.brand }`, `{ [app.brand, "Georgia"] }`,
// or a plain family string for a face the machine already has. Everything that
// measures or paints asks THIS module what family a value names right now.
//
// This is a leaf on purpose (it imports nothing): measure.ts sits under every
// renderer and cannot import the node classes, so a Font answers through two
// symbols instead of an `instanceof`. Reading either is a tracked read of the
// font's own reactive slots — which is the whole of how text follows a face
// landing or a font switching.

/** The CSS family a font names right now (its registered name, or a system family). */
export const FONT_CSS = Symbol("declare.font.css");
/** Whether a font is still inside its wait for faces it has not received. */
export const FONT_PENDING = Symbol("declare.font.pending");

/** What a Font presents to the text machinery. */
export interface FontValue {
  readonly [FONT_CSS]: string;
  readonly [FONT_PENDING]: boolean;
}

/** Everything a family slot may hold. */
export type FamilyValue = string | FontValue | readonly (string | FontValue)[] | null | undefined;

export function isFontValue(v: unknown): v is FontValue {
  return typeof v === "object" && v !== null && FONT_CSS in v;
}

/** The CSS family list a value names: a string as written, a font's current
 *  family, a list joined in order. Tracked when a font is read. */
export function familyCss(v: unknown): string {
  if (typeof v === "string") return v;
  if (isFontValue(v)) return v[FONT_CSS];
  if (Array.isArray(v)) return v.map(familyCss).filter((s) => s !== "").join(", ");
  return "";
}

/** Whether any font in the value is still waiting for its faces. */
export function familyPending(v: unknown): boolean {
  if (isFontValue(v)) return v[FONT_PENDING];
  if (Array.isArray(v)) return v.some(familyPending);
  return false;
}

/** A Font as the start-up gate and the tree walk see it — recognized by its
 *  symbol, so the production floor (boot.ts, instantiate.ts) never imports the
 *  Font class: font.ts ships only when a program declares a Font. */
export interface FontNode extends FontValue {
  autoStart(): void;
  ready(): Promise<void>;
}
export function isFontNode(v: unknown): v is FontNode {
  return isFontValue(v) && typeof (v as { ready?: unknown }).ready === "function";
}

/** THE START-UP GATE: resolves once every font the tree starts with has settled —
 *  its faces arrived, one failed, or its `wait` ran out. A first paint awaits this,
 *  so text measures in real faces when they come in time and never waits longer
 *  than the slowest font says it is worth. */
export async function fontsReady(root: object): Promise<void> {
  const fonts: FontNode[] = [];
  const walk = (n: unknown): void => {
    if (isFontNode(n)) fonts.push(n);
    for (const c of (n as { children?: readonly unknown[] }).children ?? []) walk(c);
  };
  walk(root);
  if (fonts.length > 0) await Promise.all(fonts.map((f) => f.ready()));
}

/** The fix for a font NAME written where a family goes (`fontFamily = Serif`,
 *  or a retired top-level `font Serif [ … ]`): name the object form. */
export function fontObjectHint(name: string): string {
  const member = name.charAt(0).toLowerCase() + name.slice(1);
  return `a font is an object in the tree: declare '${member}: Font [ … ]' (on the App, or where it is used) and write fontFamily = { app.${member} } — or give a family string such as "Helvetica, sans-serif"`;
}

// ── keeping the current look while a font loads ───────────────────────────────
// A view whose family changes to a font that is still inside its `wait` keeps
// drawing in the family it had, and changes once, when the font settles (it
// arrived, failed, or ran out of wait). The slot itself holds the new value at
// once; what is HELD is only the family measured and painted. Per view and per
// slot, remembered here rather than on the view so no renderer needs to know.

const HOLDERS = new WeakSet<object>();
const HELD = new WeakMap<object, Map<string, string>>();

/** Mark a text view as one that keeps its current look while a font loads. */
export function holdsFamily(host: object): void { HOLDERS.add(host); }

/** The family `host` should measure and paint `slot` in now. */
export function heldFamily(host: object, slot: string, v: unknown): string {
  const want = familyCss(v);
  const pending = familyPending(v);
  let held = HELD.get(host);
  if (held === undefined) { held = new Map(); HELD.set(host, held); }
  const prev = held.get(slot);
  if (pending && prev !== undefined) return prev;
  held.set(slot, want);
  return want;
}

/** The family a style measures in: held for a text view, current for anything
 *  else (a style record handed to measureText or a drawing — those measure what
 *  is available right now). */
export function familyOf(style: { fontFamily?: unknown }): string {
  return HOLDERS.has(style) ? heldFamily(style, "fontFamily", style.fontFamily) : familyCss(style.fontFamily);
}

// A Face's literal forms (weights, sources) live in face-literal.ts — carried by
// a production build only when a program declares a Face.

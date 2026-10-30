// declare-name.ts — A CLASS'S NAME IN THE PROGRAM'S TERMS, in every build.
//
// A message or a rule's label that names a class by `constructor.name` names
// the JavaScript class, which a shipped build minifies: an error about a Text
// read `No.text is bound by a constraint`, and the same program built slimmer
// said `pi.text`. The name an author knows is, in order:
//   - the one the program stamped on a class it declares (instantiate.ts
//     synthesize() defines a non-configurable `name`);
//   - the runtime class's name in the registry's tables. The registry (or a
//     build's slimmed one, declarec.mjs) hands them over as it loads, and they
//     are read when the first name is asked, once every module has loaded: a
//     slimmed registry's entries are getters an import cycle can reach early.
//     This module imports nothing, so that cycle cannot reach it.

const NAMED = new WeakMap<object, string>();
let source: (() => readonly Readonly<Record<string, unknown>>[]) | null = null;

/** The registry's tables, to be read when a name is first asked. */
export function nameClassesFrom(f: () => readonly Readonly<Record<string, unknown>>[]): void { source = f; }

/** The class of `n` as the program names it: stamped, else registered, else its JavaScript name. */
export function declareName(n: object): string {
  const ctor = (n as { constructor?: unknown }).constructor;
  if (typeof ctor !== "function") return "Node";
  if (source !== null) {
    const f = source; source = null;
    for (const t of f()) for (const k in t) { const c = t[k]; if (typeof c === "function" && !NAMED.has(c)) NAMED.set(c, k); }
  }
  let registered: string | null = null;
  for (let c: unknown = ctor; typeof c === "function"; c = Object.getPrototypeOf(c)) {
    const d = Object.getOwnPropertyDescriptor(c, "name");
    if (d?.configurable === false) return d.value as string;   // stamped: always a name
    registered ??= NAMED.get(c as object) ?? null;
    // a class written in JavaScript (a host's own subclass): a development build
    // keeps its name, so it names itself there; a shipped one minifies it
    if (c === ctor && registered === null && typeof d?.value === "string" && d.value !== "" && (typeof __DECLARE_PRODUCTION__ === "undefined" || !__DECLARE_PRODUCTION__)) return d.value;
  }
  return registered ?? ((ctor as { name: string }).name || "View");
}

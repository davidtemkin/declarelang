// handlers — the one naming rule between an event and the member that answers
// it (language §8's `on` prefix), in a leaf of its own: dispatch (view.ts) needs
// the rule on every program, and the schema table (schema.ts), which re-exports
// it for the checker and the scaffold, ships only with what needs the schemas.

/** The handler member name for an event: click → onClick. */
export const handlerName = (event: string): string =>
  "on" + event[0].toUpperCase() + event.slice(1);

/** The event a handler-shaped name answers (onClick → click), or null when
 *  the name is not handler-shaped. Handler-shaped is exactly `on` + a
 *  capital (the doc's rule — what keeps handlers out of the plain-method
 *  namespace), so `once` or `onward` are plain method names. */
export function eventOfHandler(name: string): string | null {
  if (name.length < 3 || !name.startsWith("on") || name[2] < "A" || name[2] > "Z") return null;
  return name[2].toLowerCase() + name.slice(3);
}

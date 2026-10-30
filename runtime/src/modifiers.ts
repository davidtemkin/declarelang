// modifiers — the keys held with the pointer: Shift, Control, Option/Alt, Command/
// Meta. Noted from every pointer and wheel event the input router hears (input.ts),
// whichever host made it (the Mac host's synthetic events carry the same flags),
// and read into each pointer event's payload (view.ts pointerPayload), so a
// handler asks `e.shift` rather than polling the keyboard. The names are
// KeyEvent's.
export interface Modifiers { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean }

let held: Modifiers = { shift: false, ctrl: false, alt: false, meta: false };

/** Note the keys an input event says are held. */
export function noteModifiers(e: { shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }): void {
  held = { shift: e.shiftKey === true, ctrl: e.ctrlKey === true, alt: e.altKey === true, meta: e.metaKey === true };
}

/** The keys held at the last input event. */
export function modifiersNow(): Modifiers { return held; }

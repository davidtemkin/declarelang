let held = { shift: false, ctrl: false, alt: false, meta: false };
/** Note the keys an input event says are held. */
export function noteModifiers(e) {
    held = { shift: e.shiftKey === true, ctrl: e.ctrlKey === true, alt: e.altKey === true, meta: e.metaKey === true };
}
/** The keys held at the last input event. */
export function modifiersNow() { return held; }
//# sourceMappingURL=modifiers.js.map
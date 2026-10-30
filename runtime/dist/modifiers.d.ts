export interface Modifiers {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
    meta: boolean;
}
/** Note the keys an input event says are held. */
export declare function noteModifiers(e: {
    shiftKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
}): void;
/** The keys held at the last input event. */
export declare function modifiersNow(): Modifiers;

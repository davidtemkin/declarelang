import { View } from "./view.js";
/** The command service. */
export declare const Commands: {
    /** Run a command by name, from `from` (else the command target). True when a
     *  view took it. */
    run(name: string, from?: View | null): boolean;
    /** Is a command there to run now, and enabled — what a menu greys by.
     *  "on", "off" (shown greyed) or "none" (no view answers it). */
    state(name: string, from?: View | null): "on" | "off" | "none";
    /** Where a command starts now: the last focus outside command chrome. */
    target(): View | null;
};

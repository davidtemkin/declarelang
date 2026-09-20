export declare let phasesOn: boolean;
export declare function phaseIn(name: string): void;
export declare function phaseOut(): void;
export declare function phased<T>(name: string, fn: () => T): T;
export declare function registerPhaseHooks(arm: () => void, disarm: () => void): void;
/** Wrap `obj`'s named methods so each call is timed under its category; returns
 *  the undo. */
export declare function wrapMethods(obj: Record<string, unknown>, groups: Record<string, string[]>): () => void;
/** Begin timing (idempotent — the first caller names the root category, the
 *  catch-all for time no finer category claims). */
export declare function phasesStart(root?: string): void;
export declare function phasesStop(): void;

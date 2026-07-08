import type { Theme } from "./value.js";
/** One entry field: a coerced literal value, or a compiled `{ }` binding
 *  (evaluated per styled view, per applier run). */
export interface StylesheetField {
    readonly name: string;
    readonly value?: unknown;
    readonly fn?: (this: unknown, parent: unknown, classroot: unknown) => unknown;
}
/** A stylesheet as a runtime value — one interned object per declaration per
 *  program, so a swap is one equality-gated write. */
export interface Stylesheet {
    readonly name: string;
    readonly theme: Theme | null;
    /** Class name → that entry's fields. */
    readonly entries: ReadonlyMap<string, readonly StylesheetField[]>;
    /** Per-class-chain merge cache (chain key → field map). */
    readonly merged: Map<string, Readonly<Record<string, StylesheetField>>>;
}
export declare function buildStylesheet(name: string, theme: Theme | null, entries: ReadonlyMap<string, readonly StylesheetField[]>): Stylesheet;
/** Install the view's applier if an effective stylesheet is in force (and it
 *  has none yet). Idempotent; called at instantiate for the initial tree and
 *  by stylesheetArrived's walk for later provisions. */
export declare function ensureApplier(view: object): void;
/** The `stylesheet` slot's pusher: a stylesheet arrived at (or left) this view —
 *  make sure the subtree beneath has appliers (existing ones re-run through
 *  their own tracking; this walk only INSTALLS missing ones). */
export declare function stylesheetArrived(view: object): void;
/** Retire the view's applier (View.discard). */
export declare function disposeApplier(view: object): void;
export declare function registerStylesheets(root: object, stylesheets: ReadonlyMap<string, Stylesheet>): void;
export declare function stylesheetByName(root: object, name: string): Stylesheet;

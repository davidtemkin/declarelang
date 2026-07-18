/** Install the view's CSS applier if an effective cssRules is in force (and it
 *  has none yet). Idempotent; called at instantiate and by cssRulesArrived. */
export declare function ensureCssApplier(view: object): void;
/** The `cssRules` slot's pusher: rules arrived at (or left) this view — make
 *  sure the subtree beneath has appliers (existing ones re-run through their
 *  own tracking; this walk only INSTALLS missing ones). */
export declare function cssRulesArrived(view: object): void;
/** Re-cascade a moved subtree against its new ancestors (re-run every applier
 *  on the moved node and its descendants). */
export declare function cssReparent(view: object): void;
/** Retire the view's CSS applier (View.discard). */
export declare function disposeCssApplier(view: object): void;

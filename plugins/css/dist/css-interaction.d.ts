import type { View } from "../../../runtime/dist/view.js";
import type { PointerService } from "../../../runtime/dist/pointer.js";
import type { FocusService } from "../../../runtime/dist/focus.js";
/** PURE: view → root inclusive, via .parent. */
export declare function ancestorChain(view: View): View[];
/** PURE: views to clear and to set on a chain transition. */
export declare function chainDiff(prev: View[], next: View[]): {
    clear: View[];
    set: View[];
};
export interface InteractionTracker {
    pseudo(view: View, name: string): boolean;
    dispose(): void;
}
/** Subscribe to Pointer/Focus and expose per-view reactive pseudo-state. */
export declare function makeInteractionTracker(Pointer: PointerService, Focus: FocusService): InteractionTracker;

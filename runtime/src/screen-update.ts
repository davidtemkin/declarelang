// A named consumer of the generic post-settle seam (settle-hook.ts): the
// screen-update frame boundary. `onScreenUpdate` IS `onSettleComplete` under the
// name that means "the frame this settle produced has landed" — it exists so
// callers reading for a paint boundary have a self-describing name, while the
// core seam itself stays generic. Add other named consumers (telemetry, etc.)
// the same way, without touching the core.
import { onSettleComplete } from "./settle-hook.js";

/** Subscribe to the screen-update boundary. Returns an unsubscribe function. */
export const onScreenUpdate = onSettleComplete;

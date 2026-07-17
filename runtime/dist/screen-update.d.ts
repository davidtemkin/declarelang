type Subscriber = () => void;
/** Subscribe to the screen-update seam. Returns an unsubscribe function. */
export declare function onScreenUpdate(fn: Subscriber): () => void;
/** Invoke every subscriber. Called by settle's clean-completion tail. A
 *  subscriber added or removed during dispatch takes effect next fire. */
export declare function fireScreenUpdate(): void;
export {};

/** Call `changed` whenever devicePixelRatio changes, for as long as
 *  `alive()` holds. */
export declare function onDprChange(alive: () => boolean, changed: () => void): void;

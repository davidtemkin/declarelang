/** While an editable inside `scope` holds focus, hold the viewport still
 *  (suppress iOS's focus auto-zoom); release on blur. Listener lifetime
 *  follows `alive` — the same self-retiring discipline as routeInput. */
export declare function lockFocusZoom(scope: HTMLElement, alive: () => boolean): void;

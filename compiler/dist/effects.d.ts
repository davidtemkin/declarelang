/** Method name → reactive read-paths relative to `this` (empty = pure). Keyed by
 *  bare name, matching how dep-extract keys user methods (a same-named user method
 *  is resolved first and shadows an entry here). */
export declare const LANGUAGE_METHOD_EFFECTS: ReadonlyMap<string, readonly string[]>;

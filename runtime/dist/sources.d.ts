/** Subscribe `fn` to `member` on the named source. Returns the unsubscribe
 *  thunk. Unknown source/member throws — unreachable through the compiler
 *  (check.ts refuses them with positioned errors); the throw guards direct
 *  runtime callers. */
export declare function subscribeToSource(source: string, member: string, fn: (...args: unknown[]) => void): () => void;

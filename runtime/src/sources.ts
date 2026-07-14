// sources — the `<-` subscription's registry of external event sources
// (language §8, implemented 2026-07-13). A subscription member
// (`onKeyUp(e) <- Keys { … }`) is an ordinary method PLUS a registration:
// at construction the instance's installed member is subscribed to the named
// source; at discard it is unsubscribed (node.ts onDiscard).
//
// Matching is by LITERAL member name — the `on` prefix is convention, not
// mapping (ruled): `onKeyUp <- Keys` means Keys calls a subscriber named
// onKeyUp, full stop. The checker validates both the source name and the
// member name against SUBSCRIPTION_SOURCES (schema.ts — the checker-safe
// table; this module is the runtime half, and the only place that touches
// the live services).
//
// v1 sources are the runtime SERVICES — Keys first (the documented Appendix A
// use). Subscribing to another VIEW's events (hearing a sibling's onClick)
// waits until view-event dispatch routes through a fan-out point; nothing
// needs it yet.

import { Keys } from "./keys.js";
import { Focus } from "./focus.js";

/** Subscribe `fn` to `member` on the named source. Returns the unsubscribe
 *  thunk. Unknown source/member throws — unreachable through the compiler
 *  (check.ts refuses them with positioned errors); the throw guards direct
 *  runtime callers. */
export function subscribeToSource(source: string, member: string, fn: (...args: unknown[]) => void): () => void {
  if (source === "Keys") {
    if (member === "onKeyDown") return Keys.onKeyDown(fn);
    if (member === "onKeyUp") return Keys.onKeyUp(fn);
  }
  if (source === "Focus") {
    if (member === "onFocusChange") return Focus.onFocusChange(fn);
  }
  throw new Error(`no subscribable '${member}' on '${source}'`);
}

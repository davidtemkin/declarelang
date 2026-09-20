export function deferral(kind) {
    if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__) {
        const off = globalThis.__declareNoBootDeferral;
        if (off === true)
            return false;
        if (typeof off === "string" && off.split(",").map((s) => s.trim()).includes(kind))
            return false;
    }
    return true;
}
/** Has the page painted its first frame after the first mount? Before that,
 *  deferrable work waits. A host with no document (a worker, node) has no
 *  frames to wait for, so it counts as painted. */
export let firstFramePainted = typeof document === "undefined";
const queue = [];
/** Run `fn` after the first frame (now, if it has painted). */
export function afterFirstFrame(fn) {
    if (firstFramePainted) {
        fn();
        return;
    }
    queue.push(fn);
}
/** Called once by the first mount: two animation frames on, the first frame is
 *  committed and the deferred work runs — in one idle-ish slot, in order. */
export function armFirstFrame() {
    if (firstFramePainted || typeof requestAnimationFrame !== "function") {
        drain();
        return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => { drain(); }));
}
function drain() {
    firstFramePainted = true;
    const q = queue.splice(0);
    for (const fn of q) {
        try {
            fn();
        }
        catch (e) {
            console.error("[Declare] deferred boot work failed:", e);
        }
    }
}
//# sourceMappingURL=boot-deferrals.js.map
// browser/live-edit.js — a program's LIVE EDITS, recompiled and re-mounted.
//
// A program that publishes an edit — an editor writing the app's `liveCard`
// (which island) and `liveSource` (the new text) — gets that text compiled and
// the island's tenant swapped, debounced, with a failed compile reported on
// `liveReport` for the editing surface to show. Two programs do this: the
// docs (its ~50 runnable examples) and the Viewer's edit tab. It is a feature
// of THOSE programs, not of the page host, so it lives here: the uniform host
// carries it always (browse to anything, edit it), and a production build
// carries it only when its program publishes live edits — every other build
// ships the no-op stand-in (tools/declarec.mjs).
//
// Relative imports resolve against THIS module's URL (…/browser/).

/**
 * Install the watcher for one page.
 * @param ctx {{
 *   app: object, host: HTMLElement,
 *   compile: () => (src: string, name: string) => Promise<object|null>,   // the LIVE binding (host-client hot-swaps it)
 *   renderChild: (box: HTMLElement, compiled: object, name: string) => void,
 *   hasProgram: (compiled: object) => boolean,
 *   observe: (read: () => unknown, onChange: () => void, label: string) => () => void,
 *   isStopped: () => boolean,
 *   undo: Array<() => void>,
 * }}
 * @returns {{ watchAll: () => void, watchChild: (childApp: object, box: HTMLElement, childUndo: Array<() => void>) => void }}
 */
export function installLiveEdit({ app, host, compile, renderChild, hasProgram, observe, isStopped, undo }) {
  // Re-render a preview when its Declare editor publishes an edit (or a Revert): recompile
  // the edited text and swap. Debounced; a compile failure keeps the last good render
  // AND feeds the rendered report to `app.liveReport` (a delegate that reports failure
  // returns `{ report }` instead of null), so an editing surface can show the error; a
  // clean compile clears it. A null result (compiler not warm / network) changes nothing.
  // Live edits are watched on EVERY app on the page — the page app AND each
  // embedded child (an embedded Declare Viewer's Edit tab publishes
  // liveCard/liveSource on ITS OWN app) — with the child's preview island
  // scoped to the child's box so two hosted viewers never cross wires.
  const liveSigs = new WeakMap(), liveTimers = new WeakMap();
  const watchLive = (theApp, scope) => {
    if (isStopped() || !theApp.liveCard) return;         // nothing published yet
    const sig = theApp.liveCard + "\x00" + theApp.liveSource;
    if (liveSigs.get(theApp) === sig) return;
    const box = scope.querySelector('[data-declare-slot^="run:' + theApp.liveCard + '"]');
    // the island may not be MOUNTED yet (the viewer's edit pane slots its
    // island only in edit mode; the channel can publish first) — don't burn
    // the signature; the island's own mark event (host-client onIslandSlot)
    // re-runs this the moment the box appears
    if (!box) return;
    liveSigs.set(theApp, sig);
    const body = theApp.liveSource;
    const card = theApp.liveCard;                        // captured with the body: both name the edit this timer serves
    clearTimeout(liveTimers.get(theApp));
    liveTimers.set(theApp, setTimeout(async () => {
      const r = await compile()(body, card);             // a live edit compiles as the demo it edits
      if (isStopped()) return;
      if (hasProgram(r)) { theApp.liveReport = ""; renderChild(box, r, card); }
      else if (r && r.report != null) theApp.liveReport = String(r.report);
      else { liveSigs.delete(theApp); watchLive(theApp, scope); }  // compiler not warm — re-arm (compile resolves only once it loaded)
    }, 180));
  };
  // Watch every app on the page — the page app AND each mounted child — by
  // OBSERVATION: the publish is a write to that app's liveCard/liveSource, so
  // the runtime tells us at the settle that carried the edit. watchChild is
  // called from renderChild at child mount; watchAll re-checks everyone after
  // an island appears.
  const watchAll = () => {
    watchLive(app, host);
    host.querySelectorAll('[data-declare-slot^="run:"]').forEach((box) => {
      if (box.__childApp) watchLive(box.__childApp, box);
    });
  };
  const watchChild = (childApp, box, childUndo) => {
    childUndo.push(observe(() => [childApp.liveCard, childApp.liveSource], () => watchLive(childApp, box), "host:childLive"));
  };
  undo.push(observe(() => [app.liveCard, app.liveSource], () => watchLive(app, host), "host:live"));
  watchLive(app, host);
  return { watchAll, watchChild };
}

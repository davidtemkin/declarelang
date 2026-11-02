// browser-lib — measuring inside a verify --assert script (real Chrome).
// A reading: JS heap after forced GC, DOM node and event-listener counts
// (Chrome's own Performance metrics), live runtime View objects
// (Runtime.queryObjects over View.prototype), plus whatever `extra` returns
// from the page (evaluated in it, e.g. Declare-level counters).

export async function meter(page) {
  const cdp = await page.createCDPSession();
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.enable");
  // View.prototype, found from the app up its prototype chain
  const viewProto = await cdp.send("Runtime.evaluate", { expression: `(() => { let p = Object.getPrototypeOf(window.__declare.find("app")); while (p && p.constructor.name !== "View") p = Object.getPrototypeOf(p); return p; })()` });
  const protoId = viewProto.result.objectId;
  const countViews = async () => {
    const q = await cdp.send("Runtime.queryObjects", { prototypeObjectId: protoId });
    const n = await cdp.send("Runtime.callFunctionOn", { objectId: q.objects.objectId, functionDeclaration: "function () { return this.length; }", returnByValue: true });
    await cdp.send("Runtime.releaseObject", { objectId: q.objects.objectId });
    return n.result.value;
  };
  return {
    cdp,
    async read(extra = null) {
      for (let i = 0; i < 3; i++) await cdp.send("HeapProfiler.collectGarbage");
      const m = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
      const ex = extra ? await page.evaluate(extra) : {};
      return { heapKB: Math.round(m.JSHeapUsedSize / 1024), dom: m.Nodes, listeners: m.JSEventListeners, views: await countViews(), ...ex };
    },
  };
}

export function per(a, b, n) {
  const o = {};
  for (const k of Object.keys(a)) if (typeof a[k] === "number") o[k] = +((b[k] - a[k]) / n).toFixed(2);
  return o;
}

/** warm → read → n → read, logging growth per cycle. */
export async function soak(label, m, step, { warm = 8, n = 25, extra = null } = {}) {
  let i = 0;
  for (; i < warm; i++) await step(i);
  const a = await m.read(extra);
  for (; i < warm + n; i++) await step(i);
  const b = await m.read(extra);
  const p = per(a, b, n);
  const grows = Object.entries(p).filter(([k, v]) => (k === "heapKB" ? v > 3 : v > 0.05));
  console.log(`${grows.length ? "GROWS" : "flat "}  ${label}\n       per cycle: ${JSON.stringify(p)}\n       at end: ${JSON.stringify(b)}`);
  return { p, a, b };
}

/** Declare-level counters a soak can ask the page for (pass as `extra`). */
export const STRATA = () => {
  const app = window.__declare.find("app");
  const s = app.children.find((c) => c._isOverlayStrata === true);
  return { strataStack: s ? s.stack.length : 0 };
};

/** A heap snapshot of the page, parsed (CDP HeapProfiler). */
export async function pageSnapshot(cdp) {
  const chunks = [];
  const on = (e) => chunks.push(e.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", on);
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", on);
  return JSON.parse(chunks.join(""));
}

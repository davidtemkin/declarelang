// verify-boot.mjs — rung 4, the headless boot, run in a worker under a time budget.
//
// The boot is the program's own code running: a rule or a handler that loops
// forever hangs the process that runs it, and nothing inside that process can
// say so. So the boot runs in a worker, and the rung waits for it with a
// budget. Past the budget the worker is paused through the inspector — a pause
// lands even in a busy loop — and its stack is the report: what was running,
// and what called it. The worker is then stopped.
//
// The same file is the worker: imported with isMainThread true it exports
// bootInWorker; started as a worker it boots the program it is sent.

import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { Session } from "node:inspector/promises";
import { fileURLToPath } from "node:url";

/** Boot `program` in a worker; resolve with the rung's record. Past `budgetMs`,
 *  the record says the boot did not settle and names the frames it was in. */
export async function bootInWorker(program, { budgetMs = 15000, size = null, touch = false, queries = null } = {}) {
  const session = new Session();
  session.connect();
  let paused = null;
  const attached = new Promise((resolve) => {
    session.on("NodeWorker.attachedToWorker", async ({ params }) => {
      const sessionId = params.sessionId;
      let id = 0;
      const replies = new Map();
      const send = (method, p = {}) => new Promise((resolve) => {
        const n = ++id;
        replies.set(n, resolve);
        session.post("NodeWorker.sendMessageToWorker", { sessionId, message: JSON.stringify({ id: n, method, params: p }) });
      });
      session.on("NodeWorker.receivedMessageFromWorker", ({ params: m }) => {
        const j = JSON.parse(m.message);
        if (j.method === "Debugger.paused") paused?.(j.params.callFrames);
        if (j.id !== undefined && replies.has(j.id)) { replies.get(j.id)(j.result ?? {}); replies.delete(j.id); }
      });
      await send("Debugger.enable");
      resolve({ sessionId, send });
    });
  });
  await session.post("NodeWorker.enable", { waitForDebuggerOnStart: false });
  const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { program, size, touch, queries } });
  const done = new Promise((resolve) => {
    worker.once("message", (m) => resolve({ kind: "done", record: m }));
    worker.once("error", (e) => resolve({ kind: "done", record: { ok: false, nodes: 0, ms: 0, errors: [`boot: ${e?.message ?? e}`], notes: [] } }));
  });
  let timer;
  const overrun = new Promise((resolve) => { timer = setTimeout(() => resolve({ kind: "overrun" }), budgetMs); });
  const first = await Promise.race([done, overrun]);
  clearTimeout(timer);
  if (first.kind === "done") {
    await worker.terminate();
    session.disconnect();
    return first.record;
  }
  // over budget: pause it where it is, read the stack, then stop it
  // The program's own code — a method, a rule's body — is compiled from its
  // source text, so a frame of it has no file: the line it was on is quoted
  // instead, which names it better than a file and line would.
  const quoted = [];
  try {
    const { sessionId, send } = await Promise.race([attached, new Promise((_, no) => setTimeout(() => no(new Error("no inspector")), 2000))]);
    const frames = await Promise.race([
      new Promise((resolve) => { paused = resolve; send("Debugger.pause"); }),
      new Promise((resolve) => setTimeout(() => resolve([]), 3000)),
    ]);
    for (const f of frames) {
      if (quoted.length >= 4) break;
      // the program's own bodies are the scripts compiled from source text
      const src = (await send("Debugger.getScriptSource", { scriptId: f.location.scriptId })).scriptSource ?? "";
      if (!src.startsWith("(function anonymous(")) continue;
      const full = src.split("\n")[f.location.lineNumber] ?? "";
      // a body's first line carries the shared preamble: quote around where it was
      const col = f.location.columnNumber ?? 0;
      const ret = full.lastIndexOf("return (", col);
      const from = ret >= 0 && col - ret < 70 ? ret : Math.max(0, col - 40);
      let line = full.length <= 110 ? full.trim() : full.slice(from, from + 110).trim();
      line = line.replace(/this\.\$root\./g, "app.");
      line = line.replace(/^"use strict";\s*/, "");
      if (full.length > 110 && from > 0 && ret < 0) line = "…" + line;
      if (full.length > 110 && from + 110 < full.length) line = line + "…";
      if (line !== "" && !quoted.includes(line)) quoted.push(line);
    }
    await session.post("NodeWorker.detach", { sessionId }).catch(() => {});
  } catch { /* no stack to report: the budget message stands alone */ }
  session.disconnect();
  await worker.terminate();
  const errors = [`boot: did not settle within ${Math.round(budgetMs / 1000)} s — something the boot ran does not finish (a loop whose exit never comes, most often)`];
  if (quoted.length > 0) {
    errors.push(`boot: it was running  ${quoted[0]}`);
    for (const q of quoted.slice(1)) errors.push(`boot:   called from  ${q}`);
    errors.push(`boot: (the data sources were fed samples of their schemas — --samples prints them; a value your code did not expect can keep a loop going)`);
  }
  return { ok: false, nodes: 0, ms: budgetMs, errors, notes: [], overrun: true };
}

// ── the worker ────────────────────────────────────────────────────────────
/** The synthetic host the boot fills: a laptop window, unless the run names one. */
const HOST_W = 1280, HOST_H = 800;
if (!isMainThread) {
  const { program, size, touch, queries } = workerData;
  const [hostW, hostH] = size ?? [HOST_W, HOST_H];
  const record = { ok: false, nodes: 0, ms: 0, errors: [], notes: [], samples: [], answers: [], layout: [], unbuilt: [] };
  installSyntheticHost();
  const rejections = [];
  process.on("unhandledRejection", (reason) => rejections.push(String(reason?.message ?? reason)));
  const contained = [];
  const consoleError = console.error;
  console.error = (...a) => {
    const m = String(a[0] ?? "");
    if (m.startsWith("[Declare] ")) contained.push(m.slice("[Declare] ".length));
    else consoleError(...a);
  };
  try {
    const { buildProgram, settle } = await import("../../runtime/dist/index.js");
    const t0 = performance.now();
    const app = buildProgram(program);
    // THE APP FILLS ITS HOST, as it does once a page mounts it — bound here
    // without attaching (an attached boot would also draw, and drawing code
    // meets the schema samples below, which are shaped right but say nothing
    // a program's drawing can rely on)
    app.$bindExtent?.();
    // A HOST TO FILL. A page feeds the App its window's size at mount; with no
    // window it would be 0 × 0, and every app sized from its host would boot
    // with no geometry for the checks below to read. A laptop window stands in.
    const { setBound } = await import("../../runtime/dist/attributes.js");
    setBound(app, "hostWidth", hostW);
    setBound(app, "hostHeight", hostH);
    if (touch) setBound(app, "touchDevice", true);
    settle();
    record.ms = Math.round((performance.now() - t0) * 10) / 10;
    // what rung 4 asks of the booted program — the same questions, in the
    // same words, as a boot in a browser (runtime/src/boot-check.ts)
    const { bootCheck } = await import("../../runtime/dist/boot-check.js");
    const own = (program.classes ?? []).filter((c) => !String(c.pos?.file ?? "").startsWith("library/")).map((c) => c.name);
    const r = bootCheck(app, { touch, realText: false, classes: own, feed: true, queries });
    record.nodes = r.nodes;
    record.notes.push(...r.notes);
    record.layout = r.layout;
    record.unbuilt = r.unbuilt;
    record.answers = r.answers;
    record.samples = r.samples;
    if (contained.length > 0) for (const c of new Set(contained)) record.errors.push(`boot: ${c}`);   // each row reports its own copy: once is enough
    else record.ok = true;
  } catch (e) {
    record.errors.push(`boot: ${e?.message ?? e}`);
  } finally {
    console.error = consoleError;
  }
  await new Promise((r) => setImmediate(r));   // let queued rejections surface
  for (const r of rejections) record.notes.push(`async during boot (expected headless; fixtures land at rung 5): ${r}`);
  parentPort.postMessage(record);
}

// The synthetic measurer: measure.ts creates one offscreen 2D context lazily
// via `document.createElement("canvas")` — in Node we stand a deterministic
// fake at exactly that seam. Fixed per-character advance (0.6em) + ascent
// 0.8em / descent 0.25em: stable, obviously synthetic, sufficient for
// structure/reactivity/settle checks. Typography-sensitive assertions are out
// of scope at Node rung 4 BY DESIGN (verify-and-evals.md §2.8).
function installSyntheticHost() {
  if (globalThis.document?.__declareSyntheticMeasurer) return;
  const ctx = {
    font: "16px synthetic",
    letterSpacing: "0px",
    measureText(s) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 16);
      const ls = Number(/(-?\d+(?:\.\d+)?)px/.exec(this.letterSpacing)?.[1] ?? 0);
      // per character, near a proportional face's widths (the compiler's
      // approximate measurer): close enough for the layout checks to say
      // "this runs past its box" about text that would
      const mono = /mono|courier|consolas|menlo/i.test(this.font);
      let em = 0;
      for (const ch of s) {
        const c = ch.codePointAt(0) ?? 0;
        em += mono ? 0.6 : c >= 0x2e80 ? 1 : "mwMW@%".includes(ch) ? 0.85 : " fijlrt.,:;!'\"`|()[]{}".includes(ch) ? 0.31
          : ch >= "A" && ch <= "Z" ? 0.68 : ch >= "0" && ch <= "9" ? 0.56 : 0.52;
      }
      return {
        width: em * size + Math.max(0, s.length - 1) * ls,
        fontBoundingBoxAscent: size * 0.8,
        fontBoundingBoxDescent: size * 0.25,
      };
    },
  };
  globalThis.document = { __declareSyntheticMeasurer: true, createElement: () => ({ getContext: () => ctx }) };
  globalThis.requestAnimationFrame ??= () => 0; // motion needs the driven clock (phase 2)
  globalThis.cancelAnimationFrame ??= () => {};
}

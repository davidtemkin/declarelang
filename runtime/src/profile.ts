// profile — why a program is slow, or will not settle, in the terms it was
// written in (docs/system-design/profiler.md).
//
// INSTRUMENTED, NOT SAMPLED. The runtime knows every rule it runs and what it
// produced, so the profiler counts exactly what happened rather than guessing
// from a statistical stack. Counts come first — deterministic, so they hold
// across machines and serve as budgets — and times rank them.
//
// A TURN is one settle: everything that followed from one cause (a press, a
// key, a tick, a spring's frame, data arriving), with the handler that caused
// it. Each turn records the rules that ran — a constraint, a layout's place(),
// a draw() — with how often each ran, how often what it produced changed
// anything, and the time it took; the handlers, the views built (by class) and
// attached, the rules bound for them; the drawings rasterized; and the rules
// the kernel ran natively, as a count (`itemize` keeps every rule in
// JavaScript so each is named).
//
// TIMES ARE EXCLUSIVE. Activities nest — a handler builds views, a view's
// building binds rules, a layout's pass runs its children's rules — and each
// is charged only the time not spent in the ones inside it, so a turn's parts
// add up to the turn.
//
// FRAMES, AS THE PAGE SEES THEM. A drawing's script records; the GPU pays
// later, out of the page's sight (canvas in Safari and Chrome alike: measured
// 2026-10-29, 0.2 ms of script for a 34–117 ms frame). What the page can see is
// when each new frame begins: a frame that costs more than the display's
// interval, anywhere in the pipeline, pushes the next one back. So while
// recording, the profiler notes every frame's start (requestAnimationFrame),
// and afterwards it can draw each recorded drawing alone, on a canvas of its
// own, and wait for the pixels — the GPU's share, measured.
//
// It is a READING: nothing it does alters a settle, and nothing runs until
// start() — one null check on each hot path (reactive.ts profileHook) is the
// whole cost of its existence.
import { setProfileHook, type Constraint, type ProfileActivity, type ProfileHook } from "./reactive.js";
import { sharedClock } from "./animate.js";
import { replay, type DisplayList } from "./draw.js";
import { waitsOf, type Node } from "./node.js";
import { ownerOf } from "./attributes.js";
import { findPath } from "./node-path.js";
import { nameCells, readTrace, startTrace, stopTrace, clearTrace, traceSeq, tracing, type TraceSettle } from "./wake-trace.js";

interface RuleStat { label: string; source: string | null; runs: number; changed: number; ms: number; rule: Constraint; pushes: boolean; upkeep: string | null; owners: Set<object> }
interface ActStat { kind: ProfileActivity; label: string; n: number; ms: number }
interface Work {
  rules: Map<string, RuleStat>;
  acts: Map<string, ActStat>;
  built: Map<string, number>;
  discarded: Map<string, number>;
  hostRuns: number;
  /** rule runs inside the settle: the share of the kernel's count that JavaScript ran */
  inRuns: number;
  rasters: number; rasterMs: number;
  /** activity time before the settle opened: the handler that caused it, a boot's building */
  lead: number;
}
interface Turn extends Work {
  n: number; at: number; ms: number;
  origin: string[];
  kernelRuns: number;
  /** the settle's own time outside every activity: the kernel, the runtime's steps */
  settleSelf: number;
  /** the wake trace's settle number, when it records beside the profile */
  traceN: number;
}
interface Drawing { owner: object | undefined; n: number; ms: number; w: number; h: number; list: object; transform: readonly number[] }

const fresh = (): Work => ({ rules: new Map(), acts: new Map(), built: new Map(), discarded: new Map(), hostRuns: 0, inRuns: 0, rasters: 0, rasterMs: 0, lead: 0 });

let turns: Turn[] = [];
let open: Turn | null = null;
let pendingOrigin: string[] = [];
let between: Work = fresh();
let t0 = 0, settleAt = 0, count = 0, cap = 2000, dropped = 0, recording = false, rasterCount = 0;
/** Mark each settle in the browser's performance timeline (and so its trace), so a
 *  frame's time can be split into Declare's part and the browser's. */
let marking = false;
/** The wake trace was started by the profile (and is stopped with it). */
let ownTrace = false;
/** Record only this tree's turns (a reader sharing the runtime with its subject,
 *  the Inspector, leaves its own out); null records every turn. */
let only: object | null = null;
let foreign = false;
const inside = (n: object): boolean => { for (let c = n as Node | null; c != null; c = c.parent) if (c === only) return true; return false; };
const drawings = new Map<object, Drawing>();

// ── exclusive time: each activity is charged what the ones inside it did not take
const stack: number[] = [];
let inner = 0;
const enter = (): void => { stack.push(inner); inner = 0; };
const leave = (ms: number): number => { const self = Math.max(0, ms - inner); inner = (stack.length > 0 ? stack.pop()! : 0) + ms; return self; };

const ruleKey = (c: Constraint): { key: string; label: string; source: string | null; upkeep: string | null } => {
  // a runtime rule names its instance (`Button 'go' (accessibility)`): profile by class
  // …and a layout's per-child rules their index (`Glide[3].x`)
  // …and one the runtime keeps per view (`app.side.….Segmented (accessibility)`) its class
  let label = c.label.replace(/ '[^']*'| "[^"]*"/g, "").replace(/\[\d+\]/g, "[]");
  const per = /^app(?:\.\S*)? \((accessibility)\)$/.exec(label);
  if (per !== null) { const last = label.slice(0, label.indexOf(" (")).split(".").pop()!; label = `${last === "app" ? "App" : last} (${per[1]})`; }
  const p = c.sourcePos;
  const source = p !== null ? (p.file !== undefined ? `${p.file}:${p.line}` : `line ${p.line}`) : null;
  const plain = plainLabel(label);
  return { key: `${plain.label}@${source ?? ""}`, label: plain.label, source, upkeep: plain.upkeep };
};
/** A runtime rule, in the words of what the author wrote, or — for one the author
 *  never wrote, the runtime's own upkeep — what that upkeep is for. Upkeep is reported
 *  as one line, its cost totalled, never as rules to act on. */
const UPKEEP: [RegExp, string][] = [
  [/\(accessibility\)$/, "the accessibility tree"],
  [/\.\$interaction$/, "pointer and hover state"],
  [/^host:/, "the page's title, history and announcements"],
  [/\.visibilityWake$/, "what is on screen"],
  [/\.pageExtent$/, "the page's size"],
  [/^Spring \(its attribute\)$/, "springs following their targets"],
  [/\.textStyle$/, "text styles handed to the page"],
];
function plainLabel(label: string): { label: string; upkeep: string | null } {
  for (const [re, what] of UPKEEP) if (re.test(label)) return { label, upkeep: what };
  return {
    label: label
      .replace(/ \(runtime derive\)$/, " (measured)")
      .replace(/^(\w+) shape$/, "$1 (its arrangement)")
      .replace(/^State\.applied$/, "State (whether it applies)")
      .replace(/^(\w+) (:[\w.]+)$/, "$1 reads $2"),
    upkeep: null,
  };
}
const bump = (m: Map<string, number>, k: string, by = 1): void => { m.set(k, (m.get(k) ?? 0) + by); };
const className = (n: object): string => (n as { constructor?: { name?: string } }).constructor?.name ?? "Node";
const work = (): Work => open ?? between;

const HOOK: ProfileHook = {
  begin: enter,
  ran(rule, ms, changed) {
    const w = work(), self = leave(ms);
    // another tree's rule (the Inspector's, sharing the runtime): not this profile's
    if (only !== null && rule.owner !== null && !inside(rule.owner)) return;
    w.hostRuns++;
    if (open !== null) w.inRuns++;
    const { key, label, source, upkeep } = ruleKey(rule);
    const s = w.rules.get(key) ?? { label, source, runs: 0, changed: 0, ms: 0, rule, pushes: rule.pushes, upkeep, owners: new Set<object>() };
    if (rule.owner !== null && s.owners.size < 64) s.owners.add(rule.owner);
    s.runs++; if (changed) s.changed++; s.ms += self;
    w.rules.set(key, s);
    if (open === null) w.lead += self;
  },
  spent(kind, label, ms) {
    const w = work(), self = leave(ms);
    const k = `${kind}\u0000${label}`;
    const a = w.acts.get(k) ?? { kind, label, n: 0, ms: 0 };
    a.n++; a.ms += self;
    w.acts.set(k, a);
    if (open === null) w.lead += self;
  },
  rastered(owner, list, w, h, ms, transform) {
    const x = work();
    x.rasters++; x.rasterMs += ms; rasterCount++;
    if (open === null) x.lead += ms;
    const key = owner ?? list;
    const d = drawings.get(key) ?? { owner, n: 0, ms: 0, w, h, list, transform };
    d.n++; d.ms += ms; d.w = w; d.h = h; d.list = list; d.transform = transform;
    drawings.set(key, d);
  },
  built(node) { bump(work().built, className(node)); },
  discarded(node) { bump(work().discarded, className(node)); },
  before() {
    if (open !== null) return;
    enter();
    settleAt = performance.now();
    if (marking) performance.mark("declare settle start");
    open = { ...between, n: ++count, at: settleAt - t0, ms: 0, origin: pendingOrigin, kernelRuns: 0, settleSelf: 0, traceN: 0 };
    pendingOrigin = [];
    between = fresh();
  },
  after(kernelRuns) {
    const t = open;
    if (t === null) return;
    open = null;
    t.ms = performance.now() - settleAt;
    t.settleSelf = leave(t.ms);
    // the settle, as the browser's own trace sees it: what a frame spent in Declare
    if (marking) { try { performance.measure("declare settle", "declare settle start"); } catch { /* no mark */ } }
    t.kernelRuns = Math.max(0, kernelRuns);
    t.traceN = traceSeq();
    const theirs = foreign && t.origin.length === 0;
    foreign = false;
    if (theirs) return;   // another tree's turn: the reader's own
    if (t.kernelRuns === 0 && t.hostRuns === 0 && t.built.size === 0 && t.discarded.size === 0 && t.acts.size === 0 && t.rasters === 0) return;   // nothing happened
    turns.push(t);
    if (turns.length > cap) { turns.shift(); dropped++; }
  },
  origin(label, node) {
    if (only !== null && node !== null && !inside(node)) { foreign = true; return; }
    if (pendingOrigin.length < 64) pendingOrigin.push(label);
  },
  armed() {
    // A callback the program handed to a promise, a timer or script code ran
    // and wrote: no handler named the cause. A development body is named on the
    // stack (expr.ts bodyLabel, `declare/App.onInit@main:4`); the first one is
    // the program's code that wrote. The search stops at the program's code:
    // script a program imports is never named inside.
    if (pendingOrigin.length > 0) return;
    const m = /declare\/([^\s@]+)@([^\s:]+):(\d+)/.exec(new Error().stack ?? "");
    if (m !== null) pendingOrigin.push(`a callback in ${m[1]} (${m[2] === "main" ? "" : m[2] + ":"}line ${m[3]})`);
  },
};

// ── frames, as the page sees them: when each one begins ──────────────────────
let frameAt: number[] = [], frameSettles: number[] = [], frameRasters: number[] = [], frameLoop = 0, frameOn = false;
const FRAME_CAP = 36000;   // ten minutes at 60 Hz
function tickFrame(t: number): void {
  if (!frameOn) return;
  if (frameAt.length < FRAME_CAP) { frameAt.push(t); frameSettles.push(count); frameRasters.push(rasterCount); }
  frameLoop = requestAnimationFrame(tickFrame);
}

/** Start recording (clearing what was recorded). `cap` turns are kept, the oldest
 *  dropped. `why` records the wake trace beside the profile, so each turn can say
 *  which writes opened it (it costs a copy of the value table per settle); `frames`
 *  (default on, where there are frames) notes when each frame begins. */
export function startProfile(opts: { cap?: number; mark?: boolean; why?: boolean; frames?: boolean; only?: object | null } = {}): void {
  only = opts.only ?? null; foreign = false;
  marking = opts.mark ?? (globalThis as { __declareProfileMark?: boolean }).__declareProfileMark === true;
  turns = []; open = null; pendingOrigin = []; count = 0; dropped = 0; rasterCount = 0;
  between = fresh(); stack.length = 0; inner = 0; drawings.clear();
  cap = opts.cap ?? 2000;
  const why = opts.why ?? (globalThis as { __declareProfileWhy?: boolean }).__declareProfileWhy === true;
  if (ownTrace) { clearTrace(); ownTrace = false; }
  if (why && !tracing()) { startTrace(cap); ownTrace = true; }
  t0 = performance.now();
  frameAt = []; frameSettles = []; frameRasters = [];
  // the page's own clock of frames, for a browser with no trace to read; where
  // Chrome's trace records the frames (the harness), its requestAnimationFrame
  // would itself be work on every frame and make an idle page look busy
  frameOn = (opts.frames ?? (globalThis as { __declareProfileFrames?: boolean }).__declareProfileFrames ?? true) && typeof requestAnimationFrame === "function";
  if (frameOn) frameLoop = requestAnimationFrame(tickFrame);
  recording = true;
  setProfileHook(HOOK);
}
/** Stop recording; what was recorded stays readable. */
export function stopProfile(): void {
  setProfileHook(null); open = null; recording = false;
  if (frameOn) { frameOn = false; cancelAnimationFrame(frameLoop); }
  if (ownTrace) stopTrace();
}
export function profiling(): boolean { return recording; }

// ── the report ───────────────────────────────────────────────────────────────

export interface ProfileRule {
  label: string; source: string | null; runs: number; changed: number; unchanged: number; ms: number; turns: number;
  /** its value goes to the page, not a slot: whether a run changed anything is not known */
  pushes: boolean;
  /** the runtime's own upkeep, which the author never wrote: what it is for */
  upkeep: string | null;
  /** the views it ran on: how many (up to 64 counted), and the first few, named */
  views: number;
  on: string[];
}
/** A rule that RE-RAN FOR NOTHING: ran often, over several turns, and almost
 *  never changed anything. */
export interface ProfileForNothing extends ProfileRule {
  /** the time its runs that changed nothing took, ms */
  wastedMs: number;
  /** what the rule reads (its last run's inputs, on one instance), named */
  reads: string[];
  /** the writes that opened the turns it ran in, most frequent first (with why) */
  openedBy: { write: string; turns: number }[];
}
export interface ProfileSpent { what: string; ms: number }
export interface ProfileTurn {
  n: number; at: number; ms: number; lead: number; origin: string[]; runs: number; kernelRuns: number; changed: number;
  built: number; builtBy: { cls: string; n: number }[];
  /** where the turn's time went, exclusive: rules, handlers, building, attaching, binding, the kernel */
  spent: ProfileSpent[];
  /** the writes that opened it (with why) */
  triggers: string[];
  top: ProfileRule[];
  /** Why its costliest rule ran: the chain back from that rule, through the
   *  rules whose changes woke it, to the write that opened the turn (with why). */
  why: string[];
}
export interface ProfileBuild { cls: string; n: number; ms: number; build: number; attach: number; bind: number }
export interface ProfileHandler { label: string; n: number; ms: number }
export interface ProfileDrawing {
  view: string; n: number; scriptMs: number; w: number; h: number;
  /** the GPU's time to draw it once, alone on a canvas of its own (measureDrawings), ms */
  gpuMs?: number;
}
export interface ProfileFrames {
  /** frames begun while recording, and those with Declare work (a settle or a raster) in them */
  frames: number; withWork: number;
  /** the display's own interval, as the quietest frames show it */
  display: number;
  /** from one frame's start to the next's, over the frames with work */
  median: number; p95: number; worst: number;
  /** frames with work that took longer than one and a half display intervals */
  late: number;
  slowest: { at: number; ms: number; declare: number; turns: number; rasters: number; causes: string[] }[];
}
export interface ProfileReport {
  ms: number; turns: number; dropped: number;
  runs: number; kernelRuns: number; itemized: boolean; why: boolean;
  rules: ProfileRule[];
  /** every rule that re-ran for nothing, the most time wasted first (the text
   *  shows those past a millisecond) */
  reranForNothing: ProfileForNothing[];
  built: { cls: string; n: number }[];
  discarded: { cls: string; n: number }[];
  /** the time each class took to build, attach and bind, exclusive of what it holds */
  buildCost: ProfileBuild[];
  handlers: ProfileHandler[];
  drawings: ProfileDrawing[];
  frames: ProfileFrames | null;
  costliest: ProfileTurn[];
  /** The most any one turn did, over every turn: the steadiest budgets (counts). */
  peak: { runs: number; runsTurn: number; built: number; builtTurn: number; origin: { runs: string; built: string } };
  /** The runtime's own upkeep (rules the author never wrote), by what each is for. */
  upkeep: { what: string; runs: number; ms: number }[];
  /** Turns by what opened them: each kind of cause, how many turns, their time. */
  causes: { cause: string; turns: number; ms: number }[];
  /** One cause over and over, turn after turn (a drag's moves, a spring's
   *  frames): folded into one entry, with what a turn of it typically cost and
   *  the worst. Three in a row or more, the costliest first. */
  repeated: { cause: string; turns: number; ms: number; median: number; worst: number; worstTurn: number; runs: number; openedBy: { write: string; turns: number }[] }[];
  unsettled: { motion: string[]; waiting: string[] };
  /** Views built but hidden when the profile ended (`visible = false`, theirs or an
   *  ancestor's), by the hidden view that holds them: each is built, bound and kept
   *  current while hidden. */
  hidden: { views: number; parts: { view: string; n: number }[] };
}

const ownersOf = new WeakMap<ProfileRule, Set<object>>();
const merge = (into: Map<string, ProfileRule>, s: RuleStat, k: string): void => {
  const r = into.get(k) ?? { label: s.label, source: s.source, runs: 0, changed: 0, unchanged: 0, ms: 0, turns: 0, pushes: s.pushes, upkeep: s.upkeep, views: 0, on: [] };
  r.runs += s.runs; r.changed += s.changed; r.unchanged = r.runs - r.changed; r.ms += s.ms; r.turns++;
  const o = ownersOf.get(r) ?? new Set<object>();
  for (const x of s.owners) if (o.size < 64) o.add(x);
  ownersOf.set(r, o);
  into.set(k, r);
};
/** Name the views a rule ran on (the first three), once the report is assembled. */
const nameOwners = (r: ProfileRule, nameOf: (n: object) => string): void => {
  const o = ownersOf.get(r);
  if (o === undefined) return;
  r.views = o.size;
  r.on = [...o].slice(0, 3).map((n) => { try { return nameOf(n); } catch { return className(n); } });
};
const ACT_NAME: Record<ProfileActivity, string> = { handler: "handlers", build: "building views", attach: "attaching views", install: "binding rules" };
const spentOf = (t: Turn): ProfileSpent[] => {
  const by = new Map<string, number>();
  let rules = 0, upkeep = 0; for (const s of t.rules.values()) { if (s.upkeep !== null) upkeep += s.ms; else rules += s.ms; }
  if (rules > 0) by.set("rules", rules);
  if (upkeep > 0) by.set("the runtime's upkeep", upkeep);
  for (const a of t.acts.values()) bump(by, ACT_NAME[a.kind], a.ms);
  if (t.rasterMs > 0) by.set("rasterizing drawings (script)", t.rasterMs);
  if (t.settleSelf > 0) by.set("the kernel and the runtime's own steps", t.settleSelf);
  return [...by].map(([what, ms]) => ({ what, ms })).sort((a, b) => b.ms - a.ms);
};
const changeText = (c: TraceSettle["triggers"][number]): string => {
  const v = (x: unknown): string => typeof x === "string" ? JSON.stringify(x.length > 24 ? x.slice(0, 24) + "…" : x) : typeof x === "number" ? String(Math.round(x * 100) / 100) : String(x);
  return c.from === undefined ? `${c.path}.${c.attr} changed` : `${c.path}.${c.attr} ${v(c.from)} → ${v(c.to)}`;
};
const pct = (a: number[], p: number): number => { if (a.length === 0) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

/** What was recorded, summed: the rules by how often they ran, the ones that
 *  re-ran for nothing, what each class cost to build, the
 *  costliest turns and where their time went, the drawings, the frames, and what
 *  still keeps the program from settling. `nameOf` names a node by its path;
 *  `root` (the bridge's) lets the report name inputs and outstanding waits. */
export function profileReport(nameOf: (node: object) => string = className, root: Node | null = null): ProfileReport {
  const all = new Map<string, ProfileRule>();
  const reps = new Map<string, Constraint>();
  const ruleTurns = new Map<string, Turn[]>();
  const built = new Map<string, number>(), discarded = new Map<string, number>();
  const cost = new Map<string, ProfileBuild>();
  const handlers = new Map<string, ProfileHandler>();
  let runs = 0, kernelRuns = 0, ms = 0;
  // the wake trace, when it recorded beside the profile: what opened each turn —
  // read for the recorded tree alone when the profile kept to one, and then a turn
  // nothing in that tree opened or changed is another tree's, and left out
  const traced = new Map<number, TraceSettle>();
  const why = ownTrace;
  if (why && root !== null) for (const s of readTrace(root, (n) => nameOf(n), { onlyTree: only !== null })) traced.set(s.n, s);
  const kept = only !== null && why ? turns.filter((t) => t.origin.length > 0 || traced.has(t.traceN)) : turns;
  const addWork = (w: Work): void => {
    for (const [c, n] of w.built) bump(built, c, n);
    for (const [c, n] of w.discarded) bump(discarded, c, n);
    for (const a of w.acts.values()) {
      if (a.kind === "handler") {
        const h = handlers.get(a.label) ?? { label: a.label, n: 0, ms: 0 };
        h.n += a.n; h.ms += a.ms; handlers.set(a.label, h);
        continue;
      }
      // building is named by the program's tag; attaching and binding by the class
      const name = a.label;
      const b = cost.get(name) ?? { cls: name, n: 0, ms: 0, build: 0, attach: 0, bind: 0 };
      if (a.kind === "build") { b.build += a.ms; b.n += a.n; } else if (a.kind === "attach") b.attach += a.ms; else b.bind += a.ms;
      b.ms += a.ms;
      cost.set(name, b);
    }
  };
  for (const t of kept) {
    for (const [k, s] of t.rules) { merge(all, s, k); reps.set(k, s.rule); const l = ruleTurns.get(k) ?? []; l.push(t); ruleTurns.set(k, l); }
    addWork(t);
    runs += t.hostRuns; kernelRuns += Math.max(0, t.kernelRuns - t.inRuns); ms += t.ms + t.lead;
  }
  addWork(between);
  const rules = [...all.values()].sort((a, b) => b.runs - a.runs || b.ms - a.ms);
  const triggersOf = (t: Turn): string[] => (traced.get(t.traceN)?.triggers ?? []).map(changeText);
  // WHY A RULE RAN: what it reads that changed in that settle, who changed it,
  // and so on back, to the write that opened the turn — at most five steps
  const whyOf = (t: Turn, rule: Constraint | undefined): string[] => {
    const st = traced.get(t.traceN);
    if (st === undefined || rule === undefined || root === null) return [];
    const opened = new Map(st.triggers.map((c) => [`${c.path}.${c.attr}`, changeText(c)]));
    const changedBy = new Map(st.changes.map((c) => [`${c.path}.${c.attr}`, c.by?.rule ?? null]));
    const out: string[] = [];
    const seen = new Set<Constraint>();
    let cur: Constraint | undefined = rule;
    for (let depth = 0; depth < 5 && cur !== undefined && !seen.has(cur); depth++) {
      seen.add(cur);
      let inputs: string[] = [];
      try { inputs = nameCells(root, (n) => nameOf(n), cur.deps); } catch { break; }
      const write = inputs.find((i) => opened.has(i));
      if (write !== undefined) { out.push(`${opened.get(write)}${t.origin[0] !== undefined ? `, written by ${t.origin[0]}` : ""}`); break; }
      const moved = inputs.find((i) => changedBy.has(i));
      if (moved === undefined) break;
      const by = changedBy.get(moved);
      out.push(`${moved}${by !== null && by !== undefined ? ` (changed by ${plainLabel(by.replace(/ '[^']*'| "[^"]*"/g, "")).label})` : " changed"}`);
      const dot = moved.lastIndexOf(".");
      const node = findPath(root, moved.slice(0, dot));
      cur = node !== null ? ownerOf(node, moved.slice(dot + 1)) ?? undefined : undefined;
    }
    return out;
  };
  // re-ran for nothing: a rule that ran many times, over several turns, and
  // almost never produced anything new — the commonest cost in a constraint program
  const forNothing: ProfileForNothing[] = [];
  for (const [k, r] of all) {
    if (r.pushes || r.upkeep !== null || !(r.runs >= 20 && r.turns >= 2 && r.unchanged / r.runs >= 0.8)) continue;
    const rep = reps.get(k);
    let reads: string[] = [];
    if (root !== null && rep !== undefined) { try { reads = nameCells(root, (n) => nameOf(n), rep.deps).slice(0, 8); } catch { /* a retired rule */ } }
    const opened = new Map<string, number>();
    for (const t of ruleTurns.get(k) ?? []) for (const w of new Set((traced.get(t.traceN)?.triggers ?? []).map((c) => `${c.path}.${c.attr}`))) bump(opened, w);
    const owners = ownersOf.get(r);
    const entry: ProfileForNothing = { ...r, wastedMs: r.runs > 0 ? r.ms * r.unchanged / r.runs : 0, reads, openedBy: [...opened].map(([write, n]) => ({ write, turns: n })).sort((a, b) => b.turns - a.turns).slice(0, 4)  };
    if (owners !== undefined) ownersOf.set(entry, owners);
    forNothing.push(entry);
  }
  forNothing.sort((a, b) => b.wastedMs - a.wastedMs || b.unchanged - a.unchanged);
  const costliest = [...kept].filter((t) => t.ms + t.lead >= 1).sort((a, b) => (b.ms + b.lead) - (a.ms + a.lead)).slice(0, 8).map((t): ProfileTurn => {
    const m = new Map<string, ProfileRule>();
    for (const [k, s] of t.rules) merge(m, s, k);
    let changed = 0; for (const s of t.rules.values()) changed += s.changed;
    let b = 0; for (const n of t.built.values()) b += n;
    const builtBy = [...t.built].map(([cls, n]) => ({ cls, n })).sort((x, y) => y.n - x.n).slice(0, 4);
    const top = [...m.values()].filter((x) => x.upkeep === null).sort((x, y) => y.ms - x.ms || y.runs - x.runs).slice(0, 6);
    const topRule = new Map<ProfileRule, Constraint>();
    for (const [k, r] of m) { const s0 = t.rules.get(k); if (s0 !== undefined) topRule.set(r, s0.rule); }
    return { n: t.n, at: t.at, ms: t.ms, lead: t.lead, origin: t.origin, runs: t.hostRuns, kernelRuns: Math.max(0, t.kernelRuns - t.inRuns), changed, built: b, builtBy, spent: spentOf(t), triggers: triggersOf(t).slice(0, 5), top, why: top.length > 0 ? whyOf(t, topRule.get(top[0])) : [] };
  });
  const motion = sharedClock.tickersNow().filter((t) => (t as { perpetual?: boolean }).perpetual !== true).map((t) => {
    const owner = (t as { $resolveTarget?: () => object | null }).$resolveTarget?.() ?? (t as { parent?: object | null }).parent ?? null;
    return `${className(t)}${(t as { attribute?: string }).attribute ? ` (${(t as { attribute?: string }).attribute})` : ""}${owner !== null ? ` on ${nameOf(owner)}` : ""}`;
  });
  // what is built but hidden, by the hidden view that holds it: kept current
  // while no one sees it
  const hiddenParts: { view: string; n: number }[] = [];
  let hiddenViews = 0;
  if (root !== null) {
    const count = (n: Node): number => { let k = typeof (n as unknown as { width?: unknown }).width === "number" ? 1 : 0; for (const c of n.children) k += count(c); return k; };
    const walk = (n: Node): void => {
      const v = n as unknown as { visible?: unknown; width?: unknown };
      if (typeof v.width === "number" && v.visible === false) {
        const k = count(n);
        hiddenViews += k;
        hiddenParts.push({ view: (() => { try { return `${nameOf(n)} (${className(n)})`; } catch { return className(n); } })(), n: k });
        return;
      }
      for (const c of n.children) walk(c);
    };
    walk(root);
  }
  // what else keeps it from settling: an afterDelay outstanding, data on its way
  const waiting: string[] = [];
  if (root !== null) {
    const walk = (n: Node): void => {
      const k = waitsOf(n);
      if (k > 0) waiting.push(`afterDelay${k > 1 ? ` ×${k}` : ""} on ${nameOf(n)}`);
      if ((n as unknown as { loading?: unknown }).loading === true) waiting.push(`${nameOf(n)} loading`);
      for (const c of n.children) walk(c);
    };
    walk(root);
  }
  const byCause = new Map<string, { turns: number; ms: number }>();
  for (const t of kept) {
    const k = t.origin.length === 0 ? "no user code (motion, layout, a first run)" : t.origin[0].replace(/ on .*$/, "").replace(/ '[^']*'/, "");
    const e = byCause.get(k) ?? { turns: 0, ms: 0 }; e.turns++; e.ms += t.ms + t.lead; byCause.set(k, e);
  }
  const causes = [...byCause].map(([cause, e]) => ({ cause, ...e })).sort((a, b) => b.ms - a.ms);
  const repeated: ProfileReport["repeated"] = [];
  for (let i = 0; i < kept.length;) {
    const cause = originText(kept[i].origin);
    let j = i + 1;
    while (j < kept.length && originText(kept[j].origin) === cause) j++;
    if (j - i >= 3) {
      const run = kept.slice(i, j), ms = run.map((t) => t.ms + t.lead), worst = run.reduce((a, t) => (t.ms + t.lead > a.ms + a.lead ? t : a));
      // what opened them, most often first: what keeps moving when no one's code ran
      const opened = new Map<string, number>();
      for (const t of run) for (const w of new Set((traced.get(t.traceN)?.triggers ?? []).map((c) => `${c.path}.${c.attr}`))) bump(opened, w);
      repeated.push({ cause, turns: run.length, ms: ms.reduce((a, b) => a + b, 0), median: pct(ms, 0.5), worst: worst.ms + worst.lead, worstTurn: worst.n, runs: pct(run.map((t) => t.hostRuns), 0.5),
        openedBy: [...opened].map(([write, n]) => ({ write, turns: n })).sort((a, b) => b.turns - a.turns).slice(0, 3) });
    }
    i = j;
  }
  repeated.sort((a, b) => b.ms - a.ms);
  const peak = { runs: 0, runsTurn: 0, built: 0, builtTurn: 0, origin: { runs: "", built: "" } };
  for (const t of kept) {
    let b = 0; for (const n of t.built.values()) b += n;
    if (t.hostRuns > peak.runs) { peak.runs = t.hostRuns; peak.runsTurn = t.n; peak.origin.runs = originText(t.origin); }
    if (b > peak.built) { peak.built = b; peak.builtTurn = t.n; peak.origin.built = originText(t.origin); }
  }
  const tally = (m: Map<string, number>): { cls: string; n: number }[] => [...m].map(([c, n]) => ({ cls: c, n })).sort((a, b) => b.n - a.n);
  for (const r of rules.slice(0, 40)) nameOwners(r, nameOf);
  for (const r of forNothing) nameOwners(r, nameOf);
  for (const t of costliest) for (const r of t.top) nameOwners(r, nameOf);
  const up = new Map<string, { what: string; runs: number; ms: number }>();
  for (const r of all.values()) if (r.upkeep !== null) { const u = up.get(r.upkeep) ?? { what: r.upkeep, runs: 0, ms: 0 }; u.runs += r.runs; u.ms += r.ms; up.set(r.upkeep, u); }
  return {
    upkeep: [...up.values()].sort((a, b) => b.ms - a.ms),
    peak,
    causes,
    repeated: repeated.slice(0, 6),
    ms, turns: kept.length, dropped, runs, kernelRuns,
    itemized: (globalThis as { __declareProfileItemize?: boolean }).__declareProfileItemize === true,
    why,
    rules: rules.filter((r) => r.upkeep === null).slice(0, 40), reranForNothing: forNothing,
    built: tally(built),
    discarded: tally(discarded),
    buildCost: [...cost.values()].sort((a, b) => b.ms - a.ms).slice(0, 16),
    handlers: [...handlers.values()].sort((a, b) => b.ms - a.ms).slice(0, 12),
    drawings: drawingList(nameOf),
    frames: framesSeen(kept),
    costliest, unsettled: { motion, waiting },
    hidden: { views: hiddenViews, parts: groupParts(hiddenParts).slice(0, 6) },
  };
}

/** Hidden parts of one class (a list's hidden rows) as one entry: how many, holding
 *  how many views, and the first by name. */
function groupParts(parts: { view: string; n: number }[]): { view: string; n: number }[] {
  const by = new Map<string, { parts: { view: string; n: number }[]; n: number }>();
  for (const p of parts) {
    const cls = /\(([^)]+)\)$/.exec(p.view)?.[1] ?? p.view;
    const g = by.get(cls) ?? { parts: [], n: 0 };
    g.parts.push(p); g.n += p.n; by.set(cls, g);
  }
  // a group is named by what holds the most of it, with how many each holds
  const bare = (v: string): string => v.replace(/ \([^)]+\)$/, "");
  return [...by].map(([cls, g]) => {
    if (g.parts.length === 1) return { view: g.parts[0].view, n: g.n };
    const big = [...g.parts].sort((a, b) => b.n - a.n).slice(0, 2).map((p) => `${bare(p.view)} ${p.n}`);
    return { view: `${g.parts.length} hidden ${cls} (${big.join(", ")}${g.parts.length > 2 ? ", …" : ""})`, n: g.n };
  }).sort((a, b) => b.n - a.n);
}

const gpuMeasured = new WeakMap<object, number>();
const byWeight = (a: Drawing, b: Drawing): number => b.n * b.w * b.h - a.n * a.w * a.h;
function drawingList(nameOf: (n: object) => string): ProfileDrawing[] {
  return [...drawings.values()].sort(byWeight).slice(0, 12).map((d) => {
    let view = "a drawing";
    if (d.owner !== undefined) { try { view = `${nameOf(d.owner)} (${className(d.owner)})`; } catch { view = className(d.owner); } }
    const g = gpuMeasured.get(d.list);
    return { view, n: d.n, scriptMs: d.ms / d.n, w: d.w, h: d.h, ...(g !== undefined ? { gpuMs: g } : {}) };
  });
}

/** Draw each recorded drawing (the most drawn first, by area) ALONE, on a canvas
 *  of its own the size of its raster, and wait for its pixels: the GPU's time
 *  to draw it once in this browser — the part a frame pays out of the page's
 *  sight. Best of `reps` (each on a fresh canvas: a canvas read back is moved
 *  off the GPU by some browsers, which would measure a different path), less an
 *  empty canvas's. Run after recording, while the program is quiet if it can be:
 *  frames still being drawn share the GPU. Answers how many it measured. */
export function measureDrawings(opts: { max?: number; reps?: number } = {}): number {
  if (typeof document === "undefined") return 0;
  const reps = Math.max(2, opts.reps ?? 4);
  const once = (w: number, h: number, d: Drawing | null): number => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (ctx === null) return 0;
    const t = performance.now();
    if (d !== null) {
      const m = d.transform;
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      replay(ctx, d.list as DisplayList);
    }
    ctx.getImageData(0, 0, 1, 1);
    const dt = performance.now() - t;
    c.width = 0; c.height = 0;
    return dt;
  };
  let done = 0;
  for (const d of [...drawings.values()].sort(byWeight).slice(0, opts.max ?? 8)) {
    if (d.w * d.h > 64e6) continue;
    let best = Infinity, empty = Infinity;
    for (let i = 0; i < reps; i++) {
      const dt = once(d.w, d.h, d);
      if (i > 0) best = Math.min(best, dt);   // the first pays for warming up
      empty = Math.min(empty, once(d.w, d.h, null));
    }
    gpuMeasured.set(d.list, Math.max(0, best - empty));
    done++;
  }
  return done;
}

function framesSeen(kept: Turn[]): ProfileFrames | null {
  if (frameAt.length < 3) return null;
  const gaps: { at: number; ms: number; work: boolean; s0: number; s1: number; r: number }[] = [];
  for (let i = 0; i + 1 < frameAt.length; i++) {
    // the work done after frame i began (its callbacks, its settles, its rasters)
    // is what holds frame i + 1 back
    const s0 = frameSettles[i], s1 = frameSettles[i + 1], r = frameRasters[i + 1] - frameRasters[i];
    gaps.push({ at: frameAt[i] - t0, ms: frameAt[i + 1] - frameAt[i], work: s1 > s0 || r > 0, s0, s1, r });
  }
  const quiet = gaps.filter((g) => !g.work).map((g) => g.ms);
  // the quiet frames run at the display's rate; with too few of them, the shortest
  // tenth of all the gaps (a stray short one, two frames' callbacks run late, is not it)
  const display = (quiet.length >= 5 ? pct(quiet, 0.5) : pct(gaps.map((g) => g.ms), 0.1)) || 16.7;
  const busy = gaps.filter((g) => g.work);
  const ms = busy.map((g) => g.ms);
  const byN = new Map<number, Turn>(); for (const t of kept) byN.set(t.n, t);
  const slowest = [...busy].sort((a, b) => b.ms - a.ms).slice(0, 5).map((g) => {
    let declare = 0, n = 0; const causes = new Set<string>();
    for (let k = g.s0 + 1; k <= g.s1; k++) { const t = byN.get(k); if (t === undefined) continue; declare += t.ms + t.lead; n++; if (t.origin[0] !== undefined) causes.add(t.origin[0]); }
    return { at: g.at, ms: g.ms, declare, turns: n, rasters: g.r, causes: [...causes].slice(0, 3) };
  });
  return { frames: frameAt.length, withWork: busy.length, display, median: pct(ms, 0.5), p95: pct(ms, 0.95), worst: ms.length ? Math.max(...ms) : 0, late: ms.filter((x) => x > display * 1.5).length, slowest };
}

/** What opened a turn: each kind of cause once, with how many of it. */
function originText(o: string[]): string {
  if (o.length === 0) return "(no user code ran: motion, a layout, a first run)";
  if (o.length === 1) return o[0];
  // several: by kind (the handler, the arrival), with how many and the first one's place
  const kinds = new Map<string, { n: number; first: string }>();
  for (const x of o) {
    const i = x.indexOf(" on "), k = i >= 0 ? x.slice(0, i) : x;
    const e = kinds.get(k) ?? { n: 0, first: i >= 0 ? x.slice(i + 4) : "" };
    e.n++; kinds.set(k, e);
  }
  return [...kinds].slice(0, 3).map(([k, e]) => e.n > 1 ? `${k} ×${e.n}${e.first ? ` (${e.first}, …)` : ""}` : `${k}${e.first ? ` on ${e.first}` : ""}`).join(", ") + (kinds.size > 3 ? `, and ${kinds.size - 3} more kinds` : "");
}
const f1 = (n: number): string => n >= 100 ? String(Math.round(n)) : n >= 0.05 || n === 0 ? n.toFixed(1) : n.toFixed(2);
const at = (r: ProfileRule): string => (r.source !== null ? `  (${r.source})` : "  (runtime)") + (r.views > 1 ? `  on ${r.views >= 64 ? "64 or more" : r.views} views: ${r.on.join(", ")}, …` : r.views === 1 ? `  on ${r.on[0]}` : "");
const effect = (r: ProfileRule): string => r.pushes ? "pushed to the page" : `${r.changed} changed`;

/** The report as text: plain, structured, for a person or an agent to read and act on. */
export function profileText(r: ProfileReport): string {
  const out: string[] = [];
  out.push(`profile · ${r.turns} turns · ${f1(r.ms)} ms in Declare · ${r.runs} rule runs${r.kernelRuns > 0 ? (r.itemized ? ` + ${r.kernelRuns} runs of the kernel's own built-in layouts` : ` + ${r.kernelRuns} arithmetic rules run natively by the kernel (not itemized — profile with itemize to name them)`) : ""}${r.dropped > 0 ? ` · ${r.dropped} oldest turns dropped` : ""}`);
  out.push(r.itemized ? "itemized: every rule named, arithmetic included — times run slower than shipped (profile --native for true times)" : "as shipped: true times; arithmetic rules the kernel runs are counted in total only");
  out.push("times are exclusive: each part is charged only what the parts inside it did not take");
  if (r.causes.length > 0) out.push("turns by cause: " + r.causes.slice(0, 6).map((c) => `${c.cause} ×${c.turns} (${f1(c.ms)} ms)`).join(" · "));
  if (r.repeated.length > 0) {
    out.push("", "repeated causes: one cause turn after turn");
    for (const x of r.repeated) {
      out.push(`  ${x.cause} ×${x.turns} in a row   ${f1(x.median)} ms a turn (median) · worst ${f1(x.worst)} ms (turn ${x.worstTurn}) · ${x.runs} rule runs a turn · ${f1(x.ms)} ms in all`);
      if (x.openedBy.length > 0) out.push(`      opened by ${x.openedBy.map((o) => `${o.write} (${o.turns})`).join(", ")}`);
    }
  }
  if (r.costliest.length > 0) {
    out.push("", "costliest turns");
    for (const t of r.costliest) {
      out.push(`  turn ${t.n} · ${originText(t.origin)}   ${f1(t.ms + t.lead)} ms${t.lead >= 0.1 ? ` (${f1(t.lead)} before the settle)` : ""} · ${t.runs} runs, ${t.changed} changed${t.built > 0 ? ` · ${t.built} built` : ""}`);
      if (t.triggers.length > 0) out.push(`      opened by ${t.triggers.join(" · ")}`);
      out.push(`      where it went: ${t.spent.filter((s) => s.ms >= 0.05).slice(0, 6).map((s) => `${s.what} ${f1(s.ms)}`).join(" · ")}`);
      if (t.why.length > 0 && t.top[0] !== undefined) out.push(`      why ${t.top[0].label} ran: ${t.why.join(" ← ")}`);
      for (const x of t.top) out.push(`      ${x.label} ×${x.runs} · ${effect(x)} · ${f1(x.ms)} ms${at(x)}`);
      if (t.built > 0) out.push(`      built ${t.builtBy.map((b) => `${b.cls} ×${b.n}`).join(" · ")}${t.built > t.builtBy.reduce((n, b) => n + b.n, 0) ? " · …" : ""}`);
    }
  }
  // the text keeps to what is worth changing: a millisecond of waste or more
  const worth = r.reranForNothing.filter((x) => x.wastedMs >= 1);
  if (r.reranForNothing.length > 0) {
    out.push("", "re-ran for nothing: rules that ran often and almost never changed anything");
    for (const x of worth.slice(0, 10)) {
      out.push(`  ${x.label}   ${x.runs} runs over ${x.turns} turns · ${x.unchanged} changed nothing (${Math.round(100 * x.unchanged / x.runs)}%) · ${f1(x.wastedMs)} ms of it${at(x)}`);
      if (x.reads.length > 0) out.push(`      reads ${x.reads.join(", ")}`);
      if (x.openedBy.length > 0) out.push(`      its turns were opened by ${x.openedBy.map((o) => `${o.write} (${o.turns})`).join(", ")}`);
    }
    const small = r.reranForNothing.length - Math.min(worth.length, 10);
    if (small > 0) out.push(`  ${worth.length === 0 ? "" : "and "}${small} more, under a millisecond each: ${r.reranForNothing.filter((x) => !worth.slice(0, 10).includes(x)).slice(0, 4).map((x) => x.label).join(", ")}${small > 4 ? ", …" : ""}`);
    if (worth.length > 0) out.push("  — each reads something that changes for all of them while its own answer changes for few. Where it costs enough to matter, give each one its own answer to read (a field of its record, or an attribute set where the change is made) rather than a shared value they all compare against; whatever holds that answer keeps one writer");
  }
  if (r.buildCost.length > 0) {
    out.push("", "building, by class (exclusive of what each holds)");
    for (const b of r.buildCost.slice(0, 10)) out.push(`  ${b.cls}${b.n > 0 ? ` ×${b.n}` : ""}   ${f1(b.ms)} ms${b.n > 0 ? ` (${f1(b.ms / b.n)} each)` : ""} · building ${f1(b.build)} · attaching ${f1(b.attach)} · binding rules ${f1(b.bind)}`);
  }
  if (r.handlers.length > 0 && r.handlers[0].ms >= 0.5) {
    out.push("", "handlers, by time (their own code, not the turns they open)");
    for (const h of r.handlers.slice(0, 8)) out.push(`  ${h.label} ×${h.n}   ${f1(h.ms)} ms`);
  }
  if (r.drawings.length > 0) {
    out.push("", "drawings (draw() recorded, then rasterized into its canvas)");
    for (const d of r.drawings.slice(0, 8)) out.push(`  ${d.view}   rasterized ×${d.n} · ${d.w}×${d.h} px · script ${f1(d.scriptMs)} ms each${d.gpuMs !== undefined ? ` · on the GPU ${f1(d.gpuMs)} ms each (drawn alone, after the profile)` : ""}`);
    if (r.drawings.some((d) => d.gpuMs !== undefined)) out.push("  — the script records and the GPU draws later, out of the page's sight: a drawing's cost to a frame is its GPU time");
  }
  if (r.rules.length > 0) {
    out.push("", "rules, by runs");
    for (const x of r.rules.slice(0, 15)) out.push(`  ${x.label}   ×${x.runs} · ${effect(x)} · ${f1(x.ms)} ms${at(x)}`);
  }
  if (r.upkeep.length > 0) out.push("", `the runtime's own upkeep (nothing you wrote): ${r.upkeep.slice(0, 6).map((u) => `${u.what} ×${u.runs}, ${f1(u.ms)} ms`).join(" · ")}`);
  if (r.built.length > 0) {
    out.push("", "built, by class");
    out.push("  " + r.built.slice(0, 12).map((b) => `${b.cls} ×${b.n}`).join(" · "));
    if (r.discarded.length > 0) out.push("  torn down: " + r.discarded.slice(0, 8).map((b) => `${b.cls} ×${b.n}`).join(" · "));
  }
  if (r.hidden.views >= 20) out.push("", `built but hidden: ${r.hidden.views} views, held by ${r.hidden.parts.map((p) => `${p.view} ×${p.n}`).join(", ")}${r.hidden.parts.length >= 6 ? ", …" : ""} — a hidden view is built, bound and kept current all the same; a part shown only sometimes costs nothing while it is not wanted with \`exists = { … }\`, which builds it only then`);
  if (r.frames !== null) out.push("", framesSeenText(r.frames));
  const waits = [...r.unsettled.motion.map((m) => `motion: ${m}`), ...r.unsettled.waiting];
  out.push("", waits.length > 0 ? `not settled: ${waits.slice(0, 8).join("; ")}${waits.length > 8 ? `; and ${waits.length - 8} more` : ""}` : "settled: no motion running, nothing waiting");
  return out.join("\n");
}

/** The page's view of frames, as text. */
export function framesSeenText(f: ProfileFrames): string {
  const out: string[] = [];
  if (f.withWork === 0) return `frames, as the page sees them: ${f.frames} begun, none with work from Declare`;
  out.push(`frames, as the page sees them: ${f.withWork} with work from Declare (of ${f.frames}) · the display refreshes every ${f1(f.display)} ms · from one frame's start to the next: median ${f1(f.median)} · p95 ${f1(f.p95)} · worst ${f1(f.worst)} ms · ${f.late} late`);
  for (const s of f.slowest.slice(0, 4)) {
    const rest = Math.max(0, s.ms - s.declare);
    out.push(`  ${f1(s.ms)} ms at +${Math.round(s.at)} ms — Declare ${f1(s.declare)}${s.turns > 0 ? ` (${s.turns} turn${s.turns === 1 ? "" : "s"}${s.causes.length > 0 ? `: ${s.causes.join(", ")}` : ""})` : ""}${s.rasters > 0 ? ` · ${s.rasters} drawing${s.rasters === 1 ? "" : "s"} rasterized` : ""} · ${f1(rest)} outside Declare: style, layout and paint, other script, and the GPU`);
  }
  out.push("  (in a browser, a frame that costs more than the display's interval anywhere — script, the browser, the GPU — pushes the next one back, so this is the cost a page can see in any browser; in the Mac host the frames follow its display link, and its commits say which reached the screen)");
  return out.join("\n");
}

/** Clear what a profile recorded, the wake trace it started included. */
export function clearProfile(): void {
  stopProfile();
  turns = []; between = fresh(); drawings.clear(); frameAt = []; frameSettles = []; frameRasters = [];
  if (ownTrace) { clearTrace(); ownTrace = false; }
}

// Profiling from the first settle — boot itself — when the page asked before the
// runtime loaded (declare-profile sets it): construction is most of a slow start.
if ((globalThis as { __declareProfileAtBoot?: boolean }).__declareProfileAtBoot === true) startProfile();

// runtime-methods.ts — THE RUNTIME METHOD TABLE: for each built-in schema, the
// member names its runtime class implements as METHODS (functions on the
// class's prototype), as opposed to its attributes (accessors) and fields.
//
// Why a static table: the checker is runtime-free by design — it never
// constructs a View to ask what members it has — yet the language rule "a
// subclass's method replaces the base's, and `super.name(…)` reaches the
// replaced one" holds for a built-in's runtime methods too (`fetch`, `start`,
// `scrollTo`, …). So `super.fetch()` in `class Fetcher extends DataSource`
// must resolve at R1, from this table, exactly as `super.describe()` resolves
// from a class body. The runtime installs the override against the live
// prototype (instantiate.ts installMethods); this is the compile-time twin.
//
// OWN names per schema, keyed like schema.ts — a schema whose runtime class
// sits on an intermediate class with no schema of its own (Keys → KeysSource
// extends Source; Markdown extends RichText) lists that class's methods as its
// own, so the chain union below is exactly the prototype chain. The table is
// PINNED: test/override-runtime.test.mjs recomputes every list from the
// actual runtime classes (`Object.getOwnPropertyNames(C.prototype)`, functions
// only, minus `constructor` and `$`-names) and fails on any drift.
import { SCHEMAS, RichTextSchema, type ComponentSchema } from "./schema.js";

export const RUNTIME_METHODS: Readonly<Record<string, readonly string[]>> = {
  Node: ["watchChildList", "childListChanged", "appendChild", "insertChild", "removeChild", "discard", "teardown", "childrenMutated", "chainMoved", "structureCellId"],
  View: ["is3D", "localTransform", "applyMask", "attach", "contentExtent", "bindExtent", "extentOf", "contentOrigin", "contentBox", "positionLead", "bounds", "footprint", "tabDefault", "focusChanged", "alignBand", "flush", "viewAt", "containsPoint", "rootBounds", "armVisibility", "readVisibility", "startVisibility", "scheduleVisFlush", "deliverVisibility", "rootTransform", "rootOrigin", "travelWith", "applyTravel", "repushPosition", "scrollIntoView", "scrollTo", "scrollToX", "scrollBy", "createView", "raise", "inputSink", "rewireInput", "inputWants", "bindDraw", "invalidateDraw", "applyClip",
    // THE KERNEL's view wiring (kernel.md): the native auto-extent rule and
    // its word list, the view's kernel identity, and the native visibility rule
    // with its output plumbing and its fallback.
    "installKernelExtent", "extentWords", "kernelElem", "relinkKernelVis", "installKernelVis", "visOutputRule", "visFallbackToJS"],
  App: ["post", "navigate", "destinationOf", "follow", "destinationOfAnchor", "inspect", "openWindow", "resolveReveal", "hasArrive", "destinationView", "reveal", "rearmReveal", "hookPumpRetire", "scheduleReveal", "cancelReveal", "bindPageScroll", "provide", "exposed", "watchExposed"],
  Text: ["lineAdvance"],
  Image: ["load"],
  Media: ["metadataArrived", "sourceCleared", "load", "syncPlaying", "seek"],
  Video: ["makeElement"],
  Audio: ["makeElement"],
  // THE BOUNDARY lives on the base Island, which is not itself a schema
  // (islands.md): the provides list going down, the exposed values coming up,
  // and the verbs both ways — so they are listed on the concrete island.
  DOMIsland: ["exposed", "post", "receiveMessage", "providedValue", "foreignHandle"],   // `flush` is View's, overridden here
  Editor: ["commit", "revert"],
  TextInput: ["draftSlot", "editStyle", "syncEditable", "onNativeInput", "select", "applySelection"],
  RichText: ["policy", "stylesOf", "palette", "paletteKey", "dispatchLink", "relayout", "ownWidth", "fitNatural", "claimBaseline", "rebuild"],
  Markdown: ["sourceKey", "parseSource"],
  HTMLText: ["sourceKey", "parseSource"],
  Layout: ["attachTo", "rearm", "laid", "place", "contentExtent", "reportConflict", "reportDiscarded", "firstReport", "refuseBaseline", "viewExtent", "refuseStackBaseline", "claim", "unclaim", "label", "install"],
  TweenLayout: ["retarget"],
  Dataset: ["cursorAt", "read", "set", "insert", "removeAt", "move", "declaredField", "writeError", "segs", "locate", "array", "wakeChain", "adopt"],
  DataSource: ["maybeAuto", "requestInit", "fetch", "clear"],
  Animator: ["markGrouped", "resolveTarget", "autoStart", "startedChanged", "pausedChanged", "reanchor", "start", "stop", "rebase", "tick", "releaseSlot", "end", "fire"],
  AnimatorGroup: ["markGrouped", "members", "autoStart", "startedChanged", "pausedChanged", "reanchor", "start", "stop", "rebase", "tick", "cycleComplete", "endGroup", "fire"],
  Spring: ["wake", "prime", "arrive"],
  Time: ["autoStart"],
  Font: ["autoStart", "start", "ready"],
  Face: [],
  Keys: ["channels", "autoStart"],
  Focus: ["channels", "autoStart"],
  Tip: ["channels", "autoStart"],
  Stream: ["autoStart", "readdressed", "gated", "sync", "connect", "ended", "drop", "fire"],
  EventStream: ["dial"],
  Socket: ["dial", "send"],
  State: ["onLinked", "init", "apply", "remove", "toggle", "drive", "sync", "buildChildren", "teardownChildren", "fire"],
};

/** THE RUNTIME FIELD TABLE — the other half of a runtime class's members: the
 *  names an instance carries that are neither methods (above) nor declared
 *  attributes — instance fields (`surface`, `backend`, `parent`) and prototype
 *  accessors. A child may not take one: the runtime refuses it at instantiate
 *  (`'surface' is already a member of the running App`), and the checker, being
 *  runtime-free, refuses it in the source from this table. OWN names per
 *  schema, as above; PINNED by test/override-runtime.test.mjs, which constructs
 *  each class and recomputes the lists (minus `$`-names and attributes). */
export const RUNTIME_FIELDS: Readonly<Record<string, readonly string[]>> = {
  View: ["_navLink", "backend", "drawing", "exposes", "extentRelistQueued", "insetX", "insetY", "maskUsers", "scrollsOn", "surface", "travelHost", "visArmed", "visElem", "visFlushTimer", "visGeneric", "visH", "visMode", "visOn", "visPending", "visRule", "visScale", "visStale", "visUnwatch", "visW", "visWake", "visX", "visY"],
  App: ["demoSources", "hostServices", "hostSink", "hostValues", "lastRevealLocation", "liveReport", "pageScroll", "pageWeight", "pendingAnchor", "pendingHistoryVerb", "pendingInspect", "pendingNav", "pendingOpen", "pumpOn", "pumpRetireHooked", "readyDelivered", "revealPump", "sourceLines"],
  Image: ["bitmap", "loadSeq", "natural"],
  Media: ["el", "loadSeq"],
  Video: ["natural"],
  DOMIsland: ["exposedValues", "handle", "tenantSink"],
  TextInput: ["pendingSel"],
  Layout: ["authorSized", "bases", "discarded", "rearming", "reported", "stackReported", "undo", "view"],
  TweenLayout: ["from", "to", "tween"],
  Dataset: ["cursors"],
  DataSource: ["autoUrl", "seq"],
  Animator: ["autoStarted", "cyclesLeft", "elapsed", "fromJump", "grouped", "lastNow", "live", "perpetual", "runAttr", "runDelta", "runDuration", "runMotion", "runTarget", "traveled"],
  AnimatorGroup: ["active", "autoStarted", "cyclesLeft", "grouped", "live"],
  Spring: ["arriving", "primed", "springLastNow", "springRunning", "vel"],
  Keys: ["wired"],
  Focus: ["wired"],
  Tip: ["wired"],
  Stream: ["gen", "handle", "timer", "wasOpen", "wired"],
  State: ["builtChildren", "childTemplates", "installed", "materialize", "overrides", "priority"],
  Node: ["children", "classroot", "exParent", "parent", "root", "structure"],
  RichText: ["built", "laid", "slotHost"],
};

/** Every schema the table can be asked about: the SCHEMAS table plus RichText,
 *  the documented-but-uninstantiable base Markdown and HTMLText share (the
 *  schema chain passes through it, so its methods must sit somewhere). */
function schemaOf(name: string): ComponentSchema | null {
  if (name === RichTextSchema.name) return RichTextSchema;
  return Object.hasOwn(SCHEMAS, name) ? SCHEMAS[name] : null;
}

const CHAIN = new Map<string, ReadonlySet<string>>();
const FIELD_CHAIN = new Map<string, ReadonlySet<string>>();

/** The runtime fields a schema's instances carry — its own and every base's up
 *  the schema chain (RUNTIME_FIELDS). By name for a built-in, or by schema
 *  object for any schema, a program class's included. */
export function runtimeFieldsOf(schema: string | ComponentSchema): ReadonlySet<string> {
  if (typeof schema !== "string") {
    const names = new Set<string>();
    for (let s: ComponentSchema | null = schema; s !== null; s = s.base) for (const n of RUNTIME_FIELDS[s.name] ?? []) names.add(n);
    return names;
  }
  let set = FIELD_CHAIN.get(schema);
  if (set === undefined) {
    const names = new Set<string>();
    for (let s = schemaOf(schema); s !== null; s = s.base) for (const n of RUNTIME_FIELDS[s.name] ?? []) names.add(n);
    set = names;
    FIELD_CHAIN.set(schema, set);
  }
  return set;
}

/** The runtime methods a schema's instances carry — its own and every base's
 *  up the schema chain, i.e. the whole prototype chain. By NAME for a built-in
 *  (cached; empty for a name that is no schema), or by SCHEMA for any schema
 *  object, a program class's included — it resolves through its bases to the
 *  built-in that implements them. */
export function runtimeMethodsOf(schema: string | ComponentSchema): ReadonlySet<string> {
  if (typeof schema !== "string") {
    const names = new Set<string>();
    for (let s: ComponentSchema | null = schema; s !== null; s = s.base) for (const n of RUNTIME_METHODS[s.name] ?? []) names.add(n);
    return names;
  }
  let set = CHAIN.get(schema);
  if (set === undefined) {
    const names = new Set<string>();
    for (let s = schemaOf(schema); s !== null; s = s.base) for (const n of RUNTIME_METHODS[s.name] ?? []) names.add(n);
    set = names;
    CHAIN.set(schema, set);
  }
  return set;
}

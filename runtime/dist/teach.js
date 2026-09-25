// The TEACH module — the one place the platform keeps what it says to a reader
// who reached for a name that is not there. Two front ends share it (the
// design: docs/system-design/doc-cli.md §4): the checker (check.ts), whose
// scope comes from the parse, and the doc CLI (tools/doc.mjs), whose scope is
// inferred from the query. One corpus, one scoring discipline — a hint string
// exists HERE and nowhere else, so the compiler and the lookup tool cannot
// drift apart. (Acceptance: zero duplicated hint strings in the tree.)
//
// `nearestName` itself stays in diagnostics.ts (it serves codes and components
// too); this module re-exports it so a front end needs only one import.
import { nearestName } from "./diagnostics.js";
export { nearestName };
/** The CSS-interference table (E-1 escalation 2, diagnostics.md §4): a model
 *  (or a web developer) reaches for the CSS name; the miss should name the
 *  Declare slot, because "has no attribute" alone states the rule and not the
 *  fix. Evidence-driven — entries earn their place by appearing in eval
 *  failures or having one true equivalent; vague CSS concepts stay out. */
export const CSS_ATTRIBUTE_HINTS = {
    border: "a border is 'stroke = { stroke(1, 0xE2E5E9) }' — drawn inside the box",
    borderWidth: "a border is 'stroke = { stroke(1, 0xE2E5E9) }' — width and color travel together",
    borderColor: "a border is 'stroke = { stroke(1, 0xE2E5E9) }' — width and color travel together",
    borderStyle: "a border is 'stroke = { stroke(width, color) }' — solid only",
    boxShadow: "a shadow is 'shadow = { shadow(dx, dy, blur, 0x00000040) }'",
    background: "the paint slot is 'fill' (a color or gradient(…))",
    backgroundColor: "the paint slot is 'fill'",
    borderRadius: "rounding is 'cornerRadius'",
    color: "text color is 'textColor' (a provided value — set it on a container to cascade)",
    zIndex: "stacking is source order — later siblings draw above; there is no z-index",
    overflow: "clipping is 'clip = true'; scrolling is 'scrolls = y' (the axis enum)",
    display: "arrangement is the 'layout' attribute — 'layout: SimpleLayout [ axis = y, spacing = 8 ]'",
    flexDirection: "arrangement is the 'layout' attribute — 'axis = x' or 'axis = y'",
    justifyContent: "arrangement is the 'layout' attribute; fine placement is x/y constraints",
    alignItems: "arrangement is the 'layout' attribute; fine placement is x/y constraints",
    gap: "spacing between arranged children rides the layout — 'layout: SimpleLayout [ axis = y, spacing = 8 ]'",
    margin: "there is no margin — space around a child is the PARENT's 'padding', a layout's 'spacing', or the child's own x/y",
    padding: "padding is the view's, not the layout's — 'View [ padding = 16, layout: SimpleLayout [ axis = y, spacing = 8 ] ]': it gives the view a content box that every child's x/y starts from (laid, self-placing or ignoreLayout alike) and that '100%' resolves against, while 'fill', 'stroke' and 'cornerRadius' stay on the full box; a Card brings one already",
    // (`onChange` left this table 2026-09-15: it IS a Declare event now — the
    // values a node names in `trackChanges`. The DOM instinct that arrives at it
    // meaning an input's edits is answered by the event's own prose, which names
    // `onInput`, rather than by a table that would deny the name exists.)
    // CSS names for capabilities Declare HAS, reached through the wrong door:
    // These earn their place by the table's own rule — one true equivalent each
    // — and they matter because "no such attribute" ends the search at exactly
    // the wrong moment. (`rotation` graduated from this table 2026-08-06: it IS
    // a View attribute now — compositing.md Part II.)
    rotate: "rotation is the attribute — 'rotation = 45' (degrees, clockwise, about pivotX/pivotY); 'rotateX'/'rotateY' turn a view out of its plane under the parent's 'perspective'; inside a drawing, d.rotate(rad)",
    transform: "there is no transform list: position is x/y, size is width/height; 'scale', 'scaleX'/'scaleY', 'skewX'/'skewY', 'rotation', 'rotateX'/'rotateY'/'translateZ' transform about pivotX/pivotY (the parent's 'perspective' is the eye), and arbitrary geometry is a 'draw(d: Draw)' member",
    skew: "a shear is 'skewX = 20' / 'skewY = 20' (degrees, about pivotX/pivotY)",
    backfaceVisibility: "'backface = hidden' hides a view turned past 90° about X or Y",
    scaleX: "per-axis scale is 'scaleX' / 'scaleY' (multiplied with the uniform 'scale')",
    perspective: "'perspective = 700' on the PARENT is the eye its children's 'rotateX'/'rotateY'/'translateZ' are seen through (px; 0 = orthographic)",
    blur: "blur is a filter — 'filter = blur(4)' blurs this view's own paint as a group (a list composes: 'filter = [blur(4), brightness(0.8)]'); 'backdrop = blur(20)' blurs what lies BENEATH; inside a drawing, d.filter",
    dropShadow: "a shadow of the painted ALPHA is 'filter = shadow(dx, dy, blur, color)' (the box's own shadow is the 'shadow' attribute; glyphs take 'textShadow')",
    mixBlendMode: "compositing is the 'blend' attribute — 'blend = multiply' lands this view with the operator; inside a drawing, d.globalCompositeOperation",
    backdropFilter: "the frost is 'backdrop = frost(radius, saturation)' — or any filter list, 'backdrop = [blur(20), saturate(1.4)]' — sampled beneath the view's own shape",
    maskImage: "a soft mask is 'mask = gradient(…)' (its alpha over the box) or 'mask = { stencil }' (another view's painted alpha); a hard edge is 'clip' — true for the box, or a path",
    objectPosition: "where a contain/cover fit sits is 'alignX' / 'alignY' on the Image — start, center, end",
    // The 2026-08-08 foreign-reach audit (HTML/CSS · React · native-mobile, read against the
    // whole reference): the attribute-position instincts a newcomer actually
    // types, each with its one true equivalent. Question-shaped foreign names
    // (useState, VStack, ScrollView) live in the concept table instead —
    // they are asked, never written in an attribute position.
    flex: "there is no flex — arrangement is the 'layout' attribute; leftover space goes to a 'Spacer' child; proportions are your own arithmetic ('width = { parent.width * 0.4 }')",
    float: "there is no float — position with x/y, or let 'layout: WrappingLayout [ ]' flow and wrap children",
    position: "there is no position property — x/y place a view in its parent; 'ignoreScroll = true' is fixed chrome; 'ignoreLayout = true' opts out of arrangement; stacking is source order",
    visibility: "showing is 'visible' — a 'visible = false' view stays in the tree but paints nothing, and a layout reclaims its space",
    whiteSpace: "wrapping is Text's 'wrap' — 'wrap = false' is the nowrap; there is no ellipsis (clip = true crops at the box)",
    textOverflow: "there is no text-overflow ellipsis — 'wrap = false' keeps one line and 'clip = true' crops at the box edge",
    maxWidth: "there is no maxWidth — constrain it: 'width = { Math.min(contentWidth, 480) }'",
    maxHeight: "there is no maxHeight — constrain it: 'height = { Math.min(contentHeight, 400) }'",
    transition: "there is no transition — motion is declared beside the attribute: an 'Animator' (timed), a 'Spring' (live target), or a 'State' for a bundle that snaps with motion",
    animation: "there is no animation property — motion is a member: an 'Animator' (timed, from→to), a 'Spring' (chases a live target), an 'AnimatorGroup' (sequence)",
    keyframes: "there are no keyframes — an 'Animator' drives one attribute from→to through a motion curve; sequence several with 'AnimatorGroup'",
    fontStyle: "italics are Text's 'italic = true'",
    objectFit: "image fitting is 'stretches' — 'cover' fills and crops, 'contain' letterboxes",
};
/** The CSS-instinct hint for an unknown attribute name, or "" when the miss
 *  isn't a known CSS name. */
export function cssAttributeHint(name) {
    const h = Object.hasOwn(CSS_ATTRIBUTE_HINTS, name) ? CSS_ATTRIBUTE_HINTS[name] : "";
    return h ? ` — the CSS instinct: ${h}` : "";
}
/** The hint-table key a near-missed foreign name routes to, or null.
 *
 *  A near-miss on a HINTED name answers with the hint, not the spelling:
 *  `colour` is one edit from `color`, and what that reader needs is
 *  "text color is 'textColor'", not "did you mean 'color'?" — which names an
 *  attribute that does not exist either. The tables know intent; reaching them
 *  through a typo is worth more than reaching a nearby letter-string.
 *  …but only for a name long enough for the miss to mean something. Routing to
 *  a hint asserts what the author was THINKING, which is a longer reach than
 *  naming a spelling, so it wants more evidence than a short string can carry:
 *  `zap` is one edit from `gap` and is a typo for nothing at all. Five is the
 *  same floor nearestName already uses to widen its own budget. */
export function hintedForeignName(name) {
    return name.length >= 5 ? nearestName(name, Object.keys(CSS_ATTRIBUTE_HINTS)) : null;
}
/** The HOST-GLOBAL table: the browser's (and Node's) names a body may reach
 *  for, each answered with the Declare way. A Declare program runs on three
 *  renderers, so a bare `document` or `process` is refused by NAME — with the
 *  fact the author actually wanted named beside it — rather than admitted by
 *  the resolver and then refused by the checker with TypeScript's own advice
 *  ("change lib to dom", "npm i @types/node"), which is what happened until
 *  2026-08-23. What a body MAY name is the prelude (scaffold.ts) plus the ES
 *  built-ins: docs Vocabulary → Types and functions. A host capability the
 *  language lacks arrives through an `external` attribute the host supplies,
 *  never through a bare global. */
export const HOST_GLOBAL_HINTS = {
    window: "there is no window — the App fills its host, so the page's size is app.width / app.height, and host facts (app.pageVisible, app.darkMode) are attributes",
    innerWidth: "the page's width is app.width (the App fills its host)",
    innerHeight: "the page's height is app.height (the App fills its host)",
    screen: "the page's size is app.width / app.height; pixel density is the renderer's concern, not the program's",
    devicePixelRatio: "pixel density is the renderer's concern, not the program's — draw in points",
    document: "there is no document — the tree IS the program: reach a node by its name (app.sidebar.list), never by a query",
    navigator: "host facts are attributes (app.pageVisible, app.darkMode, app.width); a capability the language lacks is declared `external` and supplied by the host",
    location: "the URL's fragment is app.location; follow a link with `link = …` or app.navigate(…)",
    history: "back/forward is the (location, waypoint) pair the host walks; a program writes app.location",
    requestAnimationFrame: "motion is declared: a Spring (target → value) or an Animator (time → value); per-frame integration is Time [ tick = frame, onTick(dt) ], and a value that is a function of the current time derives from a Time's facts (now, minute, …); one call on the next frame is afterDelay(0, fn)",
    cancelAnimationFrame: "a Spring or Animator is interruptible by writing its target; a Time stops with `running = false`",
    setImmediate: "one call on the next frame is afterDelay(0, fn)",
    setTimeout: "one call later is afterDelay(ms, fn) — the wait belongs to this node, goes when the node goes, and afterDelay(0, fn) is the next frame; a repeating one is a Time member, Time [ tick = 5000, onTick() { … } ]. Most waiting is neither: a value that should change when something happens is a constraint on that something",
    clearTimeout: "afterDelay(ms, fn) returns a handle — call its cancel(); a node's waits are cancelled when it is discarded",
    setInterval: "a repeating call is a Time member — Time [ tick = 5000, onTick() { … } ], where a number is a period in milliseconds and frame / second / minute / hour / day are aligned to the clock",
    clearInterval: "a Time stops with running = false, and goes with its node",
    queueMicrotask: "work that reads what this handler's writes produced is afterSettle(fn); work on the next frame is afterDelay(0, fn)",
    fetch: "a request is a DataSource member — url, method, body, headers — whose fetch() a handler calls; the screen derives from its loaded / loading / failed, and its onLoad() runs as the reply lands. A script [ \"file.ts\" ] module may call the host's fetch when a DataSource cannot say what you need",
    globalThis: "a program reaches nothing through the global object — state lives on nodes, host facts are App attributes, and a capability the language lacks is declared `external` or kept in a script [ \"file.ts\" ] module",
    getComputedStyle: "geometry is an attribute: x, y, width, height, bounds(), the visibleRect family — never a style query",
    matchMedia: "responsive choices derive from app.width (or a Responsive plan) and app.darkMode",
    localStorage: "persistence is not in the language yet — hold the state in a Dataset; a host can supply storage through an `external` attribute — or keep the mirror in a script [ \"file.ts\" ] module (plain bundled TypeScript, where such APIs are usable directly) and feed a Dataset from handlers",
    sessionStorage: "persistence is not in the language yet — hold the state in a Dataset; a host can supply storage through an `external` attribute — or keep the mirror in a script [ \"file.ts\" ] module (plain bundled TypeScript, where such APIs are usable directly) and feed a Dataset from handlers",
    indexedDB: "persistence is not in the language yet — hold the state in a Dataset; a host can supply storage through an `external` attribute — or keep the mirror in a script [ \"file.ts\" ] module (plain bundled TypeScript, where such APIs are usable directly) and feed a Dataset from handlers",
    alert: "a Dialog, declared in the tree and shown by an attribute",
    confirm: "a Dialog, declared in the tree; its buttons' handlers are the answer",
    prompt: "a Dialog with a TextInput, declared in the tree",
    XMLHttpRequest: "a DataSource — its fetch() sends the request, and the screen derives from what it holds",
    WebSocket: "a Socket node — messages arrive as onMessage events",
    EventSource: "an EventStream node — messages arrive as onMessage events",
    performance: "for wall time inside a { }, a Time member's `now` (Date.now() only in a handler); for frame time, a Time's dt",
    process: "Node's, not the program's — a program runs in a browser or the mac host; configuration comes through a DataSource or an `external` attribute",
    require: "Node's — a program has no module loader; a script { } block holds helpers, and `import` is ruled but unbuilt (composition.md §2)",
    module: "Node's — a script { } block has no module scope to export from",
    Buffer: "Node's — binary data is an ArrayBuffer / Uint8Array",
    global: "there is no global object to reach for — state lives on nodes",
    __dirname: "Node's — a program has no file system; a relative url resolves against the program's directory",
    __filename: "Node's — a program has no file system",
};
/** The Declare answer for a host global, or null when the name is not one. */
export function hostGlobalHint(name) {
    return Object.hasOwn(HOST_GLOBAL_HINTS, name) ? HOST_GLOBAL_HINTS[name] : null;
}
//# sourceMappingURL=teach.js.map
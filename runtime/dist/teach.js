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
    color: "text color is 'textColor' (prevailing — set it on a container)",
    zIndex: "stacking is source order — later siblings draw above; there is no z-index",
    overflow: "clipping is 'clip = true'; scrolling is 'scrolls = y' (the axis enum)",
    display: "arrangement is the 'layout' attribute — 'layout: SimpleLayout [ axis = y, spacing = 8 ]'",
    flexDirection: "arrangement is the 'layout' attribute — 'axis = x' or 'axis = y'",
    justifyContent: "arrangement is the 'layout' attribute; fine placement is x/y constraints",
    alignItems: "arrangement is the 'layout' attribute; fine placement is x/y constraints",
    gap: "spacing rides the layout — 'layout: SimpleLayout [ axis = y, spacing = 8 ]'",
    margin: "there is no margin — position with x/y, a layout's spacing, or a wrapping View",
    padding: "there is no padding — inset children with x/y or an inner View",
    onChange: "the edit event is 'onInput()'",
    // CSS names for capabilities Declare HAS, reached through the wrong door:
    // These earn their place by the table's own rule — one true equivalent each
    // — and they matter because "no such attribute" ends the search at exactly
    // the wrong moment. (`rotation` graduated from this table 2026-08-06: it IS
    // a View attribute now — compositing.md Part II.)
    rotate: "rotation is the attribute — 'rotation = 45' (degrees, clockwise, about pivotX/pivotY); inside a drawing, d.rotate(rad)",
    transform: "there is no transform: position is x/y, size is width/height, 'scale' and 'rotation' transform about a pivot, and arbitrary geometry is a 'draw(d: Draw)' member",
    filter: "blur and friends are drawing ops — take a 'draw(d: Draw)' member and set d.filter; to blur what lies BENEATH the view, 'backdrop = frost(radius)'",
    blur: "blur is a drawing op — take a 'draw(d: Draw)' member and set d.filter = 'blur(4px)'; to blur what lies BENEATH the view, 'backdrop = frost(radius)'",
    mixBlendMode: "compositing is the 'blend' attribute — 'blend = multiply' lands this view with the operator; inside a drawing, d.globalCompositeOperation",
    backdropFilter: "the frost is 'backdrop = frost(radius, saturation)' — samples and blurs what lies beneath the view's own shape",
    mask: "masking is 'clip' — true for the box, or a path for an arbitrary shape",
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
    requestAnimationFrame: "motion is declared: a Spring (target → value) or an Animator (time → value); per-frame integration is Heartbeat [ onFrame(dt) ]",
    cancelAnimationFrame: "a Spring or Animator is interruptible by writing its target; a Heartbeat stops with `running = false`",
    setImmediate: "setTimeout(fn, 0)",
    getComputedStyle: "geometry is an attribute: x, y, width, height, bounds(), the visibleRect family — never a style query",
    matchMedia: "responsive choices derive from app.width (or a Responsive plan) and app.darkMode",
    localStorage: "persistence is not in the language yet — hold the state in a Dataset; a host can supply storage through an `external` attribute",
    sessionStorage: "persistence is not in the language yet — hold the state in a Dataset; a host can supply storage through an `external` attribute",
    indexedDB: "persistence is not in the language yet — hold the state in a Dataset; a host can supply storage through an `external` attribute",
    alert: "a Dialog, declared in the tree and shown by an attribute",
    confirm: "a Dialog, declared in the tree; its buttons' handlers are the answer",
    prompt: "a Dialog with a TextInput, declared in the tree",
    XMLHttpRequest: "a DataSource (declarative — the screen derives from it) or fetch (imperative)",
    WebSocket: "a Socket node — messages arrive as onMessage events",
    EventSource: "an EventStream node — messages arrive as onMessage events",
    performance: "for wall time, Date.now(); for frame time, a Heartbeat's dt",
    process: "Node's, not the program's — a program runs in a browser or the mac host; configuration comes through a DataSource or an `external` attribute",
    require: "Node's — a program has no module loader; a script { } block holds helpers, and `import` is ruled but unbuilt (composition.md §2)",
    module: "Node's — a script { } block has no module scope to export from",
    Buffer: "Node's — binary data is an ArrayBuffer / Uint8Array",
    global: "there is no global object to reach for — state lives on nodes; `globalThis` exists but is the host's, not the program's",
    __dirname: "Node's — a program has no file system; a relative url resolves against the program's directory",
    __filename: "Node's — a program has no file system",
};
/** The Declare answer for a host global, or null when the name is not one. */
export function hostGlobalHint(name) {
    return Object.hasOwn(HOST_GLOBAL_HINTS, name) ? HOST_GLOBAL_HINTS[name] : null;
}
//# sourceMappingURL=teach.js.map
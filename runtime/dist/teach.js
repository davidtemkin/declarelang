// The TEACH module — the one place the platform keeps what it says to a reader
// who reached for a name that is not there. Two front ends share it (the
// design: docs/system-design/doc-cli.md §4): the checker (check.ts), whose
// scope comes from the parse, and the doc CLI (tools/doc.mjs), whose scope is
// inferred from the query. One corpus, one scoring discipline — a hint string
// exists HERE and nowhere else, so the compiler and the lookup tool cannot
// drift apart. (Acceptance: zero duplicated hint strings in the tree.)
//
// `nearestName` itself stays in diagnostics.ts (it serves codes and classes
// too); this module re-exports it so a front end needs only one import.
import { nearestName } from "./diagnostics.js";
export { nearestName };
/** The CSS-interference table (E-1 escalation 2, diagnostics.md §4): a model
 *  (or a web developer) reaches for the CSS name; the miss should name the
 *  Declare slot, because "has no attribute" alone states the rule and not the
 *  fix. Evidence-driven — entries earn their place by appearing in eval
 *  failures or having one true equivalent; vague CSS concepts stay out. */
const FONT_FEATURES_HINT = "a face's features are Text's own attributes: 'numeralWidth = tabular' (tnum: digits of one width, for columns and counters that do not jitter), 'numerals = oldstyle' or 'lining' (onum, lnum), 'slashedZero = true' (zero), 'smallCaps = true' (smcp)";
const READONLY_HINT = "a value to read and select but not change is a Text with 'selectable = true' (a TextInput is for editing); 'disabled = true' dims a field and takes it out of Tab, and an 'admit(t)' that returns null refuses every change while the field stays live";
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
    alignItems: "arrangement is the 'layout' attribute; across the flow it is the layout's 'align' — start, center, end, baseline, or stretch (every child its content sizes as large as the largest)",
    gap: "spacing between arranged children rides the layout — 'layout: SimpleLayout [ axis = y, spacing = 8 ]'",
    margin: "there is no margin — space around a child is the PARENT's 'padding', a layout's 'spacing', or the child's own x/y",
    padding: "padding is the view's, not the layout's — 'View [ padding = 16, layout: SimpleLayout [ axis = y, spacing = 8 ] ]': it gives the view a content box that every child's x/y starts from (laid, self-placing or ignoreLayout alike) and that '100%' resolves against, while 'fill', 'stroke' and 'cornerRadius' stay on the full box; a Card brings one already",
    // (`onChange` left this table 2026-09-15: it IS a Declare event now — the
    // values a node names in `trackChanges`. The DOM instinct that arrives at it
    // meaning an input's edits is answered by the event's own prose, which names
    // `commit`, rather than by a table that would deny the name exists.)
    // CSS names for capabilities Declare HAS, reached through the wrong door:
    // These earn their place by the table's own rule — one true equivalent each
    // — and they matter because "no such attribute" ends the search at exactly
    // the wrong moment. (`rotation` graduated from this table 2026-08-06: it IS
    // a View attribute now — compositing.md Part II.)
    rotate: "rotation is the attribute — 'rotation = 45' (degrees, clockwise, about pivotX/pivotY); 'rotateX'/'rotateY' turn a view out of its plane under the parent's 'perspective'; inside a drawing, d.rotate(rad)",
    transform: "there is no transform list: position is x/y, size is width/height; 'scale', 'scaleX'/'scaleY', 'skewX'/'skewY', 'rotation', 'rotateX'/'rotateY'/'translateZ' transform about pivotX/pivotY (the parent's 'perspective' is the eye), and arbitrary geometry is a 'draw(d: DrawContext)' member",
    skew: "a shear is 'skewX = 20' / 'skewY = 20' (degrees, about pivotX/pivotY)",
    backfaceVisibility: "'backface = hidden' hides a view turned past 90° about X or Y",
    scaleX: "per-axis scale is 'scaleX' / 'scaleY' (multiplied with the uniform 'scale')",
    perspective: "'perspective = 700' on the PARENT is the eye its children's 'rotateX'/'rotateY'/'translateZ' are seen through (px; 0 = orthographic)",
    blur: "blur is a visual filter — 'visualFilter = blur(4)' blurs this view's own paint as a group (a list composes: 'visualFilter = [blur(4), brightness(0.8)]'); 'backdrop = blur(20)' blurs what lies BENEATH; inside a drawing, d.filter",
    dropShadow: "a shadow of the painted ALPHA is 'visualFilter = shadow(dx, dy, blur, color)' (the box's own shadow is the 'shadow' attribute; glyphs take 'textShadow')",
    // `filter` is also the name an earlier Declare gave the attribute; it is the
    // CSS name all the same, so it keeps the CSS label. It is free for a member
    // of a program's own — a list's filter, a filter() method — and this
    // answers only where nothing declares it.
    filter: "a view's own effects are 'visualFilter' — 'visualFilter = blur(4)' or a list, 'visualFilter = [grayscale(1), brightness(0.8)]', over its painted subtree as a group; 'backdrop' filters what lies beneath",
    mixBlendMode: "compositing is the 'blendMode' attribute — 'blendMode = multiply' lands this view with the operator; inside a drawing, d.globalCompositeOperation",
    blend: "compositing is the 'blendMode' attribute — 'blendMode = multiply' lands this view with the operator; inside a drawing, d.globalCompositeOperation",
    backdropFilter: "the frost is 'backdrop = frost(radius, saturation)' — or any filter list, 'backdrop = [blur(20), saturate(1.4)]' — sampled beneath the view's own shape",
    maskImage: "a soft mask is 'mask = gradient(…)' (its alpha over the box) or 'mask = { stencil }' (another view's painted alpha); a hard edge is 'clip' — true for the box, or a path",
    objectPosition: "where a contain/cover fit sits is 'alignX' / 'alignY' on the Image — start, center, end",
    // The 2026-08-08 foreign-reach audit (HTML/CSS · React · native-mobile, read against the
    // whole reference): the attribute-position instincts a newcomer actually
    // types, each with its one true equivalent. Question-shaped foreign names
    // (useState, VStack, ScrollView) live in the concept table instead —
    // they are asked, never written in an attribute position.
    flex: "there is no flex — arrangement is the 'layout' attribute; leftover space goes to a child with 'flexes = true' (an empty one is a 'Spacer'), or 'flexes = 2' for twice the share; 'shrinks = true' gives up room when the run is short; 'minWidth'/'maxWidth' bound what a layout gives",
    float: "there is no float — position with x/y, or let 'layout: WrappingLayout [ ]' flow and wrap children",
    position: "there is no position property — x/y place a view in its parent; 'ignoreScroll = true' is fixed chrome; 'ignoreLayout = true' opts out of arrangement; stacking is source order",
    visibility: "showing is 'visible' — a 'visible = false' view stays in the tree but paints nothing, and a layout reclaims its space",
    whiteSpace: "wrapping is Text's 'wrap' — 'wrap = false' is the nowrap; 'maxLines = 1' keeps one line that ends in an ellipsis where it would run past its width",
    textOverflow: "the ellipsis is 'maxLines' — 'maxLines = 1' keeps one line, ending in an ellipsis that fits the width; 'maxLines = 2' clamps a preview to two",
    transition: "there is no transition — motion is declared beside the attribute: an 'Animator' (timed), a 'Spring' (live target), or a 'State' for a bundle that snaps with motion",
    animation: "there is no animation property — motion is a member: an 'Animator' (timed, from→to), a 'Spring' (chases a live target), an 'AnimatorGroup' (sequence)",
    keyframes: "there are no keyframes — an 'Animator' drives one attribute from→to through a motion curve; sequence several with 'AnimatorGroup'",
    fontStyle: "italics are Text's 'italic = true'",
    fontVariantNumeric: "figures are Text's own attributes: 'numeralWidth = tabular' (digits of one width, for columns and counters that do not jitter) or 'proportional', 'numerals = oldstyle' or 'lining', 'slashedZero = true'",
    fontFeatureSettings: FONT_FEATURES_HINT,
    fontFeatures: FONT_FEATURES_HINT,
    // `blend`, `stretches` and `outline` are also names an earlier Declare used
    // (see MEMBER_HINTS) — each answered with the attribute that holds it now.
    objectFit: "image fitting is 'fit' on an Image or Video — 'cover' fills and crops, 'contain' letterboxes",
    stretches: "image fitting is 'fit' on an Image or Video — 'cover' fills and crops, 'contain' letterboxes, 'both' stretches to the box",
    outline: "a stroke along the glyphs' edges is Text's 'textStroke = stroke(1, #C0392B)', painted under the fill; a box's edge is 'stroke', drawn inside the box",
    webkitTextStroke: "a stroke along the glyphs' edges is Text's 'textStroke = stroke(1, #C0392B)', painted under the fill",
    // `onDblClick` and `motion` are names an earlier Declare used (see MEMBER_HINTS),
    // answered where they are written; `ondblclick` (the DOM's spelling) routes here too.
    onDblClick: "the double-click event is 'onDoubleClick' — 'onDoubleClick(e: PointerEvent) { … }'; the first click still reaches onClick at once",
    // React's reconciliation prop, written where a replicated row is used. Free
    // for a member of a program's own — this answers only where nothing declares
    // it (and check.ts names the field on a replicated node).
    key: "a replicated record's identity is its 'id' field, with nothing declared; when it lives under another name, 'identityKey = :field' beside the many-path datapath names it",
    motion: "an Animator's curve is 'easing' — 'easing = cubicOut' (a token, or cubicBezier(…), back(…), steps(…), laszlo(…)); a scroll glide takes it too, '{ duration: 260, easing: \"cubicOut\" }'",
    // a field to read, not edit (HTML's, AppKit's and UIKit's readOnly)
    readOnly: READONLY_HINT,
    // the ring set per view, as if each control drew its own
    focusRing: "the focus ring is the app's one FocusRing, not a view's attribute: the theme's 'focusRingStyle' chooses how it shows (\"both\", \"travel\", \"rest\", or false for none), and it rings the focused control's focusShape(), which a control overrides to ring a part of itself",
};
/** The MEMBER instincts: names a newcomer reads or calls on a node, from the
 *  frameworks they arrive from, each with its one true equivalent. Kept to the
 *  cases where TypeScript's own nearest name would mislead (`scrolling` is
 *  nearest to `scrolls`, a word list that is always truthy) or where there is
 *  no near name at all (the DOM's tree verbs). Like the attribute table, it
 *  keys on what a newcomer brings — with one exception, ruled with the paint
 *  renames: the names an earlier Declare used (`blend`, `outline`, `stretches`,
 *  `onDblClick`, `motion`, `navigate`, `openFor`, `openAt`) are answered here and, where they are
 *  written as attributes, in the attribute table, so an author or a
 *  model trained on them gets the current name. The hint says what IS. */
const RM_HINT = "the person's reduced-motion preference is the App's accessibilitySettings.reduceMotion — read as provided(\"accessibilitySettings\").reduceMotion below the App; live, from the platform's setting (prefers-reduced-motion on the web)";
const LEAVE_HINT = "whether the pointer is over a view, its children included, is the fact 'hovered' — read it in a constraint ('fill = { hovered ? … : … }'), and it turns false when the pointer leaves; the moment of leaving is 'onPointerOut', which belongs to the topmost view under the pointer (moving onto a child leaves its parent)";
const ENTER_HINT = "whether the pointer is over a view, its children included, is the fact 'hovered' — read it in a constraint ('fill = { hovered ? … : … }'); the moment of entering is 'onPointerOver', which belongs to the topmost view under the pointer";
export const MEMBER_HINTS = {
    scrolling: "the user's scroll in progress is 'userScrolling' — true while a finger, wheel, key or scrollbar moves this scroller, through its momentum; your own scrollTo() leaves it false",
    isScrolling: "the user's scroll in progress is 'userScrolling' — true while a finger, wheel, key or scrollbar moves this scroller, through its momentum; your own scrollTo() leaves it false",
    isHovered: "the pointer over a view is 'hovered'; a hovering pointer anywhere over the app is app.pointerHovering",
    // the DOM's enter/leave pair: Declare's moments are over/out, and a region's hover is a fact
    onPointerLeave: LEAVE_HINT,
    onMouseLeave: LEAVE_HINT,
    onPointerEnter: ENTER_HINT,
    onMouseEnter: ENTER_HINT,
    // the web's media-query name for the preference, and the slip one letter off it
    reducedMotion: RM_HINT,
    prefersReducedMotion: RM_HINT,
    isTouchDevice: "a device built for touch (a phone or tablet) is app.touchFirst; any touchscreen at all is app.hasTouch; a mouse or trackpad is app.hasMouse",
    appendChild: "a view is made in place with createView(tag, props) on its parent, ordered with raise(below), and destroyed with discard(); for a list, declare one child and let the data replicate it",
    insertBefore: "a view is made in place with createView(tag, props) on its parent and ordered with raise(below); for a list, declare one child and let the data replicate it",
    removeChild: "a view leaves with discard(); a replicated one leaves when its record does",
    root: "the top of the tree is 'app', which every body can read; a class's own top is 'classroot'",
    // form instincts (React Hook Form, Formik, HTML)
    onInput: "the person's change to a field, or to any control with a value, reaches 'commit(v)'; when it goes straight back to where the value came from, 'value <-> place' says it once ('checked <-> place' on a Checkbox or Switch)",
    onSubmit: "a Form's submit hook is send(): submit() runs it when nothing is wrong, and by default it sends the form's source",
    handleSubmit: "a Form submits with submit(): it judges every field, shows what is wrong, and calls send() when nothing is",
    setError: "a field takes an outside message with refuse(message); a Form lays a service's problems on its fields with refuse(problems)",
    touched: "whether a field has been judged (left, judge()d, or submitted) is 'judged'",
    isValid: "whether a field or a Form has nothing wrong is 'valid'; what is wrong now is 'problem' (a Form's: 'problems')",
    // paint names an author may carry from an earlier Declare, read in a body
    // (the attribute table above answers them where they are written)
    blend: "a view's compositing operator is 'blendMode' ('multiply', 'screen', … or 'normal')",
    stretches: "how an Image or Video fits its box is 'fit' ('cover', 'contain', 'both', …)",
    outline: "a Text's glyph stroke is 'textStroke', a stroke(width, color) or null",
    // names an earlier Declare used for an event, an attribute and a method, met in a body
    onDblClick: "the double-click event is 'onDoubleClick'",
    motion: "the curve an Animator or AnimatorGroup follows is 'easing' (a token like 'cubicOut', or cubicBezier(…)); a scroll glide names it too — scrollTo(y, { duration: 260, easing: \"cubicOut\" })",
    navigate: "leaving the app for another address is app.openURL(to) (app.openWindow(to) for a window of its own); moving within the app is a write to app.location",
    // a menu's verbs an earlier Declare used: every overlay opens with show(), showFor(v), showAt(v, e)
    openFor: "a menu opens below a view with showFor(v) — the overlays' one verb (show(), showFor(v), showAt(v, e)); it flips above when there is no room below",
    openAt: "a menu opens at the pointer with showAt(v, e) — the overlays' one verb (show(), showFor(v), showAt(v, e)); a ContextMenu's serving view calls it from onContextMenu and onHold",
};
/** Delivery hooks an earlier Declare named otherwise — the person's request
 *  lands in the hook, its default carries it out, and an override changes how.
 *  A method under the old name, on a class whose chain has the new hook, is an
 *  ordinary method nothing calls (DECLARE4042 says so); `input` → `commit` is
 *  the first of them. */
export const FORMER_HOOKS = {
    input: "commit",
    sortInput: "applySort",
    arrangeInput: "applyColumnOrder",
    resizeInput: "applyColumnWidth",
    editInput: "applyEdit",
    expandInput: "applyExpanded",
};
/** One answer for the other platforms' line caps on a field (below). */
const FIELD_CAP = "a 'multiline' field is as tall as its text; cap it as any box is capped, 'height = { Math.min(contentHeight, 120) }', and past that it scrolls";
/** One answer for two of Menu's former metrics (below). */
const MENU_METRICS = "the menu's column metrics are its own — a 'kind' row's content already begins at the text edge";
/** Members an earlier Declare named otherwise — and a few another platform
 *  names on that class (a field's line cap) — answered on the class that had
 *  them and every class built on it — never elsewhere, where the old name is
 *  an ordinary name an app may declare (`selected` is a row's boolean,
 *  `choices` a quiz's list, `filter` a list's or a method). Keyed by the class
 *  that had the member; the checker walks the class chain to find it. The
 *  hint says what IS. */
export const RENAMED_CLASS_MEMBERS = {
    View: {
        filter: "a view's own visual effects are 'visualFilter' — one function or a list, 'visualFilter = [blur(4), brightness(0.8)]', over its painted subtree as a group",
    },
    Segmented: {
        choices: "the segments are 'items' — records { id, label } or { id, icon }, as a Menu's items are",
        segMin: "the per-segment width used when the control sets no width is 'segmentMinWidth'",
        // made internal: each answer names what the program reads instead
        count: "how many segments there are is items.length — the count the control divides its width by is its own",
        idx: "the chosen segment is 'value' — its index into items is the control's own",
        lane: "the pill's sprung place is the control's own — the chosen segment is 'value'",
        segW: "one segment's width is the control's own arithmetic — its width divided by items.length",
    },
    HTMLText: {
        text: "an HTMLText's content is 'html' — the markup it shows ('html = { \"<b>\" + escapeHtml(name) + \"</b>\" }'); plain text is a Text's 'text'",
    },
    Control: {
        rightIcon: "the trailing icon slot is 'iconRight' — which icon the control settles on (it, or the chevron a 'menu' implies) is its own",
    },
    Menu: {
        checkW: MENU_METRICS,
        textEdge: MENU_METRICS,
        widestLabel: "the menu's width follows its rows by itself; 'minWidth' floors it and a 'width' of your own overrides it",
    },
    Table: {
        selected: "the primary selected record is 'selectedItem' (a TableRow's own 'selected' is the boolean); every selected record is 'selection'",
        active: "the record the keyboard stands on is 'activeItem', beside its index 'activeIndex' (a TableRow's own 'active' is the boolean)",
    },
    DataGrid: {
        headerH: "the header row's height is 'headerHeight'",
        sortInput: "a sort the person asks for lands in applySort(column, direction) — its default writes sortOn and sortDir; override it to own the sort",
        arrangeInput: "a column order the person drags lands in applyColumnOrder(order) — its default writes 'order'",
        resizeInput: "a column width the person drags lands in applyColumnWidth(column, width) — its default writes 'widths'",
        editInput: "an edited cell's text lands in applyEdit(record, field, value) — its default lets it write; return false to keep the record as it was",
    },
    Tree: {
        expandInput: "rows the person opens and closes land in applyExpanded(ids) — its default writes 'expanded'",
    },
    Button: {
        inkColor: "the button's one ink, for its label and its icons, is 'ink'",
    },
    TextInput: {
        maxLines: FIELD_CAP,
        maxRows: FIELD_CAP,
        rows: FIELD_CAP,
    },
};
/** The renamed-member hint for `name` on a class whose chain (the class first,
 *  then each base) is `chain`, or "". */
export function renamedClassMember(chain, name) {
    for (const c of chain) {
        const t = Object.hasOwn(RENAMED_CLASS_MEMBERS, c) ? RENAMED_CLASS_MEMBERS[c] : undefined;
        if (t !== undefined && Object.hasOwn(t, name))
            return t[name];
    }
    return "";
}
/** The member-instinct hint for a name read on a node, or "". */
export function memberHint(name) {
    return Object.hasOwn(MEMBER_HINTS, name) ? MEMBER_HINTS[name] : "";
}
/** The keys of CSS_ATTRIBUTE_HINTS that are names an earlier Declare used, not
 *  CSS's: their hint says what holds the thing now, without the CSS label. */
export const FORMER_DECLARE_NAMES = new Set(["blend", "stretches", "outline", "onDblClick", "motion"]);
/** The keys of CSS_ATTRIBUTE_HINTS that are React's, not CSS's: labelled as
 *  React's instinct. (`key` is also the name an earlier Declare used.) */
export const REACT_NAMES = new Set(["key"]);
/** The keys of CSS_ATTRIBUTE_HINTS that are HTML's (and the platforms') field
 *  attributes, not CSS's. */
export const HTML_NAMES = new Set(["readOnly"]);
/** The keys of CSS_ATTRIBUTE_HINTS that are Flutter's, not CSS's. */
export const FLUTTER_NAMES = new Set(["fontFeatures"]);
/** The keys of CSS_ATTRIBUTE_HINTS that no platform names: a guess at what
 *  Declare would call the thing. Answered without a label. */
export const GUESSED_NAMES = new Set(["focusRing"]);
/** The hint for an unknown attribute name, or "" when the miss is neither a
 *  known foreign name nor a former Declare one. A CSS name is labelled as the
 *  CSS instinct and a React name as React's; a former Declare name is neither,
 *  so it carries no label. */
export function cssAttributeHint(name) {
    const h = Object.hasOwn(CSS_ATTRIBUTE_HINTS, name) ? CSS_ATTRIBUTE_HINTS[name] : "";
    if (!h)
        return "";
    if (FORMER_DECLARE_NAMES.has(name) || GUESSED_NAMES.has(name))
        return ` — ${h}`;
    return REACT_NAMES.has(name) ? ` — the React instinct: ${h}` : HTML_NAMES.has(name) ? ` — the HTML instinct: ${h}` : FLUTTER_NAMES.has(name) ? ` — the Flutter instinct: ${h}` : ` — the CSS instinct: ${h}`;
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
    // React's `key` is written whole or not at all: `keyed` and `keyId` are names
    // of the program's own, not a reach for record identity
    return name.length >= 5 ? nearestName(name, Object.keys(CSS_ATTRIBUTE_HINTS).filter((k) => !REACT_NAMES.has(k))) : null;
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
    window: "there is no window — the App fills its host, so the page's size is app.width / app.height, and host facts (app.pageVisible, app.systemDark) are attributes",
    innerWidth: "the page's width is app.width (the App fills its host)",
    innerHeight: "the page's height is app.height (the App fills its host)",
    screen: "the page's size is app.width / app.height; pixel density is the renderer's concern, not the program's",
    devicePixelRatio: "pixel density is the renderer's concern, not the program's — draw in points",
    document: "there is no document — the tree IS the program: reach a node by its name (app.sidebar.list), never by a query",
    navigator: "host facts are attributes (app.pageVisible, app.systemDark, app.width); a capability the language lacks is declared `external` and supplied by the host",
    location: "the URL's fragment is app.location — write it to move within the app; a view with `link = …` is a link, and app.openURL(to) leaves the app for another address",
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
    matchMedia: "responsive choices derive from app.width (or a Responsive plan) and app.systemDark",
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
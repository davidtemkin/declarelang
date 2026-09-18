// The runtime services usable INSIDE `{ }` bodies — `Focus.focus(this)` in a
// click handler, `Keys.isDown("Shift")` in a constraint, `SanFrancisco`
// in a style. Injecting them is a SIDE EFFECT, and this module exists to be
// the smallest thing that carries it.
//
// It was inline at the bottom of index.ts, which made index.ts the only way to
// get it — so the production entry imported the whole barrel for these nine
// lines. A barrel re-export can only be dropped when the module behind it is
// side-effect-free, and most of this runtime is not (a `defineAttributes` call
// at module top level is a side effect), so importing index.js pinned modules
// the program could not reach: `image.js` and `text-input.js` shipped in a
// hello-world even though slim-registry had correctly excluded Image and
// TextInput from the tag tables. The registry did its job and a second door
// undid it.
//
// Split out, the production entry imports THIS and the four modules it really
// needs; index.ts imports it too, so the dev path and every embedder behave
// exactly as before. Nothing here is exported on purpose: the module IS the
// effect, and `import "./services.js"` is the whole interface.
//
// Ordering note: this sits above expr.ts and the four services in the module
// graph — which is why the wiring lived in index.ts originally, and why it can
// live here now without a cycle.
import { setBodyServices } from "./expr.js";
import { setKeysFocusProbe, Keys } from "./keys.js";
import { THEME_PRESETS, activeTone } from "./themes.js";
import { Focus } from "./focus.js";
import { Inspect } from "./inspect-service.js";
import { afterSettle } from "./reactive.js";
import { measureText } from "./text-measure.js";
// escapeHtml — the one string chore rich text needs and no host global covers.
// Content assembled by concatenation (`html = { "<Person name='" + app.me +
// "'/>" }`) must not let a value's own `<` or `'` become markup, and a tag in
// rich-text content can name a program class, so an injected `<` is a view, not
// just wrong text. Five lines and unconditional: it lives HERE rather than in a
// module of its own because services.js is the production entry's one import, so
// there is nothing for a slimming fact to gate — the function ships either way,
// and a fact would only be a second thing to keep in step.
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}
// The theme presets are in scope inside every `{ }` body by name (a bare
// `SanFrancisco` / `CupertinoDark` is the record), alongside `activeTone`. afterSettle
// is a FUNCTION, not a service object — the one body-scope name that is a verb:
// "finish after your change has taken effect" (language §7). `measureText` is a
// pure function of what it is given (text-measure.ts), and `escapeHtml` above is
// another.
setBodyServices({ Focus, Keys, Inspect, afterSettle, activeTone, measureText, escapeHtml, ...THEME_PRESETS });
setKeysFocusProbe(() => Focus.getFocus() !== null);
//# sourceMappingURL=services.js.map
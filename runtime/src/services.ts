// The runtime services usable INSIDE `{ }` bodies — `Focus.focus(this)` in a
// click handler, `Keys.isDown("Shift")` in a constraint, `Themes.SanFrancisco`
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
import { Themes } from "./themes.js";
import { Focus } from "./focus.js";
import { Inspect } from "./inspect-service.js";

setBodyServices({ Focus, Keys, Themes, Inspect });
setKeysFocusProbe(() => Focus.getFocus() !== null);

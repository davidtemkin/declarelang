// The CSS applier (rewired from feat/css-engine's css-apply onto the public
// seams): one per-view Constraint (via onEachView) that matches a global
// RuleSet by component type, coerces the cascade, and installs it below author
// via the provision tier — plus force-input-sink for :hover/:active targets.
import { Constraint } from "../../../runtime/dist/reactive.js";
import { onEachView, provide, withdraw, isProvided, Pointer } from "../../../runtime/dist/index.js";
import { Focus } from "../../../runtime/dist/focus.js";
import { matched, matches, containsPointerPseudo } from "./css-match.js";
import { coerceDecls } from "./css-props.js";
import { makeInteractionTracker } from "./css-interaction.js";
const TAG_CHAINS = new WeakMap();
function classNames(ctor) {
    const cached = TAG_CHAINS.get(ctor);
    if (cached !== undefined)
        return cached;
    const names = [];
    let c = ctor;
    while (c && c !== Function.prototype && c.name) {
        names.push(c.name);
        c = Object.getPrototypeOf(c);
    }
    TAG_CHAINS.set(ctor, names);
    return names;
}
const CSS_TOKEN = {}; // sentinel identity for forceInputSink
/** Install a global RuleSet as per-view CSS. Returns a disposer. */
export function installCss(ruleSet) {
    const tracker = makeInteractionTracker(Pointer, Focus);
    const offered = new WeakMap();
    const asMatchView = (v) => ({
        get tagChain() { return classNames(v.constructor); },
        id: "",
        styleclass: "",
        attr: (name) => v[name],
        pseudo: (name) => tracker.pseudo(v, name),
        get parent() { return v.parent != null ? asMatchView(v.parent) : null; },
    });
    const off = onEachView((view) => {
        const c = new Constraint(`css@${view.constructor.name}`, () => {
            const mv = asMatchView(view);
            const coerced = coerceDecls(matched(mv, ruleSet));
            const rec = offered.get(view);
            const offers = Object.create(null);
            for (const [attr, value] of coerced) {
                void view[attr]; // tracked provision probe
                if (isProvided(view, attr) && !(rec?.has(attr) ?? false))
                    continue; // yield to author/stylesheet/other plugins
                offers[attr] = value;
            }
            const tracked = ruleSet.rules.some((r) => containsPointerPseudo(r.selector) && matches(mv, r.selector, true));
            return { offers, tracked };
        }, (value) => {
            const { offers, tracked } = value;
            view.forceInputSink(CSS_TOKEN, tracked);
            const rec = offered.get(view) ?? new Set();
            for (const attr of [...rec])
                if (!(attr in offers)) {
                    withdraw(view, attr);
                    rec.delete(attr);
                }
            for (const attr in offers) {
                provide(view, attr, offers[attr]);
                rec.add(attr);
            }
            offered.set(view, rec);
        }, 0);
        c.run();
        return () => {
            c.dispose();
            const rec = offered.get(view);
            if (rec !== undefined) {
                for (const attr of rec)
                    withdraw(view, attr);
                offered.delete(view);
            }
            view.forceInputSink(CSS_TOKEN, false);
        };
    });
    return () => { off(); tracker.dispose(); };
}
//# sourceMappingURL=css-apply.js.map
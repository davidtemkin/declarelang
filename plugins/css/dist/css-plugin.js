// The css { … } block plugin (Increment 3, 3d): author-facing CSS syntax on the
// block seam (#7). parse the block, type-check it at compile time (positioned
// errors), and at instantiate install a per-view applier for its rules, disposed
// on app discard. Ties 3a–3c to the runtime with zero CSS in core.
import { onDiscard, DeclareError } from "../../../runtime/dist/index.js";
import { parseCss, CssUnsupported } from "./css-parse.js";
import { buildRuleSet } from "./css-match.js";
import { PROP_MAP } from "./css-props.js";
import { installCss } from "./css-apply.js";
export const cssPlugin = {
    name: "css",
    // Register the selector-identity attributes (seam 4) so `.class` / `#id`
    // selectors have author-declarable per-view identifiers.
    attrs: [
        { on: "View", name: "styleclass", def: "" },
        { on: "View", name: "id", def: "" },
    ],
    blocks: [
        {
            keyword: "css",
            bodyKind: "code",
            parse(p) {
                p.expect("ident", "'css'");
                const name = p.expect("ident", "the css block's name");
                const body = p.expect("code", "a { … } css body");
                return {
                    kind: "css",
                    keyword: "css",
                    name: name.text,
                    text: body.str ?? "",
                    bodyOffset: body.pos.offset + 1,
                    pos: name.pos,
                };
            },
            check(node, ctx) {
                const errors = [];
                if (ctx.nameTaken(node.name)) {
                    errors.push(new DeclareError(`css '${node.name}' collides with an existing declaration`, node.pos));
                }
                let rules;
                try {
                    rules = parseCss(node.text);
                }
                catch (e) {
                    if (e instanceof CssUnsupported) {
                        errors.push(new DeclareError(e.message, ctx.posAt(node.bodyOffset + (e.offset ?? 0))));
                        return errors;
                    }
                    throw e;
                }
                for (const r of rules) {
                    for (const [prop, raw] of r.decls) {
                        const at = r.declPos.get(prop);
                        const entry = PROP_MAP[prop];
                        if (entry === undefined) {
                            errors.push(new DeclareError(`unknown CSS property '${prop}'`, ctx.posAt(node.bodyOffset + (at?.namePos ?? 0))));
                        }
                        else if (entry.coerce(raw) === undefined) {
                            errors.push(new DeclareError(`'${raw}' is not a valid value for CSS '${prop}'`, ctx.posAt(node.bodyOffset + (at?.valuePos ?? 0))));
                        }
                    }
                }
                return errors;
            },
            instantiate(node, ctx) {
                const off = installCss(buildRuleSet(node.text));
                onDiscard(ctx.root, off);
            },
        },
    ],
};
//# sourceMappingURL=css-plugin.js.map
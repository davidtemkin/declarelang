// headless — execute a compiled program to its t=0 snapshot WITHOUT a page
// (design/capabilities.md §4). Real execution on the real runtime: build()
// (parse + check + instantiate), attach to the HeadlessBackend, write the
// ENVIRONMENT VECTOR explicitly (a browser fills it implicitly; headless makes
// it a parameter), settle(). Initialization only — constraints, replication,
// layout, state application all run; handlers, timers, and live network do
// not. The same execution tier as the unit suite, prebuild, and verify rung 4.
//
// Browser-safe by construction (the runtime graph is zero-dep), so the browser
// compiler can do everything the Node one can — the parity principle.
import { build, settle, App, HeadlessBackend, provideMeasurer } from "../../runtime/dist/index.js";
export const DEFAULT_ENV = { hostWidth: 1200, hostHeight: 800, dark: false };
/** A deterministic stand-in for canvas text metrics on hosts with no DOM —
 *  per-character class widths, one constant table. Enough to SETTLE any tree
 *  (auto-extents, wraps, flows all compute); geometry is approximate, and only
 *  geometry-derived content could shift vs a browser. Same inputs, same
 *  numbers, every host — determinism is the contract here, fidelity is the
 *  injectable upgrade (Environment.measurer). */
export function approximateMeasurer() {
    let size = 16;
    let mono = false;
    let spacing = 0;
    const charWidth = (ch) => {
        if (mono)
            return 0.6;
        const c = ch.codePointAt(0) ?? 0;
        if (c >= 0x2e80)
            return 1.0; // CJK and wide blocks
        if ("mwMW@%".includes(ch))
            return 0.85;
        if (" fijlrt.,:;!'\"`|()[]{}".includes(ch))
            return 0.31;
        if (ch >= "A" && ch <= "Z")
            return 0.68;
        if (ch >= "0" && ch <= "9")
            return 0.56;
        return 0.52;
    };
    const stub = {
        set font(f) {
            const m = /(\d+(?:\.\d+)?)px/.exec(f);
            size = m ? parseFloat(m[1]) : 16;
            mono = /mono|courier|consolas|menlo/i.test(f);
        },
        set letterSpacing(v) {
            spacing = parseFloat(v) || 0;
        },
        measureText(text) {
            let w = 0;
            for (const ch of text)
                w += charWidth(ch);
            return {
                width: w * size + spacing * [...text].length,
                fontBoundingBoxAscent: 0.8 * size,
                fontBoundingBoxDescent: 0.25 * size,
            };
        },
    };
    return stub;
}
/** Build and settle a program headlessly; returns the settled App. The input
 *  is a compile()'s output source (scope-resolved, one self-contained file)
 *  with its extracted `deps` — or any source whose bodies use explicit paths.
 *  Callers walk the tree, then `app.discard()`. */
export function settleHeadless(source, opts = {}) {
    const env = { ...DEFAULT_ENV, ...opts.env };
    if (opts.env?.measurer !== undefined)
        provideMeasurer(opts.env.measurer);
    else if (typeof document === "undefined")
        provideMeasurer(approximateMeasurer());
    const app = build(source, opts);
    app.attach(new HeadlessBackend(), null);
    app.hostWidth = env.hostWidth;
    app.hostHeight = env.hostHeight;
    app.dark = env.dark;
    settle();
    return app;
}
//# sourceMappingURL=headless.js.map
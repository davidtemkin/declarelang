// The CSS parser: CSS text → typed Rule[]. A faithful port of OpenLaszlo 5's
// compiler/src/css.ts selector tokenizing + specificity, EXTENDED to emit
// compound condition chains (`.red.green`, `view.red`) as a typed AST, and
// DEVIATING deliberately in one way: values are stored as raw trimmed strings
// (RawValue) — all folding (hex/rgb/named/px → number) is the coercers' job
// (css-coerce.ts), never the parser's. Unsupported surface (`!important`,
// `>`/`+`/`~`, pseudo-classes) is rejected cleanly for the checker (M5).
export class CssUnsupported extends Error {
    constructor(message) {
        super(message);
        this.name = "CssUnsupported";
    }
}
/** Specificity = sum over every condition: id 100, class/attr 10, tag 1, * 0. */
export function specificityOf(sel) {
    let s = 0;
    for (const simple of sel) {
        for (const c of simple.conditions) {
            s += c.kind === "id" ? 100 : c.kind === "tag" ? 1 : 10;
        }
    }
    return s;
}
//# sourceMappingURL=css-parse.js.map
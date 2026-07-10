// typecheck — the tsc-over-{ }-bodies phase (APPROACH §5). The scaffold
// (scaffold.ts) turns the component schemas into an ambient TypeScript surface;
// this module appends a CHECK-BLOCK per resolved `{ }` body and runs stock tsc
// over the whole, then maps each TS diagnostic back to a `.declare` LINE through
// the diagnostics mechanism (diagnostics.ts, code NEO6001). Node-only (it
// imports `typescript` and reads the real lib.d.ts from disk), so it lives on
// the compile front-end, never in the zero-dependency runtime.
//
// The check-block SHAPE (scaffold.ts documents it): a resolved body has had its
// bare names rewritten to `this.slot` / `parent.…` / `classroot.…` (compile.ts),
// so each pronoun is typed as the function's `this` and two params:
//
//     const _cN: <SlotTsType> = (function (this: <Self>, parent: <Parent>, classroot: <Root>) {
//       return ( <resolved expression body> );
//     }).call(inst, inst, inst);
//
//   • `this: <Self>` — the element the body is written on: its whole inherited
//     slot set is in scope, so `this.openHeightX` is a TS2339.
//   • `: <SlotTsType>` — the slot's declared type: a boolean flowing into a
//     Length slot is a TS2322 across the [ ]/{ } seam (the whole point).
//   • `parent` / `classroot` — the enclosing element and the body root, typed
//     from the tree (immediate parent precise; deeper `parent.parent` rides
//     View). A method (statement) body drops the `return (…)` and slot type.
//   • `.call(inst, …)` — RELIES on strictBindCallApply (tsconfig `strict`) to
//     type the return against the slot and check the pronouns.
//
// LINE MAPPING. Scope resolution only splices identifiers INLINE — it never
// adds or removes a newline — so a resolved body has the same line structure as
// the source. Each check-block reproduces the body's lines verbatim, so a TS
// diagnostic's line within a block maps to (block's original start line + the
// offset within the block). v1 reports at LINE granularity (what APPROACH asks).
//
// v1 SCOPE: bodies that embed a datapath island (`:path`) are skipped — `:path`
// is neo surface the runtime rewrites (expr.ts), not TypeScript; typechecking
// data reads is a later slice. All other `{ }` bodies (attribute expressions,
// declaration-default bindings, method statements) are checked.
import path from "node:path";
import { createRequire } from "node:module";
import { parseProgram } from "../../runtime/dist/parser.js";
import { programSchemas } from "../../runtime/dist/check.js";
import { generateScaffold, tsType } from "./scaffold.js";
import { attrType } from "../../runtime/dist/schema.js";
import { fillDatapaths } from "../../runtime/dist/datapath.js";
import { Diag } from "../../runtime/dist/diagnostics.js";
import { NeoError } from "../../runtime/dist/errors.js";
const require = createRequire(import.meta.url);
// The real lib.*.d.ts sit beside typescript.js — read from disk so
// strictBindCallApply and the standard library are in scope.
const LIB_DIR = path.dirname(require.resolve("typescript"));
/** Typecheck every resolved `{ }` body in `resolved` (compile()'s output — a
 *  self-contained program whose bare names are already paths). Returns coded
 *  NEO6001 diagnostics (empty when clean). Never throws on TS internals: a
 *  body that cannot be framed is skipped, not failed. */
export function typecheckBodies(resolved, program) {
    const { schemas } = programSchemas(program.classes);
    const scaffold = generateScaffold(schemas, program.classes);
    let rprog;
    try {
        rprog = parseProgram(resolved);
    }
    catch {
        return []; // resolved is our own output — if it will not re-parse, skip typecheck
    }
    const emitter = new CaseEmitter(schemas);
    for (const cls of rprog.classes)
        emitter.walkElement(cls.body, []);
    emitter.walkElement(rprog.root, []);
    if (emitter.units.length === 0)
        return [];
    const diags = runTsc(scaffold, emitter.caseSrc);
    const starts = lineStarts(resolved);
    const out = [];
    for (const d of diags) {
        const u = emitter.unitAt(d.line);
        if (u === null)
            continue; // a diagnostic outside any body (scaffold-level — shouldn't occur)
        // Clamp into the body's line range: an assignment error on the wrapper line
        // maps to the body's first line; a body-internal error maps line-for-line.
        const rel = Math.min(Math.max(d.line - u.bodyStart, 0), u.lineCount - 1);
        out.push(Diag.typeError(d.message, posOfLine(u.origStartLine + rel, starts), d.code));
    }
    return out;
}
/** Emits the case.ts (scaffold-relative) check-blocks and records each one's
 *  line footprint. Walks the tree with an innermost-first ancestor stack so a
 *  body's `parent` (the enclosing element) and `classroot` (the body root) get
 *  their real types. */
class CaseEmitter {
    schemas;
    units = [];
    lines = [];
    counter = 0;
    constructor(schemas) {
        this.schemas = schemas;
    }
    get caseSrc() {
        return this.lines.join("\n");
    }
    walkElement(el, ancestors) {
        const levels = [el, ...ancestors];
        for (const a of el.attrs) {
            if (a.value.kind === "code")
                this.emit(a.value.src, a.value.pos, a.name, levels, true);
        }
        for (const d of el.decls) {
            if (d.def?.kind === "code")
                this.emit(d.def.src, d.def.pos, d.name, levels, true);
        }
        for (const m of el.methods)
            this.emit(m.body, m.bodyPos, null, levels, false);
        for (const child of el.children)
            this.walkElement(child, levels);
    }
    /** `slot` is the attribute/declaration name (for its slot type) or null for a
     *  method. `brace` is the `{` position; the body starts on its line. */
    emit(src, brace, slot, levels, expression) {
        // v1: skip a body that embeds a datapath island (neutralizing it is a later
        // slice) — `:path` is not TypeScript.
        if (fillDatapaths(src) !== src)
            return;
        const self = levels[0].tag;
        const parent = levels.length > 1 ? levels[1].tag : "null";
        const root = levels[levels.length - 1].tag;
        const inst = (t) => `(undefined as unknown as ${t})`;
        const header = `(function (this: ${self}, parent: ${parent}, classroot: ${root}) {`;
        const footer = `}).call(${inst(self)}, ${inst(parent)}, ${inst(root)});`;
        // Emit the body verbatim across its own lines, so a diagnostic line maps
        // straight back. The body opens on `brace.line` (just after `{`).
        const bodyLines = src.split("\n");
        const id = `_c${this.counter++}`;
        const blockStart = this.lines.length + 1;
        let bodyStart;
        if (expression) {
            const slotTs = slot !== null ? tsSlotType(this.schemas, self, slot) : "unknown";
            // `const _cN: T = (function(){ return (` … body lines … `); }).call(…);`
            this.lines.push(`const ${id}: ${slotTs} = ${header} return (`);
            bodyStart = this.lines.length + 1;
            this.lines.push(...bodyLines);
            this.lines.push(`); ${footer}`);
        }
        else {
            this.lines.push(`${header}`);
            bodyStart = this.lines.length + 1;
            this.lines.push(...bodyLines);
            this.lines.push(footer);
        }
        this.units.push({
            blockStart,
            blockEnd: this.lines.length,
            bodyStart,
            origStartLine: brace.line,
            lineCount: bodyLines.length,
        });
    }
    /** The block whose case-file span contains `line`, or null. */
    unitAt(line) {
        for (const u of this.units) {
            if (line >= u.blockStart && line <= u.blockEnd)
                return u;
        }
        return null;
    }
}
/** A slot's TypeScript type, resolved through the schema chain (the value
 *  check's teeth). Unknown slots — a typo — fall to `unknown`; the TS2339 that
 *  names the missing property is the real report. */
function tsSlotType(schemas, tag, slot) {
    const schema = schemas[tag];
    if (schema === undefined)
        return "unknown";
    const t = attrType(schema, slot);
    return t === null ? "unknown" : tsType(t);
}
/** Run stock tsc over the scaffold + the case file in an in-memory host (real
 *  lib.d.ts from disk), under `strict`. Returns the case file's diagnostics. */
function runTsc(scaffold, caseSrc) {
    // Lazy `typescript` import: only a Node compile with typecheck enabled pays
    // for loading it, and the runtime bundle never sees it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ts = require("typescript");
    const files = { "scaffold.ts": scaffold, "case.ts": caseSrc };
    const readFile = (name) => {
        if (Object.hasOwn(files, name))
            return files[name];
        try {
            return require("node:fs").readFileSync(name, "utf8");
        }
        catch {
            return undefined;
        }
    };
    const options = {
        strict: true, // strictBindCallApply — the check-block shape depends on it
        target: ts.ScriptTarget.ES2022,
        lib: ["lib.es2022.d.ts"], // ES only — no DOM globals to collide with Text / Image
        skipLibCheck: true,
        noEmit: true,
        types: [],
    };
    const host = {
        getSourceFile: (name, target) => {
            const text = readFile(name);
            return text === undefined ? undefined : ts.createSourceFile(name, text, target, true);
        },
        getDefaultLibFileName: (o) => path.join(LIB_DIR, ts.getDefaultLibFileName(o)),
        writeFile: () => { },
        getCurrentDirectory: () => "/",
        getDirectories: () => [],
        fileExists: (name) => Object.hasOwn(files, name) || require("node:fs").existsSync(name),
        readFile,
        getCanonicalFileName: (n) => n,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => "\n",
        directoryExists: () => true,
        realpath: (n) => n,
    };
    const program = ts.createProgram(["scaffold.ts", "case.ts"], options, host);
    const sf = program.getSourceFile("case.ts");
    if (sf === undefined)
        return [];
    return [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)].map((d) => ({
        code: d.code,
        message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
        line: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0,
    }));
}
// ── line arithmetic on the original source ───────────────────────────────────
function lineStarts(src) {
    const starts = [0];
    for (let i = 0; i < src.length; i++)
        if (src[i] === "\n")
            starts.push(i + 1);
    return starts;
}
function posOfLine(line, starts) {
    const offset = starts[Math.min(line - 1, starts.length - 1)] ?? 0;
    return { line, col: 1, offset };
}
//# sourceMappingURL=typecheck.js.map
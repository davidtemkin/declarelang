// The formula language of Cells, and its evaluation — nothing here knows about
// the sheet's views or its storage. The sheet hands `evaluateFormula` a lookup
// from a cell's name to its current value, and asks `formulaRefs` which cells a
// formula reads, so it knows what to recompute when one of them changes.
//
// A formula is one of:
//   - empty;
//   - a number:            3, -2.5, 1e3
//   - a piece of text:     anything else not starting with "="
//   - "=" and an expression of
//       numbers, cell references (A0 … Z99), + - * /, parentheses,
//       and SUM(…) / PROD(…) over a list of expressions and ranges (A1:B5).
// Ranges belong only inside a function's arguments.

type FormulaExpr =
    | { k: "num"; v: number }
    | { k: "ref"; id: string }
    | { k: "range"; from: string; to: string }
    | { k: "neg"; e: FormulaExpr }
    | { k: "bin"; op: string; a: FormulaExpr; b: FormulaExpr }
    | { k: "call"; fn: string; args: FormulaExpr[] }

type ParsedFormula =
    | { kind: "empty" }
    | { kind: "number"; value: number }
    | { kind: "text"; value: string }
    | { kind: "expr"; expr: FormulaExpr }
    | { kind: "invalid"; message: string }

// A cell's value: a number, a piece of text, nothing, or an error. `error` is
// the short code a cell shows; `message` says what went wrong.
type CellValue = { num?: number | null; text?: string | null; error?: string | null; message?: string | null }

const SHEET_COLUMNS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const SHEET_ROWS = 100
const FORMULA_FUNCTIONS = ["SUM", "PROD"]

function cellName(col: number, row: number): string { return SHEET_COLUMNS[col] + row }

function cellPosition(id: string): { col: number; row: number } | null {
    const m = /^([A-Za-z])(\d{1,2})$/.exec(id)
    if (m == null) return null
    const col = SHEET_COLUMNS.indexOf(m[1].toUpperCase())
    const row = Number(m[2])
    return row < SHEET_ROWS ? { col: col, row: row } : null
}

class FormulaError {
    constructor(public code: string, public message: string) {}
}

// ── parsing ────────────────────────────────────────────────────────────────

type FormulaToken = { t: "num" | "ref" | "name" | "op"; s: string }

function tokenizeFormula(src: string): FormulaToken[] {
    const out: FormulaToken[] = []
    let i = 0
    while (i < src.length) {
        const ch = src[i]
        if (/\s/.test(ch)) { i++; continue }
        const num = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(src.slice(i))
        if (num != null) { out.push({ t: "num", s: num[0] }); i += num[0].length; continue }
        const word = /^[A-Za-z]+\d*/.exec(src.slice(i))
        if (word != null) {
            const w = word[0]
            if (/^[A-Za-z]\d+$/.test(w)) {
                if (cellPosition(w) == null) throw new FormulaError("#REF!", w + " is not a cell: rows run from 0 to 99")
                out.push({ t: "ref", s: w.toUpperCase() })
            } else if (/^[A-Za-z]+$/.test(w)) {
                out.push({ t: "name", s: w.toUpperCase() })
            } else {
                throw new FormulaError("#NAME?", "There is no cell or function called " + w)
            }
            i += w.length
            continue
        }
        if ("+-*/():,".includes(ch)) { out.push({ t: "op", s: ch }); i++; continue }
        throw new FormulaError("#SYNTAX", "Unexpected “" + ch + "”")
    }
    return out
}

function parseFormula(src: string): ParsedFormula {
    const s = src.trim()
    if (s == "") return { kind: "empty" }
    if (!s.startsWith("=")) {
        if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return { kind: "number", value: Number(s) }
        return { kind: "text", value: src }
    }
    try {
        const tokens = tokenizeFormula(s.slice(1))
        let pos = 0
        const peek = (): FormulaToken | undefined => tokens[pos]
        const isOp = (c: string): boolean => peek()?.t == "op" && peek()?.s == c
        const expectOp = (c: string) => {
            if (!isOp(c)) throw new FormulaError("#SYNTAX", "Expected “" + c + "”" + (peek() ? " before “" + peek()!.s + "”" : " at the end"))
            pos++
        }

        const expr = (): FormulaExpr => {
            let a = term()
            while (isOp("+") || isOp("-")) { const op = tokens[pos++].s; a = { k: "bin", op: op, a: a, b: term() } }
            return a
        }
        const term = (): FormulaExpr => {
            let a = unary()
            while (isOp("*") || isOp("/")) { const op = tokens[pos++].s; a = { k: "bin", op: op, a: a, b: unary() } }
            return a
        }
        const unary = (): FormulaExpr => {
            if (isOp("-")) { pos++; return { k: "neg", e: unary() } }
            if (isOp("+")) { pos++; return unary() }
            return primary()
        }
        const primary = (): FormulaExpr => {
            const tk = peek()
            if (tk == null) throw new FormulaError("#SYNTAX", "The formula ends too soon")
            if (tk.t == "num") { pos++; return { k: "num", v: Number(tk.s) } }
            if (tk.t == "ref") {
                pos++
                if (isOp(":")) throw new FormulaError("#SYNTAX", "A range belongs inside SUM or PROD")
                return { k: "ref", id: tk.s }
            }
            if (tk.t == "name") {
                pos++
                if (!FORMULA_FUNCTIONS.includes(tk.s)) throw new FormulaError("#NAME?", "There is no function called " + tk.s)
                expectOp("(")
                const args: FormulaExpr[] = []
                if (!isOp(")")) {
                    args.push(argument())
                    while (isOp(",")) { pos++; args.push(argument()) }
                }
                expectOp(")")
                return { k: "call", fn: tk.s, args: args }
            }
            if (isOp("(")) { pos++; const e = expr(); expectOp(")"); return e }
            throw new FormulaError("#SYNTAX", "Unexpected “" + tk.s + "”")
        }
        const argument = (): FormulaExpr => {
            const a = tokens[pos], colon = tokens[pos + 1], b = tokens[pos + 2]
            if (a?.t == "ref" && colon?.t == "op" && colon.s == ":") {
                if (b?.t != "ref") throw new FormulaError("#SYNTAX", "A range is two cells, as in A1:B5")
                pos += 3
                return { k: "range", from: a.s, to: b.s }
            }
            return expr()
        }

        const e = expr()
        if (pos < tokens.length) throw new FormulaError("#SYNTAX", "Unexpected “" + tokens[pos].s + "”")
        return { kind: "expr", expr: e }
    } catch (err) {
        if (err instanceof FormulaError) return { kind: "invalid", message: err.code + " " + err.message }
        throw err
    }
}

// ── references ─────────────────────────────────────────────────────────────

function rangeCells(from: string, to: string): string[] {
    const a = cellPosition(from)!, b = cellPosition(to)!
    const out: string[] = []
    for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++)
        for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) out.push(cellName(c, r))
    return out
}

// Every cell a formula reads, once each.
function formulaRefs(f: ParsedFormula): string[] {
    if (f.kind != "expr") return []
    const seen = new Set<string>()
    const walk = (e: FormulaExpr) => {
        switch (e.k) {
            case "ref": seen.add(e.id); break
            case "range": rangeCells(e.from, e.to).forEach((id) => seen.add(id)); break
            case "neg": walk(e.e); break
            case "bin": walk(e.a); walk(e.b); break
            case "call": e.args.forEach(walk); break
        }
    }
    walk(f.expr)
    return [...seen]
}

// ── evaluation ─────────────────────────────────────────────────────────────

function evaluateFormula(f: ParsedFormula, lookup: (id: string) => CellValue): CellValue {
    switch (f.kind) {
        case "empty": return {}
        case "number": return { num: f.value }
        case "text": return { text: f.value }
        case "invalid": {
            const sp = f.message.indexOf(" ")
            return { error: f.message.slice(0, sp), message: f.message.slice(sp + 1) }
        }
    }

    // A cell read as a number: empty is 0; text or an error can't be.
    const numberOf = (id: string): number => {
        const v = lookup(id)
        if (v.error != null) throw new FormulaError(v.error, id + " has an error" + (v.message ? ": " + v.message : ""))
        if (v.text != null) throw new FormulaError("#VALUE!", id + " holds text, not a number")
        return v.num ?? 0
    }
    // A function's arguments as numbers; a range's empty and text cells are passed over.
    const numbersOf = (args: FormulaExpr[]): number[] => {
        const out: number[] = []
        for (const a of args) {
            if (a.k == "range") {
                for (const id of rangeCells(a.from, a.to)) {
                    const v = lookup(id)
                    if (v.error != null) throw new FormulaError(v.error, id + " has an error" + (v.message ? ": " + v.message : ""))
                    if (v.num != null) out.push(v.num)
                }
            } else out.push(value(a))
        }
        return out
    }
    const value = (e: FormulaExpr): number => {
        switch (e.k) {
            case "num": return e.v
            case "ref": return numberOf(e.id)
            case "range": throw new FormulaError("#SYNTAX", "A range belongs inside SUM or PROD")
            case "neg": return -value(e.e)
            case "call": {
                const ns = numbersOf(e.args)
                return e.fn == "SUM" ? ns.reduce((s, n) => s + n, 0) : ns.reduce((p, n) => p * n, 1)
            }
            case "bin": {
                const a = value(e.a), b = value(e.b)
                if (e.op == "+") return a + b
                if (e.op == "-") return a - b
                if (e.op == "*") return a * b
                if (b == 0) throw new FormulaError("#DIV/0!", "Division by zero")
                return a / b
            }
        }
    }
    try {
        const n = value(f.expr)
        return Number.isFinite(n) ? { num: n } : { error: "#NUM!", message: "The result is too large" }
    } catch (err) {
        if (err instanceof FormulaError) return { error: err.code, message: err.message }
        throw err
    }
}

// What a cell shows for its value.
function displayValue(v: CellValue): string {
    if (v.error != null) return v.error
    if (v.text != null) return v.text
    if (v.num == null) return ""
    return Number.isInteger(v.num) ? String(v.num) : String(Number(v.num.toPrecision(10)))
}

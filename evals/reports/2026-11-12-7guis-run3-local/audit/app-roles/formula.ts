// The Cells formula language: parsing a cell's formula, naming the cells it
// reads, and evaluating it. Pure functions of their arguments — no
// interface, no stored state; the sheet (cells.declare) holds the cells and
// decides what to recompute.
//
// A formula is one of:
//   ""                 an empty cell
//   a number           "12", "-3.5", "1e3"
//   text               anything else not starting with "="
//   "=" expression     numbers, cell references (A1), + - * /, parentheses,
//                      and SUM(…) / PROD(…) over ranges (A1:B5), cells or
//                      expressions, separated by commas
//
// Columns are A–Z, rows 0–99.

const SHEET_COLS = 26
const SHEET_ROWS = 100

type CellKey = string                       // "A0" … "Z99"
type CellValue = number | string | null     // a number, text, or empty

type Expr =
    | { op: "num"; value: number }
    | { op: "ref"; key: CellKey }
    | { op: "range"; from: CellKey; to: CellKey }
    | { op: "neg"; arg: Expr }
    | { op: "bin"; sign: "+" | "-" | "*" | "/"; left: Expr; right: Expr }
    | { op: "call"; fn: "SUM" | "PROD"; args: Expr[] }

type Formula =
    | { kind: "empty" }
    | { kind: "number"; value: number }
    | { kind: "text"; value: string }
    | { kind: "expr"; expr: Expr }
    | { kind: "invalid"; message: string }

// An error a formula raises while it is evaluated; its message is what the
// cell shows.
class FormulaError extends Error {}

function columnName(c: number): string { return String.fromCharCode(65 + c) }
function cellKey(c: number, r: number): CellKey { return columnName(c) + r }

// "B12" → [column, row], or null when it names no cell on the sheet.
function cellPosition(key: string): [number, number] | null {
    const m = /^([A-Z])(\d{1,2})$/.exec(key.toUpperCase())
    if (m == null) return null
    const c = m[1].charCodeAt(0) - 65, r = Number(m[2])
    return c < SHEET_COLS && r < SHEET_ROWS ? [c, r] : null
}

// ── Parsing ────────────────────────────────────────────────────────────────

function parseFormula(source: string): Formula {
    const s = source.trim()
    if (s == "") return { kind: "empty" }
    if (s[0] != "=") {
        const n = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? Number(s) : NaN
        return isNaN(n) ? { kind: "text", value: source } : { kind: "number", value: n }
    }
    try {
        return { kind: "expr", expr: new Parser(s.slice(1)).parseAll() }
    } catch (e) {
        return { kind: "invalid", message: e instanceof FormulaError ? e.message : "#ERROR" }
    }
}

type Token = { t: "num"; v: number } | { t: "ref"; v: string } | { t: "name"; v: string } | { t: "sym"; v: string }

function tokenize(src: string): Token[] {
    const out: Token[] = []
    let i = 0
    while (i < src.length) {
        const ch = src[i]
        if (/\s/.test(ch)) { i++; continue }
        const num = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(src.slice(i))
        if (num != null) { out.push({ t: "num", v: Number(num[0]) }); i += num[0].length; continue }
        const word = /^[A-Za-z]+\d*/.exec(src.slice(i))
        if (word != null) {
            const w = word[0].toUpperCase()
            out.push(/^[A-Z]\d+$/.test(w) ? { t: "ref", v: w } : { t: "name", v: w })
            i += word[0].length
            continue
        }
        if ("+-*/(),:".includes(ch)) { out.push({ t: "sym", v: ch }); i++; continue }
        throw new FormulaError("#SYNTAX")
    }
    return out
}

class Parser {
    private tokens: Token[]
    private at = 0
    constructor(src: string) { this.tokens = tokenize(src) }

    parseAll(): Expr {
        const e = this.sum()
        if (this.at < this.tokens.length) throw new FormulaError("#SYNTAX")
        return e
    }
    private peek(): Token | undefined { return this.tokens[this.at] }
    private isSym(v: string): boolean { const t = this.peek(); return t != null && t.t == "sym" && t.v == v }
    private expect(v: string) { if (!this.isSym(v)) throw new FormulaError("#SYNTAX"); this.at++ }

    private sum(): Expr {
        let e = this.product()
        while (this.isSym("+") || this.isSym("-")) {
            const sign = (this.tokens[this.at++] as { v: "+" | "-" }).v
            e = { op: "bin", sign, left: e, right: this.product() }
        }
        return e
    }
    private product(): Expr {
        let e = this.unary()
        while (this.isSym("*") || this.isSym("/")) {
            const sign = (this.tokens[this.at++] as { v: "*" | "/" }).v
            e = { op: "bin", sign, left: e, right: this.unary() }
        }
        return e
    }
    private unary(): Expr {
        if (this.isSym("-")) { this.at++; return { op: "neg", arg: this.unary() } }
        if (this.isSym("+")) { this.at++; return this.unary() }
        return this.primary()
    }
    private primary(): Expr {
        const t = this.peek()
        if (t == null) throw new FormulaError("#SYNTAX")
        this.at++
        if (t.t == "num") return { op: "num", value: t.v }
        if (t.t == "ref") {
            if (cellPosition(t.v) == null) throw new FormulaError("#REF")
            if (this.isSym(":")) throw new FormulaError("#SYNTAX")     // a range only inside a function
            return { op: "ref", key: t.v }
        }
        if (t.t == "name") {
            if (t.v != "SUM" && t.v != "PROD") throw new FormulaError("#NAME")
            this.expect("(")
            const args: Expr[] = []
            if (!this.isSym(")")) {
                args.push(this.argument())
                while (this.isSym(",")) { this.at++; args.push(this.argument()) }
            }
            this.expect(")")
            return { op: "call", fn: t.v, args }
        }
        if (t.v == "(") { const e = this.sum(); this.expect(")"); return e }
        throw new FormulaError("#SYNTAX")
    }
    // A function's argument: a range, or any expression.
    private argument(): Expr {
        const t = this.peek(), next = this.tokens[this.at + 1], last = this.tokens[this.at + 2]
        if (t?.t == "ref" && next?.t == "sym" && next.v == ":" && last?.t == "ref") {
            if (cellPosition(t.v) == null || cellPosition(last.v) == null) throw new FormulaError("#REF")
            this.at += 3
            return { op: "range", from: t.v, to: last.v }
        }
        return this.sum()
    }
}

// ── What a formula reads ───────────────────────────────────────────────────

function rangeKeys(from: CellKey, to: CellKey): CellKey[] {
    const a = cellPosition(from)!, b = cellPosition(to)!
    const keys: CellKey[] = []
    for (let c = Math.min(a[0], b[0]); c <= Math.max(a[0], b[0]); c++)
        for (let r = Math.min(a[1], b[1]); r <= Math.max(a[1], b[1]); r++) keys.push(cellKey(c, r))
    return keys
}

// Every cell a formula reads, each once.
function formulaReads(f: Formula): CellKey[] {
    const keys = new Set<CellKey>()
    const walk = (e: Expr) => {
        switch (e.op) {
            case "ref": keys.add(e.key); break
            case "range": rangeKeys(e.from, e.to).forEach((k) => keys.add(k)); break
            case "neg": walk(e.arg); break
            case "bin": walk(e.left); walk(e.right); break
            case "call": e.args.forEach(walk); break
        }
    }
    if (f.kind == "expr") walk(f.expr)
    return [...keys]
}

// ── Evaluation ─────────────────────────────────────────────────────────────

// A formula's value, given how to read another cell's value. `read` throws a
// FormulaError for a cell that holds an error, so errors carry through.
function evaluateFormula(f: Formula, read: (key: CellKey) => CellValue): CellValue {
    switch (f.kind) {
        case "empty": return null
        case "number": return f.value
        case "text": return f.value
        case "invalid": throw new FormulaError(f.message)
        case "expr": return evaluate(f.expr, read)
    }
}

function asNumber(v: CellValue): number {
    if (v == null) return 0
    if (typeof v == "number") return v
    throw new FormulaError("#VALUE")
}

function evaluate(e: Expr, read: (key: CellKey) => CellValue): number {
    switch (e.op) {
        case "num": return e.value
        case "ref": return asNumber(read(e.key))
        case "range": throw new FormulaError("#SYNTAX")
        case "neg": return -evaluate(e.arg, read)
        case "bin": {
            const a = evaluate(e.left, read), b = evaluate(e.right, read)
            if (e.sign == "+") return a + b
            if (e.sign == "-") return a - b
            if (e.sign == "*") return a * b
            if (b == 0) throw new FormulaError("#DIV/0")
            return a / b
        }
        case "call": {
            // Over a range, empty and text cells are passed over; a cell or
            // an expression given on its own must be a number.
            const values: number[] = []
            for (const arg of e.args) {
                if (arg.op == "range") {
                    for (const k of rangeKeys(arg.from, arg.to)) {
                        const v = read(k)
                        if (typeof v == "number") values.push(v)
                    }
                } else values.push(evaluate(arg, read))
            }
            return e.fn == "SUM" ? values.reduce((s, v) => s + v, 0) : values.reduce((p, v) => p * v, 1)
        }
    }
}

// How a value is shown in its cell.
function displayValue(v: CellValue): string {
    if (v == null) return ""
    if (typeof v == "string") return v
    if (!isFinite(v)) return "#NUM"
    return String(Number(v.toPrecision(10)))
}

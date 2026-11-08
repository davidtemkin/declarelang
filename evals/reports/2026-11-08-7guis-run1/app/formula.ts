// The Cells formula language: parsing, the cells a formula reads, and
// evaluation. Pure functions of their arguments — nothing here knows about the
// sheet's data or its views. The sheet (cells.declare) asks three questions:
// what does this formula say (`parseFormula`), which cells does it read
// (`references`), and what is it worth, given a way to look a cell up
// (`evaluate`).
//
// A formula is
//   - empty,
//   - a number               12, -3.5
//   - a piece of text        Total
//   - "=" and an expression  =A1 + B2 * 2, =SUM(A0:A9), =PROD(A1, B1, 2)
//
// An expression has numbers, cell references (A0 … Z99), + - * /, unary
// minus, parentheses, and the functions SUM and PROD, whose arguments are
// ranges (A0:B5) or expressions. A range is legal only as a function argument.

export type CellValue =
    | { kind: "empty" }
    | { kind: "number"; value: number }
    | { kind: "text"; value: string }
    | { kind: "error"; message: string }

type Ast =
    | { t: "num"; value: number }
    | { t: "ref"; id: string }
    | { t: "range"; from: string; to: string }
    | { t: "neg"; arg: Ast }
    | { t: "bin"; op: "+" | "-" | "*" | "/"; left: Ast; right: Ast }
    | { t: "call"; fn: "SUM" | "PROD"; args: Ast[] }

export type Parsed =
    | { kind: "empty" }
    | { kind: "number"; value: number }
    | { kind: "text"; value: string }
    | { kind: "expr"; ast: Ast }
    | { kind: "error"; message: string }

export const COLUMNS = 26
export const ROWS = 100

// ── Cell names ──────────────────────────────────────────────────────────────

export function columnName(col: number): string { return String.fromCharCode(65 + col) }
export function cellName(col: number, row: number): string { return columnName(col) + row }

/** "B12" → { col: 1, row: 12 }, or null when it names no cell of the sheet. */
export function cellAt(id: string): { col: number; row: number } | null {
    const m = /^([A-Za-z])([0-9]{1,2})$/.exec(id)
    if (m == null) return null
    const col = m[1].toUpperCase().charCodeAt(0) - 65
    const row = Number(m[2])
    return col < COLUMNS && row < ROWS ? { col: col, row: row } : null
}

// ── Parsing ─────────────────────────────────────────────────────────────────

const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/

type Token = { t: "num"; value: number } | { t: "ref"; id: string } | { t: "name"; name: string } | { t: "op"; op: string }

function tokenize(src: string): Token[] {
    const out: Token[] = []
    let i = 0
    while (i < src.length) {
        const ch = src[i]
        if (/\s/.test(ch)) { i++; continue }
        const num = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(src.slice(i))
        if (num != null) { out.push({ t: "num", value: Number(num[0]) }); i += num[0].length; continue }
        const word = /^[A-Za-z][A-Za-z0-9]*/.exec(src.slice(i))
        if (word != null) {
            const w = word[0]
            out.push(cellAt(w) != null ? { t: "ref", id: w.toUpperCase() } : { t: "name", name: w.toUpperCase() })
            i += w.length
            continue
        }
        if ("+-*/(),:".includes(ch)) { out.push({ t: "op", op: ch }); i++; continue }
        throw new Error("Unexpected “" + ch + "”")
    }
    return out
}

class Parser {
    private at = 0
    constructor(private tokens: Token[]) {}

    private peek(): Token | undefined { return this.tokens[this.at] }
    private isOp(op: string): boolean { const t = this.peek(); return t != null && t.t == "op" && t.op == op }
    private expect(op: string) {
        if (!this.isOp(op)) throw new Error("Expected “" + op + "”")
        this.at++
    }

    whole(): Ast {
        const e = this.expr()
        if (this.peek() != null) throw new Error("Unexpected input after the expression")
        return e
    }

    private expr(): Ast {
        let left = this.term()
        while (this.isOp("+") || this.isOp("-")) {
            const op = (this.tokens[this.at++] as { op: "+" | "-" }).op
            left = { t: "bin", op: op, left: left, right: this.term() }
        }
        return left
    }

    private term(): Ast {
        let left = this.factor()
        while (this.isOp("*") || this.isOp("/")) {
            const op = (this.tokens[this.at++] as { op: "*" | "/" }).op
            left = { t: "bin", op: op, left: left, right: this.factor() }
        }
        return left
    }

    private factor(): Ast {
        const tok = this.peek()
        if (tok == null) throw new Error("The expression ends too soon")
        if (tok.t == "op" && (tok.op == "-" || tok.op == "+")) {
            this.at++
            const arg = this.factor()
            return tok.op == "-" ? { t: "neg", arg: arg } : arg
        }
        if (tok.t == "num") { this.at++; return { t: "num", value: tok.value } }
        if (tok.t == "ref") {
            this.at++
            if (this.isOp(":")) throw new Error("A range belongs inside SUM or PROD")
            return { t: "ref", id: tok.id }
        }
        if (tok.t == "name") {
            this.at++
            if (tok.name != "SUM" && tok.name != "PROD") throw new Error("Unknown function or cell “" + tok.name + "”")
            this.expect("(")
            const args: Ast[] = []
            if (!this.isOp(")")) {
                args.push(this.argument())
                while (this.isOp(",")) { this.at++; args.push(this.argument()) }
            }
            this.expect(")")
            return { t: "call", fn: tok.name, args: args }
        }
        if (tok.t == "op" && tok.op == "(") {
            this.at++
            const e = this.expr()
            this.expect(")")
            return e
        }
        throw new Error("Unexpected “" + (tok.t == "op" ? tok.op : "") + "”")
    }

    private argument(): Ast {
        const a = this.tokens[this.at], b = this.tokens[this.at + 1], c = this.tokens[this.at + 2]
        if (a?.t == "ref" && b?.t == "op" && b.op == ":" && c?.t == "ref") {
            this.at += 3
            return { t: "range", from: a.id, to: c.id }
        }
        return this.expr()
    }
}

const parsedCache = new Map<string, Parsed>()

/** What a formula says. Memoized: the sheet asks about the same text often. */
export function parseFormula(src: string): Parsed {
    const hit = parsedCache.get(src)
    if (hit != null) return hit
    const p = parseUncached(src)
    parsedCache.set(src, p)
    return p
}

function parseUncached(src: string): Parsed {
    const s = src.trim()
    if (s == "") return { kind: "empty" }
    if (s[0] != "=") return NUMBER.test(s) ? { kind: "number", value: Number(s) } : { kind: "text", value: s }
    try {
        return { kind: "expr", ast: new Parser(tokenize(s.slice(1))).whole() }
    } catch (e) {
        return { kind: "error", message: (e as Error).message }
    }
}

// ── What a formula reads ────────────────────────────────────────────────────

function rangeCells(from: string, to: string): string[] {
    const a = cellAt(from)!, b = cellAt(to)!
    const out: string[] = []
    for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++)
        for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++)
            out.push(cellName(c, r))
    return out
}

function collect(ast: Ast, out: Set<string>) {
    switch (ast.t) {
        case "ref": out.add(ast.id); break
        case "range": rangeCells(ast.from, ast.to).forEach((id) => out.add(id)); break
        case "neg": collect(ast.arg, out); break
        case "bin": collect(ast.left, out); collect(ast.right, out); break
        case "call": ast.args.forEach((a) => collect(a, out)); break
    }
}

/** The cells a formula reads, each once. */
export function references(p: Parsed): string[] {
    if (p.kind != "expr") return []
    const out = new Set<string>()
    collect(p.ast, out)
    return [...out]
}

// ── Evaluation ──────────────────────────────────────────────────────────────

class EvalError extends Error {}

function asNumber(v: CellValue, id: string): number {
    switch (v.kind) {
        case "empty": return 0
        case "number": return v.value
        case "text": throw new EvalError(id + " is text, not a number")
        case "error": throw new EvalError(id + " has an error")
    }
}

function evalAst(ast: Ast, lookup: (id: string) => CellValue): number {
    switch (ast.t) {
        case "num": return ast.value
        case "ref": return asNumber(lookup(ast.id), ast.id)
        case "range": throw new EvalError("A range belongs inside SUM or PROD")
        case "neg": return -evalAst(ast.arg, lookup)
        case "bin": {
            const l = evalAst(ast.left, lookup), r = evalAst(ast.right, lookup)
            if (ast.op == "+") return l + r
            if (ast.op == "-") return l - r
            if (ast.op == "*") return l * r
            if (r == 0) throw new EvalError("Division by zero")
            return l / r
        }
        case "call": {
            const values: number[] = []
            for (const a of ast.args) {
                if (a.t == "range") {
                    for (const id of rangeCells(a.from, a.to)) {
                        const v = lookup(id)
                        if (v.kind != "empty") values.push(asNumber(v, id))
                    }
                } else values.push(evalAst(a, lookup))
            }
            return ast.fn == "SUM" ? values.reduce((s, v) => s + v, 0) : values.reduce((s, v) => s * v, 1)
        }
    }
}

/** What a formula is worth, reading other cells through `lookup`. */
export function evaluate(p: Parsed, lookup: (id: string) => CellValue): CellValue {
    switch (p.kind) {
        case "empty": return { kind: "empty" }
        case "number": return { kind: "number", value: p.value }
        case "text": return { kind: "text", value: p.value }
        case "error": return { kind: "error", message: p.message }
        case "expr":
            try {
                const n = evalAst(p.ast, lookup)
                return Number.isFinite(n) ? { kind: "number", value: n } : { kind: "error", message: "Not a finite number" }
            } catch (e) {
                if (e instanceof EvalError) return { kind: "error", message: e.message }
                throw e
            }
    }
}

/** A number as a cell shows it: at most ten significant digits, no float noise. */
export function formatNumber(n: number): string {
    return String(Number(n.toPrecision(10)))
}

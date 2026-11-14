// The formula language of the Cells task: names of cells, parsing, the cells a
// formula reads, and evaluation. Plain functions of their arguments — nothing
// here knows about views or about where the sheet keeps its cells. `Sheet`
// (cells.declare) is the only caller.
//
// A formula is one of:
//   ""             an empty cell
//   3.5            a number
//   anything else  a piece of text
//   =expression    numbers, cell references (A1), + - * /, parentheses, and
//                  SUM(…) / PROD(…) over ranges (A1:B5), cells and expressions

const SHEET_COLUMNS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const SHEET_ROWS = 100

type CellValue = number | string

type Expr =
    | { kind: "empty" }
    | { kind: "number"; value: number }
    | { kind: "text"; value: string }
    | { kind: "ref"; cell: string }
    | { kind: "range"; from: string; to: string }
    | { kind: "negate"; arg: Expr }
    | { kind: "binary"; op: "+" | "-" | "*" | "/"; left: Expr; right: Expr }
    | { kind: "call"; fn: "SUM" | "PROD"; args: Expr[] }
    | { kind: "invalid"; code: string; message: string }

// An error a cell shows: a short code in the cell, a sentence for its tooltip.

class FormulaError extends Error {
    code: string
    constructor(code: string, message: string) {
        super(message)
        this.code = code
    }
}

// ── Cell names ──────────────────────────────────────────────────────────────

function cellName(col: number, row: number): string {
    return SHEET_COLUMNS[col] + row
}

function cellPosition(name: string): { col: number; row: number } | null {
    const m = /^([A-Z])([0-9]{1,2})$/.exec(name)
    if (m == null) return null
    const col = SHEET_COLUMNS.indexOf(m[1])
    const row = Number(m[2])
    if (col < 0 || row >= SHEET_ROWS || (m[2].length > 1 && m[2][0] == "0")) return null
    return { col, row }
}

function rangeCells(from: string, to: string): string[] {
    const a = cellPosition(from)!, b = cellPosition(to)!
    const out: string[] = []
    for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++)
        for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) out.push(cellName(c, r))
    return out
}

// ── Parsing ─────────────────────────────────────────────────────────────────

const NUMBER_TEXT = /^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$/

// Parsing is memoized by the formula's text: a formula is parsed again
// whenever the sheet re-evaluates the cell or follows its references.
const parsedFormulas = new Map<string, Expr>()

function parseFormula(src: string): Expr {
    let e = parsedFormulas.get(src)
    if (e == null) {
        e = parseUncached(src)
        parsedFormulas.set(src, e)
    }
    return e
}

function parseUncached(src: string): Expr {
    const t = src.trim()
    if (t == "") return { kind: "empty" }
    if (t[0] == "=") {
        try {
            return new FormulaParser(t.slice(1)).parse()
        } catch (e) {
            if (e instanceof FormulaError) return { kind: "invalid", code: e.code, message: e.message }
            throw e
        }
    }
    if (NUMBER_TEXT.test(t)) return { kind: "number", value: Number(t) }
    return { kind: "text", value: src }
}

type Token = { kind: "num" | "name" | "op" | "end"; text: string; at: number }

function tokenize(src: string): Token[] {
    const out: Token[] = []
    let i = 0
    while (i < src.length) {
        const ch = src[i]
        if (ch == " " || ch == "\t") { i++; continue }
        const num = /^([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?/.exec(src.slice(i))
        if (num != null) { out.push({ kind: "num", text: num[0], at: i }); i += num[0].length; continue }
        const name = /^[A-Za-z][A-Za-z0-9]*/.exec(src.slice(i))
        if (name != null) { out.push({ kind: "name", text: name[0].toUpperCase(), at: i }); i += name[0].length; continue }
        if ("+-*/(),:".includes(ch)) { out.push({ kind: "op", text: ch, at: i }); i++; continue }
        throw new FormulaError("#ERROR!", `Unexpected “${ch}” in the formula.`)
    }
    out.push({ kind: "end", text: "", at: src.length })
    return out
}

// A recursive-descent parser over the grammar
//   expr    := term (("+" | "-") term)*
//   term    := factor (("*" | "/") factor)*
//   factor  := "-" factor | "+" factor | primary
//   primary := number | cell | NAME "(" args ")" | "(" expr ")"
//   args    := [ arg ("," arg)* ]       arg := cell ":" cell | expr

class FormulaParser {
    tokens: Token[]
    pos = 0
    constructor(src: string) { this.tokens = tokenize(src) }

    parse(): Expr {
        if (this.peek().kind == "end") throw new FormulaError("#ERROR!", "The formula is empty after “=”.")
        const e = this.expr()
        if (this.peek().kind != "end") throw new FormulaError("#ERROR!", `Unexpected “${this.peek().text}”.`)
        return e
    }

    peek(): Token { return this.tokens[this.pos] }
    next(): Token { return this.tokens[this.pos++] }
    isOp(text: string): boolean { const t = this.peek(); return t.kind == "op" && t.text == text }
    expect(text: string) {
        if (!this.isOp(text)) throw new FormulaError("#ERROR!", `Expected “${text}”.`)
        this.pos++
    }

    expr(): Expr {
        let left = this.term()
        while (this.isOp("+") || this.isOp("-")) {
            const op = this.next().text as "+" | "-"
            left = { kind: "binary", op, left, right: this.term() }
        }
        return left
    }

    term(): Expr {
        let left = this.factor()
        while (this.isOp("*") || this.isOp("/")) {
            const op = this.next().text as "*" | "/"
            left = { kind: "binary", op, left, right: this.factor() }
        }
        return left
    }

    factor(): Expr {
        if (this.isOp("-")) { this.pos++; return { kind: "negate", arg: this.factor() } }
        if (this.isOp("+")) { this.pos++; return this.factor() }
        return this.primary()
    }

    primary(): Expr {
        const t = this.next()
        if (t.kind == "num") return { kind: "number", value: Number(t.text) }
        if (t.kind == "op" && t.text == "(") {
            const e = this.expr()
            this.expect(")")
            return e
        }
        if (t.kind == "name") {
            if (this.isOp("(")) return this.call(t.text)
            const cell = this.cell(t.text)
            if (this.isOp(":")) throw new FormulaError("#ERROR!", "A range like A1:B5 goes inside SUM or PROD.")
            return { kind: "ref", cell }
        }
        throw new FormulaError("#ERROR!", t.kind == "end" ? "The formula ends too soon." : `Unexpected “${t.text}”.`)
    }

    cell(name: string): string {
        if (cellPosition(name) == null)
            throw new FormulaError("#REF!", `“${name}” is not a cell: columns run A to Z, rows 0 to 99.`)
        return name
    }

    call(name: string): Expr {
        if (name != "SUM" && name != "PROD") throw new FormulaError("#NAME?", `There is no function “${name}”; use SUM or PROD.`)
        this.expect("(")
        const args: Expr[] = []
        if (!this.isOp(")")) {
            do {
                if (args.length > 0) this.pos++
                args.push(this.arg())
            } while (this.isOp(","))
        }
        this.expect(")")
        return { kind: "call", fn: name, args }
    }

    arg(): Expr {
        const t = this.peek(), after = this.tokens[this.pos + 1]
        if (t.kind == "name" && after.kind == "op" && after.text == ":") {
            const from = this.cell(this.next().text)
            this.pos++
            const end = this.next()
            if (end.kind != "name") throw new FormulaError("#ERROR!", "A range ends with a cell, as in A1:B5.")
            return { kind: "range", from, to: this.cell(end.text) }
        }
        return this.expr()
    }
}

// ── What a formula reads ────────────────────────────────────────────────────

function formulaReferences(e: Expr): string[] {
    switch (e.kind) {
        case "ref": return [e.cell]
        case "range": return rangeCells(e.from, e.to)
        case "negate": return formulaReferences(e.arg)
        case "binary": return [...formulaReferences(e.left), ...formulaReferences(e.right)]
        case "call": return e.args.flatMap(formulaReferences)
        default: return []
    }
}

// ── Evaluation ──────────────────────────────────────────────────────────────
//
// `valueOf` answers another cell's value, and throws that cell's FormulaError
// when it holds one, so an error travels to every cell that reads it.

function evaluateFormula(e: Expr, valueOf: (cell: string) => CellValue): CellValue {
    const num = (x: Expr): number => asNumber(evaluateFormula(x, valueOf))
    switch (e.kind) {
        case "empty": return ""
        case "number": return e.value
        case "text": return e.value
        case "invalid": throw new FormulaError(e.code, e.message)
        case "ref": { const v = valueOf(e.cell); return v === "" ? 0 : v }
        case "range": throw new FormulaError("#ERROR!", "A range goes inside SUM or PROD.")
        case "negate": return -num(e.arg)
        case "binary": {
            const a = num(e.left), b = num(e.right)
            if (e.op == "+") return a + b
            if (e.op == "-") return a - b
            if (e.op == "*") return a * b
            if (b == 0) throw new FormulaError("#DIV/0!", "Division by zero.")
            return a / b
        }
        case "call": {
            // Over a range, empty cells and text are skipped, as spreadsheets do;
            // a value written directly in the list must be a number.
            const values: number[] = []
            for (const arg of e.args) {
                if (arg.kind == "range") {
                    for (const c of rangeCells(arg.from, arg.to)) {
                        const v = valueOf(c)
                        if (typeof v == "number") values.push(v)
                    }
                } else values.push(num(arg))
            }
            return e.fn == "SUM" ? values.reduce((s, v) => s + v, 0) : values.reduce((p, v) => p * v, 1)
        }
    }
}

function asNumber(v: CellValue): number {
    if (typeof v == "number") return v
    if (v.trim() == "") return 0
    throw new FormulaError("#VALUE!", `“${v}” is text, not a number.`)
}

// How a value is written in its cell: numbers without float noise.

function formatCellValue(v: CellValue): string {
    if (typeof v == "string") return v
    if (!isFinite(v)) return v > 0 ? "∞" : v < 0 ? "-∞" : "#NUM!"
    return String(Number(v.toPrecision(12)))
}

// The Cells formula language: parsing, references and evaluation.
//
// Plain functions of their arguments, with no knowledge of the interface: the
// sheet (cells.declare) asks what a formula refers to and what it evaluates
// to, and keeps the values itself.
//
//   formula  := ""                         an empty cell
//             | number                     a number, e.g. 3.5
//             | "=" expr                   an expression
//             | anything else              a piece of text
//   expr     := term (("+" | "-") term)*
//   term     := unary (("*" | "/") unary)*
//   unary    := "-" unary | primary
//   primary  := number | ref | name "(" args ")" | "(" expr ")"
//   args     := arg ("," arg)*
//   arg      := ref ":" ref | expr          a range only inside a function
//   ref      := column letter A–Z, row 0–99, e.g. B12

type Ast =
    | { k: "num"; v: number }
    | { k: "ref"; id: string }
    | { k: "range"; from: string; to: string }
    | { k: "neg"; e: Ast }
    | { k: "bin"; op: string; a: Ast; b: Ast }
    | { k: "call"; fn: string; args: Ast[] }

// What a cell holds once evaluated. `shown` is what the cell displays.
type CellValue = { kind: "empty" | "number" | "text" | "error"; num: number; shown: string }

const SHEET_COLS = 26
const SHEET_ROWS = 100

class FormulaError {
    constructor(public code: string) {}
}

function colName(c: number): string { return String.fromCharCode(65 + c) }
function cellId(col: number, row: number): string { return colName(col) + row }

function parseRef(id: string): { col: number; row: number } | null {
    const m = /^([A-Z])([0-9]{1,2})$/.exec(id)
    if (m == null) return null
    const row = Number(m[2])
    if (row >= SHEET_ROWS) return null
    return { col: m[1].charCodeAt(0) - 65, row: row }
}

function tokenize(src: string): string[] {
    const out: string[] = []
    const re = /\s*([0-9]+(?:\.[0-9]+)?|[A-Za-z][A-Za-z0-9]*|[-+*\/():,])/y
    let i = 0
    while (i < src.length) {
        if (src.slice(i).trim() == "") break
        re.lastIndex = i
        const m = re.exec(src)
        if (m == null) throw new FormulaError("#SYNTAX")
        out.push(m[1])
        i = re.lastIndex
    }
    return out
}

function parseExpression(src: string): Ast {
    const toks = tokenize(src)
    let p = 0
    const peek = (): string | undefined => toks[p]
    const take = (t?: string): string => {
        const tok = toks[p]
        if (tok == undefined || (t != undefined && tok != t)) throw new FormulaError("#SYNTAX")
        p++
        return tok
    }
    const isNum = (t: string | undefined) => t != undefined && /^[0-9]/.test(t)
    const isName = (t: string | undefined) => t != undefined && /^[A-Za-z]/.test(t)

    function ref(): string {
        const t = take().toUpperCase()
        if (parseRef(t) == null) throw new FormulaError("#REF")
        return t
    }
    function arg(): Ast {
        if (isName(peek()) && toks[p + 1] == ":") {
            const from = ref()
            take(":")
            const to = ref()
            return { k: "range", from: from, to: to }
        }
        return expr()
    }
    function primary(): Ast {
        const t = peek()
        if (isNum(t)) { p++; return { k: "num", v: Number(t) } }
        if (t == "(") { take("("); const e = expr(); take(")"); return e }
        if (isName(t)) {
            if (toks[p + 1] == "(") {
                const fn = take().toUpperCase()
                take("(")
                const args: Ast[] = []
                if (peek() != ")") {
                    args.push(arg())
                    while (peek() == ",") { take(","); args.push(arg()) }
                }
                take(")")
                return { k: "call", fn: fn, args: args }
            }
            return { k: "ref", id: ref() }
        }
        throw new FormulaError("#SYNTAX")
    }
    function unary(): Ast {
        if (peek() == "-") { take("-"); return { k: "neg", e: unary() } }
        return primary()
    }
    function term(): Ast {
        let a = unary()
        while (peek() == "*" || peek() == "/") { const op = take(); a = { k: "bin", op: op, a: a, b: unary() } }
        return a
    }
    function expr(): Ast {
        let a = term()
        while (peek() == "+" || peek() == "-") { const op = take(); a = { k: "bin", op: op, a: a, b: term() } }
        return a
    }

    const ast = expr()
    if (p != toks.length) throw new FormulaError("#SYNTAX")
    return ast
}

function rangeIds(from: string, to: string): string[] {
    const a = parseRef(from)!, b = parseRef(to)!
    const ids: string[] = []
    for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++)
        for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) ids.push(cellId(c, r))
    return ids
}

// The kinds of formula. `null` for an expression means the formula is not one.
function isExpression(formula: string): boolean { return formula.trim().startsWith("=") }
function isNumberLiteral(formula: string): boolean { return /^\s*-?[0-9]+(\.[0-9]+)?\s*$/.test(formula) }

// The cells a formula reads, ranges expanded. A formula that does not parse
// reads nothing.
function formulaRefs(formula: string): string[] {
    if (!isExpression(formula)) return []
    let ast: Ast
    try { ast = parseExpression(formula.trim().slice(1)) } catch (e) { return [] }
    const ids: string[] = []
    const walk = (n: Ast): void => {
        if (n.k == "ref") ids.push(n.id)
        else if (n.k == "range") ids.push(...rangeIds(n.from, n.to))
        else if (n.k == "neg") walk(n.e)
        else if (n.k == "bin") { walk(n.a); walk(n.b) }
        else if (n.k == "call") n.args.forEach(walk)
    }
    walk(ast)
    return Array.from(new Set(ids))
}

function formatNumber(n: number): string {
    if (Number.isInteger(n)) return String(n)
    return String(Number(n.toPrecision(10)))
}

function errorValue(code: string): CellValue { return { kind: "error", num: 0, shown: code } }

// Evaluates a formula. `lookup` answers the current value of another cell.
function evaluateFormula(formula: string, lookup: (id: string) => CellValue): CellValue {
    if (formula.trim() == "") return { kind: "empty", num: 0, shown: "" }
    if (isNumberLiteral(formula)) { const n = Number(formula); return { kind: "number", num: n, shown: formatNumber(n) } }
    if (!isExpression(formula)) return { kind: "text", num: 0, shown: formula }

    const num = (id: string): number => {
        const v = lookup(id)
        if (v.kind == "error") throw new FormulaError(v.shown)
        if (v.kind == "text") throw new FormulaError("#VALUE")
        return v.num
    }
    const values = (n: Ast): number[] => n.k == "range" ? rangeIds(n.from, n.to).map(num) : [ev(n)]
    const ev = (n: Ast): number => {
        switch (n.k) {
            case "num": return n.v
            case "ref": return num(n.id)
            case "range": throw new FormulaError("#SYNTAX")      // a range stands only inside a function
            case "neg": return -ev(n.e)
            case "bin": {
                const a = ev(n.a), b = ev(n.b)
                if (n.op == "+") return a + b
                if (n.op == "-") return a - b
                if (n.op == "*") return a * b
                if (b == 0) throw new FormulaError("#DIV/0")
                return a / b
            }
            case "call": {
                const xs = n.args.flatMap(values)
                if (n.fn == "SUM") return xs.reduce((s, x) => s + x, 0)
                if (n.fn == "PROD") return xs.reduce((s, x) => s * x, 1)
                throw new FormulaError("#NAME")
            }
        }
    }
    try {
        const n = ev(parseExpression(formula.trim().slice(1)))
        if (!isFinite(n)) return errorValue("#NUM")
        return { kind: "number", num: n, shown: formatNumber(n) }
    } catch (e) {
        if (e instanceof FormulaError) return errorValue(e.code)
        throw e
    }
}

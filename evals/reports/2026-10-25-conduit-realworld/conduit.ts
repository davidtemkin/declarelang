// Dates, error messages and tag input: functions of their arguments.

export function longDate(iso: string): string {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

// A RealWorld refusal is { errors: { field: ["message", …] } }; each becomes
// one line, "email has already been taken". Anything else falls back to the
// transport's own message.
export function errorLines(body: object | null, fallback: string): string[] {
    const errors = (body as { errors?: { [k: string]: string[] | string } } | null)?.errors
    if (errors == null || typeof errors != "object") return fallback == "" ? [] : [fallback]
    const lines: string[] = []
    for (const [field, msgs] of Object.entries(errors)) {
        for (const m of Array.isArray(msgs) ? msgs : [msgs]) {
            if (field == "credentials") lines.push("email or password is invalid")
            else if (field == "token") lines.push("please sign in again")
            else lines.push(field + " " + m)
        }
    }
    return lines
}

// "react, web  dev" → ["react", "web", "dev"], keeping the first of duplicates
export function addTags(have: string[], typed: string): string[] {
    const out = [...have]
    for (const t of typed.split(/[,\s]+/).map((s) => s.trim()).filter((s) => s != ""))
        if (!out.includes(t)) out.push(t)
    return out
}

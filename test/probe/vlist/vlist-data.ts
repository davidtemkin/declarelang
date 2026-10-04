// vlist-data.ts — a seeded collection built to break a virtualized list.
// Every record carries `i`, its own number, shown in the row, so a check can
// always tell one record from another (no two rows read alike).

export function vlRng(seed: number) {
    let a = seed >>> 0
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const WORDS = ("the of and a to in is you that it he was for on are as with his they at be this have from or one had by word but not what all were we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see number no way could people my than first water been call who oil its now find long down day did get come made may part").split(" ")
const AUTHORS = ["Ada", "Grace", "Ken", "Radia", "Lynn", "Hedy"]
const LABELS = ["perf", "data", "ux", "mobile", "release", "billing", "design", "needs-repro"]

// weighted kinds: mostly text, with every pathological size mixed in
const KINDS: [string, number][] = [["text", 50], ["tiny", 6], ["huge", 3], ["image", 12], ["header", 4], ["expand", 6], ["spring", 6], ["oneword", 13]]

export function vlRecord(r: () => number, i: number): any {
    const total = KINDS.reduce((a, [, w]) => a + w, 0)
    let roll = r() * total, kind = KINDS[0][0]
    for (const [k, w] of KINDS) { if (roll < w) { kind = k; break } roll -= w }
    const rec: any = { i, kind, author: AUTHORS[Math.floor(r() * AUTHORS.length)], reacts: 0 }
    // a few labels, replicated inside the row (zero to three)
    const nt = Math.floor(r() * 4), tags: string[] = []
    for (let k = 0; k < nt; k++) tags.push(LABELS[Math.floor(r() * LABELS.length)])
    rec.tags = tags
    if (kind === "text") {
        // log-normal-ish length: most short, some very long
        const n = Math.max(1, Math.round(Math.exp(r() * 5.5)))
        const ws: string[] = []
        for (let k = 0; k < n; k++) ws.push(WORDS[Math.floor(r() * WORDS.length)])
        rec.text = ws.join(" ")
    } else if (kind === "oneword") {
        rec.kind = "text"; rec.text = WORDS[Math.floor(r() * WORDS.length)]
    } else if (kind === "huge") {
        rec.h = 1200 + Math.floor(r() * 1200)
    } else if (kind === "image") {
        // the data does NOT say the picture's size: only the picture knows
        const aspect = Math.exp((r() - 0.5) * 4.6)          // 1:10 … 10:1
        rec.w = Math.round(400 * Math.sqrt(aspect)); rec.hh = Math.round(400 / Math.sqrt(aspect)); rec.hue = Math.floor(r() * 360)
    } else if (kind === "header") {
        rec.title = "Section " + i
    } else if (kind === "expand" || kind === "spring") {
        rec.dh = 80 + Math.floor(r() * 420)
        rec.text = (kind === "expand" ? "opens in place" : "springs open") + " (" + rec.dh + " px)"
    }
    rec.title = rec.title ?? (rec.text ?? kind).split(" ").slice(0, 8).join(" ")
    return rec
}

export function vlGenerate(count: number, seed: number, from: number): any[] {
    const r = vlRng(seed), out: any[] = []
    for (let i = 0; i < count; i++) out.push(vlRecord(r, from + i))
    return out
}

/** More words for a record that grows after it was first shown. */
export function vlMore(text: string, k: number): string {
    const r = vlRng(k * 31 + text.length), ws: string[] = []
    const n = 6 + Math.floor(r() * 30)
    for (let j = 0; j < n; j++) ws.push(WORDS[Math.floor(r() * WORDS.length)])
    return (text === "" ? "" : text + " ") + ws.join(" ")
}

/** An SVG of the given intrinsic size, as a data URL — loads like any image,
 *  and its natural size arrives with it. */
export function vlSvg(w: number, h: number, hue: number): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="hsl(${hue},55%,62%)"/><text x="12" y="28" font-family="sans-serif" font-size="20" fill="white">${w}×${h}</text></svg>`
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg)
}

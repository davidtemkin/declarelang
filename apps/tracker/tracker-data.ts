// tracker-data.ts — the seeded issue generator and the palette/format helpers,
// loaded by tracker.declare with `script [ "tracker-data.ts" ]` — the worked
// example of script-from-a-file (docs/system-design/composition.md §2). Plain
// TypeScript, written as a module: these exports are what every { } body in the
// tracker may name. Nothing here is reactive — script lives outside the
// constraint system, and a constraint calling in depends on what it passes.
// mulberry32 — the seeded generator's PRNG (sync with gen-issues.mjs)
    export function trkRng(seed: number) {
        export let a = seed >>> 0
        return () => {
            a |= 0; a = (a + 0x6D2B79F5) | 0
            export let t = Math.imul(a ^ (a >>> 15), 1 | a)
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
    }

    export const TRK_VERBS = ["Fix", "Investigate", "Refactor", "Remove", "Add", "Update", "Migrate", "Document", "Optimize", "Rename", "Extract", "Restore", "Audit", "Polish", "Unify"]
    export const TRK_NOUNS = ["login flow", "scroll jank", "cache layer", "search index", "settings panel", "date parsing", "focus ring", "theme tokens", "row recycling", "keyboard traversal", "undo stack", "detail panel", "column widths", "group headers", "session restore", "toolbar overflow", "empty states", "error toasts", "import pipeline", "export dialog", "onboarding tour", "billing webhook", "avatar upload", "draft autosync", "print styles", "clipboard shim", "drag preview", "context menu", "release notes", "smoke tests"]
    export const TRK_TAILS = ["on Windows", "under load", "at 1M rows", "for RTL locales", "after resume", "in Safari", "on touch devices", "when offline", "with long titles", "in the grouped view", "during migration", "for new tenants", ""]
    export const TRK_SENT = [
        "Reproduces reliably after the second navigation.",
        "The regression window points at last Tuesday's deploy.",
        "Customers on the annual plan are disproportionately affected.",
        "A workaround exists but it is not discoverable.",
        "Profiling shows the time is going to layout, not script.",
        "The fix likely belongs a layer lower than where the symptom shows.",
        "We should add a regression test before closing.",
        "Related reports have been merged into this issue.",
        "The design doc covers this case but the implementation drifted.",
        "Needs a decision from design before engineering can proceed.",
        "The error rate doubled after the retry logic changed.",
        "Rollback is safe; the migration is additive.",
    ]
    export const TRK_LABELS = ["bug", "regression", "perf", "ux", "a11y", "docs", "infra", "mobile", "desktop", "search", "editor", "billing", "onboarding", "api", "security", "i18n", "dark-mode", "keyboard", "touch", "animation", "data", "flaky", "tech-debt", "design", "needs-repro", "blocked-upstream", "good-first", "papercut", "release", "customer"]
    export const TRK_PEOPLE = ["ada", "grace", "ken", "bjarne", "tony", "radia", "lynn", "sophie", "adele", "hedy", "ruth", "donald"].map((n) => n[0].toUpperCase() + n.slice(1))
    export const TRK_EPOCH = 1735689600000   // 2025-01-01 — a fixed base, no wall clock

    export function trkGenerate(count: number): any[] {
        export const r = trkRng(1337)
        export const pick = (arr: any[]) => arr[Math.floor(r() * arr.length)]
        export const issues = []
        for (let i = 1; i <= count; i++) {
            export const ragged = r() < 0.03
            export let title = (pick(TRK_VERBS) + " " + pick(TRK_NOUNS) + " " + pick(TRK_TAILS)).trim()
            if (r() < 0.03) title = title + " — 直す 🚧"
            if (r() < 0.01) title = title + " " + "deadbeef".repeat(12)
            export const sr = r()
            export const status = sr < 0.4 ? "open" : sr < 0.65 ? "in-progress" : sr < 0.75 ? "blocked" : "closed"
            export const pr = r()
            export const priority = pr < 0.03 ? "P0" : pr < 0.2 ? "P1" : pr < 0.7 ? "P2" : "P3"
            export const nLabels = Math.floor(r() * r() * 6)
            export const labels = [...new Set(Array.from({ length: nLabels }, () => pick(TRK_LABELS)))]
            export const nSent = r() < 0.3 ? 0 : 1 + Math.floor(r() * r() * 6)
            export const description = Array.from({ length: nSent }, () => pick(TRK_SENT)).join(" ")
            export const created = TRK_EPOCH + Math.floor(r() * 500) * 86400000 + Math.floor(r() * 86400000)
            export const updated = created + Math.floor(r() * r() * 120) * 86400000
            issues.push({
                id: i, title, description, status, priority, labels,
                assignee: ragged || r() < 0.12 ? null : pick(TRK_PEOPLE),
                created, updated,
                closedAt: status === "closed" ? updated : null,
                comments: Math.floor(r() * r() * 40),
            })
        }
        // Recency: a real tracker's activity clusters near the present, so
        // a second seeded stream pulls ~30% of issues' `updated` into the
        // last 90 days of dataset time (closedAt follows for closed ones).
        // Two independent streams keep each one's draws stable on its own.
        export const r2 = trkRng(4242)
        export const horizon = issues.reduce((m, it) => Math.max(m, (it as any).updated), 0)
        for (const it of issues) {
            if (r2() < 0.3) {
                export const u = horizon - Math.floor(r2() * r2() * 90) * 86400000 - Math.floor(r2() * 86400000)
                ;(it as any).updated = Math.max((it as any).created, u)
                if (("" + (it as any).status) == "closed") (it as any).closedAt = (it as any).updated
            }
        }
        return issues
    }

    // the measurement clock — `[ ]` attribute values have no globals, so
    // the wall-clock read lives here in script land
    export function trkNow(): number { return performance.now() }

    export const TRK_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    export function trkDate(ts: number): string {
        export const d = new Date(ts)
        return TRK_MONTHS[d.getMonth()] + " " + d.getDate()
    }

    // ── the app's palette: every color that is not a theme token, named ──
    export const TRK_GREEN = 0x45A557    // open
    export const TRK_BLUE = 0x4C6FE7     // in progress
    export const TRK_RED = 0xE5484D      // blocked · urgent · destructive
    export const TRK_GRAY = 0x9A9DA5     // closed
    export const TRK_AMBER = 0xB88024    // high priority
    export const TRK_SLATE = 0x7C8698    // medium priority
    export const TRK_MIST = 0xAAB4BE     // low priority
    export const TRK_TEAL = 0x37B6A9     // the brand gradient's far stop
    export const TRK_WHITE = 0xFFFFFF    // glyphs cut into filled shapes

    export function trkStatusColor(s: string): number {
        return s === "open" ? TRK_GREEN : s === "in-progress" ? TRK_BLUE : s === "blocked" ? TRK_RED : TRK_GRAY
    }
    export function trkPrioColor(p: string): number {
        return p === "P0" ? TRK_RED : p === "P1" ? TRK_AMBER : p === "P2" ? TRK_SLATE : TRK_MIST
    }
    export function trkRed(): number { return TRK_RED }
    export function trkTeal(): number { return TRK_TEAL }
    export function trkWhite(): number { return TRK_WHITE }

    // avatars and label dots color by NAME — a stable hash into a small
    // palette of muted tones that hold white initials in both themes
    export const TRK_HUES = [0x6C7BD9, 0x4FA3A5, 0xC97B63, 0x8E6BC1, 0x5B9E5E, 0xC06A8C, 0x557FB8, 0xB08A4F]
    export function trkHue(name: string): number {
        export let h = 0
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
        return TRK_HUES[Math.abs(h) % TRK_HUES.length]
    }
    // BASELINES. `y = center` centers a Text's INK BAND — cap top to
    // baseline — so a centered line's baseline lands at (boxHeight + cap)/2.
    // Two centered texts of different sizes therefore do NOT share a
    // baseline: the smaller one rides higher by half the cap difference.
    // `trkBaselineNudge` is that correction, in terms of the cap-height
    // fraction of the em (SF, Inter and Roboto all sit within a hair of
    // 0.72). Same-sized labels need none of this — they share a baseline by
    // construction once their boxes are the same height, which is why the
    // footer gives every control one row height. Lands within half a pixel.
    export const TRK_CAP_RATIO = 0.72
    export function trkBaselineNudge(refPx: number, ownPx: number): number {
        return Math.round(TRK_CAP_RATIO * (refPx - ownPx) / 2 * 10) / 10
    }

    export function trkStatusLabel(s: string): string {
        return s === "open" ? "Open" : s === "in-progress" ? "In Progress" : s === "blocked" ? "Blocked" : "Closed"
    }
    export function trkInitials(name: string): string {
        export const parts = name.split(/[\s._-]+/).filter((x) => x.length > 0)
        if (parts.length === 0) return "?"
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
        return (parts[0][0] + parts[1][0]).toUpperCase()
    }

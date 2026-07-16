// The one heading→slug rule, shared by the renderer (markdown.ts, which assigns
// each rendered heading its anchor) and the crawler (Phase C, which addresses a
// heading anchor). One function so a heading in prose and a link to it agree on
// the name everywhere — the doc system's pinned-slug discipline (docs-ia.md): a
// slug is derived deterministically from the text and is stable under it.
//
// The rule is the familiar one (GitHub-flavored): lowercase, drop anything that
// is not a letter/number/space/hyphen, collapse runs of spaces/hyphens into one
// hyphen, trim leading/trailing hyphens. "Why a new language, now?" → "why-a-new-
// language-now". Duplicate slugs are disambiguated by the CALLER (location.md §6:
// preorder-first, `-2` suffixes) — this function is pure text → base slug.
export function headingSlug(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9 -]+/g, "") // keep letters, digits, spaces, hyphens
        .trim()
        .replace(/[\s-]+/g, "-") // runs of space/hyphen → one hyphen
        .replace(/^-+|-+$/g, ""); // no leading/trailing hyphen
}
//# sourceMappingURL=slug.js.map
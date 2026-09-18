// md — a purpose-built Markdown reader (docs/system-design/text-and-markdown.md). NOT a
// general CommonMark engine (no marked/markdown-it/micromark, no plugins, no
// HTML passthrough) — a tight, single-pass, allocation-light parser for
// exactly Declare's subset and nothing more, tuned for the reactive re-parse hot
// path. It is a STANDALONE LEAF: it imports nothing, so the compiler imports it
// to expand literals at build and the runtime imports it (only when dynamic
// Markdown is used) to parse at render — owned by neither.
//
// Output is the two-tier tree the `Markdown` component renders: a list of
// block nodes, each carrying inline nodes (or nested blocks). Raw HTML is NOT
// interpreted — every `<tag>` renders as literal text (the one documented
// deviation); character entities still decode (they are characters).

// ── the tree ─────────────────────────────────────────────────────────────────

export type Align = "left" | "center" | "right" | null;

export type Block =
  | { t: "heading"; level: number; inline: Inline[] }
  | { t: "paragraph"; inline: Inline[] }
  | { t: "code"; lang: string; text: string }
  // A preformatted flow that KEEPS its inline runs (spans/styles), unlike `code`
  // which is flat text. Only HTML `<pre>` produces it (Markdown fences stay `code`);
  // it is how syntax-colored code renders — monospace, whitespace preserved.
  | { t: "pre"; inline: Inline[] }
  | { t: "blockquote"; blocks: Block[] }
  // `loose` (CommonMark): items separated by a blank line, or containing a blank
  // line between blocks, render with paragraph spacing; a tight list is compact.
  | { t: "list"; ordered: boolean; start: number; loose: boolean; items: ListItem[] }
  | { t: "table"; align: Align[]; header: Inline[][]; rows: Inline[][][] }
  | { t: "rule" };

/** `task` is null for a plain item, true/false for a `- [x]`/`- [ ]` task. */
export interface ListItem { task: boolean | null; blocks: Block[] }

export type Inline =
  | { t: "text"; value: string }
  | { t: "strong"; inline: Inline[] }
  | { t: "em"; inline: Inline[] }
  | { t: "strike"; inline: Inline[] }
  | { t: "code"; value: string }
  | { t: "link"; href: string; title?: string; inline: Inline[] }
  // An inline image — CommonMark `![alt](src "title")` (and its reference forms).
  // `alt` is the flattened text of the bracket content (markup stripped, per spec);
  // the flow renders it as an inline replaced box (see markdown.ts).
  | { t: "image"; src: string; alt: string; title?: string }
  | { t: "br" }
  // An INLINE VIEW — a tag whose name is a class the program declares
  // (`<Issue id='142'/>`). The flow engine creates ONE real view of that class
  // and places it in the line as an atomic box, the way an inline image is
  // placed (markdown.ts). Both readers emit it, and only when they are given
  // the class predicate (ReadOptions.isClass) — with none, every `<tag>` keeps
  // exactly the meaning it has today. `attrs` keep their CASE (an attribute
  // names a slot, and slots are camelCase) and their raw string values; the
  // engine converts each by the slot's declared type. `key` is reserved — the
  // view's identity, never passed to the class.
  | { t: "view"; name: string; attrs: Readonly<Record<string, string | true>>; key?: string }
  // A named style — the Markdown reader never emits this; HTMLText does, for
  // `<span class="…">`, and the flow engine resolves the name to a bundle of Text
  // style attributes against the component's `styles` map. Presentation, not a role.
  | { t: "styled"; name: string; inline: Inline[] };

// ── entry ──────────────────────────────────────────────────────────────────

/** What a reader needs to know beyond the source — shared by both readers
 *  (html.ts takes the same bag), and every field optional so the default
 *  behaviour is exactly today's. */
export interface ReadOptions {
  /** True when `name` is a class the running program declares — the ONE gate
   *  that turns a tag into an inline view. Absent ⇒ no tag is ever a view. */
  isClass?: (name: string) => boolean;
  /** A refused inline view (a class tag that is not self-closing — this
   *  version places only self-closing tags): the reader keeps going and hands
   *  the sentence here, for the component's `unsupported` policy to report. */
  refuse?: (message: string) => void;
}

/** The options in force for the current (synchronous) parse — module-scoped
 *  like `currentRefs`, because the inline scan is reached through a dozen
 *  block-level call sites and threading a bag through all of them would be
 *  churn for nothing. */
let currentOpts: ReadOptions | null = null;

/** Scan a self-closing INLINE VIEW tag at `at` (where `src[at]` is `<`): a tag
 *  whose name is a class the program declares. Returns the class name, its
 *  attributes (case PRESERVED — an attribute names a slot, and slots are
 *  camelCase), the reserved `key`, whether the tag closed itself, and the index
 *  past `>`. Null when this `<` does not open a class tag at all, which leaves
 *  every other `<` to the meaning it already has. Shared by both readers. */
export function scanViewTag(src: string, at: number, isClass: (name: string) => boolean):
  { name: string; attrs: Record<string, string | true>; key?: string; selfClosing: boolean; end: number } | null {
  if (src[at] !== "<") return null;
  const gt = src.indexOf(">", at);
  if (gt === -1) return null;
  const inner = src.slice(at + 1, gt);
  const m = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(inner);
  if (m === null || !isClass(m[1])) return null;
  const selfClosing = inner.trimEnd().endsWith("/");
  const body = selfClosing ? inner.trimEnd().slice(0, -1).slice(m[0].length) : inner.slice(m[0].length);
  const attrs: Record<string, string | true> = {};
  let key: string | undefined;
  const re = /([A-Za-z_:][-A-Za-z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let a: RegExpExecArray | null;
  while ((a = re.exec(body)) !== null) {
    const raw = a[2] ?? a[3] ?? a[4];
    const val: string | true = raw === undefined ? true : decodeEntities(raw);
    // `key` is the view's IDENTITY, reserved: it never reaches the class.
    if (a[1] === "key") { if (val !== true) key = val; continue; }
    attrs[a[1]] = val;
  }
  return key === undefined
    ? { name: m[1], attrs, selfClosing, end: gt + 1 }
    : { name: m[1], attrs, key, selfClosing, end: gt + 1 };
}

/** Parse a Markdown document into its block tree. */
export function parse(src: string, opts?: ReadOptions): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  // Link reference definitions (`[label]: dest "title"`) are collected FIRST and
  // their lines blanked, so a `[text][label]` / `[label]` anywhere — even before
  // the definition — resolves. The map is document-scoped (module-level, set for
  // the duration of this synchronous parse); a standalone parseInline call with
  // no document context simply finds no definitions and leaves refs literal.
  const prev = currentRefs;
  const prevOpts = currentOpts;
  currentRefs = collectDefs(lines);
  currentOpts = opts ?? null;
  try { return parseBlocks(lines, 0, lines.length); }
  finally { currentRefs = prev; currentOpts = prevOpts; }
}

/** Link reference definitions in scope for the current document parse. */
let currentRefs: Map<string, RefDef> | null = null;
interface RefDef { href: string; title: string }

/** Normalize a link label for lookup (CommonMark: trim, collapse internal
 *  whitespace, case-fold). */
function normLabel(s: string): string { return s.trim().replace(/\s+/g, " ").toLowerCase(); }

/** Collect `[label]: dest "title"` definitions, blanking their lines so the block
 *  scan emits nothing for them. A definition sits at a block boundary (start of
 *  doc, or after a blank / another definition) and never inside a fenced code
 *  block or mid-paragraph — matching CommonMark, and so a `[id]:` line that is
 *  really paragraph text is left alone. First definition of a label wins. */
function collectDefs(lines: string[]): Map<string, RefDef> {
  const refs = new Map<string, RefDef>();
  let inFence = false, fenceCh = "";
  let atBoundary = true;   // true at doc start, after a blank line, or after a def
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const fm = /^\s{0,3}(```+|~~~+)/.exec(l);
    if (fm) { if (!inFence) { inFence = true; fenceCh = fm[1][0]; } else if (l.trim().startsWith(fenceCh.repeat(3))) inFence = false; atBoundary = false; continue; }
    if (inFence) { atBoundary = false; continue; }
    if (l.trim() === "") { atBoundary = true; continue; }
    const dm = atBoundary ? /^ {0,3}\[([^\]]+)\]:\s*(.+?)\s*$/.exec(l) : null;
    if (dm) {
      const parsed = parseDefValue(dm[2]);
      if (parsed !== null) { const key = normLabel(dm[1]); if (!refs.has(key)) refs.set(key, parsed); lines[i] = ""; atBoundary = true; continue; }
    }
    atBoundary = false;
  }
  return refs;
}

/** The `dest "title"` tail of a definition line: a `<dest>` or bare-token
 *  destination, then an optional quoted/parenthesized title. */
function parseDefValue(val: string): RefDef | null {
  let i = 0; const skip = () => { while (i < val.length && /\s/.test(val[i])) i++; };
  skip();
  let href = "";
  if (val[i] === "<") { const c = val.indexOf(">", i + 1); if (c === -1) return null; href = val.slice(i + 1, c); i = c + 1; }
  else { const s = i; while (i < val.length && !/\s/.test(val[i])) i++; href = val.slice(s, i); }
  if (href === "") return null;
  skip();
  let title = "";
  if (i < val.length && (val[i] === '"' || val[i] === "'" || val[i] === "(")) {
    const cq = val[i] === "(" ? ")" : val[i];
    const c = val.indexOf(cq, i + 1);
    if (c !== -1) title = val.slice(i + 1, c);
  }
  return { href: decodeEntities(href), title: decodeEntities(title) };
}

// ── block phase ──────────────────────────────────────────────────────────────
// Line-oriented: consume the line window [lo, hi) top-down, each construct
// eating the lines it owns. Indentation is measured in leading spaces so nested
// lists / quotes recurse on a de-indented slice.

const RE_ATX = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RE_FENCE = /^(```+|~~~+)\s*([^`]*)$/;
const RE_RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const RE_BULLET = /^(\s*)([-*+])\s+(.*)$/;
const RE_ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const RE_QUOTE = /^\s*>\s?(.*)$/;
const RE_TASK = /^\[([ xX])\]\s+(.*)$/;
const RE_SETEXT = /^ {0,3}(=+|-+)\s*$/;

function parseBlocks(lines: string[], lo: number, hi: number): Block[] {
  const out: Block[] = [];
  let i = lo;
  while (i < hi) {
    const line = lines[i];

    if (line.trim() === "") { i++; continue; }

    // An HTML comment is annotation, never content — assembler markers,
    // editorial notes — so a comment-opening line consumes through its `-->`
    // (however many lines away; unclosed runs to the end) and emits nothing.
    // Text after the close on the same line re-enters the block scan. A
    // comment INSIDE a fence is code and never reaches here (the fence branch
    // owns its lines); a comment mid-paragraph is the inline scan's case.
    if (line.trimStart().startsWith("<!--")) {
      let j = i, k = line.indexOf("-->", line.indexOf("<!--") + 4);
      while (k === -1 && ++j < hi) k = lines[j].indexOf("-->");
      if (j >= hi) break;
      const rest = lines[j].slice(k + 3);
      if (rest.trim() !== "") { lines[j] = rest; i = j; } else i = j + 1;
      continue;
    }

    // Thematic break (before list — `***` is a rule, not a bullet).
    if (RE_RULE.test(line)) { out.push({ t: "rule" }); i++; continue; }

    // ATX heading.
    const atx = RE_ATX.exec(line);
    if (atx) { out.push({ t: "heading", level: atx[1].length, inline: parseInline(atx[2]) }); i++; continue; }

    // Fenced code block.
    const fence = RE_FENCE.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const body: string[] = [];
      let j = i + 1;
      for (; j < hi; j++) {
        if (lines[j].trimStart().startsWith(marker.repeat(3)) && lines[j].trim().replace(new RegExp(`^\\${marker}+`), "").trim() === "") break;
        body.push(lines[j]);
      }
      out.push({ t: "code", lang: fence[2].trim(), text: body.join("\n") });
      i = j < hi ? j + 1 : j;
      continue;
    }

    // Indented code block (4+ spaces, not inside a list context here).
    if (/^ {4}/.test(line)) {
      const body: string[] = [];
      let j = i;
      for (; j < hi; j++) {
        if (lines[j].trim() === "") { body.push(""); continue; }
        if (!/^ {4}/.test(lines[j])) break;
        body.push(lines[j].slice(4));
      }
      while (body.length && body[body.length - 1] === "") body.pop();
      out.push({ t: "code", lang: "", text: body.join("\n") });
      i = j;
      continue;
    }

    // Blockquote — gather the run of quoted lines, strip one `>`, recurse.
    if (RE_QUOTE.test(line)) {
      const inner: string[] = [];
      let j = i;
      for (; j < hi; j++) {
        const q = RE_QUOTE.exec(lines[j]);
        if (q) inner.push(q[1]);
        else if (lines[j].trim() === "") break;
        else inner.push(lines[j]); // lazy continuation
      }
      out.push({ t: "blockquote", blocks: parseBlocks(inner, 0, inner.length) });
      i = j;
      continue;
    }

    // GFM table — a header row followed by a delimiter row of dashes/colons.
    if (line.includes("|") && i + 1 < hi && isTableDelim(lines[i + 1])) {
      const align = parseAlignRow(lines[i + 1]);
      const header = splitRow(line).map((c) => parseInline(c));
      const rows: Inline[][][] = [];
      let j = i + 2;
      for (; j < hi && lines[j].includes("|") && lines[j].trim() !== ""; j++) {
        rows.push(splitRow(lines[j]).map((c) => parseInline(c)));
      }
      out.push({ t: "table", align, header, rows });
      i = j;
      continue;
    }

    // List (bullet or ordered) — one block owns the whole contiguous list.
    const bullet = RE_BULLET.exec(line);
    const ordered = RE_ORDERED.exec(line);
    if (bullet || ordered) {
      const [list, next] = parseList(lines, i, hi);
      out.push(list);
      i = next;
      continue;
    }

    // Paragraph — accumulate until a blank line, a block-starting line, or a
    // setext underline (which turns the lines gathered so far into a heading).
    const para: string[] = [];
    let j = i;
    let heading: Block | null = null;
    for (; j < hi; j++) {
      const l = lines[j];
      if (l.trim() === "") break;
      // A `===`/`---` underline directly under paragraph text is a setext heading
      // (CommonMark §4.3), checked BEFORE the thematic-break rule: a `---` under a
      // paragraph is an h2, while a `---` after a blank (no paragraph gathered) was
      // already claimed as a rule up top.
      if (para.length > 0) {
        const st = RE_SETEXT.exec(l);
        if (st) { heading = { t: "heading", level: st[1][0] === "=" ? 1 : 2, inline: parseInline(para.join("\n")) }; j++; break; }
      }
      if (RE_RULE.test(l) || RE_ATX.test(l) || RE_FENCE.test(l) || RE_QUOTE.test(l) || RE_BULLET.test(l) || RE_ORDERED.test(l)) break;
      para.push(l.trim());
    }
    out.push(heading ?? { t: "paragraph", inline: parseInline(para.join("\n")) });
    i = j;
  }
  return out;
}

/** A contiguous list beginning at `start`. Items are grouped by marker kind;
 *  a line indented past the marker belongs to the current item (nested blocks
 *  recurse). Returns the list node and the index past it. */
function parseList(lines: string[], start: number, hi: number): [Block, number] {
  const first = RE_BULLET.exec(lines[start]) ?? RE_ORDERED.exec(lines[start])!;
  const ordered = !RE_BULLET.test(lines[start]);
  const startNum = ordered ? parseInt(RE_ORDERED.exec(lines[start])![2], 10) : 1;
  const baseIndent = first[1].length;
  const items: ListItem[] = [];
  // Looseness (CommonMark): a blank line BETWEEN two items, or between two blocks
  // WITHIN an item, makes the whole list loose (paragraph spacing); otherwise it
  // is tight (compact). `prevTrailingBlank` carries a just-ended item's trailing
  // blank forward, counting only when another sibling actually follows.
  let loose = false, prevTrailingBlank = false;
  let i = start;

  while (i < hi) {
    const m = RE_BULLET.exec(lines[i]) ?? RE_ORDERED.exec(lines[i]);
    // End this list at: a non-item line, a differently-indented marker (not our
    // sibling), or a marker whose TYPE flipped (bullet↔ordered) — a type switch at
    // the same indent begins a NEW list, not another item of this one. Without the
    // last case an ordered list right after a bullet list was absorbed into it (and
    // rendered with the wrong markers).
    if (!m || m[1].length !== baseIndent || (RE_BULLET.test(lines[i]) === ordered)) break;
    if (items.length > 0 && prevTrailingBlank) loose = true; // a blank line separated the items
    // Collect this item: the marker line plus deeper-indented continuation.
    const owned: string[] = [m[3]];
    let j = i + 1;
    const contIndent = baseIndent + (lines[i].length - lines[i].trimStart().length === baseIndent ? (m[2].length + 1) : 2);
    // Lazy continuation applies only to lines directly following the item's text.
    // Once a blank line intervenes, a line must be indented to `contIndent` to stay
    // in the item — otherwise the item (and, unless the line is a new marker, the
    // list) ends. Without this, any prose after a list is swallowed into its last item.
    let blanked = false;
    for (; j < hi; j++) {
      if (lines[j].trim() === "") { owned.push(""); blanked = true; continue; }
      const indent = lines[j].length - lines[j].trimStart().length;
      const isMarker = RE_BULLET.test(lines[j]) || RE_ORDERED.test(lines[j]);
      if (isMarker && indent <= baseIndent) break; // next sibling / end
      if (blanked && indent < contIndent) break;   // blank then de-indented → item ends
      owned.push(lines[j].slice(Math.min(indent, contIndent)));
    }
    const hadTrailingBlank = owned.length > 0 && owned[owned.length - 1] === "";
    while (owned.length && owned[owned.length - 1] === "") owned.pop();
    if (owned.includes("")) loose = true; // a blank line between two blocks inside the item
    prevTrailingBlank = hadTrailingBlank;
    // Task marker on the item's first line.
    let task: boolean | null = null;
    const tk = RE_TASK.exec(owned[0] ?? "");
    if (tk) { task = tk[1].toLowerCase() === "x"; owned[0] = tk[2]; }
    items.push({ task, blocks: parseBlocks(owned, 0, owned.length) });
    i = j;
  }
  return [{ t: "list", ordered, start: startNum, loose, items }, i];
}

function isTableDelim(line: string): boolean {
  return /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line) && line.includes("-");
}
function parseAlignRow(line: string): Align[] {
  return splitRawRow(line).map((c) => {
    const s = c.trim();
    const l = s.startsWith(":"), r = s.endsWith(":");
    return l && r ? "center" : r ? "right" : l ? "left" : null;
  });
}
function splitRow(line: string): string[] {
  return splitRawRow(line).map((c) => c.trim());
}
/** Split a `|`-delimited row, honoring `\|` escapes and dropping the outer
 *  pipes' empty edge cells. */
function splitRawRow(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\" && line[i + 1] === "|") { cur += "|"; i++; continue; }
    if (line[i] === "|") { cells.push(cur); cur = ""; continue; }
    cur += line[i];
  }
  cells.push(cur);
  if (cells.length && cells[0].trim() === "") cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
  return cells;
}

// ── inline phase ─────────────────────────────────────────────────────────────
// A single left-to-right scan (tokenize) followed by CommonMark's delimiter-run
// emphasis resolution (process-emphasis) — the spec algorithm, so `***x***`,
// adjacent runs, `_`-intraword rules, and the rule-of-three all match a
// conformant renderer (docs/system-design/text-and-markdown.md). Code spans bind
// tightest, then links, then emphasis/strike; autolinks, escapes, entities, and
// hard breaks are resolved in the tokenize pass. Raw `<…>` that is not an
// autolink stays literal (the ruling).

const PUNCT = new Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~".split(""));
const isWs = (ch: string | undefined): boolean => ch === undefined || /\s/.test(ch);
const isPunct = (ch: string | undefined): boolean => ch !== undefined && PUNCT.has(ch);

// A node in the emphasis-resolution list: either a finished inline, or a run of
// emphasis delimiters (`*`/`_`/`~`) held as its literal text plus the flags the
// process-emphasis pass consumes. The list is doubly linked so a matched pair
// can lift the nodes between it into one em/strong/strike wrapper in place.
interface DelimInfo { ch: string; num: number; orig: number; canOpen: boolean; canClose: boolean; }
interface Node { inline: Inline | null; delim: DelimInfo | null; prev: Node | null; next: Node | null; }

export function parseInline(src: string, opts?: ReadOptions): Inline[] {
  const o = opts ?? currentOpts;
  const head: Node = { inline: null, delim: null, prev: null, next: null }; // sentinel
  let tail = head;
  const delims: Node[] = [];
  let buf = "";
  const push = (inline: Inline | null, delim: DelimInfo | null): Node => {
    const n: Node = { inline, delim, prev: tail, next: null };
    tail.next = n; tail = n; return n;
  };
  const flush = () => { if (buf !== "") { push({ t: "text", value: decodeEntities(buf) }, null); buf = ""; } };

  let i = 0;
  while (i < src.length) {
    const c = src[i];

    // Backslash escape of an ASCII punctuation char (or a hard break at EOL).
    if (c === "\\") {
      if (i + 1 < src.length && PUNCT.has(src[i + 1])) { buf += src[i + 1]; i += 2; continue; }
      if (src[i + 1] === "\n") { flush(); push({ t: "br" }, null); i += 2; continue; }
    }

    // Code span — a run of N backticks closes on the next run of exactly N.
    if (c === "`") {
      let n = 0; while (src[i + n] === "`") n++;
      const close = src.indexOf("`".repeat(n), i + n);
      const afterClose = close + n;
      if (close !== -1 && (src[afterClose] !== "`" || n === countBackticksAt(src, close))) {
        flush();
        push({ t: "code", value: src.slice(i + n, close).replace(/^ | $/g, "") }, null);
        i = afterClose;
        continue;
      }
    }

    // Link `[text](dest "title")` or image `![alt](dest "title")`, plus the
    // reference forms `[text][label]`, `[text][]` (collapsed) and `[label]`
    // (shortcut) resolved against the document's collected definitions.
    if (c === "[" || (c === "!" && src[i + 1] === "[")) {
      const image = c === "!";
      const open = image ? i + 1 : i;             // the `[`
      const close = matchBracket(src, open);
      if (close !== -1) {
        // Inline form: a `(` right after `]` begins a destination.
        if (src[close + 1] === "(") {
          const dest = parseLinkDest(src, close + 2);
          if (dest !== null) {
            flush();
            emitLinkOrImage(push, image, dest, src.slice(open + 1, close));
            i = dest.end;
            continue;
          }
        }
        // Reference form: [text][label] / [text][] / [label].
        let label: string | null = null, refEnd = close + 1;
        if (src[close + 1] === "[") {
          const rc = matchBracket(src, close + 1);
          if (rc !== -1) { const inside = src.slice(close + 2, rc); label = inside.trim() === "" ? src.slice(open + 1, close) : inside; refEnd = rc + 1; }
        } else {
          label = src.slice(open + 1, close); // shortcut: the text itself is the label
        }
        if (label !== null) {
          const def = currentRefs?.get(normLabel(label));
          if (def !== undefined && def !== null) {
            flush();
            emitLinkOrImage(push, image, { href: def.href, title: def.title, end: refEnd }, src.slice(open + 1, close));
            i = refEnd;
            continue;
          }
        }
      }
    }

    // Autolink <https://…> (or a vanishing inline HTML comment).
    if (c === "<") {
      if (src.startsWith("<!--", i)) {
        const close = src.indexOf("-->", i + 4);
        i = close === -1 ? src.length : close + 3;
        continue;
      }
      // An INLINE VIEW: `<Issue id='142'/>`, where `Issue` is a class the
      // program declares. Read before the autolink test and ONLY for a name the
      // predicate claims, so every other `<` — an autolink, a raw HTML tag, a
      // lone `<` — keeps the meaning the ruling gave it.
      if (o?.isClass !== undefined) {
        const vt = scanViewTag(src, i, o.isClass);
        if (vt !== null) {
          if (vt.selfClosing) {
            flush();
            push(vt.key === undefined
              ? { t: "view", name: vt.name, attrs: vt.attrs }
              : { t: "view", name: vt.name, attrs: vt.attrs, key: vt.key }, null);
            i = vt.end;
            continue;
          }
          // Self-closing only, this version: report and leave the text literal
          // (which is what a raw tag has always rendered as in Markdown).
          o.refuse?.(`<${vt.name}> is an inline view, and an inline view must be self-closing — write <${vt.name}/>`);
        }
      }
      const gt = src.indexOf(">", i + 1);
      if (gt !== -1) {
        const url = src.slice(i + 1, gt);
        if (/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(url) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) {
          flush();
          const href = url.includes("@") && !url.includes(":") ? "mailto:" + url : url;
          push({ t: "link", href, inline: [{ t: "text", value: url }] }, null);
          i = gt + 1;
          continue;
        }
      }
      // else: a literal '<' (raw HTML is not interpreted) — fall through.
    }

    // A delimiter run: `*`/`_` (emphasis) or `~` (strike). Record its length and
    // whether it can open/close per the CommonMark flanking rules; the run's own
    // characters ride as this node's literal text, shrinking as delimiters pair.
    if (c === "*" || c === "_" || c === "~") {
      let n = 0; while (src[i + n] === c) n++;
      if (c === "~" && n < 2) { buf += "~".repeat(n); i += n; continue; } // a lone `~` is literal
      const before = i > 0 ? src[i - 1] : undefined;
      const after = i + n < src.length ? src[i + n] : undefined;
      const afterWs = isWs(after), afterPunct = isPunct(after);
      const beforeWs = isWs(before), beforePunct = isPunct(before);
      const leftFlank = !afterWs && (!afterPunct || beforeWs || beforePunct);
      const rightFlank = !beforeWs && (!beforePunct || afterWs || afterPunct);
      const canOpen = c === "_" ? leftFlank && (!rightFlank || beforePunct) : leftFlank;
      const canClose = c === "_" ? rightFlank && (!leftFlank || afterPunct) : rightFlank;
      flush();
      const node = push({ t: "text", value: c.repeat(n) }, { ch: c, num: n, orig: n, canOpen, canClose });
      delims.push(node);
      i += n;
      continue;
    }

    // Hard break: two+ trailing spaces before a newline; else a soft break.
    if (c === "\n") {
      if (buf.endsWith("  ")) { buf = buf.replace(/ +$/, ""); flush(); push({ t: "br" }, null); }
      else { flush(); buf = " "; flush(); }
      i++;
      continue;
    }

    buf += c;
    i++;
  }
  flush();

  processEmphasis(delims);
  return serialize(head.next);
}

/** CommonMark process-emphasis: pair closer delimiters with the nearest earlier
 *  opener of the same character, honoring the rule of three, and lift the nodes
 *  between into an em/strong (`*`,`_`) or strike (`~~`) wrapper. Unpaired
 *  delimiters keep their literal characters (a stray `*` renders as text). */
function processEmphasis(delims: readonly Node[]): void {
  // openers_bottom[ch][origLen % 3] — the earliest opener a closer may reach.
  const bottom: Record<string, number[]> = { "*": [-1, -1, -1], _: [-1, -1, -1], "~": [-1, -1, -1] };
  for (let ci = 0; ci < delims.length; ci++) {
    const closer = delims[ci].delim!;
    if (closer.num === 0 || !closer.canClose) continue;
    const ch = closer.ch;
    let oi = ci - 1;
    let openerIdx = -1;
    for (; oi > bottom[ch][closer.orig % 3]; oi--) {
      const opener = delims[oi].delim!;
      if (opener.num === 0 || opener.ch !== ch || !opener.canOpen) continue;
      // Rule of three: if either side can be both open and close, a pair whose
      // combined ORIGINAL lengths is a multiple of 3 is disallowed unless BOTH
      // lengths are themselves multiples of 3.
      const oddMatch = (closer.canOpen || opener.canClose) &&
        closer.orig % 3 !== 0 && (opener.orig + closer.orig) % 3 === 0;
      if (!oddMatch) { openerIdx = oi; break; }
    }
    if (openerIdx === -1) {
      // No opener: this delimiter can start none below here for this length class.
      bottom[ch][closer.orig % 3] = ci - 1;
      continue;
    }
    const openerNode = delims[openerIdx], closerNode = delims[ci];
    const opener = openerNode.delim!;
    const strong = ch !== "~" && closer.num >= 2 && opener.num >= 2;
    const strike = ch === "~";
    const used = strike ? 2 : strong ? 2 : 1;
    // Consume `used` characters from each run's literal text.
    opener.num -= used; closer.num -= used;
    (openerNode.inline as { t: "text"; value: string }).value = ch.repeat(opener.num);
    (closerNode.inline as { t: "text"; value: string }).value = ch.repeat(closer.num);
    // Lift the nodes strictly between opener and closer into the wrapper.
    const inner: Node['next'] = openerNode.next;
    const wrapped: Inline[] = [];
    for (let n = inner; n !== null && n !== closerNode; n = n.next) if (n.inline !== null) wrapped.push(n.inline);
    const kind: Inline["t"] = strike ? "strike" : strong ? "strong" : "em";
    const wrapper: Node = { inline: { t: kind, inline: wrapped } as Inline, delim: null, prev: openerNode, next: closerNode };
    openerNode.next = wrapper; closerNode.prev = wrapper;
    // Any delimiters that sat between opener and closer are now spent.
    for (let k = openerIdx + 1; k < ci; k++) delims[k].delim!.num = 0;
    // A fully-consumed opener/closer drops its (now empty) text node.
    if (opener.num === 0) unlink(openerNode);
    if (closer.num === 0) { unlink(closerNode); continue; }
    ci--; // the closer still has delimiters left — retry it against earlier openers
  }
}

/** Emit the finished inline list from the node chain (`head` = first node). A
 *  delimiter node that still carries text contributes it as literal. */
function serialize(head: Node | null): Inline[] {
  const out: Inline[] = [];
  for (let n = head; n !== null; n = n.next) {
    if (n.inline === null) continue;
    if (n.inline.t === "text" && n.inline.value === "") continue;
    out.push(n.inline);
  }
  return out;
}

function unlink(n: Node): void {
  if (n.prev !== null) n.prev.next = n.next;
  if (n.next !== null) n.next.prev = n.prev;
}

function countBackticksAt(s: string, at: number): number { let n = 0; while (s[at + n] === "`") n++; return n; }

/** Index of the `]` matching the `[` at `open`, honoring nesting. */
function matchBracket(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "\\") { i++; continue; }
    if (s[i] === "[") depth++;
    else if (s[i] === "]" && --depth === 0) return i;
  }
  return -1;
}

type Pusher = (inline: Inline | null, delim: DelimInfo | null) => Node;

/** Emit the resolved link or image node (shared by the inline and reference
 *  forms). An image's `alt` is the FLATTENED text of the bracket content — markup
 *  stripped, per CommonMark; a link keeps its parsed inline children. */
function emitLinkOrImage(push: Pusher, image: boolean, dest: { href: string; title: string; end: number }, inner: string): void {
  const title = dest.title !== "" ? dest.title : undefined;
  if (image) push({ t: "image", src: dest.href, alt: inlineText(parseInline(inner)), title }, null);
  else push({ t: "link", href: dest.href, title, inline: parseInline(inner) }, null);
}

/** The plain-text content of an inline sequence (link/image alt flattening). */
function inlineText(ns: Inline[]): string {
  let s = "";
  for (const n of ns) {
    if (n.t === "text" || n.t === "code") s += n.value;
    else if (n.t === "image") s += n.alt;
    else if ("inline" in n) s += inlineText(n.inline);
  }
  return s;
}

/** Parse a link/image destination + optional title, starting just after the `(`
 *  (CommonMark §6.6): a `<bracketed>` destination or a bare run with BALANCED
 *  parens (so a URL may itself contain `)`), then an optional `"title"`/`'title'`
 *  /`(title)`, then the closing `)`. Returns the href, title and the index past
 *  the `)`, or null if it is not a well-formed destination — in which case the
 *  caller leaves the `[` literal (and may still try a reference form). */
function parseLinkDest(src: string, from: number): { href: string; title: string; end: number } | null {
  let i = from;
  const skip = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  skip();
  let href = "";
  if (src[i] === "<") {
    const c = src.indexOf(">", i + 1);
    if (c === -1 || src.slice(i + 1, c).includes("\n")) return null;
    href = src.slice(i + 1, c); i = c + 1;
  } else {
    let depth = 0; const s = i;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === "\\" && i + 1 < src.length) { i++; continue; }
      if (/\s/.test(ch)) break;
      if (ch === "(") depth++;
      else if (ch === ")") { if (depth === 0) break; depth--; }
    }
    href = src.slice(s, i);
  }
  skip();
  let title = "";
  if (i < src.length && (src[i] === '"' || src[i] === "'" || src[i] === "(")) {
    const cq = src[i] === "(" ? ")" : src[i];
    const c = src.indexOf(cq, i + 1);
    if (c === -1) return null;
    title = src.slice(i + 1, c); i = c + 1;
    skip();
  }
  if (src[i] !== ")") return null;
  return { href: decodeEntities(href), title: decodeEntities(title), end: i + 1 };
}

// ── entities ─────────────────────────────────────────────────────────────────
// Numeric and a small set of named entities decode (they are characters, not
// markup — the ruling keeps this even as raw HTML tags stay literal).

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  copy: "©", reg: "®", trade: "™", hellip: "…", mdash: "—", ndash: "–",
  laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  times: "×", divide: "÷", deg: "°", plusmn: "±", middot: "·", bull: "•",
};

export function decodeEntities(s: string): string {
  if (s.indexOf("&") === -1) return s;
  return s.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (m, body: string) => {
    if (body[0] === "#") {
      const cp = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED[body.toLowerCase()] ?? m;
  });
}

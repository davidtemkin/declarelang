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
  // A preformatted flow that KEEPS its inline runs (spans/accents), unlike `code`
  // which is flat text. Only HTML `<pre>` produces it (Markdown fences stay `code`);
  // it is how syntax-coloured code renders — monospace, whitespace preserved.
  | { t: "pre"; inline: Inline[] }
  | { t: "blockquote"; blocks: Block[] }
  | { t: "list"; ordered: boolean; start: number; items: ListItem[] }
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
  | { t: "link"; href: string; inline: Inline[] }
  | { t: "br" }
  // A named visual accent (a themed text fill) — the Markdown reader never emits
  // this; HTMLText does, for `<span class="…">`, and the flow engine resolves the
  // name to a Fill against the component's `accents` map. Presentation, not a role.
  | { t: "fill"; name: string; inline: Inline[] };

// ── entry ──────────────────────────────────────────────────────────────────

/** Parse a Markdown document into its block tree. */
export function parse(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  return parseBlocks(lines, 0, lines.length);
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

function parseBlocks(lines: string[], lo: number, hi: number): Block[] {
  const out: Block[] = [];
  let i = lo;
  while (i < hi) {
    const line = lines[i];

    if (line.trim() === "") { i++; continue; }

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
      const header = splitRow(line).map(parseInline);
      const rows: Inline[][][] = [];
      let j = i + 2;
      for (; j < hi && lines[j].includes("|") && lines[j].trim() !== ""; j++) {
        rows.push(splitRow(lines[j]).map(parseInline));
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

    // Paragraph — accumulate until a blank line or a block-starting line.
    const para: string[] = [];
    let j = i;
    for (; j < hi; j++) {
      const l = lines[j];
      if (l.trim() === "") break;
      if (RE_RULE.test(l) || RE_ATX.test(l) || RE_FENCE.test(l) || RE_QUOTE.test(l) || RE_BULLET.test(l) || RE_ORDERED.test(l)) break;
      para.push(l.trim());
    }
    out.push({ t: "paragraph", inline: parseInline(para.join("\n")) });
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
  let i = start;

  while (i < hi) {
    const m = RE_BULLET.exec(lines[i]) ?? RE_ORDERED.exec(lines[i]);
    // End this list at: a non-item line, a differently-indented marker (not our
    // sibling), or a marker whose TYPE flipped (bullet↔ordered) — a type switch at
    // the same indent begins a NEW list, not another item of this one. Without the
    // last case an ordered list right after a bullet list was absorbed into it (and
    // rendered with the wrong markers).
    if (!m || m[1].length !== baseIndent || (RE_BULLET.test(lines[i]) === ordered)) break;
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
    while (owned.length && owned[owned.length - 1] === "") owned.pop();
    // Task marker on the item's first line.
    let task: boolean | null = null;
    const tk = RE_TASK.exec(owned[0] ?? "");
    if (tk) { task = tk[1].toLowerCase() === "x"; owned[0] = tk[2]; }
    items.push({ task, blocks: parseBlocks(owned, 0, owned.length) });
    i = j;
  }
  return [{ t: "list", ordered, start: startNum, items }, i];
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
// A single left-to-right scan over one run of text. Code spans bind tightest,
// then links, emphasis/strike (a marker finds its matching closer and recurses
// on the inner run), autolinks, escapes, entities, and hard breaks. Raw `<…>`
// that is not an autolink stays literal (the ruling).

const PUNCT = new Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~".split(""));

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => { if (buf !== "") { out.push({ t: "text", value: decodeEntities(buf) }); buf = ""; } };
  let i = 0;
  while (i < src.length) {
    const c = src[i];

    // Backslash escape of an ASCII punctuation char.
    if (c === "\\") {
      if (i + 1 < src.length && PUNCT.has(src[i + 1])) { buf += src[i + 1]; i += 2; continue; }
      if (src[i + 1] === "\n") { flush(); out.push({ t: "br" }); i += 2; continue; }
    }

    // Code span — a run of N backticks closes on the next run of exactly N.
    if (c === "`") {
      let n = 0; while (src[i + n] === "`") n++;
      const close = src.indexOf("`".repeat(n), i + n);
      const afterClose = close + n;
      if (close !== -1 && (src[afterClose] !== "`" || n === countBackticksAt(src, close))) {
        flush();
        out.push({ t: "code", value: src.slice(i + n, close).replace(/^ | $/g, "") });
        i = afterClose;
        continue;
      }
    }

    // Link: [inline](href)
    if (c === "[") {
      const close = matchBracket(src, i);
      if (close !== -1 && src[close + 1] === "(") {
        const end = src.indexOf(")", close + 2);
        if (end !== -1) {
          flush();
          const href = src.slice(close + 2, end).trim();
          out.push({ t: "link", href, inline: parseInline(src.slice(i + 1, close)) });
          i = end + 1;
          continue;
        }
      }
    }

    // Autolink <https://…>
    if (c === "<") {
      const gt = src.indexOf(">", i + 1);
      if (gt !== -1) {
        const url = src.slice(i + 1, gt);
        if (/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(url) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) {
          flush();
          const href = url.includes("@") && !url.includes(":") ? "mailto:" + url : url;
          out.push({ t: "link", href, inline: [{ t: "text", value: url }] });
          i = gt + 1;
          continue;
        }
      }
      // else: a literal '<' (raw HTML is not interpreted) — fall through.
    }

    // Emphasis / strong / strike — longest marker first.
    const delim = c === "~" ? "~~" : c === "*" || c === "_" ? (src[i + 1] === c ? c + c : c) : "";
    if (delim && (c !== "~" || src[i + 1] === "~")) {
      const kind = delim.length === 2 ? (c === "~" ? "strike" : "strong") : "em";
      const close = findCloser(src, i + delim.length, delim);
      if (close !== -1) {
        flush();
        const inner = parseInline(src.slice(i + delim.length, close));
        out.push({ t: kind, inline: inner } as Inline);
        i = close + delim.length;
        continue;
      }
    }

    // Hard break: two+ trailing spaces before a newline.
    if (c === "\n") {
      if (buf.endsWith("  ")) { buf = buf.replace(/ +$/, ""); flush(); out.push({ t: "br" }); }
      else { flush(); buf = " "; flush(); } // soft break → space
      i++;
      continue;
    }

    buf += c;
    i++;
  }
  flush();
  return out;
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

/** Index of the next occurrence of `delim` that isn't backslash-escaped and
 *  isn't part of a longer run (so `*` doesn't match inside `**`). */
function findCloser(s: string, from: number, delim: string): number {
  const ch = delim[0];
  for (let i = from; i < s.length; i++) {
    if (s[i] === "\\") { i++; continue; }
    if (s[i] === "`") { const c = s.indexOf("`", i + 1); if (c !== -1) { i = c; continue; } }
    if (s.startsWith(delim, i)) {
      if (delim.length === 1 && (s[i + 1] === ch || s[i - 1] === ch)) continue; // run of 2 → not a single closer
      if (i === from) continue; // empty span
      return i;
    }
  }
  return -1;
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

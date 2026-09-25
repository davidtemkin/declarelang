// The `:path` value mode's lexical layer (language §9: "a leading `:` marks a
// datapath — its own value mode, neither literal nor TypeScript"). A `{ }`
// body is TypeScript *plus datapath islands*: `:location.city` may appear
// anywhere an expression may. This module finds those islands — so compile.ts
// can lower each to its explicit runtime form at EMISSION
// (`this.$data(["…"])` — data-paths.md §5's emitted plans) and neutralize
// them before handing the body to the TypeScript parser, and so expr.ts can
// perform the same rewrite at link time on the DIRECT-INSTANTIATE path (an
// unchecked, un-compiled tree — the dev and test affordance). A compiled
// program reaches the runtime island-free, which is what lets declarec
// production builds stub this scanner out entirely (splitPath stays — it is
// the attribute-path currency, not the scanner).
//
// Disambiguation: `:` also appears in TS as the ternary's second clause, an
// object literal's key separator, a label, and a type annotation. The rule —
// the same class of prev-token heuristic every JS lexer uses for regex-vs-
// division — is positional: a `:` beginning a datapath sits where an
// EXPRESSION is expected (after `(`, `,`, an operator, `?`, `=`, `return`, at
// the start), while every TS colon follows a completed expression or a name
// (`cond ?`-branches end in an operand; `key:` and `x: T` follow identifiers).
// So: a `:` opens a datapath iff the previous significant token cannot end an
// expression and an identifier follows. Shares the parser's known, accepted
// regex-literal gap (a `/}/`-style regex defeats any heuristic short of full
// lexing — HANDOFF §R4); real lexing arrives with the tsc front-end.

/** One segment of a compiled path PLAN (data-paths.md §5 emitted plans;
 *  jsonpath-spelling.md — RULED 2026-07-30). A plain string is a NAME
 *  (quoted-name selectors collapse to strings — `['my-key']` is the name
 *  "my-key"); the tagged forms are the RFC 9535 v1 selectors. */
export type PathSeg =
  | string                                              // name
  | { i: number }                                       // index (negative from the end)
  | { s: [number | null, number | null, number | null] } // slice start:end:step (null = RFC default)
  | { w: 1 }                                            // wildcard
  | { c: number };                                      // a computed key `[( expr )]` — the island's computed[c]

/** Does this plan select MANY (slice/wildcard present)? Names and indices are
 *  singular; a selective path is legal in reads and `:path[]` replication,
 *  refused on `<->` and bare `datapath =` (the D4 §4 table). */
export const isSelective = (plan: readonly PathSeg[]): boolean =>
  plan.some((s) => typeof s !== "string" && !("i" in s) && !("c" in s));

/** A singular plan's STATIC segments — names pass, a non-negative index is
 *  its string key. Null when the place needs the data to resolve (a negative
 *  index reads the array's length) or the plan selects many — the cases a
 *  cursor or write target refuses with a pointed error. */
export function staticSegs(plan: readonly PathSeg[]): string[] | null {
  const out: string[] = [];
  for (const s of plan) {
    if (typeof s === "string") out.push(s);
    else if ("i" in s && s.i >= 0) out.push(String(s.i));
    else return null;
  }
  return out;
}

/** One `:path` occurrence in a body, offsets in body-source coordinates.
 *  `many` marks the replication form `:items[]`. `plan` is present exactly
 *  when the spelling used anything beyond dot-idents (selectors, quoted
 *  names) — absent means `splitPath(path)` IS the plan. `trouble` carries a
 *  malformed-selector refusal found during the scan. */
export interface PathIsland {
  start: number;
  end: number;
  path: string;
  many: boolean;
  plan?: PathSeg[];
  trouble?: string | null;
  /** The TypeScript of each computed key `[( expr )]`, as spans of the body —
   *  left in place by every rewrite, so what they read is resolved (and their
   *  own islands lowered) like any other code. */
  computed?: { start: number; end: number }[];
}

/** RFC 9535 string-literal escapes for quoted name selectors. Returns null on
 *  a bad escape. */
function unescapeName(body: string, quote: string): string | null {
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== "\\") { out += c; continue; }
    const e = body[++i];
    if (e === undefined) return null;
    if (e === "b") out += "\b";
    else if (e === "t") out += "\t";
    else if (e === "n") out += "\n";
    else if (e === "f") out += "\f";
    else if (e === "r") out += "\r";
    else if (e === "/") out += "/";
    else if (e === "\\") out += "\\";
    else if (e === quote) out += quote;
    else if (e === "u") {
      const hex = body.slice(i + 1, i + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else return null;
  }
  return out;
}

/** Parse one bracket selector's interior (trimmed). The refusals are the D4
 *  ruling's named gates — filters, functions, unions — each pointing at the
 *  living idiom. */
export function parsePathSpec(raw: string): { seg: PathSeg; text: string } | { error: string } {
  const t = raw.trim();
  if (t === "*") return { seg: { w: 1 }, text: "[*]" };
  if (t.startsWith("?")) {
    return { error: "filter selectors ([?…]) are not in the path subset yet (jsonpath-spelling.md §5) — derive the subset in a Dataset [ contents = { … } ] and bind to that" };
  }
  if (t.startsWith("'") || t.startsWith('"')) {
    const q = t[0];
    if (t.length < 2 || !t.endsWith(q)) return { error: "unterminated quoted name" };
    const un = unescapeName(t.slice(1, -1), q);
    if (un === null) return { error: "bad escape in a quoted name (RFC 9535 string escapes: \\\\ \\' \\\" \\b \\t \\n \\f \\r \\uXXXX)" };
    return { seg: un, text: `[${JSON.stringify(un)}]` };
  }
  if (t.includes(",")) {
    return { error: "union selectors ([a, b]) are not in the path subset (jsonpath-spelling.md §5) — write separate reads, or derive the set in a Dataset [ contents = { … } ]" };
  }
  const parts = t.split(":");
  if (parts.length > 3) return { error: "a slice is [start:end] or [start:end:step]" };
  const nums: (number | null)[] = [];
  for (const p of parts) {
    const s = p.trim();
    if (s === "") { nums.push(null); continue; }
    if (!/^-?\d+$/.test(s)) return { error: "a path selector is [index], [start:end:step], [*], or ['name']" };
    nums.push(parseInt(s, 10));
  }
  if (parts.length === 1) {
    if (nums[0] === null) return { error: "a path selector is [index], [start:end:step], [*], or ['name']" };
    return { seg: { i: nums[0] }, text: `[${nums[0]}]` };
  }
  while (nums.length < 3) nums.push(null);
  const text = `[${nums.map((v) => (v === null ? "" : String(v))).join(":").replace(/:$/, "")}]`;
  return { seg: { s: nums as [number | null, number | null, number | null] }, text };
}

/** Split a dot-path into segments ("" → the cursor itself: no segments).
 *  Array indices are ordinary string segments — JS containers index
 *  identically with "2" and 2, so the path currency stays one type. */
export const splitPath = (path: string): string[] => (path === "" ? [] : path.split("."));

// Identifier-shaped words that may directly PRECEDE an expression — after
// these, a `:` still opens a datapath (`return :title`, `yield :x`).
const NON_ENDING = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "do", "else", "case",
  "void", "delete", "throw", "yield", "await",
]);

const isIdentStart = (c: string) =>
  (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_" || c === "$";
const isIdentPart = (c: string) => isIdentStart(c) || (c >= "0" && c <= "9");

/** Every datapath island in a `{ }` body, in source order. Pure lexical scan,
 *  honoring the same TS islands as the parser's brace scan (strings,
 *  templates — whose `${ }` substitutions are scanned recursively, since a
 *  datapath is legal inside them — and comments). */
export function scanDatapaths(src: string): PathIsland[] {
  const out: PathIsland[] = [];
  const n = src.length;
  let i = 0;

  const string = (quote: string): void => {
    i++;
    while (i < n && src[i] !== quote && src[i] !== "\n") {
      if (src[i] === "\\") i++;
      i++;
    }
    if (i < n) i++;
  };

  const template = (): void => {
    i++; // opening backtick
    while (i < n && src[i] !== "`") {
      if (src[i] === "\\") { i += 2; continue; }
      if (src[i] === "$" && src[i + 1] === "{") { i += 2; code(true); continue; }
      i++;
    }
    if (i < n) i++;
  };

  /** Scan a code region: the whole body, or (inSubstitution) through the `}`
   *  closing a template's `${ }`. `ends` tracks whether the last significant
   *  token can end an expression — the disambiguation state. */
  const code = (inSubstitution: boolean): void => {
    let depth = 0;
    let ends = false;
    while (i < n) {
      const c = src[i];
      if (c === " " || c === "\t" || c === "\r" || c === "\n") { i++; continue; }
      if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
      if (c === "/" && src[i + 1] === "*") {
        i += 2;
        while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
        i += 2;
        continue;
      }
      if (c === '"' || c === "'") { string(c); ends = true; continue; }
      if (c === "`") { template(); ends = true; continue; }
      if (c === "{") { depth++; i++; ends = false; continue; }
      if (c === "}") {
        if (inSubstitution && depth === 0) { i++; return; }
        depth--; i++; ends = true; // an object literal's end is an operand
        continue;
      }
      if (c === ":" && !ends && (isIdentStart(src[i + 1]) || src[i + 1] === "@")) {
        const start = i;
        i++;
        let path = "";
        const plan: PathSeg[] = [];
        let planful = false; // any piece beyond dot-idents (selector, quoted name)
        let trouble: string | null = null;
        let many = false;
        const computed: { start: number; end: number }[] = [];
        if (src[i] === "@") {
          // `:@` — the record itself (JSONPath's current node); selectors may follow
          i++;
          path = "@";
          planful = true;
        } else {
          let name = "";
          while (i < n && isIdentPart(src[i])) name += src[i++];
          path += name;
          plan.push(name);
        }
        for (;;) {
          if (src[i] === "." && isIdentStart(src[i + 1])) {
            let j = i + 1;
            let name = "";
            while (j < n && isIdentPart(src[j])) name += src[j++];
            // `.method(…)` is a CALL on the read value, not a path segment —
            // data fields are not callables. (`:rows[1:3].map(…)` maps over
            // the selection; `:t.toFixed(2)` formats the read.) The path ends
            // before the dot.
            if (src[j] === "(") break;
            i = j;
            path += "." + name;
            plan.push(name);
            continue;
          }
          if (src[i] === "." && src[i + 1] === "*") {
            i += 2;
            path += "[*]"; // `.​*` normalizes to `[*]` — one canonical form (D4 §2)
            plan.push({ w: 1 });
            planful = true;
            continue;
          }
          if (src[i] === "[" && src[i + 1] === "(") {
            // `[( expr )]` — a key computed by TypeScript. The expression runs to
            // the `)]` that closes it at depth zero; it is scanned as code by the
            // caller's pass over the whole body, so its own reads are found there.
            const open = i + 2;
            let j = open, depth = 0, q: string | null = null;
            while (j < n) {
              const ch = src[j];
              if (q !== null) { if (ch === "\\") j++; else if (ch === q) q = null; j++; continue; }
              if (ch === "'" || ch === '"' || ch === "`") { q = ch; j++; continue; }
              if (ch === "(" || ch === "[" || ch === "{") depth++;
              else if (ch === ")" && depth === 0 && src[j + 1] === "]") break;
              else if (ch === ")" || ch === "]" || ch === "}") depth--;
              j++;
            }
            if (j >= n) { trouble ??= `':${path}[(' — unclosed '[(' in a computed key`; break; }
            computed.push({ start: open, end: j });
            plan.push({ c: computed.length - 1 });
            path += "[(…)]";
            planful = true;
            i = j + 2;
            continue;
          }
          if (src[i] === "[") {
            // Consume the WHOLE bracket group (string-aware) — refuse, never
            // truncate: a malformed selector becomes a pointed trouble, not a
            // silent prefix handed to TypeScript.
            i++;
            let spec = "";
            let q: string | null = null;
            while (i < n) {
              const ch = src[i];
              if (q !== null) {
                if (ch === "\\") { spec += ch + (src[i + 1] ?? ""); i += 2; continue; }
                if (ch === q) q = null;
                spec += ch; i++; continue;
              }
              if (ch === "'" || ch === '"') { q = ch; spec += ch; i++; continue; }
              if (ch === "]") break;
              spec += ch; i++;
            }
            if (i >= n || src[i] !== "]") {
              trouble ??= `':${path}[' — unclosed '[' in a path selector`;
              break;
            }
            i++; // the ]
            if (spec.trim() === "") { many = true; break; } // `[]` — replicate; trailing by grammar
            const r = parsePathSpec(spec);
            if ("error" in r) {
              trouble ??= `':${path}[${spec.trim()}]' — ${r.error}`;
              path += `[${spec.trim()}]`;
              planful = true;
              continue;
            }
            path += r.text;
            plan.push(r.seg);
            planful = true;
            continue;
          }
          break;
        }
        out.push({ start, end: i, path, many, plan: planful ? plan : undefined, trouble, ...(computed.length ? { computed } : {}) });
        // a computed key's own code — its reads, its islands — is scanned in place
        for (const cs of computed) {
          for (const inner of scanDatapaths(src.slice(cs.start, cs.end))) {
            out.push({ ...inner, start: inner.start + cs.start, end: inner.end + cs.start,
              ...(inner.computed ? { computed: inner.computed.map((x) => ({ start: x.start + cs.start, end: x.end + cs.start })) } : {}) });
          }
        }
        ends = true; // a datapath read is an operand
        continue;
      }
      if (isIdentStart(c)) {
        let word = "";
        while (i < n && isIdentPart(src[i])) word += src[i++];
        ends = !NON_ENDING.has(word);
        continue;
      }
      if (c >= "0" && c <= "9") {
        while (i < n && (isIdentPart(src[i]) || src[i] === ".")) i++;
        ends = true;
        continue;
      }
      if (c === ")" || c === "]") { i++; ends = true; continue; }
      i++; // every other punctuation expects an expression next
      ends = false;
    }
  };

  code(false);
  return out;
}

/** Rewrite a body's datapath islands to their explicit runtime form —
 *  `:location.city` → `this.$data("location.city")` — the R6 rewrite
 *  discipline extended to the data mode (`$` is not in the language's
 *  identifier grammar, so no member can ever collide with `$data`). A
 *  many-path is refused: `:items[]` replicates, which is a datapath
 *  attribute's meaning, not a value a body can hold. */
/** The first place the path grammar STOPPED where the author plainly meant to
 *  continue — the silent-truncation trap (data-paths.md §2): ':my-key' would
 *  compile to a SUBTRACTION, ':$.store' reads a key literally named '$'.
 *  Each refusal names the rewrite that works today (post-B3, the selector
 *  spellings). A malformed selector arrives as the island's own `trouble`
 *  (gated features refuse there: filters, unions — jsonpath-spelling.md §5). */
export function datapathTrouble(src: string, islands: readonly PathIsland[]): string | null {
  for (const p of islands) {
    if (p.trouble != null) return p.trouble;
    if (p.path === "$" || p.path.startsWith("$.")) {
      return `':${p.path}' — a :path has no JSONPath root ('${":" + p.path.replace(/^\$\.?/, "")}' is already cursor-anchored, jsonpath-spelling.md §1); drop the '$.'`;
    }
    const c = src[p.end] ?? "";
    const d = src[p.end + 1] ?? "";
    if (c === "-" && (isIdentPart(d))) {
      return `':${p.path}-…' is ambiguous — for subtraction write ':${p.path} - …' (spaced); for a dashed KEY write a quoted-name selector: ':${beforeLastName(p.path)}['${lastName(p.path)}-…']'`;
    }
    if (c === ".") {
      if (d >= "0" && d <= "9") return `':${p.path}.${d}…' — a numeric segment is written as an index selector: ':${p.path}[${d}…]'`;
      if (d === ".") return `':${p.path}..' — descendant search ('..') is not in the path subset: it selects an unbounded, shape-dependent set that cannot be tracked reactively at acceptable cost (jsonpath-spelling.md §3); spell the path to the level you mean`;
    }
  }
  return null;
}

// The dashed-key rewrite splits the last dot-name off the path text so the
// suggestion reads ':a.b['c-d']', not a selector wrapping the whole path.
const lastName = (path: string): string => path.slice(path.lastIndexOf(".") + 1);
const beforeLastName = (path: string): string => {
  const k = path.lastIndexOf(".");
  return k < 0 ? "" : path.slice(0, k + 1);
};

/** Is this island the TARGET of an assignment — `:done = v`, `:count += 1`,
 *  `:count++`, `++:count`? A handler writes the field of the record its view is
 *  showing with the same spelling it reads it by. */
const ASSIGN_AFTER = /^\s*(?:=(?![=>])|\+=|-=|\*\*=|\*=|\/=|%=|<<=|>>>=|>>=|&&=|\|\|=|\?\?=|&=|\|=|\^=|\+\+|--)/;
export function isWriteTarget(src: string, p: PathIsland): boolean {
  if (ASSIGN_AFTER.test(src.slice(p.end))) return true;
  return /(?:\+\+|--)\s*$/.test(src.slice(0, p.start));
}

/** Why a write target cannot be written, or null when it can. A write lands in
 *  ONE place, so the path must name one: no replication form, no slice or
 *  wildcard, no index counted from the end (that place depends on the data). */
export function writeTargetTrouble(p: PathIsland): string | null {
  if (p.many) return `':${p.path}[]' is a collection, not a place — a write names one field (':${p.path}[0].name = …'); to add or remove records use the dataset's insert / removeAt`;
  if (staticSegs((p.plan ?? splitPath(p.path)).filter((sg) => typeof sg === "string" || !("c" in sg))) === null) {
    return `':${p.path}' does not name one place — a write needs a field or a non-negative index, not a slice, a wildcard, or an index counted from the end`;
  }
  return null;
}

/** An island's runtime form, as the text AROUND its computed keys — one more
 *  piece than it has keys; each key's own TypeScript stays where it is. A read
 *  is `this.$data([...])`; a write target is `this.$cell([...]).value`,
 *  assignable in every position an ordinary property is (`=`, `+=`, `++`). */
export function loweredPieces(p: PathIsland, write: boolean): string[] {
  const plan = p.plan ?? splitPath(p.path);
  const pieces: string[] = [];
  let cur = write ? "this.$cell([" : "this.$data([";
  plan.forEach((sg, k) => {
    if (k > 0) cur += ",";
    if (typeof sg !== "string" && "c" in sg) { pieces.push(cur); cur = ""; return; }
    // a write names places by key: an index is its string key
    cur += write ? JSON.stringify(typeof sg === "string" ? sg : String((sg as { i: number }).i)) : JSON.stringify(sg);
  });
  pieces.push(cur + (write ? "]).value" : "])"));
  return pieces;
}

/** The edits that replace an island by `pieces` (one per gap around its
 *  computed keys), in body coordinates — what a caller merges with its own. */
export function islandEdits(p: PathIsland, pieces: readonly string[]): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  let at = p.start;
  (p.computed ?? []).forEach((c, k) => { out.push({ start: at, end: c.start, text: pieces[k] }); at = c.end; });
  out.push({ start: at, end: p.end, text: pieces[(p.computed ?? []).length] });
  return out;
}

/** Apply `pieces` to every island of `src` — computed keys, and the islands
 *  inside them, rewritten in place. */
export function spliceIslands(src: string, islands: readonly PathIsland[], pieces: (p: PathIsland) => string[]): string {
  const edits = islands.flatMap((p) => islandEdits(p, pieces(p))).sort((a, b) => a.start - b.start);
  let out = "", at = 0;
  for (const e of edits) { out += src.slice(at, e.start) + e.text; at = e.end; }
  return out + src.slice(at);
}

export function rewriteDatapaths(src: string, statements = false): { src: string } | { error: string } {
  const islands = scanDatapaths(src);
  if (islands.length === 0) return { src };
  const trouble = datapathTrouble(src, islands);
  if (trouble !== null) return { error: trouble };
  for (const p of islands) {
    if (!isWriteTarget(src, p)) continue;
    if (!statements) return { error: `assigns ':${p.path}' — a { } value only reads data; write the record from a handler or a method` };
    const t = writeTargetTrouble(p);
    if (t !== null) return { error: t };
  }
  const many = islands.find((p) => p.many);
  if (many !== undefined) {
    return {
      error: `reads ':${many.path}[]' — a many-path replicates and belongs on a datapath attribute; a { } body reads a single :path`,
    };
  }
  // The same pre-parsed plan the compiler emits (compile.ts resolveBody) —
  // the dev path and the compiled path evaluate identically.
  return { src: spliceIslands(src, islands, (p) => loweredPieces(p, isWriteTarget(src, p))) };
}

/** Replace each island with a same-length, identifier-free TS expression
 *  (`0` + padding), so the TypeScript parser can consume the body for
 *  free-identifier analysis (compile.ts) with every source offset intact.
 *  Since the emitted-plans change (data-paths.md §5) the RESOLVED output no
 *  longer keeps the `:path` spelling — compile.ts lowers each island to
 *  `this.$data([…])` at emission, so this filler serves only the passes that
 *  run on the pre-lowered text. */
export function fillDatapaths(src: string): string {
  const islands = scanDatapaths(src);
  if (islands.length === 0) return src;
  // A plain island is `0`; one with computed keys keeps each key's code in a
  // comma expression, `(0,(k1),(k2))`, padded to the same length.
  return spliceIslands(src, islands, (p) => {
    const cs = p.computed ?? [];
    if (cs.length === 0) return ["0" + " ".repeat(p.end - p.start - 1)];
    const lens: number[] = [];
    let at = p.start;
    for (const c of cs) { lens.push(c.start - at); at = c.end; }
    lens.push(p.end - at);
    return lens.map((len, k) => {
      const t = k === 0 ? "(0,(" : k === lens.length - 1 ? "))" : "),(";
      return k === lens.length - 1 ? t + " ".repeat(len - t.length) : " ".repeat(len - t.length) + t;
    });
  });
}

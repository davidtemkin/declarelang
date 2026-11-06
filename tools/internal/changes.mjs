// changes — the "Breaking changes" section of a release's notes, read (migration.md
// §2.2). One source: the notes people read are what declare-changes reads, so the
// two can't drift. Pure; no file access.
//
//   ## Breaking changes
//
//   ### `onInput` → `commit`            the change, as "old → new"
//   One sentence of why.
//
//   Find: `onInput(`                     a literal, or /a regular expression/ — optional;
//                                        in one, {Class} is the class or any subclass
//
//   ```declare-fragment                  before
//   ```declare-fragment                  after
//
//   Docs: [Controls](declare-docs:…) · [`ValueControl.commit`](declare-docs:…)
//
//   Watch for: a change in behaviour that produces no error — optional.

/** Every entry of a notes file's "Breaking changes" section, in order; [] when it has none —
 *  a release without the section breaks nothing. */
export function readChanges(markdown) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => /^##\s+Breaking changes\s*$/.test(l));
  if (start === -1) return [];
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l) && !/^###/.test(l));
  if (end === -1) end = lines.length;
  const entries = [];
  let cur = null;
  for (let i = start + 1; i < end; i++) {
    const m = /^###\s+(.*)$/.exec(lines[i]);
    if (m !== null) { cur = { heading: m[1].trim(), lines: [] }; entries.push(cur); continue; }
    if (cur !== null) cur.lines.push(lines[i]);
  }
  return entries.map(({ heading, lines: body }) => readEntry(heading, body.join("\n")));
}

function readEntry(heading, text) {
  const fences = [...text.matchAll(/```declare(?:-fragment)?[^\n]*\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  const outside = text.replace(/```[\s\S]*?```/g, "");
  const find = /^Find:\s*`([^`]+)`\s*$/m.exec(outside)?.[1] ?? null;
  const docsLine = /^Docs:\s*(.*)$/m.exec(outside)?.[1] ?? "";
  const docs = [...docsLine.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((m) => ({ label: m[1], href: m[2] }));
  const watch = /^Watch for:\s*([\s\S]*?)(?=\n\s*\n|\n(?:Find|Docs):|$)/m.exec(outside)?.[1].replace(/\s*\n\s*/g, " ").trim() ?? null;
  const why = outside.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p !== "" && !/^(Find|Docs|Watch for):/.test(p)) ?? "";
  return { heading, why: why.replace(/\s*\n\s*/g, " "), find, before: fences[0] ?? null, after: fences[1] ?? null, docs, watch };
}

/** A `Find:` as a matcher over a file's text: `/re/flags` is a regular expression
 *  (always global and multi-line; it may span lines), anything else a literal.
 *  In a regular expression, `{Class}` is that class or any class that extends it —
 *  the library's and the program's own — as `family(Class)` names them, so a change
 *  to a class reaches the program's subclasses of it. Returns the 1-based lines
 *  where it matches. */
export function findLines(find, text, family = (c) => [c]) {
  const lineAt = (offset) => text.slice(0, offset).split("\n").length;
  const out = new Set();
  const re = /^\/(.+)\/([a-z]*)$/s.exec(find);
  if (re !== null) {
    const flags = [...new Set((re[2] + "gm").split(""))].join("");
    const source = re[1].replace(/(?<!\\)\{([A-Z]\w*)\}/g, (_, c) => `(?:${family(c).join("|")})`);
    for (const m of text.matchAll(new RegExp(source, flags))) out.add(lineAt(m.index));
  } else {
    for (let at = text.indexOf(find); at !== -1; at = text.indexOf(find, at + 1)) out.add(lineAt(at));
  }
  return [...out].sort((a, b) => a - b);
}

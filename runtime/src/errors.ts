// A source position and the error types Declare raises for bad source.
// Every syntax / unknown-component / unknown-attribute / bad-value failure
// carries a position so messages point at the offending text; DeclareErrors
// aggregates a whole check pass into one throw.

/** A source position: 1-based line & column, 0-based byte offset. */
export interface Pos {
  line: number;
  col: number;
  offset: number;
}

/** Extra metadata a diagnostic carries beyond message + position: a stable
 *  catalog `code` (DECLARE####, diagnostics.ts) and an optional `hint` (a
 *  how-to-fix line). Both are ADDITIVE — they never change `.message`, so the
 *  many tests that assert on message text keep passing; the code/hint surface
 *  only through the Diagnostic view (diagnostics.ts). */
export interface DiagMeta {
  code?: string;
  hint?: string;
}

/** An error in Declare source. `pos`, when present, is folded into the message
 *  so callers get a legible "… (line 2, col 12)" without extra plumbing.
 *  `rawMessage` keeps the message WITHOUT that suffix (the Diagnostic carries
 *  position separately and re-renders it), and `code`/`hint` are the catalog
 *  metadata (unset on a bare `new DeclareError` — compile() assigns a phase code). */
export class DeclareError extends Error {
  readonly pos?: Pos;
  readonly rawMessage: string;
  readonly code?: string;
  readonly hint?: string;
  constructor(message: string, pos?: Pos, meta?: DiagMeta) {
    super(pos ? `${message} (line ${pos.line}, col ${pos.col})` : message);
    this.name = "DeclareError";
    this.rawMessage = message;
    if (pos) this.pos = pos;
    if (meta?.code !== undefined) this.code = meta.code;
    if (meta?.hint !== undefined) this.hint = meta.hint;
  }
}

/** Everything a check pass found, raised as one throw — build() reports every
 *  problem in the tree, not just the first. It extends DeclareError so existing
 *  `instanceof DeclareError` handling keeps working; `errors` carries the list
 *  (each with its own position), and the message shows one per line. */
export class DeclareErrors extends DeclareError {
  readonly errors: readonly DeclareError[];
  constructor(errors: readonly DeclareError[]) {
    super(
      errors.length === 1
        ? errors[0].message
        : `${errors.length} errors:\n` + errors.map((e) => `  ${e.message}`).join("\n")
    );
    this.name = "DeclareErrors";
    this.errors = errors;
  }
}

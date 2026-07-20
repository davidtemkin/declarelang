import { parseLzx, type LzxNode } from "./parse.js";
import { buildNaming } from "./naming.js";
import { mapDoc } from "./map.js";
import { makeSink, type Gap } from "./gaps.js";
import { emitProgram } from "./emit.js";

export interface LzxDiagnostic { message: string; pos: { line: number; col: number; offset: number }; severity: "error" | "warning" }
export interface TranspileResult { declare: string | null; gaps: Gap[]; diagnostics: LzxDiagnostic[] }

export function lzxToDeclare(src: string): TranspileResult {
  const doc = parseLzx(src);
  const diagnostics: LzxDiagnostic[] = doc.errors.map((e) => ({ message: e.message, pos: e.pos, severity: "error" as const }));
  const { naming, collisions } = buildNaming(collectClassNames(doc.root));
  for (const c of collisions) {
    diagnostics.push({ message: `class-name collision: ${c.lzxNames.join(", ")} → ${c.canonical}`, pos: { line: 1, col: 1, offset: 0 }, severity: "error" });
  }
  const sink = makeSink();
  const prog = mapDoc(doc, naming, sink);
  const declare = prog ? emitProgram(prog) : null;
  return { declare, gaps: sink.gaps, diagnostics };
}

function collectClassNames(root: LzxNode | null): string[] {
  const out: string[] = [];
  const walk = (n: LzxNode): void => {
    if (n.tag.toLowerCase() === "class") {
      const name = n.attrs.find((a) => a.name.toLowerCase() === "name")?.value;
      if (name) out.push(name);
    }
    n.children.forEach(walk);
  };
  if (root) walk(root);
  return out;
}

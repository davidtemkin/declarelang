import type { Gap } from "./gaps.js";

export interface LzxDiagnostic {
  message: string;
  pos: { line: number; col: number; offset: number };
  severity: "error" | "warning";
}

export interface TranspileResult {
  declare: string | null;
  gaps: Gap[];
  diagnostics: LzxDiagnostic[];
}

export function lzxToDeclare(_src: string): TranspileResult {
  return { declare: null, gaps: [], diagnostics: [] };
}

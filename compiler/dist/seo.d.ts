import { View } from "../../runtime/dist/index.js";
import { type Block } from "../../runtime/dist/md.js";
import { type CompileOptions, type Compiled } from "./compile.js";
import { type Environment } from "./headless.js";
/** The shared Block tree (md.ts) as semantic HTML. Exported for tests and for
 *  any tool that already holds parsed blocks. */
export declare function blocksHtml(blocks: readonly Block[]): string;
/** Serialize a settled tree's content as HTML. The walk is document order
 *  (child order is paint order); `visible = false` subtrees are skipped; the
 *  content classes emit what their text MEANS; every other view is transparent
 *  structure (its children walk, it emits no wrapper). */
export declare function staticHtml(root: View): string;
export interface ExtractOptions extends CompileOptions {
    env?: Environment;
}
/** Extract from a compile() result: execute the compiled source to its t=0
 *  snapshot and serialize. Needs only { source, deps } — the projection that
 *  survives the worker boundary — so it composes with EVERY compile path
 *  (in-process, worker, cached). Returns null when the compile failed. */
export declare function extractFromCompiled(compiled: Pick<Compiled, "source" | "deps">, env?: Environment): string | null;
export interface Extracted {
    /** The extracted HTML fragment, or null when the compile failed. */
    html: string | null;
    diagnostics: Compiled["diagnostics"];
    report: string;
}
/** The one-call form: compile a source through THE compiler API (typecheck
 *  and all), then extract. The dual-form rule holds — structured diagnostics
 *  plus the rendered report ride the result. */
export declare function extractStatic(source: string, opts?: ExtractOptions): Extracted;
/** The fragment as a complete crawler-facing document (`?view=seo`, and the
 *  committed-page artifact). One shape on every host. */
export declare function seoDocument(html: string, title: string): string;

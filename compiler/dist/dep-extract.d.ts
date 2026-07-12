import type { Program } from "../../runtime/dist/parser.js";
/** A code value (`{ }`) with the extracted deps optionally attached. */
type CodeValue = {
    kind: "code";
    src: string;
    pos?: {
        offset?: number;
    };
    deps?: readonly string[];
};
export interface ExtractedConstraint {
    tag: string;
    name: string | null;
    attr: string;
    offset: number;
    node: CodeValue | null;
    reads: string[];
    errors: {
        message: string;
        offset: number;
    }[];
}
/** Extract deps for every constraint in a RESOLVED program. */
export declare function extractProgram(program: Program): ExtractedConstraint[];
/** Extract deps and ATTACH them to the program AST (`attr.value.deps`), so the
 *  runtime can wire the static-constraint path. Returns residue errors (empty on
 *  the whole corpus). Mutates the program in place. */
export declare function annotateProgram(program: Program): {
    errors: {
        message: string;
        offset: number;
        where: string;
    }[];
};
export {};

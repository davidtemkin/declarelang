import type { Program } from "../../runtime/dist/parser.js";
import { DeclareError } from "../../runtime/dist/errors.js";
export declare function pathReadTypes(program: Program): Map<object, {
    text: string;
    type: string;
}[]>;
/** Check a program's path literals against its datasets' schemas. */
export declare function schemaCheck(program: Program): DeclareError[];

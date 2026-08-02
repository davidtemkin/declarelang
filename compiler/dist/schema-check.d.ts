import type { Program } from "../../runtime/dist/parser.js";
import { DeclareError } from "../../runtime/dist/errors.js";
/** Check a program's path literals against its datasets' schemas. */
export declare function schemaCheck(program: Program): DeclareError[];

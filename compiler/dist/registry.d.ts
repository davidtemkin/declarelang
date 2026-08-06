import { DeclareError } from "../../runtime/dist/errors.js";
import type { Program } from "../../runtime/dist/parser.js";
export interface LinkRegistry {
    /** destination name → true (shows names; duplicates collapse) */
    destinations: Set<string>;
    /** anchor name → the destination (shows name) of its nearest gating
     *  ancestor, or "" when it sits outside any destination */
    anchors: Map<string, string>;
}
export interface RegistryResult {
    registry: LinkRegistry;
    errors: DeclareError[];
    warnings: DeclareError[];
}
/** Build the registry from the App tree and enforce the placement and
 *  uniqueness rules. Class bodies are visited only to REJECT `shows` there. */
export declare function buildRegistry(program: Program): RegistryResult;
/** Check every LITERAL reference in the program against the registry — bare
 *  `link` slots, fragment literals inside `link` constraints, and the
 *  compound-for-registered-anchor rule (§0.3). Also the migration and
 *  double-gate lints (§0.10). */
export declare function checkReferences(program: Program, reg: LinkRegistry): {
    errors: DeclareError[];
    warnings: DeclareError[];
};

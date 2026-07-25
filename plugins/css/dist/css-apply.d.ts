import { type RuleSet } from "./css-match.js";
/** Install a global RuleSet as per-view CSS. Returns a disposer. */
export declare function installCss(ruleSet: RuleSet): () => void;

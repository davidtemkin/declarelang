import { nearestName } from "./diagnostics.js";
export { nearestName };
/** The CSS-interference table (E-1 escalation 2, diagnostics.md §4): a model
 *  (or a web developer) reaches for the CSS name; the miss should name the
 *  Declare slot, because "has no attribute" alone states the rule and not the
 *  fix. Evidence-driven — entries earn their place by appearing in eval
 *  failures or having one true equivalent; vague CSS concepts stay out. */
export declare const CSS_ATTRIBUTE_HINTS: Readonly<Record<string, string>>;
/** The CSS-instinct hint for an unknown attribute name, or "" when the miss
 *  isn't a known CSS name. */
export declare function cssAttributeHint(name: string): string;
/** The hint-table key a near-missed foreign name routes to, or null.
 *
 *  A near-miss on a HINTED name answers with the hint, not the spelling:
 *  `colour` is one edit from `color`, and what that reader needs is
 *  "text color is 'textColor'", not "did you mean 'color'?" — which names an
 *  attribute that does not exist either. The tables know intent; reaching them
 *  through a typo is worth more than reaching a nearby letter-string.
 *  …but only for a name long enough for the miss to mean something. Routing to
 *  a hint asserts what the author was THINKING, which is a longer reach than
 *  naming a spelling, so it wants more evidence than a short string can carry:
 *  `zap` is one edit from `gap` and is a typo for nothing at all. Five is the
 *  same floor nearestName already uses to widen its own budget. */
export declare function hintedForeignName(name: string): string | null;
/** The HOST-GLOBAL table: the browser's (and Node's) names a body may reach
 *  for, each answered with the Declare way. A Declare program runs on three
 *  renderers, so a bare `document` or `process` is refused by NAME — with the
 *  fact the author actually wanted named beside it — rather than admitted by
 *  the resolver and then refused by the checker with TypeScript's own advice
 *  ("change lib to dom", "npm i @types/node"), which is what happened until
 *  2026-08-23. What a body MAY name is the prelude (scaffold.ts) plus the ES
 *  built-ins: docs Vocabulary → Types and functions. A host capability the
 *  language lacks arrives through an `external` attribute the host supplies,
 *  never through a bare global. */
export declare const HOST_GLOBAL_HINTS: Readonly<Record<string, string>>;
/** The Declare answer for a host global, or null when the name is not one. */
export declare function hostGlobalHint(name: string): string | null;

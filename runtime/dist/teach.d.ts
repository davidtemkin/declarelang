import { nearestName } from "./diagnostics.js";
export { nearestName };
export declare const CSS_ATTRIBUTE_HINTS: Readonly<Record<string, string>>;
export declare const MEMBER_HINTS: Readonly<Record<string, string>>;
/** Delivery hooks an earlier Declare named otherwise — the person's request
 *  lands in the hook, its default carries it out, and an override changes how.
 *  A method under the old name, on a class whose chain has the new hook, is an
 *  ordinary method nothing calls (DECLARE4042 says so); `input` → `commit` is
 *  the first of them. */
export declare const FORMER_HOOKS: Readonly<Record<string, string>>;
/** Members an earlier Declare named otherwise — and a few another platform
 *  names on that class (a field's line cap) — answered on the class that had
 *  them and every class built on it — never elsewhere, where the old name is
 *  an ordinary name an app may declare (`selected` is a row's boolean,
 *  `choices` a quiz's list, `filter` a list's or a method). Keyed by the class
 *  that had the member; the checker walks the class chain to find it. The
 *  hint says what IS. */
export declare const RENAMED_CLASS_MEMBERS: Readonly<Record<string, Readonly<Record<string, string>>>>;
/** The renamed-member hint for `name` on a class whose chain (the class first,
 *  then each base) is `chain`, or "". */
export declare function renamedClassMember(chain: readonly string[], name: string): string;
/** The member-instinct hint for a name read on a node, or "". */
export declare function memberHint(name: string): string;
/** The keys of CSS_ATTRIBUTE_HINTS that are names an earlier Declare used, not
 *  CSS's: their hint says what holds the thing now, without the CSS label. */
export declare const FORMER_DECLARE_NAMES: ReadonlySet<string>;
/** The keys of CSS_ATTRIBUTE_HINTS that are React's, not CSS's: labelled as
 *  React's instinct. (`key` is also the name an earlier Declare used.) */
export declare const REACT_NAMES: ReadonlySet<string>;
/** The keys of CSS_ATTRIBUTE_HINTS that are HTML's (and the platforms') field
 *  attributes, not CSS's. */
export declare const HTML_NAMES: ReadonlySet<string>;
/** The keys of CSS_ATTRIBUTE_HINTS that are Flutter's, not CSS's. */
export declare const FLUTTER_NAMES: ReadonlySet<string>;
/** The keys of CSS_ATTRIBUTE_HINTS that no platform names: a guess at what
 *  Declare would call the thing. Answered without a label. */
export declare const GUESSED_NAMES: ReadonlySet<string>;
/** The hint for an unknown attribute name, or "" when the miss is neither a
 *  known foreign name nor a former Declare one. A CSS name is labelled as the
 *  CSS instinct and a React name as React's; a former Declare name is neither,
 *  so it carries no label. */
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

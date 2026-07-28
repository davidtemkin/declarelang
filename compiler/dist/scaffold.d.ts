import type { ComponentSchema } from "../../runtime/dist/schema.js";
import type { AttrType } from "../../runtime/dist/value.js";
import type { ClassDecl } from "../../runtime/dist/parser.js";
/** One AttrType (value.ts) → its TypeScript type, mirroring the value model.
 *  Enum and record arms reference a NAMED type (`type Stretch = …`, `Theme`)
 *  emitted in the prelude / near-use; component references the peer
 *  `declare class`. The nullable decoration slots (stroke/shadow) and the two
 *  styling channels carry their `| null` here, matching what coercion admits. */
export declare function tsType(t: AttrType): string;
/** A WRITTEN signature type name (`f(w: Window) -> number`) → its TypeScript
 *  type. Two sources, the same two an attribute declaration draws on: the
 *  declarable value vocabulary (`number`, `string`, `array`, `Axis`, …) and the
 *  component classes, every one of which is emitted here as a peer
 *  `declare class`. Returns null when the name is neither, so the caller can
 *  report it positioned against the author's text.
 *
 *  Nullability deliberately differs from a SLOT's: `tsType` gives a view- or
 *  component-typed slot `| null` because an unset slot really is null, but a
 *  parameter is not a slot — `f(w: Window)` says a Window arrives. Inventing
 *  `| null` here would force a null check the author never asked for. */
export declare function signatureTsType(written: string, isComponent: (n: string) => boolean): string | null;
/** LANGUAGE-API members — the runtime surface a `{ }` body may READ or CALL
 *  that is deliberately NOT in the schemas: a schema models what an author can
 *  SET in `[ ]` ("lifecycle state (value, status, error) is runtime surface
 *  read from bindings, not author-settable — hence absent here", schema.ts),
 *  while a body also reads that lifecycle surface and calls runtime methods.
 *  This table is the TYPE half of what effects.ts is for DEPENDENCIES: a
 *  language-supplied member's signature is DECLARED (its body is runtime TS,
 *  not Declare source), a user member's is derived — same footing, no
 *  privilege tier. Signatures mirror the runtime (data.ts, animator.ts,
 *  layout.ts, backend.ts); data-shaped values are `any`, not `unknown` —
 *  a datum's shape is unknowable until the `schema` construct lands, and
 *  `unknown` would flag every correct read (the same deliberate under-report
 *  as Theme). Members the runtime marks `protected` (TweenLayout.laid) are
 *  declared public here: a check-block is a free function, not a subclass
 *  body, so TS's protected rule would reject the legal subclass call. */
/** The CALLABLE surface of a service that is also a component. `Keys` and
 *  `Focus` name one concept each — the keyboard, the focus service — which a
 *  body can either ASK (`Keys.isDown("KeyA")`, `Focus.focus(this)`) or LISTEN
 *  to (`Keys [ onKeyDown(e) { … } ]`). Emitted as STATIC members of the
 *  component's class so both readings typecheck under the one name; at runtime
 *  they never meet, since a tag and a body identifier are different namespaces
 *  (the body's `Keys` is the injected service object — expr.ts setBodyServices). */
export declare const LANGUAGE_STATICS: Readonly<Record<string, readonly string[]>>;
export declare const LANGUAGE_API: Readonly<Record<string, readonly string[]>>;
/** One attribute member. A length-typed slot is the read/write ASYMMETRY the
 *  runtime actually has: a body may WRITE `number | Percent` (the slot accepts
 *  both), but a READ always sees the RESOLVED pixel number (the constraint
 *  system resolves a percent against the parent before any body runs — which
 *  is why `parent.width - 8` is the corpus-wide idiom and works). Model it as
 *  divergent accessors: `get(): number; set(v: Length)`. Symmetric kinds stay
 *  plain members. */
export declare function memberSig(name: string, t: AttrType, nonNullColor?: boolean): string[];
/** Generate the scaffold for a program: the fixed prelude, the enum type
 *  aliases every schema references, and one `declare class` per schema (built-in
 *  + user), base-before-derived. Pure — the returned STRING is the whole
 *  product. `schemas` is `programSchemas(program.classes).schemas`; `classDecls`
 *  is `program.classes` (their methods). */
export declare function generateScaffold(schemas: Readonly<Record<string, ComponentSchema>>, classDecls: readonly ClassDecl[], rootType?: string, classExtras?: ReadonlyMap<string, readonly string[]>, 
/** Written signature type names from INLINE elements too (the caller walks
 *  the whole tree; `classDecls` covers only `class` bodies). Enum/record
 *  aliases are collected from these as well as from attributes. */
extraSignatureTypes?: readonly string[]): string;

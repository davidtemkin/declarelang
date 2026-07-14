// tools/doc/model.ts — THE DOC MODEL: the single walkable data structure that
// every documentation surface is a view of (design/doc-system.md §"Ratified
// refinements", point 2).
//
//   extractor  ──►  DocModel (this shape, serialized to docs-model.json)  ──►  renderers
//
// One model, many views. The renderers — the in-browser navigable docs, the web
// docs, and the live object browser — are all one self-hosted Declare app that
// walks this structure and renders each node's `doc` Markdown through the runtime's
// Markdown component; the Developer's Guide links into it by `id`. So this file is
// a CONTRACT, not an implementation detail: it is the wire format between the TS
// extractor (which reads schema.ts ⨝ the attributes.ts defaults ⨝ the TypeScript
// compiler API for TS built-ins, and the Declare parser for `.declare` components)
// and the Declare app that renders it. Keep it JSON-serializable — data only, no
// functions, no cycles (edges are `id` references, resolved through `nodes`).

/** A stable, human-legible node key. Dotted for members:
 *  `"View"`, `"View.width"`, `"View.onClick"`, `"module:weather.weatherIcon"`. */
export type NodeId = string;

/** The whole reference: a flat, id-keyed node map (so any edge is an O(1) walk)
 *  plus the ordered top-level entries for the navigator. `docs-model.json` is exactly
 *  this object. */
export interface DocModel {
  version: 1;
  /** Content-hash build stamp (shared with bundles/version.json) — lets a renderer
   *  cache the model and revalidate, and lets the guide pin a reference revision. */
  buildId: string;
  /** Every node, keyed by `id`. Walkable: follow `extends`/`parent`/`children`/
   *  `seeAlso`/`members` by looking the target id up here. */
  nodes: Record<NodeId, DocNode>;
  /** Top-level entries in presentation order — the classes and modules that seed
   *  the navigator (members hang off them via `children`). */
  roots: NodeId[];
  /** A denormalized projection of `nodes` for **array-based renderers**: Declare's
   *  `datapath` replication walks arrays, not the id-map, so the doc-browser app
   *  reads `tree` while `nodes`/`roots` stay the source of truth (and the object
   *  browser's O(1) index). Derived, never authored — the members are inlined as
   *  arrays of the very same node objects. */
  tree: ClassTree[];
}

/** One documented class with its members inlined as arrays — the shape the Declare
 *  renderer replicates over (`datapath = :tree[]`, then `:attributes[]`). */
export interface ClassTree {
  id: NodeId;
  name: string;
  doc: string | null;
  api: boolean;
  extends: NodeId | null;
  subclasses: NodeId[];
  origin: "ts" | "declare";
  attributes: AttributeNode[];
  events: EventNode[];
  methods: MethodNode[];
}

/** Fields every node carries, whatever its kind. */
interface NodeBase {
  id: NodeId;
  /** The bare name shown in the tree (`width`, `View`, `onClick`). */
  name: string;
  kind: DocNode["kind"];
  /** The captured `/* *​/` Markdown doc block, dedented (parser.ts `dedent()`) —
   *  the node's prose, rendered verbatim by the Markdown component. `null` when
   *  undocumented; the coverage gate guarantees `api ⇒ doc !== null`. */
  doc: string | null;
  /** The `@api` surface marker (design/doc-system.md §"@api"): marked = public =
   *  in the supported reference; absent = internal, excluded from the built docs
   *  (but still present in a debug/object-browser model, which shows everything). */
  api: boolean;
  /** Where it is declared — powers "view source" and the object browser's
   *  instance → source hop. Repo-relative path + 1-indexed line. */
  source: { file: string; line: number };
  /** The containing node (a class for a member; a module for a function; `null`
   *  for a root) — the walk-up edge. */
  parent: NodeId | null;
  /** Authored cross-links (the reference's "See also"), by id. */
  seeAlso: NodeId[];
}

/** The node kinds — the reference granularity is uniform down to the member, not
 *  class-only (design/documentation-plans.md §"Attachment"): whatever a `/* *​/`
 *  doc block can attach to has a node here. */
export type DocNode =
  | ClassNode
  | AttributeNode
  | MethodNode
  | EventNode
  | ModuleNode
  | FunctionNode
  | StyleNode
  | FontNode;

/** An instantiable tree citizen — `View`, `Text`, `Image`, `Layout`, a user
 *  `class X extends View`. Authored in TS (a `ComponentSchema` + runtime class) or
 *  in Declare (`class … [ … ]`); the model shows no seam (`origin` records which). */
export interface ClassNode extends NodeBase {
  kind: "class";
  /** The base class id, or `null` for a root of the hierarchy — the walk-up the
   *  reference renders as the "Extends" chain and the object browser climbs. */
  extends: NodeId | null;
  /** Reverse of `extends`, computed at build — the "Known subclasses" list. */
  subclasses: NodeId[];
  /** Which extractor produced it. No visible seam in the docs; useful for tooling. */
  origin: "ts" | "declare";
  /** Members, in declaration order — each an id into `nodes`. `parent` on each
   *  points back here; `inheritedFrom` (on attributes) marks ones from `extends`. */
  attributes: NodeId[];
  methods: NodeId[];
  events: NodeId[];
}

/** One typed attribute slot (`width`, `fill`, `fontWeight`). Structure is
 *  generated from `schema.ts` ⨝ the `attributes.ts` defaults — it cannot drift. */
export interface AttributeNode extends NodeBase {
  kind: "attribute";
  /** The rendered value type from the schema's `AttrType` (`length`, `Fill`,
   *  `FontWeight`, `Layout`, …). */
  type: string;
  /** The default, rendered from the decoration table; `null` if there is none. */
  default: string | null;
  /** A styling-rung slot that follows the nearest providing ancestor when unset
   *  (schema `prevailing`). */
  prevailing: boolean;
  /** A computed/intrinsic value a constraint may read but nothing may set
   *  (schema `readOnly` — e.g. `contentWidth`). */
  readOnly: boolean;
  /** If this slot is inherited rather than declared on the owning class, the id of
   *  the class that declares it (so the reference can show "inherited from View"). */
  inheritedFrom: NodeId | null;
}

/** A method — a component behavior over its own `this`. Signature comes from the
 *  TypeScript compiler API (TS classes) or the Declare method form (`.declare`). */
export interface MethodNode extends NodeBase {
  kind: "method";
  /** The rendered one-line signature (`select(): void`, `tabOrder(): View[]`). */
  signature: string;
  params: ParamDoc[];
  /** Return type + optional prose (from an `@returns`-style tail in the block);
   *  `null` for `void`/none. */
  returns: { type: string; doc: string | null } | null;
}

/** A parameter, optionally documented in the owning block's prose. */
export interface ParamDoc {
  name: string;
  type: string;
  doc: string | null;
}

/** An event a class fires (schema `events`) — answered by an `on<Event>` handler
 *  member; the reference lists it so authors know what they may subscribe to. */
export interface EventNode extends NodeBase {
  kind: "event";
  /** Rendered payload/handler signature, if any. */
  signature: string | null;
}

/** A documented `script { }` module — imports + free functions shared across a
 *  program (design/composition.md §2). Its `children` are its `FunctionNode`s. */
export interface ModuleNode extends NodeBase {
  kind: "module";
  children: NodeId[];
}

/** A free function in a `script { }` (`weatherIcon(code)`), or a documented TS
 *  helper on the public surface. */
export interface FunctionNode extends NodeBase {
  kind: "function";
  signature: string;
  params: ParamDoc[];
  returns: { type: string; doc: string | null } | null;
}

/** A `stylesheet Name [ … ]` / `style name [ … ]` declaration on the documented
 *  surface (bundled themes). */
export interface StyleNode extends NodeBase {
  kind: "style";
  /** `stylesheet` (keyed, prevailing) vs `style` (a named bundle). */
  form: "stylesheet" | "style";
}

/** A `font Name [ … ]` declaration — the named face container (design/fonts.md). */
export interface FontNode extends NodeBase {
  kind: "font";
}

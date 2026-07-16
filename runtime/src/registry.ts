// registry — the name → built-in-class tables (the runtime half of the twin
// registry; schema.ts holds the checker half). Split OUT of instantiate.ts for
// one reason: a PRODUCTION build can substitute a SLIM copy of this module —
// one that imports only the component classes an app actually uses — and esbuild
// then drops the rest (the rich-text engine, etc.) from the bundle. instantiate.ts
// consumes these tables unchanged; the dev / source-compiling path imports this
// full module, while `declarec` (and the server's prod cache) swap it for a
// generated subset at bundle time (tools/declarec.mjs, the `slimRegistry` plugin).
//
// It is ALSO the name-keyed registry instantiation.md §8 calls for: the single
// place an imperative `new Markdown()` in a body — or a future create-by-string —
// resolves its class. Keep the table names in sync with schema.ts's SCHEMAS.

import { View, App, Html } from "./view.js";
import { Node } from "./node.js";
import { Text } from "./text.js";
import { Image } from "./image.js";
import { TextInput } from "./text-input.js";
import { Markdown, HTMLText } from "./markdown.js";
import { Layout, SimpleLayout, WrappingLayout, TweenLayout } from "./layout.js";
import { Dataset, DataSource } from "./data.js";
import { Animator, AnimatorGroup } from "./animator.js";
import { Spring } from "./spring.js";
import { State } from "./state.js";

type ViewCtor = new () => View;

/** Tag → runtime View class (the tree tags). `Node` is registered so a user can
 *  subclass it for a non-visual node (`class Store [ … ]`). */
export const TAGS: Readonly<Record<string, ViewCtor>> = {
  App, View, Text, Image, HTML: Html, TextInput, Markdown, HTMLText,
  Node: Node as unknown as ViewCtor,
};

/** Tag → buildable layout-strategy class (R7) — built only as a component-typed
 *  attribute value, never a tree tag. */
export const LAYOUTS: Readonly<Record<string, new () => Layout>> = { SimpleLayout, WrappingLayout };

/** Layout classes by name for BASE resolution + user-layout synthesis: the
 *  buildable strategies plus the abstract bases a user layout extends. */
export const LAYOUT_BASES: Readonly<Record<string, abstract new () => Layout>> = { SimpleLayout, TweenLayout };

/** Tag → data-node class (R8). A data node is tree structure but not a View. */
export const DATA: Readonly<Record<string, new () => Dataset>> = { Dataset, DataSource };

/** Tag → animator class (animation.md §1) — tree structure, neither View nor data. */
export const ANIMATORS: Readonly<Record<string, new () => Animator>> = { Animator, Spring };

/** Tag → animator-group class (animation.md §1, §4). */
export const ANIMATOR_GROUPS: Readonly<Record<string, new () => AnimatorGroup>> = { AnimatorGroup };

/** Tag → state class (docs/system-design/states.md) — captures its body's overrides
 *  for the enclosing view. */
export const STATES: Readonly<Record<string, new () => State>> = { State };

/** Every built-in component NAME the tables register — the vocabulary the used-
 *  set intersects to decide which classes a production bundle keeps. (Includes
 *  the `HTML` tag alias.) Consumed by the compiler side (declarec), never by the
 *  slimmed runtime, so it stays out of instantiate.ts's import surface. */
export const REGISTRY_NAMES: readonly string[] = [
  ...Object.keys(TAGS), ...Object.keys(LAYOUTS), ...Object.keys(LAYOUT_BASES),
  ...Object.keys(DATA), ...Object.keys(ANIMATORS), ...Object.keys(ANIMATOR_GROUPS), ...Object.keys(STATES),
];

/** One table entry as DATA — its markup name, its table, and the module + export
 *  it comes from. The production slim-registry generator (tools/declarec.mjs)
 *  reads this to emit imports for ONLY the used classes; a test asserts the
 *  manifest's names match the tables above, so the two can never drift. */
export interface RegistryEntry {
  name: string;                    // the component name as written in markup (`HTML` alias included)
  table: "TAGS" | "LAYOUTS" | "LAYOUT_BASES" | "DATA" | "ANIMATORS" | "ANIMATOR_GROUPS" | "STATES";
  module: string;                  // the runtime dist module the class lives in ("markdown.js")
  export: string;                  // the exported binding name there ("Html" for the `HTML` tag)
}
export const REGISTRY_MANIFEST: readonly RegistryEntry[] = [
  { name: "App", table: "TAGS", module: "view.js", export: "App" },
  { name: "View", table: "TAGS", module: "view.js", export: "View" },
  { name: "Text", table: "TAGS", module: "text.js", export: "Text" },
  { name: "Image", table: "TAGS", module: "image.js", export: "Image" },
  { name: "HTML", table: "TAGS", module: "view.js", export: "Html" },
  { name: "TextInput", table: "TAGS", module: "text-input.js", export: "TextInput" },
  { name: "Markdown", table: "TAGS", module: "markdown.js", export: "Markdown" },
  { name: "HTMLText", table: "TAGS", module: "markdown.js", export: "HTMLText" },
  { name: "Node", table: "TAGS", module: "node.js", export: "Node" },
  { name: "SimpleLayout", table: "LAYOUTS", module: "layout.js", export: "SimpleLayout" },
  { name: "WrappingLayout", table: "LAYOUTS", module: "layout.js", export: "WrappingLayout" },
  { name: "SimpleLayout", table: "LAYOUT_BASES", module: "layout.js", export: "SimpleLayout" },
  { name: "TweenLayout", table: "LAYOUT_BASES", module: "layout.js", export: "TweenLayout" },
  { name: "Dataset", table: "DATA", module: "data.js", export: "Dataset" },
  { name: "DataSource", table: "DATA", module: "data.js", export: "DataSource" },
  { name: "Animator", table: "ANIMATORS", module: "animator.js", export: "Animator" },
  { name: "Spring", table: "ANIMATORS", module: "spring.js", export: "Spring" },
  { name: "AnimatorGroup", table: "ANIMATOR_GROUPS", module: "animator.js", export: "AnimatorGroup" },
  { name: "State", table: "STATES", module: "state.js", export: "State" },
];

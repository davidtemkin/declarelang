import { View } from "./view.js";
import { Layout } from "./layout.js";
import { Dataset } from "./data.js";
import { Animator, AnimatorGroup } from "./animator.js";
import { State } from "./state.js";
type ViewCtor = new () => View;
/** Tag → runtime View class (the tree tags). `Node` is registered so a user can
 *  subclass it for a non-visual node (`class Store [ … ]`). */
export declare const TAGS: Readonly<Record<string, ViewCtor>>;
/** Tag → buildable layout-strategy class (R7) — built only as a component-typed
 *  attribute value, never a tree tag. */
export declare const LAYOUTS: Readonly<Record<string, new () => Layout>>;
/** Layout classes by name for BASE resolution + user-layout synthesis: the
 *  buildable strategies plus the abstract bases a user layout extends. */
export declare const LAYOUT_BASES: Readonly<Record<string, abstract new () => Layout>>;
/** Tag → data-node class (R8). A data node is tree structure but not a View. */
export declare const DATA: Readonly<Record<string, new () => Dataset>>;
/** Tag → animator class (animation.md §1) — tree structure, neither View nor data. */
export declare const ANIMATORS: Readonly<Record<string, new () => Animator>>;
/** Tag → animator-group class (animation.md §1, §4). */
export declare const ANIMATOR_GROUPS: Readonly<Record<string, new () => AnimatorGroup>>;
/** Tag → state class (docs/system-design/states.md) — captures its body's overrides
 *  for the enclosing view. */
export declare const STATES: Readonly<Record<string, new () => State>>;
/** Every built-in component NAME the tables register — the vocabulary the used-
 *  set intersects to decide which classes a production bundle keeps. (Includes
 *  the `HTML` tag alias.) Consumed by the compiler side (declarec), never by the
 *  slimmed runtime, so it stays out of instantiate.ts's import surface. */
export declare const REGISTRY_NAMES: readonly string[];
/** One table entry as DATA — its markup name, its table, and the module + export
 *  it comes from. The production slim-registry generator (tools/declarec.mjs)
 *  reads this to emit imports for ONLY the used classes; a test asserts the
 *  manifest's names match the tables above, so the two can never drift. */
export interface RegistryEntry {
    name: string;
    table: "TAGS" | "LAYOUTS" | "LAYOUT_BASES" | "DATA" | "ANIMATORS" | "ANIMATOR_GROUPS" | "STATES";
    module: string;
    export: string;
}
export declare const REGISTRY_MANIFEST: readonly RegistryEntry[];
export {};

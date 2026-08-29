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
import { View, App, DOMIsland } from "./view.js";
import { Node } from "./node.js";
import { Text } from "./text.js";
import { Image } from "./image.js";
import { Video } from "./video.js";
import { Audio } from "./audio.js";
import { TextInput } from "./text-input.js";
import { Markdown, HTMLText } from "./markdown.js";
import { Layout, TweenLayout } from "./layout.js";
import { Dataset, DataSource } from "./data.js";
import { Animator, AnimatorGroup } from "./animator.js";
import { Spring } from "./spring.js";
import { Time } from "./time.js";
import { KeysSource, FocusSource, TipSource } from "./sources.js";
import { EventStream, Socket } from "./streams.js";
import { State } from "./state.js";
/** Tag → runtime View class (the tree tags). `Node` is registered so a user can
 *  subclass it for a non-visual node (`class Store [ … ]`); `Time` (time.ts) is
 *  a Node component on the same generic path — carrying declarations and
 *  subclassable — rather than a SOURCE, which the source path would seal. */
export const TAGS = {
    App, View, Text, Image, Video, Audio, DOMIsland, TextInput, Markdown, HTMLText,
    Node: Node,
    Time: Time,
};
/** Tag → buildable layout-strategy class (R7) — built only as a component-typed
 *  attribute value, never a tree tag. */
// The built-in strategy table is EMPTY: SimpleLayout, WrappingLayout, and
// ResponsiveLayout are library classes (library/*.declare) pulled by
// auto-include — strategies are place() over the Layout kernel, authorable in
// Declare like any component. Only the kernel bases below are native.
export const LAYOUTS = {};
/** Layout classes by name for BASE resolution + user-layout synthesis: the
 *  buildable strategies plus the abstract bases a user layout extends. */
export const LAYOUT_BASES = { Layout, TweenLayout };
/** Tag → data-node class (R8). A data node is tree structure but not a View. */
export const DATA = { Dataset, DataSource };
/** Tag → animator class (animation.md §1) — tree structure, neither View nor data. */
export const ANIMATORS = { Animator, Spring };
/** SOURCES — non-visual members whose handlers are called by something OUTSIDE
 *  the tree: the frame clock, the keyboard, the focus service, the tip service.
 *  Their own table because none of the animator paths' `attribute`/`to`
 *  checking applies, and because being ordinary components is what lets an app
 *  that never listens drop the service code entirely (slim-registry). */
export const SOURCES = {
    Keys: KeysSource,
    Focus: FocusSource,
    Tip: TipSource,
    // the stream family (streams.ts) — `Stream` itself is schema-only
    // (abstract, uninstantiable), so only the concrete transports register
    EventStream,
    Socket,
};
/** Tag → animator-group class (animation.md §1, §4). */
export const ANIMATOR_GROUPS = { AnimatorGroup };
/** Tag → state class (docs/system-design/states.md) — captures its body's overrides
 *  for the enclosing view. */
export const STATES = { State };
/** Every built-in component NAME the tables register — the vocabulary the used-
 *  set intersects to decide which classes a production bundle keeps. (Includes
 *  each name maps to its export.) Consumed by the compiler side (declarec), never by the
 *  slimmed runtime, so it stays out of instantiate.ts's import surface. */
export const REGISTRY_NAMES = [
    ...Object.keys(TAGS), ...Object.keys(LAYOUTS), ...Object.keys(LAYOUT_BASES),
    ...Object.keys(DATA), ...Object.keys(ANIMATORS), ...Object.keys(ANIMATOR_GROUPS), ...Object.keys(SOURCES), ...Object.keys(STATES),
];
export const REGISTRY_MANIFEST = [
    { name: "App", table: "TAGS", module: "view.js", export: "App" },
    { name: "View", table: "TAGS", module: "view.js", export: "View" },
    { name: "Text", table: "TAGS", module: "text.js", export: "Text" },
    { name: "Image", table: "TAGS", module: "image.js", export: "Image" },
    { name: "Video", table: "TAGS", module: "video.js", export: "Video" },
    { name: "Audio", table: "TAGS", module: "audio.js", export: "Audio" },
    { name: "DOMIsland", table: "TAGS", module: "view.js", export: "DOMIsland" },
    { name: "TextInput", table: "TAGS", module: "text-input.js", export: "TextInput" },
    { name: "Markdown", table: "TAGS", module: "markdown.js", export: "Markdown" },
    { name: "HTMLText", table: "TAGS", module: "markdown.js", export: "HTMLText" },
    { name: "Node", table: "TAGS", module: "node.js", export: "Node" },
    { name: "Time", table: "TAGS", module: "time.js", export: "Time" },
    { name: "Layout", table: "LAYOUT_BASES", module: "layout.js", export: "Layout" },
    { name: "TweenLayout", table: "LAYOUT_BASES", module: "layout.js", export: "TweenLayout" },
    { name: "Dataset", table: "DATA", module: "data.js", export: "Dataset" },
    { name: "DataSource", table: "DATA", module: "data.js", export: "DataSource" },
    { name: "Animator", table: "ANIMATORS", module: "animator.js", export: "Animator" },
    { name: "Spring", table: "ANIMATORS", module: "spring.js", export: "Spring" },
    { name: "Keys", table: "SOURCES", module: "sources.js", export: "KeysSource" },
    { name: "Focus", table: "SOURCES", module: "sources.js", export: "FocusSource" },
    { name: "Tip", table: "SOURCES", module: "sources.js", export: "TipSource" },
    { name: "EventStream", table: "SOURCES", module: "streams.js", export: "EventStream" },
    { name: "Socket", table: "SOURCES", module: "streams.js", export: "Socket" },
    { name: "AnimatorGroup", table: "ANIMATOR_GROUPS", module: "animator.js", export: "AnimatorGroup" },
    { name: "State", table: "STATES", module: "state.js", export: "State" },
];
//# sourceMappingURL=registry.js.map
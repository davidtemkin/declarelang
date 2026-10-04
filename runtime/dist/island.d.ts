import { View, type App } from "./view.js";
import type { Surface } from "./backend.js";
import { BoundaryValues } from "./boundary.js";
/** The value an island provides under `name` — the `provided("name")` read AT
 *  the island: its own provision or declared slot first, then its ancestors.
 *  Undefined when nothing provides it. Tracked (the readers of a provision
 *  wake on change), so an observe over it follows the host. */
export declare function islandProvision(island: Island, name: string): unknown;
/** Everything an island provides right now, by name — what a host passes as
 *  build's `provides` for the tenant it is about to build, so the tenant's
 *  first evaluation sees it; linkIslandTenant keeps it live from there. */
export declare function islandProvisions(island: Island): Record<string, unknown>;
/** A tenant's connection, installed by linkIslandTenant / the foreign handle. */
interface TenantSink {
    message(topic: string, payload: unknown): void;
}
/** Island — the abstract boundary box. Concrete kinds decide what the tenant
 *  IS (DOMIsland: foreign DOM; AppIsland: a Declare program); this base owns
 *  the bridge — the external-fact surface and the message verbs. */
export declare class Island extends View {
    provides: readonly string[];
    /** @internal the linked tenant's delivery sink (null = nothing linked). */
    tenantSink: TenantSink | null;
    /** @internal the values the hosted side exposes, by name (`exposed` reads). */
    readonly exposedValues: BoundaryValues;
    /** The host's read of a value the hosted side EXPOSES — a Declare tenant's
     *  `exposes` name, or foreign content's `expose(name, value)`. Tracked like
     *  any attribute read, so a constraint over it re-derives when the hosted
     *  side changes it. The default types the read: an absent value, or one of a
     *  different kind, answers the default (the latter with a warning). With no
     *  default an absent value throws, naming it. */
    exposed(name: string, ...dflt: unknown[]): unknown;
    /** The message verb, host → tenant (`post`, in the postMessage lineage —
     *  `message` is the stream family's event). Dropped with a console note
     *  when no tenant is linked — a verb has no meaning without a receiver. */
    post(topic: string, payload?: unknown): void;
    /** @internal tenant → host verb arrival: fire the declared onPost with the
     *  one-record payload `{ topic, payload }` (IslandPost). */
    receiveMessage(topic: string, payload: unknown): void;
    /** The value this island provides under `name`, if `name` is on its
     *  `provides` list — else undefined, with a warning (the host did not offer
     *  it). What a hosted side's read resolves to. */
    providedValue(name: string): unknown;
    /** The foreign content's handle — built once, attached to the island's
     *  element by the DOM backend (`el.__declareIsland`). The whole sanctioned
     *  surface for non-Declare content, in the same words a Declare tenant
     *  uses: read what the host provides, expose values up, and the verbs. */
    private handle;
    foreignHandle(): Record<string, unknown>;
}
/** Link an Island to a DECLARE tenant (host-client renderChild, the canvas
 *  island service, the mac runner). DOWN: every name on the island's
 *  `provides` list, resolved at the island, is provided to the tenant (what
 *  its `hostProvided` reads return) and kept live. UP: every name on the
 *  tenant's `exposes` list is delivered into the island's exposed values
 *  (what the host's `exposed` reads return) and kept live. The verbs link
 *  both ways. Build the tenant with `provides: islandProvisions(island)` so
 *  its first evaluation already sees what the host provides, and link it
 *  before its first settle. Returns the unlink. */
export declare function linkIslandTenant(island: Island, tenant: App): () => void;
/** DOMIsland — the FOREIGN-CONTENT island (design: the `DOMIsland [ … ]` view). A leaf
 *  whose box Declare lays out and constrains normally, but whose interior is
 *  host-managed DOM: the `slot` key is reflected onto the element (DOM backend)
 *  so the host can mount an iframe / textarea / any element into the Declare-sized
 *  box — its width/height follow this view's constraints with no coordinate
 *  sync. Carries the Island boundary: `provides` down, `exposed` up, and the
 *  post/onPost verbs, reachable from the foreign side through the element's
 *  `__declareIsland`. */
export declare class DOMIsland extends Island {
    slot: string;
    childName: string;
    protected $flush(s: Surface): void;
}
export {};

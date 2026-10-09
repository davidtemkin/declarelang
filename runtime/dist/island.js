// island — the boundary box (Island) and its foreign-content kind (DOMIsland),
// the link to a Declare tenant, and the provisions an island offers it. Its
// own module so a program that hosts no island carries none of it (the
// `islands` capability, compiler/src/capabilities.ts); nothing in the core
// imports it — the registry names DOMIsland, and a host links a tenant.
import { View, fireEvent } from "./view.js";
import { declarationsOf, defineAttributes, localProvision } from "./attributes.js";
import { observe } from "./reactive.js";
import { BoundaryValues } from "./boundary.js";
/** The value an island provides under `name` — the `provided("name")` read AT
 *  the island: its own provision or declared slot first, then its ancestors.
 *  Undefined when nothing provides it. Tracked (the readers of a provision
 *  wake on change), so an observe over it follows the host. */
export function islandProvision(island, name) {
    const own = localProvision(island, name);
    if (own !== undefined)
        return own;
    const decls = declarationsOf(island);
    if (decls[name] !== undefined)
        return island[name];
    return island.$provided(name, undefined);
}
/** Everything an island provides right now, by name — what a host passes as
 *  build's `provides` for the tenant it is about to build, so the tenant's
 *  first evaluation sees it; linkIslandTenant keeps it live from there. */
export function islandProvisions(island) {
    const out = {};
    for (const n of providesOf(island)) {
        const v = islandProvision(island, n);
        if (v !== undefined)
            out[n] = v;
    }
    return out;
}
/** The names an island provides, as a clean string list. */
function providesOf(island) {
    const p = island.provides;
    return Array.isArray(p) ? p.filter((n) => typeof n === "string") : [];
}
/** Island — the abstract boundary box. Concrete kinds decide what the tenant
 *  IS (DOMIsland: foreign DOM; AppIsland: a Declare program); this base owns
 *  the bridge — the external-fact surface and the message verbs. */
export class Island extends View {
    /** An embedded program runs, and is read, while hidden. */
    $eagerSurface() { return true; }
    /** @internal the linked tenant's delivery sink (null = nothing linked). */
    tenantSink = null;
    /** @internal the values the hosted side exposes, by name (`exposed` reads). */
    exposedValues = new BoundaryValues("exposed");
    /** The host's read of a value the hosted side EXPOSES — a Declare tenant's
     *  `exposes` name, or foreign content's `expose(name, value)`. Tracked like
     *  any attribute read, so a constraint over it re-derives when the hosted
     *  side changes it. The default types the read: an absent value, or one of a
     *  different kind, answers the default (the latter with a warning). With no
     *  default an absent value throws, naming it. */
    exposed(name, ...dflt) {
        return this.exposedValues.read(name, dflt.length > 0, dflt[0]);
    }
    /** The message verb, host → tenant (`post`, in the postMessage lineage —
     *  `message` is the stream family's event). Dropped with a console note
     *  when no tenant is linked — a verb has no meaning without a receiver. */
    post(topic, payload) {
        if (this.tenantSink === null) {
            console.warn(`[Declare] ${this.constructor.name}.post("${topic}"): no tenant linked — message dropped`);
            return;
        }
        this.tenantSink.message(topic, payload);
    }
    /** @internal tenant → host verb arrival: fire the declared onPost with the
     *  one-record payload `{ topic, payload }` (IslandPost). */
    $receiveMessage(topic, payload) {
        fireEvent(this, "post", { topic, payload });
    }
    /** The value this island provides under `name`, if `name` is on its
     *  `provides` list — else undefined, with a warning (the host did not offer
     *  it). What a hosted side's read resolves to. */
    $providedValue(name) {
        if (!providesOf(this).includes(name)) {
            console.warn(`[Declare] hostProvided("${name}"): this island does not list '${name}' in its provides (${providesOf(this).join(", ") || "none"})`);
            return undefined;
        }
        return islandProvision(this, name);
    }
    /** The foreign content's handle — built once, attached to the island's
     *  element by the DOM backend (`el.__declareIsland`). The whole sanctioned
     *  surface for non-Declare content, in the same words a Declare tenant
     *  uses: read what the host provides, expose values up, and the verbs. */
    handle = null;
    $foreignHandle() {
        if (this.handle !== null)
            return this.handle;
        const island = this;
        const messageCbs = [];
        this.tenantSink ??= {
            message: (topic, payload) => { for (const cb of messageCbs)
                cb({ topic, payload }); },
        };
        this.handle = {
            /** the current value the host provides under `name` (plain data), or
             *  undefined when the island does not list it */
            hostProvided: (name) => island.$providedValue(name),
            /** a standing watch over a provided value: cb(value) now, then at the
             *  close of each settle that changed it; returns the unwatch */
            watchProvided: (name, cb) => {
                cb(island.$providedValue(name));
                return observe(() => (providesOf(island).includes(name) ? islandProvision(island, name) : undefined), (v) => cb(v), `island:${name}`);
            },
            /** expose a value up to the host — read there with `exposed(name, default)`,
             *  whose default's kind the value must match */
            expose: (name, v) => {
                if (v === undefined)
                    island.exposedValues.clear(name);
                else
                    island.exposedValues.write(name, v);
            },
            /** tenant → host message (fires the island's onPost) */
            post: (topic, payload) => island.$receiveMessage(topic, payload),
            /** host → tenant messages (island.post lands here); cb({ topic, payload }) */
            onPost: (cb) => { messageCbs.push(cb); return () => { const i = messageCbs.indexOf(cb); if (i >= 0)
                messageCbs.splice(i, 1); }; },
            /** the names the host provides here, for discovery */
            provides: () => providesOf(island),
        };
        return this.handle;
    }
}
/** A standing sync of a NAMED SET of values: `read()` returns the current
 *  { name → value } (tracked), and each settle that changes it delivers the
 *  names whose value changed, and the names that left. Shared by both
 *  directions of the island link. */
function syncNamed(read, put, drop, label) {
    let last = {};
    const apply = (next) => {
        for (const n of Object.keys(next))
            if (!(n in last) || !Object.is(last[n], next[n]))
                put(n, next[n]);
        for (const n of Object.keys(last))
            if (!(n in next))
                drop(n);
        last = next;
    };
    apply(read());
    // observe coalesces equal results one level deep; a fresh record per run
    // is compared here, name by name, so identical values deliver nothing
    return observe(() => { const r = read(); return Object.keys(r).sort().flatMap((k) => [k, r[k]]); }, () => apply(read()), label);
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
export function linkIslandTenant(island, tenant) {
    const undo = [];
    undo.push(syncNamed(() => islandProvisions(island), (n, v) => tenant.provide(n, v), (n) => tenant.provide(n, undefined), "link:provides"));
    undo.push(syncNamed(() => {
        const out = {};
        const list = tenant.exposes;
        if (Array.isArray(list))
            for (const n of list) {
                if (typeof n !== "string")
                    continue;
                const v = tenant[n];
                if (v !== undefined)
                    out[n] = v;
            }
        return out;
    }, (n, v) => island.exposedValues.write(n, v), (n) => island.exposedValues.clear(n), "link:exposes"));
    // verbs, both directions
    island.tenantSink = {
        message: (topic, payload) => fireEvent(tenant, "post", { topic, payload }),
    };
    tenant.hostSink = { message: (topic, payload) => island.$receiveMessage(topic, payload) };
    undo.push(() => { island.tenantSink = null; tenant.hostSink = null; });
    return () => { for (const fn of undo.splice(0)) {
        try {
            fn();
        }
        catch { /* torn down */ }
    } };
}
/** DOMIsland — the FOREIGN-CONTENT island (design: the `DOMIsland [ … ]` view). A leaf
 *  whose box Declare lays out and constrains normally, but whose interior is
 *  host-managed DOM: the `slot` key is reflected onto the element (DOM backend)
 *  so the host can mount an iframe / textarea / any element into the Declare-sized
 *  box — its width/height follow this view's constraints with no coordinate
 *  sync. Carries the Island boundary: `provides` down, `exposed` up, and the
 *  post/onPost verbs, reachable from the foreign side through the element's
 *  `__declareIsland`. */
export class DOMIsland extends Island {
    $flush(s) {
        super.$flush(s);
        if (this.slot !== "")
            s.setEmbed(this.slot, this);
    }
}
defineAttributes(DOMIsland, {
    slot: { def: "", push: (v, id) => v.$surface?.setEmbed(id, v) },
    childName: { def: "" },
});
//# sourceMappingURL=island.js.map
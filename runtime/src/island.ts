// island — the boundary box (Island) and its foreign-content kind (DOMIsland),
// the link to a Declare tenant, and the provisions an island offers it. Its
// own module so a program that hosts no island carries none of it (the
// `islands` capability, compiler/src/capabilities.ts); nothing in the core
// imports it — the registry names DOMIsland, and a host links a tenant.

import { View, fireEvent, type App } from "./view.js";
import type { Surface } from "./backend.js";
import { declarationsOf, defineAttributes, localProvision } from "./attributes.js";
import { observe } from "./reactive.js";
import { BoundaryValues } from "./boundary.js";
import { scrollPlaces, holdScrollPlaces } from "./scroll-places.js";
import { withdrawPaintGuests } from "./view.js";
import { withdrawOpen } from "./outside.js";
import { Keys } from "./keys.js";
import { navigationOf } from "./navigation.js";
import { declareName } from "./declare-name.js";

/** The island's own box, as a host hands it to the link: its scroll, which is
 *  where a tenant that scrolls as a page scrolls (the box is its viewport). */
export interface IslandBox { scrollY(): number; scrollTo(y: number): number }

/** The value an island provides under `name` — the `provided("name")` read AT
 *  the island: its own provision or declared slot first, then its ancestors.
 *  Undefined when nothing provides it. Tracked (the readers of a provision
 *  wake on change), so an observe over it follows the host. */
export function islandProvision(island: Island, name: string): unknown {
  const own = localProvision(island, name);
  if (own !== undefined) return own;
  const decls = declarationsOf(island);
  if (decls[name] !== undefined) return (island as unknown as Record<string, unknown>)[name];
  const v = (island as unknown as { $provided(n: string, d: unknown): unknown }).$provided(name, undefined);
  // the overlay layer goes on up the chain: nothing in this program provides
  // one, so the one this program's own host provides (planes.md §12)
  if (v === undefined && name === OVERLAYS) return (island as unknown as { $hostProvided(n: string, d: unknown): unknown }).$hostProvided(name, undefined);
  return v;
}

/** Everything an island provides right now, by name — what a host passes as
 *  build's `provides` for the tenant it is about to build, so the tenant's
 *  first evaluation sees it; linkIslandTenant keeps it live from there. */
export function islandProvisions(island: Island): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const n of providesOf(island)) { const v = islandProvision(island, n); if (v !== undefined) out[n] = v; }
  return out;
}

/** The overlay layer's provision (library `Floating`, planes.md §11). */
const OVERLAYS = "overlays";

/** The names an island provides, as a clean string list. An island that hosts
 *  a Declare program (it declares `containOverlays`, as `AppIsland` does) also
 *  offers the overlay layer unless it keeps its program's overlays in its box:
 *  a hosted program's menus and dialogs open in the nearest layer up the chain
 *  — its window's — without the host listing anything. */
function providesOf(island: Island): string[] {
  const p = (island as unknown as { provides?: unknown }).provides;
  const out = Array.isArray(p) ? p.filter((n): n is string => typeof n === "string") : [];
  const contain = (island as unknown as { containOverlays?: unknown }).containOverlays;
  if (contain === false && !out.includes(OVERLAYS)) out.push(OVERLAYS);
  return out;
}


// ═══ Islands — the boundary is a box, and the box has a typed surface ════════
//
// An Island is a View whose INTERIOR belongs to a TENANT — foreign DOM
// (DOMIsland) or a whole other Declare program (AppIsland, library). The
// bridge across that boundary is two channels with two natures (islands
// design, ruled 2026-08-20):
//
//   FACTS — the instance's `external` attribute declarations (parser.ts).
//   Typed, declared on BOTH sides (the island's declarations are the host's
//   half; a tenant App's `external` declarations are its exports), paired by
//   name at link time with a TYPE HANDSHAKE — two separately compiled programs
//   cannot share a static proof, so agreement is checked at the moment the
//   pairing forms, like a linker resolving extern symbols; a mismatch is a
//   link error, not a mid-session surprise. Direction is arbitrated by the
//   OWNERSHIP machinery (a host-bound slot refuses tenant pushes, loudly —
//   the same referee `location` lives under), with `readonly external` as the
//   opt-in stricter spelling for a tenant-owned out-fact.
//
//   VERBS — post(topic, payload) / onPost({ topic, payload }), both directions,
//   data-shaped payloads. Consumed once, ordered, never re-readable: what
//   state slots must not be abused into (the pendingNav lesson).
//
// Foreign (non-Declare) tenants reach the same bridge through ONE sanctioned
// JS handle (the island element's `__declareIsland`): get/set/observe/post/
// onPost — set is boundary-VALIDATED against the declared type, since a
// foreign push has no compiler behind it (the same trust-edge rule a
// DataSource applies to arriving bytes).

/** A tenant's connection, installed by linkIslandTenant / the foreign handle. */
interface TenantSink {
  message(topic: string, payload: unknown): void;
}



/** Island — the abstract boundary box. Concrete kinds decide what the tenant
 *  IS (DOMIsland: foreign DOM; AppIsland: a Declare program); this base owns
 *  the bridge — the external-fact surface and the message verbs. */
export class Island extends View {
  /** An embedded program runs, and is read, while hidden. */
  protected override $eagerSurface(): boolean { return true; }
  declare provides: readonly string[];
  /** @internal the linked tenant's delivery sink (null = nothing linked). */
  tenantSink: TenantSink | null = null;
  /** @internal the linked Declare tenant — the program focus on this island
   *  hands the keyboard to (null = none linked). */
  $tenant: View | null = null;
  /** @internal the values the hosted side exposes, by name (`exposed` reads). */
  readonly exposedValues = new BoundaryValues("exposed");

  /** The host's read of a value the hosted side EXPOSES — a Declare tenant's
   *  `exposes` name, or foreign content's `expose(name, value)`. Tracked like
   *  any attribute read, so a constraint over it re-derives when the hosted
   *  side changes it. The default types the read: an absent value, or one of a
   *  different kind, answers the default (the latter with a warning). With no
   *  default an absent value throws, naming it. */
  exposed(name: string, ...dflt: unknown[]): unknown {
    return this.exposedValues.read(name, dflt.length > 0, dflt[0]);
  }

  /** The message verb, host → tenant (`post`, in the postMessage lineage —
   *  `message` is the stream family's event). Dropped with a console note
   *  when no tenant is linked — a verb has no meaning without a receiver. */
  post(topic: string, payload?: unknown): void {
    if (this.tenantSink === null) { console.warn(`[Declare] ${declareName(this)}.post("${topic}"): no tenant linked — message dropped`); return; }
    this.tenantSink.message(topic, payload);
  }

  /** @internal tenant → host verb arrival: fire the declared onPost with the
   *  one-record payload `{ topic, payload }` (IslandMessage). */
  $receiveMessage(topic: string, payload: unknown): void {
    fireEvent(this, "post", { topic, payload });
  }

  /** The value this island provides under `name`, if `name` is on its
   *  `provides` list — else undefined, with a warning (the host did not offer
   *  it). What a hosted side's read resolves to. */
  $providedValue(name: string): unknown {
    if (!providesOf(this).includes(name)) {
      console.warn(`[Declare] hostProvided("${name}"): this island does not list '${name}' in its provides (${providesOf(this).join(", ") || "none"})`);
      return undefined;
    }
    return islandProvision(this, name);
  }

  /** The foreign content's handle — built once, attached to the island's
   *  element by the DOM backend (`el.__declareIsland`). The whole sanctioned
   *  surface for non-Declare content, reaching what a Declare tenant reaches:
   *  read what the host provides, expose values up, and the verbs (named as
   *  the island's: post / onPost). */
  private handle: Record<string, unknown> | null = null;
  $foreignHandle(): Record<string, unknown> {
    if (this.handle !== null) return this.handle;
    const island = this;
    const messageCbs: Array<(m: { topic: string; payload: unknown }) => void> = [];
    this.tenantSink ??= {
      message: (topic, payload) => { for (const cb of messageCbs) cb({ topic, payload }); },
    };
    this.handle = {
      /** the current value the host provides under `name` (plain data), or
       *  undefined when the island does not list it */
      hostProvided: (name: string) => island.$providedValue(name),
      /** a standing watch over a provided value: cb(value) now, then at the
       *  close of each settle that changed it; returns the unwatch */
      watchProvided: (name: string, cb: (v: unknown) => void) => {
        cb(island.$providedValue(name));
        return observe(() => (providesOf(island).includes(name) ? islandProvision(island, name) : undefined), (v) => cb(v), `island:${name}`);
      },
      /** expose a value up to the host — read there with `exposed(name, default)`,
       *  whose default's kind the value must match */
      expose: (name: string, v: unknown) => {
        if (v === undefined) island.exposedValues.clear(name);
        else island.exposedValues.write(name, v);
      },
      /** tenant → host message (fires the island's onPost) */
      post: (topic: string, payload?: unknown) => island.$receiveMessage(topic, payload),
      /** host → tenant messages (island.post lands here); cb({ topic, payload }) */
      onPost: (cb: (m: { topic: string; payload: unknown }) => void) => { messageCbs.push(cb); return () => { const i = messageCbs.indexOf(cb); if (i >= 0) messageCbs.splice(i, 1); }; },
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
function syncNamed(read: () => Record<string, unknown>, put: (name: string, v: unknown) => void, drop: (name: string) => void, label: string): () => void {
  let last: Record<string, unknown> = {};
  const apply = (next: Record<string, unknown>): void => {
    for (const n of Object.keys(next)) if (!(n in last) || !Object.is(last[n], next[n])) put(n, next[n]);
    for (const n of Object.keys(last)) if (!(n in next)) drop(n);
    last = next;
  };
  apply(read());
  // observe coalesces equal results one level deep; a fresh record per run
  // is compared here, name by name, so identical values deliver nothing
  return observe(() => { const r = read(); return Object.keys(r).sort().flatMap((k) => [k, r[k]]); }, () => apply(read()), label);
}

/** One navigation an embedded app asked for — its `navigate(to)` or
 *  `openWindow(to)` — as its island's `onNavigate` receives it: the address
 *  made absolute, the Declare program it names (its `.declare` path without
 *  the extension, a directory taken as its same-named program; "" when it
 *  names none) and the location after its `#`, and whether it asked for a
 *  window of its own. */

/** An embedded app's navigation verbs, answered by the island that hosts it
 *  when that island declares `onNavigate` — the hosting program decides what
 *  a link inside it means (a desktop opens a window) — and by `fallback`, the
 *  page or the window, when it does not. `resolve` makes an address absolute
 *  the way the host's own navigation would. A host hands the result to the
 *  tenant as its services (provideHostServices). */
export function islandNavigation(island: View | null, resolve: (u: string) => string,
                                 fallback: { navigate(u: string): void; openWindow(u: string): void }): { navigate(u: string): void; openWindow(u: string): void } {
  const routed = (u: string, newWindow: boolean): boolean => {
    if (island === null || typeof (island as unknown as { onNavigate?: unknown }).onNavigate !== "function") return false;
    fireEvent(island, "navigate", navigationOf(resolve(u), newWindow));
    return true;
  };
  return {
    navigate: (u) => { if (!routed(u, false)) fallback.navigate(u); },
    openWindow: (u) => { if (!routed(u, true)) fallback.openWindow(u); },
  };
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
export function linkIslandTenant(island: Island, tenant: App, box: IslandBox | null = null): () => void {
  const undo: Array<() => void> = [];
  undo.push(syncNamed(
    () => islandProvisions(island),
    (n, v) => tenant.$provideHostValue(n, v),
    (n) => tenant.$provideHostValue(n, undefined),
    "link:provides"));
  undo.push(syncNamed(
    () => {
      const out: Record<string, unknown> = {};
      const list = (tenant as unknown as { exposes?: unknown }).exposes;
      if (Array.isArray(list)) for (const n of list) {
        if (typeof n !== "string") continue;
        const v = (tenant as unknown as Record<string, unknown>)[n];
        if (v !== undefined) out[n] = v;
      }
      return out;
    },
    (n, v) => island.exposedValues.write(n, v),
    (n) => island.exposedValues.clear(n),
    "link:exposes"));
  // WHERE THE TENANT IS — an island that declares `location` (AppIsland)
  // carries its tenant's location both ways. The host's value seeds the
  // tenant before its first settle, and a later write sends it there (as a
  // follow, so the tenant's onFollowLink applies); the tenant's own navigation is
  // reflected back up. What the host does with it — show it, keep it, walk it
  // back — is the host's: Back across an island is the host's to give.
  const host = island as unknown as { location?: unknown; place?: unknown; departedPlace?: unknown };
  if (typeof host.location === "string") {
    if (host.location !== "" && tenant.location !== host.location) tenant.location = host.location;
    undo.push(observe(() => tenant.location, (v) => { if (host.location !== v) host.location = v; }, "link:location-up"));
    undo.push(observe(() => host.location as string, (v) => { if (tenant.location !== v) tenant.followLink("#" + v); }, "link:location-down"));
  }
  // WHERE IN IT the tenant was — its panes' scroll by path and its box's own
  // (runtime scroll-places) — published as `departedPlace` the moment it
  // leaves a location (its first location write of a settle, App.$departing),
  // and landed when the host sets `place` (after the move it pairs with has
  // settled, as a page's Back lands). Opaque to the host: it keeps the value
  // with its own record of where the tenant was, and hands it back.
  if (typeof host.departedPlace === "string" && typeof host.place === "string") {
    tenant.$onDepart = () => {
      host.departedPlace = JSON.stringify({ ...(box !== null ? { s: box.scrollY() } : {}), v: scrollPlaces(tenant) });
    };
    undo.push(() => { tenant.$onDepart = null; });
    undo.push(observe(() => host.place as string, (v) => {
      if (v === "") return;
      try { holdScrollPlaces(tenant, JSON.parse(v), box !== null ? (y) => box.scrollTo(y) : null); } catch { /* not a place */ }
      host.place = "";
    }, "link:place"));
  }
  // verbs, both directions
  island.tenantSink = {
    message: (topic, payload) => tenant.$receiveHostMessage(topic, payload),
  };
  tenant.$hostSink = { message: (topic, payload) => island.$receiveMessage(topic, payload) };
  island.$tenant = tenant;
  tenant.$hostIsland = island;
  undo.push(() => { island.tenantSink = null; tenant.$hostSink = null; island.$tenant = null; tenant.$hostIsland = null; });
  // what the program had in its host goes with it: its overlays open in the
  // host's layers, and the keyboard they held (run first: undo runs in order)
  undo.unshift(() => { withdrawPaintGuests(tenant); withdrawOpen(tenant); Keys.releaseProgram(tenant); });
  return () => { for (const fn of undo.splice(0)) { try { fn(); } catch { /* torn down */ } } };
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
  declare slot: string;
  declare childName: string;

  protected $flush(s: Surface): void {
    super.$flush(s);
    if (this.slot !== "") s.setEmbed(this.slot, this);
  }
}

defineAttributes(DOMIsland, {
  slot: { def: "", push: (v, id) => v.$surface?.setEmbed(id, v) },
  childName: { def: "" },
});


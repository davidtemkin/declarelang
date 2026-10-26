// address — the app's (location, waypoint) pair and the page's history, across the worker.
//
// browser/host-client.js keeps the pair and the browser's history in step on the DOM and
// canvas renderers (docs/system-design/location.md). Under render=gpu the app lives in this
// worker and history on the page, so the same rules run here and the page carries out the
// history verbs (shell.ts): the URL's fragment carries the address, the entry's state object
// the step; one entry per settle that changed either; a clean URL at the declared initial;
// an ARRIVAL rebuilds from the URL, a TRAVERSAL restores the entry's pair; Back and Forward
// write both back through `follow`. Where the user was on each entry (its scroll places) is
// noted when the app leaves the entry and landed when a traversal comes back to it; the table
// lives in the page's sessionStorage (the shell keeps it), so a reload and Back still find it.

import { observe, settle } from "../../runtime/dist/index.js";
import { scrollPlaces, holdScrollPlaces, dropScrollPlaces, type Place } from "../../runtime/dist/scroll-places.js";

export interface AddressSeed {
  /** The page's fragment, decoded, without the '#'. */
  fragment: string;
  /** history.state when the page booted. */
  state: unknown;
  /** The document was entered by Back or Forward (PerformanceNavigationTiming). */
  traversed: boolean;
  /** Where the user was on each entry, from the page's sessionStorage. */
  places?: Record<string, Place>;
}

interface App {
  location: string;
  waypoint: string;
  follow?: (ref: string) => void;
  pendingHistoryVerb?: string;
  scrollY: number;
  scrollTo?: (y: number) => void;
  $onDepart?: (() => void) | null;
  $cancelReveal?: () => void;
}

type Post = (m: { t: string } & Record<string, unknown>) => void;

const stepOf = (state: unknown): string => {
  const w = (state as { declare?: { w?: unknown } } | null)?.declare?.w;
  return typeof w === "string" ? w : "";
};
const idOf = (state: unknown): string | null => {
  const id = (state as { declare?: { id?: unknown } } | null)?.declare?.id;
  return typeof id === "string" ? id : null;
};
const newId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Before the first settle: the step, then the address, from the page (host-client's seed). */
export function seedAddress(app: App, seed: AddressSeed): string {
  const initial = app.location;
  const step = seed.traversed ? stepOf(seed.state) : "";
  if (step !== "" && app.waypoint !== step) app.waypoint = step;
  if (seed.fragment) {
    if (typeof app.follow === "function") app.follow("#" + seed.fragment);
    else app.location = seed.fragment;
  }
  if (seed.fragment || step !== "") settle();
  return initial;
}

/** After mount: the mirror outward per settle, and Back/Forward inward (`pop`). */
export function wireAddress(app: App, initial: string, seed: AddressSeed, post: Post): { pop(state: unknown, fragment: string): void; userScrolled(): void; keep(): void } {
  let entryId = idOf(seed.state) ?? newId();
  // where the user was, per entry: here the root is the app's own scroll
  const places: Record<string, Place> = { ...(seed.places ?? {}) };
  const live = (): Place => ({ s: app.scrollY, v: scrollPlaces(app as never) });
  const note = (id: string, place: Place): void => {
    delete places[id];
    places[id] = place;                                   // newest last, so the cap drops the oldest
    const ids = Object.keys(places);
    for (let i = 0; i < ids.length - 100; i++) delete places[ids[i]];
    post({ t: "places", places });
  };
  const rootTo = (y: number): number => { app.scrollTo?.(y); return app.scrollY; };
  const land = (id: string): void => { const p = places[id]; if (p) holdScrollPlaces(app as never, p, rootTo); };
  // the app's first location or waypoint write of a settle is the moment it leaves the entry
  let departing: Place | null = null;
  app.$onDepart = () => { departing = live(); };
  let mirrored = app.location, mirroredW = app.waypoint;
  const entry = (): Record<string, unknown> => ({ declare: { w: app.waypoint, id: entryId } });
  const frag = (loc: string): string => (loc === initial ? "" : "#" + loc);
  const replace = (): void => {
    post({ t: "history", verb: "replace", state: entry(), frag: frag(app.location) });
    mirrored = app.location; mirroredW = app.waypoint;
    if (app.$pendingHistoryVerb !== undefined) app.$pendingHistoryVerb = "push";
  };
  replace();
  let traversing = false;
  observe(() => [app.location, app.waypoint], () => {
    if (traversing || (app.location === mirrored && app.waypoint === mirroredW)) return;
    const verb = app.$pendingHistoryVerb === "replace" ? "replace" : "push";
    if (app.$pendingHistoryVerb !== undefined) app.$pendingHistoryVerb = "push";
    if (app.waypoint.length > 64 * 1024)
      console.error("[Declare] waypoint exceeds 64KB — a waypoint is coordinates in the session, not the session's data; derive the data from it instead (guide: URLs, links and history)");
    dropScrollPlaces(app as never);                    // the app moved on: no late landing
    if (verb === "push") { note(entryId, departing ?? live()); entryId = newId(); }
    departing = null;
    post({ t: "history", verb, state: entry(), frag: frag(app.location) });
    mirrored = app.location; mirroredW = app.waypoint;
  }, "gpu:history");
  // a traversal into this document lands where the user left the entry (an @name reveal,
  // which is in the URL, lands instead)
  if (seed.traversed && seed.fragment.indexOf("@") < 0) land(entryId);
  return {
    // A traversal: the place just left noted, the step, then the address through follow;
    // whatever follow decides is squared to this entry by replace — a traversal never pushes.
    pop(state: unknown, fragment: string): void {
      note(entryId, live());
      dropScrollPlaces(app as never);
      entryId = idOf(state) ?? newId();
      traversing = true;
      try {
        const w = stepOf(state);
        if (app.waypoint !== w) app.waypoint = w;
        const ref = fragment || initial;
        if (typeof app.follow === "function") app.follow("#" + ref);
        else app.location = ref;
        settle();
      } finally { traversing = false; }
      replace();
      departing = null;
      if ((fragment || initial).indexOf("@") < 0) land(entryId);
    },
    // the user's own scroll drops a held landing and a held reveal
    userScrolled(): void { dropScrollPlaces(app as never); app.$cancelReveal?.(); },
    // the page is going away: the place on this entry is kept
    keep(): void { note(entryId, live()); },
  };
}

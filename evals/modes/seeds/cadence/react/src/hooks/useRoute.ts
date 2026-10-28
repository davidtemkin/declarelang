// A tiny hash router. Sheets are addressable so the phone's back gesture
// closes them, and a session can be linked to directly.
//
//   #/add                   record a session
//   #/session/s0123         look at one
//   #/session/s0123/edit    correct it

import { useCallback, useSyncExternalStore } from "react";

export type Route =
  | { name: "home" }
  | { name: "add" }
  | { name: "session"; id: string }
  | { name: "edit"; id: string };

function parse(hash: string): Route {
  const [, first, id, action] = hash.replace(/^#/, "").split("/");
  if (first === "add") return { name: "add" };
  if (first === "session" && id) return action === "edit" ? { name: "edit", id } : { name: "session", id };
  return { name: "home" };
}

function toHash(route: Route): string {
  switch (route.name) {
    case "home": return "";
    case "add": return "#/add";
    case "session": return `#/session/${route.id}`;
    case "edit": return `#/session/${route.id}/edit`;
  }
}

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const snapshot = () => window.location.hash;

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, snapshot);
  const route = parse(hash);

  const navigate = useCallback((next: Route, { replace = false } = {}) => {
    const url = toHash(next) || window.location.pathname + window.location.search;
    // Remember how deep into the app's own history we are, so closing a sheet
    // can step back rather than piling up entries.
    const depth = ((history.state?.depth as number) ?? 0) + (replace ? 0 : 1);
    if (replace) history.replaceState({ depth }, "", url);
    else history.pushState({ depth }, "", url);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, []);

  /** Close whatever is open: step back if we opened it, otherwise go home. */
  const close = useCallback(() => {
    if ((history.state?.depth ?? 0) > 0) history.back();
    else navigate({ name: "home" }, { replace: true });
  }, [navigate]);

  return { route, navigate, close };
}

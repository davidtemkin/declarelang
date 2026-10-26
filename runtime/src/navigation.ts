// navigation — the record a program's navigation is handed to whoever carries
// it out: an island's onNavigate (island.ts), or an embedding page's
// `boot({ onNavigate })` (host-client; the GPU page shell). A leaf with no
// imports, so a page-side bundle can carry it without the runtime.

/** Where a hosted program asked to go: the resolved address, the program it
 *  names (a `.declare` file or a program directory; "" when it names none), the
 *  location in its fragment, and whether it asked for a new window. */
export interface IslandNavigation { to: string; program: string; location: string; newWindow: boolean }

/** The record a navigation is handed to whoever carries it out — an island's
 *  onNavigate, or an embedding page's `boot({ onNavigate })`. */
export function navigationOf(to: string, newWindow: boolean): IslandNavigation {
  let program = "", location = "";
  try {
    const u = new URL(to);
    location = decodeURIComponent(u.hash.slice(1));
    const path = (u.origin === "null" ? u.protocol + "//" : u.origin) + u.pathname;   // a file: URL's origin is "null"
    if (u.pathname.endsWith(".declare")) program = path.slice(0, -".declare".length);
    else if (u.pathname.endsWith("/")) {
      const dir = u.pathname.split("/").filter((s) => s !== "").pop();
      if (dir !== undefined) program = path + dir;
    }
  } catch { /* not a URL: it names no program */ }
  return { to, program, location, newWindow };
}

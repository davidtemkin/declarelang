// browser/register-sw.js — register the distro Service Worker (../service-worker.js) and pick up new deploys.
//
// The SW is a STATIC-HOSTING capability: its whole job is to substitute for an absent
// server (turn a `.declare` navigation into a run page, compile in-browser, serve the
// runtime resources). Under the Node dev server none of that is wanted — the server
// answers those requests directly, and a SW here would only cache-fight the edit loop.
//
// So registration is GATED on a server-injected marker, exactly like OL5's index.html
// (`if (COMPILE==="server") return` before it registers): the dev server injects
// `<script>window.__declareServer=true</script>` into every HTML page it serves (see
// server/index.mjs), so boot-uniform's registerServiceWorker() short-circuits under the
// server and registers only on a dumb static host, which serves the page verbatim with
// no marker. No host-probing (localhost sniffing) — the presence of the server IS the
// signal, expressed as a variable.
//
// The worker lives at the distro ROOT (../service-worker.js from here), giving it root scope so
// it can intercept a `.declare` browsed anywhere under the deploy. Paths derive from THIS
// module's URL, so it all adapts to the origin root or a project subpath with no build step.

export async function registerServiceWorker() {
  if (typeof window !== "undefined" && window.__declareServer) return;  // under the Node server → the SW is redundant (see header)
  if (!("serviceWorker" in navigator)) return;   // an enhancement — the page still works without it
  const swUrl = new URL("../service-worker.js", import.meta.url);
  const scope = new URL("./", swUrl).pathname;    // the distro root == the worker's own directory

  // A new deploy activates a worker with a new BUILD_ID that posts `declare-updated`. If it
  // differs from the build this page booted with, reload ONCE onto the fresh version. Setting
  // sessionStorage BEFORE the reload guards against a loop (a second identical message no-ops).
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (!e.data || e.data.type !== "declare-updated") return;
    const seen = sessionStorage.getItem("declare-build");
    sessionStorage.setItem("declare-build", e.data.build);
    if (seen && seen !== e.data.build) location.reload();
  });

  try {
    const reg = await navigator.serviceWorker.register(swUrl, { scope, updateViaCache: "none" });
    reg.update().catch(() => {});   // force an update check each load → prompt pickup of new deploys
  } catch {
    // Registration needs https:// or http://localhost. Over a plain-http LAN IP it throws;
    // the page still renders (SW is purely additive), so swallow it.
  }
}

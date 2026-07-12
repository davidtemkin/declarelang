// Bridge to the Declare toolchain, both served on this same origin by the distro's
// dev server:
//   • POST /compile        — turns editor text (.declare) into a runnable program
//   • /runtime/dist/index.js — the renderer used to mount that program live
//
// We deliberately do NOT reimplement any Declare semantics here; the previews run
// the genuine compiled apps. This module only orchestrates compile → render → swap.

let runtimePromise = null;
// Loaded lazily and only in the browser. Kept in a variable (and @vite-ignore'd) so
// neither Vite nor Rollup tries to resolve/bundle a URL that only exists at runtime
// on the serving origin — it stays a live import against /runtime/dist/index.js.
const RUNTIME_URL = "/runtime/dist/index.js";
export function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = import(/* @vite-ignore */ RUNTIME_URL);
  }
  return runtimePromise;
}

// Compile .declare text to a runnable program string. Returns { source, errors }.
// `source` is null when compilation fails (callers keep the last good render).
export async function compile(text) {
  try {
    const res = await fetch("/compile", { method: "POST", body: text });
    return await res.json(); // { source, errors:[{message,line,offset}] }
  } catch (e) {
    return { source: null, errors: [{ message: String(e?.message || e) }] };
  }
}

// Mount a compiled program as an app inside `box`, disposing any previous one.
// The box must sit under a [data-neo-app] ancestor so the runtime treats it as an
// EMBEDDED preview — sizing to the box and scoping pointer/focus to it — instead of
// seizing the whole window.
export async function mount(box, compiledSource) {
  if (!compiledSource) return; // keep the last good render
  const rt = await loadRuntime();
  if (box.__app) {
    try {
      rt.disposeApp(box.__app);
    } catch {}
    box.__app = null;
  }
  box.innerHTML = "";
  try {
    box.__app = await rt.renderAsync(compiledSource, box, new rt.DomBackend());
  } catch (e) {
    // Runtime construction error — surface it; leave the box empty.
    throw e;
  }
}

export function dispose(box) {
  if (box && box.__app) {
    loadRuntime().then((rt) => {
      try {
        rt.disposeApp(box.__app);
      } catch {}
    });
    box.__app = null;
    box.innerHTML = "";
  }
}

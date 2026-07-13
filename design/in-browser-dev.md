# In-browser development — running the whole compiler client-side

**Status:** direction ruled 2026-07-13; numbers measured on this tree, worker transport and lazy-lib not yet built. The near-future goal is *real* in-browser development — edit a `.declare` and see it recompile, **including the full typecheck**, with no server. This note records what that costs, why it's realistic, and the architecture that gets there without breaking the one-compiler-API invariant (`constraints.md` §5, the uniform result).

## 1. Separability — it's already real, not aspirational

The whole plan rests on the compiler being separable from the runtime and from the app. It is, and one-way:

- **Runtime** (`runtime/dist`) — **zero-dependency, browser-loadable**: parser + schema/`check` + reactive core + backends + render. Everything an app needs to *run*.
- **Compiler** (`compiler` + the `dist-browser` bundle) — compile / resolve / dep-extract / typecheck. Imports **from** the runtime, one-way; the runtime never imports the compiler. Everything you need to *compile*.
- **App** — just the `.declare` source (bytes).

`boot-uniform` already loads the runtime eagerly and the compiler lazily: an app that only *runs* loads the runtime alone; an app being *edited* loads runtime + compiler. The one deliberate coupling — the **parser and schema live in the runtime**, not the compiler — is what makes the compile-time parse and the render-time re-parse the *same* code, so they cannot drift (it's why the uniform `deps` result is trustworthy). That coupling means the compiler depends on the runtime; it does not weaken the split.

Running `tsc` in a browser is well-trodden (the TypeScript Playground, Monaco, ts-morph). OL5 is our own precedent: its service worker is `{type:"module"}`, imports `lzc-browser.js`, and **compiles inside the SW** — and a Service Worker is itself an off-main-thread worker, so OL5's in-browser compile was async by construction.

## 2. One compiler, one flag — not two compilers

Typecheck is *already* Node-only in the source graph (`compile-browser` never imports `typecheck.ts`). But the browser bundle **already contains the full TS checker anyway** — `createTypeChecker` / `getSemanticDiagnostics` are in `declare-compiler.js` as dead weight, because `free-idents`/`dep-extract` import `typescript` for its *parser* and `typescript.js` is monolithic. So "the full compiler in the browser" is ~95% already shipped. We therefore keep **one compiler bundle**, and a **flag** — not a second artifact — decides whether the typecheck pass runs:

- `typecheck` **off** (default): parse → check → resolve → dep-extract. No lib, ~16 ms.
- `typecheck` **on**: additionally build the TS program over the `{ }` bodies and report NEO6001. Loads + parses `lib.d.ts` the first time only.

The flag gates the *pass* and the *lib load*, nothing else. Same names on every surface (`?typecheck`, `--typecheck`, `{ typecheck: true }`) — see `flags.ts` and the guide's shipping chapter.

## 3. `lib.d.ts` — what it is, and why it ships with the compiler

`lib.d.ts` is **data, not code**: TypeScript's declaration files for the ambient JS standard library (`Array`, `Math`, `Promise`, `String.prototype.toFixed`, `Map`, … — `lib.es5`…`lib.es2022`; DOM is deliberately excluded so `Text`/`Image` component names don't collide). No executable code, useless at runtime, consumed **only** by a TS *type checker*. In our pipeline it is touched *only* by the typecheck pass — the parser side (`free-idents`/`dep-extract`) never needs it, because parsing is pure syntax.

**Ruling: embed the ES `lib` closure in the compiler bundle** (one artifact), for two reasons: it is small — **52 KB gzipped** (511 KB raw) next to the ~1 MB you already ship — and, decisively, `lib.d.ts` must be **version-matched to the exact `tsc`** that reads it, which one artifact guarantees. **Parse it lazily**, though: download it with the bundle but build the TS program only on the *first* typecheck, so default light compiles pay nothing at runtime.

## 4. Cost — load-once vs. already-resident (measured on this tree)

| | cost | when |
|---|---|---|
| **Need-to-load (one-time, cacheable)** | | |
| download compiler bundle | 1.05 MB gz | first visit only — SW/CacheStorage caches it (already what we ship) |
| eval the bundle (V8 parse+init of 3.6 MB) | ~120 ms desktop (~2–4× phone) | once per page-load; once per *session* if the module stays resident |
| download embedded `lib` (typecheck) | 52 KB gz | rides with the bundle |
| build the TS program / parse `lib` (typecheck) | ~100 ms | once, if the program/host is kept resident |
| **Already-resident (per compile)** | | |
| light compile (no typecheck) | **16 ms** (64 ms cold-first) | every keystroke-batch — instant |
| typecheck, program **reused** | **~77 ms** | debounce-viable (pause/save) |
| typecheck, program rebuilt each time | 115 ms | the naïve path — avoid it |

The gap between "load" and "resident" is entirely one-time, cacheable work; it does **not** recur per compile. Three levers turn it into instant dev:

1. **Cache the bundle** — done (SW + `boot-uniform` CacheStorage); the 1 MB is first-visit-only.
2. **Keep the compiler module resident** across edits — don't re-`import()` per compile, so the ~120 ms eval is once-per-session.
3. **Reuse the TS program/host** across typechecks — turns 115 ms → ~77 ms (kills the ~38 ms/compile `lib` re-parse) and makes the ~100 ms `lib` parse one-time. Standard incremental-host / LanguageService pattern.

Steady state with all three: **~16 ms light, ~77 ms typecheck**, after a one-time ~1 MB (cached) + ~220 ms warmup.

## 5. Off the main thread — a compile Worker

Declare currently compiles on the **main thread** (`boot-uniform`/`boot-declare` `import` the compiler and call `compile()` synchronously). At 16 ms that is imperceptible; at the ~77–115 ms of a checked compile it would block the UI — dropped frames, frozen caret — on every recompile. So live in-browser typecheck needs the compiler **off the main thread**.

**Ruling: a dedicated Web Worker** hosts the compiler (rather than the SW, OL5-style). The page posts `{ source, flags }`; the worker runs the *same* `compile()` and posts back `{ source, deps, diagnostics }`. Rationale: it is the natural fit for the **live-edit loop** (debounced `postMessage` per edit), where the SW's request/response model is awkward; it keeps the main thread at 60 fps; and it becomes the home for **all** the heavy TS machinery — the 1 MB compiler, the 52 KB `lib`, the resident TS program (lever 3) — so the main thread's module graph never loads any of it (it holds only the runtime + a thin worker-client). (The SW-compile path stays ideal for *browse-to-run navigation*; the two coexist where each fits.)

**The invariant (non-negotiable).** The worker must run the **identical `compile()`** and return the **identical `{ source, deps }}`** as a Node or main-thread compile — typecheck is a strictly *additional* diagnostic layer, never a divergent compile. Same input → same result, across every thread and host. This is the same one-compiler-API rule as everywhere else (`constraints.md` §5): moving the compiler across a thread boundary is a *transport* change, not a semantic one.

## 6. Status / to build

> **Revision, 2026-07-13 — the Worker is BUILT.** `web/compile-worker.js` (a module Worker over the same dist-browser bundle) behind `web/compiler-client.js` — the ONE client every boot path now rides (uniform, static, browse-to-run, source viewer). The client prefers the worker (readiness-probed) and falls back to an inline import; both transports return the identical PROJECTED result `{ source, deps, diagnostics, report }` — the raw NeoError lists deliberately never cross the client surface (structured clone would silently strip an Error subclass's fields; `diagnostics` carries everything, structured AND rendered). The §5 invariant is **enforced by a test**: the perceptual suite compiles in a real module Worker in Chrome and asserts byte-identical JSON against the Node compiler, across clean / error / residue cases. The client also owns the auto-include library warm-load, registered as the compiler's DEFAULT (`setDefaultLibrary`) — the old per-call library obligation is gone by construction. Same revision: the browser gained `compileTracked` (the closure, with caller-supplied strong validators for HTTP re-probing), so multi-file freshness is uniform across Node and browser.

- **Have:** the separable layers (§1); the single compiler bundle with the checker resident AND the ES `lib` closure embedded (§3 — registered at bundle init via `provideLib`, +~54 KB gz); the uniform `compile()` result (source + deps + diagnostics + rendered `report`); **typecheck as a mandatory-by-default phase of the one `compile()`** — structurally un-omittable (the checker is a direct import, not an injection; `?typecheck=0` / `--no-typecheck` is the explicit latency opt-out) — identical on Node, in the browser, in the worker, on the wire, all tested byte-identical; the compile **Worker** (§5).
- **Build next:** reuse the TS program/host across typechecks (§4, lever 3) — the ~124 ms checked flagship compile is the number this attacks.
- **Non-goal:** a second "light" compiler artifact. Since the checker already ships, stripping TS from the parser would only help a *run-mostly* deploy — which already ships **no** compiler at all via `declarec`. Revisit only if a measured cold-load problem on real devices justifies it.

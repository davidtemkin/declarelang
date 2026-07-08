# neo-LZX composition — `include` and modules

How a neo-LZX file relates to *other* files. There are two mechanisms, and
they do genuinely different jobs, so they compose rather than compete:

- **`include`** composes neo *declarations* (classes, `script`, stylesheets) —
  neo's own source-merge.
- **ES `import`** composes JS *modules* (values, functions from files or
  packages) — the standard system, which neo rides rather than reinvents.

One file can use both: `include` some neo components, `import` a date library.
They never overlap, because one moves neo declarations and the other moves JS
bindings.

Ruled by the human, 2026-07-03. **Compiled libraries are deliberately out of
scope** (source-merge only — §1); **module resolution plumbing is deferred to
the dev-env rung** (§3).


## 1. `include` — composing neo declarations

### Syntax

A top-level directive whose body is a `[ ]` list of quoted, relative paths —
neo's list grammar, so it reads as another `keyword [ … ]` heading alongside
`App [ … ]` and `class X [ … ]`:

```
include [ "weather-components.neolzx" ]

App [ width = 240, height = 320, … ]
```

or, for several:

```
include [
    "tabs.neolzx",
    "forms.neolzx",
    ]
```

Paths are quoted strings (no bare-token magic), resolved relative to the
including file. Placed at the top of the file by convention (dependencies
first), though semantically order-inert like every neo declaration.

### Semantics

Parse-time **source merge**. On `include [ "x" ]` the compiler resolves and
parses `x`, recursively resolves *its* includes, and folds the top-level
declarations into the one program — **into the flat namespace** (the peer model
of instantiation.md §6: no prefixes, all classes are peers). An includable file
is a library of definitions; it does **not** declare `App` (two `App`s is an
error).

- **Dedup + cycles:** include-once by canonical path, so diamonds and cycles are
  fine.
- **Collision:** a name declared twice (across includes or locally) is a
  **positioned error** — the flat-namespace uniqueness rule doing its job
  (`class TabSlider already declared, included from …`).
- **Order-inert:** the compiler resolves all decls, then runs
  registration/inheritance — a class may extend one defined in a later include.
- **Resolution rides the host:** path lookup uses the *same* host file-access
  abstraction the main compile (and the tsc typecheck, and §3) use — filesystem
  on CLI/server, `fetch` in the browser. Tri-modal for free, no per-mode include
  machinery.
- **Types + errors thread through:** the scaffold generator and checker walk the
  *merged* program, so included classes are typed peers automatically
  (`new TabSlider()` checks), and an error inside an included file reports at
  that file's path + line (the same source-origin tracking the tsc
  position-mapping needs).

### No compiled libraries

`include` is pure source-merge — no `.lzo`-style precompiled unit, no link step,
no binary artifact, no versioning. In-browser V8 speed removes the motive for
separate compilation (a warm compile is fast); if a giant app ever needs
build-time caching, that is a cache *over the source*, not a format. Skip it,
likely indefinitely.

### Readability payoff

A shared `components.neolzx` holds the reusable classes (TabSlider, WeatherTab,
StatRow, WeatherSummary, Screen); an app file becomes `include [ … ]` + its
`App`, and reads as *the app*. The same components file can back both the design
reference (`weather.neolzx`) and the landed app (`neoweather.neolzx`), so they
**stop drifting apart** — the divergence that motivated this note dissolves
because they share the actual component source.


## 2. `import` — composing JS modules

neo does **not** invent a module system; it rides ES modules.

- **`import` is module-level**, so it lives in **`script { }`**, never inside a
  `{ }` body. (ES hoists imports to a module's top; a `{ }` body is a function
  body — it *uses* imported symbols but cannot declare imports.)
- **A neo file compiles to one ES module.** Bodies are functions inside it, so
  they see `script` imports alongside the lexical-shadowing component bindings
  (`new WeatherTab()`, instantiation.md §6) and the value constructors — one
  module scope. neo's own output is already zero-dep ESM (`dist/index.js`), so a
  compiled app sits in the module graph naturally: it imports and is imported.

The worked case:

```
script {
    import { formatDate } from "date-fns"
    function label(d: Date): string { return formatDate(d, "yyyy-MM-dd") }
}
// …any { } body may call label(…): it is in the module scope
```

There is no neo-specific module story to design — "how do they work / what do
they do" is the standard ES answer. The only real work is **resolution** (§3).


## 3. Module resolution — deferred with the dev-env

Resolution splits along the line already drawn for the compile modes:

- **CLI / server:** trivial — Node/bundler resolution and tsc's
  `node_modules`/`@types` resolution work the moment neo emits the import
  through.
- **Browser (in-browser compile):** needs the import-map / CDN / fetch-the-types
  story — the *same* host module-resolution the tsc typecheck needs, and part of
  the **deferred dev-env infra**.

The **same-experience-across-modes** ruling gates this: we do not ship
server-only imports that break in the browser. So `import` interop lands
**uniformly across all three modes at once**, when the resolution story lands —
the plumbing defers *with* the dev-env, not as a separate can.

**Stance ruled now; plumbing deferred.** The stance is worth pinning today
because the emission model it implies — *neo file as one ES module, bodies in
its scope* — is **already required** by the typecheck and `new`/attach work
(instantiation.md). Writing it down makes the module story a consequence, not a
surprise.


## 4. Status

- **Landed (2026-07-03):**
  1. the `include` resolve + merge phase — `src/include.ts` (pure: host-injected
     path resolution, recursive + include-once dedup by canonical path,
     flat-namespace merge, positioned collision errors) + `src/include-node.ts`
     (the Node `fs` host, imported only by the Node entry so `index.ts` stays
     zero-dep). `compile()` emits ONE **self-contained** source — each library's
     own `include` directives excised, concatenated dependency-first ahead of the
     main file — so the hostless browser `render()` runs the merge with no host;
  3. a shared `apps/neoweather/components.neolzx` with a simple `TabSlider` (a
     plain `class TabSlider extends View` owning `select(tab)`) alongside
     `StatRow` / `WeatherTab` / `WeatherSummary` / `Screen`;
  4. `neoweather.neolzx` refactored to `include [ "components.neolzx" ]` + its
     `App`, and A1b (the tab-slide `Animator`) landed onto the `TabSlider` —
     verified: acceptance 18/18, and a live-DOM probe confirms the eased slide
     (animation.md §1).
- **To build:**
  2. the full *neo-file-as-one-ES-module* emission with `{ }` bodies in module
     scope (`import` visible, component names lexically bound) — shared with
     instantiation + the typecheck slice. The include source-merge is the front
     half; this is the back half.
- **Deferred:** module-resolution infra (with the dev-env rung, §3); compiled
  libraries (§1, indefinitely).

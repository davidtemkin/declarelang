# App slimming — one inclusion graph for everything optional

**Status: PROPOSAL, 2026-09-26 — not ruled, nothing built in the tree.** Measurements come
from production DOM builds of release `224f6940`, in a scratch copy (`~/Code/eval-murmur-3`).
That copy's `declarec` gained one measurement hook, `opts.extraPlugins`, and nothing else. It
supersedes the conclusion of [bundle-slimming.md](bundle-slimming.md) (2026-08-02), whose
premise no longer holds: the floor has roughly doubled since.

---

## 1. Where the bytes are

**The floor.** A hello-world (`App [ Text [ text = "hello" ] ]`) is now **90 KB gzipped**;
on 2026-08-02 it was 47. React's floor is about 61.5 KB. Real apps:

| app | gzipped |
|---|---:|
| weather | 120 |
| calendar | 118 |
| Murmur | 126 |
| tracker | 135 |
| desktop | 170 |

The runtime is most of every one of these.

What the hello-world carries, in minified KB before compression (the gzip ratio is about
0.34, and about 0.42 for the kernel):

| group | min KB | modules |
|---|---:|---|
| tree core | ~93 | view 29.3, instantiate 19.9, attributes 9.4, bind 7.5, reactive 6.7, boot 6.6, expr 4.5, text 2.9, node 2.8, errors 2.0 |
| DOM renderer | ~54 | dom-backend 34.6, input 5.5, interaction 3.8, measure 3.5, and small ones |
| values and schemas | ~34 | value 13.5, schema 11.5, program-schema 5.4, css-colors 2.7 |
| the kernel | ~29 | kernel-wasm 23.3 (base64), kernel-loader 5.7 |
| data | ~26 | replicate 13.9, data 10.0, editor 2.1 |
| motion and layout | ~20 | layout 6.0, animator 5.3, animate 3.7, state 2.7, spring 2.2 |
| host page | ~11 | host-client 8.0, boot-page 2.7 |

**Why optional machinery rides every build.** Almost all of it comes in through direct
imports from the core, not through anything a program says:
- `instantiate.js` imports `Replicator`, `Layout`, `Animator`/`AnimatorGroup`, `Spring`,
  `State`, the two-way binder and the schema builder, and recognises them with `instanceof`;
- `layout.js` imports `Animator` because `TweenLayout` creates one internally;
- `replicate.js` imports `spring.js` for a single helper;
- `Island`/`DOMIsland` live inside `view.ts`.

The registry slimming (`slimRegistrySource`) works correctly. It just can't drop a module
that the core imports on its own.

## 2. What we have today

Four mechanisms, each built separately:

1. **The library auto-include.** Components written in Declare are pulled by tag, and their
   bases transitively (`include.ts`, OpenLaszlo's `autoincludes`). This is the good model: a
   manifest, one walk, transitive closure.
2. **The registry.** A generated `registry.js` names only the runtime classes the program
   constructs, found by a real scope analysis (`usedComponentNames`), and esbuild drops the
   rest. It's exact, but defeated by the direct imports above.
3. **About 25 fact-gated stubs** in `declarec.mjs`: themes, draw, filter, focus/keys, tip,
   viewport lock, selectors, schemas, effects, 3D, text measurement, font features, faces,
   draw-image/text, change events, rich-text flow, the checker, the Inspector, and so on.
   - Each is a **hand-written stand-in** whose exports must track the real module's.
   - Each has a **hand-written fact**: some read from the parse tree, some as regular
     expressions over body text.
   - This is the fragile part DT is worried about. Every new exclusion adds one more
     analysis and one more stub.
4. **Host swaps:** the compiler client, live edit, the Inspector boot, and the canvas
   backend on a DOM build.

## 3. The proposed architecture: capabilities

**One unit, the capability.** A capability is a runtime module, or a small set of modules,
plus an entry in **one manifest**:

```
{ id: "tween",      modules: ["animator-tween.js", "easing.js"], requires: ["animation-core"],
  trigger: { class: ["Animator", "TweenLayout"] } }
{ id: "replication", modules: ["replicate.js"], requires: [],
  trigger: { syntax: "replicating-datapath" } }
```

Developer-visible classes are just capabilities whose trigger is a class name. A class
capability is **the class plus whatever private machinery only it needs**.

**One graph, one closure, the same shape as auto-include.**
- `requires` edges plus class `extends` edges form the graph.
- The build takes the program's triggered capabilities and closes them transitively: C needs
  B needs A, so all three come in; name only A and only A comes in.
- This is exactly the include and auto-include model, extended to the runtime. The library
  auto-include stays as it is. A library class that uses `Spring` triggers the `spring`
  capability in the ordinary way, because its compiled body names it.

**A small, fixed set of trigger kinds.** Every capability must be triggered by one of these;
**no capability gets its own analysis code:**

| trigger kind | read from | examples |
|---|---|---|
| `class` | the used-class set (tags, `extends`, `new X()`, `use [ … ]`), already exact | Spring, State, Image, DOMIsland |
| `syntax` | a named construct the parser already marks | a replicating datapath (`many: true`), `<->` (`bind: "two"`), a `draw` method, `trackChanges` |
| `attribute` | an attribute set anywhere, by name | `rotateX`…, `travelWith`, `link`, `tip`, `mask`/`tint` |
| `member read` | a body reads a runtime member by name, found by the scope analysis (`freeIdentifiers`), not by regex | `visibleRect`/`onScreen`/`apparentScale`, `measureText`, `raise` |
| `value slot` | a slot that can carry the value is set to anything other than a readable literal: the one-directional rule the graphics gates already follow | filters, gradients, masks |

A single compiler function, `programCapabilities(program)`, walks the tree once and evaluates
every manifest trigger. It replaces the regex facts in `declarec.mjs`, reports its result in
`BUILD.json`, and can say *why* each capability is in (`declarec --why <id>`).

**The runtime side: plug in by import, no stubs.**
- Core modules never import an optional module. They reach optional behaviour through a
  small number of **installation points**:
  - construction handlers by kind, which the registry already half-does;
  - `Node` lifecycle hooks, replacing the `instanceof` checks (`prime`, `autoStart`,
    `init`/`onLinked`);
  - surface feature methods installed onto `DomSurface` by feature modules (text editing,
    selectable text, raster, touch, islands);
  - value coercers registered by kind.
- The generated entry **imports exactly the closure's modules**, and each installs itself on
  import.
- An absent capability is an absent hook, and the core calls `need("replication")`, which
  throws a message naming the capability and the `use [ … ]` escape. Absence is loud, as
  bundle-slimming.md §6 asked.
- The hand-written stubs retire, and with them the drift between a stub and its module.

**How it stays safe:**
- **The one-directional rule, stated once in the manifest's contract:** a capability may be
  left out only when the program *cannot* reach it. A trigger that can't be exact (dynamic
  values) over-includes.
- **The corpus gate:** every program in `apps/`, the docs demos and the eval fixtures, built
  both slim and full, must give the same results through the verification ladder (R5/R6).
  This one test replaces per-stub tests. A missing trigger shows up as a behaviour
  difference, not as a smaller bundle nobody checks.
- **Per-capability rows** in `slim.test`: a program that reaches the capability through each
  route its trigger claims (tag, `extends`, body construction, `use`) must include it.

**Why this addresses fragility:**
- There's one manifest instead of 25 pairs of stub and fact.
- There are five trigger kinds instead of a regex per module.
- There's one walk instead of several.
- There's one gate instead of a test per stub.
- Adding a capability means: split the module, add a manifest row, add a gate row. The
  compiler doesn't change.

## 4. The kernel — its own lever

| | min KB | gz KB |
|---|---:|---:|
| WebAssembly kernel (base64, inlined) | 23.4 | 9.8 |
| JavaScript kernel (`kernel-js.ts`) | 8.7 | 3.3 |

Measured in whole builds, removing the WebAssembly kernel saves **10.3–10.8 KB gzipped in
every app**. Swapping in the JavaScript kernel nets about **−7 KB** everywhere, minus the
loader code that only WebAssembly needs.

**How well the JavaScript kernel is vetted:**
- `test/kernel-conformance.test.mjs` drives 13 contract scenarios through both kernels and
  compares everything observable.
- The unit suite passes **467 of 467** on it (run 2026-09-26). The suite has to wait for the
  kernel to load (`await kernelReady()`) before starting. The test runner doesn't do that
  today, so a plain `DECLARE_KERNEL=js` run fails 240 tests on loading, not on semantics.
- Per `mac-host/profile/REPORT.md`, the node-side suites passed on 2026-09-17. **The browser
  suites have never run on it.**

**Speed, from the same report:**

| | old runtime (before the kernel) | JavaScript kernel | WebAssembly kernel |
|---|---:|---:|---:|
| tracker filter | 1,174 ms | 541 ms | 469 ms |
| desktop seed | 141 ms | 112 ms | 15 ms |
| startup | — | 5–22% slower than main | — |

The desktop gap exists because the JavaScript kernel doesn't implement the view-table rules
(visibility and auto-extent). It hands them back to the JavaScript fallbacks in `view.ts`.
Everywhere measured, the JavaScript kernel is faster than what shipped before September.

These figures come from the 2026-09-18 "twin" tree (the optimized runtime with a JavaScript
kernel), measured once. They weren't taken on today's `kernel-js.ts` in a shipped build.

**Why the JavaScript kernel beats the old runtime.** Most of the kernel arc's gain is in the
runtime's new structure, not in WebAssembly:
- values live in a flat numeric table (`Float64Array` in `kernel-js.ts`, linear memory in C);
- reads and writes are table indexing plus a shared ring rather than function calls;
- numeric `{ }` bodies are compiled to bytecode;
- bodies are precompiled;
- defaults are declared as rules;
- the settle is two-phase with ownership.

Both kernels implement that design. WebAssembly adds native arithmetic and the view-table
rules on top.

**The trade is size against speed in every measured case.** No measurement shows the
JavaScript kernel faster. The only places it could plausibly win are unmeasured:
- startup for a small program, since there's no base64 decode or WebAssembly compile;
- very short sessions before the JIT matters.

**The proposal:**
- A compiler flag, `--kernel=wasm|js|auto`, recorded in `BUILD.json`.
- **Whichever kernel is chosen is inlined into the app's one file**, as the WebAssembly one
  is today. A separate file costs a request before first paint, which was measured on an iPad
  at +50–150 ms (2026-09-18). Today's production build excludes the JavaScript kernel entirely
  (`__DECLARE_JS_KERNEL__` false), and development builds load it as an on-demand chunk. A
  build that chose it would import it statically.
- `auto` picks WebAssembly when the program is view-heavy, measured statically: element count
  after library expansion, replication, many animated views. It picks JavaScript otherwise.
- The Mac always uses its native kernel, as now.
- **Before `auto` defaults to JavaScript anywhere:** run the performance matrix and the
  browser suites on the JavaScript kernel, and consider porting `DK_VIS`/`DK_EXTENT` into
  `kernel-js.ts`. That would close the view-heavy gap and make the choice purely one of size.
- Until then: default to WebAssembly, and let size-sensitive embeds opt into JavaScript.

## 5. The candidates, measured

Each figure is the gzipped saving when a program doesn't use the capability.

**How the figures were measured:**
- **Whole modules:** replaced by an empty stand-in in a real build.
- **Groups inside a module:** those functions' bodies emptied in a real build. That gives a
  lower bound, since helpers shared with kept code stay.
- **Hello-world** is the baseline unless noted.

Frequency is the share of programs that would *gain*, meaning they don't use the capability:
13 apps, 185 docs demos (small programs), and 3 recent eval apps. Library components count:
an app using `Switch` uses `Spring`.

### Module-level, measured

| capability | gz saved | trigger kind | apps gaining | demos gaining | work |
|---|---:|---|---:|---:|---|
| **kernel: JavaScript instead of WebAssembly** | **~7 net** | build flag / `auto` | all (if chosen) | all | flag + vetting (§4) |
| **replication** (`replicate.js`) | **4.6** | syntax: replicating datapath | 0/13 | 153/185 | move one helper out of `spring.js`; construct through a hook |
| **data** (`data.js`: Dataset/DataSource) | 3.5 | class | 0/13 | 146/185 | several core importers; toy programs only |
| **tween Animator** (Animator's own `start`/`tick`, the easing curves, AnimatorGroup, TweenLayout) | **~1.5** combined, for Spring-only programs | class: Animator, AnimatorGroup, TweenLayout | ~8/13 | ~178/185 | split into shared core (target, clock, lifecycle) + tween + group; TweenLayout to its own file |
| **all animation** (the above plus Spring) | 2.6 | class | 0/13 | 102/185 | as above, plus Spring's hook |
| **State** | 0.8 | class | 11/13 | 183/185 | two lifecycle hooks and one construction handler |
| **Editor and two-way binding** (`editor.js`) | 0.7 | class: TextInput + syntax: `<->` | 5/13 | 171/185 | one construction-time hook |
| **named CSS colors** (`css-colors.js`) | 1.5 | none needed: names are already literal-only (the compiler refuses a bare name inside `{ }`, and values from data never go through the name lookup). The compiler resolves `navy` to `0x000080` in the program, and the table leaves every build. | all | all | compile-time literal resolution (see below) |
| **the component schema table**, per program | 0.5 | class (the used set) | all | all | generate like the registry |
| **precomputed class schemas** (`program-schema.js`) | ≤ ~2 (not measured) | always | all | all | the compiler already knows them; ship the result instead of rebuilding at boot. A design change, not a split. |

### Inside `dom-backend` and `view`, measured by emptying function bodies

**The renderer seam is already the capability boundary.** Most of `dom-backend.js` implements
the renderer interface (`Surface` in `backend.ts`), which `view.ts` calls when a particular
attribute is set. Many of those methods are already optional in the interface
(`setRotation?`, `setFilter?`, `setMask?`, `setScrollX?`, `watchVisibility?`…), because the
canvas, Mac and headless renderers implement different subsets. So the view layer already
copes with a renderer method that isn't there. A capability module can install its
`DomSurface` methods on import, keyed by the attributes that call them, and the attribute
trigger is exact. Writing the attribute in a method body counts, found by the same scope
analysis.

**With every group below removed at once, a hello-world drops 7.95 KB gzipped.** That's the
ceiling for these two files: about 38% of the ~21 KB gzipped they cost. The rest is core:
- tree attachment, the flush, input routing, text styling;
- the page scroller;
- geometry and the transform chain.

| capability | gz saved | trigger | apps gaining | demos gaining |
|---|---:|---|---:|---:|
| **islands and host values**: island link, `BoundaryValues`, `syncNamed`, post/exposed (1.10), DOM embed (0.15), the `Island`/`DOMIsland` classes, and the island half of `host-client` (not measured) | **~1.3+** | class: Island/DOMIsland (AppIsland extends it); `external`, `hostProvided`, `post`/`onPost` | 8–10/13 | 182/185 |
| **visibility family**: view 0.69 + DOM observer 0.26, plus the kernel's `DK_VIS` | **~0.95** | member read: `visibleRect`/`onScreen`/`apparentScale` | **13/13** | **185/185**: nothing in the corpus reads them |
| **text editing** | 0.86 | class: TextInput | 5/13 | 171/185 |
| **raster cache** | 0.78 | syntax: a `draw` method (the library's icons draw) | 0/13 | 96/185 |
| **pane scrolling** (a `scrolls` view other than the page) | 0.50 | attribute `scrolls` | 5/13 | 170/185 |
| **effects setters** (filter, blend, mask, backdrop, tint) | 0.45 | value slot (with `effects.js` and `dom-effects.js`, already gated) | 8/13 | 168/185 |
| **reveal and anchors** | 0.44 | member read: `reveal`, `waypoint`, anchors | 3/13 | 179/185; **care:** the URL mirror (Back) stays whole |
| ignoreScroll | 0.27 | attribute | 9/13 | 184/185 |
| image setters | 0.23 | class: Image | 5/13 | 183/185 |
| selectable text | 0.22 | attribute `selectable` | 5/13 | 108/185 |
| horizontal scroll | 0.22 | attribute `scrolls` = x/both | 11/13 | 185/185 |
| carved hits (shaped clips) | 0.20 | value slot `clip` | — | — |
| travel, virtual extent, row ARIA | 0.18 | attribute `travelWith`, `virtualize`; syntax: replication | — | — |
| link | 0.16 | attribute `link`/`linksTo` | 6/13 | 181/185 |
| negative-size diagnostics | 0.15 | **always dropped in production**, like error prose | all | all |
| raise, travel, rich, `createView` (view side) | 0.16 | member read / class | — | — |
| rich-text flow (DOM side, beyond `dom-rich.js`) | 0.12 | class: Markdown/HTMLText | 9/13 | 173/185 |
| rotation/scale/matrix; 3D | 0.10; 0.05 | attribute | 8/13 | 185/185 |

**Corrections to earlier drafts of this list:**
- Pinch-zoom watching and the root's touch-action are called for every app at attach, so
  they're core. The triggerable touch part is only the carved hit-testing.
- The shared transform chain (`applyTransform`, `throughTransforms`) is core. Only the
  rotation, scale and 3D setters are triggerable.

## 6. What it adds up to

**A toy or small program** (most docs demos): kernel ~7, replication 4.6, data 3.5, all
animation 2.6, State 0.8, Editor 0.7, the DOM and view groups up to ~8, the schema table 0.5.
That's **about 25–28 KB**, taking 90 → ~62–65 KB gzipped, near React's floor. Add ~1.5 more once color names
are resolved at compile time.

**A typical real app** (weather, tracker or Murmur class):

| | gz saved |
|---|---:|
| without the kernel switch: tween Animator ~1.5 (when Spring-only), State 0.8, visibility 0.95, islands ~1.3, the schema table 0.5, diagnostics 0.15, tint 0.2, one or two DOM groups ~0.5–1 | **about 5–6 KB, 4–5%** |
| with the JavaScript kernel | **about 12–13 KB, around 10%** |

**The honest reading:**
- The capability architecture makes toys and small embeds genuinely small.
- For real apps, **the kernel is the single largest lever**. Everything else together is
  about the same size as the kernel.
- The rest of a real app's floor is the tree core and the renderer core (the ~93 KB and
  ~54 KB groups in §1). That isn't optional machinery, and reducing it is a code audit (dead
  paths, duplication, compile-time work done at boot), a separate item.
- One piece of that audit already sits in the table: `program-schema.js` rebuilding at boot
  what the compiler knew.

## 7. Suggested order

1. **The architecture skeleton:**
   - the manifest;
   - `programCapabilities` (one walk, five trigger kinds);
   - the generated entry;
   - the corpus gate (slim versus full through R5/R6).

   Port the existing registry, then the existing stubs, as the first capabilities. No bundle
   changes yet; the proof is that every build's output is identical.
2. **The cheap splits with exact triggers:**
   - visibility (all apps);
   - islands (all but three apps);
   - State;
   - TweenLayout to its own file, then the tween/Spring split of Animator;
   - Editor;
   - production-only diagnostics.
3. **Replication and data as capabilities:** toys only, but the largest module-level wins for
   small programs.
4. **The kernel:**
   - the flag;
   - vetting (browser suites, the performance matrix);
   - optionally, `DK_VIS`/`DK_EXTENT` in the JavaScript kernel;
   - then decide the `auto` rule.
5. **Compile-time work done at boot:** resolve literal values in the compiler (color names
   first, then every literal the runtime coerces at boot), and precompute class schemas.
6. **Separately:** the core audit of `view`, `instantiate`, `dom-backend` and `value`.

## 8. Open questions

1. **Literals coerced at boot.** The program carries raw literals (`navy`, `gradient(…)`,
   `shadow(…)`), and the runtime coerces them when it starts (`instantiate.ts`,
   `program-schema.ts` → `coerce`). Named colors show the cost: the language already allows
   names only as literals, yet the table ships so boot can resolve them. Resolving literals in
   the compiler would drop the table, and would let each value parser (gradients, shadows,
   outlines, shapes) ride only when a slot of its kind is set dynamically — the same
   one-directional rule the effects gate follows.
2. **`use [ … ]` for capabilities?** The escape exists for classes built from a string. A
   capability triggered by syntax can't be reached dynamically, so the escape shouldn't need
   to grow. It should be confirmed per trigger kind.
3. **Hosting pages** (a page whose islands run in its runtime) keep the union of their
   islands' capabilities, as `alsoUses` does for classes today.
4. **The canvas and Mac hosts.** This proposal measured DOM builds only. The manifest applies
   to canvas builds unchanged, and the Mac app carries the whole runtime by design.

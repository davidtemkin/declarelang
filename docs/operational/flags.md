# Modifiers (flags)

There are exactly **four** compile-time modifiers, defined once in the registry
(`runtime/src/flags.ts` — `FLAG_SPECS`) and read the same way by every surface: a program's
`defaultFlags`, a URL query and a `declarec` switch all mean the same thing and cannot drift.
They compose onto a run or a build; `kernel` matters only to a build.

<!-- generated:flags-table -->
| modifier | what it does | values | default |
|---|---|---|---|
| **render** | render through managed DOM or a single <canvas>; unset, the program's flags decide | `dom`, `canvas` | `dom` |
| **crawler** | embed the crawled document in the host page, for crawlers; unset, the program's flags decide | `true`, `false` | `false` |
| **kernel** | the reactive kernel a build carries: the C kernel as WebAssembly, or the JavaScript one (a smaller download); unset, the program's flags decide | `wasm`, `js` | `wasm` |
| **accessibility** | carry the accessibility layer: what screen readers and the platform's accessibility API are given, the accessibility warnings, and the accessibility settings an app can read; unset, the program's flags decide | `true`, `false` | `true` |
| **lint** | report the compiler's lint: advice on readability and idiom; it changes nothing that is built; unset, the program's flags decide | `true`, `false` | `true` |
| **devices** | the devices the program is for: desk quiets what matters only on a phone, phone what matters only at a desk; it changes nothing that is built; unset, the program's flags decide | `all`, `desk`, `phone` | `all` |
<!-- /generated:flags-table -->

Every modifier is written `name=value`, with the same names and the same values everywhere:
`render = canvas` in a program's `defaultFlags`, `?render=canvas` on a URL (the dev server's or
the browser's), and `--render=canvas` to `declarec`. A boolean's values are the words `true`
and `false`. There is no other spelling.

## A program's own flags

A program can set its own defaults for them, in a top-level
[`defaultFlags [ … ]`](declare-docs:language:defaultFlags) block:

```
defaultFlags [ render = canvas ]
```

A flag the request or the command names wins; one it leaves out, the program's block
decides; one neither names takes the default in the table. So the games, which declare
`render = canvas`, open on the canvas, and `?render=dom` or `declarec --render=dom` still runs
them on the DOM. The block takes the values in the table, as every surface does: `render = dom | canvas`,
`kernel = wasm | js`, `crawler = true | false` and `accessibility = true | false`.

Where each is read:

- `render`: the page boot, the dev server's `/build` and `declarec`. A program running as an
  `AppIsland` takes the outer program's renderer, and the Mac host renders natively.
- `kernel`: production builds (`declarec`, `/build`).
- `crawler`: production builds, and the dev server's run page. The static site's pages never
  embed a crawl.
- `accessibility`: every compile (off, the accessibility warnings are skipped and every
  `accessibility…` member is compiled away) and production builds (off, the layer's runtime
  is left out of the bundle). See [accessibility](../system-design/accessibility.md) §4.1.

## Not flags (though they once looked like it)

- **typecheck** — a phase of every compile, always on, with no opt-out.
- **slim / stripPos** — these are simply what a build *is*: always slimmed, always
  position-stripped. `declarec --debug` keeps both for debugging a build.
- **build** — a *request type*, not a modifier: `?build` (see [dev-server](declare-docs:operational:dev-server)).

Because the surfaces derive from `FLAG_SPECS`, adding a modifier is one registry edit and every
surface picks it up — this page is generated from that same registry, so it never drifts from
what the compiler accepts.

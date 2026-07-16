# Modifiers (flags)

There are exactly **two** compile-time modifiers, defined once in the registry
(`compiler/src/flags.ts` — `FLAG_SPECS`) and read the same way by every surface: a CLI switch,
a server URL query, and a browser URL query all mean the same thing and cannot drift. Both
compose onto a run or a build.

| modifier | what it does | CLI (`declarec`) | URL | default |
|---|---|---|---|---|
| **render** | render through managed DOM or a single `<canvas>` | `--dom` / `--canvas` | `?render=dom` / `?render=canvas` | `dom` |
| **seo** | embed the extracted static document in the host page, for crawlers | `--seo` | `?seo` | off |

Every name is lowercase, and the same name works everywhere: `?render=canvas` on the server,
`--canvas` on the CLI, and `?render=canvas` in the browser are one modifier. Booleans accept
`?seo`, `?seo=1`, `?seo=true` (on) and `?seo=0`/`false` (off).

## Not flags (though they once looked like it)

- **typecheck** — a mandatory phase of the one compile, always on. There is no runtime opt-out
  on any hosted surface. (`verify --no-typecheck` skips rung 3 for a local check only.)
- **slim / stripPos** — these are simply what a build *is*: always slimmed, always
  position-stripped. `declarec --debug` keeps both for debugging a build.
- **build** — a *request type*, not a modifier: `?build` (see [dev-server](declare-docs:operational:dev-server)).

Because the surfaces derive from `FLAG_SPECS`, adding a modifier is one registry edit and every
surface picks it up — this page is generated from that same registry, so it never drifts from
what the compiler accepts.

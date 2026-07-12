# site-react

A **React re-implementation** of the Declare homepage (`examples/site`). It reproduces
the original's content, layout, design, and live code-editing — but is written
independently in idiomatic React + CSS, from the *appearance and behavior* of the
deployed site rather than from the `.declare` source. It is not a transliteration:
the flow document, CSS grid, and component split share nothing with the original's
single nested `App [ … ]` tree.

## What's real vs. re-implemented

- **Chrome (nav, hero, sections, cards, stats, copy, footer)** — plain React + CSS.
- **The four live demos** — genuinely compiled and run by the Declare toolchain, not
  re-created in React. Each editor's text is sent to `POST /compile` (the distro's
  compiler) and the result is mounted with the distro runtime
  (`/runtime/dist/index.js`, `renderAsync` + `DomBackend`). Editing recompiles
  (debounced) and swaps the running preview; clicks drive the real app's reactivity.
  See `src/lib/declare.js` and `src/components/Demo.jsx`.

Because it depends on `/compile` and `/runtime/dist` (same origin), it is served by the
distro's dev server, not statically on its own.

## Run

```
# 1. build
cd site-react && npm install && npm run build

# 2. serve via the distro server (adds a /site-react/ route)
cd .. && npm start            # or: PORT=8000 node server/index.mjs
# → http://127.0.0.1:8200/site-react/   (or your chosen port)
```

For fast iteration, `npm run dev` runs Vite on :5232 and proxies `/compile` and
`/runtime` to a distro server on :8210 (see `vite.config.js`).

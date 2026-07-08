# gallery — neo-LZX ⟷ LZX side-by-side

A build-time comparison harness: one local server that shows each app rendered four ways
— the original LZX app on OpenLaszlo's **DHTML** and **Canvas** kernels, and the neo app
on both neo backends (**DOM**, **Canvas**) — with source in popups. The live counterpart
to `examples/neoweather/deploy-build.mjs` (which bakes the same comparison static).

```sh
node tools/gallery/serve.mjs [port=8250]      # http://127.0.0.1:8250/
```

## What it reads

| what | where |
|------|-------|
| the neo apps (recompiled on every load) | `examples/{neoweather,neocalendar}/` |
| the neo runtime | `runtime/dist/` (mounted at `/dist/`) |
| the OL reference apps (precompiled bundles) | `workshop/{neoweather,neocalendar}/` — git-ignored |
| the OL runtime + kernels | `../openlaszlo-5.0/runtime/` (mounted at `/runtime/`) |

The OL bundles live in the transient `workshop/`; regenerate them there if absent. The OL
calendar bundles reference the kernel by an old parity-snapshot path — that kernel has
since graduated into OL5's runtime, so the server maps those two baked names
(`lfc.js`, `LFCcanvas.js`) onto it.

This is scaffolding for the build phase — it (and `workshop/`) can be dropped once neo
stands on its own and the OL comparison stops mattering.

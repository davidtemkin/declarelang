# Seeds for the change evals

A seed is a finished app from an earlier eval run, handed to a fresh agent to change. Three apps × two
stacks. Each folder is a copy of the run's files; no program source was edited.

Start the app's data service first, from the repo root:

| app | service | port |
|---|---|---|
| venue | `node evals/apps/venue-checkout/api/server.mjs --port=8350 --seed=1` | 8350 (Declare), **8351** (React) |
| cadence | `node evals/apps/cadence/api/server.mjs --port=8320` | 8320 |
| murmur | `node evals/apps/murmur/api/server.mjs --port=8330 --seed=1 --scale=100` | 8330 |

The murmur service listens on all interfaces (no host option); the others bind 127.0.0.1.

## Declare seeds

Copy the folder to `my-apps/<app>/` and serve it with `npm start` from the repo root.
Validated with `node tools/verify.mjs <seed>/<main>.declare` on `ecb7bdd4` (2026-10-28), services running.

| seed | from | built on | main file | service address in source | verify |
|---|---|---|---|---|---|
| `venue/declare/` | `evals/reports/2026-10-28-venue-run11/` (`*.declare`, `tests/builder/` as `tests/`) | `b7bfd01b` | `venue.declare` | `http://127.0.0.1:8350` (`venue-helpers.declare:11`) | clean through R4 (634 nodes) |
| `cadence/declare/` | `evals/reports/2026-10-26-cadence-run17/` (`*.declare`, `tests/`) | `1b3064f2` | `cadence.declare` | `http://127.0.0.1:8320` (`cadence-parts.declare:22`) | clean through R4 (409 nodes); 1 warning, DECLARE4026 (4 `Choice`s used as one choice, `cadence-parts.declare:600`) |
| `murmur/declare/` | `evals/reports/2026-10-26-murmur-run11/` (`*.declare`, `DESIGN.md`, `tests/`) | `1b3064f2` | `murmur.declare` | `http://localhost:8330` (`murmur.declare:451`) | clean through R4 (412 nodes) |

## React seeds

Run: `npm install && npm run dev -- --host 127.0.0.1 --port N`. Only scaffolding was added; `src/` is as the run
left it. Each was checked in a copy outside the repo: `npm install`, the type check, `npx vite build`, then the
dev server loaded in Chrome with the service running.

| seed | from | service | added | check |
|---|---|---|---|---|
| `venue/react/` | `evals/reports/2026-10-21-venue-checkout-react-1/` (`package.json`, `src/`, `vite.config.ts`, `README.md`) | direct to `http://127.0.0.1:8351` (`src/api.ts`, with cookies), so run a second venue-checkout service on 8351. Serve from 127.0.0.1, not localhost (SameSite=Lax cookie). Its `vite.config.ts` fixes port 5173 with `strictPort`, and `--port` overrides it. | `index.html`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `.oxlintrc.json`, `public/favicon.svg` (from the current `create-vite` react-ts template, Vite 8) | `tsc -b` clean; build ok; page lists 20 performances from `/api/production` (`/api/me` 401 = signed out) |
| `cadence/react/` | `evals/reports/2026-09-25-cadence-react-1/` (`package.json`, `src/`) | direct to `http://127.0.0.1:8320` (`src/api.ts`, `VITE_API_URL` overrides; service allows any origin) | `index.html`, `tsconfig.json` (a single config, since the build runs `tsc --noEmit`; `types: ["vite/client"]` for `import.meta.env`), `vite.config.ts` | `tsc --noEmit` clean; build ok; Today and Year draw from `/api/today`, `/api/sessions`, `/api/live` |
| `murmur/react/` | `evals/reports/2026-09-25-murmur-react-1/` (`package.json`, `src/`) | same-origin paths (`/threads.json`, `/photos`, `/voice`, `/avatars`, ws `/live`). `vite.config.ts` proxies them to 127.0.0.1:8330 | `index.html`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js` (Vite 6 era react-ts template, matching its package.json), `vite.config.ts` (with the proxy) | `tsc -b` clean; build ok; thread list loads through the proxy, avatars load, `/live` socket opens and sends `hello` |

The two 2026-09-25 runs kept no config. Their `vite.config.ts`, `index.html` and tsconfigs are reconstructions,
not the run's originals. Versions resolved on 2026-10-28: venue Vite 8.3.5 / TS 6.0.3; cadence Vite 6.4.5 / TS 5.9.3;
murmur Vite 6.4.5 / TS 5.8.3; React 19.3.1 for all three. The seeds contain no `node_modules`, `dist` or lockfile.

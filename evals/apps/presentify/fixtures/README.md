The service (`../api/server.mjs`) runs from here, outside the sandbox: `launch.sh` starts it
with `--port` and gives the agent `api/API.md` alone, so the harness endpoints (`/api/_reset`,
`/api/_edit`, `/api/_fail`, `/api/_log`, `/api/_state`) are out of its reach. Its seed
presentations are `../api/seed.mjs`.

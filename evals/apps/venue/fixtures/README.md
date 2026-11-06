The service (`../api/server.mjs`) runs from here, outside the sandbox: `launch.sh` starts it
with `--port` and `--seed=1` and gives the agent `api/API.md` alone, so the harness endpoints
(`/api/_reset`, `/api/_take`, `/api/_log`) are out of its reach.

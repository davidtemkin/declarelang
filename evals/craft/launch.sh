#!/usr/bin/env bash
# evals/craft/launch.sh — the standard launch for a one-round craft run: an agent
# builds an app from a brief, in a fresh download of Declare, headless. See
# evals/craft/README.md for the standard this script is the record of.
#
#   evals/craft/launch.sh [--stack NAME] <app> <run-dir> <model-id> [commit] [port]
#     --stack NAME  a comparison run on another platform (e.g. React): no Declare
#                   download, and the prompt names the platform — nothing else changes
#     app       a folder under evals/apps/ holding brief.md and api/ (cadence, murmur, …)
#     run-dir   created fresh, OUTSIDE every repo (e.g. ~/Code/eval-cadence-7)
#     model-id  an exact model id (claude-opus-5-5) — never an alias, which moves
#     commit    the Declare commit to download (default: GitHub main's head)
#     port      the data service's port (default: 8320)
#
# Returns once the agent is running; the agent's stream is <run-dir>/logs/agent.stream.jsonl
# and <run-dir>/logs/started.txt records everything the run was launched with.
set -euo pipefail
STACK=""
if [ "${1:-}" = "--stack" ]; then STACK="$2"; shift 2; fi
APP="$1"; RUN="$2"; MODEL="$3"; COMMIT="${4:-}"; PORT="${5:-8320}"
HERE="$(cd "$(dirname "$0")" && pwd)"
EVALS="$(cd "$HERE/.." && pwd)"
SRC="$EVALS/apps/$APP"
[ -f "$SRC/brief.md" ] || { echo "no brief at $SRC/brief.md" >&2; exit 1; }
[ -e "$RUN" ] && { echo "$RUN exists — a run directory is always fresh" >&2; exit 1; }
if lsof -iTCP:"$PORT" -sTCP:LISTEN -P >/dev/null 2>&1; then echo "port $PORT is taken — the service needs it" >&2; exit 1; fi

# the agent works in work/; logs/ sits beside it, outside anything the agent reads
mkdir -p "$RUN/logs" "$RUN/work/task"
LOGS="$RUN/logs"
cd "$RUN/work"

# the subject: a fresh download of the published distribution, minus the evals
if [ -z "$STACK" ]; then
  git clone -q https://github.com/davidtemkin/declarelang.git declarelang
  [ -n "$COMMIT" ] && git -C declarelang checkout -q "$COMMIT"
  SUBJECT="$(git -C declarelang log -1 --format='%h %s') (GitHub, evals/ removed)"
  rm -rf declarelang/evals
else
  SUBJECT="none — $STACK, from the brief alone"
fi

# the task: the brief and the service, beside the download
cp "$SRC/brief.md" task/
[ -d "$SRC/api" ] && cp -R "$SRC/api" task/

# the prompt: nothing beyond what the task needs — the distribution carries the rest
if [ -z "$STACK" ]; then
cat > "$LOGS/prompt.txt" <<EOF
You have just downloaded the Declare distribution into \`declarelang/\`. Declare is a UI language not in your training data; that repository is the only source of truth and documents itself. Start at its README.md. Build the app described in \`task/brief.md\`. The data service is described in \`task/api/API.md\` and is already running on port $PORT; do not modify it.
EOF
else
cat > "$LOGS/prompt.txt" <<EOF
Build the app described in \`task/brief.md\` as a $STACK application. The data service is described in \`task/api/API.md\` and is already running on port $PORT; do not modify it.
EOF
fi

# the observers, beside the stream they read
cp "$HERE/tail.py" "$HERE/cost.py" "$HERE/report.py" "$LOGS/"

# the service
if [ -f task/api/server.mjs ]; then
  nohup node task/api/server.mjs --port="$PORT" > "$LOGS/fixture.log" 2>&1 &
  for _ in $(seq 1 50); do lsof -iTCP:"$PORT" -sTCP:LISTEN -P >/dev/null 2>&1 && break; sleep 0.1; done
fi

# a real session's tools: files, the shell (package installs included), and the web
TOOLS="Read,Glob,Grep,Bash,Write,Edit,WebSearch,WebFetch"
{
  echo "STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "APP=$APP"
  echo "MODEL=$MODEL"
  echo "SUBJECT=$SUBJECT"
  echo "TOOLS=$TOOLS (the only tools that exist; all pre-approved)"
  echo "STACK=${STACK:-Declare}"
  echo "PERMISSION_MODE=acceptEdits; permission prompts: none (anything else is refused); MCP: none"
  echo "CWD=$RUN/work (logs outside it)"
  echo "PORT=$PORT"
} > "$LOGS/started.txt"

# the agent: headless, the full event stream, exactly these tools
nohup claude -p --model "$MODEL" \
  --output-format stream-json --verbose \
  --tools "$TOOLS" --allowedTools "$TOOLS" \
  --permission-mode acceptEdits --permission-prompts none \
  --strict-mcp-config \
  < "$LOGS/prompt.txt" > "$LOGS/agent.stream.jsonl" 2> "$LOGS/agent.stderr" &
echo "AGENT_PID=$!" >> "$LOGS/started.txt"
cat "$LOGS/started.txt"

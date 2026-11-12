#!/usr/bin/env bash
# evals/craft/launch.sh — the standard launch for a one-round craft run: an agent
# builds an app from a brief, in a fresh download of Declare, headless. See
# evals/craft/README.md for the standard this script is the record of.
#
#   evals/craft/launch.sh [--stack NAME | --local] <app> <run-dir> <model-id> [commit] [port]
#     --stack NAME  a comparison run on another platform (e.g. React): no Declare
#                   download; the prompt names the platform and asks for the checking
#                   Declare's SKILL asks for — nothing else changes
#     --local       the subject is this working tree as it stands on disk, uncommitted
#                   changes included, instead of a GitHub download — for iterating on a
#                   fix before it is pushed. It is built, and refused if its derived
#                   artifacts are stale (a stale browser bundle would be the subject).
#                   `commit` is ignored; the record names HEAD and the changes on top
#     app       a folder under evals/apps/ holding brief.md and api/ (cadence, murmur, …)
#     run-dir   created fresh, OUTSIDE every repo (e.g. ~/Code/eval-cadence-7)
#     model-id  an exact model id (claude-opus-5-5) — never an alias, which moves
#     commit    the Declare commit to download (default: GitHub main's head)
#     port      the data service's port (default: the one the app's brief states). Another
#               port lets two runs of one app stand at once; the agent's copies of the
#               brief and API notes are rewritten to name it
#
# Returns once the agent is running; the agent's stream is <run-dir>/logs/agent.stream.jsonl
# and <run-dir>/logs/started.txt records everything the run was launched with.
set -euo pipefail
STACK=""; LOCAL=""
if [ "${1:-}" = "--stack" ]; then STACK="$2"; shift 2; fi
if [ "${1:-}" = "--local" ]; then LOCAL=1; shift; fi
APP="$1"; RUN="$2"; MODEL="$3"; COMMIT="${4:-}"; PORT="${5:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
EVALS="$(cd "$HERE/.." && pwd)"
SRC="$EVALS/apps/$APP"
[ -f "$SRC/brief.md" ] || { echo "no brief at $SRC/brief.md" >&2; exit 1; }
# the app's own port is the one its brief names (the 83xx service port)
APP_PORT="$(grep -oE '\b83[0-9]{2}\b' "$SRC/brief.md" | head -1 || true)"
PORT="${PORT:-${APP_PORT:-8320}}"
[ -e "$RUN" ] && { echo "$RUN exists — a run directory is always fresh" >&2; exit 1; }
if lsof -iTCP:"$PORT" -sTCP:LISTEN -P >/dev/null 2>&1; then echo "port $PORT is taken — the service needs it" >&2; exit 1; fi

# the agent works in work/; logs/ sits beside it, outside anything the agent reads
mkdir -p "$RUN/logs" "$RUN/work/task"
LOGS="$RUN/logs"
cd "$RUN/work"

# the subject: a fresh download of the published distribution, minus the evals
if [ -z "$STACK" ] && [ -n "$LOCAL" ]; then
  # the tree on disk, as a fresh clone would hold it: the files git tracks plus the new
  # ones it would track (nothing ignored — no node_modules, no caches), built first and
  # refused if what derive makes from it is stale
  TREE="$(cd "$EVALS/.." && pwd)"
  ( cd "$TREE" && npm run -s build >/dev/null ) || { echo "the local tree does not build" >&2; exit 1; }
  ( cd "$TREE" && node tools/internal/derive.mjs --dry >/dev/null ) || { echo "the local tree's derived artifacts are stale — run: node tools/internal/derive.mjs --no-stage" >&2; exit 1; }
  mkdir declarelang
  DEST="$PWD/declarelang"
  ( cd "$TREE" && git ls-files -z --cached --others --exclude-standard ) | ( cd "$TREE" && rsync -a --from0 --files-from=- ./ "$DEST/" )
  CHANGED="$(cd "$TREE" && git status --porcelain | grep -vc '^??' || true)"; ADDED="$(cd "$TREE" && git status --porcelain | grep -c '^??' || true)"
  SUBJECT="local tree at $(git -C "$TREE" log -1 --format='%h %s') + $CHANGED changed, $ADDED new uncommitted (evals/, docs/system-design/ and test/ removed)"
  rm -rf declarelang/evals declarelang/docs/system-design declarelang/test
  for p in ${STRIP:-}; do rm -rf "declarelang/$p"; SUBJECT="$SUBJECT; $p removed"; done
  # a repository of its own, one commit, as a clone has one — made AFTER the removals,
  # so no answer key is in its history
  ( cd declarelang && git init -q && git add -A && git -c user.name=eval -c user.email=eval@localhost commit -qm "Declare (local tree)" )
elif [ -z "$STACK" ]; then
  git clone -q https://github.com/davidtemkin/declarelang.git declarelang
  [ -n "$COMMIT" ] && git -C declarelang checkout -q "$COMMIT"
  SUBJECT="$(git -C declarelang log -1 --format='%h %s') (GitHub, evals/, docs/system-design/ and test/ removed)"
  # evals/ holds every task's answer key; docs/system-design/ is the design record, written
  # around past eval runs; test/ is the platform's own suite and probes, some shaped by past
  # tasks — none is read or run by an agent, but each is reachable by a repo-wide grep
  rm -rf declarelang/evals declarelang/docs/system-design declarelang/test
  # STRIP="a b": further paths that would hand this task's answer to the agent (a test
  # program in the task's own shape), removed before it starts and named in the record
  for p in ${STRIP:-}; do rm -rf "declarelang/$p"; SUBJECT="$SUBJECT; $p removed"; done
  # the clone's history still holds what was just removed (`git show HEAD:evals/…`):
  # a repository of one commit in its place, as --local makes
  rm -rf declarelang/.git
  ( cd declarelang && git init -q && git add -A && git -c user.name=eval -c user.email=eval@localhost commit -qm "Declare" )
else
  SUBJECT="none — $STACK, from the brief alone"
fi

# the task: the brief and the service, beside the download. An app with fixtures/ keeps
# its service outside the sandbox — the agent gets the contract, not the data or the schedule
cp "$SRC/brief.md" task/
# an app whose brief is a published specification (RealWorld) carries it beside the brief
[ -d "$SRC/spec" ] && cp -R "$SRC/spec" task/
if [ -d "$SRC/fixtures" ]; then
  mkdir -p task/api && cp "$SRC/api/API.md" task/api/
  SERVICE=("$SRC/api/server.mjs" "--port=$PORT" "--seed=1")
else
  [ -d "$SRC/api" ] && cp -R "$SRC/api" task/
  SERVICE=(task/api/server.mjs "--port=$PORT")
fi
# an app's service-args file holds what its brief is written against (murmur: --scale=100)
[ -f "$SRC/service-args" ] && SERVICE+=($(cat "$SRC/service-args"))
# a run on another port: the agent's copies say where the service really is
if [ -n "$APP_PORT" ] && [ "$PORT" != "$APP_PORT" ]; then
  for f in task/brief.md task/api/API.md; do [ -f "$f" ] && perl -pi -e "s/\\b$APP_PORT\\b/$PORT/g" "$f"; done
fi

# the prompt: nothing beyond what the task needs — the distribution carries the rest.
# An app with no service (7GUIs) leaves the service sentence out.
SVC_LINE=""
[ -d "$SRC/api" ] && SVC_LINE=" The data service is described in \`task/api/API.md\` and is already running on port $PORT; do not modify it."
if [ -z "$STACK" ]; then
cat > "$LOGS/prompt.txt" <<EOF
You have just downloaded the Declare distribution into \`declarelang/\`. Declare is a UI language not in your training data; that repository is the only source of truth and documents itself. Start at its README.md. Build the app described in \`task/brief.md\`.$SVC_LINE
EOF
else
# the second paragraph is the checking the Declare distribution's SKILL asks for (§ Checking
# and looking), said for any platform and naming no tool, so both runs are asked for the
# same verification
cat > "$LOGS/prompt.txt" <<EOF
Build the app described in \`task/brief.md\` as a $STACK application.$SVC_LINE

Check your work as you go, in a real browser. Look at it at milestones — once the whole app first runs, and after a change to what people see — with a screenshot, at a laptop's size and, where the app is used on a phone, at a phone's. Check each thing the brief says the app must do (its "What done looks like", where it has one) as a flow, with a script that drives the running app as a person does — pressing, typing, waiting — and ends by asserting what it should have done: what is shown, and what was sent to the service. Keep the scripts and run them again after a change. Before you hand it over, use it once as a person would: scroll a long list from end to end, drag its scrollbar, resize the window, switch to dark mode and to touch.
EOF
fi

# the observers, beside the stream they read
cp "$HERE/tail.py" "$HERE/cost.py" "$HERE/report.py" "$LOGS/"

# the service
if [ -f "${SERVICE[0]}" ]; then
  nohup node "${SERVICE[@]}" > "$LOGS/fixture.log" 2>&1 &
  for _ in $(seq 1 50); do lsof -iTCP:"$PORT" -sTCP:LISTEN -P >/dev/null 2>&1 && break; sleep 0.1; done
fi

# a real session's tools: files, the shell (package installs included), and the web
# Agent: the harness's own sub-agents, there for any stack to use (a stack whose
# ecosystem has a way to hand work to one is not stopped)
TOOLS="Read,Glob,Grep,Bash,Write,Edit,WebSearch,WebFetch,Agent"
{
  echo "STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "APP=$APP"
  echo "MODEL=$MODEL"
  echo "SUBJECT=$SUBJECT"
  echo "TOOLS=$TOOLS (the only tools that exist; all pre-approved)"
  echo "STACK=${STACK:-Declare}"
  echo "PERMISSION_MODE=acceptEdits; permission prompts: none (anything else is refused); MCP: none; auto-memory: off"
  echo "CWD=$RUN/work (logs outside it)"
  echo "PORT=$PORT (the brief names ${APP_PORT:-none})"
  echo "SERVICE=node ${SERVICE[*]}"
} > "$LOGS/started.txt"

# the agent: headless, the full event stream, exactly these tools — and no
# auto-memory: a run's notes to itself (Murmur run 11 wrote one) must not reach
# a later run that reuses a directory, nor sit outside the run's own record
# the agent's verify and look calls time their stages into logs/ (tools/internal/timing.mjs),
# outside its sight: a check prints nothing more than it would
DECLARE_TIMING_FILE="$LOGS/timing.jsonl" CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 nohup claude -p --model "$MODEL" \
  --output-format stream-json --verbose \
  --tools "$TOOLS" --allowedTools "$TOOLS" \
  --permission-mode acceptEdits --permission-prompts none \
  --strict-mcp-config \
  < "$LOGS/prompt.txt" > "$LOGS/agent.stream.jsonl" 2> "$LOGS/agent.stderr" &
echo "AGENT_PID=$!" >> "$LOGS/started.txt"
# ends the run cleanly once the result is in: what the agent left running, by pid
nohup "$HERE/finish.sh" "$RUN" > "$LOGS/finish.log" 2>&1 &
# the files as they were at each moment, beside the stream (record.sh)
nohup "$HERE/record.sh" "$RUN" > "$LOGS/record.log" 2>&1 &
cat "$LOGS/started.txt"

#!/usr/bin/env bash
# evals/craft/finish.sh — ends a craft run cleanly once the agent has finished.
#
#   evals/craft/finish.sh <run-dir>        (launch.sh starts it beside the agent)
#
# A run is over at the build's final record (`"type":"result"` in
# logs/agent.stream.jsonl). An agent often leaves something running then — a dev
# server it started in the background — and that holds its session open, and
# stopping it by hand afterwards WAKES the session (the ended task is news to it),
# which then works on past its own result (Venue run 7). So, once the result is
# in and the agent has had a moment to exit by itself, this stops what is still
# running under it, deepest first and then the agent — by process id, each one
# listed in logs/finish.log. The data service is not under the agent (launch.sh
# starts it separately), so it stays up for scoring.
set -u
RUN="${1:?usage: finish.sh <run-dir>}"
LOGS="$RUN/logs"
# the agent now running: a resumed session (`claude -p --resume`) adds its own
# AGENT_PID line below the first, and it is the last one that is live
PID=$(grep -o 'AGENT_PID=[0-9]*' "$LOGS/started.txt" | tail -1 | cut -d= -f2)
[ -n "$PID" ] || { echo "finish: no AGENT_PID in $LOGS/started.txt"; exit 1; }

# wait for the final record, or for the agent to be gone. Only a record written
# after this starts counts, and only one with turns in it: a resume first replays
# the session's last result with "num_turns":0, before it has done anything
BASE=$(wc -l < "$LOGS/agent.stream.jsonl" 2>/dev/null || echo 0)
finished() { tail -n +"$((BASE + 1))" "$LOGS/agent.stream.jsonl" 2>/dev/null | grep '"type":"result"' | grep -vq '"num_turns":0,'; }
until finished || ! kill -0 "$PID" 2>/dev/null; do sleep 5; done
echo "finish: $(date -u +%H:%M:%SZ) the build's result is in (or the agent is gone)"

# STRAYS: what the agent started detached (`nohup npm start &`, a server sent to the
# background) is no longer under it, so the tree walk below cannot see it — a dev server
# outlived Ledger run 5 by hours. Anything whose working directory is inside the run's
# work/ is the run's, except the data service (it stays up for scoring) and the tools'
# Chromes and their reapers (shared, and they end themselves).
strays() {
  local work="$RUN/work" p cwd cmd
  for p in $(pgrep -u "$(id -u)" 2>/dev/null); do
    [ "$p" = "$$" ] && continue
    cwd=$(lsof -a -p "$p" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
    case "$cwd" in "$work"|"$work"/*) ;; *) continue ;; esac
    cmd=$(ps -p "$p" -o command= 2>/dev/null)
    case "$cmd" in *api/server.mjs*|*[Cc]hrome*|*chrome-reaper*|*finish.sh*|*record.sh*) continue ;; esac
    echo "finish: stopping a stray $p — $(echo "$cmd" | cut -c1-140)"
    kill "$p" 2>/dev/null
  done
}

# a moment to exit by itself
for _ in $(seq 1 15); do kill -0 "$PID" 2>/dev/null || { echo "finish: the agent exited by itself"; strays; echo "finish: done"; exit 0; }; sleep 1; done

# what still runs under it, deepest first
tree() { local p; for p in $(pgrep -P "$1"); do tree "$p"; echo "$p"; done; }
for p in $(tree "$PID"); do
  echo "finish: stopping $p — $(ps -p "$p" -o command= 2>/dev/null | cut -c1-140)"
  kill "$p" 2>/dev/null
done
sleep 1
kill -0 "$PID" 2>/dev/null && { echo "finish: stopping the agent $PID"; kill "$PID" 2>/dev/null; }
sleep 1
strays
echo "finish: done"

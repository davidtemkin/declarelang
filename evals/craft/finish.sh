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
PID=$(grep -o 'AGENT_PID=[0-9]*' "$LOGS/started.txt" | cut -d= -f2)
[ -n "$PID" ] || { echo "finish: no AGENT_PID in $LOGS/started.txt"; exit 1; }

# wait for the final record, or for the agent to be gone
until grep -q '"type":"result"' "$LOGS/agent.stream.jsonl" 2>/dev/null || ! kill -0 "$PID" 2>/dev/null; do sleep 5; done
echo "finish: $(date -u +%H:%M:%SZ) the build's result is in (or the agent is gone)"

# a moment to exit by itself
for _ in $(seq 1 15); do kill -0 "$PID" 2>/dev/null || { echo "finish: the agent exited by itself; nothing to stop"; exit 0; }; sleep 1; done

# what still runs under it, deepest first
tree() { local p; for p in $(pgrep -P "$1"); do tree "$p"; echo "$p"; done; }
for p in $(tree "$PID"); do
  echo "finish: stopping $p — $(ps -p "$p" -o command= 2>/dev/null | cut -c1-140)"
  kill "$p" 2>/dev/null
done
sleep 1
kill -0 "$PID" 2>/dev/null && { echo "finish: stopping the agent $PID"; kill "$PID" 2>/dev/null; }
echo "finish: done"

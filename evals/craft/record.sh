#!/usr/bin/env bash
# evals/craft/record.sh — the run's files as they were, every moment they changed.
#
#   evals/craft/record.sh <run-dir>        (launch.sh starts it beside the agent)
#
# The stream (logs/agent.stream.jsonl) says what the agent did; this says what
# the code WAS at each moment: every 2 s, while the build runs, the work tree is
# committed to logs/files.git if anything in it changed — outside the agent's
# sight (no .git in work/, nothing in its output), so the run is not altered by
# being recorded. Installed dependencies, build output and the Declare download
# are left out; the agent's own files in it (declarelang/my-apps) are kept
# (logs/files.tree is the mirror the snapshots are taken from).
# Each commit's date is the moment it was seen, to set beside the stream's
# timestamps: the first build that compiled, every edit between two checks,
# what was there when the result came in.
#
#   git --git-dir=<run>/logs/files.git log --stat        what changed, when
set -u
RUN="${1:?usage: record.sh <run-dir>}"
LOGS="$RUN/logs"
# The work tree is mirrored first (rsync) and the mirror committed: the Declare
# download is a git checkout of its own, which git would record as one
# submodule pointer, not as the agent's files inside it.
TREE="$LOGS/files.tree"
mkdir -p "$TREE"
G=(git --git-dir="$LOGS/files.git" --work-tree="$TREE")
git init -q --bare "$LOGS/files.git"
EXCLUDE=(--exclude=.git/ --exclude=node_modules/ --exclude=dist/ --exclude=build/ --exclude=.vite/
  --exclude=.next/ --exclude=coverage/ --exclude='*.log' --include=/declarelang/ --include='/declarelang/my-apps/***'
  --exclude='/declarelang/*')
"${G[@]}" config user.name record; "${G[@]}" config user.email record@localhost
PID=$(grep -o 'AGENT_PID=[0-9]*' "$LOGS/started.txt" | cut -d= -f2)
snap() {
  rsync -a --delete "${EXCLUDE[@]}" "$RUN/work/" "$TREE/" 2>/dev/null
  "${G[@]}" add -A . 2>/dev/null
  "${G[@]}" diff --cached --quiet 2>/dev/null || "${G[@]}" commit -q -m "$(date -u +%Y-%m-%dT%H:%M:%SZ)" 2>/dev/null
}
until grep -q '"type":"result"' "$LOGS/agent.stream.jsonl" 2>/dev/null || ! kill -0 "$PID" 2>/dev/null; do
  snap
  sleep 2
done
snap
echo "record: $(date -u +%H:%M:%SZ) $("${G[@]}" rev-list --count HEAD 2>/dev/null || echo 0) snapshots"

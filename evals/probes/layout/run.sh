#!/usr/bin/env bash
# evals/probes/layout/run.sh — the layout comprehension probe: fresh agents, each given
# only README.md and a docs/declare.md, answer six predictions and write three layouts
# with no way to run them (task.md). Two arms compare two texts of declare.md.
#
#   evals/probes/layout/run.sh <out-dir> <declare.md for arm A> [declare.md for arm B] [N=4] [model]
#
#   evals/probes/layout/run.sh ~/Code/layout-probe-2 <(git show HEAD:docs/declare.md) docs/declare.md
#
# Each agent's folder is <out-dir>/<arm>-<i>/ (arm a or b): answers.md, frame.declare,
# form.declare, menu.declare, stream.jsonl. Returns once all have finished. Then score with
# KEY.md: each program through `verify --phone --desk`, and its geometry read back with
# `verify --size 1280x800 --outline app` and `--size 390x844` (copy the programs under
# my-apps/ first). Tools are Read, Write, Glob, Grep only: what an agent writes is its
# first attempt.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
OUT="${1:?usage: run.sh <out-dir> <declare.md A> [declare.md B] [N] [model]}"
A="${2:?declare.md for arm A}"
B="${3:-}"
N="${4:-4}"
MODEL="${5:-claude-opus-5-5}"
mkdir -p "$OUT"
cp "$A" "$OUT/declare-a.md"
[ -n "$B" ] && cp "$B" "$OUT/declare-b.md"
arms="a"; [ -n "$B" ] && arms="a b"
for arm in $arms; do
  for i in $(seq 1 "$N"); do
    d="$OUT/$arm-$i"
    rm -rf "$d"; mkdir -p "$d/declarelang/docs"
    cp "$ROOT/README.md" "$d/declarelang/"
    cp "$OUT/declare-$arm.md" "$d/declarelang/docs/declare.md"
    cp "$HERE/task.md" "$d/"
    (cd "$d" && CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 nohup claude -p --model "$MODEL" \
      --output-format stream-json --verbose \
      --tools Read,Write,Glob,Grep --allowedTools Read,Write,Glob,Grep \
      --permission-mode acceptEdits --strict-mcp-config \
      "Do the task in task.md." > stream.jsonl 2> stderr.txt &)
  done
done
total=$(( N * $(echo $arms | wc -w) ))
until [ "$(grep -l '"type":"result"' "$OUT"/*/stream.jsonl 2>/dev/null | wc -l)" -ge "$total" ]; do sleep 10; done
echo "probe: $total agents finished in $OUT"

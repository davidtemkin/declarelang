#!/usr/bin/env python3
"""The periodic report on a running craft agent: what it READ, what it WROTE or
edited, and what it RAN since the last report, with elapsed time, turns, and tokens.
Keeps its place in report.state beside the stream, so each call covers only what is new.
usage: report.py            — since the last report
       report.py --all      — from the start"""
import json, os, sys, time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
STREAM = os.path.join(HERE, "agent.stream.jsonl")
STATE = os.path.join(HERE, "report.state")
STARTED = os.path.join(HERE, "started.txt")

start_line = 0
if "--all" not in sys.argv and os.path.exists(STATE):
    start_line = int(open(STATE).read().strip() or 0)

reads, writes, runs, texts = [], [], [], []
usage = {"output_tokens": 0, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0, "input_tokens": 0}
turns, result, lines = 0, None, 0
for i, ln in enumerate(open(STREAM, errors="replace")):
    lines = i + 1
    try: j = json.loads(ln)
    except Exception: continue
    t = j.get("type")
    if t == "assistant":
        m = j.get("message", {})
        for k, v in (m.get("usage") or {}).items():
            if k in usage and isinstance(v, int): usage[k] += v
        turns += 1
        if i < start_line: continue
        for b in m.get("content", []):
            if b.get("type") == "tool_use":
                n, a = b.get("name"), b.get("input", {})
                if n == "Read": reads.append(a.get("file_path", ""))
                elif n in ("Glob", "Grep"): reads.append(f"{n} {a.get('pattern','')} in {a.get('path','.')}")
                elif n == "WebSearch": reads.append(f"web search: {a.get('query','')}")
                elif n == "WebFetch": reads.append(f"web fetch: {a.get('url','')}")
                elif n in ("Write", "Edit"): writes.append(f"{n} {a.get('file_path','')}")
                elif n == "Bash": runs.append((a.get("command") or "").replace("\n", " ")[:150])
                else: runs.append(f"{n} {json.dumps(a)[:120]}")
            elif b.get("type") == "text" and b["text"].strip():
                texts.append(b["text"].strip().replace("\n", " ")[:220])
    elif t == "result":
        result = j

started = None
if os.path.exists(STARTED):
    for ln in open(STARTED):
        if ln.startswith("STARTED="):
            started = datetime.strptime(ln.split("=", 1)[1].strip(), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
mins = (datetime.now(timezone.utc) - started).total_seconds() / 60 if started else 0
quiet = (time.time() - os.path.getmtime(STREAM)) / 60

print(f"elapsed {mins:.1f} min · {turns} turns · output {usage['output_tokens']:,} tok · cache reads {usage['cache_read_input_tokens']:,} · stream quiet {quiet:.1f} min")
if result:
    print(f"FINISHED: {'error' if result.get('is_error') else 'done'} · {result.get('num_turns')} turns · ${result.get('total_cost_usd')} · {(result.get('duration_ms') or 0)/60000:.1f} min")
print(f"READ ({len(reads)}):");  [print("  " + r) for r in reads]
print(f"WROTE/EDITED ({len(writes)}):"); [print("  " + w) for w in writes]
print(f"RAN ({len(runs)}):"); [print("  " + r) for r in runs]
if texts: print("SAID (latest): " + texts[-1])
if "--all" not in sys.argv:
    open(STATE, "w").write(str(lines))

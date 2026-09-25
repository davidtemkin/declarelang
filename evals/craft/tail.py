#!/usr/bin/env python3
"""Summarize the agent's event stream: every tool invocation with its input, in order.
usage: tail.py [N]   — the last N events (default: all)"""
import json, sys, os
p = os.path.join(os.path.dirname(__file__), "agent.stream.jsonl")
n = int(sys.argv[1]) if len(sys.argv) > 1 else 0
rows = []
for ln in open(p, errors="replace"):
    try: j = json.loads(ln)
    except Exception: continue
    t = j.get("type")
    if t == "assistant":
        for b in j.get("message", {}).get("content", []):
            if b.get("type") == "tool_use":
                i = b.get("input", {})
                name = b.get("name")
                if name in ("Read", "Write", "Edit"): arg = i.get("file_path", "")
                elif name in ("Glob", "Grep"): arg = (i.get("pattern", "") + "  in " + str(i.get("path", ".")))
                elif name == "Bash": arg = (i.get("command", "") or "").replace("\n", " ")[:160]
                else: arg = json.dumps(i)[:160]
                rows.append(f"{name:5} {arg}")
            elif b.get("type") == "text" and b["text"].strip():
                rows.append("TEXT  " + b["text"].strip().replace("\n", " ")[:200])
    elif t == "result":
        rows.append(f"RESULT turns={j.get('num_turns')} cost=${j.get('total_cost_usd')} dur={j.get('duration_ms')}ms")
print(f"{len(rows)} events")
for r in (rows[-n:] if n else rows): print(r)

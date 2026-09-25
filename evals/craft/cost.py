#!/usr/bin/env python3
"""Token view of the agent's stream: cumulative usage from the assistant messages, and the
tool results ranked by size (chars/4 ≈ tokens) — the reads that cost the most context.
usage: cost.py [N]  — top N results (default 12)"""
import json, sys, os
p = os.path.join(os.path.dirname(__file__), "agent.stream.jsonl")
n = int(sys.argv[1]) if len(sys.argv) > 1 else 12
calls = {}   # tool_use_id -> (name, arg)
sizes = []   # (chars, name, arg)
u = {"input_tokens": 0, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0, "output_tokens": 0}
turns = 0
for ln in open(p, errors="replace"):
    try: j = json.loads(ln)
    except Exception: continue
    t = j.get("type")
    if t == "assistant":
        m = j.get("message", {})
        us = m.get("usage") or {}
        for k in u: u[k] += us.get(k, 0) or 0
        turns += 1
        for b in m.get("content", []):
            if b.get("type") == "tool_use":
                i = b.get("input", {}); name = b.get("name")
                arg = i.get("file_path") or i.get("command") or i.get("pattern") or json.dumps(i)
                calls[b["id"]] = (name, str(arg).replace("\n", " ")[:110])
    elif t == "user":
        for b in j.get("message", {}).get("content", []):
            if b.get("type") == "tool_result" and b.get("tool_use_id") in calls:
                c = b.get("content")
                txt = c if isinstance(c, str) else "".join(x.get("text", "") for x in c if isinstance(x, dict))
                sizes.append((len(txt), *calls[b["tool_use_id"]]))
tot = sum(s for s, *_ in sizes)
print(f"assistant messages: {turns} · tool results: {len(sizes)} · result bytes total: {tot:,} (≈{tot//4:,} tokens once)")
print(f"usage summed over messages: fresh(cache_creation)={u['cache_creation_input_tokens']:,} · cache_read={u['cache_read_input_tokens']:,} · uncached input={u['input_tokens']:,} · output={u['output_tokens']:,}")
print(f"top {n} results by size:")
for s, name, arg in sorted(sizes, reverse=True)[:n]:
    print(f"  {s:>8,}  {name:5} {arg}")

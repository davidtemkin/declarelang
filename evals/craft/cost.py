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
# one event per part of a reply, each repeating that call's usage: count each call once
seen = {}
results = []   # each finished run's own usage: the real figures (the stream's undercount output)
for ln in open(p, errors="replace"):
    try: j = json.loads(ln)
    except Exception: continue
    t = j.get("type")
    if t == "assistant":
        m = j.get("message", {})
        seen[m.get("id") or len(seen)] = m.get("usage") or {}
        for b in m.get("content", []):
            if b.get("type") == "tool_use":
                i = b.get("input", {}); name = b.get("name")
                arg = i.get("file_path") or i.get("command") or i.get("pattern") or json.dumps(i)
                calls[b["id"]] = (name, str(arg).replace("\n", " ")[:110])
    elif t == "result" and j.get("usage"):
        results.append(j["usage"])
    elif t == "user":
        for b in j.get("message", {}).get("content", []):
            if b.get("type") == "tool_result" and b.get("tool_use_id") in calls:
                c = b.get("content")
                txt = c if isinstance(c, str) else "".join(x.get("text", "") for x in c if isinstance(x, dict))
                sizes.append((len(txt), *calls[b["tool_use_id"]]))
tot = sum(s for s, *_ in sizes)
for us in seen.values():
    for key in u: u[key] += us.get(key, 0) or 0
turns = len(seen)
# the stream logs a call's usage before its reply has finished: output from it undercounts;
# once runs have finished, their results' figures stand
if results:
    for key in u: u[key] = sum(x.get(key, 0) or 0 for x in results)
note = "" if results else " (output undercounted until the run finishes)"
print(f"API calls: {turns} · tool results: {len(sizes)} · result bytes total: {tot:,} (≈{tot//4:,} tokens once)")
print(f"usage, each API call once: fresh(cache_creation)={u['cache_creation_input_tokens']:,} · cache_read={u['cache_read_input_tokens']:,} · uncached input={u['input_tokens']:,} · output={u['output_tokens']:,}{note}")
print(f"top {n} results by size:")
for s, name, arg in sorted(sizes, reverse=True)[:n]:
    print(f"  {s:>8,}  {name:5} {arg}")

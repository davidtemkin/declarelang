#!/usr/bin/env python3
# timing.py — where a craft run's time went, written before the run is deleted.
#
#   python3 evals/craft/timing.py <run-dir> [> evals/timings/<run>.txt]
#
# From the agent's stream: the phases (reading until the first app write, writing until
# the first verify, checking to the end), tool time by kind, and the model's turns by
# what came before them (a screenshot, a command, a document); from logs/timing.jsonl
# (launch.sh sets DECLARE_TIMING_FILE), the stages inside the agent's verify and look
# calls, summed; and counts that need no judgement: the app's size, its edits, and the
# diagnostics the checks reported. A run's logs are deleted when it is done; this is what
# is kept of them.
import json, sys, os, re, datetime as dt, statistics as st

run = sys.argv[1]
rows = []
for l in open(os.path.join(run, "logs", "agent.stream.jsonl"), errors="replace"):
    try: rows.append(json.loads(l))
    except ValueError: pass
started = open(os.path.join(run, "logs", "started.txt")).read()
start = dt.datetime.fromisoformat(started.split("STARTED=")[1].split()[0].replace("Z", "+00:00"))
ts = lambda r: dt.datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00")) if r.get("timestamp") else None
mins = lambda t: (t - start).total_seconds() / 60

def kind_of(u):
    s = json.dumps(u.get("input", {}))
    if u["name"] == "Read": return "image" if str(u["input"].get("file_path", "")).endswith(".png") else "read"
    if "declare-verify" in s: return "verify"
    if "declare-look" in s: return "look"
    if "declare-help" in s: return "help"
    return u["name"].lower()

uses, tool, turns = {}, {}, {}
written, edits, replaced, codes, a11y = set(), 0, 0, {}, 0
first_write = first_verify = None
for i, r in enumerate(rows):
    c = (r.get("message") or {}).get("content")
    if not isinstance(c, list): continue
    for b in c:
        if b.get("type") == "tool_use":
            uses[b["id"]] = (b, ts(r))
            s = json.dumps(b["input"])
            if first_write is None and b["name"] in ("Write", "Edit") and ".declare" in s: first_write = ts(r)
            p = str(b["input"].get("file_path", ""))
            if b["name"] in ("Write", "Edit") and p.endswith(".declare"):
                written.add(p); edits += 1
                if b["name"] == "Edit": replaced += len([l for l in b["input"].get("old_string", "").splitlines() if l.strip()])
            if first_verify is None and "declare-verify" in s and first_write is not None: first_verify = ts(r)
        if b.get("type") == "tool_result" and b.get("tool_use_id") in uses:
            out = b.get("content"); out = out if isinstance(out, str) else json.dumps(out)
            for code in set(re.findall(r"DECLARE\d{4}", out)): codes[code] = codes.get(code, 0) + 1
            if re.search(r"accessib", out, re.I) and kind_of(uses[b["tool_use_id"]][0]) == "verify": a11y += 1
            u, t0 = uses[b["tool_use_id"]]; t1 = ts(r); k = kind_of(u)
            if t0 and t1: tool.setdefault(k, []).append((t1 - t0).total_seconds())
            for r2 in rows[i + 1:]:
                c2 = (r2.get("message") or {}).get("content")
                if r2.get("type") == "assistant" and isinstance(c2, list) and any(x.get("type") == "tool_use" for x in c2):
                    if t1: turns.setdefault(k, []).append((ts(r2) - t1).total_seconds())
                    break

res = [r for r in rows if r.get("type") == "result"][-1]
total = res["duration_ms"] / 60000
u = res.get("usage", {})
print(f"# {os.path.basename(run.rstrip('/'))}")
print(f"total {total:.1f} min · {res['num_turns']} turns · output {u.get('output_tokens')} tokens (thinking {u.get('output_tokens_details', {}).get('thinking_tokens')})")
if first_write and first_verify:
    print(f"phases: reading {mins(first_write):.1f} · writing {mins(first_verify) - mins(first_write):.1f} · checking {total - mins(first_verify):.1f} min")
tt = sum(sum(v) for v in tool.values()) / 60
print(f"tool time {tt:.1f} min · model time {total - tt:.1f} min")
print("tools:")
for k, v in sorted(tool.items(), key=lambda x: -sum(x[1])):
    if sum(v) >= 1: print(f"  {k:8s} {len(v):3d}×  {sum(v)/60:5.2f} min  (median {st.median(v):.1f} s)")
print("model turns, by what came before:")
for k, v in sorted(turns.items(), key=lambda x: -sum(x[1])):
    print(f"  after {k:7s} {len(v):3d}×  {sum(v)/60:5.2f} min  (median {st.median(v):.1f} s)")
lines = sum(len([l for l in open(p, errors="replace") if l.strip()]) for p in written if os.path.exists(p))
print(f"app: {len(written)} .declare files, {lines} non-blank lines · {edits} writes/edits to them, replacing {replaced} non-blank lines")
print(f"verify results mentioning accessibility: {a11y}")
if codes: print("diagnostic codes, by tool results reporting them: " + ", ".join(f"{c} {n}" for c, n in sorted(codes.items(), key=lambda x: -x[1])))
tj = os.path.join(run, "logs", "timing.jsonl")
if os.path.exists(tj):
    agg = {}
    for l in open(tj):
        try: rec = json.loads(l)
        except ValueError: continue
        for lab, s in rec["spans"].items():
            a = agg.setdefault(lab, [0, 0]); a[0] += s["n"]; a[1] += s["ms"]
    print("inside the agent's verify and look calls:")
    for lab, (n, ms) in sorted(agg.items(), key=lambda x: -x[1][1])[:20]:
        print(f"  {ms/60000:5.2f} min  {n:4d}×  {lab}")

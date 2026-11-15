#!/usr/bin/env python3
"""Every timed run in one table, oldest first: time, turns and every kind of token, from the
timing records in evals/timings/ (one per run, written by timing.py), with the level and the
tree from the run's report folder where it has a started.txt.

Model time is how long the model took, which depends on the API's rate that hour as well as
on what the run asked of it; `out/min` (output tokens per model-minute) is that rate, so a
slow run with an ordinary token count reads as slow service, not more work. Input and cache
figures exist only for records written since timing.py printed them (2026-11-14); older runs
show a dash.

usage: runs.py [--app NAME] [--csv | --json]"""
import os, re, sys, glob

HERE = os.path.dirname(os.path.abspath(__file__))
EVALS = os.path.dirname(HERE)
args = sys.argv[1:]
only = args[args.index("--app") + 1] if "--app" in args else None
csv = "--csv" in args

def num(pat, s, cast=float):
    m = re.search(pat, s)
    return cast(m.group(1)) if m else None

rows = []
for f in sorted(glob.glob(os.path.join(EVALS, "timings", "*.txt"))):
    name = os.path.basename(f)[:-4]
    m = re.match(r"(\d{4}-\d{2}-\d{2})-(.+?)-run(\d+)(?:-(.+))?$", name)
    if not m: continue
    date, app, n, tag = m.group(1), m.group(2), int(m.group(3)), m.group(4) or ""
    if only and app != only: continue
    s = open(f, errors="replace").read()
    total = num(r"total ([\d.]+) min", s)
    if total is None: continue
    r = dict(date=date, app=app, run=n, tree=tag, total=total,
             turns=num(r"· (\d+) turns", s, int),
             model=num(r"model time ([\d.]+) min", s), tool=num(r"tool time ([\d.]+) min", s),
             out=num(r"output (\d+) tokens", s, int), think=num(r"\(thinking (\d+)\)", s, int),
             cread=num(r"cache read (\d+)", s, int), cwrite=num(r"cache write (\d+)", s, int),
             read=num(r"reading ([\d.]+)", s), write=num(r"writing ([\d.]+)", s), check=num(r"checking ([\d.]+)", s),
             level="")
    # turns by what came before them (timing.py): what each model call was answering
    for kind in ("verify", "look", "help", "image", "read", "bash", "write", "edit"):
        r["t_" + kind] = num(r"after " + kind + r"\s+(\d+)×", s, int) or 0
    rep = os.path.join(EVALS, "reports", name)
    st = os.path.join(rep, "started.txt")
    if os.path.exists(st):
        t = open(st, errors="replace").read()
        lv = re.search(r"^LEVEL=(\S*)", t, re.M)
        # "none" is the bare prompt (the SKILL's own default); no line at all predates levels
        r["level"] = "–" if lv is None else ("bare" if lv.group(1) in ("", "none") else lv.group(1))
        sub = re.search(r"^SUBJECT=(.*)$", t, re.M)
        if sub and not r["tree"]: r["tree"] = "local " + sub.group(1).split()[3] if sub.group(1).startswith("local tree at") else sub.group(1).split()[0]
    r["rate"] = round(r["out"] / r["model"]) if r["out"] and r["model"] else None
    rows.append(r)

# THE API'S PACE, separated from the run's shape. Model time is fitted over every run as
# (a fixed cost per turn) + (output tokens at a steady speed); a run's `pace` is its model time
# over the fit's prediction for its turns and output. 1.00 is an ordinary run; 1.10 means the
# model took 10% longer than its work explains: slow service that hour, or long contexts. The
# fit's own constants are printed under the table. Fitted on whatever runs are listed.
fit = [r for r in rows if r["model"] and r["turns"] and r["out"]]
if len(fit) >= 3:
    A = [(r["turns"], r["out"]) for r in fit]; T = [r["model"] * 60 for r in fit]
    s11 = sum(a * a for a, _ in A); s12 = sum(a * b for a, b in A); s22 = sum(b * b for _, b in A)
    t1 = sum(a * t for (a, _), t in zip(A, T)); t2 = sum(b * t for (_, b), t in zip(A, T))
    det = s11 * s22 - s12 * s12
    per_turn = (t1 * s22 - t2 * s12) / det; per_tok = (s11 * t2 - s12 * t1) / det
    for r in fit: r["pace"] = round(r["model"] * 60 / (per_turn * r["turns"] + per_tok * r["out"]), 2)
else:
    per_turn = per_tok = None

COLS = [("date", "date"), ("app", "app"), ("run", "run"), ("level", "level"), ("tree", "tree"),
        ("total", "min"), ("model", "model"), ("tool", "tool"), ("read", "read"), ("write", "write"), ("check", "check"),
        ("turns", "turns"), ("t_verify", "↳verify"), ("t_help", "↳help"), ("t_image", "↳image"), ("t_bash", "↳bash"), ("out", "output"), ("think", "thinking"), ("cread", "cache read"), ("cwrite", "cache write"),
        ("rate", "out/min"), ("pace", "pace")]
def cell(v):
    if v is None or v == "": return "–"
    if isinstance(v, float): return f"{v:.1f}"
    if isinstance(v, int) and v >= 10000: return f"{v/1000:.0f}k" if v < 10**6 else f"{v/10**6:.1f}M"
    return str(v)
if "--json" in args:
    import json
    out = []
    for r in rows:
        o = {k: r.get(k) for k, _ in COLS}
        o.update(id=f"{r['date']}-{r['app']}-{r['run']}" + (f"-{r['tree']}" if r['tree'] and not r['tree'].startswith('local') else ""),
                 t_read=r.get("t_read", 0), t_look=r.get("t_look", 0), t_write=r.get("t_write", 0), t_edit=r.get("t_edit", 0))
        out.append(o)
    print(json.dumps({"fit": {"perTurn": round(per_turn, 2) if per_turn else None, "tokensPerSec": round(1 / per_tok) if per_turn else None},
                      "runs": out}, indent=1))
elif csv:
    print(",".join(k for k, _ in COLS))
    for r in rows: print(",".join("" if r.get(k) is None else str(r.get(k)) for k, _ in COLS))
else:
    print("| " + " | ".join(h for _, h in COLS) + " |")
    print("|" + "---|" * len(COLS))
    for r in rows: print("| " + " | ".join((f"{r['pace']:.2f}" if k == "pace" and r.get(k) else cell(r.get(k))) for k, _ in COLS) + " |")
    if per_turn: print(f"\npace: model time over {per_turn:.1f} s a turn + output at {1 / per_tok:.0f} tokens/s, fitted on these {len(fit)} runs")

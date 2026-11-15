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
import json, sys, os, re, subprocess, datetime as dt, statistics as st

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
reads = []
READERS = {"cat", "sed", "head", "tail", "less", "grep", "egrep", "rg", "awk"}
def commands(line):
    """A shell line's commands, split at the |, ||, &&, ; and newlines that join them — not
    at one inside quotes or escaped: `grep -rn "u00A0\\|xa0" runtime/src` is one command
    (Cadence run 32: four runtime greps split at their pattern's \\| and went uncounted)."""
    out, cur, quote, k = [], "", None, 0
    while k < len(line):
        ch = line[k]
        if ch == "\\" and quote != "'" and k + 1 < len(line): cur += line[k:k + 2]; k += 2; continue
        if quote:
            if ch == quote: quote = None
        elif ch in "'\"": quote = ch
        elif (h := re.match(r"<<-?\s*(['\"]?)(\w+)\1", line[k:])) and (body := line.find("\n", k)) >= 0:
            # a here-document is the command's input, not commands: kept whole, to its delimiter
            end = re.search(r"\n\s*" + h.group(2) + r"\s*(?=\n|$)", line[body:])
            stop = body + end.end() if end else len(line)
            cur += line[k:stop]; k = stop; continue
        elif ch in "|;\n" or line.startswith("&&", k):
            out.append(cur); cur = ""
            k += 2 if line.startswith(("||", "&&"), k) else 1
            continue
        cur += ch; k += 1
    return out + [cur]

def source_reads(b):
    """The text of each part of a tool call that reads files: a Read's path, a Grep's path
    and glob, and each command of a Bash line that is a reader (after `xargs`, its command)."""
    i = b["input"]
    if b["name"] == "Read": return [i.get("file_path", "")]
    if b["name"] == "Grep": return [i.get("path", "") + " " + i.get("glob", "")]
    if b["name"] != "Bash": return []
    out, prev = [], ""
    for part in commands(i.get("command", "")):
        words = [w for w in re.split(r"\s+", part.strip().lstrip("(")) if w and not re.match(r"^\w+=", w)]
        piped = words[:1] == ["xargs"]   # `find library … | xargs grep x`: the files are the listing's
        while words and words[0] in ("xargs", "sudo", "command", "time"): words = [w for w in words[1:] if not w.startswith("-")] if words[0] == "xargs" else words[1:]
        if words and words[0].rsplit("/", 1)[-1] in READERS: out.append(prev + " " + part if piped else part)
        prev = part
    return out

codes, a11y = {}, 0
first_write = first_verify = None
for i, r in enumerate(rows):
    m = r.get("message")
    c = m.get("content") if isinstance(m, dict) else None   # (some records carry no message object)
    if not isinstance(c, list): continue
    for b in c:
        if b.get("type") == "tool_use":
            uses[b["id"]] = (b, ts(r))
            s = json.dumps(b["input"])
            if first_write is None and b["name"] in ("Write", "Edit") and ".declare" in s: first_write = ts(r)
            if first_verify is None and "declare-verify" in s and first_write is not None: first_verify = ts(r)
            # SOURCE READS — the platform's own code, read or searched: library/ (sometimes fair,
            # as an example of a pattern) and runtime/ or compiler/ (rarely). Each is audited:
            # a read is never to stand in for what the docs or declare-help should have said
            # Only what READS counts: the Read and Grep tools, and a shell command that reads a
            # file's text (cat, sed, head, tail, less, grep, rg, awk). A listing (`ls library`, a
            # Glob, `find`) or a count (`wc -l library/table.declare`) reads nothing of it — and a
            # reader later in the pipe (`wc -l x | head`) reads the count, not the file, so each
            # command of a line is judged with its own paths
            for src in source_reads(b):
                # a file (library/form.declare, runtime/src/focus.ts), or a whole area searched as a
                # directory (`grep -rn x library apps`, `rg x runtime/src`) — a read of that area too
                for area, pat in (("runtime", r"(?:^|[\s/'\"])(?:runtime|compiler)/(?:src|dist)/[\w./-]*"), ("library", r"(?:^|[\s/'\"])library/[\w./*-]*\.declare"),
                                  ("runtime", r"(?:^|\s)(?:[^\s'\"]*/)?(?:runtime|compiler)(?:/(?:src|dist))?/?(?=$|[\s;|&)])"), ("library", r"(?:^|\s)(?:[^\s'\"]*/)?library(?:/\*?)?(?=$|[\s;|&)])")):
                    for hit in re.findall(pat, src):
                        reads.append((ts(r), area, re.sub(r"^.*?(?=\b(?:library|runtime|compiler)\b)", "", hit.strip(" '\""))))
        if b.get("type") == "tool_result" and b.get("tool_use_id") in uses:
            out = b.get("content"); out = out if isinstance(out, str) else json.dumps(out)
            # codes the platform REPORTED to the agent — a verify, a look or a compile — not those
            # in documents it read or searched (a reference page lists codes it never met)
            ub = uses[b["tool_use_id"]][0]
            if kind_of(ub) in ("verify", "look") or (ub["name"] == "Bash" and re.search(r"\bdeclarec\b|\bnpm (run )?(start|build|dev)\b", ub["input"].get("command", ""))):
                for code in set(re.findall(r"DECLARE\d{4}", out)): codes[code] = codes.get(code, 0) + 1
            if re.search(r"accessib", out, re.I) and kind_of(uses[b["tool_use_id"]][0]) == "verify": a11y += 1
            u, t0 = uses[b["tool_use_id"]]; t1 = ts(r); k = kind_of(u)
            if t0 and t1: tool.setdefault(k, []).append((t1 - t0).total_seconds())
            for r2 in rows[i + 1:]:
                m2 = r2.get("message"); c2 = m2.get("content") if isinstance(m2, dict) else None
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
# every kind of token, from the run's own final figures; and how fast the model answered,
# as output per minute of model time: the API's rate varies by the hour, so a slow run
# with an ordinary token count was served slowly, not worked longer
out = u.get("output_tokens") or 0
print(f"tokens: input {u.get('input_tokens') or 0} · cache write {u.get('cache_creation_input_tokens') or 0} · "
      f"cache read {u.get('cache_read_input_tokens') or 0} · output {out} · "
      f"thinking {u.get('output_tokens_details', {}).get('thinking_tokens') or 0}")
mt = total - tt
if mt > 0: print(f"rate: {out / mt:.0f} output tokens per model-minute")
print("tools:")
for k, v in sorted(tool.items(), key=lambda x: -sum(x[1])):
    if sum(v) >= 1: print(f"  {k:8s} {len(v):3d}×  {sum(v)/60:5.2f} min  (median {st.median(v):.1f} s)")
print("model turns, by what came before:")
for k, v in sorted(turns.items(), key=lambda x: -sum(x[1])):
    print(f"  after {k:7s} {len(v):3d}×  {sum(v)/60:5.2f} min  (median {st.median(v):.1f} s)")
# the app's size and churn from record.sh's snapshots, which see a change however it was made
gd = os.path.join(run, "logs", "files.git")
if os.path.isdir(gd):
    git = lambda *a: subprocess.run(["git", "--git-dir", gd, *a], capture_output=True, text=True).stdout
    decl = [f for f in git("ls-tree", "-r", "--name-only", "HEAD").split() if f.endswith(".declare")]
    lines = sum(len([l for l in git("show", f"HEAD:{f}").splitlines() if l.strip()]) for f in decl)
    added = removed = snaps = 0
    for ln in git("log", "--numstat", "--format=tformat:@", "--", "*.declare").splitlines():
        if ln == "@": snaps += 1
        elif ln.strip():
            a, r, _ = ln.split("\t", 2)
            if a.isdigit(): added += int(a); removed += int(r)
    print(f"app: {len(decl)} .declare files, {lines} non-blank lines · {snaps} snapshots changed them: {added} lines added, {removed} removed")
print(f"verify results mentioning accessibility: {a11y}")
# each read once per file, at the minute it was first made
t_start = ts(rows[0]) if rows else None
seen, listed = set(), []
for t, area, path in reads:
    if (area, path) in seen: continue
    seen.add((area, path)); listed.append((t, area, path))
n_lib = sum(1 for _, a, _ in listed if a == "library"); n_rt = sum(1 for _, a, _ in listed if a == "runtime")
print(f"source reads: library {n_lib} file(s), runtime/compiler {n_rt} — each to be audited: never a stand-in for the docs")
for t, area, path in listed:
    m = f"{(t - t_start).total_seconds() / 60:5.1f} min" if t and t_start else "        "
    print(f"  {m}  {area:8s} {path}")
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

#!/usr/bin/env python3
"""The NAMES ledger of a craft run: every name the agent reached for that Declare does
not have, what the platform said when it did, and whether the agent got to the real one.
Collisions (a name of the agent's own refused because Declare holds it) were already
noticed in reports; MISSES were not — and a miss is where a newcomer's instinct (a CSS
property, a React prop, a browser global, a guess) meets the vocabulary.

From the run's own logs, with no judgment applied:
  · MISSES — each name a compile or check refused: an attribute a class does not have,
    a member a node does not have, a class, a type, a host global, a payload type. With
    the minute it first appeared, which kind of answer the platform gave (a did-you-mean,
    a foreign-instinct hint, or nothing), whether a later edit took it out, and whether it
    is still in the app at the end.
  · COLLISIONS — a name of the agent's own refused because a library class or one of
    Declare's own types holds it.
  · LOOKUPS THAT MISSED — `declare-help` asked for something it had no entry for, and
    searches of the distribution that found nothing.
A name the compiler accepts but that is wrong (a CSS habit that happens to be a real
name, an attribute that exists but means something else) is not visible here: that is
the idiom review's to find, and it lists them under the same heading.

usage: names.py <run-dir>          (the directory holding logs/ and work/)"""
import json, os, re, subprocess, sys
from datetime import datetime, timezone

RUN = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
STREAM = os.path.join(RUN, "logs", "agent.stream.jsonl")
WORK = os.path.join(RUN, "work")
DECLARE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

# the platform's own instinct tables — what it knows newcomers bring
try:
    TABLES = json.loads(subprocess.run(["node", "--input-type=module", "-e",
        'const t = await import("' + os.path.join(DECLARE, "runtime/dist/teach.js") + '");'
        'console.log(JSON.stringify({ css: Object.keys(t.CSS_ATTRIBUTE_HINTS), host: Object.keys(t.HOST_GLOBAL_HINTS), member: Object.keys(t.MEMBER_HINTS ?? {}) }))'],
        capture_output=True, text=True, check=True).stdout)
except Exception:
    TABLES = {"css": [], "host": [], "member": []}

MISS = [  # (kind, regex giving name and owner)
    ("attribute", re.compile(r"(?P<owner>\w+) has no attribute '(?P<name>[\w$]+)'(?P<rest>.*)")),
    ("member",    re.compile(r"'(?P<name>[\w$]+)' is not a member of (?P<owner>[^—]+?) —(?P<rest>.*)")),
    ("class",     re.compile(r"unknown class '(?P<name>\w+)'(?P<rest>.*)")),
    ("type",      re.compile(r"unknown type '(?P<name>\w+)'(?P<rest>.*)")),
    ("global",    re.compile(r"'(?P<name>\w+)' is the host's, not Declare's(?P<rest>.*)")),
    ("payload",   re.compile(r"'(?P<owner>\w+)' receives an? (?P<want>\w+) — write .*?, not '(?P<name>\w+)'(?P<rest>.*)")),
    # a keyword value outside its slot's set (`accessibilityRole = img`)
    ("value",     re.compile(r"(?P<owner>\w+\.\w+) expects an? \w+ \(one of [^)]*\), got '(?P<name>[\w$]+)'(?P<rest>.*)")),
]
COLLIDE = [
    ("library class", re.compile(r"'(?P<name>\w+)' is a library class — a (?:class|schema) of the program can't take its name")),
    ("built-in class", re.compile(r"'(?P<name>\w+)' is a built-in class — a class of the program can't take its name")),
    ("Declare's type", re.compile(r"(?:class|schema|type) (?P<name>\w+) takes the name of one of Declare's own types")),
    ("TS library", re.compile(r"(?:class|schema|theme|style) (?P<name>\w+) takes a name TypeScript's standard library already declares")),
    # a child or method of the agent's own named as an attribute its class already has (`x`)
    ("attribute", re.compile(r"\w+\.(?P<name>\w+) is an attribute — a (?:child|method) may not take an attribute's name")),
    # …and an attribute of its own declared with a name its class already has (`scale: number = 1`)
    ("attribute", re.compile(r"\w+ already has an attribute '(?P<name>\w+)' — a declaration introduces a new one")),
    ("built-in field", re.compile(r"'(?P<name>\w+)' is a built-in field of the runtime \w+, not a method — a method may not take its name")),
    # an attribute of the agent's own named `key`, which the language keeps for replication
    ("replication key", re.compile(r"'(?P<name>key)' is replication metadata — .*an attribute called 'key' could never be set")),
]

def answer_kind(name, rest):
    if "instinct" in rest or "is not a Declare name" in rest or "ARIA's word" in rest: return "foreign hint"
    if "did you mean" in rest: return "did-you-mean"
    if name in TABLES["host"]: return "foreign hint"
    if "—" in rest and any(w in rest for w in ("is '", "is a ", "write ", "use ")): return "hint"
    return "none"

def origin(name):
    if name in TABLES["css"]: return "CSS"
    if name in TABLES["host"]: return "browser/Node global"
    if name in TABLES["member"]: return "framework member"
    return ""

def text_of(content):
    if isinstance(content, str): return content
    return "\n".join(x.get("text", "") for x in (content or []) if isinstance(x, dict))

started = None
try:
    for ln in open(os.path.join(RUN, "logs", "started.txt")):
        if ln.startswith("STARTED="):
            started = datetime.strptime(ln.split("=", 1)[1].strip(), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
except OSError:
    pass

misses, collisions, help_misses, grep_misses = {}, {}, [], []
checks = []         # (minute, output) of every command that ran Declare's tools
edits = []          # (minute, file, old, new) in order
pending = {}        # tool_use id → (name, input)
minute = 0.0
for ln in open(STREAM, errors="replace"):
    try: j = json.loads(ln)
    except Exception: continue
    ts = j.get("timestamp")
    if ts and started:
        try: minute = (datetime.fromisoformat(ts.replace("Z", "+00:00")) - started).total_seconds() / 60
        except Exception: pass
    if j.get("type") == "assistant":
        for b in j.get("message", {}).get("content", []):
            if b.get("type") != "tool_use": continue
            n, a = b.get("name"), b.get("input", {}) or {}
            pending[b.get("id")] = (n, a)
            if n == "Edit": edits.append((minute, a.get("file_path", ""), a.get("old_string", ""), a.get("new_string", "")))
            if n == "Write": edits.append((minute, a.get("file_path", ""), "", a.get("content", "")))
    elif j.get("type") == "user":
        for b in j.get("message", {}).get("content", []) or []:
            if not isinstance(b, dict) or b.get("type") != "tool_result": continue
            n, a = pending.get(b.get("tool_use_id"), (None, {}))
            out = text_of(b.get("content"))
            # only what a COMMAND said: a Read of the docs quotes these messages too
            if n == "Bash" and re.search(r"declare|verify|node ", a.get("command") or ""): checks.append((minute, out))
            for line in (out.split("\n") if n == "Bash" else []):
                for kind, rx in MISS:
                    m = rx.search(line)
                    if m:
                        name = m.group("name")
                        owner = (m.groupdict().get("owner") or "").strip()
                        key = (kind, name, owner)
                        if key not in misses:
                            misses[key] = {"kind": kind, "name": name, "owner": owner, "first": minute, "times": 0,
                                           "answer": answer_kind(name, m.group("rest")), "said": line.strip()[:200]}
                        misses[key]["times"] += 1
                        misses[key]["last"] = minute
                for kind, rx in COLLIDE:
                    m = rx.search(line)
                    if m and m.group("name") not in collisions:
                        collisions[m.group("name")] = {"kind": kind, "first": minute, "said": line.strip()[:200]}
            # every answer in the output, not only its first line: one command line often asks
            # declare-help several things (`declare-help A | head; declare-help reducedMotion`)
            if n == "Bash" and "declare-help" in (a.get("command") or ""):
                for said in out.split("\n"):
                    q = re.match(r"^(?:no entry for '(?P<a>[^']+)'|no '(?P<b>[^']+)' —|'(?P<c>[^']+)' is not a Declare name|\w+ has no member '(?P<d>[^']+)')", said.strip())
                    if q: help_misses.append((minute, next(g for g in q.groups() if g), said.strip()[:160]))
            if n == "Grep" and re.match(r"^\s*(No files found|No matches found|Found 0)", out or ""):
                grep_misses.append((minute, a.get("pattern", ""), a.get("path", ".")))

# RESOLVED: the first check after the refusal was last seen that no longer refuses it.
# DECLARED INSTEAD: the app ends up declaring that very name itself (`color: Color = …`)
# — a carried-over name kept by making it real rather than reaching for Declare's own.
final = sorted({f for (_, f, _, _) in edits if f.endswith(".declare") and os.path.exists(f)})
source = "\n".join(open(f, errors="replace").read() for f in final)
for m in misses.values():
    rx = next(r for k, r in MISS if k == m["kind"])
    refuses = lambda out: any((mm := rx.search(l)) and mm.group("name") == m["name"] for l in out.split("\n"))
    m["fixed"] = next((t for (t, out) in checks if t > m["last"] and not refuses(out)), None)
    # only a name with somewhere else to go counts: one from a foreign table, or one
    # the platform answered with a real name. Declaring a member the agent had simply
    # not declared yet is the ordinary fix, not a carried-over name.
    # an ATTRIBUTE declaration (`color: Color = …`), not a child (`mail: TextInput [ … ]`)
    m["declared"] = (bool(re.search(r"(?m)^\s*" + re.escape(m["name"]) + r"\s*:\s*[A-Za-z_][\w.<>|?]*(\[\])?\s*=", source))
                     and m["kind"] in ("attribute", "member") and (origin(m["name"]) != "" or m["answer"] != "none"))

def mins(x): return "—" if x is None else f"{x:.0f}"
rows = sorted(misses.values(), key=lambda m: m["first"])
print(f"NAMES — {os.path.basename(RUN)}: {len(rows)} missed name(s), {len(collisions)} collision(s), "
      f"{len(help_misses)} declare-help miss(es), {len(grep_misses)} empty search(es)\n")
print("MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)")
for m in rows:
    print(f"  {mins(m['first']):>4} · {m['kind']:<9} · {m['name']:<20} · {m['owner'][:24]:<24} · {origin(m['name']) or '—':<18} · "
          f"{m['answer']:<12} · ×{m['times']:<2} · {mins(m['fixed']):>4} · {'DECLARED INSTEAD' if m['declared'] else 'resolved' if m['fixed'] is not None else 'NOT RESOLVED'}")
    print(f"         {m['said']}")
if collisions:
    print("\nCOLLISIONS (min · held by · name)")
    for n, c in sorted(collisions.items(), key=lambda kv: kv[1]["first"]):
        print(f"  {mins(c['first']):>4} · {c['kind']:<14} · {n}")
if help_misses:
    print("\nDECLARE-HELP MISSES (min · asked for · answered)")
    for t, cmd, first in help_misses: print(f"  {mins(t):>4} · {cmd} · {first}")
if grep_misses:
    print("\nEMPTY SEARCHES (min · pattern · where)")
    for t, p, where in grep_misses: print(f"  {mins(t):>4} · {p} · {where}")
unhinted = [m for m in rows if m["answer"] == "none"]
declared = [m for m in rows if m["declared"]]
unresolved = [m for m in rows if m["fixed"] is None and not m["declared"]]
print(f"\nSUMMARY: {len(unhinted)} of {len(rows)} misses got no hint · {len(declared)} declared instead "
      f"({', '.join(m['name'] for m in declared) or 'none'}) · {len(unresolved)} never resolved "
      f"({', '.join(m['name'] for m in unresolved) or 'none'})")

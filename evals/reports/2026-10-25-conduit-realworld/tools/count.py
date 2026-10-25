#!/usr/bin/env python3
# Categorise front-end source files per implementation and count them with cloc.
# SFCs (.vue/.svelte) are split into script / template / style parts first.
import csv, io, os, re, shutil, subprocess, sys, json
from collections import defaultdict

BASE = sys.argv[1]            # a folder holding the eight clones, named as in report.md
import tempfile
TOOLS = tempfile.mkdtemp()     # working files: the split SFCs, cloc's file list, counts.json
CLOC = shutil.which("cloc") or sys.exit("needs cloc (2.02) on the path")
SPLIT = os.path.join(TOOLS, "split")
DECLARE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # this report's folder

TEST = re.compile(r"(\.spec\.|\.test\.|__snapshots__|setup-?tests|test-setup|/test/|setupTests|^cypress/|^playwright/|^tests/|^e2e/|mockServiceWorker)")
SKIP_EXT = re.compile(r"\.(png|gif|svg|ico|jpg|md|lock|lockb|yml|yaml|json|snap)$")

def rules(impl):
    R = {
     "react-redux": [(r"^src/agent\.js$", "api"), (r"^src/app/history\.js$|^src/components/App\.js$", "routing"),
                     (r"^src/app/|^src/reducers/|Slice\.js$", "state"), (r"^src/common/", "util"),
                     (r"^src/index\.js$", "entry"), (r"\.js$", "components")],
     "react-fsd": [(r"^src/app/main\.css$", "vendored-css"), (r"\.css$", "styles"),
                   (r"browser-router|\.route\.ts$|\.paths\.ts$|shared/lib/react-router/", "routing"),
                   (r"\.loader\.ts$|/actions/|^src/shared/api/|app\.loader", "api"), (r"\.state\.ts$", "state"),
                   (r"^src/app/index\.tsx$", "entry"), (r"^src/shared/lib/", "util"), (r"\.tsx?$", "components")],
     "angular": [(r"\.html$", "templates"), (r"\.css$", "styles"), (r"routes\.ts$|app\.config\.ts$", "routing"),
                 (r"/services/|/interceptors/", "api"), (r"/models/|\.model\.ts$", "types"), (r"/pipes/", "util"),
                 (r"^src/main\.ts$", "entry"), (r"\.ts$", "components")],
     "vue3": [(r"^src/services/api\.ts$", "generated"), (r"^src/router\.ts$", "routing"),
              (r"^src/services/|set-authorization-token", "api"), (r"^src/store/", "state"), (r"^src/composable/", "data-hooks"),
              (r"\.d\.ts$", "types"), (r"^src/main\.ts$", "entry"), (r"^src/(utils|plugins|config)", "util"), (r"\.vue$", "SFC")],
     "vue-official": [(r"^src/router/", "routing"), (r"^src/common/(api|jwt)", "api"), (r"^src/store/", "state"),
                      (r"^src/main\.js$", "entry"), (r"^src/common/", "util"), (r"\.vue$", "SFC")],
     "sveltekit": [(r"\.server\.js$|^src/lib/api\.js$|get_articles\.js$|\+page\.js$", "api"),
                   (r"^src/lib/constants", "util"), (r"\.svelte$", "SFC")],
     "elm": [(r"^src/Route\.elm$", "routing"), (r"^src/Api", "api"), (r"^src/(Session|Viewer)\.elm$", "state"),
             (r"^src/Main\.elm$", "entry"), (r"^src/Page", "components"), (r"\.elm$", "model-modules")],
     "solid": [(r"createRouteHandler", "routing"), (r"createAgent", "api"), (r"^src/store/", "state"),
               (r"^src/index\.js$", "entry"), (r"\.js$", "components")],
    }
    return R[impl]

def classify(impl, rel):
    if TEST.search(rel): return "tests"
    if re.match(r"^(src/)?(public/)?index\.html$|^src/app\.html$", rel): return "shell"
    if not rel.startswith("src/"): return None
    if SKIP_EXT.search(rel): return None
    for pat, cat in rules(impl):
        if re.search(pat, rel): return cat
    return "other"

def split_sfc(path, ext_script):
    """Return dict part->text for a .vue/.svelte file."""
    txt = open(path, encoding="utf-8").read()
    parts = {"script": [], "style": [], "template": []}
    mode = "template"
    for line in txt.splitlines():
        s = line.strip()
        if mode == "template" and re.match(r"<script\b", s):
            mode = "script"; parts[mode].append(line)
            if "</script>" in s: mode = "template"
            continue
        if mode == "template" and re.match(r"<style\b", s):
            mode = "style"; parts[mode].append(line)
            if "</style>" in s: mode = "template"
            continue
        if mode == "script" and "</script>" in s:
            parts[mode].append(line); mode = "template"; continue
        if mode == "style" and "</style>" in s:
            parts[mode].append(line); mode = "template"; continue
        parts[mode].append(line)
    return {k: "\n".join(v) + ("\n" if v else "") for k, v in parts.items()}

def cloc_files(files, force=None):
    """files: list of paths -> dict path->(blank, comment, code)."""
    if not files: return {}
    lf = os.path.join(TOOLS, "list.txt")
    open(lf, "w").write("\n".join(files) + "\n")
    cmd = ["perl", CLOC, "--quiet", "--by-file", "--csv", "--skip-uniqueness", f"--list-file={lf}"]
    if force: cmd.append(f"--force-lang={force}")
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    res = {}
    for row in csv.reader(io.StringIO(out)):
        if len(row) < 5 or row[0] in ("language", "SUM") or not row[2].isdigit(): continue
        res[row[1]] = tuple(int(x) for x in row[2:5])
    return res

def raw_lines(p):
    with open(p, "rb") as f: return f.read().count(b"\n")

def run_impl(impl):
    root = os.path.join(BASE, impl)
    entries = []   # (rel, category, path)
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in (".git", "node_modules", "realworld")]
        for f in fn:
            p = os.path.join(dp, f); rel = os.path.relpath(p, root)
            c = classify(impl, rel)
            if c: entries.append((rel, c, p))
    out = []
    sdir = os.path.join(SPLIT, impl); os.makedirs(sdir, exist_ok=True)
    for rel, c, p in entries:
        if c == "SFC":
            ext = ".ts" if 'lang="ts"' in open(p).read() else ".js"
            for part, text in split_sfc(p, ext).items():
                if not text.strip(): continue
                sp = os.path.join(sdir, rel.replace("/", "__") + "." + part + {"script": ext, "style": ".css", "template": ".html"}[part])
                open(sp, "w").write(text)
                cat = {"script": "SFC-script", "style": "styles", "template": "templates"}[part]
                out.append((rel, cat, sp))
        else:
            out.append((rel, c, p))
    counts = cloc_files([p for _, _, p in out])
    rows = []
    for rel, c, p in out:
        b, cm, code = counts.get(p, (None, None, None))
        rows.append(dict(rel=rel, cat=c, raw=raw_lines(p), code=code if code is not None else -1, path=p))
    return rows

def run_declare():
    src = os.path.join(DECLARE, "conduit.declare")
    lines = open(src, encoding="utf-8").read().split("\n")
    # line ranges (1-based, inclusive) -> category
    ranges = [(1, 34, "data-schemas"), (35, 53, "api"), (54, 64, "styles-theme"), (65, 135, "styles-icons"),
              (136, 530, "components"), (531, 557, "state"), (558, 579, "routing"), (580, 696, "api"),
              (697, 903, "components")]
    sdir = os.path.join(SPLIT, "declare"); os.makedirs(sdir, exist_ok=True)
    out = []
    for a, b, cat in ranges:
        sp = os.path.join(sdir, f"conduit_{a}_{b}.declare")
        open(sp, "w").write("\n".join(lines[a-1:b]) + "\n")
        out.append((f"conduit.declare:{a}-{b}", cat, sp))
    counts = cloc_files([p for _, _, p in out], force="TypeScript,declare")
    whole = cloc_files([src], force="TypeScript,declare")
    rows = []
    for rel, c, p in out:
        rows.append(dict(rel=rel, cat=c, raw=raw_lines(p), code=counts[p][2], path=p))
    tsc = cloc_files([os.path.join(DECLARE, f) for f in ("conduit.ts", "session.ts")])
    for f in ("conduit.ts", "session.ts"):
        p = os.path.join(DECLARE, f)
        rows.append(dict(rel=f, cat="util" if f == "conduit.ts" else "api", raw=raw_lines(p), code=tsc[p][2], path=p))
    t = cloc_files([os.path.join(DECLARE, "tests", "flow.mjs")])
    rows.append(dict(rel="flow.mjs", cat="tests", raw=raw_lines(os.path.join(DECLARE, "tests", "flow.mjs")), code=list(t.values())[0][2]))
    rows.append(dict(rel="(whole conduit.declare check)", cat="_check", raw=raw_lines(src), code=list(whole.values())[0][2]))
    return rows

if __name__ == "__main__":
    if os.path.exists(SPLIT): shutil.rmtree(SPLIT)
    result = {}
    for impl in ["react-redux", "react-fsd", "angular", "vue3", "vue-official", "sveltekit", "elm", "solid"]:
        result[impl] = run_impl(impl)
    result["declare"] = run_declare()
    json.dump(result, open("counts.json", "w"), indent=1)
    EXCL = {"tests", "generated", "vendored-css", "shell", "_check", "other"}
    for impl, rows in result.items():
        agg = defaultdict(lambda: [0, 0, 0])
        for r in rows:
            a = agg[r["cat"]]; a[0] += 1; a[1] += r["raw"]; a[2] += r["code"]
        files = len({r["rel"].split(":")[0] for r in rows if r["cat"] not in EXCL})
        raw = sum(v[1] for k, v in agg.items() if k not in EXCL)
        code = sum(v[2] for k, v in agg.items() if k not in EXCL)
        print(f"== {impl}: headline files={files} raw={raw} code={code}")
        for k in sorted(agg): print(f"   {k:15s} parts={agg[k][0]:3d} raw={agg[k][1]:6d} code={agg[k][2]:6d}")
        others = [r["rel"] for r in rows if r["cat"] == "other"]
        if others: print("   OTHER:", others)

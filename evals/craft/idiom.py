#!/usr/bin/env python3
"""Idiom counts for a run's app, beside other runs': one markdown table for the report.
Counts, not verdicts — read the trend across runs and models, and the code behind a
number that moves. Each argument is a folder of the app's own source (no node_modules).

usage: idiom.py <label>=<app-dir> [<label>=<app-dir> ...]
  e.g. idiom.py "Venue 19"=evals/reports/2026-10-31-venue-run19 "Codex 1"=evals/reports/2026-10-31-venue-codex-run1/app"""
import os, re, sys

SKIP = {"node_modules", "dist", "build", ".vite", "drive", "tests", "logs"}
CODE = {".declare": "Declare", ".ts": "TS", ".tsx": "TS", ".js": "JS", ".jsx": "JS", ".mjs": None, ".swift": "Swift", ".css": "CSS"}

def files(root):
    for d, subs, fs in os.walk(root):
        subs[:] = [s for s in subs if s not in SKIP and not s.startswith(".")]
        for f in fs:
            lang = CODE.get(os.path.splitext(f)[1])
            if lang: yield os.path.join(d, f), lang

def code_lines(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return [l for l in text.splitlines() if l.strip() and not l.strip().startswith("//")]

def outside_themes(text):
    """The text with every `theme Name [ … ]` declaration removed: literals there are the palette."""
    out, i = [], 0
    for m in re.finditer(r"\btheme\s+\w+\s*\[", text):
        if m.start() < i: continue
        out.append(text[i:m.start()])
        depth, j = 0, m.end() - 1
        while j < len(text):
            depth += {"[": 1, "]": -1}.get(text[j], 0)
            j += 1
            if depth == 0: break
        i = j
    return "".join(out) + text[i:]

def count(root):
    by_lang, src = {}, {"Declare": "", "script": ""}
    for path, lang in files(root):
        lines = code_lines(open(path, errors="replace").read())
        n, b, long = by_lang.get(lang, (0, 0, 0))
        by_lang[lang] = (n + len(lines), b + sum(len(l) + 1 for l in lines), long + sum(len(l) > 150 for l in lines))
        src["Declare" if lang == "Declare" else "script"] += "\n".join(lines) + "\n"
    d, s = src["Declare"], src["script"]
    every = d + s
    return {
        "code": ", ".join(f"{n:,} lines {lang}" for lang, (n, _, _) in sorted(by_lang.items())) or "—",
        "bytes": f"{sum(b for _, b, _ in by_lang.values()) / 1024:.0f} KB",
        "lines over 150 characters": sum(l for _, _, l in by_lang.values()),
        "colour literals outside theme declarations": len(re.findall(r"#[0-9A-Fa-f]{6}\b|0x[0-9A-Fa-f]{6}\b", outside_themes(every))),
        "theme reads": len(re.findall(r'provided\("theme"\)|\btheme\.\w', d)),
        "States": len(re.findall(r"\bState\s*\[", d)),
        "visible switches (visible = { x == '…' })": len(re.findall(r"visible\s*=\s*\{\s*[\w.]+\s*===?\s*['\"]", d)),
        "branches on width or phone": len(re.findall(r"\b(?:app|parent)\.width\s*[<>]|\bapp\.(?:phone|narrow|wide|compact|mobile|small)\b\s*\?", d)),
        "flexes": len(re.findall(r"\bflexes\b", d)),
        "browser scripts (host = browser)": len(re.findall(r"host\s*=\s*\[?\s*browser", d)),
        "page lookups (document.querySelector…)": len(re.findall(r"document\.(?:body\.)?(?:querySelector(?:All)?|getElement(?:s?By\w+|ById)|elementsFromPoint|elementFromPoint|forms)\b", every)),
    }

runs = [a.split("=", 1) for a in sys.argv[1:] if "=" in a]
if not runs: sys.exit(__doc__)
cols = [(label, count(path)) for label, path in runs]
print("| | " + " | ".join(l for l, _ in cols) + " |")
print("|---|" + "---|" * len(cols))
for key in cols[0][1]:
    print(f"| {key} | " + " | ".join(str(c[key]) for _, c in cols) + " |")

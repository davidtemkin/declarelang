#!/usr/bin/env node
// transcript.mjs — a run's conversation, from its ledger (logs/turns.jsonl), two ways:
//
//   transcript.mjs <run-dir>
//
//   logs/conversation.html  the page to look at: each turn's message, the agent's reply,
//                           the app as the turn left it (the harness's frame) and the
//                           pictures the person took, their verdict, and what each side
//                           spent. Pictures are embedded, so it publishes as one file.
//                           For looking at, not for keeping: it goes with the run dir.
//   logs/turns.md           the same conversation as text, no pictures — what is filed
//                           in the report.
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN = resolve(process.argv[2] ?? "");
const LOGS = join(RUN, "logs");
if (!process.argv[2] || !existsSync(join(LOGS, "turns.jsonl"))) { console.error("usage: transcript.mjs <run-dir>   (a run with logs/turns.jsonl)"); process.exit(2); }

const started = Object.fromEntries(readFileSync(join(LOGS, "started.txt"), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const EVAL = (started.EVAL ?? "").split(" ")[0];
const ev = JSON.parse(readFileSync(join(HERE, "..", "evals", EVAL, "eval.json"), "utf8"));
const rows = readFileSync(join(LOGS, "turns.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

// ── the turns ────────────────────────────────────────────────────────────────
const turns = [];
let frames = {}, summary = null;
for (const r of rows) {
  if (r.role === "person") turns.push({ n: r.turn, asking: r.asking, person: r.text, at: r.at });
  else if (r.role === "agent") Object.assign(turns.at(-1), { agent: r });
  else if (r.role === "verdict") Object.assign(turns.at(-1), { verdict: r });
  else if (r.role === "frame") frames[r.name] = r;
  else if (r.role === "summary") summary = r;
}
const followupOf = new Map();
for (const t of turns) { const k = t.asking; t.followup = followupOf.has(k); followupOf.set(k, (followupOf.get(k) ?? 0) + 1); }

// ── figures ──────────────────────────────────────────────────────────────────
const add = (a, b) => { for (const k of ["fresh", "cached", "written", "output", "calls"]) a[k] = (a[k] ?? 0) + (b?.[k] ?? 0); return a; };
// a run recorded before the driver counted per turn has no figures: shown as —, not 0
const agentTotal = turns.some((t) => t.agent?.spent) ? turns.reduce((a, t) => add(a, t.agent?.spent), {}) : null;
const userTotal = turns.some((t) => t.verdict?.userSpent) ? add(turns.reduce((a, t) => add(a, t.verdict?.userSpent), {}), summary?.userSpent) : null;
const agentSecs = turns.reduce((a, t) => a + (t.agent?.secs ?? 0), 0);
const userSecs = turns.some((t) => t.verdict?.userSecs != null) ? turns.reduce((a, t) => a + (t.verdict?.userSecs ?? 0), 0) : null;
const wall = started.STARTED && started.ENDED ? Math.round((Date.parse(started.ENDED) - Date.parse(started.STARTED)) / 1000) : null;
const tok = (n) => n == null ? "—" : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n);
const dur = (s) => s == null ? "—" : s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
const spentLine = (u) => u ? `${tok(u.fresh + u.written)} fresh in · ${tok(u.cached)} cached re-read · ${tok(u.output)} out · ${u.calls} calls` : "—";
const toolLine = (t) => { const e = Object.entries(t ?? {}).sort((a, b) => b[1] - a[1]); const n = e.reduce((a, [, c]) => a + c, 0); return n === 0 ? "no tools" : `${n} tool uses (${e.map(([k, c]) => `${k} ${c}`).join(", ")})`; };
const intentText = (i) => ev.intents[i]?.ask ?? "?";

// ── turns.md: the text record, for the report ─────────────────────────────────
const quote = (s) => String(s ?? "").trim().split("\n").map((l) => `> ${l}`).join("\n");
const md = [
  `# ${EVAL} — ${started.STACK}`,
  "",
  `${ev.kind}; builder ${started.MODEL}, person ${started.USER_MODEL}; ${started.SUBJECT ?? ""}`,
  `Started ${started.STARTED}, ended ${started.ENDED ?? "?"}${wall != null ? ` (${dur(wall)})` : ""}.`,
  "",
  `Totals — agent: ${dur(agentSecs)}, ${spentLine(agentTotal)}. Person: ${dur(userSecs)}, ${spentLine(userTotal)}.`,
  "",
  "## Requests",
  "",
  ...ev.intents.map((t, i) => `${i}. ${t.ask}${t.device ? ` — on ${t.device}` : ""}`),
  "",
];
for (const t of turns) {
  const v = t.verdict ?? {};
  md.push(`## Turn ${t.n} — request ${t.asking}${t.followup ? " (follow-up)" : ""}`, "",
    "**Person:**", "", quote(t.person), "",
    `**Agent** (${dur(t.agent?.secs)}; ${toolLine(t.agent?.tools)}; ${spentLine(t.agent?.spent)}):`, "", quote(t.agent?.text), "",
    `**Verdict on request ${v.judged ?? "?"}: ${v.verdict ?? "—"}.** ${v.saw ?? ""}${v.broke ? ` Broke: ${v.broke}` : ""}`,
    `(Person looked for ${dur(v.userSecs)}; ${toolLine(v.userTools)}; ${spentLine(v.userSpent)}.)`, "");
}
if (summary) {
  md.push("## Final verdicts", "");
  for (const f of summary.final ?? []) md.push(`- ${f.request}. ${intentText(f.request)} — **${f.verdict}**: ${f.why ?? ""}`);
  if (summary.overall) md.push("", quote(summary.overall));
  md.push("");
}
writeFileSync(join(LOGS, "turns.md"), md.join("\n"));

// ── conversation.html: the page ───────────────────────────────────────────────
// pictures made small enough to embed: JPEG, at most 1000 px on the long side
const WEB = join(LOGS, "frames-web");
mkdirSync(WEB, { recursive: true });
const embedded = new Map();
function picture(file) {
  if (!file || !existsSync(file)) return null;
  if (embedded.has(file)) return embedded.get(file);
  const out = join(WEB, basename(file).replace(/\.png$/i, "") + "-" + embedded.size + ".jpg");
  try { execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "70", "-Z", "1000", file, "--out", out], { stdio: "ignore" }); }
  catch { return null; }
  const uri = `data:image/jpeg;base64,${readFileSync(out).toString("base64")}`;
  embedded.set(file, uri);
  return uri;
}
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// the agent writes markdown: enough of it to read — code, bold, headings, lists stay as text
const prose = (s) => esc(String(s ?? "").trim())
  .replace(/```[a-z]*\n([\s\S]*?)```/g, (_, c) => `<pre>${c}</pre>`)
  .replace(/`([^`\n]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
const chip = (v) => `<span class="chip ${({ done: "ok", partly: "part", "not done": "no" })[v] ?? "na"}">${esc(v ?? "—")}</span>`;

const turnHtml = turns.map((t) => {
  const v = t.verdict ?? {};
  const fr = frames[`t${t.n}`];
  const shots = (v.pictures ?? []).map((p) => ({ src: picture(p), name: basename(p) })).filter((p) => p.src);
  const frameSrc = fr ? picture(fr.file) : null;
  const long = (t.agent?.text ?? "").length > 1400;
  return `<section class="turn" id="t${t.n}">
  <header class="turn-head"><span class="num">Turn ${t.n}</span><span class="req">request ${t.asking}${t.followup ? " · follow-up" : ""} — ${esc(intentText(t.asking))}</span></header>
  <div class="msg person"><div class="who">Person</div><div class="body">${prose(t.person)}</div></div>
  <div class="msg agent"><div class="who">Agent</div>
    ${long ? `<details><summary><span class="body clip">${prose(t.agent.text.slice(0, 600))}…</span><span class="more">the whole reply</span></summary><div class="body">${prose(t.agent.text)}</div></details>` : `<div class="body">${prose(t.agent?.text)}</div>`}
    <div class="meta">${dur(t.agent?.secs)} · ${esc(toolLine(t.agent?.tools))}<br>${esc(spentLine(t.agent?.spent))}</div>
  </div>
  <div class="seen">
    ${frameSrc ? `<figure class="frame"><img src="${frameSrc}" alt="The app as turn ${t.n} left it"><figcaption>As the turn left it · ${esc(fr.device)}</figcaption></figure>` : `<p class="nopic">No picture: ${fr?.error ? esc(fr.error) : "no address yet"}.</p>`}
    ${shots.length ? `<div class="shots">${shots.map((s) => `<figure><img src="${s.src}" alt="${esc(s.name)}"><figcaption>${esc(s.name)}</figcaption></figure>`).join("")}</div>` : ""}
  </div>
  <div class="verdict">${chip(v.verdict)}<span class="on">request ${esc(v.judged)}</span><p>${esc(v.saw)}</p>${v.broke ? `<p class="broke"><strong>Broke:</strong> ${esc(v.broke)}</p>` : ""}
    <div class="meta">Person looked for ${dur(v.userSecs)} · ${esc(toolLine(v.userTools))} · ${esc(spentLine(v.userSpent))}</div></div>
</section>`;
}).join("\n");

const finalFrame = frames.final ? picture(frames.final.file) : null;
const html = `<title>${esc(EVAL)} on ${esc(started.STACK)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root { --bg: #f6f5f2; --panel: #ffffff; --fg: #1d1f24; --muted: #646872; --line: #e2e0da;
  --person: #f3ead9; --person-edge: #c99a45; --agent: #e9eef6; --agent-edge: #5577a8;
  --ok: #2f7d4f; --ok-bg: #e2f2e8; --part: #9a6a12; --part-bg: #f8edd5; --no: #a8362f; --no-bg: #f7e1df; --na-bg: #eceae5; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #16171a; --panel: #1f2125; --fg: #e8e6e1; --muted: #9a9ea7; --line: #33353b;
  --person: #33291a; --person-edge: #d2a457; --agent: #1d2633; --agent-edge: #7f9fd0;
  --ok: #7fd09c; --ok-bg: #1d3326; --part: #e3b55e; --part-bg: #3a2e16; --no: #f08a82; --no-bg: #3c1e1c; --na-bg: #2a2b30; color-scheme: dark } }
:root[data-theme="dark"] { --bg: #16171a; --panel: #1f2125; --fg: #e8e6e1; --muted: #9a9ea7; --line: #33353b;
  --person: #33291a; --person-edge: #d2a457; --agent: #1d2633; --agent-edge: #7f9fd0;
  --ok: #7fd09c; --ok-bg: #1d3326; --part: #e3b55e; --part-bg: #3a2e16; --no: #f08a82; --no-bg: #3c1e1c; --na-bg: #2a2b30; color-scheme: dark }
body { background: var(--bg); color: var(--fg); font: 15px/1.5 "IBM Plex Sans", system-ui, sans-serif; }
.wrap { max-width: 980px; margin: 0 auto; padding-block: 28px 64px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 28px; }
h1 { font-size: 26px; font-weight: 600; margin: 0; text-wrap: balance; }
.sub { color: var(--muted); margin: 4px 0 0; }
code, pre, .mono { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 13px; }
pre { white-space: pre-wrap; background: var(--na-bg); padding: 8px 10px; border-radius: 6px; overflow-x: auto; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.stat { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; }
.stat .k { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
.stat .v { font-size: 20px; font-weight: 600; }
.stat .d { color: var(--muted); font-size: 13px; }
.finals { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; display: grid; gap: 8px; }
.finals h2, .turn-head { margin: 0; }
.finals h2 { font-size: 15px; font-weight: 600; }
.final { display: grid; grid-template-columns: 92px 1fr; gap: 10px; align-items: baseline; }
.overall { border-left: 3px solid var(--person-edge); padding-left: 12px; margin: 6px 0 0; font-style: italic; }
.turn { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: grid; gap: 12px; min-width: 0; }
.turn-head { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.turn-head .num { font-weight: 600; }
.turn-head .req { color: var(--muted); font-size: 14px; }
.msg { border-radius: 10px; padding: 10px 14px; border-left: 3px solid; min-width: 0; }
.msg .who { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: 2px; }
.msg .body { white-space: pre-wrap; overflow-wrap: anywhere; }
.person { background: var(--person); border-color: var(--person-edge); max-width: 78%; }
.agent { background: var(--agent); border-color: var(--agent-edge); margin-left: 8%; }
.meta { color: var(--muted); font-size: 13px; margin-top: 6px; }
details summary { cursor: pointer; list-style: none; }
details summary::-webkit-details-marker { display: none; }
details[open] summary { display: none; }
.clip { display: block; }
.more { display: inline-block; margin-top: 4px; color: var(--agent-edge); font-weight: 500; }
.seen { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
figure { margin: 0; }
.frame img { max-height: 520px; border: 1px solid var(--line); border-radius: 8px; display: block; }
.shots { display: flex; gap: 8px; flex-wrap: wrap; }
.shots img { max-height: 200px; border: 1px solid var(--line); border-radius: 6px; display: block; }
figcaption { color: var(--muted); font-size: 12px; margin-top: 4px; }
.nopic { color: var(--muted); margin: 0; }
.verdict { border-top: 1px solid var(--line); padding-top: 10px; }
.verdict p { margin: 6px 0 0; }
.broke { color: var(--no); }
.on { color: var(--muted); font-size: 13px; margin-left: 8px; }
.chip { display: inline-block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; padding: 2px 8px; border-radius: 99px; background: var(--na-bg); }
.chip.ok { color: var(--ok); background: var(--ok-bg); } .chip.part { color: var(--part); background: var(--part-bg); } .chip.no { color: var(--no); background: var(--no-bg); }
@media (max-width: 560px) { .person { max-width: 100%; } .agent { margin-left: 0; } .final { grid-template-columns: 1fr; gap: 2px; } }
</style>
<div class="wrap">
<header>
  <h1>${esc(EVAL)} on ${esc(started.STACK)}</h1>
  <p class="sub">${esc(ev.kind)} · builder ${esc(started.MODEL)} · person ${esc(started.USER_MODEL)} · ${esc(started.SUBJECT ?? "")}</p>
  <p class="sub">${esc(ev.persona)}</p>
</header>
<div class="stats">
  <div class="stat"><div class="k">Wall time</div><div class="v">${dur(wall)}</div><div class="d">${turns.length} turns</div></div>
  <div class="stat"><div class="k">Agent</div><div class="v">${dur(agentSecs)}</div><div class="d">${esc(spentLine(agentTotal))}</div></div>
  <div class="stat"><div class="k">Person</div><div class="v">${dur(userSecs)}</div><div class="d">${esc(spentLine(userTotal))}</div></div>
</div>
${summary ? `<div class="finals"><h2>Final verdicts</h2>${(summary.final ?? []).map((f) => `<div class="final">${chip(f.verdict)}<div><strong>${esc(f.request)}.</strong> ${esc(intentText(f.request))}<div class="meta">${esc(f.why)}</div></div></div>`).join("")}${summary.overall ? `<p class="overall">${esc(summary.overall)}</p>` : ""}${finalFrame ? `<figure class="frame"><img src="${finalFrame}" alt="The app at the end"><figcaption>At the end · ${esc(frames.final.device)}</figcaption></figure>` : ""}</div>` : ""}
${turnHtml}
</div>
`;
writeFileSync(join(LOGS, "conversation.html"), html);
const kb = Math.round(statSync(join(LOGS, "conversation.html")).size / 1024);
console.log(`${join(LOGS, "conversation.html")} (${kb} KB, ${embedded.size} pictures)\n${join(LOGS, "turns.md")}`);

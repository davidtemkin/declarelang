// results — turn a run's metrics into the committed RESULTS.md scoreboard
// (docs/system-design/verify-and-evals.md §3.1, §3.4). The metrics.jsonl per run is local
// (gitignored); this human-readable summary is what lands in the tree, so a
// language-health trend is legible in git history without opening a transcript.

import { writeFileSync } from "node:fs";

const RUNG_NAMES = ["—", "structure", "resolution", "analysis", "boot", "behavior", "visual"];

function pct(n, d) { return d === 0 ? "—" : `${Math.round((100 * n) / d)}%`; }

function table(rows) {
  if (rows.length === 0) return "_(none)_\n";
  const head = Object.keys(rows[0]);
  const line = (cells) => "| " + cells.join(" | ") + " |";
  return [line(head), line(head.map(() => "---")), ...rows.map((r) => line(head.map((h) => String(r[h]))))].join("\n") + "\n";
}

/**
 * @param {object[]} metrics  one object per cell (see run.mjs)
 * @param {object}   opts     { runName, solverId, resultsPath }
 */
export function generateResults(metrics, { runName, solverId, resultsPath }) {
  const byTrack = {};
  for (const m of metrics) (byTrack[m.track] ??= []).push(m);

  const out = [];
  out.push(`# Eval results`);
  out.push("");
  out.push(`_Generated scoreboard — see \`docs/system-design/verify-and-evals.md\` §3 for the method. Latest run: **${runName}** · solver \`${solverId}\` · ${metrics.length} cells._`);
  out.push("");
  if (solverId === "reference") {
    out.push(`> **This is the reference-solver baseline** — each task scored against its own \`reference.declare\`. It proves the pipeline (sandbox → solve → score → metrics) and that every task's hidden acceptance is itself green; it is **not** a measure of model performance. Real model runs (\`--solver claude\`) are exploratory and their artifacts are gitignored; their findings are triaged into \`docs/system-design/language-learnings.md\` (the E-series). First real cycle: 2026-07-14, Sonnet one-shot went 1/3 — see E-1..E-3.`);
    out.push("");
  }

  // headline: green rate + mean rung, per track
  const headline = Object.entries(byTrack).map(([track, ms]) => ({
    track,
    cells: ms.length,
    green: pct(ms.filter((m) => m.ok).length, ms.length),
    "compile%": pct(ms.filter((m) => m.compileOk).length, ms.length),
    "mean rung": (ms.reduce((s, m) => s + m.rungClimbed, 0) / ms.length).toFixed(1),
    "mean iters": track === "iterated" ? (ms.reduce((s, m) => s + m.iterations, 0) / ms.length).toFixed(1) : "—",
    "tokens": ms.some((m) => m.tokens) ? ms.reduce((s, m) => s + (m.tokens ?? 0), 0) : "—",
  }));
  out.push(`## Headline`);
  out.push("");
  out.push(table(headline));

  // per-task grid
  out.push(`## By task`);
  out.push("");
  const tasks = [...new Set(metrics.map((m) => m.task))].sort();
  const tracks = [...new Set(metrics.map((m) => m.track))];
  const models = [...new Set(metrics.map((m) => m.model))];
  const grid = tasks.map((task) => {
    const row = { task };
    for (const track of tracks) for (const model of models) {
      const m = metrics.find((x) => x.task === task && x.track === track && x.model === model);
      const key = models.length > 1 ? `${track}/${model}` : track;
      row[key] = !m ? "—"
        : m.ok ? (track === "iterated" ? `✓ (${m.iterations})` : "✓")
        : `R${m.rungClimbed}${m.rungFailed ? `→✗${m.rungFailed}` : ""}`;
    }
    return row;
  });
  out.push(table(grid));

  // defect taxonomy (§3.4) — the language's health chart, by failing rung/phase
  const defects = {};
  for (const m of metrics) {
    if (m.ok) continue;
    const label = m.rungFailed ? `rung ${m.rungFailed} (${RUNG_NAMES[m.rungFailed]})` : "unknown";
    (defects[label] ??= []).push(...(m.diagnostics.length ? m.diagnostics.map((d) => d.code) : ["—"]));
  }
  out.push(`## Failures by rung`);
  out.push("");
  const defectRows = Object.entries(defects).map(([label, codes]) => ({
    "failed at": label,
    count: codes.length,
    codes: [...new Set(codes)].filter((c) => c !== "—").slice(0, 8).join(", ") || "—",
  }));
  out.push(table(defectRows));

  // format distance (§2.9) — does the canon's fight with the corpus cost anything?
  const withFmt = metrics.filter((m) => m.formatDistance != null);
  if (withFmt.length) {
    const mean = (withFmt.reduce((s, m) => s + m.formatDistance, 0) / withFmt.length).toFixed(1);
    const clean = withFmt.filter((m) => m.formatDistance === 0).length;
    out.push(`## Format distance`);
    out.push("");
    out.push(`Mean lines off canon: **${mean}** · already-canon: **${pct(clean, withFmt.length)}** (${clean}/${withFmt.length}). ` +
      `A high number with a low semantic-error rate means the formatter is earning its keep; a correlation between the two is a finding (§2.9).`);
    out.push("");
  }

  out.push(`---`);
  out.push(`_\`node evals/harness/run.mjs\` regenerates this file. Per-run transcripts + sandboxes live under \`evals/runs/${runName}/\` (gitignored)._`);
  out.push("");

  writeFileSync(resultsPath, out.join("\n"));
}

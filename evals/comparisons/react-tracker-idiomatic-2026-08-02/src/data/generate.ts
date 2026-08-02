/**
 * Port of the benchmark's `gen-issues.mjs`, typed and bundled so the scale
 * control can regenerate the dataset in memory. Kept line-for-line faithful to
 * the original draw order: the seeded streams must produce identical records.
 */
import type { Issue, Priority, Status } from "./types";

/** mulberry32 — same PRNG as the reference generator. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VERBS = ["Fix", "Investigate", "Refactor", "Remove", "Add", "Update", "Migrate", "Document", "Optimize", "Rename", "Extract", "Restore", "Audit", "Polish", "Unify"];
const NOUNS = ["login flow", "scroll jank", "cache layer", "search index", "settings panel", "date parsing", "focus ring", "theme tokens", "row recycling", "keyboard traversal", "undo stack", "detail panel", "column widths", "group headers", "session restore", "toolbar overflow", "empty states", "error toasts", "import pipeline", "export dialog", "onboarding tour", "billing webhook", "avatar upload", "draft autosync", "print styles", "clipboard shim", "drag preview", "context menu", "release notes", "smoke tests"];
const TAILS = ["on Windows", "under load", "at 1M rows", "for RTL locales", "after resume", "in Safari", "on touch devices", "when offline", "with long titles", "in the grouped view", "during migration", "for new tenants", ""];
const SENTENCES = [
  "Reproduces reliably after the second navigation.",
  "The regression window points at last Tuesday's deploy.",
  "Customers on the annual plan are disproportionately affected.",
  "A workaround exists but it is not discoverable.",
  "Profiling shows the time is going to layout, not script.",
  "The fix likely belongs a layer lower than where the symptom shows.",
  "We should add a regression test before closing.",
  "Related reports have been merged into this issue.",
  "The design doc covers this case but the implementation drifted.",
  "Needs a decision from design before engineering can proceed.",
  "The error rate doubled after the retry logic changed.",
  "Rollback is safe; the migration is additive.",
];
const LABELS = ["bug", "regression", "perf", "ux", "a11y", "docs", "infra", "mobile", "desktop", "search", "editor", "billing", "onboarding", "api", "security", "i18n", "dark-mode", "keyboard", "touch", "animation", "data", "flaky", "tech-debt", "design", "needs-repro", "blocked-upstream", "good-first", "papercut", "release", "customer"];
const PEOPLE = ["ada", "grace", "ken", "bjarne", "tony", "radia", "lynn", "sophie", "adele", "hedy", "ruth", "donald"].map((n) => n[0].toUpperCase() + n.slice(1));
const EPOCH = 1735689600000; // 2025-01-01 — fixed base, no wall clock anywhere

export function generate(count: number, seed = 1337): Issue[] {
  const r = rng(seed);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
  const issues: Issue[] = [];

  for (let i = 1; i <= count; i++) {
    const ragged = r() < 0.03;
    let title = `${pick(VERBS)} ${pick(NOUNS)} ${pick(TAILS)}`.trim();
    if (r() < 0.03) title = `${title} — 直す 🚧`;
    if (r() < 0.01) title = `${title} ${"deadbeef".repeat(12)}`;
    const sr = r();
    const status: Status = sr < 0.4 ? "open" : sr < 0.65 ? "in-progress" : sr < 0.75 ? "blocked" : "closed";
    const pr = r();
    const priority: Priority = pr < 0.03 ? "P0" : pr < 0.2 ? "P1" : pr < 0.7 ? "P2" : "P3";
    const nLabels = Math.floor(r() * r() * 6);
    const labels = [...new Set(Array.from({ length: nLabels }, () => pick(LABELS)))];
    const nSent = r() < 0.3 ? 0 : 1 + Math.floor(r() * r() * 6);
    const description = Array.from({ length: nSent }, () => pick(SENTENCES)).join(" ");
    const created = EPOCH + Math.floor(r() * 500) * 86400000 + Math.floor(r() * 86400000);
    const updated = created + Math.floor(r() * r() * 120) * 86400000;
    issues.push({
      id: i,
      title,
      description,
      status,
      priority,
      labels,
      assignee: ragged || r() < 0.12 ? null : pick(PEOPLE),
      created,
      updated,
      closedAt: status === "closed" ? updated : null,
      comments: Math.floor(r() * r() * 40),
    });
  }

  // Recency pass: a second seeded stream pulls ~30% of `updated` into the last
  // 90 days of dataset time, leaving the primary draw sequence untouched.
  const r2 = rng(4242);
  const horizon = issues.reduce((m, it) => Math.max(m, it.updated), 0);
  for (const it of issues) {
    if (r2() < 0.3) {
      const u = horizon - Math.floor(r2() * r2() * 90) * 86400000 - Math.floor(r2() * 86400000);
      it.updated = Math.max(it.created, u);
      if (it.status === "closed") it.closedAt = it.updated;
    }
  }
  return issues;
}

// round-ios — the corpus on the phone, both trees, one Safari tab.
//
//   node mac-host/profile/round-ios.mjs [--cases a,b] [--render canvas|dom]
//
// Prints ONE url. Open it on the device; every run after that navigates itself,
// alternating the two trees case by case so the pair is measured minutes apart
// at most — a phone's thermal state moves over a long round, and measuring all
// of "before" and then all of "after" would put that drift straight into the
// comparison.
//
// The rig never claims a row the device did not produce: a case whose result
// does not arrive is reported missing, and a pair whose landmarks disagree is
// voided exactly as on the other runtimes (round.mjs's checks are reused).

import path from "node:path";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { CASES, BY_NAME, plan } from "./cases.mjs";
import { serveRound } from "./exec-ios.mjs";
import { checkRun, checkPair } from "./checks.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const TREES = {
  before: path.resolve(flag("before", path.join(process.env.HOME ?? "", "Code/Declare-Before"))),
  after: path.resolve(flag("after", path.join(process.env.HOME ?? "", "Code/Declare-After"))),
};
const RENDER = flag("render", "canvas");
// --real <udid> opens the first url ON THE DEVICE, the way the previous device
// rig did (damage-device.mjs): `devicectl … --payload-url … com.apple.mobilesafari`.
// Without it the url has to be typed into the phone by hand, which this round
// made DT do for no reason — the mechanism existed and did not come across.
// `xcrun devicectl list devices` prints the UDIDs.
const REAL = flag("real", process.env.DECLARE_IOS_UDID ?? null);
const ONLY = flag("cases", "") ? flag("cases", "").split(",") : null;
const names = (ONLY ?? plan("ios").runs).filter((n) => BY_NAME[n]);

// alternate the trees per case, so a pair is close together in time
const queue = names.flatMap((name) => [
  { case: name, tree: "before", render: RENDER },
  { case: name, tree: "after", render: RENDER },
]);

const { base, first, results, close, total } = await serveRound({
  trees: TREES, queue,
  onHit: (from, method, pathname) => console.log(`  ← ${from} ${method} ${pathname.slice(0, 60)}`),
  onResult: (out, i, n) => {
    const q = queue[i];
    const m = out.meters;
    const line = out.error || out.failure
      ? `FAILED ${out.error ?? out.failure}`
      : `settle ${m?.settle?.ms?.toFixed?.(0) ?? "?"} ms · paint ${m?.paint?.ms?.toFixed?.(0) ?? "?"} ms · area ${m?.paint?.area ?? "—"} · evals ${m?.evals?.n ?? "?"}`;
    console.log(`  [${String(i + 1).padStart(2)}/${n}] ${q.case.padEnd(20)} ${q.tree.padEnd(7)} ${line}`);
  },
});

if (REAL) {
  // --terminate-existing: a Safari holding the last round's tab would otherwise
  // restore it, and the round would measure a page from a server that is gone.
  try {
    execFileSync("xcrun", ["devicectl", "device", "process", "launch", "--device", REAL,
                           "--terminate-existing", "--payload-url", first, "com.apple.mobilesafari"],
                 { stdio: "ignore", timeout: 60000 });
    console.log(`\nOpened on the device (${REAL}). Leave Safari frontmost — a backgrounded tab is throttled to about a frame a second.\n`);
  } catch (e) {
    console.log(`\ncould not launch Safari on ${REAL} (${String(e.message ?? e).slice(0, 80)})`);
    console.log(`open this by hand instead:\n\n  ${base}\n`);
  }
} else {
  console.log(`\nOpen this on the phone — ONE tab, and leave it frontmost:\n\n  ${base}\n`);
  console.log(`(or pass --real <udid> to open it on the device; xcrun devicectl list devices)`);
}
console.log(`${total} runs queued (${names.length} cases × 2 trees, alternating).`);
console.log("Safari must stay foregrounded: a backgrounded tab is throttled to a frame a second and the numbers are meaningless.\n");

await new Promise((resolve) => {
  const iv = setInterval(() => { if (results.length >= total) { clearInterval(iv); resolve(); } }, 500);
});
close();

// ── pair up and apply the same checks as every other runtime ────────────────
const byCase = {};
for (let i = 0; i < results.length; i++) {
  const q = queue[i];
  (byCase[q.case] ??= {})[q.tree] = results[i];
}
const out = { stamp: new Date().toISOString(), runtime: "ios", render: RENDER, trees: TREES, rows: [], voided: [], missing: [] };
for (const name of names) {
  const desc = BY_NAME[name], pair = byCase[name] ?? {};
  if (!pair.before || !pair.after) { out.missing.push(name); console.log(`  MISSING ${name}`); continue; }
  const problems = [...checkRun(desc, pair.before).map((p) => `before: ${p}`),
                    ...checkRun(desc, pair.after).map((p) => `after: ${p}`),
                    ...checkPair(desc, pair.before, pair.after)];
  if (problems.length) { out.voided.push({ case: name, problems }); console.log(`  VOID ${name} — ${problems.join("; ")}`); continue; }
  out.rows.push({ case: name, before: pair.before, after: pair.after });
}

const RESULTS = path.join(HERE, "results");
mkdirSync(RESULTS, { recursive: true });
const file = path.join(RESULTS, `round-ios-${out.stamp.replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\n${out.rows.length} comparable row(s), ${out.voided.length} voided, ${out.missing.length} missing`);
console.log(file);

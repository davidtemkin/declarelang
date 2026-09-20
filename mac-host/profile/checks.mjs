// checks — is a run real, and is a pair comparable?
//
// Kept apart from the runners so every runtime can apply exactly the same
// rules: a corpus is only as good as its refusal to report a row it cannot
// stand behind, and a check that lives inside one runner is a check the other
// runtimes quietly skip.

/** A landmark expectation is either a count, or a string like ">0" / ">=24". */
function landmarkOk(expected, actual) {
  if (typeof expected === "number") return actual === expected;
  const m = String(expected).match(/^(>=|>|<=|<)?\s*(\d+)$/);
  if (!m) return true;
  const n = Number(m[2]);
  switch (m[1]) {
    case ">": return actual > n;
    case ">=": return actual >= n;
    case "<": return actual < n;
    case "<=": return actual <= n;
    default: return actual === n;
  }
}

/** Did this single run do what the case says it does? A run that silently did
 *  nothing (a stimulus that found no window, a verb that was never reached) is
 *  worse than a failed one, because its meters look like a fast result. */
export function checkRun(desc, run) {
  const problems = [];
  if (run.failure) problems.push(`the case did not complete: ${run.failure}`);
  const marks = run.meters?.marks ?? {};
  for (const [name, expected] of Object.entries(desc.landmarks ?? {})) {
    const got = marks[name] ?? 0;
    if (!landmarkOk(expected, got)) problems.push(`landmark ${name}: expected ${expected}, recorded ${got}`);
  }
  if ((run.meters?.settle?.n ?? 0) === 0) problems.push("no settles were recorded — the stimulus moved nothing");
  return problems;
}

/** Are these two runs comparable? Same landmarks, same counts. */
export function checkPair(desc, a, b) {
  const problems = [];
  const ma = a.meters?.marks ?? {}, mb = b.meters?.marks ?? {};
  const names = new Set([...Object.keys(ma), ...Object.keys(mb)]);
  // ONLY WHAT THE CASE DECLARES, and only where the case claims determinism.
  //
  //  • declared as a NUMBER ("this happens six times") → must match exactly.
  //  • declared as a COMPARISON (">0") → the case is saying the count is NOT
  //    deterministic, so comparing the two trees' counts contradicts the
  //    declaration. Each side is still held to the predicate by checkRun. The
  //    desktop cascades windows from a counter and picks zoom targets with
  //    Math.random, so an identical 120-move sweep crossed 144 boundaries in
  //    one host and 118 in the other — nothing can make those equal, and a
  //    good measurement was being thrown away for it.
  //  • NOT declared → incidental. A relayout under a stationary pointer records
  //    hover transitions in a case that has nothing to do with hovering; that
  //    is not evidence the runs diverged. Reported, never fatal.
  const declaredNames = Object.keys(desc.landmarks ?? {});
  for (const n of names) {
    const declared = (desc.landmarks ?? {})[n];
    if (declared === undefined) continue;          // incidental
    if (typeof declared !== "number") continue;    // declared non-deterministic
    const x = ma[n] ?? 0, y = mb[n] ?? 0;
    if (x === y) continue;
    problems.push(`landmark ${n}: before ${x}, after ${y} — the two runs did not do the same work`);
  }
  if (a.resizeKind !== b.resizeKind)
    problems.push(`resize was performed differently (${a.resizeKind} vs ${b.resizeKind})`);
  if (a.ramp && b.ramp && Math.abs(a.ramp.steps - b.ramp.steps) > Math.max(4, a.ramp.steps * 0.1))
    problems.push(`ramp steps differ by more than 10% (${a.ramp.steps} vs ${b.ramp.steps}) — different displays or a stalled frame loop`);
  return problems;
}


// The release this compiler is: package.json's version, written here by
// `release.mjs --scaffold` and held equal to it by test/release.test.mjs. A
// program's `declareVersion [ "…" ]` is compared with it (migration.md §2.1).
export const DECLARE_VERSION = "0.6.5";

/** `"0.6"` → [0, 6, 0, 0]: a release as major.minor.patch.step (the fourth
 *  part a smaller release between patches, 0.6.4.1), a missing part 0. */
export function releaseParts(v: string): [number, number, number, number] {
  const [a = 0, b = 0, c = 0, d = 0] = v.split(".").map((n) => Number(n));
  return [a, b, c, d];
}
/** Negative when `a` is the earlier release, 0 when the same, positive when later. */
export function compareReleases(a: string, b: string): number {
  const x = releaseParts(a), y = releaseParts(b);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3] - y[3];
}

export default async ({ expect }) => {
  for (const [attribute, expected] of [
    ["leftPath", true],
    ["rightPath", true],
    ["leftJoinPath", true],
    ["rightJoinPath", true],
    ["joinTargetPath", true],
    ["disconnectedPath", false],
    ["unreachableSourcePath", false],
    ["nonexistentEdgePath", false],
    ["fanInFactor", true],
    ["disconnectedFactor", false],
    ["unreachableRootFactor", false],
    ["cycleReachable", true],
    ["cycleCannotReachTarget", false],
  ]) {
    await expect.attr("app", attribute, expected);
  }
};

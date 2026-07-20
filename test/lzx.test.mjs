import { lzxToDeclare } from "../lzx/dist/transpile.js";
import { test, summarize } from "./harness.mjs";

await test("lzxToDeclare exists and returns the result shape", () => {
  const r = lzxToDeclare("<canvas/>");
  if (typeof r !== "object" || !("declare" in r) || !Array.isArray(r.gaps)) {
    throw new Error("unexpected result shape: " + JSON.stringify(r));
  }
});

summarize("lzx");

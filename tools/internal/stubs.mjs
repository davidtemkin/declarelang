// tools/internal/stubs.mjs — production stand-ins shared by the two bundlers.
//
// A bundle that never compiles carries no checker: every program it
// instantiates was checked by the compiler and stamped `trusted`
// (compiler/src/program-build.ts), and instantiate.ts routes a trusted
// program past every check. Two bundlers make that substitution — the
// production build (tools/declarec.mjs, one app) and the distro's boot
// (tools/internal/build-boot.mjs, every app) — from this one text, so the
// names it keeps can never drift between them. Each keeps every export the
// run-path imports, as a refusal that names the build.

/** check.js, stubbed: every export refuses with the reason. */
export const CHECK_STUB_SRC = `import { notAboard } from "./errors.js";\n` +
  ["check", "checkAttr", "checkMethod", "checkDecl", "checkComponentValue",
    "checkThemeRecord", "checkStyleDecls", "programSchemas", "withDecls",
    "manyPathOf", "coerceToken", "cssAttributeHint"]
    .map((n) => `export function ${n}() { throw notAboard("${n}", "checker"); }`)
    .join("\n") + "\n";

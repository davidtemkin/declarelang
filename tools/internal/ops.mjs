// ops — the OPERATIONS REGISTRY: the machine-readable source of truth for
// "how you work with Declare" (docs/system-design/verification.md §5.2: no operational
// fact exists only in prose). Every entry is one procedure step or command,
// with what it does and — where checkable — what to expect. Three consumers,
// one source:
//
//   • the ASSEMBLER (tools/internal/doc/assemble.mjs) projects these into the spine of
//     docs/declare-model.json and into the marker-injected blocks of the
//     operational docs, so the docs' commands and reality cannot diverge;
//   • the SMOKE TEST (test/ops.test.mjs) EXECUTES the entries marked
//     `test`-able — the getting-started flow is performed, not just described;
//   • agents/skills read the projections.
//
// `expect` is the testable contract: exitCode and/or a stdout fragment.
// `test: false` marks steps that are real but not executable in CI (cloning,
// browsing). `docs` is the declare-docs: link where the step is taught.

export const OPS = {
  setup: {
    title: "Get set up",
    steps: [
      { id: "clone", cmd: "git clone https://github.com/davidtemkin/declarelang.git && cd declarelang",
        description: "Get the repository.", test: false },
      { id: "install", cmd: "npm install",
        description: "Install the toolchain's dependencies (TypeScript; esbuild and puppeteer-core for builds and visual tests). The clone ships prebuilt — no build step before first run.",
        test: false },
      { id: "server", cmd: "npm start",
        description: "Start the dev server on http://127.0.0.1:8200/ — browse to any .declare file's URL and the server compiles and returns the running app.",
        testCmd: "PORT=8297 node server/index.mjs",
        expect: { stdoutIncludes: "Declare dev server" }, test: true, longRunning: true,
        docs: "declare-docs:operational:dev-server" },
      { id: "first-app", cmd: null,
        description: "Write a program to my-apps/hello.declare and browse to http://127.0.0.1:8200/my-apps/hello.declare — the program URL is the app's address.",
        test: false, docs: "declare-docs:operational:getting-started" },
    ],
  },
  authoring: {
    title: "While writing programs",
    steps: [
      { id: "build", cmd: "npm run build",
        description: "Recompile the runtime and compiler (tsc) — needed only after editing the toolchain's own .ts sources, never for writing Declare programs.",
        expect: { exitCode: 0 }, test: true },
      { id: "verify", cmd: "node tools/verify.mjs <app.declare>",
        description: "Climb the ladder — structure → resolution → analysis → boot (add --assert / --states / --baselines for behavior and visual rungs). Stops at the first failure; every diagnostic names its fix.",
        testCmd: "node tools/verify.mjs my-apps/__ops_smoke.declare --rung=4",
        expect: { exitCode: 0, stdoutIncludes: "clean through R4" }, test: true,
        docs: "declare-docs:operational:verify" },
      { id: "check", cmd: "node tools/declarec.mjs check <file.declare…>",
        description: "Compile and report, emitting nothing — parse, resolve, check, and typecheck, for one file or many (a library file too). --json emits a machine record per diagnostic (file, code, severity, line, col). Exit 1 on any error; warnings never fail.",
        testCmd: "node tools/declarec.mjs check my-apps/__ops_smoke.declare",
        expect: { exitCode: 0, stdoutIncludes: "clean" }, test: true,
        docs: "declare-docs:operational:verify" },
      { id: "format", cmd: "node tools/format.mjs --write <app.declare>",
        description: "Rewrite to the one house style (canon). --check exits 1 on drift (the CI gate); no flag prints to stdout.",
        testCmd: "node tools/format.mjs --check my-apps/__ops_smoke.declare",
        expect: { exitCode: 0 }, test: true,
        docs: "declare-docs:operational:format" },
      { id: "test", cmd: "npm test",
        description: "Everything that tests the SOURCES, and rungs 1–4 for every app and component in the corpus. Needs no `npm run derive` and is meaningful on any tree — no suite here reads a derived artifact.",
        test: false, docs: "declare-docs:operational:verify" },
      { id: "test-derived", cmd: "npm run derive && npm run test:derived",
        description: "The suites whose SUBJECT is a derived artifact — the assembled doc model, declare-help's knowledge base, the committed prewarm cache, the production builds. Only meaningful straight after a derive, which is why the command carries it: run alone on a stale tree it tests yesterday's artifact.",
        test: false, docs: "declare-docs:operational:verify" },
      { id: "test-ladder", cmd: "npm run test:ladder",
        description: "The SLOW rungs, pre-release: every app shipping a tests/ folder (tests/assert.mjs, tests/states.mjs, tests/baselines/) is climbed to R5 (real input) and R6 (pixels vs baselines) in headless Chromium. Discovery-based, so a new script is picked up by existing. `npm run test:all` runs both suites.",
        // the smoke test proves DISCOVERY only — climbing the real rungs here
        // would pull Chromium into the main suite, which is the split
        // this entry exists to keep.
        testCmd: "node test/ladder.test.mjs --list",
        expect: { exitCode: 0, stdoutIncludes: "app(s) discovered" }, test: true,
        docs: "declare-docs:operational:verify" },
    ],
  },
  maintaining: {
    title: "Maintaining the system (after changing toolchain sources or docs)",
    steps: [
      { id: "regenerate", cmd: "npm run derive",
        description: "Regenerate every committed derived artifact — bundles, the doc model, the prewarm cache, the production builds, the baked pages, the build id. One rule graph owns the order (tools/internal/derive.mjs), and a rule whose inputs are unchanged is skipped, so a doc edit runs the doc rules and nothing else. This is what writes the artifacts: no hook derives, and a commit writes nothing (the one exception is that a suite booting the dev server rebuilds a stale platform bundle). Required before a push, and before `npm run test:derived`.",
        test: false, docs: "declare-docs:operational:derive" },
      { id: "links-gate", cmd: "node tools/internal/doc/links.mjs --check",
        description: "Every declare-docs: symbolic link in the corpus resolves against the generated registry.",
        expect: { exitCode: 0 }, test: true },
      { id: "spine-gate", cmd: "node tools/internal/doc/assemble.mjs --check",
        description: "The three spine projections (declare-model.json, the marker-injected doc tables, the skill inventory) match a fresh assembly of the live registries.",
        expect: { exitCode: 0 }, test: true },
      { id: "prose-gate", cmd: "node tools/internal/doc/extract.mjs --check",
        description: "Every `## heading` in tools/internal/doc/prose/ binds to a real attribute, event, or method — prose that binds to nothing is silently dropped from the reference (13 documented events once rendered blank this way).",
        expect: { exitCode: 0 }, test: true },
    ],
  },
  shipping: {
    title: "Building for production",
    steps: [
      { id: "build-app", cmd: "node tools/declarec.mjs <app.declare> -o <outdir>",
        description: "Precompile to a self-contained production bundle (~45KB gz + your program). --canvas selects the canvas renderer; --debug keeps positions.",
        test: false, docs: "declare-docs:operational:building" },
      { id: "crawler", cmd: "node tools/declarec.mjs <app.declare> -o <outdir> --crawler",
        description: "Also bake the crawled document (every linked location's content) into the built page for crawlers.",
        test: false, docs: "declare-docs:guide:location" },
      { id: "extract", cmd: null,
        description: "Append ?extract to any program URL to see the document a crawler gets.",
        test: false, docs: "declare-docs:guide:location" },
    ],
  },
};

/** Flat list of testable entries for the smoke test. */
export function testableOps() {
  const out = [];
  for (const section of Object.values(OPS)) {
    for (const s of section.steps) if (s.test) out.push(s);
  }
  return out;
}

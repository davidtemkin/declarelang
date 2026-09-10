// Exercise the real shell hook and Git ref resolution; stub only expensive
// derive/release commands. Each case owns a disposable repository.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { test, summarize } from "./harness.mjs";

const hook = fileURLToPath(new URL("../tools/internal/hooks/pre-push", import.meta.url));
const zeros = "0".repeat(40);
const gates = ["tools/internal/derive.mjs --dry", "tools/internal/derive.mjs --outputs", "tools/internal/release.mjs --check"];

function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), "declare-pre-push-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("init");
    git("config", "core.hooksPath", ".no-hooks");
    git("config", "user.name", "Hook fixture");
    git("config", "user.email", "hook@example.invalid");
    git("config", "commit.gpgsign", "false");
    git("config", "tag.gpgsign", "false");
    writeFileSync(join(dir, "artifact.txt"), "first\n");
    git("add", "artifact.txt");
    git("commit", "-m", "first");
    const old = git("rev-parse", "HEAD");
    writeFileSync(join(dir, "artifact.txt"), "second\n");
    git("commit", "-am", "second");
    const head = git("rev-parse", "HEAD");
    git("checkout", "-b", "feat/review");
    const bin = join(dir, "bin");
    const log = join(dir, "calls.log");
    mkdirSync(bin);
    writeFileSync(log, "");
    writeFileSync(join(bin, "node"), `#!${process.execPath}
const { appendFileSync } = require('node:fs');
const command = process.argv.slice(2).join(' ');
appendFileSync(process.env.HOOK_TEST_CALLS, command + '\\n');
if (command === 'tools/internal/derive.mjs --dry') process.exit(Number(process.env.HOOK_TEST_DRY));
if (command === 'tools/internal/derive.mjs --outputs') { console.log('artifact.txt'); process.exit(0); }
if (command === 'tools/internal/release.mjs --check') process.exit(Number(process.env.HOOK_TEST_RELEASE));
process.exit(99);
`, { mode: 0o755 });
    const update = (remote, sha = head, local = "refs/heads/feat/review") => `${local} ${sha} ${remote} ${zeros}\n`;
    const push = (input, env = {}) => {
      writeFileSync(log, "");
      const result = spawnSync("sh", [hook, "origin", "fixture"], {
        cwd: dir, input, encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOOK_TEST_CALLS: log,
          HOOK_TEST_DRY: "0", HOOK_TEST_RELEASE: "0", ...env },
      });
      if (result.error) throw result.error;
      return { ...result, calls: readFileSync(log, "utf8").trim().split("\n").filter(Boolean) };
    };
    run({ dir, git, old, head, update, push });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

await test("source-only review push leaves dirty artifacts and index untouched", () => fixture(({ dir, git, update, push }) => {
  writeFileSync(join(dir, "artifact.txt"), "uncommitted\n");
  const before = git("status", "--porcelain");
  const r = push(update("refs/heads/feat/review"), { HOOK_TEST_DRY: "1", HOOK_TEST_RELEASE: "1" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.calls, []);
  assert.equal(git("status", "--porcelain"), before);
  assert.equal(existsSync(join(dir, ".derive")), false);
}));

for (const ref of ["refs/heads/main", "refs/heads/master", "refs/tags/v1.0.0"]) {
  await test(`${ref} retains every gate even from a feature branch`, () => fixture(({ update, push }) => {
    const r = push(update(ref));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(r.calls, gates);
  }));
}

await test("mixed pushes cannot conceal stale publication artifacts in either order", () => fixture(({ update, push }) => {
  for (const refs of [["refs/heads/feat/review", "refs/heads/main"], ["refs/heads/main", "refs/heads/feat/review"]]) {
    const r = push(refs.map(ref => update(ref)).join(""), { HOOK_TEST_DRY: "1" });
    assert.equal(r.status, 1);
    assert.deepEqual(r.calls, gates.slice(0, 1));
  }
}));

await test("uncommitted artifacts refuse publication", () => fixture(({ dir, update, push }) => {
  writeFileSync(join(dir, "artifact.txt"), "dirty\n");
  const r = push(update("refs/heads/main"));
  assert.equal(r.status, 1);
  assert.deepEqual(r.calls, gates.slice(0, 2));
}));

await test("incomplete release refuses publication", () => fixture(({ update, push }) => {
  const r = push(update("refs/heads/main"), { HOOK_TEST_RELEASE: "1" });
  assert.equal(r.status, 1);
  assert.deepEqual(r.calls, gates);
}));

await test("a non-HEAD publication cannot check the wrong worktree", () => fixture(({ old, update, push }) => {
  const r = push(update("refs/heads/main", old));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /does not point to HEAD/);
  assert.deepEqual(r.calls, []);
}));

await test("annotated tags are checked against their peeled commit", () => fixture(({ git, update, push }) => {
  git("tag", "-a", "v1.0.0", "-m", "release");
  const r = push(update("refs/tags/v1.0.0", git("rev-parse", "v1.0.0"), "refs/tags/v1.0.0"));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.calls, gates);
}));

await test("review deletion is allowed but publication deletion is refused", () => fixture(({ update, push }) => {
  assert.equal(push(update("refs/heads/feat/review", zeros, "(delete)")).status, 0);
  for (const ref of ["refs/heads/main", "refs/heads/master", "refs/tags/v1.0.0"]) {
    assert.equal(push(update(ref, zeros, "(delete)")).status, 1);
  }
}));

await test("unknown destinations and malformed records fail closed; no updates is safe", () => fixture(({ update, push }) => {
  for (const input of [update("refs/notes/review"), "only two\n", "\n", update("refs/heads/main").trimEnd() + " extra\n"]) {
    const r = push(input);
    assert.equal(r.status, 1);
    assert.deepEqual(r.calls, []);
  }
  assert.equal(push("").status, 0);
}));

summarize("pre-push");

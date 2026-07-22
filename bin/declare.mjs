#!/usr/bin/env node
// bin/declare — the Declare command line.
//
// Installed under TWO names: `declarelang` (use this in npm scripts and any shell)
// and `declare`. Prefer `declarelang`: `declare` is a bash builtin, so
// `sh -c "declare dev"` — which is how npm runs a script — hits the builtin, not
// this bin. `declare` works interactively on non-bash shells and via `npx declare`.
//
// Three verbs on the one package (packaging-options.md §7). `dev` and `build`
// ship here; `vendor` is named so `help` is honest about the roadmap.
//
//   declarelang dev [--root DIR] [--proxy /p=URL] [PORT]   the dev server (server/dev.mjs)
//   declarelang build FILE [-o DIR] [--canvas] [--crawler]  a production build (declarec)
//   declarelang help                                        this
//
// `dev` runs from your project: put a declare.json in it and its location is the
// root mount, or pass --root. `build` is the same declarec the ?build request and
// CI use — one app in, a self-contained static directory out.
// See docs/operational/embedding.md and docs/operational/building.md.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const argv = process.argv.slice(2);
const verb = argv[0];
const rest = argv.slice(1);

function run(script, args) {
  const child = spawn(process.execPath, [path.join(ROOT, script), ...args], { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
}

const HELP = `declarelang — the Declare toolchain   (also aliased 'declare')

  declarelang dev [--root DIR] [--proxy /prefix=URL] [--port N | N]
      Run the dev server. From inside a project with a declare.json, its
      location is the root mount; otherwise --root DIR, or the distro itself.
      --proxy forwards a URL prefix to a back end (repeatable).

  declarelang build FILE [-o DIR] [--canvas] [--crawler] [--extract]
      Precompile ONE app to a self-contained static directory (declarec).
      Deployable to any static host; no compiler and no distro at run time.

  declarelang help
      This message.

Use 'declarelang' in npm scripts — 'declare' is a bash builtin the shell
intercepts. 'declare' still works interactively and via 'npx declare'.

Docs: docs/operational/embedding.md · docs/operational/building.md`;

switch (verb) {
  case "dev":
    // through the supervisor, so a compiler rebuild respawns cleanly in distro
    // mode; it forwards these args to server/index.mjs.
    run("server/dev.mjs", rest);
    break;
  case "build":
    run("tools/declarec.mjs", rest);
    break;
  case "vendor":
    console.error("declare vendor: not yet — the ~7MB platform-only distro for\n" +
      "self-hosting is a planned verb (packaging-options.md §7). For now embed via\n" +
      "a git/npm dependency; see docs/operational/embedding.md.");
    process.exit(2);
    break;
  case "help": case "--help": case "-h": case undefined:
    console.log(HELP);
    break;
  default:
    console.error(`declare: unknown command "${verb}"\n\n${HELP}`);
    process.exit(2);
}

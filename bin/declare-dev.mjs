#!/usr/bin/env node
// declare-dev — the Declare dev server, from the distro or from your own project.
//
//   declare-dev [--root DIR] [--proxy /prefix=URL] [--port N | N]
//
// From inside a project with a declare.json, its location is the root mount;
// otherwise --root DIR, or the distro itself. A program's URL under the server
// is its address: browse to it and the server compiles and serves the app.
// In the distro, `npm start` runs the same server.
//
// The rest of the family, one job each: declarec (package a program for
// production), declare-verify, declare-format, declare-help.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`declare-dev — the Declare dev server

  declare-dev [--root DIR] [--proxy /prefix=URL] [--port N | N]

  From inside a project with a declare.json, its location is the root mount;
  otherwise --root DIR, or the distro itself. --proxy forwards a URL prefix to
  a back end (repeatable). Browse to a program's URL and it runs.

The family: declarec (package for production) · declare-verify · declare-format · declare-help
Docs: docs/operational/dev-server.md · docs/operational/embedding.md`);
  process.exit(0);
}

// through the supervisor, so a compiler rebuild respawns cleanly in distro mode
const child = spawn(process.execPath, [path.join(ROOT, "server/dev.mjs"), ...args], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));

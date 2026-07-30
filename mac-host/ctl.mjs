#!/usr/bin/env node
// Drive the running app through its control channel, and capture its window,
// without touching the pointer, the keyboard focus, or the window order.
//
//   node ctl.mjs move 678 250
//   node ctl.mjs click 167 160
//   node ctl.mjs scroll 300 250 -8
//   node ctl.mjs key d ctrl
//   node ctl.mjs shot /tmp/x.png          (screencapture of the window by id)
//   node ctl.mjs seq "click 167 160" "click 385 185" "shot /tmp/after.png"
//
// Coordinates are the app's MODEL coordinates (top-left of the content area),
// so there is no window-origin arithmetic and no drift when the window moves.

import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";

const IN = "/tmp/declare-ctl.in";
const OUT = "/tmp/declare-ctl.out";

function windowId() {
  const line = execFileSync("/tmp/winb2").toString().trim().split("\n")[0];
  if (!line) throw new Error("the native app is not running");
  return line.split(" ")[0];
}

function shot(path) {
  execFileSync("/usr/sbin/screencapture", ["-x", "-o", "-l", windowId(), path]);
  return "shot " + path;
}

async function send(cmd) {
  if (existsSync(OUT)) unlinkSync(OUT);
  writeFileSync(IN, cmd + "\n");
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 20));
    if (existsSync(OUT)) return readFileSync(OUT, "utf8").trim();
  }
  return "(no reply — is DECLARE_CONTROL set?)";
}

const args = process.argv.slice(2);
if (args[0] === "seq") {
  for (const step of args.slice(1)) {
    const [verb] = step.split(" ");
    if (verb === "shot") console.log(shot(step.split(" ")[1]));
    else if (verb === "wait") await new Promise((r) => setTimeout(r, Number(step.split(" ")[1]) * 1000));
    else console.log(step + " -> " + (await send(step)));
  }
} else if (args[0] === "shot") {
  console.log(shot(args[1]));
} else {
  console.log(await send(args.join(" ")));
}

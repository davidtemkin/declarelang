// win — the ONE place the native rigs ask "where is the host's window?".
//
// gate.mjs, fidelity.mjs, parity.mjs and ctl.mjs each used to shell out to
// `/tmp/winb2` — a sourceless binary in a directory the OS is free to empty.
// They now share this module, which builds `winb` from the tracked
// `winb.swift` on demand (source tracked, binary per-machine and gitignored —
// the tools/internal/pointer.swift split), so a cleared /tmp costs one
// recompile instead of four broken rigs.

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "winb.swift");
const BIN = path.join(HERE, "winb");

/** The helper binary, compiled if missing or older than its source. */
function ensureBuilt() {
  if (existsSync(BIN) && statSync(BIN).mtimeMs >= statSync(SRC).mtimeMs) return BIN;
  process.stderr.write("win: building mac-host/winb from winb.swift\n");
  execFileSync("swiftc", ["-O", "-o", BIN, SRC], { stdio: ["ignore", "ignore", "inherit"] });
  return BIN;
}

/** Every on-screen window of the native host, frontmost first:
 *  `{ id, x, y, w, h }`. Empty array = the host is not running. */
export function hostWindows() {
  const out = execFileSync(ensureBuilt(), { encoding: "utf8" }).trim();
  if (out === "") return [];
  return out.split("\n").map((line) => {
    const [id, x, y, w, h] = line.split(" ").map(Number);
    return { id, x, y, w, h };
  });
}

/** The frontmost host window. Throws the message every rig already printed,
 *  so the failure reads the same as it always did. */
export function hostWindow() {
  const win = hostWindows()[0];
  if (win === undefined) throw new Error("the native app is not running");
  return win;
}

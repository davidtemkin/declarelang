// winb — "where is the native host's window?", the one question the fidelity,
// parity, gate and ctl rigs all need before they can screencapture anything.
//
// Prints one line per matching on-screen window, FRONTMOST FIRST:
//
//     <windowID> <x> <y> <width> <height>
//
// and nothing at all when the host is not running (every caller reads the
// empty first line as "not running", so silence is the contract, not an error).
//
//   winb                → the Declare host's windows
//   winb <ownerName>    → any application's, by owner name
//
// WHY THIS FILE EXISTS. The rigs used to shell out to `/tmp/winb2`: a compiled
// binary with no source anywhere in the tree, one `/tmp` clear away from making
// gate/fidelity/parity/ctl silently unrunnable — and, because it matched a
// single owner name, it saw the bare SwiftPM binary (owner "DeclareMac") but
// NOT a properly bundled Declare.app (owner "Declare"), which quietly tied the
// whole native gate to running the host un-bundled and icon-less. Both spellings
// answer here, so how the host was launched stops being load-bearing.
//
// Source tracked, binary per-machine and gitignored — the same split as
// tools/internal/pointer.swift. win.mjs rebuilds it on demand.

import CoreGraphics
import Foundation

let args = CommandLine.arguments
// The host answers to both spellings: `swift build`'s bare executable and the
// bundled app that bundle.sh produces.
let names: Set<String> = args.count > 1 ? [args[1]] : ["DeclareMac", "Declare"]

let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else {
  exit(0)   // no window server (a headless/ssh session) — the same "not running" silence
}

// CGWindowListCopyWindowInfo returns front-to-back, which is the order every
// caller wants: they all read the first line.
for w in list {
  guard let owner = w[kCGWindowOwnerName as String] as? String, names.contains(owner) else { continue }
  // Layer 0 is an ordinary document window; panels, menus and the shadow
  // layers sit above it and would otherwise win the "frontmost" race.
  guard let layer = w[kCGWindowLayer as String] as? Int, layer == 0 else { continue }
  guard let b = w[kCGWindowBounds as String] as? [String: Any] else { continue }
  let num = { (k: String) -> Double in (b[k] as? NSNumber)?.doubleValue ?? 0 }
  let width = num("Width"), height = num("Height")
  if width <= 1 || height <= 1 { continue }   // skip the zero-size helper windows
  let id = (w[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0
  print("\(id) \(Int(num("X"))) \(Int(num("Y"))) \(Int(width)) \(Int(height))")
}

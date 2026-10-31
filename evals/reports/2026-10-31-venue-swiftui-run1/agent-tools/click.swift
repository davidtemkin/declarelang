import CoreGraphics
import Foundation
// click.swift x y  — window-relative points of the Venue window
let pid = Int(CommandLine.arguments[1])!
let dx = Double(CommandLine.arguments[2])!, dy = Double(CommandLine.arguments[3])!
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as! [[String: Any]]
let w = list.first { ($0[kCGWindowOwnerPID as String] as? Int) == pid && ($0[kCGWindowLayer as String] as? Int) == 0 }!
let b = w[kCGWindowBounds as String] as! [String: Double]
let p = CGPoint(x: b["X"]! + dx, y: b["Y"]! + dy)
for t in [CGEventType.leftMouseDown, .leftMouseUp] {
  CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: p, mouseButton: .left)!.post(tap: .cghidEventTap)
  usleep(60000)
}

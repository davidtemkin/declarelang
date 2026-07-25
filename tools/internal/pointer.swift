// pointer — minimal CGEvent mouse driver for the real-screen fidelity loop.
//   pointer loc                  → print current pointer "x y"
//   pointer move  x y            → move pointer
//   pointer click x y            → move + left click
//   pointer rclick x y           → move + right click
//   pointer down  x y / up x y   → press / release (for drags)
//   pointer drag  x y            → dragged-move while pressed
//   pointer scroll x y dy        → move + wheel scroll (dy>0 scrolls content up)
// Requires Accessibility trust for the invoking terminal (CGEventPost).
import CoreGraphics
import Foundation

let args = CommandLine.arguments

func loc() -> CGPoint { CGEvent(source: nil)!.location }

if args.count == 2 && args[1] == "loc" {
  let p = loc()
  print("\(Int(p.x)) \(Int(p.y))")
  exit(0)
}

guard args.count >= 4, let x = Double(args[2]), let y = Double(args[3]) else {
  FileHandle.standardError.write("usage: pointer loc | pointer <move|click|rclick|down|up|drag> x y | pointer scroll x y dy\n".data(using: .utf8)!)
  exit(1)
}

let p = CGPoint(x: x, y: y)

func post(_ type: CGEventType, _ button: CGMouseButton = .left) {
  CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: button)!
    .post(tap: .cghidEventTap)
}

switch args[1] {
case "scroll":
  guard args.count >= 5, let dy = Int32(args[4]) else {
    FileHandle.standardError.write("usage: pointer scroll x y dy\n".data(using: .utf8)!)
    exit(1)
  }
  post(.mouseMoved); usleep(50_000)
  // pixel-unit wheel, like a trackpad tick; positive dy scrolls content up
  let e = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: dy, wheel2: 0, wheel3: 0)!
  e.location = p
  e.post(tap: .cghidEventTap)
case "move": post(.mouseMoved)
case "down": post(.leftMouseDown)
case "up": post(.leftMouseUp)
case "drag": post(.leftMouseDragged)
case "click":
  post(.mouseMoved); usleep(50_000)
  post(.leftMouseDown); usleep(60_000)
  post(.leftMouseUp)
case "rclick":
  post(.mouseMoved); usleep(50_000)
  post(.rightMouseDown, .right); usleep(60_000)
  post(.rightMouseUp, .right)
default:
  FileHandle.standardError.write("unknown command \(args[1])\n".data(using: .utf8)!)
  exit(1)
}

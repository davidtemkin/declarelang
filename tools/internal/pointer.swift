// pointer — minimal CGEvent mouse driver for the real-screen fidelity loop.
//   pointer loc                  → print current pointer "x y"
//   pointer move  x y            → move pointer
//   pointer click x y            → move + left click
//   pointer rclick x y           → move + right click
//   pointer down  x y / up x y   → press / release (for drags)
//   pointer drag  x y            → dragged-move while pressed
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
  FileHandle.standardError.write("usage: pointer loc | pointer <move|click|rclick|down|up|drag> x y\n".data(using: .utf8)!)
  exit(1)
}

let p = CGPoint(x: x, y: y)

func post(_ type: CGEventType, _ button: CGMouseButton = .left) {
  CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: button)!
    .post(tap: .cghidEventTap)
}

switch args[1] {
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

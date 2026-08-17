// frostprobe — does CALayer.backgroundFilters work on THIS macOS, and if so,
// which part of our layer configuration turns it off?
//
// The weather host sets a correct filter chain on 45 frost layers and gets no
// blur at all, while still costing ~2x WindowServer CPU. That is either "the OS
// dropped the feature" or "something in OUR tree disables it" — and those have
// completely different fixes, so guessing is not an option.
//
// Six panels over one photo-ish background, identical except for the ONE
// property named under each. Whichever panels blur, blur; whichever do not,
// name the culprit.
//
//   swift mac-host/frostprobe.swift        (then screenshot the window)

import AppKit
import QuartzCore

let app = NSApplication.shared
app.setActivationPolicy(.regular)

final class Probe: NSView {
    override var isFlipped: Bool { false }
    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer = CALayer()
        layerUsesCoreImageFilters = true          // without this, filters are ignored
        layer?.backgroundColor = NSColor.black.cgColor
    }
    required init?(coder: NSCoder) { fatalError() }
}

/// A busy background so a blur is unmistakable: hard-edged stripes and dots.
func backdrop(_ size: CGSize) -> CALayer {
    let l = CALayer()
    l.frame = CGRect(origin: .zero, size: size)
    let img = NSImage(size: NSSize(width: size.width, height: size.height))
    img.lockFocus()
    NSColor(calibratedRed: 0.15, green: 0.35, blue: 0.6, alpha: 1).setFill()
    NSRect(origin: .zero, size: NSSize(width: size.width, height: size.height)).fill()
    NSColor.white.setFill()
    var x: CGFloat = 0
    while x < size.width {                        // 8pt stripes — a blur destroys them
        NSRect(x: x, y: 0, width: 8, height: size.height).fill()
        x += 24
    }
    NSColor.orange.setFill()
    var y: CGFloat = 0
    while y < size.height {
        NSRect(x: 0, y: y, width: size.width, height: 6).fill()
        y += 40
    }
    img.unlockFocus()
    l.contents = img
    return l
}

func blurFilters() -> [CIFilter] {
    guard let f = CIFilter(name: "CIGaussianBlur") else { return [] }
    f.setValue(24.0, forKey: kCIInputRadiusKey)
    return [f]
}

/// One frosted panel. Each flag reproduces one thing the real host does.
func panel(_ frame: CGRect, label: String,
           flippedParent: Bool = false, depth: Int = 0,
           parentMasks: Bool = false, toneCurves: Bool = false,
           parentOpacity: Float = 1, siblingAbove: Bool = false) -> CALayer {
    // the group this panel lives in — the place the "parent" flags apply
    let group = CALayer()
    group.frame = frame
    group.isGeometryFlipped = flippedParent
    group.masksToBounds = parentMasks
    group.opacity = parentOpacity

    var host = group
    for _ in 0..<depth {                          // bury it N levels down
        let mid = CALayer()
        mid.frame = CGRect(origin: .zero, size: frame.size)
        host.addSublayer(mid)
        host = mid
    }

    let frost = CALayer()
    frost.frame = CGRect(x: 20, y: 20, width: frame.width - 40, height: frame.height - 40)
    frost.cornerRadius = 16
    frost.masksToBounds = true                    // the real host sets this
    frost.backgroundColor = NSColor(white: 1, alpha: 0.10).cgColor
    var fs = blurFilters()
    if toneCurves, let a = CIFilter(name: "CILinearToSRGBToneCurve"),
       let b = CIFilter(name: "CISRGBToneCurveToLinear") { fs = [a] + fs + [b] }
    frost.backgroundFilters = fs
    host.addSublayer(frost)

    if siblingAbove {                             // something painted over it
        let over = CALayer()
        over.frame = frost.frame
        over.backgroundColor = NSColor(white: 1, alpha: 0.01).cgColor
        host.addSublayer(over)
    }

    let text = CATextLayer()
    text.string = label
    text.fontSize = 11
    text.foregroundColor = NSColor.white.cgColor
    text.frame = CGRect(x: 26, y: frame.height - 34, width: frame.width - 40, height: 16)
    text.contentsScale = 2
    group.addSublayer(text)
    return group
}

let W = 960.0, H = 620.0
let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: W, height: H),
                   styleMask: [.titled, .closable], backing: .buffered, defer: false)
win.title = "frostprobe"
let v = Probe(frame: NSRect(x: 0, y: 0, width: W, height: H))
win.contentView = v
let root = v.layer!
root.addSublayer(backdrop(CGSize(width: W, height: H)))

let pw = 300.0, ph = 190.0
let cases: [(String, CALayer)] = [
    ("1 plain (baseline)",            panel(CGRect(x: 10, y: 410, width: pw, height: ph), label: "1 plain (baseline)")),
    ("2 flipped parent",              panel(CGRect(x: 325, y: 410, width: pw, height: ph), label: "2 isGeometryFlipped parent", flippedParent: true)),
    ("3 nested 4 deep",               panel(CGRect(x: 640, y: 410, width: pw, height: ph), label: "3 nested 4 deep", depth: 4)),
    ("4 parent masksToBounds",        panel(CGRect(x: 10, y: 205, width: pw, height: ph), label: "4 parent masksToBounds", parentMasks: true)),
    ("5 tone-curve chain",            panel(CGRect(x: 325, y: 205, width: pw, height: ph), label: "5 sRGB tone-curve chain", toneCurves: true)),
    ("6 parent opacity 0.99",         panel(CGRect(x: 640, y: 205, width: pw, height: ph), label: "6 parent opacity 0.99", parentOpacity: 0.99)),
    ("7 sibling above",               panel(CGRect(x: 10, y: 0, width: pw, height: ph), label: "7 sibling layer above", siblingAbove: true)),
    ("8 flipped ROOT + nested",       panel(CGRect(x: 325, y: 0, width: pw, height: ph), label: "8 flipped parent + nested 4", flippedParent: true, depth: 4)),
]
for (_, l) in cases { root.addSublayer(l) }

// The real host flips its ROOT layer. Toggle with an argument so the same
// binary answers both.
if CommandLine.arguments.contains("--flip-root") { root.isGeometryFlipped = true }

win.center()
win.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)
app.run()

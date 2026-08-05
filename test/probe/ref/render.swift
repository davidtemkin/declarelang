import AppKit

// Reference sheets rendered by macOS itself — SF Symbols at the weight and size
// a menu actually uses, so the comparison is against Apple's real output rather
// than against a screenshot someone measured.

let NAMES = ["chevron.down","arrow.up","checkmark","xmark","plus","minus",
             "lightbulb","sun.max","sun.max","circle.lefthalf.filled","moon","moon"]
// Apple has ONE rendition of each, and it is the outline one — so its sun and
// moon appear twice, as the same target for each of our two candidates.
let LABELS = ["Chevron","Arrow","Check","Close","Plus","Minus","Lightbulb",
              "Sun — ours filled","Sun — ours outline","Auto (half disc)",
              "Moon — ours filled","Moon — ours outline"]

let PITCH: CGFloat = 26        // row pitch
let BOX: CGFloat = 16          // icon box

let S: CGFloat = 2      // device pixels per point — match the harness's dpr

func ctx(_ w: Int, _ h: Int) -> NSBitmapImageRep {
    let r = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(CGFloat(w) * S), pixelsHigh: Int(CGFloat(h) * S),
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: r)
    let t = NSAffineTransform(); t.scale(by: S); t.concat()
    return r
}
func done(_ r: NSBitmapImageRep, _ path: String) {
    NSGraphicsContext.current?.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
    try! r.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}
func symbol(_ name: String, pt: CGFloat, weight: NSFont.Weight, tint: NSColor) -> NSImage? {
    let cfg = NSImage.SymbolConfiguration(pointSize: pt, weight: weight)
    guard let s = NSImage(systemSymbolName: name, accessibilityDescription: nil)?
        .withSymbolConfiguration(cfg) else { return nil }
    let out = NSImage(size: s.size)
    out.lockFocus()
    s.draw(at: .zero, from: NSRect(origin: .zero, size: s.size), operation: .sourceOver, fraction: 1)
    tint.set()
    NSRect(origin: .zero, size: s.size).fill(using: .sourceAtop)
    out.unlockFocus()
    return out
}

// ── 1 · a bare icon column, one per appearance ──────────────────────────────
func column(dark: Bool, path: String) {
    let w = 24, h = Int(PITCH) * NAMES.count
    let r = ctx(w, h)
    (dark ? NSColor(srgbRed: 0x18/255, green: 0x21/255, blue: 0x2C/255, alpha: 1)
          : NSColor.white).setFill()
    NSRect(x: 0, y: 0, width: CGFloat(w), height: CGFloat(h)).fill()
    let tint = dark ? NSColor(srgbRed: 0xE7/255, green: 0xEE/255, blue: 0xF2/255, alpha: 1)
                    : NSColor(srgbRed: 0x1B/255, green: 0x27/255, blue: 0x33/255, alpha: 1)
    for (i, n) in NAMES.enumerated() {
        guard let s = symbol(n, pt: 13, weight: .regular, tint: tint) else { continue }
        let top = CGFloat(i) * PITCH + (PITCH - BOX) / 2
        let x = 4 + (BOX - s.size.width) / 2
        let y = CGFloat(h) - top - BOX + (BOX - s.size.height) / 2
        s.draw(at: NSPoint(x: x, y: y), from: .zero, operation: .sourceOver, fraction: 1)
    }
    done(r, path)
}

// ── 2 · a mock macOS menu: icon column + labels, Apple's own metrics ────────
// Measured off the Apple menu at 2×: panel edge → icon left 9pt, icon ~14pt,
// icon → label 8.5pt, so the label edge lands at 31.5. Row pitch 24, text 13pt.
func menu(dark: Bool, path: String) {
    let w = 200, h = Int(PITCH) * NAMES.count + 10
    let r = ctx(w, h)
    (dark ? NSColor(srgbRed: 0x2C/255, green: 0x2C/255, blue: 0x2E/255, alpha: 1)
          : NSColor.white).setFill()
    NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: CGFloat(w), height: CGFloat(h)),
                 xRadius: 8, yRadius: 8).fill()
    let tint = dark ? NSColor(white: 0.93, alpha: 1) : NSColor(white: 0.13, alpha: 1)
    let font = NSFont.systemFont(ofSize: 13)
    for (i, n) in NAMES.enumerated() {
        let top = CGFloat(i) * PITCH + 5
        if let s = symbol(n, pt: 13, weight: .regular, tint: tint) {
            let x = 9 + (14 - s.size.width) / 2
            let y = CGFloat(h) - top - PITCH + (PITCH - s.size.height) / 2
            s.draw(at: NSPoint(x: x, y: y), from: .zero, operation: .sourceOver, fraction: 1)
        }
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: tint]
        let str = NSAttributedString(string: LABELS[i], attributes: attrs)
        let ty = CGFloat(h) - top - PITCH + (PITCH - str.size().height) / 2
        str.draw(at: NSPoint(x: 32, y: ty))
    }
    done(r, path)
}

// ── 3 · the contested marks, magnified — geometry, not weight ──────────────
// SF scales its stroke with point size, so a 32pt symbol is the same DESIGN as
// a 13pt one, just bigger. That makes a large rendering the honest place to
// compare shape: how big the sun's disc is against its rays, how the crescent's
// horns taper, how much detail the bulb carries.
let BIG = ["lightbulb","sun.max","sun.max","moon","moon"]
let BIGL = ["Lightbulb","Sun — ours filled","Sun — ours outline",
            "Moon — ours filled","Moon — ours outline"]
func big(path: String) {
    let pitch: CGFloat = 46, box: CGFloat = 32
    let w = 190, h = Int(pitch) * BIG.count + 8
    let r = ctx(w, h)
    NSColor.white.setFill()
    NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: CGFloat(w), height: CGFloat(h)),
                 xRadius: 10, yRadius: 10).fill()
    let tint = NSColor(white: 0.13, alpha: 1)
    let font = NSFont.systemFont(ofSize: 12)
    for (i, n) in BIG.enumerated() {
        let top = CGFloat(i) * pitch + 4
        if let s = symbol(n, pt: 32, weight: .regular, tint: tint) {
            let x = 14 + (box - s.size.width) / 2
            let y = CGFloat(h) - top - pitch + (pitch - s.size.height) / 2
            s.draw(at: NSPoint(x: x, y: y), from: .zero, operation: .sourceOver, fraction: 1)
        }
        let str = NSAttributedString(string: BIGL[i],
            attributes: [.font: font, .foregroundColor: NSColor(white: 0.45, alpha: 1)])
        let ty = CGFloat(h) - top - pitch + (pitch - str.size().height) / 2
        str.draw(at: NSPoint(x: 58, y: ty))
    }
    done(r, path)
}
big(path: CommandLine.arguments[1] + "/sf-big.png")

column(dark: false, path: CommandLine.arguments[1] + "/sf-col-light.png")
column(dark: true,  path: CommandLine.arguments[1] + "/sf-col-dark.png")
menu(dark: false,   path: CommandLine.arguments[1] + "/sf-menu-light.png")
menu(dark: true,    path: CommandLine.arguments[1] + "/sf-menu-dark.png")
print("wrote 4 reference sheets")

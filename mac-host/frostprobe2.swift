// frostprobe2 — if `backgroundFilters` is dead, what still works?
//
// frostprobe proved the compositor no longer honours backgroundFilters on this
// macOS: eight configurations including a bare baseline, zero blur, while still
// costing ~2x WindowServer CPU. The frost has to be produced some other way, and
// the cheapest one that still exists decides the design. So: four candidates,
// same backdrop, same 24pt radius.
//
//   A  layer.filters over its OWN contents      — Core Image, still on the GPU,
//                                                 but WE supply the backdrop.
//   B  MPSImageGaussianBlur into a texture      — Metal Performance Shaders; the
//                                                 route reference-mac-raster-gpu
//                                                 already measured at 0.77ms.
//   C  CIContext render to a CGImage            — Core Image off the layer tree.
//   D  NSVisualEffectView                       — the platform's own material.
//
//   swift mac-host/frostprobe2.swift

import AppKit
import QuartzCore
import Metal
import MetalPerformanceShaders

let app = NSApplication.shared
app.setActivationPolicy(.regular)

final class Probe: NSView {
    override var isFlipped: Bool { false }
    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer = CALayer()
        layerUsesCoreImageFilters = true
        layer?.backgroundColor = NSColor.black.cgColor
    }
    required init?(coder: NSCoder) { fatalError() }
}

/// A hard-edged backdrop: stripes a blur cannot survive.
func stripeImage(_ size: CGSize) -> NSImage {
    let img = NSImage(size: NSSize(width: size.width, height: size.height))
    img.lockFocus()
    NSColor(calibratedRed: 0.15, green: 0.35, blue: 0.6, alpha: 1).setFill()
    NSRect(origin: .zero, size: NSSize(width: size.width, height: size.height)).fill()
    NSColor.white.setFill()
    var x: CGFloat = 0
    while x < size.width { NSRect(x: x, y: 0, width: 8, height: size.height).fill(); x += 24 }
    NSColor.orange.setFill()
    var y: CGFloat = 0
    while y < size.height { NSRect(x: 0, y: y, width: size.width, height: 6).fill(); y += 40 }
    img.unlockFocus()
    return img
}

func cgOf(_ img: NSImage) -> CGImage {
    var r = CGRect(origin: .zero, size: img.size)
    return img.cgImage(forProposedRect: &r, context: nil, hints: nil)!
}

let W = 980.0, H = 560.0
let panelSize = CGSize(width: 420, height: 200)
let backdrop = stripeImage(CGSize(width: W, height: H))
let backdropCG = cgOf(backdrop)

func label(_ s: String, _ frame: CGRect) -> CATextLayer {
    let t = CATextLayer()
    t.string = s; t.fontSize = 12; t.foregroundColor = NSColor.white.cgColor
    t.backgroundColor = NSColor(white: 0, alpha: 0.55).cgColor
    t.frame = frame; t.contentsScale = 2
    return t
}

/// The slice of the backdrop that sits under a panel, as a CGImage.
func slice(_ frame: CGRect) -> CGImage {
    backdropCG.cropping(to: CGRect(x: frame.origin.x, y: H - frame.origin.y - frame.height,
                                   width: frame.width, height: frame.height))!
}

// ── A: layer.filters over the layer's own contents ──────────────────────────
func panelA(_ frame: CGRect) -> CALayer {
    let l = CALayer()
    l.frame = frame
    l.contents = slice(frame)
    l.masksToBounds = true
    l.cornerRadius = 16
    if let f = CIFilter(name: "CIGaussianBlur") {
        f.setValue(24.0, forKey: kCIInputRadiusKey)
        l.filters = [f]
    }
    return l
}

// ── B: Metal Performance Shaders blur into a texture ────────────────────────
func panelB(_ frame: CGRect) -> CALayer {
    let l = CALayer(); l.frame = frame; l.masksToBounds = true; l.cornerRadius = 16
    guard let dev = MTLCreateSystemDefaultDevice(), let q = dev.makeCommandQueue() else {
        l.backgroundColor = NSColor.red.cgColor; return l
    }
    let src = slice(frame)
    let w = src.width, h = src.height
    let desc = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: w, height: h, mipmapped: false)
    desc.usage = [.shaderRead, .shaderWrite]
    guard let inTex = dev.makeTexture(descriptor: desc), let outTex = dev.makeTexture(descriptor: desc),
          let cs = CGColorSpace(name: CGColorSpace.sRGB),
          let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                              space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        l.backgroundColor = NSColor.red.cgColor; return l
    }
    ctx.draw(src, in: CGRect(x: 0, y: 0, width: w, height: h))
    guard let data = ctx.data else { l.backgroundColor = NSColor.red.cgColor; return l }
    inTex.replace(region: MTLRegionMake2D(0, 0, w, h), mipmapLevel: 0, withBytes: data, bytesPerRow: w * 4)

    let t0 = CFAbsoluteTimeGetCurrent()
    let blur = MPSImageGaussianBlur(device: dev, sigma: 24)
    blur.edgeMode = .clamp
    guard let cb = q.makeCommandBuffer() else { l.backgroundColor = NSColor.red.cgColor; return l }
    blur.encode(commandBuffer: cb, sourceTexture: inTex, destinationTexture: outTex)
    cb.commit(); cb.waitUntilCompleted()
    let ms = (CFAbsoluteTimeGetCurrent() - t0) * 1000
    NSLog("[probe] MPS blur %dx%d sigma24: %.2fms", w, h, ms)

    var out = [UInt8](repeating: 0, count: w * h * 4)
    out.withUnsafeMutableBytes { p in
        outTex.getBytes(p.baseAddress!, bytesPerRow: w * 4, from: MTLRegionMake2D(0, 0, w, h), mipmapLevel: 0)
    }
    guard let prov = CGDataProvider(data: Data(out) as CFData),
          let img = CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4,
                            space: cs, bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                            provider: prov, decode: nil, shouldInterpolate: true, intent: .defaultIntent) else {
        l.backgroundColor = NSColor.red.cgColor; return l
    }
    l.contents = img
    return l
}

// ── C: CIContext → CGImage ──────────────────────────────────────────────────
func panelC(_ frame: CGRect) -> CALayer {
    let l = CALayer(); l.frame = frame; l.masksToBounds = true; l.cornerRadius = 16
    let src = slice(frame)
    let t0 = CFAbsoluteTimeGetCurrent()
    let ci = CIImage(cgImage: src)
    guard let f = CIFilter(name: "CIGaussianBlur") else { return l }
    f.setValue(ci.clampedToExtent(), forKey: kCIInputImageKey)
    f.setValue(24.0, forKey: kCIInputRadiusKey)
    guard let outCI = f.outputImage?.cropped(to: ci.extent) else { return l }
    let ctx = CIContext(options: [.workingColorSpace: NSNull()])
    guard let out = ctx.createCGImage(outCI, from: ci.extent) else { return l }
    NSLog("[probe] CIContext blur: %.2fms", (CFAbsoluteTimeGetCurrent() - t0) * 1000)
    l.contents = out
    return l
}

let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: W, height: H),
                   styleMask: [.titled, .closable], backing: .buffered, defer: false)
win.title = "frostprobe2"
let v = Probe(frame: NSRect(x: 0, y: 0, width: W, height: H))
win.contentView = v
let root = v.layer!

let bg = CALayer(); bg.frame = CGRect(x: 0, y: 0, width: W, height: H); bg.contents = backdrop
root.addSublayer(bg)

let fA = CGRect(x: 30, y: 320, width: panelSize.width, height: panelSize.height)
let fB = CGRect(x: 520, y: 320, width: panelSize.width, height: panelSize.height)
let fC = CGRect(x: 30, y: 60, width: panelSize.width, height: panelSize.height)
let fD = CGRect(x: 520, y: 60, width: panelSize.width, height: panelSize.height)
root.addSublayer(panelA(fA)); root.addSublayer(label("A  layer.filters (CoreImage on the layer)", CGRect(x: 34, y: 524, width: 400, height: 18)))
root.addSublayer(panelB(fB)); root.addSublayer(label("B  MPSImageGaussianBlur (Metal)", CGRect(x: 524, y: 524, width: 400, height: 18)))
root.addSublayer(panelC(fC)); root.addSublayer(label("C  CIContext -> CGImage", CGRect(x: 34, y: 264, width: 400, height: 18)))
root.addSublayer(label("D  NSVisualEffectView (subview)", CGRect(x: 524, y: 264, width: 400, height: 18)))

// ── D: NSVisualEffectView ───────────────────────────────────────────────────
let ve = NSVisualEffectView(frame: fD)
ve.material = .hudWindow
ve.blendingMode = .withinWindow
ve.state = .active
ve.wantsLayer = true
ve.layer?.cornerRadius = 16
ve.layer?.masksToBounds = true
v.addSubview(ve)

win.center(); win.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)
app.run()

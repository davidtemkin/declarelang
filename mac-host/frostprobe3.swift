// frostprobe3 — can CARenderer capture the backdrop on the GPU, and may it do
// that to a tree that is CURRENTLY ON SCREEN?
//
// frostbench measured the wall: `CALayer.render(in:)` costs 40ms on weather's
// 1689 layers even at quarter resolution, because it is CPU-walking layers
// rather than filling pixels. Blurring the result costs ~1ms. So the whole
// question is the capture, and `CARenderer` is the public GPU answer — IF it
// works on a live tree.
//
// The documented catch: a CARenderer's `layer` is supposed to be a tree the
// renderer owns. Nothing says what happens when you hand it one that is already
// hosted in a window, and that is exactly what a frost would need to do 120
// times a second. So: measure both, and check the pixels are real.
//
//   swift mac-host/frostprobe3.swift [layerCount]

import AppKit
import QuartzCore
import Metal

/// stderr, unbuffered — a piped `print` never arrives while the app is running.
func say(_ s: String) { fputs(s + "\n", stderr); fflush(stderr) }

let app = NSApplication.shared
app.setActivationPolicy(.regular)

let N = CommandLine.arguments.count > 1 ? Int(CommandLine.arguments[1])! : 1500
let W = 1280.0, H = 800.0

final class Probe: NSView {
    override var isFlipped: Bool { false }
    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer = CALayer()
        layerUsesCoreImageFilters = true
        layer?.isGeometryFlipped = true          // as the real host does
        layer?.backgroundColor = NSColor.black.cgColor
    }
    required init?(coder: NSCoder) { fatalError() }
}

/// A tree shaped roughly like weather's: a big image-ish backdrop plus many
/// small coloured layers, nested a few deep.
func buildTree(_ n: Int) -> CALayer {
    let root = CALayer()
    root.frame = CGRect(x: 0, y: 0, width: W, height: H)
    let bg = CALayer()
    bg.frame = root.frame
    bg.backgroundColor = NSColor(calibratedRed: 0.2, green: 0.45, blue: 0.7, alpha: 1).cgColor
    root.addSublayer(bg)
    var made = 2
    var group = root
    var i = 0
    while made < n {
        if i % 40 == 0 {                          // a new nesting level now and then
            let g = CALayer()
            g.frame = CGRect(x: 0, y: 0, width: W, height: H)
            group.addSublayer(g); group = g; made += 1
        }
        let l = CALayer()
        l.frame = CGRect(x: Double(i % 60) * 20, y: Double((i / 60) % 38) * 20, width: 18, height: 18)
        l.backgroundColor = NSColor(calibratedHue: Double(i % 100) / 100, saturation: 0.8,
                                    brightness: 0.9, alpha: 1).cgColor
        l.cornerRadius = 3
        group.addSublayer(l); made += 1; i += 1
    }
    return root
}

let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: W, height: H),
                   styleMask: [.titled, .closable], backing: .buffered, defer: false)
win.title = "frostprobe3"
let v = Probe(frame: NSRect(x: 0, y: 0, width: W, height: H))
win.contentView = v
let live = buildTree(N)
v.layer!.addSublayer(live)                        // ATTACHED and on screen
win.center(); win.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)

func countLayers(_ l: CALayer) -> Int { 1 + (l.sublayers ?? []).reduce(0) { $0 + countLayers($1) } }

/// Is a texture actually painted, or did we get an empty buffer?
func inkOf(_ tex: MTLTexture) -> (nonBlack: Int, sampled: Int) {
    let w = tex.width, h = tex.height
    var buf = [UInt8](repeating: 0, count: w * h * 4)
    buf.withUnsafeMutableBytes { p in
        tex.getBytes(p.baseAddress!, bytesPerRow: w * 4, from: MTLRegionMake2D(0, 0, w, h), mipmapLevel: 0)
    }
    var nonBlack = 0, sampled = 0
    var i = 0
    while i < buf.count { // every 97th pixel, so the scan itself is not the cost
        if buf[i] > 8 || buf[i + 1] > 8 || buf[i + 2] > 8 { nonBlack += 1 }
        sampled += 1; i += 97 * 4
    }
    return (nonBlack, sampled)
}

DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
    let layers = countLayers(live)
    say("tree: \(layers) layers, window \(Int(W))x\(Int(H))\n")

    // ── A. the CPU route, for the baseline ──────────────────────────────────
    for scale in [1.0, 0.25] {
        let w = Int(W * scale), h = Int(H * scale)
        var best = Double.infinity
        for _ in 0..<5 {
            guard let cs = CGColorSpace(name: CGColorSpace.sRGB),
                  let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                      space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue)
            else { continue }
            ctx.scaleBy(x: scale, y: scale)
            let t = CFAbsoluteTimeGetCurrent()
            live.render(in: ctx)
            best = min(best, (CFAbsoluteTimeGetCurrent() - t) * 1000)
        }
        say(String(format: "CALayer.render(in:)  scale %.2f  best %.2fms", scale, best))
    }

    // ── B. the GPU route ────────────────────────────────────────────────────
    guard let dev = MTLCreateSystemDefaultDevice(), let q = dev.makeCommandQueue() else {
        say("no Metal device"); return
    }
    for scale in [1.0, 0.25] {
        let w = Int(W * scale), h = Int(H * scale)
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm, width: w, height: h, mipmapped: false)
        d.usage = [.shaderRead, .shaderWrite, .renderTarget]
        d.storageMode = .managed
        guard let tex = dev.makeTexture(descriptor: d) else { say("no texture"); continue }
        let renderer = CARenderer(mtlTexture: tex, options: nil)

        // THE QUESTION: hand it the tree that is currently on screen.
        renderer.layer = live
        renderer.bounds = CGRect(x: 0, y: 0, width: W, height: H)

        var best = Double.infinity
        for _ in 0..<5 {
            guard let cb = q.makeCommandBuffer() else { break }
            let t = CFAbsoluteTimeGetCurrent()
            renderer.beginFrame(atTime: CACurrentMediaTime(), timeStamp: nil)
            renderer.addUpdate(renderer.bounds)
            renderer.render()
            renderer.endFrame()
            if let blit = cb.makeBlitCommandEncoder() { blit.synchronize(resource: tex); blit.endEncoding() }
            cb.commit(); cb.waitUntilCompleted()
            best = min(best, (CFAbsoluteTimeGetCurrent() - t) * 1000)
        }
        let ink = inkOf(tex)
        say(String(format: "CARenderer (GPU)     scale %.2f  best %.2fms   painted %d/%d sampled pixels %@",
                     scale, best, ink.nonBlack, ink.sampled,
                     ink.nonBlack > ink.sampled / 10 ? "✓ real image" : "✗ BLANK/BROKEN"))
        renderer.layer = nil
    }

    // ── C. is the on-screen tree still intact after being rendered? ─────────
    say("\nafter CARenderer: live tree still has \(countLayers(live)) layers, "
          + "superlayer=\(live.superlayer == nil ? "DETACHED ✗" : "attached ✓")")
    say("(look at the window: is it still drawing?)")
}

app.run()

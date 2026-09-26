// Frost — the backdrop sample, rebuilt as a targeted capture.
//
// WHY THIS EXISTS AGAIN. The frost was `CALayer.backgroundFilters`: the
// compositor sampled what was behind a layer and we paid nothing. That is gone
// on macOS 26 — `mac-host/frostprobe.swift` puts eight configurations over a
// striped backdrop, including a bare baseline, and NONE blur. Worse, the
// property is still honoured expensively: measured on weather, the filter chain
// roughly DOUBLED WindowServer CPU (26% → 64% idle, 37% → 79% scrolling) while
// rendering nothing at all. Paid for, not delivered — and invisible from inside
// the app, because our own commit stats stayed at 120Hz the whole time.
//
// WHAT THE NUMBERS SAID (ctl frostbench, weather, 1423 layers):
//
//     capture the whole window   1689 layers   render 40.2ms   blur 1.1ms
//     capture the sky subtree       2 layers   render  4.1ms   blur 0.9ms
//
// The BLUR was never the problem — it is ~1ms. `CALayer.render(in:)` is the
// wall, and it is layer-bound rather than fill-bound (125ms full-res → 40ms at
// quarter-res, barely scale-sensitive). So the old CPU sampler's 0.45fps was not
// a resolution problem to tune away: it was rendering the WHOLE TREE, once per
// frosted node, per commit.
//
// ⚠ CARenderer (the GPU capture) is NOT the way out. frostprobe3: handing it a
// window-attached tree renders a BLANK texture and DETACHES the live tree from
// the window. It needs a shadow tree — every layer duplicated, every op applied
// twice — which is a far bigger bet than it looks.
//
// SO: capture only what actually contributes. Declare's own semantics say what
// that is (`View.backdrop`): "what has already painted BENEATH this view is
// sampled within the view's own painted shape". Paint order, bounded by a floor.
// For a weather card that is the sky and nothing else — the 4ms case, not the
// 40ms one. Correct and cheap turn out to be the same walk.

import AppKit
import CoreImage
import Metal

extension LayerTree {

    // ── the floor ───────────────────────────────────────────────────────────
    //
    // How far down a sample reaches. `View.backdrop` says "the same isolating
    // ancestor `blend` does", and `View.blend` names: the App root, an
    // `opacity < 1` group, a scrolling view's content, an island boundary.
    //
    // ⚠ A SCROLLER IS NOT A FLOOR HERE, and that is deliberate — it is what the
    // reference renderer does. dom-backend `setBackdrop` is one line of
    // `backdrop-filter`, and while the backend DOES add `isolation: isolate` to
    // the app root and to scrollers (dom-backend.ts:1333, :1347), isolation does
    // not form a CSS Backdrop Root. So blend stops at a scroller and backdrop
    // does not. Measured in weather: the sky hangs at `1[SCROLLER] → 2 → 3`
    // while a frosted card hangs at `1[SCROLLER] → 261 → 269[SCROLLER] → …`, and
    // Chrome frosts the card over the sky regardless. Following the prose here
    // would frost weather's cards over nothing.
    func frostFloor(_ n: Node) -> Node {
        var cur = n
        while let p = cur.parent {
            // an effected (filtered/masked) ancestor isolates too (graphics-pass.md §0)
            if p.isRoot || p.isEmbedHost || p.layer.opacity < 1 || p.filterList != nil { return p }
            cur = p
        }
        return cur
    }

    // ── the capture ─────────────────────────────────────────────────────────
    //
    // (The per-node capture that lived here — recaptureFrost/paintBeneath/
    // drawSubtree — is gone. It re-rendered the same backdrop once per frosted
    // node, which is the 13x redundancy compositeFrosts below exists to remove.
    // The sequence and its numbers are in memory project-mac-draw-framerate.)

    /// A view's 2D paint transform in MODEL space (y-down, about its own box
    /// origin): the affine when the model sent one, else scale and rotation
    /// about the pivot. nil for none — and for 3D, which a flat walk cannot
    /// paint. The paint walks concatenate it around the view's origin, so what
    /// is sampled beneath a frost or a blend is the scene as drawn, turned
    /// content included (a rotated drawing under glass was sampled upright).
    func modelTransform(_ n: Node) -> CGAffineTransform? {
        if n.rot3D != nil { return nil }
        if let m = n.affine {
            if m.a == 1 && m.b == 0 && m.c == 0 && m.d == 1 && m.e == 0 && m.f == 0 { return nil }
            return CGAffineTransform(a: m.a, b: m.b, c: m.c, d: m.d, tx: m.e, ty: m.f)
        }
        if n.scaleK == 1 && n.rotation == 0 { return nil }
        return CGAffineTransform(translationX: n.pivot.x, y: n.pivot.y)
            .rotated(by: n.rotation * .pi / 180)
            .scaledBy(x: n.scaleK, y: n.scaleK)
            .translatedBy(x: -n.pivot.x, y: -n.pivot.y)
    }

    /// Concatenate a view's transform around its origin, when it has one.
    func applyModelTransform(_ n: Node, _ ctx: CGContext) {
        guard let m = modelTransform(n) else { return }
        let o = absOrigin(n)
        ctx.translateBy(x: o.x, y: o.y)
        ctx.concatenate(m)
        ctx.translateBy(x: -o.x, y: -o.y)
    }

    /// A node's own paint — its background and its content layers — without its
    /// children (they are walked separately, in order).
    private func drawOwnPaint(_ a: Node, into ctx: CGContext, clip: CGRect) {
        let o = absOrigin(a)
        let frame = CGRect(origin: o, size: a.box.size)
        guard frame.intersects(clip) || a.gradient != nil || a.draw != nil else { return }
        if let bg = a.layer.backgroundColor {
            ctx.saveGState()
            ctx.setFillColor(bg)
            if a.radius > 0 {
                ctx.addPath(CGPath(roundedRect: frame, cornerWidth: a.radius, cornerHeight: a.radius, transform: nil))
                ctx.fillPath()
            } else {
                ctx.fill(frame)
            }
            ctx.restoreGState()
        }
        for aux in [a.shapeBg, a.gradient, a.sidesLayer, a.draw, a.image, a.text as CALayer?].compactMap({ $0 }) {
            guard !aux.isHidden, aux.opacity > 0 else { continue }
            let f = aux.frame
            let at = CGRect(x: o.x + f.origin.x, y: o.y + f.origin.y, width: f.width, height: f.height)
            guard at.intersects(clip) else { continue }
            // A layer's own opacity is a COMPOSITING attribute — `render(in:)`
            // draws the receiver's content at full alpha and leaves its opacity
            // to whoever composites it, which here is us.
            if aux.opacity < 1 {
                ctx.saveGState()
                ctx.setAlpha(CGFloat(aux.opacity))
                renderMaybeCached(aux, at: at.origin, into: ctx, scale: frostCanvasScale)
                ctx.restoreGState()
            } else {
                renderMaybeCached(aux, at: at.origin, into: ctx, scale: frostCanvasScale)
            }
        }
    }

    /// Draw a layer into the canvas, reusing a cached rendition where the layer's
    /// own picture cannot have changed.
    ///
    /// THE SINGLE BIGGEST COST, measured: weather's sky is a 1920x1280 photo
    /// being downsampled into a ~691x432 canvas EVERY pass — 11-14ms, more than
    /// the rest of the scene together. Nothing about that picture changes; the
    /// only thing that moves is the view (SkyPhoto pans an over-scanned Image by
    /// constraints — the app already does the right thing). So render it once at
    /// canvas scale and blit it thereafter, which is what a compositor would do
    /// with the texture it already has.
    ///
    /// LEAF LAYERS ONLY, keyed on the identity of `contents`. A leaf's picture is
    /// exactly its contents, so the key is complete; caching a subtree would need
    /// to notice a change anywhere inside it, which this cannot see. That is not
    /// a limitation in practice — the expensive layers ARE the leaves: an image,
    /// or a `draw()` already rasterized to a bitmap.
    private func renderMaybeCached(_ l: CALayer, at p: CGPoint, into ctx: CGContext, scale: CGFloat) {
        let size = l.bounds.size
        // TEXT draws itself (no `contents` to key on) and was re-run through
        // Core Text on every walk — measured on weather's scroll as ~250 text
        // paints a frame, the walk's whole cost once the blur was batched. Its
        // picture is keyed by identity + TextLayer.version instead.
        if let t = l as? TextLayer, size.width >= 1, size.height >= 1 {
            let w = Int((size.width * scale).rounded()), h = Int((size.height * scale).rounded())
            let key = ObjectIdentifier(t)
            var img: CGImage?
            if let hit = frostTextRendition[key], hit.version == t.version, hit.w == w, hit.h == h {
                img = hit.img
            } else if w >= 1, h >= 1, let cs = CGColorSpace(name: CGColorSpace.sRGB),
                      let scratch = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                              space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue) {
                scratch.scaleBy(x: CGFloat(w) / size.width, y: CGFloat(h) / size.height)
                t.render(in: scratch)
                img = scratch.makeImage()
                if let made = img {
                    frostRenditionBytes += w * h * 4
                    if frostRenditionBytes > 48 * 1_048_576 {
                        frostRendition.removeAll(); frostTextRendition.removeAll()
                        frostRenditionBytes = w * h * 4
                    }
                    frostTextRendition[key] = (t.version, w, h, made)
                }
            }
            if let out = img {
                ctx.saveGState()
                ctx.translateBy(x: p.x, y: p.y + size.height)
                ctx.scaleBy(x: 1, y: -1)
                ctx.draw(out, in: CGRect(origin: .zero, size: size))
                ctx.restoreGState()
                return
            }
        }
        guard (l.sublayers?.isEmpty ?? true), let contents = l.contents as AnyObject?,
              size.width >= 1, size.height >= 1 else {
            render(l, at: p, into: ctx); return
        }
        let w = Int((size.width * scale).rounded()), h = Int((size.height * scale).rounded())
        guard w >= 1, h >= 1 else { render(l, at: p, into: ctx); return }

        let key = ObjectIdentifier(l)
        var img: CGImage?
        if let hit = frostRendition[key], hit.contents === contents, hit.w == w, hit.h == h {
            img = hit.img
        } else {
            guard let cs = CGColorSpace(name: CGColorSpace.sRGB),
                  let scratch = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                          space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue)
            else { render(l, at: p, into: ctx); return }
            scratch.interpolationQuality = .low
            scratch.scaleBy(x: CGFloat(w) / size.width, y: CGFloat(h) / size.height)
            l.render(in: scratch)                    // CA applies gravity/contentsRect
            img = scratch.makeImage()
            if let made = img {
                // ⚠ BOUND BY BYTES, NOT ENTRIES. These are full renditions — a
                // screen-sized one is ~1.2MB — so a 400-ENTRY cap is a 480MB cap,
                // which is not a cap. Entries for destroyed layers are never
                // individually evicted either (the key is the layer's address),
                // so the budget is what keeps this honest.
                frostRenditionBytes += w * h * 4
                if frostRenditionBytes > 48 * 1_048_576 {
                    frostRendition.removeAll()
                    frostRenditionBytes = w * h * 4
                }
                frostRendition[key] = (contents, w, h, made)
            }
        }
        guard let out = img else { render(l, at: p, into: ctx); return }
        ctx.saveGState()
        ctx.translateBy(x: p.x, y: p.y + size.height)
        ctx.scaleBy(x: 1, y: -1)
        ctx.draw(out, in: CGRect(origin: .zero, size: size))
        ctx.restoreGState()
    }

    /// `render(in:)` draws a layer at the context's origin, so place the origin.
    private func render(_ l: CALayer, at p: CGPoint, into ctx: CGContext) {
        ctx.saveGState()
        ctx.translateBy(x: p.x, y: p.y)
        // The tree is geometry-flipped for top-left model coordinates; the
        // context above is already in model space, so undo the flip for the
        // layer's own rendering or every layer lands upside down.
        ctx.translateBy(x: 0, y: l.bounds.height)
        ctx.scaleBy(x: 1, y: -1)
        l.render(in: ctx)
        ctx.restoreGState()
    }

    // ── the filter ──────────────────────────────────────────────────────────

    static let ciCtx = CIContext(options: [.workingColorSpace: NSNull()])

    /// Blur + saturate, in ENCODED sRGB — the DrawReplay precedent, and the
    /// reason the old chain wrapped itself in tone curves. Working in linear
    /// light makes `saturate` bite far harder than the web's.
    static func blur(_ img: CGImage, radius: CGFloat, saturate: CGFloat, chain: [CIFilter]? = nil) -> CGImage? {
        var ci = CIImage(cgImage: img)
        let extent = ci.extent
        if let chain {
            // the general list (graphics-pass.md §1): every function in order,
            // the blur's radius already scaled by the caller
            for f in chain {
                if f.name == "CIGaussianBlur" { f.setValue(ci.clampedToExtent(), forKey: kCIInputImageKey) }
                else { f.setValue(ci, forKey: kCIInputImageKey) }
                guard let out = f.outputImage else { return nil }
                ci = out.cropped(to: extent)
            }
            guard let cs = CGColorSpace(name: CGColorSpace.sRGB) else { return ciCtx.createCGImage(ci, from: extent) }
            return ciCtx.createCGImage(ci, from: extent, format: .BGRA8, colorSpace: cs)
        }
        if radius > 0.01, let f = CIFilter(name: "CIGaussianBlur") {
            f.setValue(ci.clampedToExtent(), forKey: kCIInputImageKey)
            f.setValue(radius, forKey: kCIInputRadiusKey)
            guard let out = f.outputImage else { return nil }
            ci = out.cropped(to: extent)
        }
        if abs(saturate - 1) > 0.001, let f = CIFilter(name: "CIColorMatrix") {
            // The CSS `saturate(s)` matrix verbatim (Filter Effects, Rec.709).
            let s = saturate
            f.setValue(ci, forKey: kCIInputImageKey)
            f.setValue(CIVector(x: 0.213 + 0.787 * s, y: 0.715 - 0.715 * s, z: 0.072 - 0.072 * s, w: 0), forKey: "inputRVector")
            f.setValue(CIVector(x: 0.213 - 0.213 * s, y: 0.715 + 0.285 * s, z: 0.072 - 0.072 * s, w: 0), forKey: "inputGVector")
            f.setValue(CIVector(x: 0.213 - 0.213 * s, y: 0.715 - 0.715 * s, z: 0.072 + 0.928 * s, w: 0), forKey: "inputBVector")
            f.setValue(CIVector(x: 0, y: 0, z: 0, w: 1), forKey: "inputAVector")
            guard let out = f.outputImage else { return nil }
            ci = out.cropped(to: extent)
        }
        // Tagged sRGB EXPLICITLY. The bare `createCGImage` on an unmanaged
        // context returns DeviceRGB — displayed unconverted, i.e. sRGB bytes
        // shown raw on a P3 panel. The canvas bytes are sRGB; say so, and CA
        // color-matches this layer exactly as it matches Chrome's output. The
        // GPU surface carries the same tag (IOSurfaceColorSpace), which is what
        // lets the two paths land pixel-identical glass.
        guard let cs = CGColorSpace(name: CGColorSpace.sRGB) else {
            return ciCtx.createCGImage(ci, from: extent)
        }
        return ciCtx.createCGImage(ci, from: extent, format: .BGRA8, colorSpace: cs)
    }

    // ── the same filter, blurred on the GPU ─────────────────────────────────
    //
    // `createCGImage` above is the expensive shape of readback — measured at
    // ~6.5ms of an ~14ms walk for weather's three radii, the single biggest
    // term once the capture was fixed. Here the IDENTICAL chain (same
    // CIGaussianBlur, same CSS saturate matrix, same unmanaged working space —
    // proven byte-identical in isolation) renders into a private Metal texture,
    // and one locked memcpy brings the ~420KB back as an IMMUTABLE CGImage.
    //
    // ⚠ A CGImage, DELIBERATELY — not the texture's IOSurface as layer
    // contents. That purer-looking route was built and then torn out: CA does
    // not honour an IOSurfaceColorSpace attachment (the glass rendered
    // oversaturated against the byte-identical CPU path), it scans surface rows
    // in the opposite order from a CGImage, and above all the contents were
    // MUTABLE — any reuse of a surface still held by WindowServer, or by a
    // frost that had not re-landed, changed pixels under a displayed frame and
    // flickered. Every one of those failure modes exists only because the
    // compositor was handed a live buffer. An immutable image cannot flicker,
    // and it lands through exactly the code path the CPU blur already proved.

    static let mtlDevice = MTLCreateSystemDefaultDevice()
    static let mtlQueue = mtlDevice?.makeCommandQueue()
    static let ciMetal: CIContext? = mtlDevice.map {
        CIContext(mtlDevice: $0, options: [.workingColorSpace: NSNull()])
    }
    /// Scratch render target per size — never shown, never shared, so one is
    /// enough and its reuse needs no lifetime reasoning.
    private static var blurScratch: [String: MTLTexture] = [:]
    /// Where a batch's time goes — CI graph setup + encode (CPU) vs the wait
    /// for the GPU — and how many jobs per submission. `ctl froststats`.
    static var blurSetupMs = 0.0, blurGpuMs = 0.0, blurReadMs = 0.0
    static var blurJobsN = 0, blurBatches = 0

    /// `DECLARE_FROST_CPU=1` forces the CPU chain — the A/B lever for verifying
    /// the GPU path against the reference on a LIVE scene (weather's sky
    /// drifts, so two screenshots minutes apart cannot be compared).
    static let forceCPUBlur = ProcessInfo.processInfo.environment["DECLARE_FROST_CPU"] != nil

    /// The blur chain as a CIImage — the same filters as `blur`, unexecuted.
    private static func blurChain(_ input: CIImage, radius: CGFloat, saturate: CGFloat, chain: [CIFilter]? = nil) -> CIImage? {
        var image = input
        let extent = image.extent
        if let chain {
            for f in chain {
                if f.name == "CIGaussianBlur" { f.setValue(image.clampedToExtent(), forKey: kCIInputImageKey) }
                else { f.setValue(image, forKey: kCIInputImageKey) }
                guard let out = f.outputImage else { return nil }
                image = out.cropped(to: extent)
            }
            return image
        }
        if radius > 0.01, let f = CIFilter(name: "CIGaussianBlur") {
            f.setValue(image.clampedToExtent(), forKey: kCIInputImageKey)
            f.setValue(radius, forKey: kCIInputRadiusKey)
            guard let out = f.outputImage else { return nil }
            image = out.cropped(to: extent)
        }
        if abs(saturate - 1) > 0.001, let f = CIFilter(name: "CIColorMatrix") {
            let s = saturate
            f.setValue(image, forKey: kCIInputImageKey)
            f.setValue(CIVector(x: 0.213 + 0.787 * s, y: 0.715 - 0.715 * s, z: 0.072 - 0.072 * s, w: 0), forKey: "inputRVector")
            f.setValue(CIVector(x: 0.213 - 0.213 * s, y: 0.715 + 0.285 * s, z: 0.072 - 0.072 * s, w: 0), forKey: "inputGVector")
            f.setValue(CIVector(x: 0.213 - 0.213 * s, y: 0.715 - 0.715 * s, z: 0.072 + 0.928 * s, w: 0), forKey: "inputBVector")
            f.setValue(CIVector(x: 0, y: 0, z: 0, w: 1), forKey: "inputAVector")
            guard let out = f.outputImage else { return nil }
            image = out.cropped(to: extent)
        }
        return image
    }

    /// The general batch: EVERY job its own input image and radius, ONE
    /// command buffer, ONE wait — what lets a whole frame's frosts (each on its
    /// own snapshot crop) cost one round trip instead of one each.
    static func blurJobsOnGPU(_ jobs: [(img: CGImage, radius: CGFloat, saturate: CGFloat, chain: [CIFilter]?)]) -> [CGImage]? {
        guard !forceCPUBlur, !jobs.isEmpty, let device = mtlDevice, let ci = ciMetal,
              let queue = mtlQueue, let cmd = queue.makeCommandBuffer() else { return nil }
        // SCRATCH TEXTURES BY SLOT, NOT BY SIZE. A frost's crop changes size
        // on every scroll frame (its capture rect meets the screen edge
        // differently each step), and a texture keyed by size was re-created
        // per job per frame — measured as the whole batch costing what the
        // serial submissions had. Slot `i` keeps one texture at least as large
        // as anything it has been asked for; a job renders into its own
        // top-left region and reads that region back.
        var targets: [MTLTexture] = []
        for (i, job) in jobs.enumerated() {
            let w = job.img.width, h = job.img.height
            let key = "slot/\(i)"
            if let hit = blurScratch[key], hit.width >= w, hit.height >= h {
                targets.append(hit)
            } else {
                let tw = max(w, blurScratch[key]?.width ?? 0), th = max(h, blurScratch[key]?.height ?? 0)
                let desc = MTLTextureDescriptor.texture2DDescriptor(
                    pixelFormat: .bgra8Unorm, width: tw, height: th, mipmapped: false)
                desc.usage = [.shaderWrite, .shaderRead]
                desc.storageMode = .shared
                guard let made = device.makeTexture(descriptor: desc) else { return nil }
                blurScratch[key] = made
                targets.append(made)
            }
        }
        let tSetup = CFAbsoluteTimeGetCurrent()
        for (i, job) in jobs.enumerated() {
            let input = CIImage(cgImage: job.img)
            let extent = input.extent
            guard var image = blurChain(input, radius: job.radius, saturate: job.saturate, chain: job.chain)
            else { return nil }
            // Core Image renders y-up; flip so the copied-out rows read
            // top-down, making the result a normal CGImage — same orientation,
            // same contentsRect math, same draw-back as the CPU chain.
            image = image.transformed(by: CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: extent.height))
            // The colorSpace argument is ignored by an unmanaged context
            // (measured; sRGB/linear/device all byte-identical) — raw bytes.
            ci.render(image, to: targets[i], commandBuffer: cmd, bounds: extent,
                      colorSpace: job.img.colorSpace ?? CGColorSpace(name: CGColorSpace.sRGB)!)
        }
        let tCommit = CFAbsoluteTimeGetCurrent()
        cmd.commit()
        cmd.waitUntilCompleted()
        let tDone = CFAbsoluteTimeGetCurrent()
        blurSetupMs += (tCommit - tSetup) * 1000
        blurGpuMs += (tDone - tCommit) * 1000
        blurJobsN += jobs.count
        blurBatches += 1

        // One copy out per job; each CGImage owns its bytes from here.
        let tRead = CFAbsoluteTimeGetCurrent()
        defer { blurReadMs += (CFAbsoluteTimeGetCurrent() - tRead) * 1000 }
        var out: [CGImage] = []
        guard let cs = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        for (i, tex) in targets.enumerated() {
            let w = jobs[i].img.width, h = jobs[i].img.height
            let bpr = w * 4
            var data = Data(count: bpr * h)
            data.withUnsafeMutableBytes { p in
                tex.getBytes(p.baseAddress!, bytesPerRow: bpr,
                             from: MTLRegionMake2D(0, 0, w, h), mipmapLevel: 0)
            }
            guard let provider = CGDataProvider(data: data as CFData),
                  let made = CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32,
                                     bytesPerRow: bpr, space: cs,
                                     bitmapInfo: CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Little.rawValue
                                                              | CGImageAlphaInfo.premultipliedFirst.rawValue),
                                     provider: provider, decode: nil, shouldInterpolate: true,
                                     intent: .defaultIntent)
            else { return nil }
            out.append(made)
        }
        return out
    }

    // ── when to re-sample ───────────────────────────────────────────────────
    //
    // "Content moving beneath re-frosts; that is the point" (View.backdrop). So
    // a cache is only allowed where it is invisible. compositing.md §5.3 already
    // rules the granularity: "resampled once per commit — under-content changes
    // only happen in a settle". `frostEpoch` is that: bumped by any op that
    // could change what a sample would see, and a frost re-captures when its own
    // epoch is behind. A commit that changed nothing beneath costs nothing.
    //
    // (The hole this inherits, stated: content that changes WITHOUT a commit —
    // a playing video under glass — does not re-frost. The old implementation
    // had the same hole, for the same reason.)

    // ── ONE COMPOSITE PER FRAME ─────────────────────────────────────────────
    //
    // The per-node capture below was correct and 13x redundant: thirteen frosts
    // on screen each re-rendered the SAME backdrop (weather's sky is a
    // procedural `draw` layer) for thirteen different crops of it. 8.5ms each,
    // 90% of it paint, 10fps.
    //
    // So: traverse the floor ONCE, in paint order, into ONE canvas. When the
    // walk reaches a frosted node, the canvas so far IS that node's backdrop —
    // "what has already painted beneath this view", by construction rather than
    // by a second walk. That is the model's own wording, so this is exact AND it
    // draws the sky once.
    //
    // Two things make it cheap in practice:
    //
    //   • A SNAPSHOT IS REUSED until something is drawn that could reach the
    //     next frost. Weather's cards do not overlap, so after the sky nothing
    //     intersects them: thirteen frosts, ONE snapshot. Exactness is kept by
    //     the intersection test, not assumed.
    //   • A frost's own blurred result is drawn back INTO the canvas before the
    //     walk continues, so a frost stacked over another frost samples it
    //     correctly — the case the old whole-tree sampler could never do.

    private final class Canvas {
        let ctx: CGContext
        let scale: CGFloat
        let rect: CGRect                       // model-space region the canvas covers
        var snapshot: CGImage?                 // the canvas as of the last snapshot
        var dirty: CGRect = .null              // drawn since that snapshot
        var gen = 0                            // bumped per snapshot
        /// Suffix unions of the capture rects still to come, in paint order —
        /// "can anything drawn here still reach a frost?"
        var remaining: [CGRect] = []
        var reachIndex = 0
        var reach: CGRect { reachIndex < remaining.count ? remaining[reachIndex] : .null }
        /// DEFERRED frosts (see landFrost): each carries its own snapshot crop
        /// and lands after the walk, all blurred in ONE GPU submission.
        struct Job { let node: Node; let spec: FilterList; let chain: [CIFilter]?; let crop: CGImage; let cropRect: CGRect; let box: CGRect }
        var jobs: [Job] = []
        /// The boxes of every frost landed or deferred so far in this walk —
        /// a later frost whose capture reaches one of them STACKS on it.
        var landedBoxes: [CGRect] = []
        init(ctx: CGContext, scale: CGFloat, rect: CGRect) {
            self.ctx = ctx; self.scale = scale; self.rect = rect
        }
    }

    /// Re-sample every on-screen frost under `floor` in one pass.
    private func compositeFrosts(floor: Node, frosts: Set<ObjectIdentifier>, into c: Canvas) -> (Int, Double) {
        var n = 0
        let t0 = CFAbsoluteTimeGetCurrent()

        // The capture rects still to come, in paint order, as SUFFIX UNIONS. At
        // any point in the walk, `c.reach` is "everything a later frost could
        // still sample", so a subtree that misses it need not be painted at all.
        var rects: [CGRect] = []
        func collect(_ node: Node) {
            guard !node.layer.isHidden, node.layer.opacity > 0 else { return }
            if frosts.contains(ObjectIdentifier(node)), let b = node.backdrop {
                let pad = max(1, b.blur * 2)
                rects.append(CGRect(origin: absOrigin(node), size: node.box.size).insetBy(dx: -pad, dy: -pad))
            }
            for k in node.children { collect(k) }
        }
        collect(floor)
        var suffix = [CGRect](repeating: .null, count: rects.count + 1)
        for i in stride(from: rects.count - 1, through: 0, by: -1) {
            suffix[i] = suffix[i + 1].union(rects[i])
        }
        c.remaining = suffix
        c.reachIndex = 0

        func walk(_ node: Node) {
            guard !node.layer.isHidden, node.layer.opacity > 0 else { return }
            let o = absOrigin(node)
            let box = CGRect(origin: o, size: node.box.size)
            let clips = node.boxClip || node.clipPath != nil || node.isRoot || node.isEmbedHost
            let reach = clips ? box : box.insetBy(dx: -80, dy: -80)
            let isFrost = node.backdrop != nil && frosts.contains(ObjectIdentifier(node))
            let hasFrostInside = isFrost || subtreeHasFrost(node, frosts)
            // ⚠ DO NOT PAINT WHAT NO REMAINING FROST CAN SEE. The canvas exists
            // only to be sampled, so paint that no later frost's capture rect
            // touches is pure waste — and in weather it is almost everything:
            // the cards do not overlap, so after the sky, nothing a card paints
            // can reach any frost that follows it. This is what takes the pass
            // from "one whole-scene render per commit" down to "the sky".
            if !hasFrostInside, !reach.intersects(c.reach) { return }
            if !reach.intersects(c.rect), !hasFrostInside { return }

            if isFrost, let spec = node.backdrop {
                n += 1
                landFrost(node, spec: spec, from: c)
                c.reachIndex += 1                       // this one is served
            }
            c.ctx.saveGState()
            applyModelTransform(node, c.ctx)
            if clips {
                if node.radius > 0 {
                    c.ctx.addPath(CGPath(roundedRect: box, cornerWidth: node.radius, cornerHeight: node.radius, transform: nil))
                } else { c.ctx.addRect(box) }
                c.ctx.clip()
            }
            // ⚠ GROUP OPACITY, or the sky disappears. `opacity` is a compositing
            // attribute: CA applies it when the subtree lands on what is beneath,
            // and nothing on the render path — not `render(in:)`, certainly not a
            // bare background fill — applies it for us. Weather's veil made this
            // vivid: a full-window box at opacity 0.10 over the sky, a subtle
            // dimming on screen, painted here at FULL alpha — an opaque wall
            // between the sky and every frost that follows it. A transparency
            // layer is the exact semantic (the subtree composites internally at
            // full alpha, then lands as a group), not a per-fill multiply.
            // The FLOOR's own opacity is deliberately not applied: an opacity<1
            // group is a backdrop root, and a sample inside it sees the group's
            // content, not the group's own landing.
            let group = node !== floor && node.layer.opacity < 1
            if group {
                c.ctx.setAlpha(CGFloat(node.layer.opacity))
                c.ctx.beginTransparencyLayer(auxiliaryInfo: nil)
            }
            if reach.intersects(c.reach) {
                let tn = CFAbsoluteTimeGetCurrent()
                // Cull each aux layer against what a remaining frost can still
                // SAMPLE, not against the whole canvas. The node-level test above
                // is generous by design (±80 for halos), and weather's cards sit
                // close enough that nearly every node passes it — measured at
                // 1,395 of 1,423 nodes painted per walk, almost all of them text
                // layers CPU-rendered for crops no frost would ever read.
                drawOwnPaint(node, into: c.ctx, clip: c.reach.intersection(c.rect))
                let dt = (CFAbsoluteTimeGetCurrent() - tn) * 1000
                if dt > 0.05 { frostNodeMs[node.id, default: 0] += dt }
                frostPainted += 1
                c.dirty = c.dirty.union(box)
            }
            if let want = LayerTree.frostDumpAfterNode, want == node.id {
                frostLastCanvas = c.ctx.makeImage()
            }
            for k in node.children { walk(k) }
            if group { c.ctx.endTransparencyLayer() }
            c.ctx.restoreGState()
        }
        walk(floor)
        flushDeferredFrosts(c)
        return (n, (CFAbsoluteTimeGetCurrent() - t0) * 1000)
    }

    /// Land every deferred frost: ONE GPU submission for all their crops, then
    /// each frost windows into its own blurred crop. Draws each result back
    /// into the canvas where a later frost could still reach it (the same
    /// draw-back the synchronous path does), so a stacked frost that flushed
    /// this list samples them correctly.
    private func flushDeferredFrosts(_ c: Canvas) {
        guard !c.jobs.isEmpty else { return }
        let jobs = c.jobs
        c.jobs.removeAll()
        let tb = CFAbsoluteTimeGetCurrent()
        var results = Self.blurJobsOnGPU(jobs.map { (img: $0.crop, radius: $0.spec.blur * c.scale, saturate: $0.spec.saturate, chain: $0.chain) })
        if results == nil {
            results = jobs.map { Self.blur($0.crop, radius: $0.spec.blur * c.scale, saturate: $0.spec.saturate, chain: $0.chain) ?? $0.crop }
        }
        frostBlurMs += (CFAbsoluteTimeGetCurrent() - tb) * 1000
        guard let imgs = results else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for (job, img) in zip(jobs, imgs) {
            guard let fl = job.node.frostLayer else { continue }
            fl.contents = img
            fl.contentsScale = 1
            fl.contentsGravity = .resize
            let cr = job.cropRect, box = job.box
            fl.contentsRect = CGRect(x: (box.minX - cr.minX) / cr.width,
                                     y: (cr.maxY - box.maxY) / cr.height,
                                     width: box.width / cr.width,
                                     height: box.height / cr.height)
            fl.backgroundFilters = []
            job.node.frostEpoch = frostEpoch
            if c.reach.intersects(box) {
                c.ctx.saveGState()
                c.ctx.addPath(CGPath(roundedRect: box, cornerWidth: job.node.radius, cornerHeight: job.node.radius, transform: nil))
                c.ctx.clip()
                c.ctx.draw(img, in: cr)
                c.ctx.restoreGState()
                c.dirty = c.dirty.union(box)
            }
        }
        CATransaction.commit()
    }

    private func subtreeHasFrost(_ n: Node, _ frosts: Set<ObjectIdentifier>) -> Bool {
        if frosts.contains(ObjectIdentifier(n)) { return true }
        for k in n.children where subtreeHasFrost(k, frosts) { return true }
        return false
    }

    /// Take (or reuse) the canvas as of this point, blur it, and land it.
    ///
    /// DEFERRED BY DEFAULT (2026-09-10): the blur's cost was never the blur —
    /// it was the GPU ROUND TRIP, once per snapshot. Weather's cards sit closer
    /// together than the blur's padding, so each card's own paint dirties the
    /// next frost's capture and every frost took a fresh snapshot and its own
    /// submission: 13 waits a frame, ~1.1ms each, the whole 8.3ms budget gone
    /// (measured: 22ms per scroll commit, the link at 67Hz). A snapshot is
    /// cheap (~0.03ms); so each frost keeps ITS snapshot — cropped to its own
    /// capture rect, which also shrinks the blur's work — and the blurs run
    /// together after the walk, one submission, one wait. Exactness is kept
    /// by construction: each frost samples the canvas exactly as it stood at
    /// its own point in paint order. The ONE case that cannot defer is a frost
    /// STACKED on an earlier frost, whose input must contain that frost's
    /// blurred pixels: it flushes what is pending and lands synchronously with
    /// the draw-back, exactly as before.
    private func landFrost(_ node: Node, spec: FilterList, from c: Canvas) {
        guard let fl = node.frostLayer else { return }
        // THE SAMPLE IS THE BOX ITSELF, clamped at its edge. A browser's
        // backdrop filter sees only the backdrop inside the element's border
        // box (measured: black up to a glass's left edge, blur(20px) — the glass
        // reads pure white at x+1), and the blur duplicates the edge. Sampling
        // past it — the padded capture this used — pulled the white card in
        // beyond a frost(24)'s ground and lightened the glass (14% of the swatch).
        let pad: CGFloat = 0
        // beyond the (blur, saturate) pair the whole list runs as a Core Image
        // chain over the sample (graphics-pass.md §1) — the blur scaled to the
        // canvas, since the chain's radius is in model units
        let chain: [CIFilter]? = spec.isPlainFrost ? nil : spec.coreImageChain(forLayer: false, blurScale: c.scale)
        let o = absOrigin(node)
        let box = CGRect(origin: o, size: node.box.size)
        let cap = box.insetBy(dx: -pad, dy: -pad)

        // STACKED = an earlier frost's box overlaps THIS box. Not its padded
        // capture: an earlier frost lying only inside the padding contributes
        // pixels this kernel is about to blur again, and blurred-then-blurred
        // is indistinguishable from painted-then-blurred there — while testing
        // against the padding made every neighbouring card "stack" (measured:
        // 1471 submissions for 1645 jobs, i.e. no batching at all).
        let stacked = c.landedBoxes.contains { $0.intersects(box) }
        c.landedBoxes.append(box)
        if !stacked {
            if c.snapshot == nil || c.dirty.intersects(cap) {
                let ti = CFAbsoluteTimeGetCurrent()
                c.snapshot = c.ctx.makeImage()
                c.gen += 1
                frostImageMs += (CFAbsoluteTimeGetCurrent() - ti) * 1000
                c.dirty = .null
            }
            guard let snap = c.snapshot else { return }
            // the crop, on whole canvas pixels; its model rect is derived from
            // the rounded pixels so the window math below stays exact
            let visible = cap.intersection(c.rect)
            guard !visible.isNull, !visible.isEmpty else { return }
            let px = CGRect(x: floor((visible.minX - c.rect.minX) * c.scale), y: floor((visible.minY - c.rect.minY) * c.scale),
                            width: ceil(visible.width * c.scale) + 1, height: ceil(visible.height * c.scale) + 1)
                .intersection(CGRect(x: 0, y: 0, width: snap.width, height: snap.height))
            guard let crop = snap.cropping(to: px) else { return }
            let cropRect = CGRect(x: c.rect.minX + px.minX / c.scale, y: c.rect.minY + px.minY / c.scale,
                                  width: px.width / c.scale, height: px.height / c.scale)
            c.jobs.append(Canvas.Job(node: node, spec: spec, chain: chain, crop: crop, cropRect: cropRect, box: box))
            return
        }
        flushDeferredFrosts(c)                  // a stacked frost needs the ones beneath it landed

        // REUSE unless something drawn since the last snapshot can reach here.
        // This is what turns thirteen composites into one, without giving up the
        // paint-order reading: the test is on what was actually drawn.
        if c.snapshot == nil || c.dirty.intersects(cap) {
            let ti = CFAbsoluteTimeGetCurrent()
            c.snapshot = c.ctx.makeImage()
            c.gen += 1
            frostImageMs += (CFAbsoluteTimeGetCurrent() - ti) * 1000
            c.dirty = .null
        }
        guard let snap = c.snapshot else { return }

        // A STACKED frost lands now, on its own crop of the canvas as it stands
        // (with the frosts beneath it drawn back in), blurred on the CPU chain —
        // the rare case; the deferred batch above is the common one.
        let visible = cap.intersection(c.rect)
        guard !visible.isNull, !visible.isEmpty else { return }
        let px = CGRect(x: floor((visible.minX - c.rect.minX) * c.scale), y: floor((visible.minY - c.rect.minY) * c.scale),
                        width: ceil(visible.width * c.scale) + 1, height: ceil(visible.height * c.scale) + 1)
            .intersection(CGRect(x: 0, y: 0, width: snap.width, height: snap.height))
        guard let crop = snap.cropping(to: px) else { return }
        let cropRect = CGRect(x: c.rect.minX + px.minX / c.scale, y: c.rect.minY + px.minY / c.scale,
                              width: px.width / c.scale, height: px.height / c.scale)
        let tb = CFAbsoluteTimeGetCurrent()
        let img = Self.blur(crop, radius: spec.blur * c.scale, saturate: spec.saturate, chain: chain) ?? crop
        frostBlurMs += (CFAbsoluteTimeGetCurrent() - tb) * 1000

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        fl.contents = img
        fl.contentsScale = 1
        fl.contentsGravity = .resize
        // The frost's own box, as a window into the canvas-wide image.
        //
        // ⚠ Y IS FLIPPED. The canvas is painted in MODEL space (top-left), but
        // these layers live under a `isGeometryFlipped` root, so `contentsRect`
        // is read bottom-up. The per-node version could not see this: its rect
        // was symmetric (`pad` on every side), so a flipped y landed on the same
        // pixels. Canvas-wide it is the whole bug — the sample tracks the scroll
        // in the WRONG DIRECTION, which reads as a backdrop moving faster than
        // the content, and windows into never-painted canvas as dark banding.
        fl.contentsRect = CGRect(x: (box.minX - cropRect.minX) / cropRect.width,
                                 y: (cropRect.maxY - box.maxY) / cropRect.height,
                                 width: box.width / cropRect.width,
                                 height: box.height / cropRect.height)
        fl.backgroundFilters = []
        CATransaction.commit()
        node.frostEpoch = frostEpoch

        // Draw the frost back into the canvas so a frost ABOVE this one samples
        // it — the stacked-frost case, which the whole-tree sampler never had.
        // Only worth doing while a later frost could still reach here.
        if c.reach.intersects(box) {
            c.ctx.saveGState()
            c.ctx.addPath(CGPath(roundedRect: box, cornerWidth: node.radius, cornerHeight: node.radius, transform: nil))
            c.ctx.clip()
            c.ctx.draw(img, in: cropRect)
            c.ctx.restoreGState()
            c.dirty = c.dirty.union(box)
        }
    }

    /// ON BY DEFAULT since 2026-09-10 (DT: the native host must not be
    /// deficient — a browser frosts). It sat behind `DECLARE_FROST` for frame
    /// rate — weather's scroll held ~55–60Hz against 120Hz — until the
    /// sampler's cost was cut where it actually was: not the blur (~1ms) but
    /// ONE GPU SUBMISSION PER FROST (landFrost's deferral fixed that) and
    /// scratch textures re-created per frame (slot-keyed now). Measured after,
    /// weather scrolling with 13 frosts on screen: the link at ~90Hz, ~13ms a
    /// commit for the whole pass. The composite is exact (the no-sky bug was
    /// the veil's group opacity, fixed in the walk) and the GPU-blurred glass
    /// is pixel-identical to the CPU reference (A/B: 0.000% differing).
    /// `DECLARE_NO_FROST=1` opts out for a measurement. The scroll process
    /// re-samples per frame (LayerTree.commitMoves), so the cost is paid where
    /// the web pays it. Next levers, unbuilt: an atlas (one CI graph per
    /// radius instead of per frost) and a cached static-floor canvas (the sky
    /// and veil blits are identical on every scroll frame).
    static let frostEnabled = ProcessInfo.processInfo.environment["DECLARE_NO_FROST"] == nil

    func refreshFrosts() -> (n: Int, ms: Double) {
        guard LayerTree.frostEnabled else { return (0, 0) }
        guard frostEpoch != frostAppliedEpoch else { return (0, 0) }
        frostAppliedEpoch = frostEpoch
        // OFFSCREEN FROSTS ARE NOT SAMPLED. Weather declares 45 and shows about
        // thirteen; sampling the other thirty-two would be the old sampler's
        // mistake in a new place. One that scrolls back into view is stale by an
        // epoch and re-samples on the commit that reveals it — the same "pay on
        // the way back in" rule the hidden-raster skip already uses.
        let screen = view?.bounds ?? .zero
        var byFloor: [ObjectIdentifier: (floor: Node, set: Set<ObjectIdentifier>)] = [:]
        forEachNode { n in
            guard n.backdrop != nil, n.frostLayer != nil, !n.layer.isHidden else { return }
            guard !hiddenAnywhere(n) else { return }
            guard CGRect(origin: absOrigin(n), size: n.box.size).intersects(screen) else { return }
            let f = frostFloor(n)
            byFloor[ObjectIdentifier(f), default: (f, [])].set.insert(ObjectIdentifier(n))
        }
        guard !byFloor.isEmpty else { return (0, 0) }

        let t0 = CFAbsoluteTimeGetCurrent()
        var count = 0
        for (_, group) in byFloor {
            // The canvas covers the screen plus the widest over-scan any frost in
            // the group needs, so every crop lands inside it.
            var pad: CGFloat = 1
            forEachNode { if group.set.contains(ObjectIdentifier($0)), let b = $0.backdrop { pad = max(pad, b.blur * 2) } }
            let rect = screen.insetBy(dx: -pad, dy: -pad)
            // ONE scale for the whole canvas, set by the SMALLEST radius in the
            // group — that is the only one that needs detail, since every larger
            // blur is about to destroy more of it. Both halves of the cost scale
            // with this: the capture and the per-radius blur (which, at ~15ms a
            // commit for weather's three radii, became the dominant term the
            // moment the rendition cache fixed the capture).
            var minBlur = CGFloat.greatestFiniteMagnitude
            forEachNode {
                guard group.set.contains(ObjectIdentifier($0)), let b = $0.backdrop else { return }
                minBlur = min(minBlur, b.blur)
            }
            let scale: CGFloat = max(0.2, min(0.5, 4.0 / max(1, minBlur)))
            frostCanvasScale = scale
            let pw = Int((rect.width * scale).rounded()), ph = Int((rect.height * scale).rounded())
            guard pw > 0, ph > 0, pw * ph < 16_000_000,
                  let cs = CGColorSpace(name: CGColorSpace.sRGB),
                  let ctx = CGContext(data: nil, width: pw, height: ph, bitsPerComponent: 8, bytesPerRow: 0,
                                      space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue)
            else { continue }
            ctx.translateBy(x: 0, y: CGFloat(ph))
            ctx.scaleBy(x: scale, y: -scale)
            ctx.translateBy(x: -rect.origin.x, y: -rect.origin.y)
            // ⚠ THIS IS ABOUT TO BE BLURRED. Core Graphics defaults to
            // high-quality resampling, and the frost's biggest costs are two
            // downscaled bitmap blits — weather's sky photo (1382x864) at 14ms a
            // pass and a full-screen draw layer at 6ms — resampled beautifully
            // and then destroyed by a Gaussian. Measured: 20ms of the ~48ms pass
            // was interpolation nobody can see.
            ctx.interpolationQuality = .low

            let canvas = Canvas(ctx: ctx, scale: scale, rect: rect)
            let (n, ms) = compositeFrosts(floor: group.floor, frosts: group.set, into: canvas)
            // Only when someone has asked for it: `makeImage()` on every
            // commit is a full canvas copy retained per frame, for a diagnostic.
            if LayerTree.frostDumpWanted { frostLastCanvas = ctx.makeImage() }
            count += n
            frostPaintMs += ms
        }
        return (count, (CFAbsoluteTimeGetCurrent() - t0) * 1000)
    }

    // ── BLEND, composited here ───────────────────────────────────────────────
    //
    // `View.blend` lands a view's painted subtree on what is already painted
    // beneath it, inside its isolating ancestor, with the operator — the web's
    // mix-blend-mode, which blends the ENCODED sRGB values. Core Animation's
    // compositing filters run in linear light instead, so difference,
    // exclusion, overlay, colour burn and the rest came out visibly wrong
    // (15–18% of each swatch); its own named modes fix most, not all. So the
    // host composites: the backdrop is the paint walk above, stopped at the
    // blended view; the source is the view's own layer tree; Core Image's
    // blend filters in the unmanaged (encoded) working space make the result,
    // which a sibling layer right above the view shows while the view's own
    // layer paints nothing. Re-made once per commit that changed anything,
    // as the frost is. A view under a transform keeps Core Animation's named
    // mode — its backdrop would have to be sampled through the transform.

    /// The isolating ancestor a blend stops at (View.blend): the App root, an
    /// island, an `opacity < 1` group, a filtered or masked view — and, unlike a
    /// backdrop, a scrolling view's content.
    func blendFloor(_ n: Node) -> Node {
        var cur = n
        while let p = cur.parent {
            if p.isRoot || p.isEmbedHost || p.modelOpacity < 1 || p.filterList != nil
                || p.maskGradient != nil || p.maskStencil != nil || p.content !== p.layer { return p }
            cur = p
        }
        return cur
    }

    func syncBlend(_ n: Node) {
        guard let b = n.blendLayer else { return }
        if n.hostBlended {
            // squarely placed (refreshBlends checked): the composite covers the
            // box and the bleed of a host-run filter
            b.transform = CATransform3DIdentity
            b.frame = n.layer.frame.insetBy(dx: -n.hostPad, dy: -n.hostPad)
        } else {
            b.bounds = n.layer.bounds
            b.position = n.layer.position
            b.transform = n.layer.transform
        }
        b.isHidden = n.layer.isHidden || !n.hostBlended
        b.opacity = n.modelOpacity
    }

    func unblend(_ n: Node) {
        n.hostBlended = false
        n.layer.opacity = n.modelOpacity
        n.blendLayer?.removeFromSuperlayer()
        n.blendLayer = nil
        if let p = n.parent { restack(p) }
    }

    /// Everything painted before `target` inside `node`, in paint order, into
    /// `ctx` (model space). True once the target is reached — the walk stops.
    private func paintBeneath(_ node: Node, target: Node, floor: Node, ctx: CGContext, clip: CGRect) -> Bool {
        if node === target { return true }
        guard !node.layer.isHidden else { return false }
        let o = absOrigin(node)
        let box = CGRect(origin: o, size: node.box.size)
        // an earlier host-blended view is its composite, already made
        if node.hostBlended, let bl = node.blendLayer, let img = bl.contents {
            let r = box.insetBy(dx: -node.hostPad, dy: -node.hostPad)   // with a host-run filter's bleed
            if r.intersects(clip) {
                ctx.saveGState()
                ctx.setAlpha(CGFloat(node.modelOpacity))
                ctx.translateBy(x: r.minX, y: r.maxY); ctx.scaleBy(x: 1, y: -1)
                ctx.draw(img as! CGImage, in: CGRect(origin: .zero, size: r.size))
                ctx.restoreGState()
            }
            return false
        }
        guard node.modelOpacity > 0 else { return false }
        let clips = node.boxClip || node.clipPath != nil || node.isRoot || node.isEmbedHost
        ctx.saveGState()
        applyModelTransform(node, ctx)
        if clips {
            if node.radius > 0 { ctx.addPath(CGPath(roundedRect: box, cornerWidth: node.radius, cornerHeight: node.radius, transform: nil)) }
            else { ctx.addRect(box) }
            ctx.clip()
        }
        let group = node !== floor && node.modelOpacity < 1
        if group { ctx.setAlpha(CGFloat(node.modelOpacity)); ctx.beginTransparencyLayer(auxiliaryInfo: nil) }
        drawOwnPaint(node, into: ctx, clip: clip)
        var reached = false
        for k in node.children where paintBeneath(k, target: target, floor: floor, ctx: ctx, clip: clip) { reached = true; break }
        if group { ctx.endTransparencyLayer() }
        ctx.restoreGState()
        return reached
    }

    /// The host can composite a view it can sample squarely: no scale,
    /// rotation, skew or 3D on it (a translation is only a position).
    private func squarelyPlaced(_ n: Node) -> Bool {
        if n.scaleK != 1 || n.rotation != 0 || n.rot3D != nil { return false }
        if let m = n.affine, !(m.a == 1 && m.b == 0 && m.c == 0 && m.d == 1) { return false }
        var p = n.parent
        while let q = p {
            if q.scaleK != 1 || q.rotation != 0 || q.rot3D != nil { return false }
            if let m = q.affine, !(m.a == 1 && m.b == 0 && m.c == 0 && m.d == 1) { return false }
            p = q.parent
        }
        return true
    }

    func refreshBlends() {
        guard blendEpoch != frostEpoch else { return }
        blendEpoch = frostEpoch
        var blended: [Node] = []
        forEachNode { if $0.blendName != nil || Self.hostFilters($0) { blended.append($0) } }
        guard !blended.isEmpty else { return }
        // paint order: a blend over an earlier blend samples its composite
        let order = paintOrder()
        blended.sort { (order[ObjectIdentifier($0)] ?? 0) < (order[ObjectIdentifier($1)] ?? 0) }
        let screen = view?.bounds ?? .zero
        let scale = view?.window?.backingScaleFactor ?? 2
        let savedScale = frostCanvasScale
        frostCanvasScale = scale
        defer { frostCanvasScale = savedScale }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        for n in blended {
            let box = CGRect(origin: absOrigin(n), size: n.box.size)
            let visible = !hiddenAnywhere(n) && box.intersects(screen) && box.width >= 1 && box.height >= 1
            var img: CGImage?
            var pad: CGFloat = 0
            if visible, squarelyPlaced(n) {
                if let mode = n.blendName, let name = BLEND_FILTERS[mode] { img = composite(n, filter: name, box: box, scale: scale) }
                else if let list = n.filterList {
                    pad = CGFloat(Self.bleed(list))
                    img = filterComposite(n, list: list, box: box, pad: pad, scale: scale)
                }
            }
            guard let img else {
                // not on screen, or not squarely placed: Core Animation's named
                // mode, or its layer filters and shadow
                if n.hostBlended { n.hostBlended = false; n.layer.opacity = n.modelOpacity; syncBlend(n) }
                if let mode = n.blendName { n.layer.compositingFilter = mode == "plusLighter" ? "plusL" : mode + "BlendMode" }
                continue
            }
            n.hostPad = pad
            let bl: CALayer
            if let e = n.blendLayer { bl = e } else {
                bl = CALayer(); bl.anchorPoint = n.layer.anchorPoint
                bl.actions = ["contents": NSNull(), "bounds": NSNull(), "position": NSNull(), "transform": NSNull(), "opacity": NSNull(), "hidden": NSNull()]
                n.blendLayer = bl
                if let p = n.parent { restack(p) }
            }
            bl.contents = img
            bl.contentsScale = scale
            bl.contentsGravity = .resize
            n.hostBlended = true
            n.layer.opacity = 0
            n.layer.compositingFilter = nil
            syncBlend(n)
        }
    }

    /// A filter list the layer cannot run: a `shadow(…)` with anything else.
    /// Core Animation's layer shadow is cast from the UNFILTERED content and is
    /// lost under `layer.filters` (a blurred card came out with no shadow and
    /// square corners), while the list means each function over the result of
    /// the one before. A lone shadow, or a list without one, stays on the layer.
    static func hostFilters(_ n: Node) -> Bool {
        guard n.blendName == nil, let l = n.filterList else { return false }
        return l.shadow != nil && l.items.count > 1
    }

    /// How far a list's output reaches past the box, in view units — a blur's
    /// 3σ, a shadow's offset plus its 3σ (value.ts filterBleed, mirrored).
    static func bleed(_ l: FilterList) -> Int {
        var pad: CGFloat = 0
        for f in l.items {
            if f.fn == "blur" { pad += f.v * 3 }
            else if f.fn == "shadow" { pad = max(pad, max(abs(f.dx), abs(f.dy)) + f.blur * 1.5) }
        }
        return Int(pad.rounded(.up))
    }

    /// The view's subtree run through its whole filter list, over its box and
    /// the list's bleed.
    private func filterComposite(_ n: Node, list: FilterList, box: CGRect, pad: CGFloat, scale: CGFloat) -> CGImage? {
        let r = box.insetBy(dx: -pad, dy: -pad)
        let pw = Int((r.width * scale).rounded(.up)), ph = Int((r.height * scale).rounded(.up))
        guard pw > 0, ph > 0, pw * ph < 16_000_000, let cs = CGColorSpace(name: CGColorSpace.sRGB),
              let c = CGContext(data: nil, width: pw, height: ph, bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                                bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue) else { return nil }
        // the layer's own y-up space, offset by the pad, at the backing scale
        c.scaleBy(x: scale, y: scale)
        c.translateBy(x: pad, y: pad)
        let was = n.layer.opacity, wasF = n.layer.filters, wasS = n.layer.shadowOpacity
        n.layer.opacity = 1; n.layer.filters = nil; n.layer.shadowOpacity = 0
        n.layer.render(in: c)
        n.layer.opacity = was; n.layer.filters = wasF; n.layer.shadowOpacity = wasS
        guard let src = c.makeImage() else { return nil }
        let ci = CIImage(cgImage: src, options: [.colorSpace: NSNull()])
        let out = DrawReplay.applyChain(ci, list.items, lengthScale: scale)
        return Self.ciCtx.createCGImage(out.cropped(to: ci.extent), from: ci.extent, format: .BGRA8, colorSpace: cs)
    }

    /// A number per node in paint order (a pre-order walk from the root).
    private func paintOrder() -> [ObjectIdentifier: Int] {
        var out: [ObjectIdentifier: Int] = [:], i = 0
        var roots: [Node] = []
        forEachNode { if $0.parent == nil { roots.append($0) } }
        func walk(_ n: Node) { out[ObjectIdentifier(n)] = i; i += 1; for k in n.children { walk(k) } }
        for r in roots { walk(r) }
        return out
    }

    /// The view's subtree blended onto what is beneath it, over its box.
    private func composite(_ n: Node, filter: String, box: CGRect, scale: CGFloat) -> CGImage? {
        let pw = Int((box.width * scale).rounded(.up)), ph = Int((box.height * scale).rounded(.up))
        guard pw > 0, ph > 0, pw * ph < 16_000_000, let cs = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        func context() -> CGContext? {
            guard let c = CGContext(data: nil, width: pw, height: ph, bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                                    bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue) else { return nil }
            c.translateBy(x: 0, y: CGFloat(ph)); c.scaleBy(x: scale, y: -scale)   // model space, top-left
            return c
        }
        // the backdrop: the floor's paint up to this view, over this box
        guard let bctx = context() else { return nil }
        bctx.translateBy(x: -box.minX, y: -box.minY)
        let floor = blendFloor(n)
        _ = paintBeneath(floor, target: n, floor: floor, ctx: bctx, clip: box)
        // the source: the view's own layer tree at full alpha — its opacity
        // lands on the composite, as a CSS blend's opacity does
        guard let sctx = context() else { return nil }
        let was = n.layer.opacity, wasFilter = n.layer.compositingFilter
        n.layer.opacity = 1; n.layer.compositingFilter = nil
        sctx.translateBy(x: 0, y: box.height); sctx.scaleBy(x: 1, y: -1)
        n.layer.render(in: sctx)
        n.layer.opacity = was; n.layer.compositingFilter = wasFilter
        guard let bImg = bctx.makeImage(), let sImg = sctx.makeImage(), let f = CIFilter(name: filter) else { return nil }
        f.setValue(CIImage(cgImage: sImg), forKey: kCIInputImageKey)
        f.setValue(CIImage(cgImage: bImg), forKey: kCIInputBackgroundImageKey)
        guard let out = f.outputImage else { return nil }
        let extent = CGRect(x: 0, y: 0, width: pw, height: ph)
        return Self.ciCtx.createCGImage(out.cropped(to: extent), from: extent, format: .BGRA8, colorSpace: cs)
    }
}

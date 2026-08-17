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
            if p.isRoot || p.isEmbedHost || p.layer.opacity < 1 { return p }
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
        for aux in [a.gradient, a.draw, a.image, a.text as CALayer?].compactMap({ $0 }) {
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
    static func blur(_ img: CGImage, radius: CGFloat, saturate: CGFloat) -> CGImage? {
        var ci = CIImage(cgImage: img)
        let extent = ci.extent
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
        return ciCtx.createCGImage(ci, from: extent)
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
        /// The whole snapshot, blurred, per radius. Blurring the CANVAS once and
        /// letting each frost window into it replaces one blur per frost with
        /// one per distinct radius — and it is MORE faithful, not less: the
        /// kernel then samples the real backdrop continuing past each frost's
        /// edge instead of a cropped copy of it.
        var blurred: [String: (gen: Int, img: CGImage)] = [:]
        /// Suffix unions of the capture rects still to come, in paint order —
        /// "can anything drawn here still reach a frost?"
        var remaining: [CGRect] = []
        var reachIndex = 0
        var reach: CGRect { reachIndex < remaining.count ? remaining[reachIndex] : .null }
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
                drawOwnPaint(node, into: c.ctx, clip: c.rect)
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
        return (n, (CFAbsoluteTimeGetCurrent() - t0) * 1000)
    }

    private func subtreeHasFrost(_ n: Node, _ frosts: Set<ObjectIdentifier>) -> Bool {
        if frosts.contains(ObjectIdentifier(n)) { return true }
        for k in n.children where subtreeHasFrost(k, frosts) { return true }
        return false
    }

    /// Take (or reuse) the canvas as of this point, blur it, and land it.
    private func landFrost(_ node: Node, spec: (blur: CGFloat, saturate: CGFloat), from c: Canvas) {
        guard let fl = node.frostLayer else { return }
        let pad = max(1, spec.blur * 2)
        let o = absOrigin(node)
        let box = CGRect(origin: o, size: node.box.size)
        let cap = box.insetBy(dx: -pad, dy: -pad)

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

        // ONE BLUR PER RADIUS, over the whole canvas — not one per frost. Every
        // frost then just windows into it, which is free.
        let key = String(format: "%.2f/%.2f", spec.blur, spec.saturate)
        var img: CGImage
        if let hit = c.blurred[key], hit.gen == c.gen {
            img = hit.img
        } else {
            let tb = CFAbsoluteTimeGetCurrent()
            img = Self.blur(snap, radius: spec.blur * c.scale, saturate: spec.saturate) ?? snap
            frostBlurMs += (CFAbsoluteTimeGetCurrent() - tb) * 1000
            c.blurred[key] = (c.gen, img)
        }

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
        fl.contentsRect = CGRect(x: (box.minX - c.rect.minX) / c.rect.width,
                                 y: (c.rect.maxY - box.maxY) / c.rect.height,
                                 width: box.width / c.rect.width,
                                 height: box.height / c.rect.height)
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
            c.ctx.draw(img, in: c.rect)
            c.ctx.restoreGState()
            c.dirty = c.dirty.union(box)
        }
    }

    /// ⚠ DORMANT BY DEFAULT — `DECLARE_FROST=1` turns it on.
    ///
    /// Everything below works and is measured (5fps → 49fps over seven steps; see
    /// memory project-mac-draw-framerate), but the composite it produces is still
    /// WRONG: `ctl frostdump` shows the whole UI over a dark ground with NO SKY,
    /// so most of weather's cards sample darkness and render flat dark where
    /// Chrome shows a light frosted panel. Shipping that on by default would make
    /// weather look worse than it does now.
    ///
    /// It ships anyway, switched off, for two reasons. The dead
    /// `backgroundFilters` call it replaces was costing ~2x WindowServer CPU for
    /// a frost this OS no longer draws (64% → 22% idle with it gone), so OFF here
    /// is already better than what came before — same invisible frost, none of
    /// the tax. And the `ctl frost*` diagnostics that come with it are what the
    /// next pass needs. Flip the flag to continue.
    static let frostEnabled = ProcessInfo.processInfo.environment["DECLARE_FROST"] != nil

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
            forEachNode { if group.set.contains(ObjectIdentifier($0)), let b = $0.backdrop { minBlur = min(minBlur, b.blur) } }
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
}

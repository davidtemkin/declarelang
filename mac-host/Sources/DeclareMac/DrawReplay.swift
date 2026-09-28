// DrawReplay — a recorded display list, replayed into Core Graphics.
//
// draw.ts records a plain-data op list in the Canvas2D vocabulary and BOTH web
// backends replay it. This is the third replayer, and it is nearly mechanical
// because Canvas2D *is* Quartz's imaging model with JS ergonomics (the canvas
// element was born at Apple over CoreGraphics). The gaps are enumerated in
// native-host.md §4: conic gradients (drawn by hand), `filter` (CoreImage — a
// blur pass here), and text (Core Text, which the measurer already matches).

import AppKit
import CoreGraphics
import CoreText

enum DrawReplay {
    // Blur in the ENCODED (sRGB) values, not linear light. CoreImage converts
    // to linear by default, which spreads energy from highlights far more than
    // a browser's canvas blur does — measured as visibly lifted blacks across
    // the whole wallpaper. A null working space means "operate on the numbers".
    private static let ciContext = CIContext(options: [.workingColorSpace: NSNull()])

    private struct State {
        var fill: Style = .color("#000")
        var stroke: Style = .color("#000")
        var lineWidth: CGFloat = 1
        var lineCap: CGLineCap = .butt
        var lineJoin: CGLineJoin = .miter
        var miterLimit: CGFloat = 10
        var dash: [CGFloat] = []
        var dashOffset: CGFloat = 0
        var alpha: CGFloat = 1
        var font = "13px system-ui"
        var textAlign = "left"
        var textBaseline = "alphabetic"
        var letterSpacing: CGFloat = 0
        var shadowColor: NSColor? = nil
        var shadowBlur: CGFloat = 0
        var shadowDx: CGFloat = 0
        var shadowDy: CGFloat = 0
        var filter = "none"
        /// The blend the FILTERED result must land with — canvas applies the
        /// composite op when the (filtered) drawing reaches the canvas, so a
        /// side layer has to carry it to the composite.
        var blend: CGBlendMode = .normal
        /// `imageSmoothingEnabled` / `imageSmoothingQuality`, as CG's
        /// interpolation: off is nearest-neighbour, canvas's default is low
        var smoothing: CGInterpolationQuality = .low
        var smoothingQuality: CGInterpolationQuality = .low
    }


    /// The PATH-CONSTRUCTION ops, shared by both consumers of a recording: the
    /// rasterizer here and `LayerDescribe`. ONE implementation on purpose — two
    /// would let a rounded corner or an ellipse sweep mean different things
    /// depending on which path a drawing happened to take, and that divergence
    /// is invisible until someone diffs pixels.
    ///
    /// `transform` is baked into each point as it is added. The rasterizer
    /// passes `.identity` because it concatenates the CTM into the context
    /// instead; the describer has no context and passes the live CTM.
    static func pathOp(_ r: Recording, _ i: Int, _ path: inout CGMutablePath,
                       _ cur: inout CGPoint, _ start: inout CGPoint,
                       transform m: CGAffineTransform) -> Bool {
        func d(_ k: Int) -> CGFloat { r.num(i, k) }
        let t = m
        switch r.code(i) {
        case DrawOp.beginPath: path = CGMutablePath()
        case DrawOp.closePath: path.closeSubpath(); cur = start
        case DrawOp.moveTo: cur = CGPoint(x: d(1), y: d(2)); start = cur; path.move(to: cur, transform: t)
        case DrawOp.lineTo: cur = CGPoint(x: d(1), y: d(2)); path.addLine(to: cur, transform: t)
        case DrawOp.bezierCurveTo:                          // [cp1x, cp1y, cp2x, cp2y, x, y]
            cur = CGPoint(x: d(5), y: d(6))
            path.addCurve(to: cur, control1: CGPoint(x: d(1), y: d(2)),
                          control2: CGPoint(x: d(3), y: d(4)), transform: t)
        case DrawOp.quadraticCurveTo:                       // [cpx, cpy, x, y]
            cur = CGPoint(x: d(3), y: d(4))
            path.addQuadCurve(to: cur, control: CGPoint(x: d(1), y: d(2)), transform: t)
        case DrawOp.arc:                                    // [x, y, r, a0, a1, ccw]
            // Canvas's flag is `counterclockwise` and CGPath's is `clockwise`,
            // but both mean "increasing angle" when false, and the path is built
            // in the recording's own numeric coordinates, so the flag passes
            // through.
            path.addArc(center: CGPoint(x: d(1), y: d(2)), radius: d(3),
                        startAngle: d(4), endAngle: d(5), clockwise: r.flag(i, 6), transform: t)
        case DrawOp.arcTo:                                  // [x1, y1, x2, y2, r]
            path.addArc(tangent1End: CGPoint(x: d(1), y: d(2)),
                        tangent2End: CGPoint(x: d(3), y: d(4)), radius: d(5), transform: t)
        case DrawOp.ellipse:                                // [x, y, rx, ry, rot, a0, a1, ccw]
            let e = CGAffineTransform(translationX: d(1), y: d(2))
                .rotated(by: d(5))
                .scaledBy(x: max(d(3), 0.0001), y: max(d(4), 0.0001))
            let a0 = d(6), a1 = d(7)
            let ccw = r.flag(i, 8)
            // Canvas's normalisation: sweep in the requested direction, and a
            // wrap of more than a full turn is clamped to a full turn.
            var delta = a1 - a0
            if ccw { if delta > 0 { delta -= 2 * .pi }; delta = max(delta, -2 * .pi) }
            else { if delta < 0 { delta += 2 * .pi }; delta = min(delta, 2 * .pi) }
            path.addRelativeArc(center: .zero, radius: 1, startAngle: a0,
                                delta: delta, transform: e.concatenating(t))
        case DrawOp.rect:
            path.addRect(CGRect(x: d(1), y: d(2), width: d(3), height: d(4)), transform: t)
        case DrawOp.roundRect:
            path.addPath(roundedPath(CGRect(x: d(1), y: d(2), width: d(3), height: d(4)), r.radii(i)),
                         transform: t)
        default: return false
        }
        return true
    }

    /// A recording as a bitmap at `density` device pixels per view unit, with
    /// the frame it covers (the recording's bounds). Runs on the RUNTIME
    /// thread: a drawing is finished on the Declare side of the line, as a
    /// canvas is on the page's thread in a browser, and main only shows it
    /// (Bridge `drawRaster`, LayerTree case 18).
    static func bitmap(_ rec: Recording, density: CGFloat, bridge: Bridge)
        -> (image: CGImage, geom: (x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, scale: CGFloat))? {
        let bx = rec.bx, by = rec.by, w = max(1, rec.bw), h = max(1, rec.bh)
        let s = density
        guard let cs = CGColorSpace(name: CGColorSpace.sRGB),
              let cg = CGContext(data: nil, width: Int(w * s), height: Int(h * s), bitsPerComponent: 8,
                                 bytesPerRow: 0, space: cs,
                                 bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        else { return nil }
        cg.scaleBy(x: s, y: s)
        // Flip into the model's y-down space, then shift so the recording's
        // own origin lands at the raster's corner.
        cg.translateBy(x: 0, y: h)
        cg.scaleBy(x: 1, y: -1)
        cg.translateBy(x: -bx, y: -by)
        let geom = (x: bx, y: by, w: w, h: h, scale: s)
        run(rec, in: cg, bridge: bridge, geom: geom)
        guard let img = cg.makeImage() else { return nil }
        return (img, geom)
    }

    /// `geom` is the raster's own frame in the recording's user space
    /// (origin + size + backing scale) — a filter layer must be built with the
    /// SAME setup so its pixels line up when composited back.
    static func run(_ rec: Recording, in cg: CGContext, bridge: Bridge,
                    geom: (x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, scale: CGFloat)) {
        var st = State()
        // A filter layer is part of the graphics STATE, not a separate stack:
        // canvas code ends a filtered run with `restore()` as often as with
        // `filter = "none"` (the wallpaper does), so save/restore must open and
        // close layers too — otherwise the filtered drawing is never composited
        // and the gstate stacks desync.
        var stack: [(state: State, filterDepth: Int)] = []
        var path = CGMutablePath()
        var start = CGPoint.zero
        var cur = CGPoint.zero
        // A filter (blur) applies to everything drawn under it — replay into a
        // side layer and composite it back through CoreImage.
        var filterLayers: [(CGContext, State)] = []
        // Each context's ORIGIN transform — the drawing's placement (offset ×
        // density, the flip). A recording's setTransform / resetTransform are
        // relative to it, as they are on the canvas a drawing has on the web,
        // and a filtered result lands at it.
        var origins: [ObjectIdentifier: CGAffineTransform] = [ObjectIdentifier(cg): cg.ctm]
        func origin(_ c: CGContext) -> CGAffineTransform { origins[ObjectIdentifier(c)] ?? c.ctm }
        func contexts() -> [CGContext] { [cg] + filterLayers.map { $0.0 } }
        func setCTM(_ c: CGContext, _ m: CGAffineTransform) { c.concatenate(c.ctm.inverted()); c.concatenate(m) }

        /// A side context congruent with the main raster: same pixel size, same
        /// user-space mapping, so compositing is a straight image draw.
        func makeCongruentLayer() -> CGContext? {
            guard let cs = CGColorSpace(name: CGColorSpace.sRGB),
                  let c2 = CGContext(data: nil, width: Int(geom.w * geom.scale), height: Int(geom.h * geom.scale),
                                     bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                                     bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
            else { return nil }
            c2.scaleBy(x: geom.scale, y: geom.scale)
            c2.translateBy(x: 0, y: geom.h)
            c2.scaleBy(x: 1, y: -1)
            c2.translateBy(x: -geom.x, y: -geom.y)
            origins[ObjectIdentifier(c2)] = c2.ctm
            return c2
        }

        /// Blur (CoreImage) and draw back into user space — the recording's own
        /// rect, flipped locally because CG draws images bottom-up.
        func composite(_ layer: CGContext, blur: String, blend2: CGBlendMode = .normal) {
            guard let img = layer.makeImage() else { return }
            let out = filtered(img, css: blur)
            guard let final = out else { return }
            let c = target()   // the scratch is already popped, so this is the destination
            c.saveGState()
            setCTM(c, origin(c))   // the image is the recording's whole rect, at its origin
            c.setBlendMode(blend2)
            c.translateBy(x: geom.x, y: geom.y + geom.h)
            c.scaleBy(x: 1, y: -1)
            c.draw(final, in: CGRect(x: 0, y: 0, width: geom.w, height: geom.h))
            c.restoreGState()
        }

        /// The whole CSS filter list over one op's pixels, in list order — the
        /// view chain's functions, in ENCODED sRGB (the null working space), a
        /// blur NOT clamped at the edge (see below) and a drop-shadow laid under
        /// what the chain has made so far. Lengths are device pixels, as
        /// canvas filter lengths are.
        func filtered(_ img: CGImage, css: String) -> CGImage? {
            let ci = CIImage(cgImage: img, options: [.colorSpace: NSNull()])
            let out = DrawReplay.applyChain(ci, FilterList(css: css).items, lengthScale: 1)
            return ciContext.createCGImage(out.cropped(to: ci.extent), from: ci.extent)
        }

        func target() -> CGContext { filterLayers.last?.0 ?? cg }

        /// Canvas applies `filter` to EACH drawing operation, not to a run of
        /// them: every shape is blurred on its own and then composited with the
        /// current operator. Blurring their union instead is measurably
        /// brighter wherever shapes overlap (lighten of blurs ≠ blur of
        /// lighten), so a filtered op gets its own scratch layer here.
        func marker0CTM() -> CGAffineTransform { target().ctm }
        func paint(_ body: (CGContext) -> Void) {
            guard !filterLayers.isEmpty, let scratch = makeCongruentLayer() else {
                body(target()); return
            }
            // the op draws under the transform in force, which rides the marker
            setCTM(scratch, marker0CTM())
            let marker = filterLayers.removeLast()      // so target() is the DESTINATION
            scratch.setAlpha(st.alpha)
            scratch.setBlendMode(.normal)
            body(scratch)
            composite(scratch, blur: marker.1.filter, blend2: st.blend)
            filterLayers.append(marker)                 // the filter is still in effect
        }

        func applyShadow(_ c: CGContext) {
            if let sc = st.shadowColor, sc.alphaComponent > 0, (st.shadowBlur > 0 || st.shadowDx != 0 || st.shadowDy != 0) {
                // ⚠ NEGATE Y. Core Graphics places a shadow in its own device
                // space, which is y-UP, while canvas states the offset y-DOWN —
                // so a positive shadowOffsetY landed ABOVE the shape here. The
                // MAGNITUDE needs no correction: CG does not put the CTM through
                // the offset, measured — a shadowOffsetX of 12 lands 12 device px
                // out under a backing scale of 2, matching Chrome exactly. Only
                // the sign was ever wrong, which is why the x cell passed and the
                // y extent was zero.
                // ⚠ NOT shadowBlur/2. Canvas defines its shadow as a gaussian of
                // sigma = shadowBlur/2, and it is tempting to read CG's `blur` as
                // that sigma — but CG's parameter behaves like the full extent,
                // so halving it blurred half as much. Measured on drawops:
                // Chrome's glow ramps over 12 device px where `/2` gave 4.
                c.setShadow(offset: CGSize(width: st.shadowDx, height: -st.shadowDy),
                            blur: st.shadowBlur, color: sc.cgColor)
            } else {
                c.setShadow(offset: .zero, blur: 0, color: nil)
            }
        }

        func paintGradient(_ c: CGContext, _ g: Gradient, clipTo: CGPath?, stroke: Bool) {
            let kind = g.kind, coords = g.coords, stops = g.stops
            let colors = stops.compactMap { CSSColor.parse($0.color)?.cgColor }
            let locs = stops.map { $0.offset }
            // NOT resampled into premultiplied space. CSS gradients interpolate
            // premultiplied, but CANVAS gradients do not — Skia's canvas shader
            // interpolates the components straight, which is what CGGradient
            // already does. Measured: forcing premultiplication here took the
            // desktop from 10.4% differing to 18.7%.
            guard colors.count >= 2,
                  let grad = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: colors as CFArray, locations: locs)
            else { return }
            c.saveGState()
            if let p = clipTo { c.addPath(p); if stroke { c.replacePathWithStrokedPath() }; c.clip() }
            if kind == "linear", coords.count >= 4 {
                c.drawLinearGradient(grad, start: CGPoint(x: coords[0], y: coords[1]),
                                     end: CGPoint(x: coords[2], y: coords[3]),
                                     options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
            } else if kind == "radial", coords.count >= 6 {
                c.drawRadialGradient(grad, startCenter: CGPoint(x: coords[0], y: coords[1]), startRadius: coords[2],
                                     endCenter: CGPoint(x: coords[3], y: coords[4]), endRadius: coords[5],
                                     options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
            } else if kind == "conic", coords.count >= 3 {
                // No CG primitive: sweep it as thin wedges (native-host.md §4).
                let cx = coords[1], cy = coords[2], a0 = coords[0]
                let r = max(c.boundingBoxOfClipPath.width, c.boundingBoxOfClipPath.height)
                // Wedge count follows the CIRCUMFERENCE, not a constant: a fixed
                // 180 gives 2-degree wedges, which is a couple of pixels at the
                // rim of a small gradient and a visible staircase at the rim of a
                // large one. About one wedge per two device pixels of arc keeps
                // the error under a level either way, and a small gradient does
                // not pay for a large one's resolution.
                let steps = max(180, min(2048, Int((2 * CGFloat.pi * r * geom.scale / 2).rounded())))
                // Wedges TILE, so antialiasing their shared edges is pure loss:
                // two abutting antialiased fills do not sum back to opaque, and
                // the seam between every pair showed up as a faint spoke across
                // the whole sweep. The outer rim is beyond the clip and the clip
                // antialiases on its own, so nothing visible is given up.
                c.setShouldAntialias(false)
                for i in 0..<steps {
                    let t0 = CGFloat(i) / CGFloat(steps), t1 = CGFloat(i + 1) / CGFloat(steps)
                    // sampled at the wedge's MIDPOINT, not its leading edge —
                    // free, and it halves the average hue error, because a wedge
                    // painted with its start colour lags the true sweep by half a
                    // wedge everywhere instead of being centred on it
                    let col = interpolate(stops: stops, at: (t0 + t1) / 2)
                    let wedge = CGMutablePath()
                    wedge.move(to: CGPoint(x: cx, y: cy))
                    wedge.addArc(center: CGPoint(x: cx, y: cy), radius: r,
                                 startAngle: a0 + t0 * 2 * .pi, endAngle: a0 + t1 * 2 * .pi + 0.01, clockwise: false)
                    wedge.closeSubpath()
                    c.setFillColor(col.cgColor)
                    c.addPath(wedge); c.fillPath()
                }
                c.setShouldAntialias(true)
            }
            c.restoreGState()
        }

        func interpolate(stops: [Gradient.Stop], at t: CGFloat) -> NSColor {
            var lo: (CGFloat, NSColor) = (0, .black), hi: (CGFloat, NSColor) = (1, .black)
            var found = false
            for s in stops {
                let off = s.offset
                let col = CSSColor.parse(s.color) ?? .black
                if off <= t { lo = (off, col) }
                if off >= t && !found { hi = (off, col); found = true }
            }
            let span = hi.0 - lo.0
            let f = span <= 0 ? 0 : (t - lo.0) / span
            return blend(lo.1, hi.1, f)
        }
        func blend(_ a: NSColor, _ b: NSColor, _ t: CGFloat) -> NSColor {
            let a1 = a.usingColorSpace(.sRGB) ?? a, b1 = b.usingColorSpace(.sRGB) ?? b
            return NSColor(srgbRed: a1.redComponent + (b1.redComponent - a1.redComponent) * t,
                           green: a1.greenComponent + (b1.greenComponent - a1.greenComponent) * t,
                           blue: a1.blueComponent + (b1.blueComponent - a1.blueComponent) * t,
                           alpha: a1.alphaComponent + (b1.alphaComponent - a1.alphaComponent) * t)
        }

        func setFillPaint(_ c: CGContext) {
            if let s = st.fill.color, let col = CSSColor.parse(s) { c.setFillColor(col.cgColor) }
        }
        func setStrokePaint(_ c: CGContext) {
            if let s = st.stroke.color, let col = CSSColor.parse(s) { c.setStrokeColor(col.cgColor) }
            c.setLineWidth(st.lineWidth)
            c.setLineCap(st.lineCap); c.setLineJoin(st.lineJoin); c.setMiterLimit(st.miterLimit)
            if st.dash.isEmpty { c.setLineDash(phase: 0, lengths: []) }
            else { c.setLineDash(phase: st.dashOffset, lengths: st.dash) }
        }

        for i in 0..<rec.count {
            let op = rec.code(i)
            func d(_ k: Int) -> CGFloat { rec.num(i, k) }
            let c = target()
            c.setAlpha(st.alpha)
            switch op {
            // The transform and the gstate stack belong to the DRAWING, so they
            // move every context at once: the main raster and each filter layer
            // open under it. A transform made while a filter is in force still
            // holds after `filter = "none"`, and a layer opened after a save is
            // closed (not restored) by the matching restore.
            case DrawOp.save:
                stack.append((st, filterLayers.count))
                for x in contexts() { x.saveGState() }
            case DrawOp.restore:
                if let saved = stack.popLast() {
                    while filterLayers.count > saved.filterDepth { _ = filterLayers.popLast() }
                    st = saved.state
                }
                for x in contexts() { x.restoreGState() }
            case DrawOp.translate: for x in contexts() { x.translateBy(x: d(1), y: d(2)) }
            case DrawOp.scale: for x in contexts() { x.scaleBy(x: d(1), y: d(2)) }
            case DrawOp.rotate: for x in contexts() { x.rotate(by: d(1)) }
            case DrawOp.transform, DrawOp.setTransform:
                let t = rec.matrix(i)
                for x in contexts() { if op == DrawOp.transform { x.concatenate(t) } else { setCTM(x, t.concatenating(origin(x))) } }
            case DrawOp.resetTransform:
                for x in contexts() { setCTM(x, origin(x)) }
            case DrawOp.fillStyle, DrawOp.fillGrad: st.fill = rec.style(i)
            case DrawOp.strokeStyle, DrawOp.strokeGrad: st.stroke = rec.style(i)
            case DrawOp.set:
                switch rec.setKey(i) {
                case "lineWidth": st.lineWidth = rec.setNumber(i)
                case "lineCap": let v = rec.setString(i); st.lineCap = v == "round" ? .round : (v == "square" ? .square : .butt)
                case "lineJoin": let v = rec.setString(i); st.lineJoin = v == "round" ? .round : (v == "bevel" ? .bevel : .miter)
                case "miterLimit": st.miterLimit = rec.setNumber(i)
                case "lineDashOffset": st.dashOffset = rec.setNumber(i)
                case "globalAlpha": st.alpha = rec.setNumber(i)
                case "shadowBlur": st.shadowBlur = rec.setNumber(i)
                case "shadowColor": st.shadowColor = rec.setString(i).flatMap { CSSColor.parse($0) }
                case "shadowOffsetX": st.shadowDx = rec.setNumber(i)
                case "shadowOffsetY": st.shadowDy = rec.setNumber(i)
                case "font": st.font = rec.setString(i) ?? st.font
                case "textAlign": st.textAlign = rec.setString(i) ?? "left"
                case "textBaseline": st.textBaseline = rec.setString(i) ?? "alphabetic"
                case "imageSmoothingEnabled": st.smoothing = (rec.setBool(i) ?? true) ? st.smoothingQuality : .none
                case "imageSmoothingQuality":
                    let q: CGInterpolationQuality = { switch rec.setString(i) { case "high": return .high; case "medium": return .medium; default: return .low } }()
                    if st.smoothing != .none { st.smoothing = q }
                    st.smoothingQuality = q
                case "letterSpacing": st.letterSpacing = CGFloat(Double((rec.setString(i) ?? "0").replacingOccurrences(of: "px", with: "")) ?? 0)
                case "globalCompositeOperation":
                    st.blend = blendMode(rec.setString(i) ?? "source-over")
                    // The blend applies INSIDE a filter layer as well. Canvas
                    // draws each filtered shape straight onto the canvas with
                    // this operator, so blobs must combine by the operator
                    // (lighten = a max) rather than by ordinary alpha
                    // compositing — which is what made the wallpaper dim.
                    c.setBlendMode(st.blend)
                case "filter":
                    let v = rec.setString(i) ?? "none"
                    if v == "none" || v.isEmpty {
                        // The marker carries no pixels (paint() composited each
                        // op already) — just drop it.
                        _ = filterLayers.popLast()
                        st.filter = "none"
                        target().setBlendMode(st.blend)
                    } else {
                        st.filter = v
                        // A marker layer: its presence means "filtered", and
                        // paint() gives each op its own scratch.
                        if let layer = makeCongruentLayer() {
                            setCTM(layer, target().ctm)   // the transform in force carries into the filtered run
                            filterLayers.append((layer, st))
                        }
                    }
                default: break
                }
            case DrawOp.setLineDash:                        // [n, …segments]
                st.dash = rec.numbers(i, from: 2, count: Int(d(1)))
            case DrawOp.beginPath, DrawOp.closePath, DrawOp.moveTo, DrawOp.lineTo, DrawOp.bezierCurveTo,
                 DrawOp.quadraticCurveTo, DrawOp.arc, DrawOp.arcTo, DrawOp.ellipse, DrawOp.rect, DrawOp.roundRect:
                _ = pathOp(rec, i, &path, &cur, &start, transform: .identity)
            case DrawOp.fill:
                let evenOdd = rec.evenOdd(i, 1)
                paint { t in
                    applyShadow(t); setFillPaint(t)
                    if let g = st.fill.gradient { paintGradient(t, g, clipTo: path, stroke: false) }
                    else {
                        t.addPath(path)
                        if evenOdd { t.fillPath(using: .evenOdd) } else { t.fillPath() }
                    }
                }
            case DrawOp.stroke:
                paint { t in
                    applyShadow(t); setStrokePaint(t)
                    if let g = st.stroke.gradient { paintGradient(t, g, clipTo: path, stroke: true) }
                    else { t.addPath(path); t.strokePath() }
                }
            case DrawOp.clip:
                c.addPath(path)
                if rec.evenOdd(i, 1) { c.clip(using: .evenOdd) } else { c.clip() }
            case DrawOp.fillRect:
                let r = CGRect(x: d(1), y: d(2), width: d(3), height: d(4))
                paint { t in
                    applyShadow(t); setFillPaint(t)
                    if let g = st.fill.gradient { paintGradient(t, g, clipTo: CGPath(rect: r, transform: nil), stroke: false) }
                    else { t.fill(r) }
                }
            case DrawOp.strokeRect:
                let r = CGRect(x: d(1), y: d(2), width: d(3), height: d(4))
                paint { t in
                    applyShadow(t); setStrokePaint(t)
                    t.stroke(r)
                }
            case DrawOp.clearRect:
                c.clear(CGRect(x: d(1), y: d(2), width: d(3), height: d(4)))
            case DrawOp.fillText, DrawOp.strokeText:        // [s, x, y, maxWidth]
                let stroke = op == DrawOp.strokeText
                // a gradient style paints THROUGH the glyphs (they become the clip)
                let grad = (stroke ? st.stroke : st.fill).gradient
                let text = rec.str(i, 1), at = CGPoint(x: d(2), y: d(3))
                paint { t in
                    applyShadow(t)
                    drawText(text, at: at, state: st, in: t, stroke: stroke,
                             gradient: grad.map { g in { ctx in paintGradient(ctx, g, clipTo: nil, stroke: false) } })
                }
            case DrawOp.drawImage:                          // [h, sx, sy, sw, sh, dx, dy, dw, dh]
                // the handle is the bridge's own (the Mac env's <img> shim
                // carries it); the source rect is bitmap pixels, y-DOWN from
                // the top as canvas states it — and `CGImage.cropping(to:)`
                // takes its rect from the image's TOP-left too, so it passes
                // straight through (mirroring it cut the wrong band)
                guard let full = bridge.image(Int(d(1))) else { break }
                let src = CGRect(x: d(2), y: d(3), width: d(4), height: d(5))
                let whole = src == CGRect(x: 0, y: 0, width: CGFloat(full.width), height: CGFloat(full.height))
                guard let img = whole ? full : full.cropping(to: src) else { break }
                let dst = CGRect(x: d(6), y: d(7), width: d(8), height: d(9))
                paint { t in
                    applyShadow(t)
                    t.saveGState()
                    t.translateBy(x: dst.minX, y: dst.maxY)
                    t.scaleBy(x: 1, y: -1)          // CG draws images bottom-up; flip locally
                    t.interpolationQuality = st.smoothing
                    t.draw(img, in: CGRect(x: 0, y: 0, width: dst.width, height: dst.height))
                    t.restoreGState()
                }
            default:
                break
            }
        }
        // Any filter left open at the end still composites.
        filterLayers.removeAll()
    }

    /// A filter list over an image, in list order, in ENCODED sRGB (the caller's
    /// unmanaged context): the view chain's functions, a blur NOT clamped at
    /// the edge (canvas and CSS filters follow the SVG model — outside the
    /// source is transparent black; clamping extended the edge pixels and left
    /// the wallpaper visibly brighter in a band round the screen), and a
    /// drop-shadow laid under what the chain has made so far. `lengthScale`
    /// turns the list's lengths into the image's pixels: 1 for a drawing
    /// (canvas filter lengths are device pixels), the backing scale for a view
    /// (whose lengths are view units). CIGaussianBlur's radius IS the standard
    /// deviation, as CSS `blur(<length>)` is.
    static func applyChain(_ input: CIImage, _ items: [FilterFn], lengthScale k: CGFloat) -> CIImage {
        var ci = input
        for f in items {
            if f.fn == "shadow" {
                guard let color = f.color, let tint = FilterList.tintMatrix(color) else { continue }
                tint.setValue(ci, forKey: kCIInputImageKey)
                var sh = tint.outputImage ?? ci
                if f.blur > 0, let g = CIFilter(name: "CIGaussianBlur") {
                    // a shadow's length is a blur RADIUS: its deviation is half
                    g.setValue(sh, forKey: kCIInputImageKey); g.setValue(f.blur * k / 2, forKey: kCIInputRadiusKey)
                    sh = g.outputImage ?? sh
                }
                sh = sh.transformed(by: CGAffineTransform(translationX: f.dx * k, y: -f.dy * k))   // CI is y-up
                ci = ci.composited(over: sh)
            } else if let flt = FilterList.filter(f, blurScale: k) {
                flt.setValue(ci, forKey: kCIInputImageKey)
                ci = flt.outputImage ?? ci
            }
        }
        return ci
    }

    private static func roundedPath(_ r: CGRect, _ radii: [CGFloat]) -> CGPath {
        let all = radii.count == 1 ? Array(repeating: radii[0], count: 4) : radii
        let tl = all.count > 0 ? all[0] : 0, tr = all.count > 1 ? all[1] : tl
        let br = all.count > 2 ? all[2] : tl, bl = all.count > 3 ? all[3] : tr
        let p = CGMutablePath()
        p.move(to: CGPoint(x: r.minX + tl, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX - tr, y: r.minY))
        p.addArc(tangent1End: CGPoint(x: r.maxX, y: r.minY), tangent2End: CGPoint(x: r.maxX, y: r.minY + tr), radius: tr)
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY - br))
        p.addArc(tangent1End: CGPoint(x: r.maxX, y: r.maxY), tangent2End: CGPoint(x: r.maxX - br, y: r.maxY), radius: br)
        p.addLine(to: CGPoint(x: r.minX + bl, y: r.maxY))
        p.addArc(tangent1End: CGPoint(x: r.minX, y: r.maxY), tangent2End: CGPoint(x: r.minX, y: r.maxY - bl), radius: bl)
        p.addLine(to: CGPoint(x: r.minX, y: r.minY + tl))
        p.addArc(tangent1End: CGPoint(x: r.minX, y: r.minY), tangent2End: CGPoint(x: r.minX + tl, y: r.minY), radius: tl)
        p.closeSubpath()
        return p
    }

    private static func drawText(_ text: String, at p: CGPoint, state st: State, in c: CGContext, stroke: Bool,
                                 gradient: ((CGContext) -> Void)? = nil) {
        guard !text.isEmpty else { return }
        let f = TextEngine.nsFont(TextEngine.parse(st.font))
        var attrs: [NSAttributedString.Key: Any] = [.font: f]
        if let s = st.fill.color, let col = CSSColor.parse(s) { attrs[.foregroundColor] = col }
        if st.letterSpacing != 0 { attrs[.kern] = st.letterSpacing }
        // STROKED text strokes the outline in strokeStyle at lineWidth; it does not
        // fill. Core Text takes that from the context's text drawing mode.
        if stroke {
            if let s = st.stroke.color, let col = CSSColor.parse(s) { c.setStrokeColor(col.cgColor) }
            c.setLineWidth(st.lineWidth)
            c.setTextDrawingMode(.stroke)
            // Core Text strokes in the run's own colour (black by default) unless
            // told to take the context's — which holds the strokeStyle
            attrs[NSAttributedString.Key(kCTForegroundColorFromContextAttributeName as String)] = true
        } else {
            c.setTextDrawingMode(.fill)
        }
        let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attrs))
        var asc: CGFloat = 0, desc: CGFloat = 0, lead: CGFloat = 0
        let w = CTLineGetTypographicBounds(line, &asc, &desc, &lead)
        var x = p.x
        if st.textAlign == "center" { x -= CGFloat(w) / 2 }
        else if st.textAlign == "right" || st.textAlign == "end" { x -= CGFloat(w) }
        var y = p.y
        switch st.textBaseline {
        case "top", "hanging": y += asc
        case "middle": y += (asc - desc) / 2
        case "bottom", "ideographic": y -= desc
        default: break   // alphabetic
        }
        c.saveGState()
        // The raster is y-down; text must be drawn in a y-up frame at the
        // baseline, so flip locally around it.
        c.translateBy(x: x, y: y)
        c.scaleBy(x: 1, y: -1)
        c.textPosition = .zero
        if let gradient {
            // the glyphs (or their stroked outline) become the clip, then the
            // gradient paints through them in the recording's own space; a
            // shadow belongs to the painted shape, so it rides the gradient
            // inside a transparency layer, which lands with the shadow: a shadow
            // set on the clipped gradient itself would be clipped away with it
            c.beginTransparencyLayer(auxiliaryInfo: nil)
            c.saveGState()
            c.setTextDrawingMode(stroke ? .strokeClip : .clip)
            CTLineDraw(line, c)
            c.scaleBy(x: 1, y: -1)
            c.translateBy(x: -x, y: -y)
            gradient(c)
            c.restoreGState()
            c.endTransparencyLayer()
        } else {
            CTLineDraw(line, c)
        }
        c.restoreGState()
    }

    private static func blendMode(_ s: String) -> CGBlendMode {
        switch s {
        case "source-over": return .normal
        case "multiply": return .multiply
        case "screen": return .screen
        case "overlay": return .overlay
        case "darken": return .darken
        case "lighten": return .lighten
        case "color-dodge": return .colorDodge
        case "color-burn": return .colorBurn
        case "hard-light": return .hardLight
        case "soft-light": return .softLight
        case "difference": return .difference
        case "exclusion": return .exclusion
        case "hue": return .hue
        case "saturation": return .saturation
        case "color": return .color
        case "luminosity": return .luminosity
        case "destination-out": return .destinationOut
        case "destination-in": return .destinationIn
        case "source-in": return .sourceIn
        case "source-atop": return .sourceAtop
        case "copy": return .copy
        case "xor": return .xor
        default: return .normal
        }
    }
}

/// CSS colors → NSColor. The runtime hands the backend already-resolved CSS
/// strings (colorToCss), so this covers exactly what it emits: #rgb, #rrggbb,
/// #rrggbbaa, rgb()/rgba(), and the named set the language allows.
enum CSSColor {
    // reached from main and from the runtime thread (DrawReplay.bitmap), so
    // one lock guards the cache
    private static var cache: [String: NSColor] = [:]
    private static let lock = NSLock()

    static func parse(_ s: String) -> NSColor? {
        lock.lock()
        if let c = cache[s] { lock.unlock(); return c }
        lock.unlock()
        guard let c = compute(s) else { return nil }
        lock.lock()
        if cache.count > 1024 { cache.removeAll() }
        cache[s] = c
        lock.unlock()
        return c
    }

    private static func compute(_ raw: String) -> NSColor? {
        let s = raw.trimmingCharacters(in: .whitespaces).lowercased()
        if s == "transparent" || s == "none" { return NSColor.clear }
        if s.hasPrefix("#") {
            let hex = String(s.dropFirst())
            func v(_ i: Int, _ len: Int) -> CGFloat {
                let start = hex.index(hex.startIndex, offsetBy: i)
                let end = hex.index(start, offsetBy: len)
                let part = len == 1 ? String(repeating: String(hex[start..<end]), count: 2) : String(hex[start..<end])
                return CGFloat(UInt8(part, radix: 16) ?? 0) / 255
            }
            switch hex.count {
            case 3: return NSColor(srgbRed: v(0,1), green: v(1,1), blue: v(2,1), alpha: 1)
            case 4: return NSColor(srgbRed: v(0,1), green: v(1,1), blue: v(2,1), alpha: v(3,1))
            case 6: return NSColor(srgbRed: v(0,2), green: v(2,2), blue: v(4,2), alpha: 1)
            case 8: return NSColor(srgbRed: v(0,2), green: v(2,2), blue: v(4,2), alpha: v(6,2))
            default: return nil
            }
        }
        // hsl()/hsla() — the generative wallpaper's palette is authored in HSL,
        // and a color the parser cannot read silently drops a gradient stop.
        if s.hasPrefix("hsl") {
            let inner = s.drop(while: { $0 != "(" }).dropFirst().prefix(while: { $0 != ")" })
            let parts = inner.split(whereSeparator: { $0 == "," || $0 == " " || $0 == "/" }).map { String($0) }
            guard parts.count >= 3 else { return nil }
            let h = (Double(parts[0].replacingOccurrences(of: "deg", with: "")) ?? 0) / 360
            let sat = (Double(parts[1].replacingOccurrences(of: "%", with: "")) ?? 0) / 100
            let l = (Double(parts[2].replacingOccurrences(of: "%", with: "")) ?? 0) / 100
            var a = 1.0
            if parts.count > 3 {
                let raw = parts[3]
                a = (Double(raw.replacingOccurrences(of: "%", with: "")) ?? 1) / (raw.hasSuffix("%") ? 100 : 1)
            }
            // HSL → RGB (CSS Color 3 §4.2.4)
            func hue(_ p: Double, _ q: Double, _ tIn: Double) -> Double {
                var t = tIn
                if t < 0 { t += 1 }; if t > 1 { t -= 1 }
                if t < 1.0 / 6 { return p + (q - p) * 6 * t }
                if t < 1.0 / 2 { return q }
                if t < 2.0 / 3 { return p + (q - p) * (2.0 / 3 - t) * 6 }
                return p
            }
            if sat == 0 { return NSColor(srgbRed: CGFloat(l), green: CGFloat(l), blue: CGFloat(l), alpha: CGFloat(a)) }
            let q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat
            let p = 2 * l - q
            return NSColor(srgbRed: CGFloat(hue(p, q, h + 1.0 / 3)), green: CGFloat(hue(p, q, h)),
                           blue: CGFloat(hue(p, q, h - 1.0 / 3)), alpha: CGFloat(a))
        }
        if s.hasPrefix("rgb") {
            let inner = s.drop(while: { $0 != "(" }).dropFirst().prefix(while: { $0 != ")" })
            let parts = inner.split(whereSeparator: { $0 == "," || $0 == " " || $0 == "/" }).map { String($0) }
            guard parts.count >= 3 else { return nil }
            func comp(_ i: Int) -> CGFloat {
                let p = parts[i]
                if p.hasSuffix("%") { return CGFloat(Double(p.dropLast()) ?? 0) / 100 }
                return CGFloat(Double(p) ?? 0) / 255
            }
            let a = parts.count > 3 ? CGFloat(Double(parts[3].replacingOccurrences(of: "%", with: "")) ?? 1) : 1
            return NSColor(srgbRed: comp(0), green: comp(1), blue: comp(2), alpha: parts.count > 3 && parts[3].hasSuffix("%") ? a / 100 : a)
        }
        return named[s]
    }

    private static let named: [String: NSColor] = {
        var m: [String: NSColor] = [:]
        let table: [(String, UInt32)] = [
            ("black", 0x000000), ("white", 0xFFFFFF), ("red", 0xFF0000), ("green", 0x008000),
            ("blue", 0x0000FF), ("gray", 0x808080), ("grey", 0x808080), ("silver", 0xC0C0C0),
            ("maroon", 0x800000), ("olive", 0x808000), ("lime", 0x00FF00), ("aqua", 0x00FFFF),
            ("cyan", 0x00FFFF), ("teal", 0x008080), ("navy", 0x000080), ("fuchsia", 0xFF00FF),
            ("magenta", 0xFF00FF), ("purple", 0x800080), ("yellow", 0xFFFF00), ("orange", 0xFFA500),
            ("pink", 0xFFC0CB), ("brown", 0xA52A2A), ("gold", 0xFFD700), ("indigo", 0x4B0082),
            ("violet", 0xEE82EE), ("tomato", 0xFF6347), ("royalblue", 0x4169E1), ("seagreen", 0x2E8B57),
            ("whitesmoke", 0xF5F5F5), ("gainsboro", 0xDCDCDC), ("darkslategray", 0x2F4F4F),
            ("dimgray", 0x696969), ("lightgray", 0xD3D3D3), ("lightgrey", 0xD3D3D3),
            ("steelblue", 0x4682B4), ("slategray", 0x708090), ("crimson", 0xDC143C),
            ("coral", 0xFF7F50), ("salmon", 0xFA8072), ("khaki", 0xF0E68C), ("plum", 0xDDA0DD),
            ("orchid", 0xDA70D6), ("turquoise", 0x40E0D0), ("skyblue", 0x87CEEB),
            ("midnightblue", 0x191970), ("forestgreen", 0x228B22), ("firebrick", 0xB22222),
        ]
        for (n, v) in table {
            m[n] = NSColor(srgbRed: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255,
                           blue: CGFloat(v & 255) / 255, alpha: 1)
        }
        return m
    }()
}

/// Gradient stops, resampled the way canvas interpolates them.
///
/// Canvas (and CSS) interpolate gradient stops in PREMULTIPLIED alpha: a run
/// from an opaque colour to `rgba(0,0,0,0)` holds its hue and just fades out.
/// CGGradient and CAGradientLayer interpolate the four components
/// independently, so the same run slides toward black while it fades — every
/// blob in the desktop's wallpaper darkened through its outer half, which read
/// as broad rings of error across the whole field.
///
/// Resampling into closely-spaced stops computed in premultiplied space makes
/// the two agree without needing either API to change its interpolation.
enum GradientStops {
    /// The stops as Core Animation should be handed them. CAGradientLayer
    /// interpolates in LINEAR light, where the web interpolates the encoded
    /// sRGB values — a green-to-orange ramp came out visibly lighter through
    /// its middle on the Mac, and every gradient differed. So each segment is
    /// sampled in sRGB (premultiplied for a CSS gradient; straight for a
    /// canvas one, which Skia interpolates straight) into short runs that
    /// linear interpolation cannot bend. A hard stop (two stops at one
    /// position) stays hard: samples are taken per segment, never across one.
    static func resampled(colors: [CGColor], locations: [CGFloat], perSegment: Int = 16,
                          premultiplied: Bool = true) -> ([CGColor], [CGFloat]) {
        guard colors.count == locations.count, colors.count >= 2 else { return (colors, locations) }
        let space = CGColorSpace(name: CGColorSpace.sRGB)!
        let pts: [(l: CGFloat, r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat)] =
            zip(locations, colors).map { (loc, c) in
                let s = c.converted(to: space, intent: .defaultIntent, options: nil) ?? c
                let comp = s.components ?? [0, 0, 0, 1]
                let a = s.alpha
                if s.numberOfComponents >= 4 { return (loc, comp[0], comp[1], comp[2], a) }
                let v = comp.first ?? 0
                return (loc, v, v, v, a)
            }
        var outC: [CGColor] = [], outL: [CGFloat] = []
        func emit(_ p0: (l: CGFloat, r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat),
                  _ p1: (l: CGFloat, r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat), _ u: CGFloat) {
            let a = p0.a + (p1.a - p0.a) * u
            var comps: [CGFloat]
            if premultiplied {
                let pr = p0.r * p0.a + (p1.r * p1.a - p0.r * p0.a) * u
                let pg = p0.g * p0.a + (p1.g * p1.a - p0.g * p0.a) * u
                let pb = p0.b * p0.a + (p1.b * p1.a - p0.b * p0.a) * u
                comps = a > 0.0001 ? [pr / a, pg / a, pb / a, a] : [0, 0, 0, 0]
            } else {
                comps = [p0.r + (p1.r - p0.r) * u, p0.g + (p1.g - p0.g) * u, p0.b + (p1.b - p0.b) * u, a]
            }
            if let c = CGColor(colorSpace: space, components: comps) { outC.append(c); outL.append(p0.l + (p1.l - p0.l) * u) }
        }
        for i in 0..<(pts.count - 1) {
            let p0 = pts[i], p1 = pts[i + 1]
            if p1.l - p0.l <= 0 { emit(p0, p0, 0); continue }        // a hard stop: its own colour, then the next
            for j in 0..<perSegment { emit(p0, p1, CGFloat(j) / CGFloat(perSegment)) }
        }
        emit(pts[pts.count - 1], pts[pts.count - 1], 0)
        return outC.count >= 2 ? (outC, outL) : (colors, locations)
    }
}

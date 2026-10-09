// LayerDescribe — a recording expressed as CALayer primitives instead of pixels.
//
// WHY THIS EXISTS. Rasterizing a drawing costs O(pixels) on the CPU: measured
// at 141 Mpx/s, which is what Skia's CPU rasterizer also costs, so there is no
// tuning left in it. Both browsers beat it 20-35x by not rasterizing on the CPU
// at all. The Mac-native way to reach the GPU without a private API, a shader,
// or a third-party engine is to stop handing the compositor PIXELS and start
// handing it a DESCRIPTION — a path, a few colours — which the window server
// renders itself.
//
// The property that makes this the right answer rather than a trick: a
// description is resolution-independent. A cached bitmap is only correct at the
// size it was made (downscaling resamples an image already antialiased against
// the wrong pixel grid), which is why bitmap caching was rejected — see
// docs/system-design/adaptive-draw-cache.md. A CAShapeLayer under a transform
// re-rasterizes the PATH, so it stays exact at every size. That is the whole
// argument.
//
// NOT ONE LAYER PER MARK. A CAShapeLayer holds a COMPOUND path, so consecutive
// marks sharing their paint state merge into one. Measured on the corpus: the
// dock's 242 strokes need 2 layers, weather's sky needs 2, and the most ornate
// icon in either app needs 14.
//
// Anything this cannot express returns nil and the caller rasterizes exactly as
// before. That is a scaffold, not a destination: every `return nil` below is a
// gap to close, not a permanent fork.

import AppKit

enum LayerDescribe {

    /// Paint state a CAShapeLayer can carry. Two marks can share a layer only
    /// when every field here matches — this is the run key.
    /// A canvas shadow, as a layer can carry it. Offsets and blur are DEVICE
    /// space in canvas (they ignore the CTM — measured), while CALayer's are
    /// layer points, so they are divided by the backing scale at build time.
    struct ShadowSpec: Equatable {
        var color: String
        var blur: CGFloat
        var dx: CGFloat
        var dy: CGFloat
    }
    private struct Paint: Equatable {
        var isStroke = false
        var color: String = "#000"
        /// Shadow, when live at the mark — see ShadowSpec.
        var shadow: ShadowSpec? = nil
        /// A shadowed mark is its OWN layer, never merged into a run: canvas
        /// shadows each drawing operation separately, so a later mark's shadow
        /// falls ON an earlier mark's fill, and a compound path's single shadow
        /// cannot say that (it never falls inside the union). The nonce makes
        /// two shadowed paints unequal even when everything else matches.
        var nonce: Int = 0
        var gradient: Gradient? = nil
        var lineWidth: CGFloat = 1
        var cap: CGLineCap = .butt
        var join: CGLineJoin = .miter
        var miterLimit: CGFloat = 10
        var dash: [CGFloat] = []
        var dashOffset: CGFloat = 0
        var alpha: CGFloat = 1
        var evenOdd = false
    }

    private struct State {
        var fill: Style = .color("#000")
        var stroke: Style = .color("#000")
        var lineWidth: CGFloat = 1
        var cap: CGLineCap = .butt
        var join: CGLineJoin = .miter
        var miterLimit: CGFloat = 10
        var dash: [CGFloat] = []
        var dashOffset: CGFloat = 0
        var alpha: CGFloat = 1
        var ctm: CGAffineTransform = .identity
        var shadowColor: String? = nil
        var shadowBlur: CGFloat = 0
        var shadowDx: CGFloat = 0
        var shadowDy: CGFloat = 0
    }

    /// Can a gradient be expressed as a CAGradientLayer at all? Checked at
    /// MARK time, not at layer-construction time — see `failed` below for why
    /// that distinction cost a probe.
    private static func expressible(_ g: Gradient) -> Bool {
        let coords = g.coords
        guard g.stops.count >= 2 else { return false }
        switch g.kind {
        case "linear": return coords.count >= 4
        case "radial":
            // ⚠ CAGradientLayer's radial is ONE circle grown from a centre.
            // Canvas's is TWO — a focal gradient with its own start centre and
            // start radius — and there is no layer equivalent. Mapping those
            // anyway took the `vignette` probe (two circles, different centres,
            // which is how the desktop wallpaper is shaded) from 0.01% to 7.33%
            // differing against Chrome.
            guard coords.count >= 6 else { return false }
            return coords[2] == 0 && coords[0] == coords[3] && coords[1] == coords[4] && coords[5] > 0
        default: return false            // conic: swept by hand in the raster
        }
    }

    /// Try to express `list` as layers sized to the recording's own bounds.
    /// Returns nil when the recording uses anything not yet expressible, and
    /// the caller must rasterize.
    /// Can `list` be described at all? The same walk and the same refusals as
    /// `describe`, building nothing — the runtime thread asks this for every
    /// drawing it finishes (Bridge `drawRaster`), and building layers there only
    /// to throw them away was most of what finishing a drawing cost.
    static func describable(_ rec: Recording, scale: CGFloat) -> Bool {
        describe(rec, scale: scale, build: false) != nil
    }

    static func describe(_ rec: Recording, scale: CGFloat, build: Bool = true) -> (layers: [CALayer], w: CGFloat, h: CGFloat,
                                                                    bx: CGFloat, by: CGFloat)? {
        guard rec.count > 0 else { return nil }
        let bx = rec.bx, by = rec.by
        let w = max(1, rec.bw), h = max(1, rec.bh)

        // The recording is y-DOWN from its own origin; a layer's own space is
        // y-up from its bottom-left. Bake the flip into every point, which is
        // the same mapping the rasterizer builds into its context.
        let flip = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: -bx, ty: h + by)

        var st = State()
        var stack: [State] = []
        var path = CGMutablePath()
        var cur = CGPoint.zero, start = CGPoint.zero

        var layers: [CALayer] = []
        var runPaint: Paint? = nil
        var runPath = CGMutablePath()
        /// A run we cannot build must abandon the ENTIRE recording, not be
        /// quietly skipped. Dropping one run described the rest and simply lost
        /// that paint — the vignette probe rendered its white base and no
        /// gradient at all, 8.4pt structural, which is a missing capability
        /// wearing the costume of a rounding error. All or nothing.
        var failed = false

        var runs = 0
        func flush() {
            guard let p = runPaint, !runPath.isEmpty else { runPaint = nil; runPath = CGMutablePath(); return }
            if !build {
                if canMake(p, runPath, flip: flip) { runs += 1 } else { failed = true }
            } else if let l = makeLayer(p, runPath, w: w, h: h, flip: flip, scale: scale) { layers.append(l) }
            else { failed = true }
            runPaint = nil
            runPath = CGMutablePath()
        }
        /// Append one mark's geometry to the current run, starting a new run
        /// when the paint differs. This is where 242 strokes become 2 layers.
        func mark(_ p: Paint, _ geom: CGPath) {
            if runPaint != p { flush(); runPaint = p }
            runPath.addPath(geom)
        }
        var shadowNonce = 0
        func paintFor(stroke: Bool, evenOdd: Bool = false) -> Paint? {
            let src = stroke ? st.stroke : st.fill
            var p = Paint()
            p.isStroke = stroke
            p.alpha = st.alpha
            p.evenOdd = evenOdd
            // a shadow is live when its colour has any alpha and it has any
            // extent — the same test the rasterizer's applyShadow makes
            if let sc = st.shadowColor, let c = CSSColor.parse(sc), c.alphaComponent > 0,
               st.shadowBlur > 0 || st.shadowDx != 0 || st.shadowDy != 0 {
                // a gradient paint is a mask over a gradient layer, and the mask
                // draws no shadow of its own; that shape keeps the raster path
                if src.gradient != nil { return nil }
                shadowNonce += 1
                // the drawing's units, resolved through its own transform into the
                // layer's points (the CTM is baked into the path points the same way)
                let m = st.ctm
                p.shadow = ShadowSpec(color: sc, blur: st.shadowBlur * abs(m.a * m.d - m.b * m.c).squareRoot(),
                                      dx: m.a * st.shadowDx + m.c * st.shadowDy, dy: m.b * st.shadowDx + m.d * st.shadowDy)
                p.nonce = shadowNonce
            }
            switch src {
            case .gradient(let g):
                guard expressible(g) else { return nil }
                p.gradient = g
            case .color(let s):
                p.color = s
            }
            if stroke {
                // ⚠ A STROKE IS SCALED BY THE CTM. The rasterizer concatenates
                // the CTM into the context, so `strokePath()` widens the pen
                // along with the geometry. Here the CTM is baked into the PATH
                // POINTS instead, so the pen must be widened by hand — passing
                // lineWidth through unscaled drew every transformed stroke too
                // thin, which is what made the dock's glyphs spindly.
                //
                // CAShapeLayer has ONE lineWidth, so it can only express a pen
                // that stays circular: uniform scale (with rotation) yes,
                // anisotropic scale no. Refuse what it cannot say.
                let m = st.ctm
                let sx = (m.a * m.a + m.b * m.b).squareRoot()
                let sy = (m.c * m.c + m.d * m.d).squareRoot()
                guard sx > 0, sy > 0, abs(sx - sy) <= 0.001 * max(sx, sy) else { return nil }
                p.lineWidth = st.lineWidth * sx
                p.cap = st.cap; p.join = st.join
                p.miterLimit = st.miterLimit
                p.dash = st.dash.map { $0 * sx }
                p.dashOffset = st.dashOffset * sx
            }
            return p
        }

        for i in 0..<rec.count {
            func d(_ k: Int) -> CGFloat { rec.num(i, k) }

            if DrawReplay.pathOp(rec, i, &path, &cur, &start, transform: st.ctm) { continue }

            switch rec.code(i) {
            case DrawOp.save: stack.append(st)
            case DrawOp.restore: if let s = stack.popLast() { st = s }
            case DrawOp.fillStyle, DrawOp.fillGrad: st.fill = rec.style(i)
            case DrawOp.strokeStyle, DrawOp.strokeGrad: st.stroke = rec.style(i)
            case DrawOp.translate: st.ctm = CGAffineTransform(translationX: d(1), y: d(2)).concatenating(st.ctm)
            case DrawOp.scale: st.ctm = CGAffineTransform(scaleX: d(1), y: d(2)).concatenating(st.ctm)
            case DrawOp.rotate: st.ctm = CGAffineTransform(rotationAngle: d(1)).concatenating(st.ctm)
            case DrawOp.transform: st.ctm = rec.matrix(i).concatenating(st.ctm)
            case DrawOp.setLineDash: st.dash = rec.numbers(i, from: 2, count: Int(d(1)))
            case DrawOp.set:
                switch rec.setKey(i) {
                case "lineWidth": st.lineWidth = rec.setNumber(i)
                case "lineCap":
                    let v = rec.setString(i)
                    st.cap = v == "round" ? .round : (v == "square" ? .square : .butt)
                case "lineJoin":
                    let v = rec.setString(i)
                    st.join = v == "round" ? .round : (v == "bevel" ? .bevel : .miter)
                case "miterLimit": st.miterLimit = rec.setNumber(i)
                case "lineDashOffset": st.dashOffset = rec.setNumber(i)
                case "globalAlpha": st.alpha = rec.setNumber(i)
                case "globalCompositeOperation":
                    // Only the default composite has a plain layer equivalent.
                    guard (rec.setString(i) ?? "source-over") == "source-over" else { return nil }
                case "textAlign", "textBaseline", "font", "letterSpacing":
                    break                                   // harmless unless text is drawn
                // SHADOWS ARE DESCRIBED, not refused. Refusing them sent every
                // shadowed recording to the CG rasterizer, where a shadow is a
                // CPU blur per mark: measured ~4.7 ms per shadowed mark against
                // 61 µs on Chrome, the largest per-engine cliff in the raster
                // tracking doc §C.3. CAShapeLayer carries a shadow natively and
                // the render server draws it.
                case "shadowColor": st.shadowColor = rec.setString(i)
                case "shadowBlur": st.shadowBlur = rec.setNumber(i)
                case "shadowOffsetX": st.shadowDx = rec.setNumber(i)
                case "shadowOffsetY": st.shadowDy = rec.setNumber(i)
                default: return nil                         // filter, …
                }
            case DrawOp.fill:
                guard let p = paintFor(stroke: false, evenOdd: rec.evenOdd(i, 1)) else { return nil }
                mark(p, path)
            case DrawOp.stroke:
                guard let p = paintFor(stroke: true) else { return nil }
                mark(p, path)
            case DrawOp.fillRect:
                guard let p = paintFor(stroke: false) else { return nil }
                mark(p, CGPath(rect: CGRect(x: d(1), y: d(2), width: d(3), height: d(4)), transform: &st.ctm))
            case DrawOp.strokeRect:
                guard let p = paintFor(stroke: true) else { return nil }
                mark(p, CGPath(rect: CGRect(x: d(1), y: d(2), width: d(3), height: d(4)), transform: &st.ctm))
            default:
                return nil        // fillText, drawImage, clearRect, clip, setTransform, …
            }
        }
        flush()
        guard !failed, build ? !layers.isEmpty : runs > 0 else { return nil }
        return (layers, w, h, bx, by)
    }

    /// Would `makeLayer` build this run? Exactly its two refusals: a path the
    /// flip cannot carry, and a gradient without its kind, coordinates and two
    /// colours it can read.
    private static func canMake(_ p: Paint, _ raw: CGMutablePath, flip: CGAffineTransform) -> Bool {
        var f = flip
        guard raw.copy(using: &f) != nil else { return false }
        guard let g = p.gradient else { return true }
        return g.stops.compactMap({ CSSColor.parse($0.color) }).count >= 2
    }

    // ── building one layer for a run ────────────────────────────────────────

    private static func makeLayer(_ p: Paint, _ raw: CGMutablePath, w: CGFloat, h: CGFloat,
                                  flip: CGAffineTransform, scale: CGFloat) -> CALayer? {
        var f = flip
        guard let path = raw.copy(using: &f) else { return nil }
        let shape = CAShapeLayer()
        // ⚠ A layer that draws its OWN content rasterizes at contentsScale, and
        // the default is 1.0 — on a 2x display that renders the path at half
        // resolution and upscales it. The rasterizer sets this (`l.contentsScale
        // = s`); forgetting it here is what made every described edge softer
        // than the rastered one.
        shape.contentsScale = scale
        shape.anchorPoint = .zero
        shape.bounds = CGRect(x: 0, y: 0, width: w, height: h)
        shape.position = .zero
        shape.path = path
        shape.actions = ["path": NSNull(), "position": NSNull(), "bounds": NSNull(),
                         "fillColor": NSNull(), "strokeColor": NSNull(), "transform": NSNull()]
        if p.isStroke {
            shape.fillColor = nil
            shape.lineWidth = p.lineWidth
            shape.lineCap = p.cap == .round ? .round : (p.cap == .square ? .square : .butt)
            shape.lineJoin = p.join == .round ? .round : (p.join == .bevel ? .bevel : .miter)
            shape.miterLimit = p.miterLimit
            if !p.dash.isEmpty { shape.lineDashPattern = p.dash.map { NSNumber(value: Double($0)) } }
            shape.lineDashPhase = p.dashOffset
        } else {
            shape.strokeColor = nil
            shape.fillRule = p.evenOdd ? .evenOdd : .nonZero
        }

        // SOLID: the shape layer paints itself.
        if p.gradient == nil {
            let c = CSSColor.parse(p.color)?.cgColor
            if p.isStroke { shape.strokeColor = c } else { shape.fillColor = c }
            shape.opacity = Float(p.alpha)
            if let sh = p.shadow, let sc = CSSColor.parse(sh.color) {
                // the spec is in the view's points, y-DOWN; a layer's shadow is in
                // points, y-UP, so y is negated. The radius carries across as the
                // same quantity CG's `blur` is — the rasterizer passes shadowBlur
                // through unhalved and matches Chrome at 0% (drawconform
                // shadowBlur), so this does too; that cell holds this to account.
                shape.shadowColor = sc.cgColor
                shape.shadowOpacity = 1
                shape.shadowRadius = sh.blur
                shape.shadowOffset = CGSize(width: sh.dx, height: -sh.dy)
                shape.actions?["shadowOpacity"] = NSNull()
                shape.actions?["shadowRadius"] = NSNull()
                shape.actions?["shadowOffset"] = NSNull()
                shape.actions?["shadowColor"] = NSNull()
            }
            return shape
        }

        // GRADIENT: the shape becomes a MASK and a gradient layer supplies the
        // paint — the compositor generates the ramp, so it is re-rendered at
        // whatever size the layer has rather than resampled from a bitmap.
        guard let g = p.gradient else { return nil }
        let kind = g.kind, coords = g.coords, stops = g.stops
        let colors = stops.compactMap { CSSColor.parse($0.color)?.cgColor }
        guard colors.count >= 2 else { return nil }
        let locs = stops.map { NSNumber(value: Double($0.offset)) }

        let grad = CAGradientLayer()
        grad.contentsScale = scale
        grad.anchorPoint = .zero
        grad.bounds = CGRect(x: 0, y: 0, width: w, height: h)
        grad.position = .zero
        // canvas gradients interpolate straight (not premultiplied), in sRGB
        let (rc, rl) = GradientStops.resampled(colors: colors, locations: locs.map { CGFloat($0.doubleValue) }, premultiplied: false)
        grad.colors = rc
        grad.locations = rl.map { NSNumber(value: Double($0)) }
        grad.actions = ["position": NSNull(), "bounds": NSNull(), "colors": NSNull(),
                        "locations": NSNull(), "startPoint": NSNull(), "endPoint": NSNull()]
        /// Gradient geometry arrives in the recording's user space; the layer
        /// wants unit coordinates of its own (flipped) box.
        func unit(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            let p = CGPoint(x: x, y: y).applying(flip)
            return CGPoint(x: p.x / w, y: p.y / h)
        }
        switch kind {
        case "linear" where coords.count >= 4:
            grad.type = .axial
            // Core Animation projects onto the axis in UNIT space, so on a box
            // that is not square the bands would lean (a diagonal ramp's bands
            // ran along the box's other diagonal). Canvas projects in pixels,
            // perpendicular to the axis: keep the start, and pick the unit end
            // whose unit-space projection equals the pixel one — the axis
            // scaled by the box, at length |V|² / |DV| in unit terms.
            let s0 = unit(coords[0], coords[1]), e0 = unit(coords[2], coords[3])
            let v = CGPoint(x: (e0.x - s0.x) * w, y: (e0.y - s0.y) * h)          // the axis, pixels
            let dv = CGPoint(x: v.x * w, y: v.y * h)
            let k = (v.x * v.x + v.y * v.y) / max(1e-9, dv.x * dv.x + dv.y * dv.y)
            grad.startPoint = s0
            grad.endPoint = CGPoint(x: s0.x + dv.x * k, y: s0.y + dv.y * k)
        case "radial" where coords.count >= 6:
            // `expressible` has already refused the two-circle focal form.
            let x1 = coords[3], y1 = coords[4], r1 = coords[5]
            grad.type = .radial
            let c = unit(x1, y1)
            grad.startPoint = c
            // The radius as a UNIT offset — computed directly rather than by
            // transforming a second point, because the y-flip would negate it.
            grad.endPoint = CGPoint(x: c.x + r1 / w, y: c.y + r1 / h)
        default:
            return nil
        }
        // ⚠ A mask contributes ALPHA, but it still has to DRAW. A stroke run
        // reaches here with fillColor forced nil and strokeColor at its default
        // — which is ALSO nil — so the mask rendered nothing and masked the
        // whole gradient away. Weather made it visible: the 10-day range bars
        // and the AQI spectrum are gradient-painted strokes, and each one
        // "described" into a perfectly valid, perfectly invisible layer — the
        // one partial-description shape the all-or-nothing guard cannot see,
        // because nothing failed.
        if p.isStroke { shape.strokeColor = CGColor.black } else { shape.fillColor = CGColor.black }
        grad.mask = shape
        grad.opacity = Float(p.alpha)
        return grad
    }
}

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
    private struct Paint: Equatable {
        var isStroke = false
        var color: String = "#000"
        var gradient: NSDictionary? = nil
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
        var fill: Any = "#000"
        var stroke: Any = "#000"
        var lineWidth: CGFloat = 1
        var cap: CGLineCap = .butt
        var join: CGLineJoin = .miter
        var miterLimit: CGFloat = 10
        var dash: [CGFloat] = []
        var dashOffset: CGFloat = 0
        var alpha: CGFloat = 1
        var ctm: CGAffineTransform = .identity
    }

    /// Can a gradient be expressed as a CAGradientLayer at all? Checked at
    /// MARK time, not at layer-construction time — see `failed` below for why
    /// that distinction cost a probe.
    private static func expressible(_ g: [String: Any]) -> Bool {
        guard let kind = g["kind"] as? String,
              let coords = (g["coords"] as? [NSNumber])?.map({ CGFloat($0.doubleValue) }),
              let stops = g["stops"] as? [[Any]], stops.count >= 2
        else { return false }
        switch kind {
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
    static func describe(_ list: [String: Any], scale: CGFloat) -> (layers: [CALayer], w: CGFloat, h: CGFloat,
                                                                    bx: CGFloat, by: CGFloat)? {
        let ops = (list["ops"] as? [[String: Any]]) ?? []
        guard !ops.isEmpty else { return nil }
        let b = list["bounds"] as? [String: Any]
        let bx = CGFloat((b?["x"] as? NSNumber)?.doubleValue ?? 0)
        let by = CGFloat((b?["y"] as? NSNumber)?.doubleValue ?? 0)
        let w = max(1, CGFloat((b?["w"] as? NSNumber)?.doubleValue ?? 0))
        let h = max(1, CGFloat((b?["h"] as? NSNumber)?.doubleValue ?? 0))

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

        func flush() {
            guard let p = runPaint, !runPath.isEmpty else { runPaint = nil; runPath = CGMutablePath(); return }
            if let l = makeLayer(p, runPath, w: w, h: h, flip: flip, scale: scale) { layers.append(l) }
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
        func paintFor(stroke: Bool, evenOdd: Bool = false) -> Paint? {
            let src = stroke ? st.stroke : st.fill
            var p = Paint()
            p.isStroke = stroke
            p.alpha = st.alpha
            p.evenOdd = evenOdd
            if let g = src as? [String: Any] {
                guard expressible(g) else { return nil }
                p.gradient = g as NSDictionary
            } else if let s = src as? String {
                p.color = s
            } else { return nil }
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

        for o in ops {
            let op = (o["op"] as? String) ?? ""
            func d(_ k: String) -> CGFloat { CGFloat((o[k] as? NSNumber)?.doubleValue ?? 0) }

            if DrawReplay.pathOp(o, &path, &cur, &start, transform: st.ctm) { continue }

            switch op {
            case "save": stack.append(st)
            case "restore": if let s = stack.popLast() { st = s }
            case "fillStyle": st.fill = (o["grad"] as? [String: Any]) ?? (o["v"] as? String ?? "#000")
            case "strokeStyle": st.stroke = (o["grad"] as? [String: Any]) ?? (o["v"] as? String ?? "#000")
            case "translate": st.ctm = CGAffineTransform(translationX: d("x"), y: d("y")).concatenating(st.ctm)
            case "scale": st.ctm = CGAffineTransform(scaleX: d("x"), y: d("y")).concatenating(st.ctm)
            case "rotate": st.ctm = CGAffineTransform(rotationAngle: d("a")).concatenating(st.ctm)
            case "transform":
                st.ctm = CGAffineTransform(a: d("a"), b: d("b"), c: d("c"), d: d("d"),
                                           tx: d("e"), ty: d("f")).concatenating(st.ctm)
            case "setLineDash":
                st.dash = ((o["segments"] as? [NSNumber]) ?? []).map { CGFloat($0.doubleValue) }
            case "set":
                switch (o["k"] as? String) ?? "" {
                case "lineWidth": st.lineWidth = d("v")
                case "lineCap":
                    let v = o["v"] as? String
                    st.cap = v == "round" ? .round : (v == "square" ? .square : .butt)
                case "lineJoin":
                    let v = o["v"] as? String
                    st.join = v == "round" ? .round : (v == "bevel" ? .bevel : .miter)
                case "miterLimit": st.miterLimit = d("v")
                case "lineDashOffset": st.dashOffset = d("v")
                case "globalAlpha": st.alpha = d("v")
                case "globalCompositeOperation":
                    // Only the default composite has a plain layer equivalent.
                    guard ((o["v"] as? String) ?? "source-over") == "source-over" else { return nil }
                case "textAlign", "textBaseline", "font", "letterSpacing":
                    break                                   // harmless unless text is drawn
                default: return nil                         // shadows, filter, …
                }
            case "fill":
                guard let p = paintFor(stroke: false, evenOdd: (o["rule"] as? String) == "evenodd")
                else { return nil }
                mark(p, path)
            case "stroke":
                guard let p = paintFor(stroke: true) else { return nil }
                mark(p, path)
            case "fillRect":
                guard let p = paintFor(stroke: false) else { return nil }
                mark(p, CGPath(rect: CGRect(x: d("x"), y: d("y"), width: d("w"), height: d("h")),
                               transform: &st.ctm))
            case "strokeRect":
                guard let p = paintFor(stroke: true) else { return nil }
                mark(p, CGPath(rect: CGRect(x: d("x"), y: d("y"), width: d("w"), height: d("h")),
                               transform: &st.ctm))
            default:
                return nil        // fillText, drawImage, clearRect, clip, filter …
            }
        }
        flush()
        guard !failed, !layers.isEmpty else { return nil }
        return (layers, w, h, bx, by)
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
            return shape
        }

        // GRADIENT: the shape becomes a MASK and a gradient layer supplies the
        // paint — the compositor generates the ramp, so it is re-rendered at
        // whatever size the layer has rather than resampled from a bitmap.
        guard let g = p.gradient as? [String: Any],
              let kind = g["kind"] as? String,
              let coords = (g["coords"] as? [NSNumber])?.map({ CGFloat($0.doubleValue) }),
              let stops = g["stops"] as? [[Any]]
        else { return nil }
        let colors = stops.compactMap { ($0.count > 1 ? $0[1] as? String : nil).flatMap { CSSColor.parse($0)?.cgColor } }
        guard colors.count >= 2 else { return nil }
        let locs = stops.map { NSNumber(value: Double(($0.first as? NSNumber)?.doubleValue ?? 0)) }

        let grad = CAGradientLayer()
        grad.contentsScale = scale
        grad.anchorPoint = .zero
        grad.bounds = CGRect(x: 0, y: 0, width: w, height: h)
        grad.position = .zero
        grad.colors = colors
        grad.locations = locs
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
            grad.startPoint = unit(coords[0], coords[1])
            grad.endPoint = unit(coords[2], coords[3])
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

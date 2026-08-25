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
        var fill: Any = "#000"           // String or gradient dict
        var stroke: Any = "#000"
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
    static func pathOp(_ o: [String: Any], _ path: inout CGMutablePath,
                       _ cur: inout CGPoint, _ start: inout CGPoint,
                       transform m: CGAffineTransform) -> Bool {
        func d(_ k: String) -> CGFloat { CGFloat((o[k] as? NSNumber)?.doubleValue ?? 0) }
        let t = m
        switch (o["op"] as? String) ?? "" {
        case "beginPath": path = CGMutablePath()
        case "closePath": path.closeSubpath(); cur = start
        case "moveTo": cur = CGPoint(x: d("x"), y: d("y")); start = cur; path.move(to: cur, transform: t)
        case "lineTo": cur = CGPoint(x: d("x"), y: d("y")); path.addLine(to: cur, transform: t)
        case "bezierCurveTo":
            cur = CGPoint(x: d("x"), y: d("y"))
            path.addCurve(to: cur, control1: CGPoint(x: d("cp1x"), y: d("cp1y")),
                          control2: CGPoint(x: d("cp2x"), y: d("cp2y")), transform: t)
        case "quadraticCurveTo":
            cur = CGPoint(x: d("x"), y: d("y"))
            path.addQuadCurve(to: cur, control: CGPoint(x: d("cpx"), y: d("cpy")), transform: t)
        case "arc":
            // The recorder's angle keys are a0/a1 (draw.ts). Reading them as
            // "start"/"end" silently produced a ZERO-LENGTH arc at angle 0 —
            // every rounded corner in the app collapsed to its own start point,
            // which is why the dock's folder came out as a chevron.
            //
            // Canvas's flag is `counterclockwise` and CGPath's is `clockwise`,
            // but both mean "increasing angle" when false, and the path is built
            // in the recording's own numeric coordinates, so the flag passes
            // through.
            path.addArc(center: CGPoint(x: d("x"), y: d("y")), radius: d("r"),
                        startAngle: d("a0"), endAngle: d("a1"),
                        clockwise: (o["ccw"] as? NSNumber)?.boolValue ?? false, transform: t)
        case "arcTo":
            path.addArc(tangent1End: CGPoint(x: d("x1"), y: d("y1")),
                        tangent2End: CGPoint(x: d("x2"), y: d("y2")), radius: d("r"), transform: t)
        case "ellipse":
            let e = CGAffineTransform(translationX: d("x"), y: d("y"))
                .rotated(by: d("rot"))
                .scaledBy(x: max(d("rx"), 0.0001), y: max(d("ry"), 0.0001))
            let a0 = d("a0"), a1 = d("a1")
            let ccw = (o["ccw"] as? NSNumber)?.boolValue ?? false
            // Canvas's normalisation: sweep in the requested direction, and a
            // wrap of more than a full turn is clamped to a full turn.
            var delta = a1 - a0
            if ccw { if delta > 0 { delta -= 2 * .pi }; delta = max(delta, -2 * .pi) }
            else { if delta < 0 { delta += 2 * .pi }; delta = min(delta, 2 * .pi) }
            path.addRelativeArc(center: .zero, radius: 1, startAngle: a0,
                                delta: delta, transform: e.concatenating(t))
        case "rect":
            path.addRect(CGRect(x: d("x"), y: d("y"), width: d("w"), height: d("h")), transform: t)
        case "roundRect":
            let r = roundRadii(o["radii"])
            path.addPath(roundedPath(CGRect(x: d("x"), y: d("y"), width: d("w"), height: d("h")), r),
                         transform: t)
        default: return false
        }
        return true
    }

    /// `geom` is the raster's own frame in the recording's user space
    /// (origin + size + backing scale) — a filter layer must be built with the
    /// SAME setup so its pixels line up when composited back.
    static func run(_ ops: [[String: Any]], in cg: CGContext, bridge: Bridge,
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
            return c2
        }

        /// Blur (CoreImage) and draw back into user space — the recording's own
        /// rect, flipped locally because CG draws images bottom-up.
        func composite(_ layer: CGContext, blur: String, blend2: CGBlendMode = .normal) {
            guard let img = layer.makeImage() else { return }
            var out: CGImage? = img
            if let r = blurRadius(blur), r > 0 {
                let ci = CIImage(cgImage: img, options: [.colorSpace: NSNull()])
                if let f = CIFilter(name: "CIGaussianBlur") {
                    // NOT clampedToExtent. Canvas `filter: blur()` follows the
                    // SVG filter model, where everything outside the source is
                    // transparent black — so a blurred full-bleed drawing fades
                    // at its own edges. Clamping instead extends the edge pixels
                    // outward, which left the wallpaper visibly brighter in a
                    // band around the whole screen (~26/255 at the very edge,
                    // decaying inward over roughly the blur radius).
                    f.setValue(ci, forKey: kCIInputImageKey)
                    // CIGaussianBlur's inputRadius IS the standard deviation, and so
                    // is CSS `blur(<length>)` — so the radius carries across
                    // UNSCALED. It was being multiplied by the backing scale here,
                    // which the comment above it already said not to do: the layer
                    // is congruent with the raster (device resolution) and is drawn
                    // back 1:1, so a radius in layer pixels IS a radius in device
                    // pixels. Measured on test/probe/drawops.declare, blur(9px):
                    // Chrome sigma 10.1, this at `r * geom.scale` sigma 19.4.
                    //
                    // ⚠ Canvas filter lengths are DEVICE space and ignore the CTM —
                    // blur(10px) ramps over the same 32 device px at scale 1, 2 and
                    // 4, and blur.declare reads the same sigma at dpr 1 and dpr 2.
                    // So there is no view scale to fold in here, ever.
                    f.setValue(r, forKey: kCIInputRadiusKey)
                    if let result = f.outputImage?.cropped(to: ci.extent) {
                        out = ciContext.createCGImage(result, from: ci.extent)
                    }
                }
            }
            guard let final = out else { return }
            let c = target()   // the scratch is already popped, so this is the destination
            c.saveGState()
            c.setBlendMode(blend2)
            c.translateBy(x: geom.x, y: geom.y + geom.h)
            c.scaleBy(x: 1, y: -1)
            c.draw(final, in: CGRect(x: 0, y: 0, width: geom.w, height: geom.h))
            c.restoreGState()
        }

        func d(_ o: [String: Any], _ k: String) -> CGFloat { CGFloat((o[k] as? NSNumber)?.doubleValue ?? 0) }
        func target() -> CGContext { filterLayers.last?.0 ?? cg }

        /// Canvas applies `filter` to EACH drawing operation, not to a run of
        /// them: every shape is blurred on its own and then composited with the
        /// current operator. Blurring their union instead is measurably
        /// brighter wherever shapes overlap (lighten of blurs ≠ blur of
        /// lighten), so a filtered op gets its own scratch layer here.
        func paint(_ body: (CGContext) -> Void) {
            guard !filterLayers.isEmpty, let scratch = makeCongruentLayer() else {
                body(target()); return
            }
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

        func paintGradient(_ c: CGContext, _ rec: [String: Any], clipTo: CGPath?, stroke: Bool) {
            if ProcessInfo.processInfo.environment["DECLARE_DEBUG_GRAD"] != nil {
                NSLog("[grad] keys=%@ kind=%@ coords=%@ stops=%@",
                      rec.keys.joined(separator: ","), String(describing: rec["kind"]),
                      String(describing: rec["coords"]).prefix(60) as CVarArg,
                      String(describing: rec["stops"]).prefix(80) as CVarArg)
            }
            guard let kind = rec["kind"] as? String,
                  let coords = (rec["coords"] as? [NSNumber])?.map({ CGFloat($0.doubleValue) }),
                  let stops = rec["stops"] as? [[Any]] else { return }
            let colors = stops.compactMap { ($0.count > 1 ? $0[1] as? String : nil).flatMap { CSSColor.parse($0)?.cgColor } }
            let locs = stops.map { CGFloat(($0.first as? NSNumber)?.doubleValue ?? 0) }
            // NOT resampled into premultiplied space. CSS gradients interpolate
            // premultiplied, but CANVAS gradients do not — Skia's canvas shader
            // interpolates the components straight, which is what CGGradient
            // already does. Measured: forcing premultiplication here took the
            // desktop from 10.4% differing to 18.7%.
            guard colors.count >= 2,
                  let grad = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: colors as CFArray, locations: locs)
            else {
                if ProcessInfo.processInfo.environment["DECLARE_DEBUG_GRAD"] != nil {
                    let raw = stops.map { s -> String in
                        let off = String(describing: s.first ?? "?")
                        let col = (s.count > 1 ? s[1] as? String : nil) ?? "?"
                        return off + "→" + col
                    }.joined(separator: " ")
                    NSLog("[grad] BAILED kind=%@ colors=%d stops=%d raw=%@", kind, colors.count, stops.count, raw)
                }
                return
            }
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

        func interpolate(stops: [[Any]], at t: CGFloat) -> NSColor {
            var lo: (CGFloat, NSColor) = (0, .black), hi: (CGFloat, NSColor) = (1, .black)
            var found = false
            for s in stops {
                let off = CGFloat((s.first as? NSNumber)?.doubleValue ?? 0)
                let col = (s.count > 1 ? s[1] as? String : nil).flatMap { CSSColor.parse($0) } ?? .black
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
            if let s = st.fill as? String, let col = CSSColor.parse(s) { c.setFillColor(col.cgColor) }
        }
        func setStrokePaint(_ c: CGContext) {
            if let s = st.stroke as? String, let col = CSSColor.parse(s) { c.setStrokeColor(col.cgColor) }
            c.setLineWidth(st.lineWidth)
            c.setLineCap(st.lineCap); c.setLineJoin(st.lineJoin); c.setMiterLimit(st.miterLimit)
            if st.dash.isEmpty { c.setLineDash(phase: 0, lengths: []) }
            else { c.setLineDash(phase: st.dashOffset, lengths: st.dash) }
        }

        for o in ops {
            guard let op = o["op"] as? String else { continue }
            let c = target()
            c.setAlpha(st.alpha)
            switch op {
            case "save":
                stack.append((st, filterLayers.count))
                c.saveGState()
            case "restore":
                if let saved = stack.popLast() {
                    while filterLayers.count > saved.filterDepth { _ = filterLayers.popLast() }
                    st = saved.state
                }
                target().restoreGState()
            case "translate": c.translateBy(x: d(o, "x"), y: d(o, "y"))
            case "scale": c.scaleBy(x: d(o, "x"), y: d(o, "y"))
            case "rotate": c.rotate(by: d(o, "angle"))
            case "transform":
                c.concatenate(CGAffineTransform(a: d(o, "a"), b: d(o, "b"), c: d(o, "c"),
                                                d: d(o, "d"), tx: d(o, "e"), ty: d(o, "f")))
            case "setTransform", "resetTransform":
                break   // absolute transforms are not used by the corpus; ignore rather than corrupt
            case "fillStyle": st.fill = (o["grad"] as? [String: Any]) ?? (o["v"] as? String ?? "#000")
            case "strokeStyle": st.stroke = (o["grad"] as? [String: Any]) ?? (o["v"] as? String ?? "#000")
            case "set":
                let k = o["k"] as? String ?? ""
                switch k {
                case "lineWidth": st.lineWidth = d(o, "v")
                case "lineCap": st.lineCap = (o["v"] as? String) == "round" ? .round : ((o["v"] as? String) == "square" ? .square : .butt)
                case "lineJoin": st.lineJoin = (o["v"] as? String) == "round" ? .round : ((o["v"] as? String) == "bevel" ? .bevel : .miter)
                case "miterLimit": st.miterLimit = d(o, "v")
                case "lineDashOffset": st.dashOffset = d(o, "v")
                case "globalAlpha": st.alpha = d(o, "v")
                case "shadowBlur": st.shadowBlur = d(o, "v")
                case "shadowColor": st.shadowColor = (o["v"] as? String).flatMap { CSSColor.parse($0) }
                case "shadowOffsetX": st.shadowDx = d(o, "v")
                case "shadowOffsetY": st.shadowDy = d(o, "v")
                case "font": st.font = o["v"] as? String ?? st.font
                case "textAlign": st.textAlign = o["v"] as? String ?? "left"
                case "textBaseline": st.textBaseline = o["v"] as? String ?? "alphabetic"
                case "letterSpacing": st.letterSpacing = CGFloat(Double((o["v"] as? String ?? "0").replacingOccurrences(of: "px", with: "")) ?? 0)
                case "globalCompositeOperation":
                    st.blend = blendMode(o["v"] as? String ?? "source-over")
                    // The blend applies INSIDE a filter layer as well. Canvas
                    // draws each filtered shape straight onto the canvas with
                    // this operator, so blobs must combine by the operator
                    // (lighten = a max) rather than by ordinary alpha
                    // compositing — which is what made the wallpaper dim.
                    c.setBlendMode(st.blend)
                case "filter":
                    let v = o["v"] as? String ?? "none"
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
                        if let layer = makeCongruentLayer() { filterLayers.append((layer, st)) }
                    }
                default: break
                }
            case "setLineDash":
                st.dash = ((o["segments"] as? [NSNumber]) ?? []).map { CGFloat($0.doubleValue) }
            case "beginPath", "closePath", "moveTo", "lineTo", "bezierCurveTo", "quadraticCurveTo",
                 "arc", "arcTo", "ellipse", "rect", "roundRect":
                _ = pathOp(o, &path, &cur, &start, transform: .identity)
            case "fill":
                paint { t in
                    applyShadow(t); setFillPaint(t)
                    if let g = st.fill as? [String: Any] { paintGradient(t, g, clipTo: path, stroke: false) }
                    else {
                        t.addPath(path)
                        if (o["rule"] as? String) == "evenodd" { t.fillPath(using: .evenOdd) } else { t.fillPath() }
                    }
                }
            case "stroke":
                paint { t in
                    applyShadow(t); setStrokePaint(t)
                    if let g = st.stroke as? [String: Any] { paintGradient(t, g, clipTo: path, stroke: true) }
                    else { t.addPath(path); t.strokePath() }
                }
            case "clip":
                c.addPath(path)
                if (o["rule"] as? String) == "evenodd" { c.clip(using: .evenOdd) } else { c.clip() }
            case "fillRect":
                let r = CGRect(x: d(o, "x"), y: d(o, "y"), width: d(o, "w"), height: d(o, "h"))
                paint { t in
                    applyShadow(t); setFillPaint(t)
                    if let g = st.fill as? [String: Any] { paintGradient(t, g, clipTo: CGPath(rect: r, transform: nil), stroke: false) }
                    else { t.fill(r) }
                }
            case "strokeRect":
                paint { t in
                    applyShadow(t); setStrokePaint(t)
                    t.stroke(CGRect(x: d(o, "x"), y: d(o, "y"), width: d(o, "w"), height: d(o, "h")))
                }
            case "clearRect":
                c.clear(CGRect(x: d(o, "x"), y: d(o, "y"), width: d(o, "w"), height: d(o, "h")))
            case "fillText", "strokeText":
                paint { t in
                    applyShadow(t)
                    drawText(o["text"] as? String ?? "", at: CGPoint(x: d(o, "x"), y: d(o, "y")),
                             state: st, in: t, stroke: op == "strokeText")
                }
            default:
                break
            }
        }
        // Any filter left open at the end still composites.
        filterLayers.removeAll()
    }

    private static func roundRadii(_ v: Any?) -> [CGFloat] {
        if let n = v as? NSNumber { return [CGFloat(n.doubleValue)] }
        if let a = v as? [NSNumber] { return a.map { CGFloat($0.doubleValue) } }
        return [0]
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

    private static func drawText(_ text: String, at p: CGPoint, state st: State, in c: CGContext, stroke: Bool) {
        guard !text.isEmpty else { return }
        let f = TextEngine.nsFont(TextEngine.parse(st.font))
        var attrs: [NSAttributedString.Key: Any] = [.font: f]
        if let s = st.fill as? String, let col = CSSColor.parse(s) { attrs[.foregroundColor] = col }
        if st.letterSpacing != 0 { attrs[.kern] = st.letterSpacing }
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
        CTLineDraw(line, c)
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

    private static func blurRadius(_ filter: String) -> CGFloat? {
        guard let r = filter.range(of: "blur(") else { return nil }
        let rest = filter[r.upperBound...]
        guard let end = rest.firstIndex(of: ")") else { return nil }
        let v = rest[rest.startIndex..<end].replacingOccurrences(of: "px", with: "")
        return CGFloat(Double(v.trimmingCharacters(in: .whitespaces)) ?? 0)
    }
}

/// CSS colors → NSColor. The runtime hands the backend already-resolved CSS
/// strings (colorToCss), so this covers exactly what it emits: #rgb, #rrggbb,
/// #rrggbbaa, rgb()/rgba(), and the named set the language allows.
enum CSSColor {
    private static var cache: [String: NSColor] = [:]

    static func parse(_ s: String) -> NSColor? {
        if let c = cache[s] { return c }
        guard let c = compute(s) else { return nil }
        if cache.count > 1024 { cache.removeAll() }
        cache[s] = c
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
    static func resampled(colors: [CGColor], locations: [CGFloat], steps: Int = 64) -> ([CGColor], [CGFloat]) {
        guard colors.count == locations.count, colors.count >= 2 else { return (colors, locations) }
        let pts: [(l: CGFloat, r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat)] =
            zip(locations, colors).map { (loc, c) in
                let comp = c.components ?? [0, 0, 0, 1]
                let a = c.alpha
                if c.numberOfComponents >= 4 { return (loc, comp[0], comp[1], comp[2], a) }
                let v = comp.first ?? 0
                return (loc, v, v, v, a)
            }
        // Nothing to reconcile unless some stop is partly transparent.
        guard pts.contains(where: { $0.a < 0.999 }) else { return (colors, locations) }

        var outC: [CGColor] = [], outL: [CGFloat] = []
        let space = CGColorSpace(name: CGColorSpace.sRGB)!
        let lo = pts.first!.l, hi = pts.last!.l
        for i in 0...steps {
            let t = lo + (hi - lo) * CGFloat(i) / CGFloat(steps)
            var j = 0
            while j + 2 < pts.count, pts[j + 1].l < t { j += 1 }
            let p0 = pts[j], p1 = pts[j + 1]
            let span = p1.l - p0.l
            let u = span > 0 ? min(max((t - p0.l) / span, 0), 1) : 0
            let a = p0.a + (p1.a - p0.a) * u
            let pr = p0.r * p0.a + (p1.r * p1.a - p0.r * p0.a) * u
            let pg = p0.g * p0.a + (p1.g * p1.a - p0.g * p0.a) * u
            let pb = p0.b * p0.a + (p1.b * p1.a - p0.b * p0.a) * u
            let comps: [CGFloat] = a > 0.0001 ? [pr / a, pg / a, pb / a, a] : [0, 0, 0, 0]
            if let c = CGColor(colorSpace: space, components: comps) { outC.append(c); outL.append(t) }
        }
        return outC.count >= 2 ? (outC, outL) : (colors, locations)
    }
}

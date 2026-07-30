// TextLayer — text drawn at the baseline the RUNTIME chose, not the one a
// text control would choose for itself.
//
// CATextLayer lays text out with its own vertical rules; Declare's contract is
// exact and shared with the other two renderers (dom-backend setTextStyle):
// the line box is ascent+descent with NO half-leading, and the first baseline
// sits at the font's ascent from the top of the view's box. Matching that is
// the whole difference between "text appears" and pixel fidelity, so this
// layer draws the glyphs itself with Core Text at that baseline.
//
// Wrapping uses CTTypesetter over the box width — the same greedy line
// breaking the measurer's wrapLines() models, so a wrapped run occupies the
// lines the layout already assumed.

import AppKit
import CoreText

final class TextLayer: CALayer {
    var attributed: NSAttributedString? { didSet { lines = nil; setNeedsDisplay() } }
    var wrap = false { didSet { lines = nil; setNeedsDisplay() } }
    var align: NSTextAlignment = .left { didSet { setNeedsDisplay() } }
    /// Font ascent/descent for the run's style — the baseline contract.
    var ascent: CGFloat = 0 { didSet { setNeedsDisplay() } }
    var descent: CGFloat = 0 { didSet { setNeedsDisplay() } }
    /// `textFill` — a ramp clipped to the glyphs, overriding the solid colour.
    var fillGradient: TextGradient? = nil { didSet { setNeedsDisplay() } }

    private var lines: [CTLine]?

    override init() {
        super.init()
        contentsScale = NSScreen.main?.backingScaleFactor ?? 2
        needsDisplayOnBoundsChange = true
        actions = ["contents": NSNull(), "bounds": NSNull(), "position": NSNull()]
    }
    override init(layer: Any) { super.init(layer: layer) }
    required init?(coder: NSCoder) { fatalError() }

    /// Break into lines once per (text, width) — CTTypesetter answers the same
    /// greedy breaks the runtime measured with.
    private func buildLines() -> [CTLine] {
        guard let a = attributed, a.length > 0 else { return [] }
        if !wrap { return [CTLineCreateWithAttributedString(a)] }
        let width = bounds.width > 0 ? bounds.width : .greatestFiniteMagnitude
        let ts = CTTypesetterCreateWithAttributedString(a)
        var out: [CTLine] = []
        var start = 0
        while start < a.length {
            let count = CTTypesetterSuggestLineBreak(ts, start, Double(width))
            if count <= 0 { break }
            out.append(CTTypesetterCreateLine(ts, CFRange(location: start, length: count)))
            start += count
        }
        return out
    }

    /// Where line `i`'s origin sits, in the layer's own bottom-up space.
    private func origin(of line: CTLine, index i: Int) -> CGPoint {
        let w = CTLineGetTypographicBounds(line, nil, nil, nil)
        var x: CGFloat = 0
        if align == .center { x = (bounds.width - CGFloat(w)) / 2 }
        else if align == .right { x = bounds.width - CGFloat(w) }
        // Text is laid top-down from the box's top; the layer is bottom-up.
        let baseline = ascent + CGFloat(i) * (ascent + descent)
        return CGPoint(x: x, y: bounds.height - baseline)
    }

    /// Instrumentation: how much of a frame is spent drawing plain text, and
    /// how much of that is line breaking. Off unless the stats window is open.
    nonisolated(unsafe) static var drawCount = 0
    nonisolated(unsafe) static var drawMs = 0.0
    nonisolated(unsafe) static var buildCount = 0
    nonisolated(unsafe) static var statsOn = false

    override func draw(in ctx: CGContext) {
        let t0 = TextLayer.statsOn ? CFAbsoluteTimeGetCurrent() : 0
        defer { if TextLayer.statsOn { TextLayer.drawCount += 1; TextLayer.drawMs += (CFAbsoluteTimeGetCurrent() - t0) * 1000 } }
        if lines == nil, TextLayer.statsOn { TextLayer.buildCount += 1 }
        let ls = lines ?? buildLines()
        lines = ls
        guard !ls.isEmpty else { return }
        ctx.saveGState()
        ctx.setAllowsAntialiasing(true)
        ctx.setShouldSmoothFonts(true)
        ctx.setShouldSubpixelPositionFonts(true)
        ctx.setShouldSubpixelQuantizeFonts(true)
        if let g = fillGradient {
            drawGradientFilled(ls, g, in: ctx)
        } else {
            // Baselines are placed in the layer's own y-up space, so the glyphs
            // need no per-line flip: CTLineDraw draws upright as it is.
            for (i, line) in ls.enumerated() {
                ctx.textPosition = origin(of: line, index: i)
                CTLineDraw(line, ctx)
            }
        }
        ctx.restoreGState()
    }

    /// `textFill`: build the union of the glyph outlines, clip to it, and run the
    /// ramp across the layer's box.
    ///
    /// The outlines are collected as a PATH rather than drawn in
    /// `.clip` text mode: a clip is an intersection, so clipping line by line
    /// would leave nothing once a run has more than one line.
    private func drawGradientFilled(_ ls: [CTLine], _ g: TextGradient, in ctx: CGContext) {
        let path = CGMutablePath()
        for (i, line) in ls.enumerated() {
            let o = origin(of: line, index: i)
            for run in (CTLineGetGlyphRuns(line) as? [CTRun] ?? []) {
                let attrs = CTRunGetAttributes(run) as NSDictionary
                guard let fontRef = attrs[kCTFontAttributeName as String] else { continue }
                let font = fontRef as! CTFont
                let count = CTRunGetGlyphCount(run)
                guard count > 0 else { continue }
                var glyphs = [CGGlyph](repeating: 0, count: count)
                var pos = [CGPoint](repeating: .zero, count: count)
                let all = CFRange(location: 0, length: count)
                CTRunGetGlyphs(run, all, &glyphs)
                CTRunGetPositions(run, all, &pos)
                for j in 0..<count {
                    guard let gp = CTFontCreatePathForGlyph(font, glyphs[j], nil) else { continue }
                    var t = CGAffineTransform(translationX: o.x + pos[j].x, y: o.y + pos[j].y)
                    path.addPath(gp, transform: t)
                }
            }
        }
        guard !path.isEmpty,
              let cs = CGColorSpace(name: CGColorSpace.sRGB),
              let ramp = CGGradient(colorsSpace: cs, colors: g.colors as CFArray,
                                    locations: g.locations) else { return }
        ctx.saveGState()
        ctx.addPath(path)
        ctx.clip()
        // The CSS compass (0 = up, clockwise) over the box, in this y-UP space —
        // the same arithmetic applyGradient() uses, with no flip to cancel.
        let rad = g.angle * .pi / 180
        let dx = sin(rad) / 2, dy = cos(rad) / 2
        let c = CGPoint(x: bounds.midX, y: bounds.midY)
        let start = CGPoint(x: c.x - dx * bounds.width, y: c.y - dy * bounds.height)
        let end = CGPoint(x: c.x + dx * bounds.width, y: c.y + dy * bounds.height)
        ctx.drawLinearGradient(ramp, start: start, end: end,
                               options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        ctx.restoreGState()
    }
}

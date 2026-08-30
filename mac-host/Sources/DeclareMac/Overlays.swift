// Overlays — the two places where AppKit's own controls are the right answer.
//
// native-host.md §4 rules these as first-class, not workarounds: text INPUT and
// text SELECTION must be the platform's, because caret behavior, IME, and
// selection feel are exactly what a native app is judged on. So a `TextInput`
// is a real NSTextField/NSTextView, and a selectable rich-text flow is a real
// NSTextView — each glued to its surface's box every frame, the same overlay
// pattern the canvas renderer already uses on the web.

import AppKit

/// A rich-text flow: laid out by AppKit's text system, selectable natively,
/// and reporting its flowed height back so the runtime can size the view.
final class RichOverlay: NSObject, NSTextViewDelegate {
    private let id: Int
    private unowned let view: DeclareView
    private unowned let bridge: Bridge
    /// The layout engine. An NSTextView is kept because its layout manager,
    /// text container and storage are exactly what measured the flow before —
    /// keeping them keeps every baseline where it already is. It is NEVER added
    /// to the view hierarchy: an AppKit subview always draws above the whole
    /// CALayer tree, so a note behind a window still showed its text on top.
    private let text = NSTextView()
    /// What actually renders: a layer in the node's own stack, so z-order,
    /// clipping and scrolling are the layer tree's job, as for any other paint.
    let contentLayer = CALayer()
    private var lastHeight: CGFloat = -1
    private var flowWidth: CGFloat = 0
    /// The slice of the flow currently rastered into `contentLayer`, in the
    /// flow's own top-down coordinates.
    ///
    /// A flow is not always small enough to be one bitmap. The Viewer's Source
    /// pane is 2725 lines — 43860pt, which at 2x is 87720px tall, and 522 MB as
    /// a single buffer. Rastering the whole thing is not just slow, it is
    /// impossible, and the guard in `redraw()` that refuses it left the pane
    /// BLANK. So the layer carries only the visible band plus a margin and is
    /// re-rastered as it scrolls, which is what a browser does with the same
    /// document. `lastHeight` stays the FULL flowed height: that is the number
    /// the runtime sizes the view from, and the geometry every hit and every
    /// selection index is computed in.
    private var bandTop: CGFloat = 0
    private var bandH: CGFloat = 0
    /// The last box this flow was placed in — the band math needs it when a
    /// scroll asks for a new slice without a re-place.
    private var lastBox: CGSize = .zero
    private(set) var selectable = false
    /// The live selection, in character indices over the flow's storage.
    private var selRange = NSRange(location: 0, length: 0)
    private var selAnchor: Int = 0
    private var scale: CGFloat = 2

    init(id: Int, view: DeclareView, bridge: Bridge) {
        self.id = id; self.view = view; self.bridge = bridge
        super.init()
        text.isEditable = false
        text.isRichText = true
        text.drawsBackground = false
        text.textContainerInset = .zero
        text.textContainer?.lineFragmentPadding = 0
        text.delegate = self
        text.linkTextAttributes = [.cursor: NSCursor.pointingHand]
        contentLayer.anchorPoint = .zero
        contentLayer.actions = ["contents": NSNull(), "bounds": NSNull(), "position": NSNull()]
    }

    /// The last content this flow was given, and at what width — so a re-set
    /// that changes neither can be answered from the cache.
    private var lastJSON: String = ""
    private var lastWidth: CGFloat = -1
    /// WIDTH ONLY — the `setRichWidth` seam. An all-`pre` flow cannot re-wrap,
    /// so a width change alters nothing about its lines or its height; what it
    /// MUST still do is adopt the width, because the host box bounds the pre's
    /// native horizontal scroller and a box stuck at its boot-time width clips
    /// the flow to nothing. (On the DOM backend that same absence rendered the
    /// Viewer's Source tab blank.) No blocks cross the bridge for this.
    func adoptWidth(_ width: CGFloat) {
        let w = max(1, width)
        guard w != flowWidth else { return }
        flowWidth = w
        text.frame = CGRect(x: 0, y: 0, width: w, height: max(1, lastHeight))
        text.textContainer?.containerSize = NSSize(width: w, height: .greatestFiniteMagnitude)
        lastWidth = width
        // The rastered band is as wide as the flow; leaving it behind would clip
        // the newly revealed columns to the old width.
        contentLayer.bounds = CGRect(x: 0, y: 0, width: w, height: contentLayer.bounds.height)
        redraw()
    }

    /// Can this re-set be answered without parsing the JSON at all? The parse
    /// itself was 4.3 MB per resize drag, so the check has to come first.
    func cachedHeight(json: String, width: CGFloat, selectable: Bool) -> CGFloat? {
        guard !json.isEmpty, json == lastJSON, selectable == self.selectable, lastHeight > 0 else { return nil }
        if width == lastWidth { return lastHeight }
        flowWidth = max(1, width)
        text.textContainer?.containerSize = NSSize(width: flowWidth, height: .greatestFiniteMagnitude)
        lastWidth = width
        // NOTHING WRAPS (every block is a `pre`) — the lines are already final,
        // so only the container needed the new width.
        if !wraps {
            text.frame = CGRect(x: 0, y: 0, width: flowWidth, height: max(1, lastHeight))
            return lastHeight
        }
        // IT WRAPS, BUT THE TEXT IS IDENTICAL — only the measure changed. Re-wrap
        // the attributed string ALREADY in the storage instead of returning nil
        // and making the caller parse the JSON and rebuild every run from
        // scratch. A resize changes the width sixty times a second and the
        // content not at all, so the rebuild was pure waste: on a real document
        // it was 878ms of the 2466ms a drag spent in richLayout, against 383ms
        // for the layout that a re-wrap genuinely needs.
        guard let lm = text.layoutManager, let tc = text.textContainer else { return lastHeight }
        text.frame = CGRect(x: 0, y: 0, width: flowWidth, height: 10_000)
        let __e0 = RichStats.on ? CFAbsoluteTimeGetCurrent() : 0
        lm.ensureLayout(for: tc)
        let h = ceil(lm.usedRect(for: tc).height)
        if RichStats.on { RichStats.ensureMs += (CFAbsoluteTimeGetCurrent() - __e0) * 1000 }
        lastHeight = h
        // ⚠ MARK the slice stale; do NOT zero it. `place()` runs during the JS
        // settle and calls `placeBand`, which sizes the layer from `bandH` — so
        // zeroing here collapsed the layer to nothing, and because the raster is
        // deferred to the end of the frame, a frame could be DISPLAYED blank in
        // between. That is the blinking. Holding the previous bitmap for that one
        // frame shows very slightly stale wrapping instead of nothing.
        bandDirty = true
        return h
    }

    /// Does any block in this flow WRAP? A `pre` never does — its lines are
    /// fixed and it scrolls horizontally — so a width change cannot alter its
    /// layout or its height, and re-laying it out is pure waste.
    private var wraps = true

    /// Diagnostic split of a rich re-layout. A width change only genuinely needs
    /// the LAYOUT; the parse and the attributed-string rebuild are the price of
    /// the JS→Swift boundary, and this is what tells them apart.
    enum RichStats {
        static var on = false
        static var buildMs = 0.0
        static var ensureMs = 0.0
        static var buildN = 0
        static func reset() { buildMs = 0; ensureMs = 0; buildN = 0 }
    }

    @discardableResult
    func set(blocks: [[String: Any]], selectable: Bool, width: CGFloat, style: TextStyleSpec,
             json: String = "") -> CGFloat {
        // SAME CONTENT, SAME WIDTH — nothing to do. A resize re-sets every flow
        // in the document whether or not anything about it changed.
        if !json.isEmpty, json == lastJSON, width == lastWidth, selectable == self.selectable {
            return lastHeight
        }
        // The width-only entry (setRichWidth) reaches the same adoption without
        // carrying the blocks across the bridge at all — see `adoptWidth`.
        // SAME CONTENT, NEW WIDTH, AND NOTHING WRAPS — the lines are identical,
        // so only the container needs the new width. This is every code block:
        // rebuilding the attributed string for them was the bulk of a resize
        // (92 layouts, 996ms, 4.3 MB of JSON re-parsed per drag).
        if !json.isEmpty, json == lastJSON, !wraps, lastHeight > 0 {
            flowWidth = max(1, width)
            text.frame = CGRect(x: 0, y: 0, width: flowWidth, height: max(1, lastHeight))
            text.textContainer?.containerSize = NSSize(width: flowWidth, height: .greatestFiniteMagnitude)
            lastWidth = width
            return lastHeight
        }
        self.selectable = selectable
        text.isSelectable = selectable
        lastJSON = json
        lastWidth = width
        wraps = blocks.contains { ($0["pre"] as? NSNumber)?.boolValue != true }
        // WIDTH FIRST, and on both the view and its container: a container that
        // still believes it is unbounded lays every paragraph on one line, and
        // then reports a height four lines tall for a page of prose.
        flowWidth = max(1, width)
        text.frame = CGRect(x: 0, y: 0, width: flowWidth, height: 10_000)
        text.minSize = NSSize(width: flowWidth, height: 0)
        text.maxSize = NSSize(width: flowWidth, height: .greatestFiniteMagnitude)
        text.isHorizontallyResizable = false
        text.isVerticallyResizable = true
        text.textContainer?.widthTracksTextView = true
        text.textContainer?.containerSize = NSSize(width: flowWidth, height: .greatestFiniteMagnitude)
        let __b0 = RichStats.on ? CFAbsoluteTimeGetCurrent() : 0
        let s = NSMutableAttributedString()
        for b in blocks {
            let gap = CGFloat((b["gapBefore"] as? NSNumber)?.doubleValue ?? 0)
            // `lineHeight` is a MULTIPLIER of the block's font size (the DOM
            // backend writes round(fontSize × lineHeight) px) — treating it as
            // points clamps every line to about a pixel and a half.
            let fontSize = CGFloat((b["fontSize"] as? NSNumber)?.doubleValue ?? 13)
            let mult = CGFloat((b["lineHeight"] as? NSNumber)?.doubleValue ?? 0)
            let lineHeight = mult > 0 ? (fontSize * mult).rounded() : 0
            if ProcessInfo.processInfo.environment["DECLARE_DEBUG_RICH"] != nil {
                NSLog("[rich-block] id=%d tag=%@ pre=%@ fontSize=%.2f mult=%.3f -> lh=%.1f gap=%.1f",
                      id, (b["tag"] as? String) ?? "-", String(describing: b["pre"] ?? "-"),
                      fontSize, mult, lineHeight, gap)
            }
            let align = b["align"] as? String
            let para = NSMutableParagraphStyle()
            para.paragraphSpacingBefore = gap
            if lineHeight > 0 { para.minimumLineHeight = lineHeight; para.maximumLineHeight = lineHeight }
            switch align {
            case "center": para.alignment = .center
            case "right": para.alignment = .right
            default: para.alignment = .left
            }
            if s.length > 0 { s.append(NSAttributedString(string: "\n")) }
            let blockStart = s.length
            for r in (b["runs"] as? [[String: Any]] ?? []) {
                if (r["br"] as? NSNumber)?.boolValue == true { s.append(NSAttributedString(string: "\u{2028}")); continue }
                guard let t = r["text"] as? String else { continue }
                let size = (r["size"] as? NSNumber)?.doubleValue ?? Double(style.fontCSS.contains("px") ? 13 : 13)
                let weight = r["weight"]
                let weightStr: String = {
                    if let n = weight as? NSNumber { return String(n.intValue) }
                    if let w = weight as? String {
                        return w == "bold" ? "700" : w == "semibold" ? "600" : w == "medium" ? "500" : w == "light" ? "300" : "400"
                    }
                    return "400"
                }()
                let italic = (r["italic"] as? NSNumber)?.boolValue ?? false
                let family = r["family"] as? String ?? "system-ui"
                let css = "\(italic ? "italic " : "")\(weightStr) \(size)px \(family)"
                var attrs: [NSAttributedString.Key: Any] = [
                    .font: TextEngine.nsFont(TextEngine.parse(css)),
                    .paragraphStyle: para,
                ]
                if let c = r["color"] as? NSNumber {
                    let v = UInt32(truncatingIfNeeded: c.intValue)
                    attrs[.foregroundColor] = NSColor(srgbRed: CGFloat((v >> 16) & 255) / 255,
                                                      green: CGFloat((v >> 8) & 255) / 255,
                                                      blue: CGFloat(v & 255) / 255, alpha: 1)
                } else if let c = style.color {
                    attrs[.foregroundColor] = c
                }
                if let tr = (r["tracking"] as? NSNumber)?.doubleValue, tr != 0 { attrs[.kern] = tr }
                if ProcessInfo.processInfo.environment["DECLARE_DEBUG_RICH"] != nil {
                    NSLog("[rich-run] id=%d css=%@ tracking=%@ keys=%@", id, css,
                          String(describing: r["tracking"] ?? "ABSENT"),
                          r.keys.sorted().joined(separator: ","))
                }
                if (r["strike"] as? NSNumber)?.boolValue == true { attrs[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
                if let href = r["href"] as? String { attrs[.link] = href }
                s.append(NSAttributedString(string: t, attributes: attrs))
            }
            if s.length > blockStart {
                s.addAttribute(.paragraphStyle, value: para, range: NSRange(location: blockStart, length: s.length - blockStart))
            }
        }
        text.textStorage?.setAttributedString(s)
        if RichStats.on { RichStats.buildMs += (CFAbsoluteTimeGetCurrent() - __b0) * 1000; RichStats.buildN += 1 }
        // The flowed height, measured now and returned to the caller.
        guard let lm = text.layoutManager, let tc = text.textContainer else { return lastHeight }
        let __e0 = RichStats.on ? CFAbsoluteTimeGetCurrent() : 0
        lm.ensureLayout(for: tc)
        let used = lm.usedRect(for: tc)
        if RichStats.on { RichStats.ensureMs += (CFAbsoluteTimeGetCurrent() - __e0) * 1000 }
        if ProcessInfo.processInfo.environment["DECLARE_DEBUG_RICH"] != nil {
            NSLog("[rich-measure] chars=%d container=%@ used=%@ glyphs=%d",
                  s.length, NSStringFromSize(tc.containerSize), NSStringFromRect(used), lm.numberOfGlyphs)
        }
        let h = ceil(used.height)
        lastHeight = h
        selRange = NSRange(location: 0, length: 0)
        bandTop = 0; bandH = 0        // new content: the old slice means nothing
        // NO RASTER HERE. set() cannot know whether this flow is on screen, and
        // rastering unconditionally is what made resizing the Viewer cost ~500ms
        // a frame: a width change re-sets all 69 reader flows, and each one built
        // a full-band bitmap — 458 Mpx (~1.8 GB) per gesture — whose UPLOAD lands
        // in CATransaction.commit. Only ~3 of the 69 are visible. The height
        // above needs no bitmap, and `ensureBand` rasters what is actually
        // showing; it runs from repositionOverlays at the end of this same
        // settle, so a visible flow is still painted in this frame.
        return h
    }

    func textView(_ v: NSTextView, clickedOnLink link: Any, at index: Int) -> Bool {
        let href = (link as? URL)?.absoluteString ?? String(describing: link)
        bridge.call("__declareRichLink", [id, href])
        return true
    }

    /// Place the flow inside its node's box. The box is bottom-up (the layer
    /// tree's space) and the flow is laid out top-down, so the flow's top edge
    /// pins to the box's top. Clipping is NOT done here any more — the node's
    /// own clip (and its ancestors') applies to this layer like any other.
    func place(inBox box: CGSize, scale: CGFloat) {
        lastBox = box
        if scale != self.scale { self.scale = scale; if bandH > 0 { redraw() } }
        placeBand(inBox: box)
    }

    /// Position the rastered band. The box is bottom-up and the flow is laid out
    /// top-down, so flow-y `bandTop` sits at box-y `box.height - bandTop`.
    private func placeBand(inBox box: CGSize) {
        contentLayer.bounds = CGRect(x: 0, y: 0, width: flowWidth, height: bandH)
        contentLayer.position = CGPoint(x: 0, y: box.height - bandTop - bandH)
    }

    /// The whole flowed height, whatever slice is currently rastered.
    var flowHeight: CGFloat { lastHeight > 0 ? lastHeight : 0 }

    /// How tall a slice this flow rasters at once. Generous enough that ordinary
    /// prose is a single band (and so never re-rasters), small enough that the
    /// bitmap stays a few megabytes at 2x.
    private static let bandLimit: CGFloat = 3000
    /// Kept off-screen above and below, so a scroll of a line or two does not
    /// re-raster.
    private static let bandMargin: CGFloat = 600

    /// Ask for the band covering `visible` (the flow's own top-down coords).
    /// Re-rasters only when the wanted range is not already covered — this runs
    /// on every settle and every scroll.
    /// The rastered slice no longer matches the text, but it is still the best
    /// thing to show until the deferred raster runs.
    private var bandDirty = false

    func ensureBand(covering visible: CGRect) {
        let h = flowHeight
        guard h > 0 else { return }
        defer { bandDirty = false }
        // NOTHING OF THIS FLOW IS ON SCREEN — so drop its bitmap.
        //
        // ⚠ This used to "hold whatever bitmap it already has (usually none)".
        // It is not usually none: scroll once through a document and every flow
        // has been on screen, so every flow holds a full CGImage of its band and
        // nothing ever released one. Measured on the Viewer reading
        // desktop.declare: 42 flows, 526 MB retained, for a window showing about
        // 12 MB of them.
        //
        // That is not merely waste. `redraw()` asks CoreGraphics for a fresh
        // buffer each time (a 3000pt band at 2x on a wide window is ~72 MB), and
        // a half-gigabyte of dead bitmaps is exactly what makes that allocation
        // fail — silently, see below. Releasing here keeps the retained set to
        // what is actually being shown; the flow re-rasters when it returns,
        // which is what the band mechanism is for.
        if visible.isNull || visible.isEmpty {
            if contentLayer.contents != nil {
                contentLayer.contents = nil
                bandH = 0                     // no bitmap ⇒ no band; re-raster on return
            }
            return
        }
        if h <= RichOverlay.bandLimit {
            // Small enough to hold whole; raster once and never again.
            if bandDirty || bandTop != 0 || bandH != h { bandTop = 0; bandH = h; redraw() }
            placeBand(inBox: lastBox)
            return
        }
        let wantTop = max(0, visible.minY - RichOverlay.bandMargin)
        let wantBot = min(h, visible.maxY + RichOverlay.bandMargin)
        if !bandDirty, bandH > 0, wantTop >= bandTop, wantBot <= bandTop + bandH {
            placeBand(inBox: lastBox)
            return                                        // already covered
        }
        // Centre a band-limit slice on the wanted range, clamped to the flow.
        let want = visible.midY
        var top = max(0, want - RichOverlay.bandLimit / 2)
        if top + RichOverlay.bandLimit > h { top = max(0, h - RichOverlay.bandLimit) }
        let wasTop = bandTop, wasH = bandH
        bandTop = top
        bandH = min(RichOverlay.bandLimit, h - top)
        // ⚠ VERIFY THE RASTER, do not assume it. `redraw()` can return without
        // drawing anything — its CGContext allocation is a guard with a bare
        // `else { return }`, and a wide window's band is tens of megabytes. When
        // that happened the band's COORDINATES had already been committed above,
        // so `placeBand` positioned the layer for a slice that was never drawn:
        // the flow's own borders and background still painted at full height
        // while the text inside them was simply absent. That is the "blank areas
        // once you scroll down a bit" in the reader, and it is the same class of
        // bug as a build script that reports success for a step that failed.
        //
        // Keeping the OLD band on failure is strictly better: it is a slice of
        // the right document, drawn correctly, merely in the wrong place — and
        // the next scroll asks again.
        if !redraw() {
            bandTop = wasTop; bandH = wasH
            NSLog("[Declare] ⚠︎ rich flow %.0fpt: could not raster its %.0fpt band — keeping the previous one.",
                  h, RichOverlay.bandLimit)
        }
        placeBand(inBox: lastBox)
    }

    /// Render the laid-out glyphs into the layer.
    ///
    /// NSLayoutManager draws top-down, so the bitmap is flipped once here and
    /// handed to AppKit as a flipped context — the same geometry the layout
    /// manager measured with, which is why the baselines do not move.
    /// Instrumentation: how many flow bitmaps a frame produces and how big they
    /// are. Each one becomes a CALayer `contents`, and the UPLOAD lands in
    /// CATransaction.commit — which is where the resize cost turned out to be.
    nonisolated(unsafe) static var redrawCount = 0
    nonisolated(unsafe) static var redrawMP = 0.0
    nonisolated(unsafe) static var redrawMs = 0.0
    nonisolated(unsafe) static var statsOn = false

    /// Raster the current band. ANSWERS WHETHER IT DREW — every caller has
    /// already committed state that is only true if it did (see ensureBand).
    @discardableResult
    func redraw() -> Bool {
        let _t0 = RichOverlay.statsOn ? CFAbsoluteTimeGetCurrent() : 0
        defer { if RichOverlay.statsOn { RichOverlay.redrawMs += (CFAbsoluteTimeGetCurrent() - _t0) * 1000 } }
        guard let lm = text.layoutManager, let tc = text.textContainer else { return false }
        // Default the band to the whole flow — capped, so the very first raster
        // is a valid bitmap even for a document no single buffer could hold.
        // `ensureBand` refines it as soon as visibility is known.
        if bandH <= 0 { bandTop = 0; bandH = max(1, min(lastHeight, RichOverlay.bandLimit)) }
        let w = max(1, flowWidth), h = max(1, bandH)
        let pw = Int(ceil(w * scale)), ph = Int(ceil(h * scale))
        guard pw > 0, ph > 0, pw < 20000, ph < 20000,
              let cs = CGColorSpace(name: CGColorSpace.sRGB),
              let cg = CGContext(data: nil, width: pw, height: ph, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: cs,
                                 bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
                                     | CGBitmapInfo.byteOrder32Little.rawValue)
        else { return false }
        cg.scaleBy(x: scale, y: scale)
        cg.translateBy(x: 0, y: h)
        cg.scaleBy(x: 1, y: -1)
        let ns = NSGraphicsContext(cgContext: cg, flipped: true)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = ns
        // Everything is drawn shifted up by the band's top, so flow-y bandTop
        // lands on the bitmap's first row. Only the glyphs in the band are asked
        // for — drawing 2725 lines to clip 60 of them is the slow way to be right.
        let at = CGPoint(x: 0, y: -bandTop)
        let bandRect = CGRect(x: 0, y: bandTop, width: w, height: h)
        let glyphs = lm.glyphRange(forBoundingRect: bandRect, in: tc)
        if selRange.length > 0 {
            NSColor.selectedTextBackgroundColor.setFill()
            let sel = lm.glyphRange(forCharacterRange: selRange, actualCharacterRange: nil)
            lm.enumerateEnclosingRects(forGlyphRange: sel, withinSelectedGlyphRange: sel,
                                       in: tc) { r, _ in r.offsetBy(dx: at.x, dy: at.y).fill() }
        }
        lm.drawBackground(forGlyphRange: glyphs, at: at)
        lm.drawGlyphs(forGlyphRange: glyphs, at: at)
        NSGraphicsContext.restoreGraphicsState()
        contentLayer.contentsScale = scale
        guard let image = cg.makeImage() else { return false }
        contentLayer.contents = image
        if RichOverlay.statsOn { RichOverlay.redrawCount += 1; RichOverlay.redrawMP += Double(pw * ph) / 1_000_000 }
        return true
    }

    /// How much bitmap this flow is holding. A rich overlay's `contents` is a
    /// full CGImage of its band, so a document's worth of them is the largest
    /// thing the host retains — and nothing released them.
    var bitmapBytes: Int {
        guard contentLayer.contents != nil else { return 0 }
        let w = contentLayer.bounds.width * contentLayer.contentsScale
        let h = contentLayer.bounds.height * contentLayer.contentsScale
        return Int(w * h * 4)
    }

    // ── selection, against the same layout manager ─────────────────────────

    /// A point in the FLOW's own space (top-left origin) → character index.
    private func index(at p: NSPoint) -> Int {
        guard let lm = text.layoutManager, let tc = text.textContainer else { return 0 }
        let g = lm.glyphIndex(for: p, in: tc, fractionOfDistanceThroughGlyph: nil)
        return lm.characterIndexForGlyph(at: g)
    }

    func selectionBegin(at p: NSPoint) {
        guard selectable else { return }
        selAnchor = index(at: p)
        selRange = NSRange(location: selAnchor, length: 0)
        redraw()
    }

    func selectionExtend(to p: NSPoint) {
        guard selectable else { return }
        let i = index(at: p)
        selRange = NSRange(location: min(selAnchor, i), length: abs(i - selAnchor))
        redraw()
    }

    func selectionClear() {
        guard selRange.length > 0 else { return }
        selRange = NSRange(location: 0, length: 0)
        redraw()
    }

    var selectedText: String? {
        guard selRange.length > 0, let st = text.textStorage, selRange.upperBound <= st.length else { return nil }
        return st.attributedSubstring(from: selRange).string
    }

    /// The link at a point, if any — the layout manager answers this too, so
    /// links keep working without an NSTextView in the hierarchy.
    func link(at p: NSPoint) -> String? {
        guard let st = text.textStorage else { return nil }
        let i = index(at: p)
        guard i < st.length else { return nil }
        let v = st.attribute(.link, at: i, effectiveRange: nil)
        if let u = v as? URL { return u.absoluteString }
        return v as? String
    }

    var height: CGFloat { lastHeight }
    var isMounted: Bool { contentLayer.superlayer != nil }
    func remove() { contentLayer.removeFromSuperlayer() }
    var acceptsHits: Bool { selectable }

    /// Diagnostic: where this flow actually BREAKS ITS LINES, and how wide the
    /// container it broke them in is.
    ///
    /// The measurer agrees with Chrome to the last digit on advances, so a wrap
    /// divergence is not a metrics problem — it is the two wrap ENGINES
    /// disagreeing (NSLayoutManager here, the browser there). This prints the
    /// line fragments so the two can be compared break for break.
    func dumpLines(limit: Int = 12) -> String {
        guard let lm = text.layoutManager, let tc = text.textContainer,
              let store = text.textStorage else { return "no layout" }
        var out = ["container=\(NSStringFromSize(tc.containerSize)) flowWidth=\(flowWidth)"
                 + " padding=\(tc.lineFragmentPadding) inset=\(NSStringFromSize(text.textContainerInset))"
                 + " chars=\(store.length) usedW=\(lm.usedRect(for: tc).width)"]
        var shown = 0
        lm.enumerateLineFragments(forGlyphRange: lm.glyphRange(for: tc)) { _, used, _, glyphRange, stop in
            if shown >= limit { stop.pointee = true; return }
            let cr = lm.characterRange(forGlyphRange: glyphRange, actualGlyphRange: nil)
            let s = (store.string as NSString).substring(with: cr)
            out.append(String(format: "  line %2d w=%7.2f chars=%d..%d %@", shown,
                              used.width, cr.location, cr.location + cr.length,
                              "|" + s.replacingOccurrences(of: "\n", with: "⏎").suffix(28)))
            shown += 1
        }
        return out.joined(separator: "\n")
    }
}

/// A native text field over its view's box: caret, IME, autofill, undo — the
/// platform's, not an imitation.
final class EditableOverlay: NSObject, NSTextFieldDelegate, NSTextViewDelegate {
    private let id: Int
    private unowned let view: DeclareView
    private unowned let bridge: Bridge
    private var field: NSTextField?
    private var textView: NSTextView?
    private var scroll: NSScrollView?
    /// A clipping container the editable actually lives in.
    ///
    /// `visibleRect` works out what part of the box survives its ancestors'
    /// clips and anything painted over it — but knowing that is useless if the
    /// overlay is still sized to the FULL box, which is what it was: `vis` only
    /// ever decided hidden-or-not. So a half-covered editor drew its whole self
    /// over the window in front of it. The editable now sits inside this view,
    /// which is sized to the visible part and clips; the editable keeps its full
    /// size and shifts within it, so its own scrolling is untouched.
    private let clipBox: NSView = {
        let v = NSView()
        v.clipsToBounds = true
        return v
    }()
    private var multiline = false
    /// Does this editor WRAP? False means long lines run off to the right and
    /// the scroll view carries them, which is what `wrap = false` asks for.
    private var wraps = true
    private var padding: CGFloat = 0
    /// The last spec, kept so a LATER text style can be applied to it.
    ///
    /// The two ops are independent and arrive in either order: EDIT carries the
    /// value/placeholder, TEXTSTYLE the face. Configuring only on EDIT left an
    /// editable wearing whatever style happened to precede it — which is why the
    /// Viewer's live-edit source editor was PROPORTIONAL while the DOM's was
    /// monospace, its TEXTSTYLE having landed after its EDIT.
    private var spec: [String: Any]?

    init(id: Int, view: DeclareView, bridge: Bridge) {
        self.id = id; self.view = view; self.bridge = bridge
        super.init()
    }

    /// Re-apply the current spec under a new text style (a TEXTSTYLE after EDIT).
    func restyle(_ style: TextStyleSpec) {
        guard let s = spec else { return }
        configure(s, style: style)
    }

    func configure(_ spec: [String: Any], style: TextStyleSpec) {
        self.spec = spec
        let ml = (spec["multiline"] as? NSNumber)?.boolValue ?? false
        padding = CGFloat((spec["padding"] as? NSNumber)?.doubleValue ?? 0)
        let value = spec["value"] as? String ?? ""
        let placeholder = spec["placeholder"] as? String ?? ""
        let font = TextEngine.nsFont(TextEngine.parse(style.fontCSS))
        if ml != multiline { remove(); multiline = ml }
        if ml {
            if scroll == nil {
                let sc = NSScrollView()
                let tv = NSTextView()
                tv.isEditable = true; tv.isSelectable = true
                tv.drawsBackground = false
                tv.delegate = self
                tv.textContainerInset = NSSize(width: padding, height: padding)
                tv.isAutomaticQuoteSubstitutionEnabled = false
                tv.isAutomaticDashSubstitutionEnabled = false
                // GROW WITH THE TEXT. Without this an NSTextView keeps whatever
                // frame it is given, so the scroll view's document was exactly
                // its own clip view and there was nothing to scroll — see the
                // note in `place`. Same setup RichOverlay uses to flow.
                tv.isVerticallyResizable = true
                tv.minSize = .zero
                tv.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude,
                                    height: CGFloat.greatestFiniteMagnitude)
                sc.drawsBackground = false
                sc.hasVerticalScroller = true
                sc.autohidesScrollers = true
                sc.documentView = tv
                if clipBox.superview == nil { view.addSubview(clipBox) }
                clipBox.addSubview(sc)
                scroll = sc; textView = tv
            }
            // WRAP, which crossed the bridge and was being dropped. The backend
            // sends it (mac-backend `wrap: spec.wrap !== false`) and only the
            // single-line field ever read it, so a `wrap = false` editor wrapped
            // natively while the web's textarea scrolled sideways — the Viewer's
            // Edit tab is exactly that editor.
            let wrapText = (spec["wrap"] as? NSNumber)?.boolValue ?? true
            if wrapText != wraps { wraps = wrapText }
            textView?.isHorizontallyResizable = !wrapText
            textView?.textContainer?.widthTracksTextView = wrapText
            scroll?.hasHorizontalScroller = !wrapText
            textView?.font = font
            textView?.textColor = style.color ?? .labelColor
            textView?.isContinuousSpellCheckingEnabled = (spec["spellcheck"] as? NSNumber)?.boolValue ?? false
            if textView?.string != value { textView?.string = value }
            docDirty = true            // new text (or a new style) ⇒ new height
        } else {
            if field == nil {
                let f = NSTextField()
                f.isBordered = false
                f.drawsBackground = false
                f.focusRingType = .none
                f.delegate = self
                f.cell?.usesSingleLineMode = true
                f.cell?.wraps = false
                if clipBox.superview == nil { view.addSubview(clipBox) }
                clipBox.addSubview(f)
                field = f
            }
            field?.font = font
            field?.textColor = style.color ?? .labelColor
            field?.placeholderString = placeholder
            field?.alignment = style.align
            if field?.stringValue != value { field?.stringValue = value }
        }
    }

    func controlTextDidChange(_ obj: Notification) {
        bridge.call("__declareEditInput", [id, field?.stringValue ?? ""])
    }
    func textDidChange(_ notification: Notification) {
        bridge.call("__declareEditInput", [id, textView?.string ?? ""])
    }
    func control(_ control: NSControl, textView: NSTextView, doCommandBy sel: Selector) -> Bool {
        if sel == #selector(NSResponder.insertNewline(_:)) {
            bridge.call("__declareEditEnter", [id]); return true
        }
        return false
    }

    /// EDITSEL — the caret/selection write half (TextInput.select, #22).
    /// Clamped to the current string. The single-line path goes through the
    /// field editor, which exists once the field has focus — the runtime
    /// orders EDITFOCUS first and re-sends a held selection at focus.
    func setSelection(_ start: Int, _ end: Int) {
        if let tv = textView {
            let n = (tv.string as NSString).length
            let s = max(0, min(n, start)), e = max(0, min(n, end))
            tv.setSelectedRange(NSRange(location: s, length: e - s))
            tv.scrollRangeToVisible(NSRange(location: s == e ? s : e, length: 0))
        } else if let f = field, let ed = f.currentEditor() {
            let n = (ed.string as NSString).length
            let s = max(0, min(n, start)), e = max(0, min(n, end))
            ed.selectedRange = NSRange(location: s, length: e - s)
        }
    }

    func setFocus(_ on: Bool) {
        let responder: NSView? = multiline ? textView : field
        if on { view.window?.makeFirstResponder(responder) }
        else if view.window?.firstResponder === responder { view.window?.makeFirstResponder(view) }
        bridge.call("__declareEditFocus", [id, on])
    }

    func place(_ r: CGRect, clippedTo vis: CGRect) {
        // An editable is clipped the same way a flow is: gone when nothing of it
        // survives, and CUT DOWN to what does when only part does.
        let vr = r.intersection(vis)
        let hidden = vis.isEmpty || vr.isNull || vr.isEmpty
        clipBox.isHidden = hidden
        field?.isHidden = hidden
        scroll?.isHidden = hidden
        if hidden { return }
        // The container takes the visible part; the editable keeps its FULL size
        // and slides within it, so what is on screen stays put and the field's
        // own scrolling is untouched.
        clipBox.frame = vr
        let off = CGPoint(x: r.origin.x - vr.origin.x, y: r.origin.y - vr.origin.y)
        if multiline {
            scroll?.frame = CGRect(origin: off, size: r.size)
            // ⚠ THE DOCUMENT IS NOT THE VIEWPORT. This used to size the text
            // view to the scroll view's own size, every frame — which hands
            // NSScrollView a document exactly as big as its clip view, so there
            // is nothing to scroll: no scroller, and a wheel over the editor
            // correctly does nothing because the document already fits. A file
            // longer than the pane simply ended at the fold, with no way to
            // reach the rest. (The same editor on the web is a <textarea>, which
            // scrolls, so this was native-only.)
            //
            // The document is sized from its TEXT — but only when something that
            // could change that height has changed, because this is called on
            // every commit and laying out 155 KB of source per frame is not free.
            if docDirty || r.size != lastViewport {
                lastViewport = r.size
                docDirty = false
                sizeDocument(toViewport: r.size)
            }
        } else {
            let h = (field?.intrinsicContentSize.height ?? r.height)
            field?.frame = CGRect(x: off.x + padding, y: off.y + (r.height - h) / 2,
                                  width: max(0, r.width - padding * 2), height: h)
        }
    }

    func remove() {
        clipBox.removeFromSuperview()
        field?.removeFromSuperview(); field = nil
        scroll?.removeFromSuperview(); scroll = nil; textView = nil
    }

    func hitTest(_ p: NSPoint) -> Bool {
        if let f = field { return f.frame.contains(p) }
        if let s = scroll { return s.frame.contains(p) }
        return false
    }

    /// Has anything changed that could change the document's height?
    private var docDirty = true
    private var lastViewport: CGSize = .zero

    /// Size the multiline document to its TEXT, which is what gives the scroll
    /// view something to scroll. At least the viewport, so a short file still
    /// fills the pane and clicking below the last line lands in the editor.
    private func sizeDocument(toViewport viewport: CGSize) {
        guard let tv = textView, let lm = tv.layoutManager, let tc = tv.textContainer else { return }
        let inset = padding * 2
        // WRAPPING is a property of the container's width: bounded re-wraps to
        // the pane, unbounded lets long lines run and the scroll view carry them.
        tc.containerSize = NSSize(width: wraps ? max(1, viewport.width - inset) : CGFloat.greatestFiniteMagnitude,
                                  height: CGFloat.greatestFiniteMagnitude)
        if wraps { tv.frame.size.width = viewport.width }
        lm.ensureLayout(for: tc)
        let used = lm.usedRect(for: tc)
        tv.frame.size = NSSize(width: max(viewport.width, ceil(used.width) + inset),
                               height: max(viewport.height, ceil(used.height) + inset))
    }
}

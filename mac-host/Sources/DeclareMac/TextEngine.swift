// TextEngine — Core Text behind the runtime's one measurement seam.
//
// measure.ts asks the host for exactly a canvas-2d `measureText`: width plus
// font/actual bounding-box ascent and descent. That seam (provideMeasurer) is
// why the native host needs no changes above it — the same wrapping, the same
// baseline pinning, the same intrinsic sizing, now answered by CTFont.
//
// The font string is CSS ("italic 600 13px SF Pro, system-ui"), the one
// encoding both web backends already use; parsing it here keeps that single
// encoding true across all three renderers.

import AppKit
import CoreText

enum TextEngine {
    struct Font: Hashable {
        var family: String
        var size: Double
        var weight: Int
        var italic: Bool
    }

    private static var fontCache: [Font: NSFont] = [:]
    private static var measureCache: [String: [Double]] = [:]

    /// "italic 600 13px SF Pro Text, system-ui" → a resolved NSFont.
    static func parse(_ css: String) -> Font {
        var italic = false
        var weight = 400
        var size = 13.0
        var family = "system-ui"
        var rest = css.trimmingCharacters(in: .whitespaces)

        if rest.hasPrefix("italic ") { italic = true; rest = String(rest.dropFirst(7)) }
        // weight (a number or a keyword)
        let parts = rest.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
        if let first = parts.first {
            if let w = Int(first) { weight = w; rest = parts.count > 1 ? String(parts[1]) : "" }
            else if first == "bold" { weight = 700; rest = parts.count > 1 ? String(parts[1]) : "" }
            else if first == "normal" { weight = 400; rest = parts.count > 1 ? String(parts[1]) : "" }
        }
        // size in px, then the family list
        if let r = rest.range(of: "px") {
            size = Double(rest[rest.startIndex..<r.lowerBound].trimmingCharacters(in: .whitespaces)) ?? 13
            rest = String(rest[r.upperBound...]).trimmingCharacters(in: .whitespaces)
        }
        if !rest.isEmpty { family = rest }
        return Font(family: family, size: size, weight: weight, italic: italic)
    }

    static func nsFont(_ f: Font) -> NSFont {
        if let c = fontCache[f] { return c }
        let resolved = resolve(f)
        if fontCache.count > 512 { fontCache.removeAll() }
        fontCache[f] = resolved
        return resolved
    }

    /// What a CSS GENERIC family resolves to — the reference's table, measured.
    ///
    /// This is not a matter of taste, and Core Text's own answers are the wrong
    /// ones. Chrome on macOS maps each generic to a specific face, and those
    /// faces have different advances and different line boxes from the system
    /// font Core Text reaches for:
    ///
    ///   generic       Chrome      Core Text's instinct   consequence
    ///   sans-serif    Helvetica   SF Pro (system)        prose ~4.4% wider → wraps early
    ///   monospace     Menlo       SF Mono                code line box 15px vs 14px at 12px
    ///   serif         Times       (was Times New Roman)  asc/desc 13/4 vs 12/3
    ///   cursive       Apple Chancery
    ///   fantasy       Papyrus
    ///
    /// `system-ui` / `-apple-system` genuinely ARE the system font, so they stay.
    /// Measured with canvas measureText + fontBoundingBox* against this host's
    /// own measurer (`mac/codemetrics.mjs`, `ctl.mjs metrics`).
    private static let generics: [String: String] = [
        "sans-serif": "Helvetica", "ui-sans-serif": "Helvetica",
        "monospace": "Menlo", "ui-monospace": "Menlo",
        "serif": "Times", "ui-serif": "Times",
        "cursive": "Apple Chancery", "fantasy": "Papyrus",
    ]

    private static func resolve(_ f: Font) -> NSFont {
        // The family list is CSS: try each, fall back to the system face —
        // which is what `system-ui` and `-apple-system` mean here anyway.
        let weight = nsWeight(f.weight)
        for raw in f.family.split(separator: ",") {
            var name = raw.trimmingCharacters(in: .whitespaces)
            name = name.trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
            let lower = name.lowercased()
            if lower == "system-ui" || lower == "-apple-system" || lower == "blinkmacsystemfont" {
                return styled(NSFont.systemFont(ofSize: f.size, weight: weight), f)
            }
            // A generic is rewritten to its concrete face and then resolved by
            // name below, so it picks up the weight/italic conversion like any
            // other family. A NAMED face is never rewritten: asking for `Menlo`
            // gets Menlo, and an absent family falls through to the next entry in
            // the list, as CSS says.
            if let concrete = generics[lower] { name = concrete }
            if let named = NSFont(name: name, size: f.size) {
                // Apply the requested weight via the font manager where possible.
                let fm = NSFontManager.shared
                let w = max(0, min(15, Int((Double(f.weight) / 1000.0) * 15)))
                if let converted = fm.font(withFamily: named.familyName ?? name,
                                           traits: f.italic ? .italicFontMask : [],
                                           weight: w, size: f.size) {
                    return converted
                }
                return styled(named, f)
            }
        }
        // Nothing in the list resolved. A monospace request must not land on a
        // proportional face — code would stop lining up — so honour the generic
        // even when its concrete face is missing.
        if f.family.lowercased().contains("mono") {
            return styled(NSFont.monospacedSystemFont(ofSize: f.size, weight: weight), f)
        }
        return styled(NSFont.systemFont(ofSize: f.size, weight: weight), f)
    }

    private static func styled(_ base: NSFont, _ f: Font) -> NSFont {
        guard f.italic else { return base }
        let d = base.fontDescriptor.withSymbolicTraits(.italic)
        return NSFont(descriptor: d, size: f.size) ?? base
    }

    private static func nsWeight(_ w: Int) -> NSFont.Weight {
        switch w {
        case ..<250: return .ultraLight
        case ..<350: return .light
        case ..<450: return .regular
        case ..<550: return .medium
        case ..<650: return .semibold
        case ..<750: return .bold
        case ..<850: return .heavy
        default: return .black
        }
    }

    /// The canvas measureText contract: [width, fontAscent, fontDescent,
    /// actualAscent, actualDescent]. An empty string still answers font
    /// metrics — fontMetrics() depends on exactly that.
    static func measure(text: String, font: String, letterSpacing: Double, scale: CGFloat) -> [Double] {
        let key = "\(font)\u{1}\(letterSpacing)\u{1}\(text)"
        if let c = measureCache[key] { return c }
        let f = nsFont(parse(font))
        // ROUNDED to integers, because that is what the browsers report and the
        // runtime derives layout from these numbers: line box = ascent+descent,
        // first baseline = ascent. Core Text's exact values (12.568/2.742 at
        // 13px) differ from Chrome's (13/3) by well under a pixel, but the error
        // is SYSTEMATIC — every stacked row inherits it, so six rows down a list
        // the drift is visible. Measured across five faces, Chrome's numbers are
        // exactly round(CoreText): 12.568→13, 2.742→3, 10.635→11, 2.320→2,
        // 15.469→15, 3.375→3. Matching the rounding matches the layout.
        let ascent = Double(f.ascender.rounded())
        let descent = Double((-f.descender).rounded())
        var width = 0.0
        var actualAscent = ascent
        var actualDescent = descent
        if !text.isEmpty {
            var attrs: [NSAttributedString.Key: Any] = [.font: f]
            if letterSpacing != 0 { attrs[.kern] = letterSpacing }
            let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attrs))
            var asc: CGFloat = 0, desc: CGFloat = 0, lead: CGFloat = 0
            width = CTLineGetTypographicBounds(line, &asc, &desc, &lead)
            // The canvas contract's `actualBoundingBox*` is the INK box — how far
            // the drawn glyphs actually reach from the baseline — not the line's
            // typographic extent. `.useOpticalBounds` returns the latter, which
            // read ~33 where Chrome reads ~24 for "[  ]" at 34px. The runtime
            // centres text on this box, so the error placed the dock's `[ ]`
            // glyph 4pt low. `.useGlyphPathBounds` is the ink box.
            let bounds = CTLineGetBoundsWithOptions(line, .useGlyphPathBounds)
            actualAscent = Double(bounds.maxY)
            actualDescent = Double(-bounds.minY)
        }
        let out = [width, ascent, descent, actualAscent, actualDescent]
        if measureCache.count > 4096 { measureCache.removeAll() }
        measureCache[key] = out
        return out
    }

    /// An attributed string for a run, matching what the measurer promised.
    static func attributed(_ text: String, style: TextStyleSpec) -> NSAttributedString {
        let f = nsFont(parse(style.fontCSS))
        var attrs: [NSAttributedString.Key: Any] = [.font: f]
        attrs[.foregroundColor] = style.color ?? NSColor.labelColor
        if style.letterSpacing != 0 { attrs[.kern] = style.letterSpacing }
        let p = NSMutableParagraphStyle()
        p.alignment = style.align
        p.lineBreakMode = style.wrap ? .byWordWrapping : .byClipping
        // The DOM backend pins line-height to ascent+descent (no half-leading);
        // mirror it so a single line sits at the same baseline in both.
        p.minimumLineHeight = f.ascender - f.descender
        p.maximumLineHeight = style.wrap ? 0 : f.ascender - f.descender
        attrs[.paragraphStyle] = p
        if let sh = style.shadow {
            let s = NSShadow()
            s.shadowOffset = NSSize(width: sh.0, height: -sh.1)   // y-down → AppKit y-up
            s.shadowBlurRadius = sh.2
            s.shadowColor = sh.3
            attrs[.shadow] = s
        }
        return NSAttributedString(string: text, attributes: attrs)
    }
}

/// A gradient ramp to clip to glyph outlines — Text's `textFill`. The DOM does
/// this with `background-clip: text` and the canvas with a clipped ramp over the
/// box; the angle is the same CSS compass the box gradients use.
struct TextGradient {
    var angle: Double
    var colors: [CGColor]
    var locations: [CGFloat]
}

struct TextStyleSpec {
    var fontCSS: String = "13px system-ui"
    var color: NSColor? = nil
    var align: NSTextAlignment = .left
    var wrap: Bool = false
    var letterSpacing: Double = 0
    var selectable: Bool = false
    var shadow: (Double, Double, Double, NSColor)? = nil
    /// When set, this OVERRIDES `color` — as `textFill` overrides `textColor`.
    var fillGradient: TextGradient? = nil
}

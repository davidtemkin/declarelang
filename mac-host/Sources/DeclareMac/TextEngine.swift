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
        /// CSS's font-variant slot, which `fontString` fills for a small-caps run.
        /// It belongs in the KEY as well as the face: a small-caps run measures
        /// differently from the same string without it.
        var smallCaps: Bool = false
    }

    // Both caches are reached from TWO threads since the runtime moved off
    // main (Bridge, THE RUNTIME THREAD): the runtime's `H.measure` and the
    // layer tree's applyText. A Swift dictionary mutated from two threads
    // crashes (measured: SIGSEGV in Dictionary.subscript.getter loading the
    // homepage, 2026-09-10) — so one lock guards every access.
    private static var fontCache: [Font: NSFont] = [:]
    private static var measureCache: [String: [Double]] = [:]
    private static let cacheLock = NSLock()

    /// "italic 600 13px SF Pro Text, system-ui" → a resolved NSFont.
    static func parse(_ css: String) -> Font {
        var italic = false
        var weight = 400
        var size = 13.0
        var family = "system-ui"
        var rest = css.trimmingCharacters(in: .whitespaces)

        if rest.hasPrefix("italic ") { italic = true; rest = String(rest.dropFirst(7)) }
        // THE VARIANT SLOT. The CSS shorthand is style, variant, weight, size,
        // family, and measure.ts fills the variant for a small-caps run — so this
        // string arrives as "small-caps 400 16px Rowan". Failing to consume the
        // token left it in front of the size, the size parse failed, and the run
        // was MEASURED at the 13px fallback in the wrong family while it was
        // DRAWN at its real size: every width, wrap and line box wrong, on one
        // renderer only.
        var smallCaps = false
        if rest.hasPrefix("small-caps ") { smallCaps = true; rest = String(rest.dropFirst(11)) }
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
        return Font(family: family, size: size, weight: weight, italic: italic, smallCaps: smallCaps)
    }

    static func nsFont(_ f: Font) -> NSFont {
        cacheLock.lock()
        if let c = fontCache[f] { cacheLock.unlock(); return c }
        cacheLock.unlock()
        let resolved = f.smallCaps ? smallCaps(resolve(f)) : resolve(f)
        cacheLock.lock()
        if fontCache.count > 512 { fontCache.removeAll() }
        fontCache[f] = resolved
        cacheLock.unlock()
        return resolved
    }

    /// Drop every memo. A face that lands after something was measured makes
    /// both caches lie: the entry says "13px Title" and holds the fallback's
    /// numbers. FontRegistry calls this whenever the face table changes.
    static func flushFontCaches() {
        cacheLock.lock()
        fontCache.removeAll()
        measureCache.removeAll()
        cacheLock.unlock()
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

    /// THE DERIVED-FAMILY MARKER (runtime/src/font-features.ts). OpenType
    /// features travel inside the family NAME, because the family name is the
    /// one channel the CSS font string — the single encoding all three
    /// renderers share — already carries. `Hoefler_Text--ot--lnum-tnum` is
    /// Hoefler Text with lining, tabular figures, and the host applies them
    /// through a Core Text descriptor rather than registering a second family
    /// the way the web side does. Both halves are pinned against each other in
    /// test/text.test.mjs.
    private static let OT_MARK = "--ot--"

    /// One entry from a CSS family list → a face, or nil to try the next entry.
    private static func resolveOne(_ name0: String, _ f: Font) -> NSFont? {
        var name = name0
        // A derived name resolves its BASE and then wears the features. If the
        // base does not resolve, nil sends the caller to the next list entry —
        // which is the plain base name, since the web side always writes the two
        // side by side.
        if let r = name.range(of: OT_MARK) {
            let base = String(name[name.startIndex..<r.lowerBound]).replacingOccurrences(of: "_", with: " ")
            let tags = String(name[r.upperBound...]).split(separator: "-").map(String.init)
            guard let plain = resolveOne(base, f) else { return nil }
            return withFeatures(plain, tags)
        }
        let weight = nsWeight(f.weight)
        let lower = name.lowercased()
        // A DECLARED family first (FontRegistry): `font Title [ Face [ … ] ]`
        // names a family no system lookup can find — the name is the
        // author's label, and a subset file usually carries no name of its
        // own. Before this, every declared face fell through to the system
        // font and the whole program rendered in a fallback.
        if let declared = FontRegistry.font(family: name, weight: f.weight, italic: f.italic, size: f.size) {
            return styled(declared, f)
        }
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
            if let face = cssFace(family: named.familyName ?? name, weight: f.weight, italic: f.italic, size: f.size) {
                return styled(face, f)
            }
            return styled(named, f)
        }
        return nil
    }

    /// A family's members as CSS sees them: the faces of the family's own width
    /// — the one nearest normal, so Helvetica Neue's condensed faces (a
    /// different `font-stretch`) are left out while a family that is ALL
    /// condensed (Avenir Next Condensed) keeps every face — each with its CSS
    /// weight read from the face's own weight trait, and its slant.
    private static var familyFaces: [String: [(name: String, weight: Int, italic: Bool)]] = [:]
    private static func faces(of family: String) -> [(name: String, weight: Int, italic: Bool)] {
        cacheLock.lock()
        if let hit = familyFaces[family] { cacheLock.unlock(); return hit }
        cacheLock.unlock()
        var members: [(name: String, font: NSFont, traits: [NSFontDescriptor.TraitKey: Any])] = []
        for m in NSFontManager.shared.availableMembers(ofFontFamily: family) ?? [] {
            guard let ps = m.first as? String, let font = NSFont(name: ps, size: 12) else { continue }
            members.append((ps, font, font.fontDescriptor.object(forKey: .traits) as? [NSFontDescriptor.TraitKey: Any] ?? [:]))
        }
        func width(_ t: [NSFontDescriptor.TraitKey: Any]) -> Double { (t[.width] as? NSNumber)?.doubleValue ?? 0 }
        let own = members.map { width($0.traits) }.min(by: { abs($0) < abs($1) }) ?? 0
        var out: [(name: String, weight: Int, italic: Bool)] = []
        for (ps, font, traits) in members {
            if abs(width(traits) - own) > 0.05 { continue }
            let w = (traits[.weight] as? NSNumber)?.doubleValue ?? 0
            // NSFont.Weight's steps (ultraLight −0.8 … black 0.62) → CSS 100…900
            let steps: [(Double, Int)] = [(-0.8, 100), (-0.6, 200), (-0.4, 300), (0, 400), (0.23, 500), (0.3, 600), (0.4, 700), (0.56, 800), (0.62, 900)]
            let css = steps.min(by: { abs($0.0 - w) < abs($1.0 - w) })?.1 ?? 400
            out.append((ps, css, font.fontDescriptor.symbolicTraits.contains(.italic)))
        }
        cacheLock.lock(); familyFaces[family] = out; cacheLock.unlock()
        return out
    }

    /// The face CSS font matching picks: the slant asked for if the family has
    /// it; then the exact weight, else — asking for 400 or 500 — the other of
    /// the two, then lighter, then heavier; asking lighter than 400, lighter
    /// first; heavier than 500, heavier first. AppKit's own 0–15 weight scale
    /// is per family (Helvetica Neue's Light is 3 and its 4 is Light
    /// CONDENSED), so asking it by number picked a narrower face than the web.
    private static func cssFace(family: String, weight: Int, italic: Bool, size: CGFloat) -> NSFont? {
        let all = faces(of: family)
        guard !all.isEmpty else { return nil }
        let slanted = all.filter { $0.italic == italic }
        let pool = slanted.isEmpty ? all : slanted
        let want = max(1, min(1000, weight))
        func rank(_ w: Int) -> (Int, Int) {
            if w == want { return (0, 0) }
            if want >= 400 && want <= 500 {
                if want == 400 && w == 500 { return (1, 0) }
                if want == 500 && w == 400 { return (1, 0) }
                if w < want { return (2, want - w) }
                return (3, w - want)
            }
            if want < 400 { return w < want ? (1, want - w) : (2, w - want) }
            return w > want ? (1, w - want) : (2, want - w)
        }
        guard let best = pool.min(by: { rank($0.weight) < rank($1.weight) }) else { return nil }
        return NSFont(name: best.name, size: size)
    }

    /// `base` with OpenType feature tags switched on, through Core Text's
    /// tag-keyed feature settings (the OpenType keys, not the old selector
    /// pairs — a tag is the same four bytes the web side writes).
    private static func withFeatures(_ base: NSFont, _ tags: [String]) -> NSFont {
        guard !tags.isEmpty else { return base }
        let settings: [[String: Any]] = tags.map {
            [kCTFontOpenTypeFeatureTag as String: $0, kCTFontOpenTypeFeatureValue as String: 1]
        }
        let d = CTFontDescriptorCreateCopyWithAttributes(
            base.fontDescriptor as CTFontDescriptor,
            [kCTFontFeatureSettingsAttribute as String: settings] as CFDictionary)
        return NSFont(descriptor: d as NSFontDescriptor, size: base.pointSize) ?? base
    }

    private static func resolve(_ f: Font) -> NSFont {
        // The family list is CSS: try each, fall back to the system face —
        // which is what `system-ui` and `-apple-system` mean here anyway.
        let weight = nsWeight(f.weight)
        for raw in f.family.split(separator: ",") {
            var name = raw.trimmingCharacters(in: .whitespaces)
            name = name.trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
            if let got = resolveOne(name, f) { return got }
            _ = name
        }
        // Nothing in the list resolved. A monospace request must not land on a
        // proportional face — code would stop lining up — so honour the generic
        // even when its concrete face is missing.
        if f.family.lowercased().contains("mono") {
            return styled(NSFont.monospacedSystemFont(ofSize: f.size, weight: weight), f)
        }
        return styled(NSFont.systemFont(ofSize: f.size, weight: weight), f)
    }

    /// Italic ADDED to the face's traits, never in place of them: replacing
    /// them with `.italic` alone dropped a bold system face to regular. And
    /// where the family has no italic at all, the browser slants the upright
    /// (Skia's quarter skew); so does this.
    private static func styled(_ base: NSFont, _ f: Font) -> NSFont {
        guard f.italic else { return base }
        if base.fontDescriptor.symbolicTraits.contains(.italic) { return base }
        let traits = base.fontDescriptor.symbolicTraits.union(.italic)
        let weight = (base.fontDescriptor.object(forKey: .traits) as? [NSFontDescriptor.TraitKey: Any])?[.weight]
        var t: [NSFontDescriptor.TraitKey: Any] = [.symbolic: traits.rawValue]
        if let weight { t[.weight] = weight }
        if let italic = NSFont(descriptor: base.fontDescriptor.addingAttributes([.traits: t]), size: f.size),
           italic.fontDescriptor.symbolicTraits.contains(.italic) {
            return italic
        }
        return oblique(base)
    }

    /// The upright, slanted — what a browser draws for italic when the family
    /// has no italic face (Skia: a skew of one quarter).
    static func oblique(_ base: NSFont) -> NSFont {
        let m = AffineTransform(m11: 1, m12: 0, m21: 0.25, m22: 1, tX: 0, tY: 0)
        let d = base.fontDescriptor.addingAttributes([.matrix: m])
        return NSFont(descriptor: d, size: base.pointSize) ?? base
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
    /// A face's ascent and descent as the browser reports them: Core Text's,
    /// rounded (see `measure`), with one more rule the browsers share. WebKit
    /// and Chromium raise the ascent of Times, Helvetica and Courier by 15% of
    /// the line box, so they line up with the Microsoft faces the web grew up
    /// on. `sans-serif` resolves to Helvetica and `serif` to Times, so without
    /// this every such line box was shorter than the browser's — 64 against 74
    /// at 64px — and every glyph sat that much higher in it.
    static func webMetrics(_ f: NSFont) -> (ascent: CGFloat, descent: CGFloat) {
        var ascent = f.ascender.rounded()
        let descent = (-f.descender).rounded()
        if let family = f.familyName, family == "Times" || family == "Helvetica" || family == "Courier" {
            ascent += ((ascent + descent) * 0.15).rounded()
        }
        return (ascent, descent)
    }

    static func measure(text: String, font: String, letterSpacing: Double, scale: CGFloat) -> [Double] {
        let key = "\(font)\u{1}\(letterSpacing)\u{1}\(text)"
        cacheLock.lock()
        if let c = measureCache[key] { cacheLock.unlock(); return c }
        cacheLock.unlock()
        let f = nsFont(parse(font))
        // ROUNDED to integers, because that is what the browsers report and the
        // runtime derives layout from these numbers: line box = ascent+descent,
        // first baseline = ascent. Core Text's exact values (12.568/2.742 at
        // 13px) differ from Chrome's (13/3) by well under a pixel, but the error
        // is SYSTEMATIC — every stacked row inherits it, so six rows down a list
        // the drift is visible. Measured across five faces, Chrome's numbers are
        // exactly round(CoreText): 12.568→13, 2.742→3, 10.635→11, 2.320→2,
        // 15.469→15, 3.375→3. Matching the rounding matches the layout.
        let (a, d) = webMetrics(f)
        let ascent = Double(a), descent = Double(d)
        var width = 0.0
        var actualAscent = ascent
        var actualDescent = descent
        if !text.isEmpty {
            var attrs: [NSAttributedString.Key: Any] = [.font: f]
            if letterSpacing != 0 { attrs[.kern] = letterSpacing }
            let run = parse(font).smallCaps ? smallCapsText(text, attrs: attrs) : NSAttributedString(string: text, attributes: attrs)
            let line = CTLineCreateWithAttributedString(run)
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
        cacheLock.lock()
        if measureCache.count > 4096 { measureCache.removeAll() }
        measureCache[key] = out
        cacheLock.unlock()
        return out
    }

    /// The INK box of a run, in the same space as `measure`'s advance width.
    /// Ink is not the advance: a glyph may paint outside the box its advance
    /// reserves (an overshooting `°`, an italic tail, a swash), and where the
    /// advance decides layout, the ink decides what a bitmap must hold to show
    /// the run whole.
    static func inkBounds(text: String, font: String, letterSpacing: Double) -> CGRect {
        guard !text.isEmpty else { return .zero }
        let f = nsFont(parse(font))
        var attrs: [NSAttributedString.Key: Any] = [.font: f]
        if letterSpacing != 0 { attrs[.kern] = letterSpacing }
        let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attrs))
        return CTLineGetBoundsWithOptions(line, .useGlyphPathBounds)
    }

    /// An attributed string for a run, matching what the measurer promised.
    static func attributed(_ text: String, style: TextStyleSpec) -> NSAttributedString {
        let parsed = parse(style.fontCSS)
        let f = nsFont(parsed)
        var attrs: [NSAttributedString.Key: Any] = [.font: f]
        attrs[.foregroundColor] = style.color ?? NSColor.labelColor
        if syntheticBold(parsed), style.outline == nil {
            attrs[.strokeWidth] = fakeBoldStroke(size: parsed.size)
            attrs[.strokeColor] = style.color ?? NSColor.labelColor
        }
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
        // Typographical treatments (the paint vocabulary the web backends carry).
        if style.underline { attrs[.underlineStyle] = NSUnderlineStyle.single.rawValue }
        if style.strike { attrs[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
        if let o = style.outline, o.0 > 0 {
            // CSS `-webkit-text-stroke` with `paint-order: stroke`: the stroke,
            // CENTERED on the glyph path at its full width, painted UNDER the
            // fill — so its outer half shows. A fill-and-stroke run paints the
            // stroke OVER the fill instead (halving it made a thinner ring eating
            // into the glyph), so the outline rides as a mark TextLayer draws
            // first, stroke only, before the run's fill.
            attrs[TextEngine.outlineKey] = [NSNumber(value: o.0), o.1]
        }
        if style.smallCaps {
            attrs[.font] = smallCaps(f)
            return smallCapsText(transform(text, style.transform), attrs: attrs)
        }
        return NSAttributedString(string: transform(text, style.transform), attributes: attrs)
    }

    /// The glyphs a `textTransform` paints — matched to measure.ts transformText,
    /// so a run's native width equals what the measurer promised. `capitalize`
    /// uppercases the first letter after each whitespace and leaves the rest.
    static func transform(_ s: String, _ kind: String?) -> String {
        switch kind {
        case "uppercase": return s.uppercased()
        case "lowercase": return s.lowercased()
        case "capitalize":
            var out = ""; var atStart = true
            for ch in s {
                if ch.isWhitespace { out.append(ch); atStart = true }
                else { out.append(atStart ? Character(ch.uppercased()) : ch); atStart = false }
            }
            return out
        default: return s
        }
    }

    /// The small-caps OpenType feature on a font — synthesized caps, matching
    /// the web backends' `font-variant: small-caps` / canvas `small-caps` font.
    /// Small capitals as the face's own `smcp` feature, switched on by a Core
    /// Text COPY of the font: re-resolving a system face through a descriptor
    /// with the feature added lost it for the weighted system faces (a bold
    /// small-caps run came out in ordinary lowercase).
    static func smallCaps(_ f: NSFont) -> NSFont {
        let settings: [[String: Any]] = [[kCTFontOpenTypeFeatureTag as String: "smcp", kCTFontOpenTypeFeatureValue as String: 1]]
        let d = CTFontDescriptorCreateWithAttributes([kCTFontFeatureSettingsAttribute as String: settings] as CFDictionary)
        return CTFontCreateCopyWithAttributes(f as CTFont, f.pointSize, nil, d) as NSFont
    }

    /// A Text's outline — [width, colour] — drawn by TextLayer under the fill.
    static let outlineKey = NSAttributedString.Key("declareOutline")

    /// Does this face carry real small capitals? Measured once per face: the
    /// lowercase alphabet with `smcp` against without — a face without the
    /// feature shapes the two alike.
    private static var smcpByFace: [String: Bool] = [:]
    static func hasSmallCaps(_ f: NSFont) -> Bool {
        cacheLock.lock()
        if let hit = smcpByFace[f.fontName] { cacheLock.unlock(); return hit }
        cacheLock.unlock()
        // the face WITHOUT any feature settings — a system face cannot be
        // re-made by name, so strip the attribute from its own descriptor
        var fa = f.fontDescriptor.fontAttributes
        fa.removeValue(forKey: .featureSettings)
        fa[.size] = 20
        let plain = NSFont(descriptor: NSFontDescriptor(fontAttributes: fa), size: 20) ?? f
        let abc = "abcdefghijklmnopqrstuvwxyz"
        func w(_ font: NSFont) -> Double {
            CTLineGetTypographicBounds(CTLineCreateWithAttributedString(NSAttributedString(string: abc, attributes: [.font: font])), nil, nil, nil)
        }
        let has = abs(w(plain) - w(smallCaps(plain))) > 0.01
        cacheLock.lock(); smcpByFace[f.fontName] = has; cacheLock.unlock()
        return has
    }

    /// Text in small capitals, as the browser sets it: the face's own `smcp`
    /// where it has one (the font in `attrs` is already that face), else
    /// SYNTHESIZED — each lowercase letter drawn as its capital at 0.7 of the
    /// size, Blink's figure (Helvetica, which `sans-serif` resolves to, has no
    /// small capitals; the Mac drew plain lowercase and the web capitals).
    static func smallCapsText(_ text: String, attrs: [NSAttributedString.Key: Any]) -> NSAttributedString {
        guard let f = attrs[.font] as? NSFont, !hasSmallCaps(f) else { return NSAttributedString(string: text, attributes: attrs) }
        let base = NSFont(descriptor: f.fontDescriptor, size: f.pointSize) ?? f
        let small = NSFont(descriptor: f.fontDescriptor, size: f.pointSize * 0.7) ?? f
        let out = NSMutableAttributedString()
        var bigAttrs = attrs; bigAttrs[.font] = base
        var smallAttrs = attrs; smallAttrs[.font] = small
        for ch in text {
            let s = String(ch)
            if s != s.uppercased() && s == s.lowercased() {
                out.append(NSAttributedString(string: s.uppercased(), attributes: smallAttrs))
            } else {
                out.append(NSAttributedString(string: s, attributes: bigAttrs))
            }
        }
        return out
    }

    /// Does the browser embolden this style synthetically? A declared family
    /// whose nearest face is lighter than 600, asked for 600 or more — the
    /// Blink rule. The face itself cannot say so (it is the lighter face), so
    /// the drawing side asks and strokes the glyphs (`fakeBoldStroke`).
    static func syntheticBold(_ f: Font) -> Bool {
        guard f.weight >= 600 else { return false }
        for raw in f.family.split(separator: ",") {
            let name = raw.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
            if let heaviest = FontRegistry.heaviestNear(family: name, weight: f.weight, italic: f.italic) { return heaviest < 600 }
            if name.lowercased() == "system-ui" || name.lowercased() == "-apple-system" || name.lowercased() == "blinkmacsystemfont" { return false }
            if NSFont(name: generics[name.lowercased()] ?? name, size: 12) != nil { return false }
        }
        return false
    }

    /// The emboldening, as a Core Text stroke: fill and stroke at a width that
    /// is a share of the size, as Skia's fake bold outsets by 1/24 of the size
    /// at 9px down to 1/32 at 36px. Negative: fill AND stroke.
    static func fakeBoldStroke(size: Double) -> Double {
        let t = max(0, min(1, (size - 9) / 27))
        let outset = size * (1.0 / 24 + (1.0 / 32 - 1.0 / 24) * t)
        return -(outset / size) * 100
    }

    /// Decode a Declare Color NUMBER → NSColor. Opaque colors are plain 0xRRGGBB;
    /// an alpha-bearing one is 2^32 + (rgb << 8) + a (value.ts colorWithAlpha).
    /// The rich-run bridge carries colors as numbers (not the CSS strings the
    /// standalone TEXTSTYLE op uses), so shadow/outline decode through here.
    static func declColor(_ n: NSNumber) -> NSColor {
        let value = n.int64Value
        let rgb: Int64; let alpha: CGFloat
        if value > 0xFFFFFF { rgb = (value >> 8) & 0xFFFFFF; alpha = CGFloat(value & 0xFF) / 255 }
        else { rgb = value & 0xFFFFFF; alpha = 1 }
        return NSColor(srgbRed: CGFloat((rgb >> 16) & 255) / 255,
                       green: CGFloat((rgb >> 8) & 255) / 255,
                       blue: CGFloat(rgb & 255) / 255, alpha: alpha)
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
    /// LINE CLAMP (measure.ts clampLines): at most this many lines, the last
    /// truncated with an ellipsis; a non-wrapping clamped run is one line.
    var maxLines: Int = 0
    /// Declared leading, as a MULTIPLIER of the font size (0 = the face's own
    /// ascent+descent). The runtime sizes the box with this, so a host that
    /// ignores it draws bunched lines inside a box sized for open ones.
    var lineHeight: Double = 0
    var letterSpacing: Double = 0
    var selectable: Bool = false
    var shadow: (Double, Double, Double, NSColor)? = nil
    /// When set, this OVERRIDES `color` — as `textFill` overrides `textColor`.
    var fillGradient: TextGradient? = nil
    // Typographical treatments — the span/Text paint vocabulary, matching the
    // web backends. `transform` reshapes the string; the rest are attributes.
    var outline: (Double, NSColor)? = nil       // (width px, color) — stroke under fill
    var transform: String? = nil                // "uppercase" | "lowercase" | "capitalize"
    var smallCaps: Bool = false
    var underline: Bool = false
    var strike: Bool = false
}

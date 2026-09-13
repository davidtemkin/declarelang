// FontRegistry — the program's declared `font` families, on the native host.
//
// A `font Name [ Face [ src = "…woff2", weight = bold ] ]` is CSS's @font-face:
// the family NAME is a label the author chose, deliberately decoupled from the
// name inside the file. On the web that decoupling comes free with FontFace;
// here it has to be modeled, so this registry maps (declared family, weight,
// slant) → a face, and TextEngine consults it BEFORE asking the system for a
// family by name. Without it, `fontFamily = Title` asked macOS for a family
// called "Title", found nothing, and every declared face rendered — and
// measured — in a fallback (registry §11, the web-fonts row).
//
// Two facts decided the shape, both measured on this machine 2026-09-13:
//
//   • Core Text reads WOFF2 directly (`CTFontManagerCreateFontDescriptorsFromData`
//     accepted Archivo, Sharpie and Rowan), so a face needs no decoding step.
//   • A descriptor built from those bytes makes a usable CTFont with no
//     process REGISTRATION at all — glyphs, metrics and variations all answer.
//     So nothing is installed for other applications and nothing outlives this
//     process; the bytes are held here and die with the program.
//
// The file's own names are not usable as keys: a subsetted face often has none
// (Sharpie and Rowan report nothing), and a variable file reports one family
// for nine instances (Archivo). The declared name is the only stable key, which
// is exactly what CSS says too.

import AppKit
import CoreText

enum FontRegistry {
    /// The OpenType variable weight axis, `wght`.
    private static let WGHT: UInt32 = 0x77676874

    /// One registered face. A DATA face carries the descriptor built from its
    /// bytes; a LOCAL face is `local("…")` — an installed family, by name.
    private struct Face {
        let family: String            // the DECLARED name, lowercased
        let weightMin: Int
        let weightMax: Int            // == weightMin unless the face is variable
        let italic: Bool
        let descriptor: CTFontDescriptor?
        let localName: String?
        let variable: Bool            // the file carries a `wght` axis
        let data: Data?               // held so the descriptor's bytes stay alive
    }

    private static var faces: [Face] = []
    private static let lock = NSLock()

    /// Forget every face. One host process runs many programs in turn, so the
    /// previous program's families must not shadow this one's (mac-boot calls
    /// this before it loads the new program's faces).
    static func clear() {
        lock.lock(); faces.removeAll(); lock.unlock()
        TextEngine.flushFontCaches()
    }

    /// The CSS weight descriptor a Face carries: "400", "bold", or "100 900"
    /// for a variable face's range.
    private static func weightRange(_ s: String) -> (Int, Int) {
        let nums = s.split(whereSeparator: { $0 == " " || $0 == "\t" }).compactMap { Int($0) }
        if nums.count >= 2 { return (min(nums[0], nums[1]), max(nums[0], nums[1])) }
        if let n = nums.first { return (n, n) }
        if s.lowercased() == "bold" { return (700, 700) }
        return (400, 400)
    }

    @discardableResult
    static func register(family: String, weight: String, italic: Bool, data: Data) -> Bool {
        guard let descs = CTFontManagerCreateFontDescriptorsFromData(data as CFData) as? [CTFontDescriptor],
              let first = descs.first else { return false }
        // A VARIABLE file answers every weight on its axis from one descriptor,
        // so the nine named instances Archivo reports are not nine faces here.
        var variable = false
        if let axes = CTFontCopyVariationAxes(CTFontCreateWithFontDescriptor(first, 16, nil)) as? [[String: Any]] {
            variable = axes.contains {
                ($0[kCTFontVariationAxisIdentifierKey as String] as? NSNumber)?.uint32Value == WGHT
            }
        }
        let (lo, hi) = weightRange(weight)
        add(Face(family: family.lowercased(), weightMin: lo, weightMax: hi, italic: italic,
                 descriptor: first, localName: nil, variable: variable, data: data))
        return true
    }

    /// `local("Work Sans Bold")` — an installed face, claimed under the
    /// declared family name. False when this machine does not have it, which is
    /// the answer the caller needs to try the next source in the chain.
    @discardableResult
    static func registerLocal(family: String, name: String, weight: String, italic: Bool) -> Bool {
        guard NSFont(name: name, size: 16) != nil else { return false }
        let (lo, hi) = weightRange(weight)
        add(Face(family: family.lowercased(), weightMin: lo, weightMax: hi, italic: italic,
                 descriptor: nil, localName: name, variable: false, data: nil))
        return true
    }

    private static func add(_ f: Face) {
        lock.lock()
        faces.removeAll {
            $0.family == f.family && $0.weightMin == f.weightMin
                && $0.weightMax == f.weightMax && $0.italic == f.italic
        }
        faces.append(f)
        lock.unlock()
        // Anything measured before this face landed was measured in a fallback.
        TextEngine.flushFontCaches()
    }

    /// CSS font matching, narrowed to what a `font` declaration can express:
    /// prefer the requested slant, then the nearest weight — a face whose range
    /// COVERS the asked-for weight counts as exact, which is how one variable
    /// file serves every weight.
    static func font(family: String, weight: Int, italic: Bool, size: CGFloat) -> NSFont? {
        let key = family.lowercased()
        lock.lock()
        let candidates = faces.filter { $0.family == key }
        lock.unlock()
        guard !candidates.isEmpty else { return nil }
        let matchingSlant = candidates.filter { $0.italic == italic }
        let pool = matchingSlant.isEmpty ? candidates : matchingSlant
        guard let best = pool.min(by: { distance($0, weight) < distance($1, weight) }) else { return nil }
        if let name = best.localName { return NSFont(name: name, size: size) }
        guard let d = best.descriptor else { return nil }
        if best.variable {
            let w = max(best.weightMin, min(best.weightMax, weight))
            let varied = CTFontDescriptorCreateCopyWithVariation(d, WGHT as CFNumber, CGFloat(w))
            return CTFontCreateWithFontDescriptor(varied, size, nil)
        }
        return CTFontCreateWithFontDescriptor(d, size, nil)
    }

    private static func distance(_ f: Face, _ w: Int) -> Int {
        if w >= f.weightMin && w <= f.weightMax { return 0 }
        return w < f.weightMin ? f.weightMin - w : w - f.weightMax
    }
}

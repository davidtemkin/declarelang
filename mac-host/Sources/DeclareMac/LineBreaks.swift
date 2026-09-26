// LineBreaks — where the browser may break a line, so the Mac breaks there too.
//
// The runtime measures text with this host's own Core Text widths, but it
// breaks lines by the browser's rules (runtime/src/measure.ts breakUnits) —
// and the layout it computes is built on those breaks. Core Text's own
// breaker differs: it breaks after "/" in a path or URL (neither Chrome nor
// WebKit does, measured 2026-09-25) and it places CJK and Thai breaks by its
// own lights. A Mac paragraph that broke elsewhere than the layout assumed
// showed different words on each line, and a URL wrapped where the web lets
// it overflow. This is the same rule, over UTF-16 offsets:
//
//   • after a run of spaces;
//   • after a hyphen, unless a digit follows;
//   • between two CJK or Hangul characters, except before closing punctuation
//     and small kana and after opening brackets (the kinsoku);
//   • at dictionary word boundaries inside Thai, Lao, Khmer and Myanmar —
//     CFStringTokenizer's, which is the same ICU data Intl.Segmenter uses;
//   • never inside a grapheme cluster.

import Foundation

enum LineBreaks {
    private static func isCJK(_ c: UInt32) -> Bool {
        (0x1100...0x11FF).contains(c) || (0x2E80...0x2FDF).contains(c) || (0x3000...0x303F).contains(c)
            || (0x3040...0x30FF).contains(c) || (0x3100...0x31FF).contains(c) || (0x3400...0x4DBF).contains(c)
            || (0x4E00...0x9FFF).contains(c) || (0xAC00...0xD7AF).contains(c) || (0xF900...0xFAFF).contains(c)
            || (0xFF00...0xFFEF).contains(c)
    }
    private static func isSEA(_ c: UInt32) -> Bool {
        (0x0E00...0x0EFF).contains(c) || (0x1000...0x109F).contains(c) || (0x1780...0x17FF).contains(c)
    }
    private static let noStart: Set<Character> = Set("、。，．・：；？！ー」』）］｝〕〉》】〙〗ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ々〻‐゠–〜～？！!?,.:;)]}")
    private static let noEnd: Set<Character> = Set("「『（［｛〔〈《【〘〖([{")

    /// The UTF-16 offsets a line may START at (0 and the end excluded), in order.
    static func opportunities(_ s: String) -> [Int] {
        let ns = s as NSString
        let n = ns.length
        guard n > 1 else { return [] }
        // grapheme cluster starts, with the Character each one is
        var starts: [Int] = []
        var chars: [Character] = []
        var i = 0
        while i < n {
            let r = ns.rangeOfComposedCharacterSequence(at: i)
            starts.append(i)
            chars.append(Character(ns.substring(with: r)))
            i = r.location + r.length
        }
        // dictionary word boundaries, where the text holds a script written without spaces
        var sea = Set<Int>()
        if s.unicodeScalars.contains(where: { isSEA($0.value) }) {
            let tok = CFStringTokenizerCreate(nil, s as CFString, CFRange(location: 0, length: n), kCFStringTokenizerUnitWordBoundary, nil)
            while CFStringTokenizerAdvanceToNextToken(tok) != [] {
                let r = CFStringTokenizerGetCurrentTokenRange(tok)
                sea.insert(r.location)
            }
        }
        func scalar(_ c: Character) -> UInt32 { c.unicodeScalars.first?.value ?? 0 }
        func space(_ c: Character) -> Bool { c == " " || c == "\t" }
        var out: [Int] = []
        for k in 1..<chars.count {
            let a = chars[k - 1], b = chars[k]
            if space(b) { continue }                                   // spaces stay with the line they end
            if space(a) { out.append(starts[k]); continue }
            if a == "-" && !(b.isNumber) { out.append(starts[k]); continue }
            let ca = scalar(a), cb = scalar(b)
            if (isCJK(ca) || isCJK(cb)) && !noStart.contains(b) && !noEnd.contains(a) { out.append(starts[k]); continue }
            if sea.contains(starts[k]) && (isSEA(ca) || isSEA(cb)) { out.append(starts[k]) }
        }
        return out
    }
}

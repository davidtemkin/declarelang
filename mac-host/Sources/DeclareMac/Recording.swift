// Recording — a drawing's recording as the runtime hands it over: its binary
// form (runtime/src/mac-backend.ts, encodeRecording), read in place.
//
// Each op is an opcode and its arguments in one array of numbers, `at` says
// where each op starts, and the strings it names sit in a table beside it. The
// replay (DrawReplay) and the describer (LayerDescribe) read the numbers
// directly — nothing is decoded into per-op records, and nothing is boxed.
//
// The opcodes, the argument order and the `set` key order are the runtime's
// (mac-backend.ts `OPCODE`, `SET_KEYS`); this file names the same numbers.

import CoreGraphics

/// The opcodes (mac-backend.ts `OPCODE`).
enum DrawOp {
    static let fillStyle = 1, fillGrad = 2, strokeStyle = 3, strokeGrad = 4, set = 5, setLineDash = 6
    static let fillRect = 7, strokeRect = 8, clearRect = 9
    static let beginPath = 10, moveTo = 11, lineTo = 12, arc = 13, arcTo = 14, ellipse = 15, rect = 16, roundRect = 17
    static let quadraticCurveTo = 18, bezierCurveTo = 19, closePath = 20
    static let fill = 21, stroke = 22, clip = 23, fillText = 24, strokeText = 25, drawImage = 26
    static let save = 27, restore = 28, translate = 29, rotate = 30, scale = 31, transform = 32, setTransform = 33, resetTransform = 34
}

/// A recorded gradient (draw.ts GradientRec), comparable so two paints can be
/// found equal (LayerDescribe merges marks that share one).
struct Gradient: Equatable {
    struct Stop: Equatable { let offset: CGFloat; let color: String }
    let kind: String                 // "linear" · "radial" · "conic"
    let coords: [CGFloat]
    let stops: [Stop]
}

/// A paint style: a CSS colour, or a gradient.
enum Style: Equatable {
    case color(String)
    case gradient(Gradient)
    var gradient: Gradient? { if case .gradient(let g) = self { return g }; return nil }
    var color: String? { if case .color(let c) = self { return c }; return nil }
}

struct Recording {
    let nums: [Double]
    let at: [UInt32]
    let strs: [String]
    /// The recording's bounds, in its own space.
    let bx: CGFloat, by: CGFloat, bw: CGFloat, bh: CGFloat

    private static let setKeys = [
        "lineWidth", "lineCap", "lineJoin", "miterLimit", "lineDashOffset",
        "globalAlpha", "globalCompositeOperation",
        "shadowBlur", "shadowColor", "shadowOffsetX", "shadowOffsetY",
        "filter", "font", "textAlign", "textBaseline", "direction",
        "letterSpacing", "wordSpacing", "fontKerning",
        "imageSmoothingEnabled", "imageSmoothingQuality",
    ]
    private static let gradKinds = ["linear", "radial", "conic"]

    var count: Int { at.count }
    /// Op i's opcode.
    func code(_ i: Int) -> Int { Int(nums[Int(at[i])]) }
    /// Op i's argument k (1 is the first after the opcode). A non-finite number
    /// (NaN from arithmetic on an unset value) reads as 0 — the value an absent
    /// argument has always read as — so Core Graphics never sees a NaN.
    func num(_ i: Int, _ k: Int) -> CGFloat { let v = nums[Int(at[i]) + k]; return v.isFinite ? CGFloat(v) : 0 }
    func flag(_ i: Int, _ k: Int) -> Bool { let v = nums[Int(at[i]) + k]; return v.isFinite && v != 0 }
    /// Op i's argument k, a string-table index, as its string.
    func str(_ i: Int, _ k: Int) -> String {
        let v = nums[Int(at[i]) + k]
        guard v.isFinite, v >= 0, Int(v) < strs.count else { return "" }
        return strs[Int(v)]
    }
    /// `n` numbers of op i starting at argument k.
    func numbers(_ i: Int, from k: Int, count n: Int) -> [CGFloat] {
        guard n > 0 else { return [] }
        return (0..<n).map { num(i, k + $0) }
    }
    /// A fill or stroke rule argument: nil (none given), "nonzero" or "evenodd".
    func evenOdd(_ i: Int, _ k: Int) -> Bool { nums[Int(at[i]) + k] == 2 }

    // ── styles ──
    func style(_ i: Int) -> Style {
        switch code(i) {
        case DrawOp.fillGrad, DrawOp.strokeGrad: return .gradient(gradient(i))
        default: return .color(str(i, 1))
        }
    }
    func gradient(_ i: Int) -> Gradient {
        let nc = Int(num(i, 2))
        let coords = numbers(i, from: 3, count: nc)
        let ns = Int(num(i, 3 + nc))
        let stops = (0..<max(0, ns)).map { k in Gradient.Stop(offset: num(i, 4 + nc + 2 * k), color: str(i, 5 + nc + 2 * k)) }
        return Gradient(kind: Self.gradKinds[min(2, max(0, Int(num(i, 1))))], coords: coords, stops: stops)
    }

    // ── `set` ops: [code, key, tag, value], tag 0 number · 1 string · 2 boolean ──
    func setKey(_ i: Int) -> String {
        let k = Int(num(i, 1))
        return k >= 0 && k < Self.setKeys.count ? Self.setKeys[k] : ""
    }
    /// The value as a number, or 0 when it was not recorded as one.
    func setNumber(_ i: Int) -> CGFloat { nums[Int(at[i]) + 2] == 0 ? num(i, 3) : 0 }
    /// The value as a string, or nil when it was not recorded as one.
    func setString(_ i: Int) -> String? { nums[Int(at[i]) + 2] == 1 ? str(i, 3) : nil }
    /// The value as a boolean: a recorded boolean, or a number that is 0 or 1.
    func setBool(_ i: Int) -> Bool? {
        let tag = nums[Int(at[i]) + 2], v = nums[Int(at[i]) + 3]
        if tag == 2 { return v != 0 }
        if tag == 0, v == 0 || v == 1 { return v == 1 }
        return nil
    }

    /// A roundRect's radii: [code, x, y, w, h, list, n, …radii] — one number or a list.
    func radii(_ i: Int) -> [CGFloat] {
        let n = Int(num(i, 6))
        return n > 0 ? numbers(i, from: 7, count: n) : [0]
    }
    /// A transform op's matrix [a, b, c, d, e, f].
    func matrix(_ i: Int) -> CGAffineTransform {
        CGAffineTransform(a: num(i, 1), b: num(i, 2), c: num(i, 3), d: num(i, 4), tx: num(i, 5), ty: num(i, 6))
    }
}

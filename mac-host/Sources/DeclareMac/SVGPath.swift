// SVGPath — path data → CGPath.
//
// Declare's `clip` carries SVG path data (the one encoding both web backends
// already consume), so the native host needs the same reading. Full command
// set including elliptical arcs, because the window ring's rounded inner cut
// is built from `A` and the corner void depends on it being exact.

import CoreGraphics
import Foundation

enum SVGPath {
    static func parse(_ d: String) -> CGPath? {
        let path = CGMutablePath()
        var scanner = Lexer(d)
        var cur = CGPoint.zero
        var start = CGPoint.zero
        var lastCtrl: CGPoint? = nil
        var lastCmd: Character = " "

        while let cmd = scanner.command() {
            let rel = cmd.isLowercase
            let c = Character(cmd.uppercased())
            func pt(_ x: Double, _ y: Double) -> CGPoint {
                rel ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y)
            }
            switch c {
            case "M":
                guard let x = scanner.number(), let y = scanner.number() else { return path }
                cur = pt(x, y); start = cur; path.move(to: cur); lastCtrl = nil
                // Subsequent pairs are implicit lineto.
                while let x2 = scanner.number(), let y2 = scanner.number() {
                    cur = pt(x2, y2); path.addLine(to: cur)
                }
            case "L":
                while let x = scanner.number(), let y = scanner.number() {
                    cur = pt(x, y); path.addLine(to: cur)
                }
                lastCtrl = nil
            case "H":
                while let x = scanner.number() {
                    cur = CGPoint(x: rel ? cur.x + x : x, y: cur.y); path.addLine(to: cur)
                }
                lastCtrl = nil
            case "V":
                while let y = scanner.number() {
                    cur = CGPoint(x: cur.x, y: rel ? cur.y + y : y); path.addLine(to: cur)
                }
                lastCtrl = nil
            case "C":
                while let x1 = scanner.number(), let y1 = scanner.number(),
                      let x2 = scanner.number(), let y2 = scanner.number(),
                      let x = scanner.number(), let y = scanner.number() {
                    let c1 = pt(x1, y1), c2 = pt(x2, y2), e = pt(x, y)
                    path.addCurve(to: e, control1: c1, control2: c2)
                    lastCtrl = c2; cur = e
                }
            case "S":
                while let x2 = scanner.number(), let y2 = scanner.number(),
                      let x = scanner.number(), let y = scanner.number() {
                    let refl = (lastCmd == "C" || lastCmd == "S") && lastCtrl != nil
                        ? CGPoint(x: 2 * cur.x - lastCtrl!.x, y: 2 * cur.y - lastCtrl!.y) : cur
                    let c2 = pt(x2, y2), e = pt(x, y)
                    path.addCurve(to: e, control1: refl, control2: c2)
                    lastCtrl = c2; cur = e
                }
            case "Q":
                while let x1 = scanner.number(), let y1 = scanner.number(),
                      let x = scanner.number(), let y = scanner.number() {
                    let c1 = pt(x1, y1), e = pt(x, y)
                    path.addQuadCurve(to: e, control: c1)
                    lastCtrl = c1; cur = e
                }
            case "T":
                while let x = scanner.number(), let y = scanner.number() {
                    let refl = (lastCmd == "Q" || lastCmd == "T") && lastCtrl != nil
                        ? CGPoint(x: 2 * cur.x - lastCtrl!.x, y: 2 * cur.y - lastCtrl!.y) : cur
                    let e = pt(x, y)
                    path.addQuadCurve(to: e, control: refl)
                    lastCtrl = refl; cur = e
                }
            case "A":
                while let rx = scanner.number(), let ry = scanner.number(),
                      let rot = scanner.number(), let laf = scanner.number(),
                      let sf = scanner.number(), let x = scanner.number(), let y = scanner.number() {
                    let e = pt(x, y)
                    addArc(path, from: cur, to: e, rx: rx, ry: ry, rotation: rot,
                           largeArc: laf != 0, sweep: sf != 0)
                    cur = e
                }
                lastCtrl = nil
            case "Z":
                path.closeSubpath(); cur = start; lastCtrl = nil
            default:
                return path
            }
            lastCmd = c
        }
        return path.isEmpty ? nil : path
    }

    /// Endpoint → center parameterization (SVG implementation notes F.6.5),
    /// then a transformed unit arc — the exactness the corner void needs.
    private static func addArc(_ path: CGMutablePath, from p0: CGPoint, to p1: CGPoint,
                               rx rxIn: Double, ry ryIn: Double, rotation deg: Double,
                               largeArc: Bool, sweep: Bool) {
        var rx = abs(rxIn), ry = abs(ryIn)
        if rx == 0 || ry == 0 { path.addLine(to: p1); return }
        let phi = deg * .pi / 180
        let dx2 = (p0.x - p1.x) / 2, dy2 = (p0.y - p1.y) / 2
        let cosP = cos(phi), sinP = sin(phi)
        let x1p = cosP * dx2 + sinP * dy2
        let y1p = -sinP * dx2 + cosP * dy2
        var lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lambda > 1 { let s = sqrt(lambda); rx *= s; ry *= s; lambda = 1 }
        let sign: Double = (largeArc != sweep) ? 1 : -1
        let num = max(0, rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p)
        let den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
        let co = den == 0 ? 0 : sign * sqrt(num / den)
        let cxp = co * (rx * y1p / ry)
        let cyp = co * (-(ry * x1p) / rx)
        let cx = cosP * cxp - sinP * cyp + (p0.x + p1.x) / 2
        let cy = sinP * cxp + cosP * cyp + (p0.y + p1.y) / 2
        func angle(_ ux: Double, _ uy: Double, _ vx: Double, _ vy: Double) -> Double {
            let dot = ux * vx + uy * vy
            let len = sqrt(ux * ux + uy * uy) * sqrt(vx * vx + vy * vy)
            var a = acos(max(-1, min(1, len == 0 ? 1 : dot / len)))
            if ux * vy - uy * vx < 0 { a = -a }
            return a
        }
        let theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
        var delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
        if !sweep && delta > 0 { delta -= 2 * .pi }
        if sweep && delta < 0 { delta += 2 * .pi }
        var t = CGAffineTransform(translationX: cx, y: cy)
            .rotated(by: phi)
            .scaledBy(x: rx, y: ry)
        path.addRelativeArc(center: .zero, radius: 1, startAngle: theta1, delta: delta, transform: t)
        _ = t
    }

    private struct Lexer {
        private let s: [Character]
        private var i = 0
        init(_ str: String) { s = Array(str) }

        mutating func skip() {
            while i < s.count, s[i] == " " || s[i] == "," || s[i] == "\n" || s[i] == "\t" || s[i] == "\r" { i += 1 }
        }
        mutating func command() -> Character? {
            skip()
            guard i < s.count else { return nil }
            let c = s[i]
            if c.isLetter { i += 1; return c }
            return nil
        }
        mutating func number() -> Double? {
            skip()
            let save = i
            var out = ""
            if i < s.count, s[i] == "-" || s[i] == "+" { out.append(s[i]); i += 1 }
            var digits = false
            while i < s.count, s[i].isNumber { out.append(s[i]); i += 1; digits = true }
            if i < s.count, s[i] == "." {
                out.append(s[i]); i += 1
                while i < s.count, s[i].isNumber { out.append(s[i]); i += 1; digits = true }
            }
            if digits, i < s.count, s[i] == "e" || s[i] == "E" {
                var j = i + 1
                var exp = "e"
                if j < s.count, s[j] == "-" || s[j] == "+" { exp.append(s[j]); j += 1 }
                var expDigits = false
                while j < s.count, s[j].isNumber { exp.append(s[j]); j += 1; expDigits = true }
                if expDigits { out += exp; i = j }
            }
            if !digits { i = save; return nil }
            return Double(out)
        }
    }
}

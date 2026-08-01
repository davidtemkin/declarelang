// A control channel for driving the app under test.
//
// WHY NOT SYNTHETIC CGEvents: posting them moves the real cursor and hands the
// events to whatever window is frontmost. That makes tests both invasive (the
// machine becomes unusable while they run) and unreliable — a run of these
// tests silently went to Terminal and to Messages, which read as "hover is
// broken" and "the app ignores clicks" when nothing of the sort was true.
//
// Injecting at the same seam the AppKit view uses (`__declarePointer` and
// friends) costs one thing: it does not exercise NSEvent delivery, tracking
// areas or the responder chain. Those have had real bugs, so a handful of
// checks still want real events. Everything above that seam — hit resolution,
// layout, painting, scrolling — is exercised exactly as in normal use.
//
// Protocol: write newline-separated commands to /tmp/declare-ctl.in; replies
// appear in /tmp/declare-ctl.out. Commands:
//   move X Y · down X Y · up X Y · click X Y · scroll X Y DY
//   key NAME [cmd|shift|ctrl|alt ...]
//   trace X Y   (narrate the hit walk)      flows   (dump rich flows)
//   geom        (window id and content box) ping

import AppKit

final class ControlChannel {
    private let inPath = "/tmp/declare-ctl.in"
    private let outPath = "/tmp/declare-ctl.out"
    private var timer: Timer?
    private unowned let bridge: Bridge
    weak var view: DeclareView?

    init(bridge: Bridge) { self.bridge = bridge }

    func start() {
        try? "".write(toFile: inPath, atomically: true, encoding: .utf8)
        let t = Timer(timeInterval: 0.03, repeats: true) { [weak self] _ in self?.poll() }
        RunLoop.main.add(t, forMode: .common)
        timer = t
        NSLog("[control] listening on %@", inPath)
    }

    private func poll() {
        // ATOMIC TAKE. The old shape — read the inbox, THEN overwrite it empty —
        // had a window between the two where a client's write was silently
        // erased: the command never ran, no reply was ever written, and the
        // client could not tell it lost one. Measured 2026-08-01: two of three
        // `key Tab` probes in a row vanished while the host was healthy, which
        // surfaced as a "focus doesn't advance" bug and cost a day of chasing
        // the wrong layer. rename(2) is atomic on the same volume, so the race
        // is structural now, not probabilistic: a concurrent write either lands
        // before the rename (and is taken whole) or recreates the inbox after
        // (and is taken next tick). Nothing is ever overwritten unread.
        let takePath = inPath + ".take"
        guard FileManager.default.fileExists(atPath: inPath) else { return }
        try? FileManager.default.removeItem(atPath: takePath)
        guard (try? FileManager.default.moveItem(atPath: inPath, toPath: takePath)) != nil else { return }
        defer { try? FileManager.default.removeItem(atPath: takePath) }
        guard let raw = try? String(contentsOfFile: takePath, encoding: .utf8),
              !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        var out: [String] = []
        for line in raw.split(separator: "\n") {
            let cmd = line.trimmingCharacters(in: .whitespaces)
            if !cmd.isEmpty { out.append(run(cmd)) }
        }
        try? (out.joined(separator: "\n") + "\n").write(toFile: outPath, atomically: true, encoding: .utf8)
    }

    private func run(_ cmd: String) -> String {
        let a = cmd.split(separator: " ").map(String.init)
        guard let verb = a.first else { return "empty" }
        func num(_ i: Int) -> Double { i < a.count ? (Double(a[i]) ?? 0) : 0 }

        switch verb {
        case "ping":
            return "ok"
        case "geom":
            let b = view?.bounds ?? .zero
            return "content \(Int(b.width))x\(Int(b.height))"
                 + " layers=\(bridge.tree?.layerCount() ?? -1)"
                 + " subviews=\(view?.subviews.count ?? -1)"
        case "move", "down", "up":
            let type = verb == "move" ? "pointermove" : verb == "down" ? "pointerdown" : "pointerup"
            if verb == "down" { buttons = 1 } else if verb == "up" { buttons = 0 }
            send(type, num(1), num(2))
            return "ok"
        case "click":
            send("pointermove", num(1), num(2))
            buttons = 1; send("pointerdown", num(1), num(2))
            buttons = 0; send("pointerup", num(1), num(2))
            return "ok"
        case "scroll":
            bridge.call("__declareScroll", [num(1), num(2), num(3), num(4)])
            bridge.needsFrame()
            return "ok"
        case "key":
            let name = a.count > 1 ? a[1] : ""
            var mods = 0
            for m in a.dropFirst(2) {
                switch m {
                case "shift": mods |= 1
                case "cmd", "meta": mods |= 2
                case "ctrl": mods |= 4
                case "alt", "option": mods |= 8
                default: break
                }
            }
            bridge.call("__declareKey", ["keydown", name, mods, 0])
            bridge.call("__declareKey", ["keyup", name, mods, 0])
            bridge.needsFrame()
            return "ok"
        case "trace":
            bridge.call("__declareTraceHit", [num(1), num(2)])
            return "ok (see the log)"
        case "who":
            // who X Y — every CONTENT-BEARING layer whose frame covers this model
            // point, with its effective visibility computed by walking superlayers.
            // CALayer.hitTest is useless here: it answers for transparent layers
            // too, so the topmost veil always wins. This reports only layers that
            // could actually be the pixels: contents set, or a background color.
            guard let t = bridge.tree, let v = view, let hostL = v.layer else { return "no tree" }
            let mx = num(1), my = num(2)
            let pt = CGPoint(x: mx, y: v.bounds.height - my)
            var lines: [String] = []
            func visitAll(_ l: CALayer, _ path: (CALayer) -> String?) {
                var stack: [CALayer] = [l]
                while let cur = stack.popLast() {
                    if let tag = path(cur) { lines.append(tag) }
                    for sub in cur.sublayers ?? [] { stack.append(sub) }
                }
            }
            visitAll(hostL) { cur in
                guard cur.contents != nil || cur.backgroundColor != nil else { return nil }
                let inHost = cur.convert(cur.bounds, to: hostL)
                guard inHost.contains(pt) else { return nil }
                var eff = false
                var walk: CALayer? = cur
                var clipped = false
                while let w2 = walk {
                    if w2.isHidden { eff = true }
                    if w2 !== cur, w2.masksToBounds {
                        let r = cur.convert(cur.bounds, to: w2)
                        if !r.intersects(w2.bounds) { clipped = true }
                    }
                    walk = w2.superlayer
                }
                var owner = "?"
                t.forEachNode { nd in
                    if nd.layer === cur { owner = "#\(nd.id)" }
                    else if nd.content === cur, nd.content !== nd.layer { owner = "#\(nd.id)(content)" }
                    else if nd.draw === cur { owner = "#\(nd.id)(DRAW)" }
                    else if nd.gradient === cur { owner = "#\(nd.id)(grad)" }
                    else if nd.rich?.contentLayer === cur { owner = "#\(nd.id)(RICHBAND)" }
                }
                var home = ""
                if owner == "?" {
                    // an ORPHAN: name the nearest ANCESTOR layer a node still owns
                    var up = cur.superlayer
                    while let u = up {
                        var uo: String? = nil
                        t.forEachNode { nd in
                            if nd.layer === u { uo = "#\(nd.id)" }
                            else if nd.content === u { uo = "#\(nd.id)(content)" }
                            else if nd.clipHost === u { uo = "#\(nd.id)(cliphost)" }
                        }
                        if let o = uo { home = " ⟸ inside \(o)"; break }
                        up = u.superlayer
                    }
                    if home.isEmpty { home = " ⟸ inside NO owned ancestor" }
                }
                return "\(owner) \(cur.contents != nil ? "img" : "bg") frame@host=\(NSStringFromRect(inHost)) hidden=\(eff) clippedOut=\(clipped)\(home)"
            }
            return lines.isEmpty ? "no content-bearing layer at (\(mx),\(my))" : lines.joined(separator: "\n")
        case "inside":
            // inside <id> — the node's own layer anatomy: sublayers in order,
            // the draw/content/gradient layers, and the transform. `chain` walks
            // UP; this looks DOWN one level, which is where a z-order or a
            // missing-sublayer defect lives.
            guard let t = bridge.tree, let n = t.node(Int(num(1))) else { return "no node" }
            var out: [String] = []
            let tf = n.layer.transform
            out.append("node #\(Int(num(1))) box=\(NSStringFromRect(n.box)) scaleK=\(n.scaleK) hidden=\(n.layer.isHidden)")
            out.append("  transform: m11=\(tf.m11) m22=\(tf.m22) m41=\(tf.m41) m42=\(tf.m42)")
            out.append("  draw layer: \(n.draw == nil ? "NIL" : "present, contents=\(n.draw!.contents == nil ? "NIL" : "set") bounds=\(NSStringFromRect(n.draw!.bounds)) pos=\(NSStringFromPoint(n.draw!.position)) hidden=\(n.draw!.isHidden) super=\(n.draw!.superlayer == nil ? "DETACHED" : "attached")")")
            for (i, sub) in (n.layer.sublayers ?? []).enumerated() {
                let tag = sub === n.draw ? "DRAW" : sub === n.content && n.content !== n.layer ? "content" : sub === n.gradient ? "gradient" : "?"
                out.append("  sub[\(i)] \(tag) bounds=\(NSStringFromRect(sub.bounds)) pos=\(NSStringFromPoint(sub.position)) hidden=\(sub.isHidden) contents=\(sub.contents == nil ? "nil" : "set")")
            }
            return out.joined(separator: "\n")
        case "chain":
            bridge.tree?.dumpLayerChain(Int(num(1)))
            return "ok (see the log)"
        case "subviews":
            // Every AppKit subview and its frame — anything here intercepts REAL
            // presses via overlayOwns(), which injected input does not exercise.
            guard let v = view else { return "no view" }
            var lines: [String] = ["subviews=\(v.subviews.count)"]
            for sub in v.subviews {
                lines.append("  \(type(of: sub)) hidden=\(sub.isHidden) frame=\(NSStringFromRect(sub.frame))")
            }
            return lines.joined(separator: "\n")
        case "statsreset":
            bridge.resetStats()
            return "ok"
        case "stats":
            return bridge.statsReport()
        case "sweep":
            // sweep X0 X1 Y N HZ — inject N pointer moves from X0 to X1 at HZ,
            // RETURNING TO THE RUN LOOP between each so the display link commits
            // frames in between, exactly as it does under a real mouse. (Driving
            // this from the control channel's own reply loop would serialize the
            // moves and measure nothing but the channel.)
            let x0 = num(1), x1 = num(2), y = num(3)
            let n = max(2, Int(num(4))), hz = max(1.0, num(5))
            var i = 0
            let t = Timer.scheduledTimer(withTimeInterval: 1.0 / hz, repeats: true) { [weak bridge] timer in
                guard let bridge else { timer.invalidate(); return }
                let f = Double(i) / Double(n - 1)
                bridge.call("__declarePointer", ["pointermove", x0 + (x1 - x0) * f, y, 0, 0])
                bridge.needsFrame()
                i += 1
                if i >= n { timer.invalidate() }
            }
            RunLoop.main.add(t, forMode: .common)
            return "sweeping \(n) moves at \(Int(hz))Hz (~\(Int(Double(n) / hz * 1000))ms)"
        case "eval":
            // Evaluate JS in the app's own context and return the result.
            //
            // The one thing the channel could not do. Every other verb here is a
            // question someone had to predict and compile in; this asks anything
            // the runtime can answer — `__app` (the live App), `__declare` (the
            // inspect bridge), any surface, any attribute — with no rebuild and
            // without losing the app's state, which is what makes probing the
            // native host as cheap as puppeteer's page.evaluate.
            let src = a.dropFirst().joined(separator: " ")
            guard !src.isEmpty else { return "usage: eval <javascript>" }
            guard let v = bridge.ctx.evaluateScript(src) else { return "(no value)" }
            if let ex = bridge.ctx.exception { bridge.ctx.exception = nil; return "EXCEPTION: \(ex)" }
            return v.isUndefined ? "undefined" : (v.toString() ?? "(unprintable)")
        case "occl":
            return bridge.tree?.explainOccluders(Int(num(1))) ?? "no tree"
        case "dragsweep":
            // dragsweep X Y DX N HZ — a real drag driven by a timer: move to
            // (X,Y), press, then N moves of DX/N each at HZ, then release.
            // ⚠ The plain `seq "down" "move" …` path serializes on the control
            // channel's file round trip (~30ms per command), so gaps measured
            // that way report the INJECTION rate, not the renderer's. This
            // returns to the run loop between moves, as `sweep` does, so the
            // display link commits in between and the gaps mean something.
            // ⚠ It also MOVES BEFORE PRESSING, which a real mouse always does —
            // `beginSize` captures `app.pointerX` at mousedown, so a press with
            // no prior move captures a stale anchor and the window explodes.
            do {
                let x0 = num(1), y = num(2), total = num(3)
                let n = max(1, Int(num(4))), hz = max(1.0, num(5))
                bridge.call("__declarePointer", ["pointermove", x0, y, 0, 0])
                bridge.call("__declarePointer", ["pointerdown", x0, y, 1, 0])
                bridge.needsFrame()
                var i = 0
                let t = Timer.scheduledTimer(withTimeInterval: 1.0 / hz, repeats: true) { [weak bridge] timer in
                    guard let bridge else { timer.invalidate(); return }
                    i += 1
                    let x = x0 + total * (Double(i) / Double(n))
                    bridge.call("__declarePointer", ["pointermove", x, y, 1, 0])
                    if i >= n {
                        bridge.call("__declarePointer", ["pointerup", x, y, 0, 0])
                        timer.invalidate()
                    }
                    bridge.needsFrame()
                }
                RunLoop.main.add(t, forMode: .common)
                return "dragging \(n) steps at \(Int(hz))Hz"
            }
        case "boxes":
            // Every node whose box height matches — the way to LOCATE a view in
            // the tree when a screenshot only tells you roughly where it is.
            guard let t = bridge.tree else { return "no tree" }
            let want = num(1), tol = a.count > 2 ? num(2) : 1
            var out: [String] = []
            t.forEachNode { n in
                if abs(n.box.height - want) <= tol, n.box.width > 40 {
                    out.append("  id=\(n.id) box=\(NSStringFromRect(n.box)) abs=(\(Int(t.absOrigin(n).x)),\(Int(t.absOrigin(n).y))) hidden=\(t.hiddenAnywhere(n))")
                }
            }
            return out.isEmpty ? "no node with height \(Int(want))" : out.joined(separator: "\n")
        case "bar":
            // Is there a grabbable scrollbar thumb here, and whose?
            guard let t = bridge.tree else { return "no tree" }
            guard let hit = t.scrollbarHit(atModel: NSPoint(x: num(1), y: num(2))) else {
                return "no scrollbar thumb at (\(Int(num(1))),\(Int(num(2))))"
            }
            let b = hit.vertical ? hit.node.vbar : hit.node.hbar
            return "thumb node=\(hit.node.id) axis=\(hit.vertical ? "v" : "h")"
                 + " grab=\(Int(hit.grab)) rect=\(NSStringFromRect(b?.thumbRect ?? .zero))"
                 + " travel=\(Int(b?.travel ?? 0)) maxOffset=\(Int(b?.maxOffset ?? 0))"
        case "bardrag":
            // Grab a thumb and drag it — the SAME three calls the mouse path
            // makes, so this exercises the real gesture without a synthetic event.
            guard let v = view else { return "no view" }
            let from = NSPoint(x: num(1), y: num(2)), to = NSPoint(x: num(3), y: num(4))
            guard v.barGrab(atModel: from) else { return "no scrollbar thumb at \(NSStringFromPoint(from))" }
            // a few steps, as a real drag arrives
            for i in 1...8 {
                let f = CGFloat(i) / 8
                v.barMove(toModel: NSPoint(x: from.x + (to.x - from.x) * f,
                                           y: from.y + (to.y - from.y) * f))
            }
            v.barRelease(atModel: to)
            return "dragged"
        case "lines":
            guard let n = bridge.tree?.node(Int(num(1))), let flow = n.rich else { return "no flow \(Int(num(1)))" }
            return flow.dumpLines()
        case "metrics":
            // The measurer's answer for a CSS font string, against which Chrome's
            // canvas fontBoundingBox* can be held. The runtime derives a code
            // block's line box from (ascent+descent)/fontSize, so a disagreement
            // here stretches every line of every code block.
            // `metrics <css font> | <text>` — the text is optional and measures
            // ADVANCE, which is what decides where a line wraps.
            let joined = a.dropFirst().joined(separator: " ")
            let halves = joined.components(separatedBy: "|")
            let css = halves[0].trimmingCharacters(in: .whitespaces)
            let sample = halves.count > 1 ? halves[1].trimmingCharacters(in: .whitespaces) : "Mg"
            guard !css.isEmpty else { return "usage: metrics <css font> [| <text>]" }
            let f = TextEngine.nsFont(TextEngine.parse(css))
            let m = TextEngine.measure(text: sample, font: css, letterSpacing: 0, scale: 2)
            return "\(css) -> face=\(f.fontName) raw asc=\(f.ascender) desc=\(-f.descender)"
                 + " leading=\(f.leading) | reported asc=\(m[1]) desc=\(m[2]) sum=\(m[1] + m[2])"
                 + " width(\(sample.count) chars)=\(m[0])"
        case "owns":
            // Evaluate the REAL press path's gate at a model point, and name what
            // claims it. Injected input never reaches overlayOwns(), so a bug that
            // only David can reproduce ("clicking the window body doesn't raise
            // it") is invisible to every other verb here — this asks it directly.
            guard let v = view else { return "no view" }
            return v.describeOverlayOwnership(atModel: NSPoint(x: num(1), y: num(2)))
        case "flows":
            bridge.tree?.dumpFlows()
            return "ok (see the log)"
        default:
            return "unknown: \(verb)"
        }
    }

    private var buttons = 0

    private func send(_ type: String, _ x: Double, _ y: Double) {
        bridge.call("__declarePointer", [type, x, y, buttons, 0])
        bridge.needsFrame()
    }
}

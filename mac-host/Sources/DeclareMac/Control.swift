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
import CoreImage
import ImageIO

final class ControlChannel {
    private let inPath = "/tmp/declare-ctl.in"
    private let outPath = "/tmp/declare-ctl.out"
    private var timer: Timer?
    /// The channel outlives any one window, so it addresses the FRONT one at
    /// the moment a command arrives rather than holding a program hostage.
    /// A rig that opens a second window talks to the second window, which is
    /// what "the app" means from the outside.
    private let target: () -> ProgramWindow?
    private var bridge: Bridge! { target()?.bridge }
    private var view: DeclareView? { target()?.view }

    init(target: @escaping () -> ProgramWindow?) { self.target = target }

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
        // Almost every verb below reaches through `bridge`/`view` into a window.
        // With none open there is nothing to address, and answering plainly
        // beats trapping on an implicit unwrap inside a test run. The few verbs
        // that are ABOUT windows rather than about a program still work.
        let windowless = ["ping", "windows", "newwindow", "closewindow", "menukey", "activate", "jit",
                          "compilecache"]
        guard target() != nil || windowless.contains(verb) else { return "no window" }
        func num(_ i: Int) -> Double { i < a.count ? (Double(a[i]) ?? 0) : 0 }

        switch verb {
        case "ping":
            return "ok"
        case "jit":
            // Is JavaScriptCore compiling? The measured answer, so a test can
            // assert it — the entitlement went missing for weeks precisely
            // because nothing outside a benchmark could tell.
            return Bridge.jit.line
        case "compilecache":
            // `compilecache` reports; `compilecache clear` empties it. A cache
            // you cannot inspect or drop is one you end up mistrusting, and a
            // stale-compile hunt should start by ruling this out in one command.
            if a.count > 1, a[1] == "clear" {
                CompileService.shared.clearCache()
                return "cleared"
            }
            return CompileService.shared.cacheReport()
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
            // Through the WHEEL entry, claims first — the injected scroll
            // stands in for a user wheel, so it must behave like one
            // (an `onWheel` view hears it before any scroller). Optional
            // fifth arg: pinch (the ctrl+wheel / magnify flag).
            bridge.call("__declareWheel", [num(1), num(2), num(4), num(3), num(5)])
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
        case "activate":
            // Automation deliberately does NOT seize the foreground, but a key
            // equivalent needs somewhere to go: `performClose:` and friends are
            // sent to a nil target and resolved through the key window's
            // responder chain, and an INACTIVE app has no key window. So a test
            // of ⌘W must first put the app where a person pressing ⌘W would
            // have it. Ask for that explicitly rather than making every rig
            // reach for System Events and accessibility permission.
            NSApp.activate(ignoringOtherApps: true)
            return "ok"
        case "menukey":
            // `menukey w cmd` — dispatch a key equivalent through the REAL menu,
            // the same call AppKit makes for a keystroke. Not a keystroke
            // simulation: System Events needs accessibility permission and the
            // app to be frontmost, neither of which a test should require.
            // Answers whether the menu claimed it, so "⌘W is wired" is a fact a
            // test can assert rather than infer from a side effect.
            //
            // ⚠ "handled" means the MENU matched the item, not that anything
            // happened. Items with a nil target reach their action through the
            // key window's responder chain, so in an inactive app ⌘W reports
            // handled and closes nothing. Send `activate` first.
            let ch = a.count > 1 ? a[1] : ""
            guard !ch.isEmpty else { return "usage: menukey <char> [cmd|shift|alt|ctrl]…" }
            var flags: NSEvent.ModifierFlags = []
            for m in a.dropFirst(2) {
                switch m {
                case "cmd", "meta": flags.insert(.command)
                case "shift": flags.insert(.shift)
                case "alt", "option": flags.insert(.option)
                case "ctrl": flags.insert(.control)
                default: break
                }
            }
            guard let e = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: flags,
                                           timestamp: ProcessInfo.processInfo.systemUptime,
                                           windowNumber: NSApp.keyWindow?.windowNumber ?? 0,
                                           context: nil, characters: ch,
                                           charactersIgnoringModifiers: ch, isARepeat: false, keyCode: 0)
            else { return "bad event" }
            return NSApp.mainMenu?.performKeyEquivalent(with: e) == true ? "handled" : "unhandled"
        case "windows":
            // Which windows exist, front first — the order every other verb
            // resolves against.
            guard let app = NSApp.delegate as? AppDelegate else { return "no app" }
            if app.windows.isEmpty { return "(none)" }
            return app.windows.map {
                ($0 === app.front ? "* " : "  ") + "#\($0.window.windowNumber) "
                + "\(Int($0.window.frame.width))x\(Int($0.window.frame.height)) \($0.currentURL)"
            }.joined(separator: "\n")
        case "newwindow":
            // `newwindow [url]` — a second program, in its own window and its
            // own runtime. Without this the multi-window path has no probe.
            guard let app = NSApp.delegate as? AppDelegate else { return "no app" }
            let url = a.dropFirst().joined(separator: " ")
            let w = app.newWindow()
            if !url.isEmpty { w.open(url) }
            return "ok windows=\(app.windows.count)"
        case "closewindow":
            guard let app = NSApp.delegate as? AppDelegate else { return "no app" }
            guard let w = app.front else { return "no window" }
            w.window.performClose(nil)
            return "ok windows=\(app.windows.count)"
        case "lasterror":
            // What a person would have been shown in a dialog. "-" means the
            // program loaded; anything else is the failure, verbatim.
            return bridge.lastError ?? "-"
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
        case "frost":
            // Is the frost actually ON? Four things have to line up and any one
            // of them fails silently, invisibly, and looks like "the blur is
            // gone": the BACKDROP op arriving, a frost layer being made, the
            // CIFilter chain landing on it, and the hosting view having
            // `layerUsesCoreImageFilters` (without which backgroundFilters is
            // accepted and ignored — no warning, just an unblurred wash).
            guard let t = bridge.tree else { return "no tree" }
            var specs = 0, layers = 0, filtered = 0, attached = 0, sized = 0
            var sample = ""
            t.forEachNode { n in
                guard let s = n.backdrop else { return }
                specs += 1
                guard let fl = n.frostLayer else { return }
                layers += 1
                if !(fl.backgroundFilters as? [CIFilter] ?? []).isEmpty { filtered += 1 }
                if fl.superlayer != nil { attached += 1 }
                if fl.bounds.width > 0, fl.bounds.height > 0 { sized += 1 }
                if sample.isEmpty {
                    sample = String(format: "#%d blur=%.1f sat=%.2f filters=%d bounds=%@ hidden=%@",
                                    n.id, s.blur, s.saturate,
                                    (fl.backgroundFilters as? [CIFilter] ?? []).count,
                                    NSStringFromRect(fl.bounds), fl.isHidden ? "y" : "n")
                }
            }
            let ciOK = view?.layerUsesCoreImageFilters == true
            return "backdrop specs=\(specs)  frostLayers=\(layers)  withFilters=\(filtered)"
                 + "  inTree=\(attached)  nonEmptyBounds=\(sized)"
                 + "  layerUsesCoreImageFilters=\(ciOK ? "YES" : "NO ⚠ (filters are ignored without it)")"
                 + (sample.isEmpty ? "" : "\n  e.g. " + sample)
        case "frostbench":
            // What would a REBUILT frost cost? `backgroundFilters` is dead on
            // this OS (frostprobe: eight configurations, zero blur, still ~2x
            // WindowServer CPU), so the frost has to be produced from a captured
            // backdrop — and the only unknown in that design is the capture.
            //
            // The old CPU sampler did one full-resolution `render(in:)` PER
            // FROSTED NODE PER COMMIT and ran weather at 0.45fps. This measures
            // the two things that change that: doing it ONCE for the whole
            // window, and doing it at reduced resolution (a 14pt blur does not
            // need 1:1 pixels). `frostbench [scale] [reps]`.
            guard let v = view, let vroot = v.layer else { return "no view" }
            let scale = a.count > 1 ? num(1) : 0.25
            let reps = a.count > 2 ? Int(num(2)) : 5
            // An optional NODE to render instead of the whole tree. The whole
            // tree is what the old sampler did; the point of the rebuild is that
            // a frost only needs the handful of layers actually BENEATH it, so
            // this is how we find out what that costs.
            let root: CALayer = a.count > 3 ? (bridge.tree?.node(Int(num(3)))?.layer ?? vroot) : vroot
            func countLayers(_ l: CALayer) -> Int {
                1 + (l.sublayers ?? []).reduce(0) { $0 + countLayers($1) }
            }
            let subtree = countLayers(root)
            let box = v.bounds
            let w = Int(box.width * scale), h = Int(box.height * scale)
            guard w > 0, h > 0, let cs = CGColorSpace(name: CGColorSpace.sRGB) else { return "bad scale" }
            var renderMs: [Double] = [], blurMs: [Double] = []
            var img: CGImage?
            for _ in 0..<reps {
                guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8,
                                          bytesPerRow: 0, space: cs,
                                          bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue) else { break }
                ctx.scaleBy(x: CGFloat(scale), y: CGFloat(scale))
                let t0 = CFAbsoluteTimeGetCurrent()
                root.render(in: ctx)                       // the capture
                renderMs.append((CFAbsoluteTimeGetCurrent() - t0) * 1000)
                guard let snap = ctx.makeImage() else { break }
                let t1 = CFAbsoluteTimeGetCurrent()
                let ci = CIImage(cgImage: snap)
                if let f = CIFilter(name: "CIGaussianBlur") {
                    f.setValue(ci.clampedToExtent(), forKey: kCIInputImageKey)
                    f.setValue(14.0 * scale, forKey: kCIInputRadiusKey)
                    if let out = f.outputImage?.cropped(to: ci.extent) {
                        img = ControlChannel.ciContext.createCGImage(out, from: ci.extent)
                    }
                }
                blurMs.append((CFAbsoluteTimeGetCurrent() - t1) * 1000)
            }
            func best(_ xs: [Double]) -> Double { xs.min() ?? -1 }
            func med(_ xs: [Double]) -> Double { xs.isEmpty ? -1 : xs.sorted()[xs.count / 2] }
            return String(format: "capture %dx%d (scale %.2f), %d reps, %d layers in the rendered subtree (window has %d)\n"
                          + "  render(in:)  best=%.2fms med=%.2fms\n"
                          + "  blur once    best=%.2fms med=%.2fms\n"
                          + "  TOTAL/frame  %.2fms   (display budget 8.33ms)   image=%@",
                          w, h, scale, reps, subtree, bridge.tree?.layerCount() ?? -1,
                          best(renderMs), med(renderMs), best(blurMs), med(blurMs),
                          best(renderMs) + best(blurMs), img == nil ? "FAILED" : "ok")
        case "froststats":
            guard let t = bridge.tree else { return "no tree" }
            var total = 0
            t.forEachNode { if $0.backdrop != nil { total += 1 } }
            return String(format: "frosts declared=%d  last commit: resampled=%d in %.2fms"
                          + "   session: %d resamples, %.0fms total, %.2fms each",
                          total, t.frostLastN, t.frostLastMs,
                          t.frostTotalN, t.frostTotalMs,
                          t.frostTotalN > 0 ? t.frostTotalMs / Double(t.frostTotalN) : 0)
                 + String(format: "\n  of which: paint=%.0fms  makeImage=%.0fms  blur=%.0fms   nodesPainted=%d",
                          t.frostPaintMs, t.frostImageMs, t.frostBlurMs, t.frostPainted)
                 + "\n  costliest nodes: " + t.frostNodeMs.sorted { $0.value > $1.value }.prefix(6).map {
                       let nd = t.node($0.key)
                       return String(format: "#%d=%.0fms[%dx%d%@]", $0.key, $0.value,
                                     Int(nd?.box.width ?? 0), Int(nd?.box.height ?? 0),
                                     nd?.image != nil ? ",img" : (nd?.draw != nil ? ",draw" : ""))
                   }.joined(separator: " ")
        case "frostdump":
            // Arming is what makes the capture happen; otherwise every commit
            // would retain a full canvas copy for a verb nobody ran.
            guard let img = bridge.tree?.frostLastCanvas else {
                LayerTree.frostDumpWanted = true
                return "armed — run a frame (scroll), then ask again"
            }
            let path = a.count > 1 ? a[1] : "/tmp/frost-canvas.png"
            let url = URL(fileURLWithPath: path) as CFURL
            guard let dest = CGImageDestinationCreateWithURL(url, "public.png" as CFString, 1, nil)
            else { return "could not write" }
            CGImageDestinationAddImage(dest, img, nil)
            return CGImageDestinationFinalize(dest) ? "wrote \(path) (\(img.width)x\(img.height))" : "write failed"
        case "frostreset":
            bridge.tree?.frostTotalN = 0; bridge.tree?.frostTotalMs = 0
            bridge.tree?.frostPaintMs = 0; bridge.tree?.frostImageMs = 0; bridge.tree?.frostBlurMs = 0
            bridge.tree?.frostNodeMs.removeAll(); bridge.tree?.frostPainted = 0
            return "ok"
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
                 + { let ink = TextEngine.inkBounds(text: sample, font: css, letterSpacing: 0)
                     return String(format: " | ink x=%.2f..%.2f (overhang left=%.2f right=%.2f)",
                                   ink.minX, ink.maxX, max(0, -ink.minX), max(0, ink.maxX - m[0])) }()
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

    /// One CIContext, built once — constructing one per call would dominate any
    /// measurement made with it (35ms on the first, sub-ms after).
    static let ciContext = CIContext(options: [.workingColorSpace: NSNull()])

    private var buttons = 0

    private func send(_ type: String, _ x: Double, _ y: Double) {
        bridge.call("__declarePointer", [type, x, y, buttons, 0])
        bridge.needsFrame()
    }
}

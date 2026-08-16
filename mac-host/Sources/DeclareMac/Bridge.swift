// Bridge — the JavaScriptCore host: the runtime's world, furnished.
//
// docs/system-design/native-host.md §4: the seam carries FINAL GEOMETRY down
// and events up, and nothing is read back on the hot path. This file owns the
// JS context, installs `__declareMacHost` (the primitives mac-env.js builds a
// browser-shaped world from), evaluates the two scripts, and drives the frame
// pump. Everything visual belongs to LayerTree.

import AppKit
import JavaScriptCore
import CoreText

final class Bridge {
    let ctx = JSContext()!
    private(set) var tree: LayerTree!
    lazy var media = MediaEngine(bridge: self)
    private weak var view: DeclareView?
    private var timers: [Int: Timer] = [:]
    private var frameRequested = false
    private var caLink: CADisplayLink?
    private var images: [Int: CGImage] = [:]
    private var pathCache: [String: CGPath] = [:]
    // commit-pipeline instrumentation (benchmarks)
    var commitCount = 0
    var commitMsTotal = 0.0
    var commitMsMax = 0.0
    var commitBytes = 0
    /// Per-commit durations and the gaps between them — the honest measure of
    /// smoothness under a real gesture (a hitch is a long gap, not a long mean).
    var commitDurations: [Double] = []
    var commitGaps: [Double] = []
    var lastCommitAt: CFAbsoluteTime = 0
    /// Gaps between commits that actually carried geometry.
    var geomGaps: [Double] = []
    var lastGeomCommitAt: CFAbsoluteTime = 0
    /// The WHOLE resize path, not just the commit: __declareResize +
    /// __declareSettle (the runtime re-laying out) and then the pump that
    /// carries the ops down. All on the main thread, all in one gesture.
    var resizeN = 0
    var resizeMs = 0.0, resizeJsMs = 0.0, resizeSettleMs = 0.0, resizePumpMs = 0.0, resizeMaxMs = 0.0
    var linkTicks = 0
    var pumps = 0
    var firstCommitAt: CFAbsoluteTime = 0
    let startedAt = CFAbsoluteTimeGetCurrent()
    var onTitle: ((String) -> Void)?
    var onBootFailed: ((String) -> Void)?
    /// A BOOT TIMELINE, on `DECLARE_BOOTLOG=1`. Startup is a ladder — evaluate
    /// the runtime, maybe fetch and evaluate a 5.9MB compiler, fetch the
    /// library, compile, instantiate, commit — and a single "2.4s" says nothing
    /// about which rung costs what. Every mark is elapsed-since-process-start,
    /// so the log reads as a timeline rather than a set of durations to add up.
    static let bootLog = ProcessInfo.processInfo.environment["DECLARE_BOOTLOG"] != nil
    func mark(_ label: String, _ detail: String = "") {
        guard Bridge.bootLog else { return }
        NSLog("[boot] %7.0fms  %@ %@", (CFAbsoluteTimeGetCurrent() - startedAt) * 1000, label, detail)
    }

    /// The last load or compile failure, kept whether or not it was ever shown.
    /// Under the control channel nothing is shown (see `showError`), so this is
    /// how a harness learns that a program failed rather than merely rendered
    /// nothing — read it with `lasterror`.
    private(set) var lastError: String?

    /// The ONE network session, deliberately cache-LESS. URLSession's own disk
    /// cache is not merely redundant here, it is wrong: fetch() already refuses
    /// it (`.reloadIgnoringLocalCacheData`, see the note there) because it once
    /// handed boot a stale `?program` body, and the compile cache below owns
    /// revalidation where the etag is. Leaving the shared session in place for
    /// images meant the OS cache filled up anyway — and under TWO identities,
    /// since Foundation keys it by executable name when the bare binary runs and
    /// by bundle id when the .app does (~/Library/Caches/DeclareMac and
    /// …/com.davidtemkin.declare.host, a megabyte each). One cache, ours.
    static let net: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.urlCache = nil
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: c)
    }()

    /// Where the platform's own files live (the client compile cache).
    private lazy var cacheDir: URL = {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let d = base.appendingPathComponent("Declare", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }()

    init(view: DeclareView) {
        self.view = view
        self.tree = LayerTree(bridge: self, view: view)
        ctx.exceptionHandler = { _, e in
            NSLog("[Declare] JS exception: %@", e?.toString() ?? "?")
            if let stack = e?.objectForKeyedSubscript("stack")?.toString() { NSLog("[Declare]   %@", stack) }
        }
        mark("ctx created")
        install()
        loadScripts()
        mark("runtime scripts evaluated")
        startDisplayLink()
    }

    // ── the host primitive surface ──────────────────────────────────────────

    private func install() {
        let host = JSValue(newObjectIn: ctx)!

        host.setObject({ (level: String, msg: String) in
            NSLog("[Declare:%@] %@", level, msg)
        } as @convention(block) (String, String) -> Void, forKeyedSubscript: "log")

        // performance.now() must be MONOTONIC and share the display link's time
        // base: animation start times are captured from this clock and compared
        // against the frame timestamp below. An epoch clock (Date) is neither —
        // it can step under NTP, and it cannot be compared with a frame's
        // presentation time at all.
        host.setObject({ () -> Double in
            CACurrentMediaTime() * 1000
        } as @convention(block) () -> Double, forKeyedSubscript: "now")

        host.setObject({ [weak self] (json: String) in
            guard let self else { return }
            let t0 = CFAbsoluteTimeGetCurrent()
            if self.statsTracing, self.firstCommits.count < 4 { self.firstCommits.append(String(json.prefix(180))) }
            self.tree.apply(json)
            let dt = (CFAbsoluteTimeGetCurrent() - t0) * 1000
            self.commitCount += 1
            self.commitMsTotal += dt
            self.commitMsMax = max(self.commitMsMax, dt)
            self.commitBytes += json.utf8.count
            // Only record once boot has settled: boot flushes directly (mounting
            // islands, rich-text heights) and would otherwise dominate the
            // percentiles for a gesture that happens seconds later.
            let recording = (t0 - self.startedAt) > (Double(ProcessInfo.processInfo.environment["DECLARE_STATS_AFTER"] ?? "0") ?? 0)
            if recording, self.commitDurations.count < 4000 {
                self.commitDurations.append(dt)
                if self.lastCommitAt > 0 { self.commitGaps.append((t0 - self.lastCommitAt) * 1000) }
            }
            // A gap between MOTION commits is the honest smoothness measure. A
            // gap after a bookkeeping-only commit (a visibility toggle before the
            // gesture has moved anything) is not a dropped frame — nothing needed
            // drawing. Counting those reported a "regression" that was only two
            // VISIBLE ops coalescing into one frame instead of two.
            if self.tree.sawGeom {
                if self.lastGeomCommitAt > 0 {
                    self.geomGaps.append((t0 - self.lastGeomCommitAt) * 1000)
                }
                self.lastGeomCommitAt = CFAbsoluteTimeGetCurrent()
            }
            self.lastCommitAt = CFAbsoluteTimeGetCurrent()
            if self.firstCommitAt == 0 { self.firstCommitAt = CFAbsoluteTimeGetCurrent(); self.mark("FIRST COMMIT") }
        } as @convention(block) (String) -> Void, forKeyedSubscript: "commit")

        host.setObject({ [weak self] (text: String, font: String, ls: Double) -> [Double] in
            TextEngine.measure(text: text, font: font, letterSpacing: ls, scale: self?.view?.window?.backingScaleFactor ?? 2)
        } as @convention(block) (String, String, Double) -> [Double], forKeyedSubscript: "measure")

        host.setObject({ [weak self] (handle: Int) -> [Double] in
            guard let img = self?.images[handle] else { return [0, 0] }
            return [Double(img.width), Double(img.height)]
        } as @convention(block) (Int) -> [Double], forKeyedSubscript: "imageSize")

        // Timers — Foundation run-loop timers, fired back into JS by id.
        host.setObject({ [weak self] (id: Int, ms: Int, repeats: Int) in
            guard let self else { return }
            let t = Timer.scheduledTimer(withTimeInterval: Double(ms) / 1000.0, repeats: repeats == 1) { [weak self] _ in
                self?.call("__declareTimerFire", [id])
                self?.needsFrame()
            }
            RunLoop.main.add(t, forMode: .common)
            self.timers[id] = t
        } as @convention(block) (Int, Int, Int) -> Void, forKeyedSubscript: "timer")

        host.setObject({ [weak self] (id: Int) in
            self?.timers.removeValue(forKey: id)?.invalidate()
        } as @convention(block) (Int) -> Void, forKeyedSubscript: "clearTimer")

        host.setObject({ [weak self] in self?.needsFrame() } as @convention(block) () -> Void,
                       forKeyedSubscript: "needFrame")

        host.setObject({ [weak self] () -> Double in
            Double(self?.view?.window?.backingScaleFactor ?? 2)
        } as @convention(block) () -> Double, forKeyedSubscript: "scale")

        host.setObject({ () -> String in
            // DECLARE_APPEARANCE pins the answer. A comparison against the DOM is
            // only a measurement if both sides are in the same theme, and the
            // native host otherwise follows whatever the machine is set to while
            // headless Chrome defaults to light — which reads as a huge, entirely
            // spurious divergence. The harnesses set this; nothing else does.
            if let forced = ProcessInfo.processInfo.environment["DECLARE_APPEARANCE"] {
                return forced == "dark" ? "dark" : "light"
            }
            return NSApp.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? "dark" : "light"
        } as @convention(block) () -> String, forKeyedSubscript: "appearance")

        host.setObject({ [weak self] (title: String) in
            self?.onTitle?(title)
        } as @convention(block) (String) -> Void, forKeyedSubscript: "setTitle")

        host.setObject({ [weak self] (msg: String) in
            self?.lastError = msg
            self?.onBootFailed?(msg)
        } as @convention(block) (String) -> Void, forKeyedSubscript: "bootFailed")

        host.setObject({ (u: String) in
            if let url = URL(string: u) { NSWorkspace.shared.open(url) }
        } as @convention(block) (String) -> Void, forKeyedSubscript: "openExternal")

        // Networking: URLSession is the whole stack (TLS, cookies, cache).
        host.setObject({ [weak self] (id: Int, method: String, urlStr: String, body: String) in
            self?.fetch(id: id, method: method, urlStr: urlStr, body: body)
        } as @convention(block) (Int, String, String, String) -> Void, forKeyedSubscript: "fetch")

        host.setObject({ [weak self] (handle: Int, urlStr: String) in
            self?.loadImage(handle: handle, urlStr: urlStr)
        } as @convention(block) (Int, String) -> Void, forKeyedSubscript: "loadImage")

        // Media (Media.swift): the env's media-element shim by handle. Audio is
        // a bare AVPlayer; a Video node additionally binds an AVPlayerLayer via
        // op MEDIA, so frames never cross the bridge.
        host.setObject({ [weak self] (id: Int, _: String) in self?.media.create(id) }
            as @convention(block) (Int, String) -> Void, forKeyedSubscript: "mediaCreate")
        host.setObject({ [weak self] (id: Int, url: String) in self?.media.load(id, url) }
            as @convention(block) (Int, String) -> Void, forKeyedSubscript: "mediaLoad")
        host.setObject({ [weak self] (id: Int) in self?.media.play(id) }
            as @convention(block) (Int) -> Void, forKeyedSubscript: "mediaPlay")
        host.setObject({ [weak self] (id: Int) in self?.media.pause(id) }
            as @convention(block) (Int) -> Void, forKeyedSubscript: "mediaPause")
        host.setObject({ [weak self] (id: Int, t: Double) in self?.media.seek(id, t) }
            as @convention(block) (Int, Double) -> Void, forKeyedSubscript: "mediaSeek")
        host.setObject({ [weak self] (id: Int, key: String, v: Double) in self?.media.set(id, key, v) }
            as @convention(block) (Int, String, Double) -> Void, forKeyedSubscript: "mediaSet")

        // Shape-clip hit testing: Core Graphics owns the path, so it answers.
        host.setObject({ [weak self] (d: String, x: Double, y: Double) -> Bool in
            guard let self, let p = self.path(for: d) else { return true }
            return p.contains(CGPoint(x: x, y: y), using: .winding)
        } as @convention(block) (String, Double, Double) -> Bool, forKeyedSubscript: "pathHit")

        // The client-side compiled-program cache.
        host.setObject({ [weak self] (key: String) -> String in
            guard let self else { return "" }
            let f = self.cacheDir.appendingPathComponent(Self.hash(key) + ".json")
            return (try? String(contentsOf: f, encoding: .utf8)) ?? ""
        } as @convention(block) (String) -> String, forKeyedSubscript: "cacheGet")

        host.setObject({ [weak self] (key: String, value: String) in
            guard let self else { return }
            let f = self.cacheDir.appendingPathComponent(Self.hash(key) + ".json")
            try? value.write(to: f, atomically: true, encoding: .utf8)
        } as @convention(block) (String, String) -> Void, forKeyedSubscript: "cacheSet")

        // Rich text: laid out by AppKit NOW (the flow's height is a fact the
        // settle needs), returning the height the runtime sizes the view to.
        host.setObject({ [weak self] (id: Int, blocksJson: String, selectable: Bool, width: Double) -> Double in
            self?.tree.richLayout(id: id, blocksJson: blocksJson, selectable: selectable, width: CGFloat(width)) ?? 0
        } as @convention(block) (Int, String, Bool, Double) -> Double, forKeyedSubscript: "richLayout")

        // The client-compile tier loads the compiler INTO this same context.
        host.setObject({ [weak self] (src: String, url: String) in
            let t0 = CFAbsoluteTimeGetCurrent()
            self?.ctx.evaluateScript(src, withSourceURL: URL(string: url))
            self?.mark("H.evaluate", String(format: "%d KB in %.0fms  %@", src.utf8.count / 1024,
                                            (CFAbsoluteTimeGetCurrent() - t0) * 1000,
                                            (url as NSString).lastPathComponent))
        } as @convention(block) (String, String) -> Void, forKeyedSubscript: "evaluate")

        // WHERE THE DISTRO IS, as a file:// base the JS side can resolve against.
        // A program opened from disk lives anywhere; its LIBRARY and the compiler
        // still come from a Declare tree, and this names that tree. Same notion the
        // http path gets from the serving origin — one concept, two sources.
        host.setObject(Self.distroBase(), forKeyedSubscript: "distro")

        ctx.setObject(host, forKeyedSubscript: "__declareMacHost" as NSString)
    }

    static func hash(_ s: String) -> String {
        var h: UInt64 = 1469598103934665603
        for b in s.utf8 { h = (h ^ UInt64(b)) &* 1099511628211 }
        return String(h, radix: 36)
    }

    // ── scripts ─────────────────────────────────────────────────────────────

    private func loadScripts() {
        if ProcessInfo.processInfo.environment["DECLARE_RINGTEST"] != nil {
            // The halo's ring: outer rect one way, inner rounded rect the other,
            // kept by the nonzero rule. Probe a band point and a hole point.
            let g = 6.0, n = 3.0, r = 2.0, w = 100.0, h = 100.0
            let i = g + n, x1 = w - i, y1 = h - i
            let d = "M0 0 H\(w) V\(h) H0 Z"
                + " M\(i) \(i + r) V\(y1 - r) A\(r) \(r) 0 0 0 \(i + r) \(y1)"
                + " H\(x1 - r) A\(r) \(r) 0 0 0 \(x1) \(y1 - r)"
                + " V\(i + r) A\(r) \(r) 0 0 0 \(x1 - r) \(i)"
                + " H\(i + r) A\(r) \(r) 0 0 0 \(i) \(i + r) Z"
            if let path = self.path(for: d) {
                for (label, pt) in [("band-left", CGPoint(x: 4, y: 50)),
                                    ("band-right", CGPoint(x: 96, y: 50)),
                                    ("hole-centre", CGPoint(x: 50, y: 50)),
                                    ("just-inside-hole", CGPoint(x: 12, y: 50))] {
                    NSLog("[ring] %@ (%.0f,%.0f) winding=%d evenodd=%d", label, pt.x, pt.y,
                          path.contains(pt, using: .winding) ? 1 : 0,
                          path.contains(pt, using: .evenOdd) ? 1 : 0)
                }
                NSLog("[ring] bbox=%@", NSStringFromRect(path.boundingBox))
            } else { NSLog("[ring] PATH FAILED TO PARSE") }
        }
        if let spec = ProcessInfo.processInfo.environment["DECLARE_MEASURE"] {
            for font in spec.split(separator: ";") {
                let m = TextEngine.measure(text: "[  ]", font: String(font), letterSpacing: 0, scale: 2)
                NSLog("[measure] %@ -> width=%.2f ascent=%.2f descent=%.2f actualAsc=%.2f actualDesc=%.2f",
                      String(font), m[0], m[1], m[2], m[3], m[4])
            }
        }
        for name in ["mac-env.js", "declare-mac.js"] {
            guard let url = Self.resource(name), let src = try? String(contentsOf: url, encoding: .utf8) else {
                NSLog("[Declare] missing script: %@", name); continue
            }
            ctx.evaluateScript(src, withSourceURL: url)
            if name == "mac-env.js", ProcessInfo.processInfo.environment["DECLARE_DEBUG_HIT"] != nil {
                ctx.evaluateScript("globalThis.__declareHitDebug = true")
            }
        }
    }

    /// Scripts live beside the distro (dev) or in the app bundle (shipped).
    static func resource(_ name: String) -> URL? {
        // AN EXPLICIT DECLARE_ROOT WINS over the bundled copy. A shipped
        // Declare Mac.app carries its own runtime in Contents/Resources and
        // must keep using it — that self-containment is the point. But a
        // developer who sets DECLARE_ROOT is saying "run the tree I am
        // editing", and Bundle.main being consulted first made that a lie:
        // rebuilding bundles/declare-mac.js changed nothing, the app went on
        // running whatever bundle.sh had baked into it, and a whole diagnosis
        // was made against stale code before the discrepancy surfaced
        // (2026-08-01). Silent staleness in a conformance host is worse than
        // no host.
        if ProcessInfo.processInfo.environment["DECLARE_ROOT"] != nil {
            let root = distroRoot()
            for sub in ["browser", "bundles"] {
                let u = root.appendingPathComponent(sub).appendingPathComponent(name)
                if FileManager.default.fileExists(atPath: u.path) { return u }
            }
        }
        if let b = Bundle.main.url(forResource: name, withExtension: nil) { return b }
        let root = distroRoot()
        for sub in ["browser", "bundles"] {
            let u = root.appendingPathComponent(sub).appendingPathComponent(name)
            if FileManager.default.fileExists(atPath: u.path) { return u }
        }
        return nil
    }

    /// The stamped distro as a `file://` base (trailing slash), or "" when none
    /// can be found. DECLARE_ROOT wins (a developer saying "run the tree I am
    /// editing"), then the Info.plist stamp bundle.sh bakes in, then the walk up
    /// from the executable. An env var alone is not enough: a Finder launch
    /// inherits launchd's environment, not a shell's, so a double-clicked app
    /// would see nothing at all.
    static func distroBase() -> String {
        if let stamp = Bundle.main.object(forInfoDictionaryKey: "DeclareDistroRoot") as? String,
           !stamp.isEmpty,
           ProcessInfo.processInfo.environment["DECLARE_ROOT"] == nil,
           FileManager.default.fileExists(atPath: stamp + "/bundles/declare-mac.js") {
            return URL(fileURLWithPath: stamp, isDirectory: true).absoluteString
        }
        let r = distroRoot()
        guard FileManager.default.fileExists(atPath: r.appendingPathComponent("bundles/declare-mac.js").path)
        else { return "" }
        return r.absoluteString.hasSuffix("/") ? r.absoluteString : r.absoluteString + "/"
    }

    /// Warn when this app was assembled from a DIFFERENT platform than the tree
    /// it is now reading. The app carries its own declare-mac.js but fetches the
    /// COMPILER from the distro, so a tree that moved on pairs an old runtime
    /// with a new compiler — silent, and the exact shape of the 2026-08-01
    /// misdiagnosis. Advisory only: a dev tree moves constantly and refusing to
    /// launch would be worse than saying so.
    static func checkToolchain() {
        guard let stamped = Bundle.main.object(forInfoDictionaryKey: "DeclareToolchain") as? String,
              !stamped.isEmpty, stamped != "unstamped" else { return }
        let base = distroBase()
        guard !base.isEmpty, let u = URL(string: base + "bundles/version.json"),
              let data = try? Data(contentsOf: u),
              let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let current = j["build"] as? String else { return }
        if current != stamped {
            NSLog("[Declare] ⚠︎ this app was built from platform %@; the tree now reads %@. "
                  + "Re-run mac-host/bundle.sh — its bundled runtime and the tree's compiler may disagree.",
                  stamped, current)
        }
    }

    static func distroRoot() -> URL {
        if let env = ProcessInfo.processInfo.environment["DECLARE_ROOT"] { return URL(fileURLWithPath: env) }
        // …/mac/.build/<cfg>/DeclareMac → the distro two levels above `mac/`
        var u = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
        for _ in 0..<6 {
            u = u.deletingLastPathComponent()
            if FileManager.default.fileExists(atPath: u.appendingPathComponent("bundles/declare-mac.js").path) { return u }
        }
        return URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    }

    // ── frame pump ──────────────────────────────────────────────────────────

    /// The frame clock. CADisplayLink fires ON THE MAIN THREAD in step with the
    /// display; CVDisplayLink fires on its own thread and must hop over via
    /// DispatchQueue.main.async, where ticks PILE UP behind a busy main thread
    /// and then run back-to-back — measured as commits ~5.5ms apart on an
    /// 8.3ms display, which is exactly what uneven motion looks like.
    private func startDisplayLink() {
        guard let v = view else { return }
        let link = v.displayLink(target: self, selector: #selector(onFrame))
        link.add(to: .main, forMode: .common)
        caLink = link
    }

    /// Per-display-frame trace for the first moments of a gesture: (tick,
    /// ms since reset, did it commit, ops bytes). A gap in the commit column is
    /// the whole question — a frame where the model produced nothing.
    var tickLog: [(Int, Double, Bool, Int)] = []

    @objc private func onFrame(_ link: CADisplayLink) {
        linkTicks += 1
        let before = commitCount
        let beforeBytes = commitBytes
        defer {
            if statsTracing, tickLog.count < 24 {
                tickLog.append((linkTicks, (CFAbsoluteTimeGetCurrent() - statsStart) * 1000,
                                commitCount > before, commitBytes - beforeBytes))
            }
        }
        // The timestamp handed to the runtime is when this frame will be SHOWN,
        // not when the callback happened to run. Animation is a function of
        // time, so sampling it at jittery callback times produces uneven motion
        // even when every frame is presented perfectly on cadence — the browser
        // gets this right by construction (rAF's argument is the frame time),
        // and we were passing the wall clock.
        frameTime = link.targetTimestamp * 1000
        pump()
        // Nobody asked for the next frame: stop the clock. A link left running
        // wakes the process at every refresh forever — measured at idle as the
        // ONLY thing the host does, ~250 context switches a second of QuartzCore
        // servicing a callback whose pump() immediately returns. Pausing here
        // costs nothing on the wake side: every source of work funnels through
        // needsFrame(), which resumes the link, and a resumed link fires at the
        // next vsync — exactly when a never-paused link would have fired.
        if !frameRequested { link.isPaused = true }
    }
    private var frameTime: Double = 0

    /// Ask for a frame without forcing one now — the display link will pick it
    /// up on the next refresh, which is what keeps motion vsync-aligned.
    /// Main thread only (AppKit events, run-loop timers, and the completion
    /// hops in fetch/loadImage all arrive there) — isPaused is not guarded.
    func needsFrame() {
        frameRequested = true
        caLink?.isPaused = false
    }

    // ── gesture statistics ──────────────────────────────────────────────────
    //
    // Smoothness is not a screenshot question. What matters is the COST of each
    // committed frame and the GAP between commits: a gesture is smooth when
    // every commit fits the display's budget and the gaps land on the refresh
    // cadence. These reset/report around one gesture so a sweep can be measured
    // on its own rather than averaged over the session.

    func resetStats() {
        commitCount = 0; commitMsTotal = 0; commitMsMax = 0; commitBytes = 0
        commitDurations.removeAll(); commitGaps.removeAll()
        lastCommitAt = 0; linkTicks = 0; pumps = 0
        geomGaps.removeAll(); lastGeomCommitAt = 0
        tickLog.removeAll(); firstCommits.removeAll(); statsTracing = true
        resizeN = 0; resizeMs = 0; resizeJsMs = 0; resizeSettleMs = 0; resizePumpMs = 0; resizeMaxMs = 0
        tree.opHist.removeAll(); tree.rasterCount = 0; tree.drawNodes.removeAll(); tree.rasterMsTotal = 0; tree.overlayMsTotal = 0; tree.opMs.removeAll(); tree.caCommitMsTotal = 0; tree.caCommitCpuMsTotal = 0; tree.richLayoutCount = 0; tree.richLayoutMs = 0; tree.richLayoutBytes = 0; tree.richParseMs = 0; RichOverlay.RichStats.reset()
        tree.rasterMsNodes.removeAll(); tree.rasterPxNodes.removeAll()
        tree.describedN = 0; tree.rasterizedN = 0
        tree.skippedRasterN = 0; tree.revealedRasterN = 0; tree.revealedRasterMs = 0
        TextLayer.drawCount = 0; TextLayer.drawMs = 0; TextLayer.buildCount = 0; TextLayer.statsOn = true
        RichOverlay.redrawCount = 0; RichOverlay.redrawMP = 0; RichOverlay.redrawMs = 0; RichOverlay.statsOn = true; tree.statsOn = true
        statsStart = CFAbsoluteTimeGetCurrent()
    }
    private var statsStart: CFAbsoluteTime = 0
    var statsTracing = false
    var firstCommits: [String] = []

    func statsReport() -> String {
        let elapsed = max(0.0001, CFAbsoluteTimeGetCurrent() - statsStart)
        func pct(_ xs: [Double], _ p: Double) -> Double {
            guard !xs.isEmpty else { return 0 }
            let s = xs.sorted()
            return s[min(s.count - 1, max(0, Int(p * Double(s.count - 1))))]
        }
        let d = commitDurations, g = commitGaps
        let budget = 1000.0 / max(1.0, Double(view?.window?.screen?.maximumFramesPerSecond ?? 60))
        return String(format:
            "commits=%d over %.2fs (%.1f/s)  linkTicks=%d (%.1f Hz)  pumps=%d\n" +
            "  commit ms  p50=%.2f p95=%.2f max=%.2f  avgBytes=%d\n" +
            "  gap ms     p50=%.2f p95=%.2f max=%.2f  (display budget %.2f) over=%d",
            commitCount, elapsed, Double(commitCount) / elapsed,
            linkTicks, Double(linkTicks) / elapsed, pumps,
            pct(d, 0.5), pct(d, 0.95), d.max() ?? 0, commitCount > 0 ? commitBytes / commitCount : 0,
            pct(g, 0.5), pct(g, 0.95), g.max() ?? 0,
            budget, g.filter { $0 > budget * 1.5 }.count)
          + String(format: "\n  MOTION gap ms p50=%.2f p95=%.2f max=%.2f  over=%d  (n=%d)",
                    pct(geomGaps, 0.5), pct(geomGaps, 0.95), geomGaps.max() ?? 0,
                    geomGaps.filter { $0 > budget * 1.5 }.count, geomGaps.count)
          + String(format: "\n  RESIZE path n=%d  total=%.1fms  avg=%.2f max=%.2f   of which __declareResize=%.1fms  __declareSettle=%.1fms  pump+apply=%.1fms",
                   resizeN, resizeMs, resizeN > 0 ? resizeMs / Double(resizeN) : 0, resizeMaxMs,
                   resizeJsMs, resizeSettleMs, resizePumpMs)
          + "\n  first commits:\n    " + firstCommits.joined(separator: "\n    ")
          + "\n  ticks: " + tickLog.map { "\($0.0)@\(Int($0.1))ms\($0.2 ? "✓\($0.3)b" : "·")" }.joined(separator: " ")
          + "  worstGapAtCommit=" + (g.firstIndex(where: { $0 > budget * 1.5 }).map { String($0 + 1) } ?? "-") + "/\(commitCount)"
          + String(format: "\n  rasters=%d  rasterMs total=%.1f avg=%.2f (%.0f%% of commit) overlayMs total=%.1f (%.0f%% of commit)   ops: ", tree.rasterCount, tree.rasterMsTotal, tree.rasterCount > 0 ? tree.rasterMsTotal / Double(tree.rasterCount) : 0, commitMsTotal > 0 ? 100 * tree.rasterMsTotal / commitMsTotal : 0, tree.overlayMsTotal, commitMsTotal > 0 ? 100 * tree.overlayMsTotal / commitMsTotal : 0) + opNames()
          + String(format: "\n  CATransaction.commit total=%.0fms (%.0f%% of commit)  of which CPU=%.0fms, WAITING=%.0fms",
                   tree.caCommitMsTotal, commitMsTotal > 0 ? 100 * tree.caCommitMsTotal / commitMsTotal : 0,
                   tree.caCommitCpuMsTotal, max(0, tree.caCommitMsTotal - tree.caCommitCpuMsTotal))
          + String(format: "\n  TextLayer.draw n=%d total=%.0fms (%.0f%% of commit) lineBuilds=%d", TextLayer.drawCount, TextLayer.drawMs, commitMsTotal > 0 ? 100 * TextLayer.drawMs / commitMsTotal : 0, TextLayer.buildCount)
          + String(format: "\n  RichOverlay.redraw n=%d %.1f Mpx %.0fms", RichOverlay.redrawCount, RichOverlay.redrawMP, RichOverlay.redrawMs)
          + String(format: "\n  richLayout n=%d %.0fms %.0f KB", tree.richLayoutCount, tree.richLayoutMs, Double(tree.richLayoutBytes) / 1024)
          // What the host is RETAINING, not what it spent: every rich flow that
          // has ever been on screen holds a full CGImage of its band, and
          // nothing ever released one.
          + { () -> String in
              var n = 0, bytes = 0
              tree.forEachNode { node in
                  if let r = node.rich { let b = r.bitmapBytes; if b > 0 { n += 1; bytes += b } }
              }
              return String(format: "\n  rich bitmaps HELD: n=%d  %.1f MB", n, Double(bytes) / 1_048_576)
          }()
          // A width change genuinely needs only the LAYOUT. parse+build is what
          // the JS→Swift boundary costs on top, and is re-done from scratch.
          + String(format: "\n    parse=%.0fms  build=%.0fms (n=%d)  layout=%.0fms",
                   tree.richParseMs, RichOverlay.RichStats.buildMs, RichOverlay.RichStats.buildN,
                   RichOverlay.RichStats.ensureMs)
          + "\n  opMs: " + tree.opMs.sorted { $0.value > $1.value }.prefix(6).map { String(format: "%@=%.0fms", opName($0.key), $0.value) }.joined(separator: " ")
          + "\n  redrawn: " + drawnNames()
          // WHOSE raster, and how many pixels of it. "888 rasters" is not a
          // plan until you know whether it is one huge surface forty times or
          // eight hundred cheap ones — the two want opposite fixes.
          + "\n  rasterMs by node: " + tree.rasterMsNodes.sorted { $0.value > $1.value }.prefix(8).map {
                let box = tree.node($0.key)?.box ?? .zero
                let mp = (tree.rasterPxNodes[$0.key] ?? 0) / 1_000_000
                return String(format: "#%d=%.0fms/%.1fMpx[%dx%d]", $0.key, $0.value, mp, Int(box.width), Int(box.height))
            }.joined(separator: " ")
          + String(format: "\n    LAYERS: described=%d  rasterized=%d", tree.describedN, tree.rasterizedN)
          + String(format: "\n    hidden: skipped=%d  paid back on reveal=%d (%.0fms)  still owed=%d",
                   tree.skippedRasterN, tree.revealedRasterN, tree.revealedRasterMs, tree.deferredCount)
          + String(format: "\n    (top node is %.0f%% of all raster time; %d nodes rastered)",
                   tree.rasterMsTotal > 0 ? 100 * (tree.rasterMsNodes.values.max() ?? 0) / tree.rasterMsTotal : 0,
                   tree.rasterMsNodes.count)
    }

    /// The views that re-rastered, most first, with their box — so a per-frame
    /// DRAW can be attributed to an actual view rather than guessed at.
    private func drawnNames() -> String {
        tree.drawNodes.sorted { $0.value > $1.value }.prefix(6).map {
            let box = tree.node($0.key)?.box ?? .zero
            return "#\($0.key)x\($0.value) [\(Int(box.width))x\(Int(box.height))]"
        }.joined(separator: " ")
    }

    func opName(_ k: Int) -> String {
        let names = [1: "CREATE", 2: "DESTROY", 3: "INSERT", 4: "ROOT",
                     5: "GEOM", 6: "FILL", 7: "GRADIENT", 8: "RADIUS", 9: "STROKE", 10: "SHADOW",
                     11: "VISIBLE", 12: "OPACITY", 13: "SCALE", 14: "CLIP", 15: "BOXCLIP",
                     16: "TEXT", 17: "TEXTSTYLE", 18: "DRAW", 19: "IMAGE", 20: "STRETCH",
                     21: "SCROLL", 22: "SCROLLPOS", 23: "CURSOR", 26: "RICH", 28: "EMBED"]
        return names[k] ?? "op\(k)"
    }

    private func opNames() -> String {
        let names = [1: "CREATE", 2: "DESTROY", 3: "INSERT", 4: "ROOT",
                     5: "GEOM", 6: "FILL", 7: "GRADIENT", 8: "RADIUS", 9: "STROKE", 10: "SHADOW",
                     11: "VISIBLE", 12: "OPACITY", 13: "SCALE", 14: "CLIP", 15: "BOXCLIP",
                     16: "TEXT", 17: "TEXTSTYLE", 18: "DRAW", 19: "IMAGE", 20: "STRETCH",
                     21: "SCROLL", 22: "SCROLLPOS", 23: "CURSOR", 28: "EMBED"]
        return tree.opHist.sorted { $0.value > $1.value }.prefix(8)
            .map { "\(names[$0.key] ?? "op\($0.key)")=\($0.value)" }.joined(separator: " ")
    }

    /// One tick: run due rAF callbacks (which include the op flush).
    func pump() {
        guard frameRequested else { return }
        pumps += 1
        frameRequested = false
        call("__declareFrame", [frameTime > 0 ? frameTime : CACurrentMediaTime() * 1000])
    }

    @discardableResult
    func call(_ name: String, _ args: [Any]) -> JSValue? {
        guard let fn = ctx.objectForKeyedSubscript(name), !fn.isUndefined else { return nil }
        return fn.call(withArguments: args)
    }

    func boot(url: String) { call("__declareBoot", [url]); pump() }

    /// Run the shared engine bench plus our own pipeline measurements and write
    /// a JSON report. Nothing here touches the renderer's hot path in normal use.
    func runBenchmarks(to path: String) {
        var report: [String: Any] = [:]
        report["engine"] = "JavaScriptCore"
        // 1. the shared engine bench (identical source in every host)
        if let u = Self.resource("bench-core.js"), let src = try? String(contentsOf: u, encoding: .utf8) {
            let t0 = CFAbsoluteTimeGetCurrent()
            let v = ctx.evaluateScript(src, withSourceURL: u)
            report["engineBenchWallMs"] = (CFAbsoluteTimeGetCurrent() - t0) * 1000
            if let d = v?.toDictionary() as? [String: Any] { report["engine_bench"] = d }
        }
        // 2. does this process actually JIT? (an entitlement + platform answer)
        report["jitEnabled"] = Self.jitAvailable()
        // 3. our pipeline
        if let s = call("__declareBench", [])?.toString(),
           let d = try? JSONSerialization.jsonObject(with: Data(s.utf8)) as? [String: Any] {
            report["pipeline"] = d
        }
        report["commits"] = ["count": commitCount,
                             "avgMs": commitCount > 0 ? commitMsTotal / Double(commitCount) : 0,
                             "maxMs": commitMsMax,
                             "avgBytes": commitCount > 0 ? commitBytes / commitCount : 0]
        report["firstPaintMs"] = firstCommitAt > 0 ? (firstCommitAt - startedAt) * 1000 : -1
        func pct(_ a: [Double], _ q: Double) -> Double {
            guard !a.isEmpty else { return 0 }
            let s = a.sorted(); return s[min(s.count - 1, Int(Double(s.count) * q))]
        }
        let elapsed = CFAbsoluteTimeGetCurrent() - startedAt
        report["linkHz"] = Double(linkTicks) / elapsed
        report["pumps"] = pumps
        report["frames"] = ["commits": commitDurations.count,
                            "commitP50": pct(commitDurations, 0.5), "commitP95": pct(commitDurations, 0.95),
                            "commitMax": commitDurations.max() ?? 0,
                            "gapP50": pct(commitGaps, 0.5), "gapP95": pct(commitGaps, 0.95),
                            "gapMax": commitGaps.max() ?? 0]
        report["layers"] = tree.layerCount()
        report["rssMB"] = Self.residentMB()
        report["textCacheProbe"] = Self.timeIt { _ = TextEngine.measure(text: "The quick brown fox jumps",
            font: "400 13px system-ui", letterSpacing: 0, scale: 2) }
        report["textMeasureColdMs"] = Self.timeIt {
            for i in 0..<2000 { _ = TextEngine.measure(text: "sample text \(i)", font: "400 13px system-ui", letterSpacing: 0, scale: 2) }
        }
        if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) {
            try? data.write(to: URL(fileURLWithPath: path))
        }
        NSLog("[bench] written to %@", path)
    }

    static func timeIt(_ body: () -> Void) -> Double {
        let t = CFAbsoluteTimeGetCurrent(); body(); return (CFAbsoluteTimeGetCurrent() - t) * 1000
    }

    /// Whether this process may map JIT pages at all — the honest answer to
    /// "is the runtime interpreted here?" (macOS: yes unless hardened-runtime
    /// signed without the entitlement; iOS: never, for a third-party engine.)
    static func jitAvailable() -> Bool {
        let size = 4096
        let p = mmap(nil, size, PROT_READ | PROT_WRITE | PROT_EXEC, MAP_PRIVATE | MAP_ANON | MAP_JIT, -1, 0)
        if p == MAP_FAILED { return false }
        munmap(p, size)
        return true
    }

    static func residentMB() -> Double {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size)
        let kr = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
            }
        }
        return kr == KERN_SUCCESS ? Double(info.resident_size) / 1_048_576 : -1
    }

    // ── networking + images ─────────────────────────────────────────────────

    private func fetch(id: Int, method: String, urlStr: String, body: String) {
        guard let url = URL(string: urlStr) else {
            call("__declareFetchDone", [id, -1, "", ""]); return
        }
        if url.isFileURL {
            let r0 = CFAbsoluteTimeGetCurrent()
            let text = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
            let ok = !text.isEmpty || FileManager.default.fileExists(atPath: url.path)
            let readMs = (CFAbsoluteTimeGetCurrent() - r0) * 1000
            DispatchQueue.main.async { [weak self] in
                self?.mark("file \(ok ? 200 : 404)", String(format: "%4d KB read %.0fms  %@",
                                                            text.utf8.count / 1024, readMs,
                                                            (urlStr as NSString).lastPathComponent))
                let c0 = CFAbsoluteTimeGetCurrent()
                self?.call("__declareFetchDone", [id, ok ? 200 : 404, text, ""])
                self?.mark("  └ JS handled it", String(format: "%.0fms", (CFAbsoluteTimeGetCurrent() - c0) * 1000))
                self?.needsFrame()
            }
            return
        }
        var req = URLRequest(url: url)
        // NEVER the URL cache. The JS boot layer runs its own cache with etag
        // revalidation (mac-boot fromServer + H.cacheGet), so a second cache at
        // this level can only disagree with it — and did: URLSession's disk
        // cache handed boot a PRE-FIX ?program body (stale extracted deps, so a
        // constraint wired without its dataset edge) while every fresh probe of
        // the same URL answered current. One cache, owned where the etag is.
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.httpMethod = method
        if !body.isEmpty { req.httpBody = body.data(using: .utf8) }
        // Header pass-through for the cache revalidation tier.
        if let hdrs = pendingHeaders[id] { for (k, v) in hdrs { req.setValue(v, forHTTPHeaderField: k) } }
        pendingHeaders[id] = nil
        let fetchT0 = CFAbsoluteTimeGetCurrent()
        Self.net.dataTask(with: req) { [weak self] data, resp, _ in
            let http = resp as? HTTPURLResponse
            let status = http?.statusCode ?? -1
            let text = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            let ctype = http?.value(forHTTPHeaderField: "content-type") ?? ""
            let ms = (CFAbsoluteTimeGetCurrent() - fetchT0) * 1000
            DispatchQueue.main.async {
                self?.mark("fetch \(status)", String(format: "%4d KB in %.0fms  %@",
                                                     text.utf8.count / 1024, ms, urlStr))
                let c0 = CFAbsoluteTimeGetCurrent()
                self?.call("__declareFetchDone", [id, status, text, ctype])
                self?.mark("  └ JS handled it", String(format: "%.0fms", (CFAbsoluteTimeGetCurrent() - c0) * 1000))
                self?.needsFrame()
            }
        }.resume()
    }
    var pendingHeaders: [Int: [String: String]] = [:]

    private func loadImage(handle: Int, urlStr: String) {
        NSLog("[image] load %d <- %@", handle, urlStr)
        let finish: (CGImage?) -> Void = { [weak self] img in
            DispatchQueue.main.async {
                guard let self else { return }
                if let img { self.images[handle] = img; self.tree.imageLoaded(handle: handle, image: img) }
                self.call("__declareImageDone", [handle, img?.width ?? 0, img?.height ?? 0, img != nil])
                self.needsFrame()
            }
        }
        guard let url = URL(string: urlStr), url.scheme != nil else {
            NSLog("[image] unresolvable src: %@", urlStr)
            finish(nil); return
        }
        if url.isFileURL {
            finish(Self.decode(try? Data(contentsOf: url))); return
        }
        Self.net.dataTask(with: url) { data, _, _ in finish(Self.decode(data)) }.resume()
    }

    static func decode(_ data: Data?) -> CGImage? {
        guard let data, let src = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(src, 0, nil)
    }

    func image(_ handle: Int) -> CGImage? { images[handle] }

    // ── SVG path data → CGPath (clips, and draw()'s Path2D ops) ─────────────

    func path(for d: String) -> CGPath? {
        if let c = pathCache[d] { return c }
        guard let p = SVGPath.parse(d) else { return nil }
        if pathCache.count > 256 { pathCache.removeAll() }
        pathCache[d] = p
        return p
    }
}

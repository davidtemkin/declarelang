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
    /// The Inspector's open state, pushed from JS when it changes.
    var onInspector: ((Bool) -> Void)?
    var onBootFailed: ((String) -> Void)?
    /// `app.navigate(url)` / `app.openWindow(url)` — the program asking to go
    /// somewhere. `newWindow` distinguishes the two verbs.
    var onNavigate: ((String, Bool) -> Void)?
    /// The runtime's history mirror (mac-boot wireMacHistory): the app's
    /// (location, waypoint) pair changed in a settle — (loc, step, verb, the
    /// departed page's scroll offset). The window keeps the trail.
    var onHistoryEntry: ((String, String, String, Double) -> Void)?
    /// Make the CURRENT trail entry agree with the app — after a boot or a
    /// traversal (the web's square-by-replace).
    var onHistorySquare: ((String, String) -> Void)?

    /// Drive the live program to a history pair — the popstate direction. The
    /// runtime restores the step directly, the address through `follow` (so
    /// the app's onFollow hook applies — pass, redirect, veto), then squares
    /// the entry back through historySquare.
    func travel(loc: String, step: String, scroll: Double) {
        guard let data = try? JSONSerialization.data(withJSONObject: [loc, step, scroll]),
              let args = String(data: data, encoding: .utf8) else { return }
        ctx.evaluateScript("globalThis.__declareTravel && __declareTravel.apply(null, \(args))")
    }
    /// Fired ONCE per `boot()`, when the program first puts something on screen
    /// or gives up trying. "The window is no longer starting" — which is what
    /// ends the dock bounce and releases the deferred activation.
    var onReady: (() -> Void)?
    private var bootPending = false
    private func settleBoot() {
        guard bootPending else { return }
        bootPending = false
        onReady?()
    }
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
            self.settleBoot()                      // something is on screen now
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
            Bridge.appearance()
        } as @convention(block) () -> String, forKeyedSubscript: "appearance")

        // NAVIGATION, from the program to the window (mac-boot navTick). The
        // program says WHERE; the host decides what a window is — which is the
        // whole point of the channel, and why `newWindow` is the host's word and
        // not the program's.
        host.setObject({ [weak self] (url: String, newWindow: Bool) in
            self?.onNavigate?(url, newWindow)
        } as @convention(block) (String, Bool) -> Void, forKeyedSubscript: "navigate")

        host.setObject({ [weak self] (title: String) in
            self?.onTitle?(title)
        } as @convention(block) (String) -> Void, forKeyedSubscript: "setTitle")

        // HISTORY, from the program to the window — the pair mirror's two
        // outward verbs (see onHistoryEntry / onHistorySquare).
        host.setObject({ [weak self] (loc: String, step: String, verb: String, scroll: Double) in
            self?.onHistoryEntry?(loc, step, verb, scroll)
        } as @convention(block) (String, String, String, Double) -> Void, forKeyedSubscript: "historyEntry")

        host.setObject({ [weak self] (loc: String, step: String) in
            self?.onHistorySquare?(loc, step)
        } as @convention(block) (String, String) -> Void, forKeyedSubscript: "historySquare")

        // The Inspector opened or closed. PUSHED from JS rather than polled:
        // mounting is async (compile, then mount), so the titlebar control read
        // `false` if it asked immediately after asking for the toggle — and
        // polling every frame would mean a Swift→JS call per frame to serve a
        // button that changes twice a session.
        host.setObject({ [weak self] (open: Bool) in
            self?.onInspector?(open)
        } as @convention(block) (Bool) -> Void, forKeyedSubscript: "inspectorState")

        host.setObject({ [weak self] (msg: String) in
            self?.lastError = msg
            // settleBoot FIRST: it is what puts the window on screen, and
            // `onBootFailed` runs a modal for a person — which would otherwise
            // sit over an invisible window and block the run loop before it
            // could appear.
            self?.settleBoot()          // gave up — still no longer "starting"
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

        // COMPILE, off this thread (CompileService). The runtime hands over a
        // source string and hears back a compiled one; everything between —
        // the cache, the second JSContext, the include walk — happens on
        // another thread, so the window stays live throughout.
        host.setObject({ [weak self] (id: Int, url: String, source: String, originDir: String, distro: String) in
            guard let self else { return }
            CompileService.shared.compile(url: url, source: source, originDir: originDir, distro: distro) { [weak self] r in
                guard let self else { return }
                self.mark("compile \(r.origin)", String(format: "%.0fms  %@", r.ms, (url as NSString).lastPathComponent))
                self.call("__declareCompileDone",
                          [id, r.ok, r.source, r.depsJSON, r.report, r.origin, r.ms])
                self.needsFrame()
            }
        } as @convention(block) (Int, String, String, String, String) -> Void, forKeyedSubscript: "compile")

        // The client-compile tier loads the compiler INTO this same context.
        host.setObject({ [weak self] (src: String, url: String) in
            let t0 = CFAbsoluteTimeGetCurrent()
            self?.ctx.evaluateScript(src, withSourceURL: URL(string: url))
            self?.mark("H.evaluate", String(format: "%d KB in %.0fms  %@", src.utf8.count / 1024,
                                            (CFAbsoluteTimeGetCurrent() - t0) * 1000,
                                            (url as NSString).lastPathComponent))
        } as @convention(block) (String, String) -> Void, forKeyedSubscript: "evaluate")

        // WHERE THE PLATFORM IS — the compiler and the library, as a base to
        // resolve against. Always this app's own Resources: the platform is
        // chosen at BUILD time and there is no second answer at run time.
        host.setObject(Self.platformBase(), forKeyedSubscript: "platform")

        ctx.setObject(host, forKeyedSubscript: "__declareMacHost" as NSString)
    }

    /// The theme the program is rendering in — "dark" or "light".
    ///
    /// DECLARE_APPEARANCE pins the answer. A comparison against the DOM is only
    /// a measurement if both sides are in the same theme, and the native host
    /// otherwise follows whatever the machine is set to while headless Chrome
    /// defaults to light — which reads as a huge, entirely spurious divergence.
    ///
    /// ⚠ TRUSTING THE HARNESS TO SET IT IS NOT ENOUGH, which is why this is a
    /// shared function and not a closure. `gate.mjs` drives an app it did not
    /// launch, so it cannot set the variable — and on 2026-08-17, run against a
    /// host on a machine that had gone dark, it reported calendar 99.98%
    /// differing and desktop 33.27% as REGRESSIONS, deterministic across runs
    /// and unmoved by stashing the working tree. Two entirely false failures
    /// that read exactly like a broken renderer. So the window PUBLISHES this
    /// (`publishGeometry`) and the web side matches it, rather than both sides
    /// assuming they agree.
    static func appearance() -> String {
        if let forced = ProcessInfo.processInfo.environment["DECLARE_APPEARANCE"] {
            return forced == "dark" ? "dark" : "light"
        }
        return NSApp.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? "dark" : "light"
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

    /// The host's own scripts (mac-env.js, declare-mac.js), from this app.
    ///
    /// ONE SOURCE, and it is the bundle. There used to be a tree fallback and a
    /// DECLARE_ROOT override in front of it, which meant "which runtime is this
    /// app running?" had three possible answers resolved at launch. Both
    /// recorded misdiagnoses on this host are that ambiguity: 2026-08-01, a
    /// diagnosis made against a bundle when the tree was meant; 2026-08-17, a
    /// fix written, built, and then debugged for a full cycle against an app
    /// still running the previous runtime. The platform is now chosen when the
    /// app is BUILT — bundle.sh cannot bake a stale one — so there is nothing
    /// left for a run-time switch to disambiguate.
    static func resource(_ name: String) -> URL? {
        Bundle.main.url(forResource: name, withExtension: nil)
    }

    /// The BAKED platform — `Contents/Resources/`, laid out like the tree
    /// (`bundles/…`, `library/…`) — as a `file://` base with a trailing slash.
    ///
    /// This is what makes the app independent of a Declare tree: the compiler
    /// and the library resolve against it exactly as they resolved against a
    /// distro, because the shape is the same and every reader was already a URL
    /// join over a fetch host that speaks `file:`.
    ///
    /// THERE IS NO SECOND ANSWER. This used to return "" for a tree-elected or
    /// unbaked app, and every caller carried a fallback to a Declare tree found
    /// on disk — which is how an app could run its own runtime against some
    /// other tree's compiler. The platform is chosen when the app is BUILT
    /// (bundle.sh bakes it and refuses to bake a stale one), so an app that
    /// reaches here without one is not a dev convenience, it is broken.
    static func platformBase() -> String {
        guard let res = Bundle.main.resourceURL else { return "" }
        let s = res.absoluteString
        return s.hasSuffix("/") ? s : s + "/"
    }

    /// Refuse to run half a platform. Every file bundle.sh bakes is required at
    /// launch, because the alternative is what this host used to do: start
    /// anyway, fall back to whatever tree it could find, and fail later as
    /// "unknown component 'Button'" or "no distro: cannot load the compiler" —
    /// symptoms that name the program, never the broken app.
    static func assertPlatform() {
        guard let res = Bundle.main.resourceURL else { return }
        let need = ["declare-mac.js", "mac-env.js", "bundles/declare-compiler-mac.js",
                    "library/autoincludes.json", "apps/inspector/inspector.declare",
                    "apps/viewer/viewer.declare"]
        let missing = need.filter {
            !FileManager.default.fileExists(atPath: res.appendingPathComponent($0).path)
        }
        guard !missing.isEmpty else { return }
        NSLog("[Declare] ✗ this app's baked platform is incomplete (%@). "
              + "It was not assembled by mac-host/bundle.sh, or the bundle was modified.",
              missing.joined(separator: ", "))
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

    func boot(url: String) { bootPending = true; call("__declareBoot", [url]); pump() }

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

    /// Whether this process may map JIT pages at all.
    ///
    /// ⚠ THIS PROBE LIES ABOUT THE ONE CASE IT EXISTS TO CATCH. A hardened-runtime
    /// binary signed WITHOUT `com.apple.security.cs.allow-jit` still gets a
    /// successful MAP_JIT mapping, and JavaScriptCore still refuses to compile —
    /// which is exactly how an interpreter-only app shipped for weeks reporting
    /// `jitEnabled: true` in every benchmark file. Kept because it answers a
    /// different, real question (iOS, where a third-party engine never JITs);
    /// use `jit` below for "is this engine compiling".
    static func jitAvailable() -> Bool {
        let size = 4096
        let p = mmap(nil, size, PROT_READ | PROT_WRITE | PROT_EXEC, MAP_PRIVATE | MAP_ANON | MAP_JIT, -1, 0)
        if p == MAP_FAILED { return false }
        munmap(p, size)
        return true
    }

    // ── the JIT assertion ───────────────────────────────────────────────────
    //
    // The entitlement was absent for weeks and nothing said so: `bundle.sh`
    // passed a path that did not exist, codesign failed into `2>/dev/null ||`,
    // and the fallback signed without it. Every app built the documented way ran
    // an interpreter — 44x slower — while every probe we had said it was fine.
    //
    // So the check is a BENCHMARK, the only thing that can tell the two apart,
    // and it runs at startup rather than living in a benchmark script nobody
    // runs. bundle.sh now also verifies the signature it just produced, so this
    // is the second of two gates: one on the build, one on the running app.

    /// Iterations for the probe.
    private static let jitProbeIterations = 3_000_000
    /// Anything slower than this is not a compiled loop.
    ///
    /// CALIBRATED, not guessed — `DECLARE_JITPROBE=1` times six loop shapes, and
    /// the same app signed both ways gave (JIT → no entitlement):
    ///
    ///     imul       0.95ms →  87.21ms   92x     ← the probe
    ///     closure    1.85ms →  75.90ms   41x
    ///     int|0      1.36ms →  26.17ms   19x
    ///     megamorph  8.47ms → 124.54ms   15x
    ///     props      5.28ms →  58.95ms   11x
    ///     float      6.19ms →  37.58ms    6x
    ///
    /// The shape matters far more than the count: a plain `(s+i*3)|0` loop
    /// separates the two populations by only 19x and put the interpreter at
    /// 26ms, which a first attempt at this check waved through under a 30ms
    /// budget. `Math.imul` is the widest gap AND the cheapest healthy answer, so
    /// the budget below sits ~10x above a JIT run and ~9x below an interpreted
    /// one. Neither a loaded machine nor a slower Mac can cross that: both
    /// populations scale together.
    private static let jitProbeBudgetMs = 10.0

    struct JITStatus {
        let compiling: Bool
        let ms: Double
        var line: String {
            String(format: "%@  (%d-iteration probe in %.1fms, budget %.0fms; mmap(MAP_JIT)=%@)",
                   compiling ? "JIT: compiling" : "JIT: INTERPRETING",
                   jitProbeIterations, ms, jitProbeBudgetMs, jitAvailable() ? "ok" : "denied")
        }
    }

    /// Measured once, on first ask. A `static let` is lazy and its initialiser
    /// runs exactly once even under contention, which is the whole requirement.
    static let jit: JITStatus = {
        let c = JSContext()!
        // A tight integer loop: the thing a baseline JIT compiles and an
        // interpreter grinds through. Defined once and CALLED twice — a fresh
        // `evaluateScript` each time would re-parse and never let the tiers
        // warm, which measures the parser instead of the engine.
        c.evaluateScript("globalThis.__jitProbe = function (n) { var s = 0; for (var i = 0; i < n; i++) { s = (s + Math.imul(i, 2654435761)) | 0; } return s; }")
        guard let fn = c.objectForKeyedSubscript("__jitProbe"), !fn.isUndefined else {
            return JITStatus(compiling: false, ms: -1)
        }
        _ = fn.call(withArguments: [200_000])            // warm the tiers
        // BEST OF THREE. A JIT run is ~1ms, so a single sample is at the mercy
        // of one scheduling hiccup during launch; the minimum is the honest
        // "how fast can this engine run this loop". Costs ~3ms when healthy.
        var ms = Double.infinity
        for _ in 0..<3 {
            let t0 = CFAbsoluteTimeGetCurrent()
            _ = fn.call(withArguments: [jitProbeIterations])
            ms = min(ms, (CFAbsoluteTimeGetCurrent() - t0) * 1000)
        }
        return JITStatus(compiling: ms < jitProbeBudgetMs, ms: ms)
    }()

    /// Calibration aid (`DECLARE_JITPROBE=1`): time several candidate loop
    /// shapes, so the probe's threshold can be set from measurement on both a
    /// JIT-signed and an entitlement-less build rather than from a guess.
    static func jitProbeCalibration() {
        let bodies: [(String, String)] = [
            ("int|0",      "function(n){var s=0;for(var i=0;i<n;i++){s=(s+i*3)|0;}return s;}"),
            ("imul",       "function(n){var s=0;for(var i=0;i<n;i++){s=(s+Math.imul(i,2654435761))|0;}return s;}"),
            ("float",      "function(n){var s=0.5;for(var i=0;i<n;i++){s=s*1.0000001+i*0.5;}return s;}"),
            ("closure",    "function(n){var f=function(a,b){return a+b*3;};var s=0;for(var i=0;i<n;i++){s=(s+f(i,i))|0;}return s;}"),
            ("props",      "function(n){var o={x:1,y:2,w:3,h:4};var s=0;for(var i=0;i<n;i++){o.y=o.x+i;s=(s+o.y+o.w)|0;}return s;}"),
            ("megamorph",  "function(n){var a=[{k:1,g:function(){return this.k;}},{k:2,q:0,g:function(){return this.k;}},{k:3,q:0,r:0,g:function(){return this.k;}},{k:4,q:0,r:0,t:0,g:function(){return this.k;}}];var s=0;for(var i=0;i<n;i++){s=(s+a[i&3].g())|0;}return s;}"),
        ]
        let c = JSContext()!
        for (name, src) in bodies {
            c.evaluateScript("globalThis.__p = \(src)")
            guard let fn = c.objectForKeyedSubscript("__p"), !fn.isUndefined else { continue }
            _ = fn.call(withArguments: [200_000])
            var best = Double.infinity
            for _ in 0..<3 {
                let t0 = CFAbsoluteTimeGetCurrent()
                _ = fn.call(withArguments: [jitProbeIterations])
                best = min(best, (CFAbsoluteTimeGetCurrent() - t0) * 1000)
            }
            NSLog("[jitprobe] %-10@ %8.2fms  (%d iterations, best of 3)", name, best, jitProbeIterations)
        }
    }

    /// Run the assertion and say so. Loud on failure, one quiet line on success
    /// (so the log can be used to prove the check ran at all).
    static func assertJIT() {
        if ProcessInfo.processInfo.environment["DECLARE_JITPROBE"] != nil { jitProbeCalibration() }
        let s = jit
        if s.compiling { NSLog("[Declare] %@", s.line); return }
        NSLog("""
              [Declare] ⚠︎ JAVASCRIPTCORE IS RUNNING ITS INTERPRETER. %@
                  Everything JS — compiling, layout, every settle — is ~40x slower.
                  Cause: this binary is signed with the hardened runtime but WITHOUT
                  com.apple.security.cs.allow-jit. Check with:
                    codesign -d --entitlements - "%@"
                  Fix by rebuilding: bash mac-host/bundle.sh
              """, s.line, Bundle.main.bundlePath)
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

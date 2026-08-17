// CompileService — the compiler, on its own thread, behind a cache.
//
// WHY THIS IS EASY, WHEN SPLITTING THE RUNTIME IS NOT. The compiler is a PURE
// FUNCTION: source string → compiled string, plus the list of files it read. It
// touches no AppKit, no layer tree, no surface ids, none of the runtime's
// module-level state. So it needs none of the ~24 marshalling points a real
// runtime split would — a second JSContext on a second JSVirtualMachine, its
// own copy of the compiler bundle, and one call in and one JSON out.
//
// (⚠ A SECOND VIRTUAL MACHINE, not just a second context. Two JSContexts sharing
// a JSVirtualMachine share its lock, so the "background" compile would serialize
// against the main thread's every call and buy nothing at all.)
//
// TWO THINGS COME OUT OF PUTTING IT HERE:
//
//   • The main thread stops stalling. A cold client compile of desktop.declare
//     is ~1.0s of straight-line JS, and it used to run between the window
//     appearing and the first frame — the whole "miniature window that sits
//     there" symptom. Now the window opens, animates and bounces while the
//     compile happens somewhere else.
//   • The cache can be checked, and its dependencies re-hashed, off the main
//     thread too. A hit never touches it.
//
// FETCH IS SYNCHRONOUS IN HERE, deliberately. The include walk is async because
// a BROWSER cannot read a file any other way; a worker thread can, and blocking
// it is exactly what it is for. Every `await` in the walk then settles inside
// one microtask drain instead of unwinding to a run loop and back per file.

import AppKit
import JavaScriptCore

final class CompileService {
    static let shared = CompileService()

    /// One serial queue: compiles are already the long pole, and running two at
    /// once would only contend. It is also what makes the lazily-built context
    /// below safe without a lock — everything that touches it runs here.
    private let queue = DispatchQueue(label: "com.davidtemkin.declare.compile", qos: .userInitiated)

    /// Built on first use, ON the queue. Nil until a compile is asked for, so a
    /// boot that hits the cache never pays the ~80ms to evaluate the compiler
    /// bundle — and a session that only ever opens cached programs never builds
    /// this at all.
    private var ctx: JSContext?
    /// The distro the context's library was registered against. A second distro
    /// means a fresh context rather than a silently wrong library.
    private var ctxDistro = ""
    /// `<distro> → BUILD_ID`, the toolchain identity every cache entry is gated
    /// on. Read once per distro per process.
    private var toolchains: [String: String] = [:]

    struct Result {
        let ok: Bool
        /// Compiled program JS (empty when `ok` is false).
        let source: String
        /// The compiler's extracted deps, verbatim JSON, for `build(src, {deps})`.
        let depsJSON: String
        /// The rendered compiler report — the whole diagnosis, when it failed.
        let report: String
        /// Where it came from, for the boot log: "cache" or "compile".
        let origin: String
        let ms: Double
    }

    // ── the public call ─────────────────────────────────────────────────────

    /// Compile `source`, off the main thread, answering on the main thread.
    ///
    /// `url` identifies the program for caching (it is the cache's key, not an
    /// address — the source is passed in, already read). `originDir` is where
    /// its own includes resolve from; `distro` is where the LIBRARY and the
    /// compiler come from.
    func compile(url: String, source: String, originDir: String, distro: String,
                 completion: @escaping (Result) -> Void) {
        queue.async { [weak self] in
            guard let self else { return }
            let t0 = CFAbsoluteTimeGetCurrent()
            if let hit = self.cacheLookup(url: url, source: source, distro: distro) {
                let r = Result(ok: true, source: hit.source, depsJSON: hit.deps, report: "",
                               origin: "cache", ms: (CFAbsoluteTimeGetCurrent() - t0) * 1000)
                DispatchQueue.main.async { completion(r) }
                return
            }
            let r = self.runCompile(url: url, source: source, originDir: originDir, distro: distro, since: t0)
            DispatchQueue.main.async { completion(r) }
        }
    }

    // ── the compile itself ──────────────────────────────────────────────────

    private func runCompile(url: String, source: String, originDir: String, distro: String,
                            since t0: CFAbsoluteTime) -> Result {
        guard let c = context(for: distro) else {
            return Result(ok: false, source: "", depsJSON: "{}",
                          report: "the compiler could not be loaded from \(distro.isEmpty ? "(no distro)" : distro)",
                          origin: "compile", ms: (CFAbsoluteTimeGetCurrent() - t0) * 1000)
        }
        c.evaluateScript("globalThis.__workerResult = null")
        guard let go = c.objectForKeyedSubscript("__workerCompile"), !go.isUndefined else {
            return Result(ok: false, source: "", depsJSON: "{}", report: "worker: __workerCompile missing",
                          origin: "compile", ms: (CFAbsoluteTimeGetCurrent() - t0) * 1000)
        }
        go.call(withArguments: [source, originDir])
        // Settle the compile's promise chain. With a synchronous fetch every
        // `await` resolves into the microtask queue, and JSC drains that queue
        // when the stack unwinds to native — so the answer is normally already
        // here. The loop is for the cases that are not: a compiler that ever
        // reaches for a timer, or a fetch that genuinely had to wait.
        let deadline = CFAbsoluteTimeGetCurrent() + 120
        var raw = c.objectForKeyedSubscript("__workerResult")
        while (raw == nil || raw!.isNull || raw!.isUndefined), CFAbsoluteTimeGetCurrent() < deadline {
            fireDueTimers(c)
            c.evaluateScript("0")                       // drain microtasks
            raw = c.objectForKeyedSubscript("__workerResult")
            if raw == nil || raw!.isNull || raw!.isUndefined { usleep(200) }
        }
        let ms = (CFAbsoluteTimeGetCurrent() - t0) * 1000
        guard let json = raw?.toString(), json != "null", let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return Result(ok: false, source: "", depsJSON: "{}", report: "worker: the compile never answered",
                          origin: "compile", ms: ms)
        }
        let ok = obj["ok"] as? Bool ?? false
        let out = obj["source"] as? String ?? ""
        let depsJSON = obj["deps"] as? String ?? "{}"
        let report = obj["report"] as? String ?? ""
        if ok, !out.isEmpty {
            cacheStore(url: url, source: source, distro: distro, compiled: out, deps: depsJSON,
                       closure: obj["closure"] as? [String] ?? [])
        }
        return Result(ok: ok, source: out, depsJSON: depsJSON, report: report, origin: "compile", ms: ms)
    }

    // ── the cache ───────────────────────────────────────────────────────────
    //
    // WHAT MAKES A CACHED COMPILE STILL VALID. Three things, and between them
    // they cover every input the compiler had:
    //
    //   1. THE TOOLCHAIN — bundles/version.json's BUILD_ID, which is a content
    //      hash of `bundles/` (the compiler itself), `runtime/dist`, `browser/`
    //      AND `library/` (tools/internal/stamp-version.mjs INPUTS). So every
    //      auto-included component's source is already covered by this one
    //      string, and the cache does not re-read the library at all. That is
    //      the difference between validating ~1 file and ~10.
    //   2. THE PROGRAM'S OWN SOURCE, by content hash — not mtime, which a
    //      checkout or a touch moves without changing a byte.
    //   3. ITS OWN (non-library) INCLUDES, by content hash. `compileTracked`
    //      reports exactly which files the walk actually read, so this is the
    //      real dependency set rather than a guess from the text.
    //
    // Anything else that could change the output — a compiler flag, the backend
    // — is fixed for this host, and the toolchain id moves whenever the compiler
    // does.

    private struct Entry: Codable {
        var v: Int
        var toolchain: String
        var mainHash: String
        var deps: [Dep]
        var source: String
        var depsJSON: String
        struct Dep: Codable { var url: String; var hash: String }
    }

    /// Where compiled programs live. Same directory as the rest of the
    /// platform's per-user state (`~/Library/Caches/Declare`).
    private lazy var dir: URL = {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Declare/compiled", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base
    }()

    private func cacheFile(_ url: String) -> URL {
        dir.appendingPathComponent(Bridge.hash(url) + ".json")
    }

    private func cacheLookup(url: String, source: String, distro: String) -> (source: String, deps: String)? {
        // No url = an unsaved buffer (the live-edit channel). It has no identity
        // to cache against and would miss on every keystroke anyway.
        guard !url.isEmpty else { return nil }
        guard let data = try? Data(contentsOf: cacheFile(url)),
              let e = try? JSONDecoder().decode(Entry.self, from: data), e.v == 1 else { return nil }
        guard e.toolchain == toolchain(distro) else { return nil }
        guard e.mainHash == Bridge.hash(source) else { return nil }
        for d in e.deps {
            guard let text = readSync(d.url), Bridge.hash(text) == d.hash else { return nil }
        }
        return (e.source, e.depsJSON)
    }

    private func cacheStore(url: String, source: String, distro: String,
                            compiled: String, deps: String, closure: [String]) {
        guard !url.isEmpty else { return }              // an unsaved buffer: nothing to key on
        // The closure's ids are canonical: deploy-relative for anything inside a
        // distro, absolute for a program opened from disk (compile-browser's
        // fetchHost note). Resolving each against the distro is the same rule
        // the host used to read it, so both kinds land on one address.
        var entries: [Entry.Dep] = []
        for id in closure {
            guard let abs = resolve(id, against: distro), let text = readSync(abs) else { continue }
            entries.append(Entry.Dep(url: abs, hash: Bridge.hash(text)))
        }
        let e = Entry(v: 1, toolchain: toolchain(distro), mainHash: Bridge.hash(source),
                      deps: entries, source: compiled, depsJSON: deps)
        if let data = try? JSONEncoder().encode(e) {
            try? data.write(to: cacheFile(url), options: .atomic)
        }
        prune()
    }

    /// Keep the cache bounded. An entry is a whole compiled program — ~280KB for
    /// the desktop — so this grows with every distinct program ever opened and
    /// nothing here would ever have removed one.
    ///
    /// ⚠ THE PRECEDENT IS RIGHT HERE: the old etag cache in this same directory
    /// accumulated ~284 files / 3.8MB write-only, because its read path was
    /// broken and nobody was watching the write path either. A cache with no
    /// eviction is a leak with a good reputation.
    ///
    /// Oldest-modified first, down to half the cap, so a prune is rare rather
    /// than continuous.
    private static let cacheCapBytes = 64 * 1_048_576
    private func prune() {
        let keys: [URLResourceKey] = [.fileSizeKey, .contentModificationDateKey]
        guard let files = try? FileManager.default.contentsOfDirectory(
                at: dir, includingPropertiesForKeys: keys) else { return }
        let sized = files.compactMap { u -> (URL, Int, Date)? in
            guard let v = try? u.resourceValues(forKeys: Set(keys)) else { return nil }
            return (u, v.fileSize ?? 0, v.contentModificationDate ?? .distantPast)
        }
        var total = sized.reduce(0) { $0 + $1.1 }
        guard total > Self.cacheCapBytes else { return }
        for (u, size, _) in sized.sorted(by: { $0.2 < $1.2 }) {
            if total <= Self.cacheCapBytes / 2 { break }
            try? FileManager.default.removeItem(at: u)
            total -= size
        }
        NSLog("[compile-worker] pruned the compile cache to %.1f MB", Double(total) / 1_048_576)
    }

    /// Drop every cached compile. For a person who suspects the cache and for
    /// `ctl compilecache clear`.
    func clearCache() {
        queue.sync {
            try? FileManager.default.removeItem(at: dir)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
    }

    /// How many entries, and how much disk — `ctl compilecache`.
    func cacheReport() -> String {
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.fileSizeKey])) ?? []
        let bytes = files.reduce(0) { $0 + ((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
        return String(format: "%d compiled programs, %.1f MB in %@", files.count,
                      Double(bytes) / 1_048_576, dir.path)
    }

    private func toolchain(_ distro: String) -> String {
        if let t = toolchains[distro] { return t }
        var t = "unknown"
        if let u = resolve("bundles/version.json", against: distro), let text = readSync(u),
           let d = text.data(using: .utf8),
           let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
           let b = j["build"] as? String { t = b }
        toolchains[distro] = t
        return t
    }

    // ── the worker's context ────────────────────────────────────────────────

    private func context(for distro: String) -> JSContext? {
        if let c = ctx, ctxDistro == distro { return c }
        guard !distro.isEmpty else { return nil }
        ctx = nil                                     // a new distro: start clean
        let t0 = CFAbsoluteTimeGetCurrent()
        // ⚠ ITS OWN VIRTUAL MACHINE. Sharing the main context's VM would share
        // its lock, and this thread would simply queue behind the runtime.
        let c = JSContext(virtualMachine: JSVirtualMachine())!
        c.exceptionHandler = { _, e in
            NSLog("[compile-worker] JS exception: %@", e?.toString() ?? "?")
            if let s = e?.objectForKeyedSubscript("stack")?.toString() { NSLog("[compile-worker]   %@", s) }
        }
        installHost(c)
        // mac-env.js furnishes URL, console, and the rest of the browser shapes
        // the compiler bundle expects. The same file the runtime gets, so the
        // two compilers cannot drift — its `fetch` is then replaced below with a
        // blocking one, which is the single difference this thread wants.
        guard let envURL = Bridge.resource("mac-env.js"),
              let env = try? String(contentsOf: envURL, encoding: .utf8) else { return nil }
        c.evaluateScript(env, withSourceURL: envURL)
        c.evaluateScript(Self.syncFetchShim)
        guard let compURL = resolve("bundles/declare-compiler-mac.js", against: distro),
              let src = readSync(compURL) else {
            NSLog("[compile-worker] no compiler bundle under %@", distro)
            return nil
        }
        c.evaluateScript(src, withSourceURL: URL(string: compURL))
        guard let comp = c.objectForKeyedSubscript("__declareCompiler"), !comp.isUndefined else {
            NSLog("[compile-worker] the compiler bundle did not publish __declareCompiler")
            return nil
        }
        // The auto-include manifest — the tag→file table the walk needs in hand.
        // The SOURCES are not prefetched: `origins` hands the compiler the fetch
        // host above, which reads the handful a program actually reaches.
        if let manURL = resolve("library/autoincludes.json", against: distro), let man = readSync(manURL) {
            c.evaluateScript("""
                globalThis.__declareCompiler.setDefaultLibrary({
                  manifest: \(man), libraryRoot: "library", origins: { distro: \(jsString(distro)) } });
                """)
        }
        c.evaluateScript(Self.compileEntry)
        ctx = c
        ctxDistro = distro
        NSLog("[compile-worker] ready in %.0fms (%@)", (CFAbsoluteTimeGetCurrent() - t0) * 1000, distro)
        return c
    }

    /// The minimum `__declareMacHost` mac-env.js needs to install itself. It
    /// calls `H.scale()` at install and nothing else eagerly; the timer pair is
    /// live because a compiler that ever reaches for one must not hang.
    private func installHost(_ c: JSContext) {
        let host = JSValue(newObjectIn: c)!
        host.setObject({ (level: String, msg: String) in
            NSLog("[compile-worker:%@] %@", level, msg)
        } as @convention(block) (String, String) -> Void, forKeyedSubscript: "log")
        host.setObject({ () -> Double in CACurrentMediaTime() * 1000 }
            as @convention(block) () -> Double, forKeyedSubscript: "now")
        host.setObject({ () -> Double in 2 } as @convention(block) () -> Double, forKeyedSubscript: "scale")
        host.setObject({ () -> String in "light" } as @convention(block) () -> String, forKeyedSubscript: "appearance")
        host.setObject({ () in } as @convention(block) () -> Void, forKeyedSubscript: "needFrame")
        host.setObject({ [weak self] (id: Int, ms: Int, repeats: Int) in
            self?.pendingTimers.append((id, CFAbsoluteTimeGetCurrent() + Double(ms) / 1000))
        } as @convention(block) (Int, Int, Int) -> Void, forKeyedSubscript: "timer")
        host.setObject({ [weak self] (id: Int) in
            self?.pendingTimers.removeAll { $0.id == id }
        } as @convention(block) (Int) -> Void, forKeyedSubscript: "clearTimer")
        // The blocking read the sync-fetch shim calls. A worker thread is the
        // one place in this host where waiting for a file is the right thing.
        host.setObject({ [weak self] (urlStr: String) -> [Any] in
            guard let text = self?.readSync(urlStr) else { return [0, ""] }
            return [200, text]
        } as @convention(block) (String) -> [Any], forKeyedSubscript: "readSync")
        c.setObject(host, forKeyedSubscript: "__declareMacHost" as NSString)
    }

    private var pendingTimers: [(id: Int, at: CFAbsoluteTime)] = []

    private func fireDueTimers(_ c: JSContext) {
        guard !pendingTimers.isEmpty else { return }
        let now = CFAbsoluteTimeGetCurrent()
        let due = pendingTimers.filter { $0.at <= now }
        pendingTimers.removeAll { $0.at <= now }
        for t in due { c.objectForKeyedSubscript("__declareTimerFire")?.call(withArguments: [t.id]) }
    }

    /// Replace mac-env's async fetch with one that reads NOW and hands back an
    /// already-resolved promise. The compiler's include walk is written against
    /// `await`, so this changes nothing it can observe — except that the whole
    /// walk now settles inside a single microtask drain.
    private static let syncFetchShim = """
    (function (g) {
      var H = g.__declareMacHost;
      g.fetch = function (input, init) {
        var url = typeof input === "string" ? input : String(input.url || input);
        var r = H.readSync(url);
        var status = r[0] | 0, text = String(r[1] == null ? "" : r[1]);
        return Promise.resolve({
          ok: status >= 200 && status < 300, status: status, url: url,
          headers: { get: function () { return null; } },
          text: function () { return Promise.resolve(text); },
          json: function () { return Promise.resolve(JSON.parse(text)); }
        });
      };
    })(globalThis);
    """

    /// The one entry point Swift calls. `compileTracked`, not `compile`, because
    /// the dependency closure it returns IS the cache's validation set — the
    /// files the walk actually read, rather than a guess made from the text.
    /// `trackLibrary: false` leaves library components out of that set on
    /// purpose: they are covered wholesale by the toolchain id, so tracking them
    /// would only make every boot re-read and re-hash ten files to learn what
    /// one string already said.
    private static let compileEntry = """
    globalThis.__workerCompile = function (source, originDir) {
      globalThis.__workerResult = null;
      var finish = function (o) { globalThis.__workerResult = JSON.stringify(o); };
      try {
        globalThis.__declareCompiler.compileTracked(source, { originDir: originDir, trackLibrary: false })
          .then(function (out) {
            finish({
              ok: !!out.source, source: out.source || "",
              deps: JSON.stringify(out.deps || {}),
              report: out.report == null ? "" : String(out.report),
              closure: (out.closure && out.closure.entries ? out.closure.entries : []).map(function (e) { return e.id; })
            });
          })
          .catch(function (e) {
            finish({ ok: false, source: "", deps: "{}", report: String((e && e.message) || e), closure: [] });
          });
      } catch (e) {
        finish({ ok: false, source: "", deps: "{}", report: String((e && e.message) || e), closure: [] });
      }
      return 1;
    };
    """

    // ── blocking IO ─────────────────────────────────────────────────────────

    /// Resolve a compiler-canonical id (deploy-relative, or already absolute)
    /// against the distro — `fetchHost`'s own rule, on this side of the bridge.
    private func resolve(_ id: String, against distro: String) -> String? {
        if id.range(of: "^[a-z][a-z0-9+.-]*:", options: [.regularExpression, .caseInsensitive]) != nil { return id }
        guard let base = URL(string: distro) else { return nil }
        return URL(string: id, relativeTo: base)?.absoluteURL.absoluteString
    }

    /// Read a URL, blocking. Files go straight to disk; http waits on the shared
    /// session. Only ever called from the compile queue.
    fileprivate func readSync(_ urlStr: String) -> String? {
        guard let url = URL(string: urlStr) else { return nil }
        if url.isFileURL { return try? String(contentsOf: url, encoding: .utf8) }
        var req = URLRequest(url: url)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        var out: String?
        let sem = DispatchSemaphore(value: 0)
        Bridge.net.dataTask(with: req) { data, resp, _ in
            if let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode), let data {
                out = String(data: data, encoding: .utf8)
            }
            sem.signal()
        }.resume()
        _ = sem.wait(timeout: .now() + 30)
        return out
    }

    private func jsString(_ s: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [s], options: [])
        let arr = data.flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
        return String(arr.dropFirst().dropLast())
    }
}

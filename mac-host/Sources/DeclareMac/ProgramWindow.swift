// ProgramWindow — one window, one program, one runtime.
//
// Everything a running Declare program needs on screen is here: the NSWindow,
// the view that hosts its layer tree, and the JS context driving both. The app
// delegate owns a list of these and nothing else about a program, which is the
// whole reason two can be open at once.
//
// Nothing is shared between windows on purpose. Each has its OWN Bridge, so two
// programs cannot see each other's globals, and closing one tears down only its
// own runtime. The single global here is the control channel, which addresses
// whichever window is frontmost (see AppDelegate.front).

import AppKit

final class ProgramWindow: NSObject, NSWindowDelegate {
    let window: NSWindow
    let view: DeclareView
    let bridge: Bridge
    private(set) var currentURL = ""
    /// The titlebar's two toggles, kept in step with this window's state.
    private var chrome: WindowChrome!
    /// The titlebar's back/forward, likewise.
    private var nav: WindowNav!
    /// ⚠ CACHED, never queried. Asking JS for the Inspector's state means
    /// `evaluateScript` on the main context — and `refreshChrome` is called
    /// from `finishedStarting`, which runs inside a commit. Re-entering the
    /// context there made the fidelity gate non-deterministic (calendar
    /// 99.98% differing on one run, clean on the next). The state is PUSHED
    /// from JS instead (Bridge.onInspector), so this is only ever read.
    private var inspectorIsOpen = false
    func refreshChrome() {
        chrome?.refresh(viewing: viewing, inspecting: inspectorIsOpen)
        nav?.refresh(canGoBack: canGoBack, canGoForward: canGoForward)
    }
    /// Did a program ever load here? An empty window is a slot to reuse
    /// rather than a document to preserve.
    private(set) var loaded = false
    private weak var owner: AppDelegate?

    init(frame: NSRect, owner: AppDelegate) {
        self.owner = owner
        window = NSWindow(contentRect: frame,
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        view = DeclareView(frame: NSRect(origin: .zero, size: frame.size))
        bridge = Bridge(view: view)
        super.init()
        window.title = "Declare"
        // ⚠ AppKit releases a programmatically-created NSWindow when it closes,
        // which under ARC is one release too many — `window` above is already a
        // strong reference. It never bit while the host had exactly one window
        // that was never closed; the moment ⌘W worked it was a segfault inside
        // `-[_NSWindowTransformAnimation dealloc]`, on the CA commit AFTER the
        // close, which points nowhere near here. ARC owns this window.
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.contentView = view
        view.bridge = bridge
        bridge.onTitle = { [weak self] t in self?.window.title = t.isEmpty ? "Declare" : t }
        bridge.onBootFailed = { [weak self] msg in self?.showError(msg) }
        bridge.onReady = { [weak self] in self?.finishedStarting() }
        // The Inspector mounts asynchronously (compile, then mount), so the
        // control cannot read its own effect right after asking for it — the
        // state arrives here when it is true.
        bridge.onInspector = { [weak self] open in self?.inspectorIsOpen = open; self?.refreshChrome() }
        // A link the program followed. `.push`: this IS travel — it is the one
        // navigation back/forward exist to walk.
        //
        // ⚠ NEXT TURN, NOT THIS ONE. navTick runs inside the frame observer, so
        // this callback is reached from JS, from inside a commit. Booting here
        // would re-enter the context to tear down and rebuild the very tree
        // being iterated. Deferring costs one runloop turn and is the same
        // shape the web has for free (the click's frame ends, then the
        // navigation happens).
        bridge.onNavigate = { [weak self] url, newWindow in
            DispatchQueue.main.async {
                guard let self else { return }
                if newWindow { self.owner?.openInNewWindow(url) } else { self.open(url) }
            }
        }
        // The runtime mirrors (app.location, app.waypoint) into this window's
        // trail — the native twin of the web host's history mirror
        // (host-client.js wirePageLocation), aimed at the titlebar arrows
        // instead of a URL bar. "push" mints an entry (stamping the departed
        // entry's scroll first, so Back lands where the user left); "replace"
        // overwrites — a follow whose link declared `replace = true`.
        bridge.onHistoryEntry = { [weak self] loc, step, verb, departScroll in
            guard let self else { return }
            if verb == "replace" {
                if trailAt >= 0 { trail[trailAt].loc = loc; trail[trailAt].step = step }
            } else {
                if trailAt >= 0 { trail[trailAt].scroll = departScroll }
                if trailAt < trail.count - 1 { trail.removeSubrange((trailAt + 1)...) }
                trail.append(Stop(url: currentURL, loc: loc, step: step))
                trailAt = trail.count - 1
            }
            refreshChrome()
        }
        // The current entry made to AGREE with the app — after a boot (the
        // entry learns the program's initial or deep-linked pair) and after a
        // traversal (onFollow may have redirected or vetoed; the entry holds
        // what the app actually decided, the web's square-by-replace). A boot
        // square also releases a held cross-program traversal pair.
        bridge.onHistorySquare = { [weak self] loc, step in
            guard let self, trailAt >= 0 else { return }
            trail[trailAt].loc = loc
            trail[trailAt].step = step
            if let p = pendingStop {
                pendingStop = nil
                if p.loc != loc || p.step != step {
                    // ⚠ Next turn, not this one — this callback is reached from
                    // inside a JS commit (the boot's own settle); the onNavigate
                    // rule.
                    DispatchQueue.main.async { [weak self] in
                        self?.bridge.travel(loc: p.loc, step: p.step, scroll: p.scroll)
                    }
                }
            }
        }
        window.makeFirstResponder(view)
        nav = WindowNav(owner: self)
        window.addTitlebarAccessoryViewController(nav)
        chrome = WindowChrome(owner: self)
        window.addTitlebarAccessoryViewController(chrome)
        refreshChrome()                 // back/forward start out with nowhere to go
        syncSize()
        // ⚠ NOT ordered front yet — see `present()`. A harness is the exception:
        // it addresses windows the moment it makes them.
        if Launch.isAutomated { present() }
    }

    /// Has this window been put on screen?
    private(set) var presented = false

    /// Put the window on screen. Deferred until the program has something to
    /// draw, which is the whole dock-bounce mechanism:
    ///
    /// macOS bounces a launching app's dock icon until the app looks launched,
    /// and ORDERING A WINDOW FRONT is what makes it look launched. Doing that
    /// first and compiling afterwards therefore bought the worst of both — the
    /// bounce stopped, and what replaced it was an empty rectangle titled
    /// "Loading…" for the length of a compile. (Asking for the bounce back with
    /// `requestUserAttention` does not work either: during launch it returns 0
    /// and does nothing at all. Measured, before this.)
    ///
    /// So the window simply waits. The icon goes on bouncing — the platform's
    /// own "still starting", which is exactly what is true — and the window
    /// appears already showing the program.
    func present() {
        guard !presented else { return }
        presented = true
        bridge.mark("WINDOW ON SCREEN")
        window.makeKeyAndOrderFront(nil)
        publishGeometry()
    }

    /// Load a program here. `history` says what this navigation MEANS: an
    /// ordinary open is travel (`.push`), a reload or a mode change is not
    /// (`.stay`), and back/forward are already moving the cursor (`.replay`).
    func open(_ url: String, history: History = .push) {
        if history == .push { remember(url) }
        currentURL = url
        loaded = true
        // Same rule as the session file: a harness's throwaway program is not
        // where the person left off. It matters more here than it looks —
        // automation READS lastURL as its fallback, so a rig that writes it
        // poisons its own next launch with a URL whose server is gone (a test
        // server's port is dead the moment the suite exits). Observed exactly
        // that: a gate run booted an empty window off a stale test port.
        if !Launch.isAutomated { UserDefaults.standard.set(url, forKey: "lastURL") }
        window.title = "Loading…"
        // "This window is starting" — the app keeps its dock icon bouncing (and
        // holds back its activation) while any window is in this state.
        // Balanced by finishedStarting, which the bridge calls on the first
        // commit or on a boot failure, whichever comes first.
        if !starting { starting = true; owner?.beginStarting() }
        bridge.mark("open()", url)
        bridge.boot(url: url)
        owner?.sessionChanged()
    }

    /// Has this window got an outstanding `beginStarting`? One at a time: a
    /// reload while the first load is still in flight must not unbalance the
    /// app's count.
    private var starting = false

    private func finishedStarting() {
        guard starting else { return }
        starting = false
        present()
        // Every boot, not just the first: present() is once-only, and a harness
        // shoots whatever the LAST boot put on screen.
        publishGeometry()
        owner?.endStarting()
        inspectorIsOpen = false         // a fresh boot has no Inspector open
        refreshChrome()
        if inspectAfterBoot {           // "inspect this" asked for from Source mode
            inspectAfterBoot = false
            toggleInspector()
        }
    }

    @objc func reload() { if !currentURL.isEmpty { open(currentURL, history: .stay) } }

    // ── history ─────────────────────────────────────────────────────────────
    //
    // A back/forward trail, per window. Per window because history is about
    // where you have been in THIS window — two windows exploring two programs
    // share nothing else, and would be actively confusing sharing this.
    //
    // An entry is the browser's PAIR plus the program it belongs to: the URL
    // names the PROGRAM (crossing programs reboots, as ever); `loc` and `step`
    // are the app's (location, waypoint) — the same coordinates a browser
    // entry carries in its fragment and state object. In-app moves arrive
    // from the runtime per settle (bridge.onHistoryEntry — mac-boot's mirror,
    // the native twin of host-client's wirePageLocation), so the arrows walk
    // in-app places exactly as a browser's do; a traversal within the live
    // program restores the pair through __declareTravel (the popstate
    // direction) and never reboots. `scroll` is stamped at departure and
    // restored on traversal — the browser's per-entry scroll, manually, for
    // the same reason the web host owns it there.
    //
    // WHAT IT DOES NOT HOLD. Source mode is a way of LOOKING at the program you
    // are on, not a place you went (see `viewing`), and a reload is not travel
    // either. Both would make Back mean "undo the last thing I clicked" rather
    // than "the program I was on before", and the difference only shows up when
    // you are already lost, which is when you reach for Back.
    //
    // The shape is the browser's, because it is the one everybody already has:
    // a cursor into a list; going somewhere new from the middle discards the
    // forward half.
    struct Stop { var url: String; var loc = ""; var step = ""; var scroll = -1.0 }
    private var trail: [Stop] = []
    private var trailAt = -1
    /// A cross-program traversal's target pair, applied when the freshly
    /// booted program squares its initial entry (onHistorySquare below).
    private var pendingStop: Stop? = nil

    /// What `open` should do to the trail.
    enum History { case push, stay, replay }

    var canGoBack: Bool { trailAt > 0 }
    var canGoForward: Bool { trailAt >= 0 && trailAt < trail.count - 1 }

    @objc func goBack() {
        guard canGoBack else { return }
        trailAt -= 1
        travel()
    }

    @objc func goForward() {
        guard canGoForward else { return }
        trailAt += 1
        travel()
    }

    /// Go where the cursor now points. Within the live program this is the
    /// browser's popstate — the pair rides into the runtime and the app's own
    /// machinery (follow, onFollow, waypoint re-derives) does the rest; no
    /// reboot. Crossing programs (or leaving Source mode, whose display only a
    /// boot restores) reboots and holds the pair for the arrival to apply.
    private func travel() {
        // Before anything else: the arrows describe the TRAIL, which has
        // already moved, and a compile is long enough for a stale arrow to be
        // clicked again.
        refreshChrome()
        let stop = trail[trailAt]
        if stop.url == currentURL && !viewing {
            bridge.travel(loc: stop.loc, step: stop.step, scroll: stop.scroll)
            return
        }
        viewing = false
        subjectURL = ""
        pendingStop = stop
        open(stop.url, history: .replay)
    }

    private func remember(_ url: String) {
        // Re-opening what is already here (a reload, a re-boot of the same URL)
        // is not a second visit.
        if trailAt >= 0 && trail[trailAt].url == url { return }
        if trailAt < trail.count - 1 { trail.removeSubrange((trailAt + 1)...) }
        trail.append(Stop(url: url))
        trailAt = trail.count - 1
    }

    // ── the two ways of looking at this window's program ────────────────────

    /// The Inspector, over whatever is running here. The overlay is built in
    /// this window's own runtime, so the call is just a nudge across the
    /// bridge; `open` state is read back the same way for the titlebar.
    @objc func toggleInspector() {
        // ONE AT A TIME. Turning the Inspector on while the window is showing
        // Source means "go back to the program and inspect it" — and since
        // leaving Source reboots the window, the request has to survive that
        // boot rather than race it (`inspectAfterBoot`, paid out in onReady).
        if viewing && !inspectorOpen {
            inspectAfterBoot = true
            toggleViewer()
            return
        }
        bridge.ctx.evaluateScript("globalThis.__declareToggleInspector && __declareToggleInspector()")
        refreshChrome()
    }

    /// An Inspector asked for while the window was in Source mode.
    private var inspectAfterBoot = false

    var inspectorOpen: Bool { inspectorIsOpen }

    /// SOURCE MODE: the window stops running the program and starts running the
    /// Declare Viewer ON it — reader, source, and an Edit tab with the program
    /// live inside. Toggling back reloads the program itself.
    ///
    /// A STATE OF THIS WINDOW, not a second window: it is another way of
    /// looking at the same thing, and a viewer beside its subject would leave
    /// you managing two windows to read one program.
    ///
    /// ⚠ It does NOT enter history. Back/forward walk PROGRAMS; a mode that
    /// pushed itself onto that stack would make Back flip the mode instead of
    /// returning where you came from — confusing exactly when you are lost. So
    /// `viewing` is remembered per window and survives navigation, while
    /// `subjectURL` holds what to come back to.
    private(set) var viewing = false
    private var subjectURL = ""

    @objc func toggleViewer() {
        if viewing {
            viewing = false
            let back = subjectURL
            subjectURL = ""
            // `.stay`: coming back OUT of Source lands on the program you were
            // already on. It is the same place, seen the usual way.
            if !back.isEmpty { open(back, history: .stay) }
        } else {
            guard !currentURL.isEmpty else { return }
            // ONE AT A TIME, the other direction. Entering Source replaces the
            // running program, so an open Inspector would go with it anyway —
            // closing it first keeps the control honest instead of letting it
            // read "on" for an overlay that no longer exists.
            if inspectorOpen {
                bridge.ctx.evaluateScript("globalThis.__declareToggleInspector && __declareToggleInspector()")
            }
            subjectURL = currentURL
            viewing = true
            // The Viewer is a program like any other, told what to read through
            // its env — the same `program=` the desktop's "View & Edit Source"
            // passes. Relative to the viewer's own directory, as its transport
            // base expects.
            // `.stay`: Source is a mode, not a destination (see `trail`).
            //
            // ⚠ `?program=` IS A RESERVED REQUEST KEY (reqtypes.ts REQ.PROGRAM:
            // "the compiled program as JSON"). It is the Viewer's env key — the
            // desktop passes the same one through island env — and it is safe
            // HERE only because this URL is a `file:` URL inside the app bundle,
            // which no server ever classifies. Point Source mode at an http
            // viewer URL and requestType would answer PROGRAM: the server would
            // return viewer.declare COMPILED instead of running it.
            open(Bridge.platformBase() + "apps/viewer/viewer.declare?program=" + (subjectURL.addingPercentEncoding(
                withAllowedCharacters: .urlQueryAllowed) ?? subjectURL), history: .stay)
        }
        refreshChrome()
    }

    /// The fidelity harness needs the exact content rect inside the window
    /// image; publishing it removes the guesswork (and a 32pt error).
    ///
    /// One file for a host that can now have several windows: it describes the
    /// FRONT one, which is the one a harness is shooting.
    ///
    /// The last field is the THEME, which is not geometry but belongs here for
    /// the same reason the chrome height does: it is a property of the shot that
    /// the shooter cannot see and must not guess (Bridge.appearance).
    func publishGeometry() {
        // ⚠ `front` cannot answer for a window the owner has not adopted yet:
        // newWindow() appends to `windows` AFTER init returns, so the publish in
        // init — and the one in the automated present() — fell through this
        // guard and wrote nothing. The remaining callers are a resize and a
        // focus change, and a gate run does neither: it never resizes, and an
        // app launched into the background never becomes key. So the file held
        // whatever the last resize left in /tmp. Found 2026-08-18 holding a line
        // 21 hours old, which is a stale CHROME HEIGHT (a mis-cropped shot) and,
        // now that the theme rides along, a stale THEME.
        let adopted = owner?.windows.contains(where: { $0 === self }) ?? false
        guard !adopted || owner?.front === self else { return }
        let wf = window.frame
        guard let cv = window.contentView else { return }
        let chrome = wf.height - cv.frame.height
        let line = "\(Int(wf.width)) \(Int(wf.height)) \(Int(cv.frame.width)) \(Int(cv.frame.height))"
                 + " \(Int(chrome)) \(Int(view.bounds.height)) \(Bridge.appearance())"
        try? line.write(toFile: "/tmp/declare-geom.txt", atomically: true, encoding: .utf8)
    }

    func syncSize() {
        publishGeometry()
        let s = view.bounds.size
        // ⚠ `commit ms` measures tree.apply() ONLY — the HOST half. Everything
        // above it here is the runtime re-laying out in JS, on this same
        // thread, and it was invisible in every resize number measured so far.
        let t0 = CFAbsoluteTimeGetCurrent()
        bridge.call("__declareResize", [Double(s.width), Double(s.height), Double(window.backingScaleFactor)])
        let t1 = CFAbsoluteTimeGetCurrent()
        bridge.call("__declareSettle", [])
        let t2 = CFAbsoluteTimeGetCurrent()
        bridge.pump()
        let t3 = CFAbsoluteTimeGetCurrent()
        if bridge.tree?.statsOn == true {
            bridge.resizeN += 1
            bridge.resizeMs += (t3 - t0) * 1000
            bridge.resizeJsMs += (t1 - t0) * 1000
            bridge.resizeSettleMs += (t2 - t1) * 1000
            bridge.resizePumpMs += (t3 - t2) * 1000
            bridge.resizeMaxMs = max(bridge.resizeMaxMs, (t3 - t0) * 1000)
        }
        // The root app is already resized and flushed by the two calls above;
        // the frame request is for the observers that follow one frame behind
        // (an island's tenant re-deriving from its box's new size).
        bridge.needsFrame()
    }

    // Republish: the theme is in the geometry line, and it just changed.
    func appearanceChanged() {
        publishGeometry()
        // ⚠ the name mac-env.js actually defines — this called "__declareEnvChanged"
        // for a while, which bridge.call nil-guards into silence: live dark-mode
        // flips never reached the app's media queries (found 2026-08-19).
        bridge.call("__declareAppearanceChanged", []); bridge.needsFrame()
    }

    /// A dead end is unhelpful: offer the location prompt, since the usual
    /// cause is simply that the dev server is not running on this port.
    ///
    /// ⚠ A MODAL IS RIGHT FOR A PERSON AND WRONG FOR A HARNESS. `runModal` takes
    /// over the run loop, so under automation the host stops answering mid-run
    /// and the rig hangs on a dialog nobody asked for and nobody can see — a bad
    /// program, a stopped dev server or a compile error turns into a mystery
    /// timeout. When we are being driven, record it, log it, and let the caller
    /// ask with `lasterror`.
    func showError(_ msg: String) {
        window.title = "Declare"
        NSLog("[error] %@", msg)
        if Launch.isAutomated { return }
        let a = NSAlert()
        a.messageText = "Could not load this program"
        a.informativeText = msg + "\n\nIs the Declare dev server running?\n  npm start  (or: PORT=8260 node server/index.mjs)"
        a.alertStyle = .warning
        a.addButton(withTitle: "Open Location…")
        a.addButton(withTitle: "Cancel")
        // Reuse THIS window: the person is retrying the thing that just failed,
        // not asking for a second one.
        if a.runModal() == .alertFirstButtonReturn { owner?.promptForLocation(into: self) }
    }

    // ── NSWindowDelegate ────────────────────────────────────────────────────

    func windowDidResize(_ n: Notification) { syncSize(); view.repositionOverlays() }

    /// The occlusion fact → the app's `pageVisible` slot (runtime schema.ts):
    /// fully covered by other windows, miniaturized, or on a sleeping display
    /// all read as hidden — strictly more honest than the browsers' signal
    /// (Safari cannot see covered-by-window). One boolean across the bridge;
    /// the runtime does the rest: a Time pauses itself on the fact
    /// (leaving the shared clock), and an occluded window's program goes truly
    /// idle instead of integrating motion nobody composites.
    func windowDidChangeOcclusionState(_ n: Notification) {
        let visible = window.occlusionState.contains(.visible)
        bridge.call("__declareVisibilityChanged", [visible])
        bridge.needsFrame()
    }
    func windowDidChangeBackingProperties(_ n: Notification) { syncSize() }
    func windowDidMove(_ n: Notification) { owner?.sessionChanged() }
    func windowDidBecomeKey(_ n: Notification) { publishGeometry() }
    func windowWillClose(_ n: Notification) {
        // Closed mid-load: the app's "still starting" count must come back down,
        // or the dock bounces forever and the deferred activation never lands.
        finishedStarting()
        owner?.windowClosed(self)
    }

    var sessionEntry: SessionStore.Entry? {
        guard loaded, !currentURL.isEmpty else { return nil }
        let f = window.frame
        return SessionStore.Entry(url: currentURL, x: f.origin.x, y: f.origin.y,
                                  w: f.width, h: f.height)
    }
}

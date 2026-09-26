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
        // A FLOOR, the browser's own: a window can be dragged no smaller than
        // this (Safari refuses below ~336 wide; Chrome about 400). Below an
        // APP's declared minimums the page pans, exactly as a browser page does
        // — the App's floors are the program's business (App.bindExtent), the
        // window's floor is the host's.
        window.contentMinSize = NSSize(width: 400, height: 300)
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
        // A RIG'S WINDOW OPENS AT THE BACK. Automation never takes the focus,
        // but a window ordered front still lands over whatever the person at the
        // machine is doing, run after run. A test that reads the model needs no
        // visible window, and one that shoots it captures by window id, which a
        // covered window answers. A rig that wants the foreground asks (`activate`).
        if Launch.isAutomated { window.orderBack(nil) } else { window.makeKeyAndOrderFront(nil) }
        publishGeometry()
    }

    /// Load a program here. `history` says what this navigation MEANS: an
    /// ordinary open is travel (`.push`), a reload or a mode change is not
    /// (`.stay`), and back/forward are already moving the cursor (`.replay`).
    func open(_ url: String, history: History = .push) {
        if history == .push { remember(url) }
        // A NEW ATTEMPT RETIRES THE OLD VERDICT — except an error page, which IS
        // the report of the failure and must not clear it. Cleared on the
        // attempt rather than on success because the only success signal a
        // caller could use is a commit, and the error page commits too.
        if !url.hasPrefix(Bridge.platformBase() + "library/platform-apps/error/") {
            ControlChannel.clearLoadFailure()
        }
        currentURL = url
        loaded = true
        // Same rule as the session file: a harness's throwaway program is not
        // where the person left off. It matters more here than it looks —
        // automation READS lastURL as its fallback, so a rig that writes it
        // poisons its own next launch with a URL whose server is gone (a test
        // server's port is dead the moment the suite exits). Observed exactly
        // that: a gate run booted an empty window off a stale test port.
        // ONLY A DESTINATION IS REMEMBERED. A `.stay` open is a MODE of this
        // window — Source mode's Viewer, the error page — not a place: remember
        // it and the next launch restores into a stale error page (or the Viewer)
        // instead of the program (observed 2026-09-10: the error page, query and
        // all, came back as "the last program"). `.replay` is a real destination.
        if history != .stay && !Launch.isAutomated { UserDefaults.standard.set(url, forKey: "lastURL") }
        // A real open resets the error page's retry budget (see showError).
        if !url.hasPrefix(Bridge.platformBase() + "library/platform-apps/error/") { errorPageRetried = false }
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
    /// The failure message the error page is currently showing — so a second
    /// report of the same failure is recognised as a repeat, not as the error
    /// page itself having failed (see showError).
    private var errorShown = ""
    /// The program the error page was opened FOR — what its Retry re-opens.
    /// Kept apart from currentURL, which is the error page itself while it shows.
    private var errorSubject = ""
    /// The error page's one-shot retry budget: a NEW failure while an error page
    /// is up re-opens the page once; a second such failure with no successful
    /// open between means the page itself cannot load. Reset by `open()`.
    private var errorPageRetried = false

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
            open(Bridge.platformBase() + "library/platform-apps/viewer/viewer.declare?program=" + (subjectURL.addingPercentEncoding(
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
        // The runtime re-lays out on ITS thread now (Bridge, THE RUNTIME
        // THREAD): these are posts, and the resize timings that used to be
        // taken here measured main-thread JS that no longer exists.
        bridge.cachedScale = window.backingScaleFactor
        bridge.call("__declareResize", [Double(s.width), Double(s.height), Double(window.backingScaleFactor)])
        bridge.call("__declareSettle", [])
        bridge.pump()
        if bridge.tree?.statsOn == true { bridge.resizeN += 1 }
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
        bridge.cachedAppearance = Bridge.appearance()
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
        // THE ERROR STATE, IN THE WINDOW. One window is one Declare app, and an
        // app is either running or in error — so the window shows the error, as
        // a baked chrome program (library/platform-apps/error), opened with `.stay` exactly as
        // Source mode opens the Viewer: a mode of this window, not a destination.
        // Non-modal: the titlebar stays live (‹›, View Source, Inspector),
        // other windows are untouched, and a harness can read the state instead
        // of hanging on runModal — so under automation this now shows too. The
        // page carries the diagnostics and the failed address through env; its
        // Retry re-opens the subject, and a fixed file simply loads.
        //
        // ⚠ RECURSION GUARD: if the error page ITSELF cannot come up (the
        // platform is broken, not the program), `bootFailed` fires again with the
        // error page as currentURL — that case falls through to the native alert
        // below, the last resort that needs no compiler.
        let errorPage = Bridge.platformBase() + "library/platform-apps/error/error.declare"
        let showErrorPage = { (subject: String) in
            self.errorShown = msg
            let hint = "Fix the file, then press Retry. File ▸ Open Location… (⌘L) opens a different program. If this program is served by the dev server, check that it is running: npm start"
            let q = "?errors=" + Self.queryEnc(msg) + "&subject=" + Self.queryEnc(subject) + "&hint=" + Self.queryEnc(hint)
            self.open(errorPage + q, history: .stay)
        }
        if !currentURL.hasPrefix(errorPage) { errorSubject = currentURL; showErrorPage(currentURL); return }
        // An error page is already up. Three cases, told apart without guessing:
        //  • the SAME message again — a failure can be reported twice for one
        //    boot; a repeat of what is on screen is not news. Ignore.
        //  • a DIFFERENT message, first time — a new failure arrived while an
        //    error page was showing (a boot driven from the control channel, or
        //    a launch that restored into one). Show it: re-open the page with
        //    the new message, and spend the one retry.
        //  • a DIFFERENT message, retry already spent — two different failures
        //    in a row with no successful open between: the error PAGE cannot
        //    load, the platform is broken. The native alert is the last resort.
        // `open()` of any real program resets the budget.
        if msg == errorShown { NSLog("[error] re-reported the error already shown — ignored"); return }
        if !errorPageRetried {
            errorPageRetried = true
            NSLog("[error] a new failure while an error page was up — showing it")
            showErrorPage(errorSubject)
            return
        }
        NSLog("[error] the error page itself failed to load — falling back to the native alert")
        if Launch.isAutomated { return }
        let a = NSAlert()
        a.messageText = "Could not load this program"
        // The hint is the actionable line and stays in the alert body; the error
        // text itself (a compile can report dozens of diagnostics) goes into a
        // FIXED-SIZE scrolling accessory, so a long list scrolls inside the dialog
        // instead of stretching it off the screen.
        a.informativeText = "Is the Declare dev server running?\n  npm start  (or: PORT=8260 node server/index.mjs)"
        a.alertStyle = .warning
        a.accessoryView = Self.errorScroller(msg)
        a.addButton(withTitle: "Open Location…")
        a.addButton(withTitle: "Cancel")
        // Reuse THIS window: the person is retrying the thing that just failed,
        // not asking for a second one.
        if a.runModal() == .alertFirstButtonReturn { owner?.promptForLocation(into: self) }
    }

    /// Percent-encode a value for a URL query. STRICT — `.urlQueryAllowed` leaves
    /// `&`, `=` and `+` alone, which would split a diagnostic containing them into
    /// bogus extra parameters; only unreserved characters pass through.
    private static func queryEnc(_ s: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
    }

    /// A fixed-size, scrolling text box for the error dialog's accessory — the
    /// full diagnostic text (however long) scrolls inside a stable box rather than
    /// growing the alert. Read-only but selectable, so the text can be copied.
    private static func errorScroller(_ text: String) -> NSScrollView {
        let scroll = NSScrollView(frame: NSRect(x: 0, y: 0, width: 460, height: 260))
        scroll.hasVerticalScroller = true
        scroll.borderType = .bezelBorder
        scroll.autohidesScrollers = true
        let content = scroll.contentSize
        let tv = NSTextView(frame: NSRect(origin: .zero, size: content))
        tv.isEditable = false
        tv.isSelectable = true
        tv.drawsBackground = false
        tv.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)
        tv.textContainerInset = NSSize(width: 6, height: 6)
        // The NSTextView-in-NSScrollView recipe, all of it: the text view must be
        // ALLOWED TO GROW past the clip (maxSize) while tracking the clip's width
        // (autoresizingMask + widthTracksTextView). Without minSize/maxSize the
        // document never exceeds the visible 260px, so there is nothing to scroll
        // and the wheel does nothing — the first version of this box.
        tv.minSize = NSSize(width: 0, height: content.height)
        tv.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        tv.isVerticallyResizable = true
        tv.isHorizontallyResizable = false
        tv.autoresizingMask = [.width]
        tv.textContainer?.containerSize = NSSize(width: content.width, height: CGFloat.greatestFiniteMagnitude)
        tv.textContainer?.widthTracksTextView = true
        tv.string = text          // set LAST, so layout sizes the grown document
        scroll.documentView = tv
        return scroll
    }

    // ── NSWindowDelegate ────────────────────────────────────────────────────

    func windowDidResize(_ n: Notification) {
        // The runtime re-lays out on its own thread; without a wait the window
        // shows its new size one frame before the app fills it, and everything
        // anchored to the right or bottom edge stutters against the frame
        // during a drag (measured 2026-09-10: 29 of 29 steps one step behind).
        // So: post the resize, then hold the frame for the commit — bounded.
        let before = bridge.commitCount
        syncSize()
        bridge.waitForCommit(after: before, timeout: 0.05)
        view.repositionOverlays()
        // DECLARE_DEBUG_RESIZE: the RACE a drag exposes — the view already has
        // its new height here, the runtime's re-layout is a frame away, and
        // any root placement that depends on the view height shows up as a
        // non-zero offset for exactly that frame (the bob during a drag).
        if ProgramWindow.resizeDebug, let r = bridge.tree?.root {
            NSLog("[resize] view=%.0fx%.0f root=%.0fx%.0f rootPos=(%.0f,%.0f) live=%d", view.bounds.width, view.bounds.height,
                  r.box.width, r.box.height, r.layer.position.x, r.layer.position.y, window.inLiveResize ? 1 : 0)
        }
    }
    static let resizeDebug = ProcessInfo.processInfo.environment["DECLARE_DEBUG_RESIZE"] != nil

    /// The occlusion fact → the app's `pageVisible` slot (runtime schema.ts):
    /// fully covered by other windows, miniaturized, or on a sleeping display
    /// all read as hidden — strictly more honest than the browsers' signal
    /// (Safari cannot see covered-by-window). One boolean across the bridge;
    /// the runtime does the rest: a Time pauses itself on the fact
    /// (leaving the shared clock), and an occluded window's program goes truly
    /// idle instead of integrating motion nobody composites.
    func windowDidChangeOcclusionState(_ n: Notification) { pushVisibility() }

    /// Push the window's visibility fact to the runtime. `Launch.ignoreOcclusion`
    /// forces it true so a covered window keeps painting (the capture-rig
    /// facility); the `ctl occlusion` command calls this after flipping the flag,
    /// to un-idle a window that is already covered.
    func pushVisibility() {
        let visible = Launch.ignoreOcclusion || window.occlusionState.contains(.visible)
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

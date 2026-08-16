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
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(view)
        syncSize()
    }

    func open(_ url: String) {
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
        bridge.mark("open()", url)
        bridge.boot(url: url)
        owner?.sessionChanged()
    }

    @objc func reload() { if !currentURL.isEmpty { open(currentURL) } }

    /// The fidelity harness needs the exact content rect inside the window
    /// image; publishing it removes the guesswork (and a 32pt error).
    ///
    /// One file for a host that can now have several windows: it describes the
    /// FRONT one, which is the one a harness is shooting.
    func publishGeometry() {
        guard owner?.front === self else { return }
        let wf = window.frame
        guard let cv = window.contentView else { return }
        let chrome = wf.height - cv.frame.height
        let line = "\(Int(wf.width)) \(Int(wf.height)) \(Int(cv.frame.width)) \(Int(cv.frame.height))"
                 + " \(Int(chrome)) \(Int(view.bounds.height))"
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

    func appearanceChanged() { bridge.call("__declareEnvChanged", []); bridge.needsFrame() }

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
    func windowDidChangeBackingProperties(_ n: Notification) { syncSize() }
    func windowDidMove(_ n: Notification) { owner?.sessionChanged() }
    func windowDidBecomeKey(_ n: Notification) { publishGeometry() }
    func windowWillClose(_ n: Notification) { owner?.windowClosed(self) }

    var sessionEntry: SessionStore.Entry? {
        guard loaded, !currentURL.isEmpty else { return nil }
        let f = window.frame
        return SessionStore.Entry(url: currentURL, x: f.origin.x, y: f.origin.y,
                                  w: f.width, h: f.height)
    }
}

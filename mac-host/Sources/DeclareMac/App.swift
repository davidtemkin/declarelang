// App — the Mac shell: a real NSWindow, a real menu bar, and the view that
// hosts the layer tree and turns NSEvents into the runtime's input.
//
// The window is ordinary and resizable; `app.hostWidth/hostHeight` follow it
// through the same reactive path the web client uses, so responsiveness is the
// program's own business. Events are forwarded as the pointer/key shapes
// mac-env.js dispatches into the unchanged input router.

import AppKit

final class DeclareView: NSView {
    var bridge: Bridge!
    private var tracking: NSTrackingArea?
    private var rootLayer: CALayer?
    private var cursorName = ""
    private var buttons = 0

    override var isFlipped: Bool { false }             // AppKit's own flip fights the layer flags
    override var acceptsFirstResponder: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer = CALayer()
        // AFTER the layer is installed — this flag configures the backing
        // layer, so setting it first and then replacing the layer loses it.
        // Core Image filters on layers — specifically `backgroundFilters`, the
        // frost (LayerTree, case 36) — do nothing at all without it. Silently:
        // no warning, no effect, just an unblurred wash.
        layerUsesCoreImageFilters = true
        layer?.isGeometryFlipped = true                 // manual sublayers: top-left
        layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
    }
    required init?(coder: NSCoder) { fatalError() }

    func setRoot(_ l: CALayer) {
        rootLayer?.removeFromSuperlayer()
        rootLayer = l
        layer?.addSublayer(l)
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let t = tracking { removeTrackingArea(t) }
        let t = NSTrackingArea(rect: bounds,
                               options: [.activeInKeyWindow, .mouseMoved, .mouseEnteredAndExited, .inVisibleRect, .cursorUpdate],
                               owner: self, userInfo: nil)
        addTrackingArea(t)
        tracking = t
    }

    // ── pointer ─────────────────────────────────────────────────────────────

    private func mods(_ e: NSEvent) -> Int {
        var m = 0
        if e.modifierFlags.contains(.shift) { m |= 1 }
        if e.modifierFlags.contains(.command) { m |= 2 }
        if e.modifierFlags.contains(.control) { m |= 4 }
        if e.modifierFlags.contains(.option) { m |= 8 }
        return m
    }
    /// Model coordinates: top-left origin, which is what the runtime's hit
    /// walk expects (the view itself is unflipped).
    private func pt(_ e: NSEvent) -> NSPoint {
        let v = convert(e.locationInWindow, from: nil)
        return NSPoint(x: v.x, y: bounds.height - v.y)
    }

    /// An overlay (a selectable flow, a text field) owns its own interior —
    /// exactly the island rule. Those events must not become app input too.
    private func overlayOwns(_ pModel: NSPoint) -> Bool {
        let p = NSPoint(x: pModel.x, y: bounds.height - pModel.y)   // model → view space
        for sub in subviews where !sub.isHidden {
            guard sub.frame.contains(p) else { continue }
            if let sc = sub as? NSScrollView, let tv = sc.documentView as? NSTextView {
                if tv.isSelectable || tv.isEditable { return true }
                continue
            }
            return true
        }
        return false
    }

    /// The same walk `overlayOwns` does, narrated — the control channel's `owns`
    /// verb. Injected pointer input enters at `__declarePointer` and so never
    /// touches this gate; when a press misbehaves only under a real mouse, this
    /// is the thing to ask.
    func describeOverlayOwnership(atModel pModel: NSPoint) -> String {
        let p = NSPoint(x: pModel.x, y: bounds.height - pModel.y)
        var lines = ["point model=(\(Int(pModel.x)),\(Int(pModel.y))) view=(\(Int(p.x)),\(Int(p.y)))"]
        var owner = "NOBODY — the press reaches the app"
        for sub in subviews {
            let has = sub.frame.contains(p)
            var verdict = "no"
            if has && sub.isHidden { verdict = "CONTAINS but hidden — skipped" }
            else if has {
                if let sc = sub as? NSScrollView, let tv = sc.documentView as? NSTextView,
                   !(tv.isSelectable || tv.isEditable) {
                    verdict = "CONTAINS but inert text view — skipped"
                } else {
                    verdict = "OWNS — the press is swallowed here"
                    if owner.hasPrefix("NOBODY") { owner = "\(type(of: sub)) \(NSStringFromRect(sub.frame))" }
                }
            }
            lines.append("  \(type(of: sub)) hidden=\(sub.isHidden) frame=\(NSStringFromRect(sub.frame)) -> \(verdict)")
        }
        lines.append("verdict: \(owner)")
        return lines.joined(separator: "\n")
    }

    private func send(_ type: String, _ e: NSEvent) {
        let p = pt(e)
        if ProcessInfo.processInfo.environment["DECLARE_DEBUG_INPUT"] != nil, type != "pointermove" {
            NSLog("[input] %@ model=(%.0f,%.0f) viewH=%.0f", type, p.x, p.y, bounds.height)
        }
        // NB: no pump() here. Input updates the model; the DISPLAY LINK decides
        // when a frame is committed. Pumping per event committed at whatever
        // rate the mouse reported (measured p50 5.7ms against a 8.3ms display),
        // so frames landed at arbitrary phases of the refresh — which reads as
        // hesitancy during a slow drag even though every frame was cheap.
        bridge.call("__declarePointer", [type, Double(p.x), Double(p.y), buttons, mods(e)])
        bridge.needsFrame()
    }

    /// The flow a drag is currently painting a selection in.
    private var selecting: RichOverlay?

    /// The scrollbar being dragged: its node, axis, and where within the thumb it
    /// was grabbed (so the thumb does not jump under the pointer).
    private var barDrag: (node: Node, vertical: Bool, grab: CGFloat)?

    /// Grab whatever scrollbar is at a model point. The three bar* methods are
    /// the whole gesture, so the control channel can drive it exactly as the
    /// mouse does — no synthetic events anywhere.
    @discardableResult
    func barGrab(atModel p: NSPoint) -> Bool {
        guard let hit = bridge?.tree?.scrollbarHit(atModel: p) else { return false }
        barDrag = hit
        bridge?.tree?.setHotBar(hit)
        return true
    }

    func barMove(toModel p: NSPoint) {
        guard let d = barDrag, let tree = bridge?.tree, let host = layer else { return }
        // Where the THUMB's leading edge should now sit, in the surface's own
        // space — the pointer minus wherever inside the thumb it was grabbed.
        let py = bounds.height - p.y
        let inNode = d.node.layer.convert(CGPoint(x: p.x, y: py), from: host)
        let local = CGPoint(x: inNode.x, y: d.node.box.height - inNode.y)
        tree.dragScrollbar(d.node, vertical: d.vertical,
                           to: (d.vertical ? local.y : local.x) - d.grab)
    }

    func barRelease(atModel p: NSPoint) {
        guard barDrag != nil else { return }
        barDrag = nil
        // hand the bar back to hover state (it may still be under the pointer)
        bridge?.tree?.setHotBar(bridge?.tree?.scrollbarHit(atModel: p))
    }

    var barDragging: Bool { barDrag != nil }

    override func mouseDown(with e: NSEvent) {
        window?.makeFirstResponder(self)
        // A scrollbar is drawn ABOVE the content it scrolls, so it gets the press
        // first — and it is not in the model tree, so nothing else would claim it.
        if barGrab(atModel: pt(e)) { return }       // swallowed: not app input
        if overlayOwns(pt(e)) {
            if ProcessInfo.processInfo.environment["DECLARE_DEBUG_SEL"] != nil {
                NSLog("[sel] down SWALLOWED by an overlay at (%.0f,%.0f)", pt(e).x, pt(e).y)
            }
            super.mouseDown(with: e); return
        }
        // Selection rides ALONGSIDE app input, as on the web: pressing inside a
        // Markdown body both raises its window and starts a selection.
        let m = pt(e)
        let tree = bridge?.tree
        tree?.allFlows().forEach { $0.selectionClear() }
        selecting = nil
        if ProcessInfo.processInfo.environment["DECLARE_DEBUG_SEL"] != nil {
            let all = tree?.allFlows() ?? []
            NSLog("[sel] down model=(%.0f,%.0f) flows=%d selectable=%d hit=%@", m.x, m.y,
                  all.count, all.filter { $0.acceptsHits }.count,
                  tree?.richFlow(atModel: m) == nil ? "none" : "yes")
        }
        if let (flow, local) = tree?.richFlow(atModel: m) {
            if e.clickCount == 1, let href = flow.link(at: local) {
                bridge.call("__declareRichLinkAt", [href])
            }
            flow.selectionBegin(at: local)
            selecting = flow
        }
        buttons = 1; send("pointerdown", e)
    }
    override func mouseUp(with e: NSEvent) {
        if barDrag != nil { barRelease(atModel: pt(e)); return }
        selecting = nil; buttons = 0; send("pointerup", e)
    }
    override func mouseDragged(with e: NSEvent) {
        if barDrag != nil { barMove(toModel: pt(e)); return }
        extendSelection(e)
        send("pointermove", e)
    }
    override func mouseMoved(with e: NSEvent) {
        // A press is live, so this is a drag however the event was labelled —
        // extend the selection here too rather than trusting the event kind.
        if selecting != nil { extendSelection(e) }
        if barDrag == nil { bridge?.tree?.setHotBar(bridge?.tree?.scrollbarHit(atModel: pt(e))) }
        send("pointermove", e)
    }

    private func extendSelection(_ e: NSEvent) {
        guard let f = selecting else { return }
        if let (hit, local) = bridge?.tree?.richFlow(atModel: pt(e)), hit === f {
            f.selectionExtend(to: local)
        }
    }
    override func mouseExited(with e: NSEvent) { send("pointerout", e) }
    override func rightMouseDown(with e: NSEvent) { send("pointerdown", e) }

    override func scrollWheel(with e: NSEvent) {
        let p = pt(e)
        // AppKit's deltaY is inverted relative to the web's wheel convention.
        let k: CGFloat = e.hasPreciseScrollingDeltas ? 1 : 10
        let dy = -e.scrollingDeltaY * k
        // A trackpad reports BOTH axes; sending only dy meant the Files column
        // strip could never be dragged sideways even while its scroller showed.
        let dx = -e.scrollingDeltaX * k
        // Through the CLAIM walk (`__declareWheel`), not straight to the
        // scrollers: a declared `onWheel` view hears its stream first — the
        // web's delegation, at last native. A ctrl+wheel is a PINCH, exactly
        // as Chrome spells trackpad pinch, so `e.pinch` zoom math ports.
        let pinch = e.modifierFlags.contains(.control)
        bridge.call("__declareWheel", [Double(p.x), Double(p.y), Double(dx), Double(dy), pinch ? 1 : 0])
        bridge.needsFrame()
    }

    /// The trackpad PINCH, as the web presents it (gestures.md): a wheel with
    /// `pinch` true and the magnification mapped onto deltaY — Chrome's own
    /// ctrl+wheel spelling, zoom-in = negative delta, ×100 so per-event
    /// deltas land in the same few-unit range Chrome reports. An app's
    /// `onWheel(e) { if (e.pinch) … }` now behaves identically on the
    /// native host and in a browser with a trackpad.
    override func magnify(with e: NSEvent) {
        let p = pt(e)
        bridge.call("__declareWheel", [Double(p.x), Double(p.y), 0, Double(-e.magnification * 100), 1])
        bridge.needsFrame()
    }

    // ── keyboard ────────────────────────────────────────────────────────────

    override func keyDown(with e: NSEvent) {
        if e.modifierFlags.contains(.control), Self.keyName(e).lowercased() == "t" {
            // A key event carries no mouse location — ask the window where the
            // pointer actually is.
            let win = window?.mouseLocationOutsideOfEventStream ?? .zero
            let v = convert(win, from: nil)
            let p = NSPoint(x: v.x, y: bounds.height - v.y)
            bridge?.call("__declareTraceHit", [Double(p.x), Double(p.y)])
            return
        }
        if e.modifierFlags.contains(.control), Self.keyName(e).lowercased() == "d" {
            bridge?.tree?.dumpFlows()
            bridge?.tree?.dumpText(ProcessInfo.processInfo.environment["DECLARE_DUMP_TEXT"] ?? "Desktop")
            return
        }
        // ⌘C over a live selection copies it. The flow is drawn rather than
        // hosted in an NSTextView, so this is the responder that has to do it.
        if e.modifierFlags.contains(.command), Self.keyName(e).lowercased() == "c",
           let flow = bridge?.tree?.allFlows().first(where: { $0.selectedText != nil }),
           let text = flow.selectedText {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(text, forType: .string)
            return
        }
        let key = Self.keyName(e)
        bridge.call("__declareKey", ["keydown", key, mods(e), e.isARepeat ? 1 : 0])
        bridge.needsFrame()
        // Let ⌘-shortcuts reach the menu bar as well.
        if e.modifierFlags.contains(.command) { super.keyDown(with: e) }
    }
    override func keyUp(with e: NSEvent) {
        bridge.call("__declareKey", ["keyup", Self.keyName(e), mods(e), 0])
        bridge.needsFrame()
    }

    /// NSEvent → the DOM `KeyboardEvent.key` names the runtime expects.
    static func keyName(_ e: NSEvent) -> String {
        switch e.keyCode {
        case 36: return "Enter"
        case 48: return "Tab"
        case 49: return " "
        case 51: return "Backspace"
        case 53: return "Escape"
        case 117: return "Delete"
        case 123: return "ArrowLeft"
        case 124: return "ArrowRight"
        case 125: return "ArrowDown"
        case 126: return "ArrowUp"
        case 115: return "Home"
        case 119: return "End"
        case 116: return "PageUp"
        case 121: return "PageDown"
        default:
            if let c = e.charactersIgnoringModifiers, !c.isEmpty { return c }
            return ""
        }
    }

    // ── cursor + overlays ───────────────────────────────────────────────────

    func setCursor(_ name: String) {
        guard name != cursorName else { return }
        cursorName = name
        // Only the KEY window owns the pointer. Setting NSCursor from a
        // background window would reach across the whole machine — which is
        // also what let injected test input disturb the real cursor.
        guard window?.isKeyWindow == true else { return }
        window?.invalidateCursorRects(for: self)
        cursorFor(name).set()
    }

    override func cursorUpdate(with event: NSEvent) { cursorFor(cursorName).set() }

    private func cursorFor(_ n: String) -> NSCursor {
        switch n {
        case "pointer": return .pointingHand
        case "text": return .iBeam
        case "ew-resize", "col-resize", "e-resize", "w-resize": return .resizeLeftRight
        case "ns-resize", "row-resize", "n-resize", "s-resize": return .resizeUpDown
        // The DIAGONAL pair. AppKit had no public cursor for these, and the
        // stand-in was a CROSSHAIR — which is what every window corner showed:
        // a crosshair reads as "draw a selection", the opposite of "drag this
        // corner". macOS 15 added the real ones (frameResize), so use them; the
        // pair is bidirectional, so the corner named here only picks the
        // diagonal, not a direction.
        case "nwse-resize":
            if #available(macOS 15.0, *) { return .frameResize(position: .topLeft, directions: .all) }
            return .crosshair
        case "nesw-resize":
            if #available(macOS 15.0, *) { return .frameResize(position: .topRight, directions: .all) }
            return .crosshair
        case "grab": return .openHand
        case "grabbing": return .closedHand
        case "move", "all-scroll": return .openHand
        case "not-allowed": return .operationNotAllowed
        case "crosshair": return .crosshair
        default: return .arrow
        }
    }

    /// Glue every native overlay to its surface's box (after each commit).
    /// The model's rects are top-left; this view is unflipped (the layer tree
    /// owns its own flip), so overlay frames convert here — the one place the
    /// two coordinate conventions meet.
    func repositionOverlays() {
        guard let tree = bridge?.tree else { return }
        // windowRect answers in the hosting LAYER's space, which is bottom-left
        // — the same convention this (unflipped) view uses for subviews, so the
        // rect transfers directly. No second flip: that was the bug.
        for (node, rect) in tree.overlays() {
            if ProcessInfo.processInfo.environment["DECLARE_DEBUG_RICH"] != nil, node.rich != nil {
                NSLog("[rich-place] id=%d rect=%@ inView=%@", node.id, NSStringFromRect(rect),
                      node.rich!.isMounted ? "y" : "n")
            }
            let vis = tree.visibleRect(node)
            node.editable?.place(rect, clippedTo: vis)
            // A tall flow rasters only the slice that is on screen, so it needs
            // telling where that is — on every settle and every scroll, which is
            // exactly when this runs.
            if node.rich != nil { tree.refreshBand(node) }
        }
        // A scroll or a window resize reaches here without going through an op
        // apply, so this is the flush that covers those.
        tree.flushBands()
    }
}

// ── the shell ───────────────────────────────────────────────────────────────

final class AppDelegate: NSObject, NSApplicationDelegate {
    /// The one delegate, reachable from the Bridge's compile callbacks (which
    /// have no window in hand and are asking an APP-level question: is anything
    /// still starting up?).
    static var current: AppDelegate? { NSApp.delegate as? AppDelegate }
    /// The document the Finder handed us, held until there is something to open it
    /// WITH. AppKit delivers `application(_:open:)` BEFORE
    /// applicationDidFinishLaunching on a double-click launch, so there is no
    /// window yet — opening immediately crashed on the implicit unwrap
    /// (EXC_BREAKPOINT inside AppDelegate.open). Held here, the launch handler
    /// uses it as the start URL; once running, a second document opens straight
    /// away, in its own window.
    private var pendingOpen: String?
    private(set) var windows: [ProgramWindow] = []
    var control: ControlChannel?
    /// Has `applicationDidFinishLaunching` run? A Finder document that arrives
    /// before it has nowhere to go yet.
    private var launched = false

    /// The window everything global addresses: the control channel, the menu
    /// actions, the published geometry. Key first, then the most recent — a
    /// harness that just opened a window has not necessarily focused it.
    var front: ProgramWindow? {
        windows.first { $0.window.isKeyWindow } ?? windows.last
    }

    func applicationDidFinishLaunching(_ n: Notification) {
        // Pin the theme when asked, so a parity run measures the program rather
        // than the machine it happens to be on (see the `appearance` bridge fn).
        if let forced = ProcessInfo.processInfo.environment["DECLARE_APPEARANCE"] {
            NSApp.appearance = NSAppearance(named: forced == "dark" ? .darkAqua : .aqua)
        }
        // The brand icon (generated from the desktop's own Declare Viewer glyph
        // — mac-host/make-icon.mjs). A BUNDLED app gets it from Info.plist, but
        // the dev loop runs the bare .build/release binary, which macOS gives
        // the generic executable icon — so set it at runtime from wherever the
        // icns is findable: the bundle's Resources first, then the checkout.
        for dir in [Bundle.main.resourceURL,
                    ProcessInfo.processInfo.environment["DECLARE_ROOT"].map { URL(fileURLWithPath: $0).appendingPathComponent("mac-host") }].compactMap({ $0 }) {
            let icns = dir.appendingPathComponent("Declare.icns")
            if let img = NSImage(contentsOf: icns) { NSApp.applicationIconImage = img; break }
        }
        launched = true
        buildMenu()
        Bridge.checkToolchain()
        // Before anything is compiled or laid out: is this engine actually
        // compiling? A signing slip costs 40x and presents as "the app is slow",
        // which is the least diagnosable thing a host can be.
        Bridge.assertJIT()

        // DECLARE_CONTROL opens the injection channel (Control.swift), so tests
        // drive the app without posting system events — the machine stays usable
        // while they run, and the events cannot land in someone else's window.
        // It addresses whichever window is front, so it outlives any one of them.
        if ProcessInfo.processInfo.environment["DECLARE_CONTROL"] != nil {
            control = ControlChannel(target: { [weak self] in self?.front })
            control?.start()
        }
        // A document the Finder handed us wins over every default: it is what the
        // user actually asked for.
        let explicit = pendingOpen
            ?? ProcessInfo.processInfo.environment["DECLARE_URL"]
            ?? CommandLine.arguments.dropFirst().first(where: { !$0.hasPrefix("-") })
        // ACTIVATE WHEN THERE IS SOMETHING TO SHOW. Taking the foreground first
        // and then compiling for a second puts an empty window in front of
        // whatever the person was doing — and, because an active app's dock icon
        // does not bounce, it also throws away the one indicator the platform
        // has for "still starting". Deferred when a program is on its way; the
        // chooser is itself something to show, so that path activates now.
        if !Launch.isAutomated {
            if explicit != nil { activateWhenReady = true } else { NSApp.activate(ignoringOtherApps: true) }
        }
        if let start = explicit {
            newWindow().open(start)
        } else if Launch.isAutomated {
            // A rig that named no program still expects a window to talk to.
            newWindow().open(UserDefaults.standard.string(forKey: "lastURL")
                             ?? "http://127.0.0.1:8260/apps/desktop/desktop.declare")
        } else {
            // Launched by hand with nothing to show — ask, rather than guessing
            // at a program the person may not want.
            showLaunchChooser()
        }

        if let benchOut = ProcessInfo.processInfo.environment["DECLARE_BENCH"] {
            // after the app has settled, measure and quit
            let delay = Double(ProcessInfo.processInfo.environment["DECLARE_BENCH_DELAY"] ?? "6") ?? 6
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                self?.front?.bridge.runBenchmarks(to: benchOut)
                NSApp.terminate(nil)
            }
        }

        DistributedNotificationCenter.default.addObserver(
            self, selector: #selector(appearanceChanged),
            name: NSNotification.Name("AppleInterfaceThemeChangedNotification"), object: nil)
    }

    // needsFrame, not a direct pump: the frame observers (island dark-mode
    // follow, title mirror) ride on real frames, and pump() without a pending
    // request is a no-op — this is one of the host events whose frame they
    // are promised.
    @objc func appearanceChanged() { windows.forEach { $0.appearanceChanged() } }

    // ── still starting: the dock bounce ─────────────────────────────────────
    //
    // A Mac app's launch bounce ends when the app looks launched, and this host
    // used to look launched a whole compile before it was: the icon went quiet
    // and an empty "Loading…" rectangle sat there instead.
    //
    // WHAT ACTUALLY CONTROLS THE BOUNCE is ProgramWindow.present() — ordering a
    // window front is the signal — so the fix lives there, and this counts how
    // many windows are still starting so it knows when to stop.
    //
    // ⚠ `requestUserAttention(.criticalRequest)` is NOT that mechanism, though
    // it reads like it. Called during launch it returns 0 and does nothing at
    // all (measured: token=0 with the app inactive). It is kept below because it
    // IS right for the other case — a second document opened while the app sits
    // in the background — where it bounces until cancelled.
    //
    // The activation is deferred alongside: an app that has drawn nothing has no
    // business taking the foreground, and would pull the person out of what they
    // were doing to look at an empty window.
    //
    // Never under automation: a rig deliberately stays in the background, and a
    // bouncing icon in a test run is noise on someone's actual screen.

    /// Windows that have asked for a program and not yet got one on screen.
    private var starting = 0
    private var attention: Int?
    /// Interactive launch defers its activation until there is a program to
    /// show; this remembers that one is owed.
    private var activateWhenReady = false

    /// A window began loading a program.
    ///
    /// Scoped to a WINDOW's load, not to a compile: the compile service also
    /// runs for islands (opening the desktop's Calendar mounts a child app), and
    /// bouncing the dock because a window that is already on screen is filling
    /// in a pane would be nonsense. A window's load spans its compile anyway.
    func beginStarting() {
        starting += 1
        guard !Launch.isAutomated, attention == nil else { return }
        attention = NSApp.requestUserAttention(.criticalRequest)
    }

    /// A window finished — painted, or failed. Either way it is no longer
    /// "starting", and a failure especially must not leave the icon bouncing
    /// forever.
    func endStarting() {
        starting = max(0, starting - 1)
        guard starting == 0 else { return }
        if let a = attention { NSApp.cancelUserAttentionRequest(a); attention = nil }
        if activateWhenReady {
            activateWhenReady = false
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    // ── windows ─────────────────────────────────────────────────────────────

    /// A new window, cascaded off the front one so a second program does not
    /// land exactly on top of the first.
    private var cascade = NSPoint.zero

    @discardableResult
    func newWindow(frame: NSRect? = nil) -> ProgramWindow {
        let w = ProgramWindow(frame: frame ?? NSRect(x: 0, y: 0, width: 1280, height: 800), owner: self)
        if frame == nil {
            if windows.isEmpty { w.window.center() }
            cascade = w.window.cascadeTopLeft(from: cascade)
        }
        windows.append(w)
        sessionChanged()
        return w
    }

    /// Where a program should open: a window that has never loaded anything is
    /// an empty slot, not a document, so reuse it rather than stranding it.
    func windowForOpening() -> ProgramWindow {
        if let empty = windows.first(where: { !$0.loaded }) { return empty }
        return newWindow()
    }

    func windowClosed(_ w: ProgramWindow) {
        windows.removeAll { $0 === w }
        sessionChanged()
    }

    /// Persist what is open. Cheap enough to call on every change, which is why
    /// it is called on every change — the alternative is a session that is only
    /// correct after a clean quit.
    func sessionChanged() { SessionStore.save(windows.compactMap { $0.sessionEntry }) }

    func applicationWillTerminate(_ n: Notification) { sessionChanged() }

    /// Closing the last window does NOT quit: this host can sit with no windows
    /// while the chooser or the File menu decides what comes next.
    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { false }

    // ── the launch chooser ──────────────────────────────────────────────────

    /// Double-clicked with no document. Three ways forward, and the third is
    /// offered only when there is in fact something to restore.
    func showLaunchChooser() {
        let saved = SessionStore.load()
        switch LaunchChooser.run(canRestore: !saved.isEmpty) {
        case .openFile: openFile()
        case .openURL: promptForLocation(into: nil)
        case .restore: restore(saved)
        case .cancel: break
        }
    }

    private func restore(_ saved: [SessionStore.Entry]) {
        for e in saved {
            // A window saved on a display that is now gone would open offscreen.
            let onscreen = NSScreen.screens.contains { $0.visibleFrame.intersects(e.frame) }
            newWindow(frame: onscreen ? e.frame : nil).open(e.url)
        }
    }

    // ── the Finder path ─────────────────────────────────────────────────────

    /// Double-clicking a .declare, or dropping one on the app. Each document
    /// gets its own window, which is what a person means by opening a second.
    func application(_ app: NSApplication, open urls: [URL]) {
        guard let u = urls.first else { return }
        guard launched else { pendingOpen = u.absoluteString; return }   // pre-launch: hold it
        windowForOpening().open(u.absoluteString)
    }

    // ── menus ───────────────────────────────────────────────────────────────

    func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Declare", action: #selector(about), keyEquivalent: "").target = self
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide Declare", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Quit Declare", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        let fileItem = NSMenuItem()
        let fileMenu = NSMenu(title: "File")
        fileMenu.addItem(withTitle: "Open Location…", action: #selector(openLocationInNewWindow), keyEquivalent: "l").target = self
        fileMenu.addItem(withTitle: "Open File…", action: #selector(openFile), keyEquivalent: "o").target = self
        fileMenu.addItem(.separator())
        fileMenu.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        fileMenu.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "r").target = self
        fileItem.submenu = fileMenu
        main.addItem(fileItem)

        // A real Edit menu: ⌘C on a native selection is the platform's own.
        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        main.addItem(editItem)

        let viewItem = NSMenuItem()
        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(withTitle: "Actual Size", action: nil, keyEquivalent: "0")
        viewMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        viewItem.submenu = viewMenu
        main.addItem(viewItem)

        let winItem = NSMenuItem()
        let winMenu = NSMenu(title: "Window")
        winMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        winMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        winItem.submenu = winMenu
        main.addItem(winItem)
        NSApp.windowsMenu = winMenu

        NSApp.mainMenu = main
    }

    @objc func about() {
        let a = NSAlert()
        a.messageText = "Declare — native host"
        a.informativeText = "A Declare program rendered by Core Animation.\n\n\(front?.currentURL ?? "")"
        a.runModal()
    }

    /// Ask for a URL. `into` names the window to load it in — the one that just
    /// failed, when this is an error retry; otherwise a fresh one.
    func promptForLocation(into target: ProgramWindow?) {
        let a = NSAlert()
        a.messageText = "Open Location"
        a.informativeText = "URL of a .declare program (or a built app directory)."
        let f = NSTextField(frame: NSRect(x: 0, y: 0, width: 420, height: 24))
        f.stringValue = target?.currentURL ?? front?.currentURL ?? ""
        a.accessoryView = f
        a.addButton(withTitle: "Open")
        a.addButton(withTitle: "Cancel")
        a.window.initialFirstResponder = f
        guard a.runModal() == .alertFirstButtonReturn, !f.stringValue.isEmpty else { return }
        (target ?? windowForOpening()).open(f.stringValue)
    }

    @objc func openLocationInNewWindow() { promptForLocation(into: nil) }

    @objc func openFile() {
        let p = NSOpenPanel()
        p.allowedContentTypes = []
        p.allowsOtherFileTypes = true
        p.canChooseDirectories = true
        if p.runModal() == .OK, let u = p.url { windowForOpening().open(u.absoluteString) }
    }

    @objc func reload() { front?.reload() }
}

@main
struct Main {
    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
        let delegate = AppDelegate()
        app.delegate = delegate
        app.run()
    }
}

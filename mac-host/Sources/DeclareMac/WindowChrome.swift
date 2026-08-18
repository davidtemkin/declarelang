// WindowChrome — the title bar: where you have been, what you are looking at,
// and the two other ways of looking at it.
//
// Titlebar accessories (`NSTitlebarAccessoryViewController`) rather than a
// toolbar: a toolbar is a band of its own and would change what every window
// looks like for the sake of four controls. Accessories sit in the title bar
// that is already there and stay out of the way.
//
// THE THREE ZONES, and they are three because each answers a different question:
//
//   LEADING   ‹ ›            where you have been          (navigation)
//   CENTRE    the title      what this window is showing  (identity — AppKit's
//                            own, centred: the program's `appName`, or its file
//                            name when it declares none. See mac-boot's
//                            H.setTitle.)
//   TRAILING  View Source ·  how you are looking at it    (mode)
//             Inspector
//
// WHY THE TITLE BAR AT ALL, when the toggles also live in the View menu. These
// are per-window states, and the title bar is the one piece of chrome that is
// unambiguously about THIS window — a menu item has to resolve "which window did
// you mean", while a button already knows. It also makes them discoverable: a
// developer tool nobody can find is a developer tool nobody uses.

import AppKit

/// The ink of a titlebar control, by state. One table so the two kinds of
/// control cannot drift into two different greys.
private enum Ink {
    static func text(on: Bool, hot: Bool, enabled: Bool) -> NSColor {
        if !enabled { return .tertiaryLabelColor }
        return (on || hot) ? .labelColor : .secondaryLabelColor
    }
    /// The ON chip. Quaternary label rather than a fixed grey so it inverts with
    /// the system appearance for free — a hard-coded chip is a light-mode chip.
    static var chip: NSColor { .quaternaryLabelColor }
    static let chipRadius: CGFloat = 5
}

/// One titlebar toggle: a WORD, and a chip when it is live.
///
/// No glyph. These are not conventions anyone arrives knowing, and an icon in
/// this position is a guess a tooltip only resolves for someone who already
/// suspected the control was there. The word IS the control.
///
/// THREE STATES, TWO SIGNALS. Grey word at rest; black word under the pointer or
/// while held; black word ON A GREY CHIP while the mode is live. Hover and
/// pressed deliberately share one appearance — "you are about to press this" is
/// one message — but ON is now its own, because it is the only one of the three
/// that is still true after you look away. That is the whole reason it earns a
/// second signal: the other two describe the pointer, this one describes the
/// window.
final class ChromeButton: NSButton {
    /// Toggled state — a switch, not a command.
    var on = false { didSet { needsDisplay = true } }
    private var hovering = false
    private var held = false

    init(label: String, tip: String, target: AnyObject, action: Selector) {
        super.init(frame: .zero)
        self.target = target
        self.action = action
        title = label
        toolTip = tip
        isBordered = false
        bezelStyle = .regularSquare
        font = .systemFont(ofSize: NSFont.smallSystemFontSize)
        setButtonType(.momentaryChange)
    }
    required init?(coder: NSCoder) { fatalError("not used") }

    private var attrs: [NSAttributedString.Key: Any] {
        [.font: font ?? NSFont.systemFont(ofSize: NSFont.smallSystemFontSize),
         .foregroundColor: Ink.text(on: on, hot: hovering || held, enabled: true)]
    }

    /// Stated, because a title-less/image-less button reports a ~zero fitting
    /// size — that is what collapsed the first version of this accessory into
    /// an empty title bar. The padding is the chip's: it is drawn on every ON
    /// state, so the word must be inset far enough to sit inside one at rest
    /// too, or the control would visibly resize as it lit up.
    override var intrinsicContentSize: NSSize {
        let s = (title as NSString).size(withAttributes: attrs)
        return NSSize(width: ceil(s.width) + 16, height: 22)
    }

    override func draw(_ dirtyRect: NSRect) {
        if on {
            Ink.chip.setFill()
            NSBezierPath(roundedRect: bounds.insetBy(dx: 0, dy: 1),
                         xRadius: Ink.chipRadius, yRadius: Ink.chipRadius).fill()
        }
        let a = attrs
        let s = title as NSString
        let sz = s.size(withAttributes: a)
        s.draw(at: NSPoint(x: (bounds.width - sz.width) / 2,
                           y: (bounds.height - sz.height) / 2), withAttributes: a)
    }

    // Hover has to be tracked by hand: this is a borderless custom-drawn
    // button, so AppKit does not light it for us.
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(rect: bounds,
                                       options: [.mouseEnteredAndExited, .activeInActiveApp],
                                       owner: self, userInfo: nil))
    }
    override func mouseEntered(with event: NSEvent) { hovering = true; needsDisplay = true }
    override func mouseExited(with event: NSEvent) { hovering = false; needsDisplay = true }
    override func mouseDown(with event: NSEvent) {
        held = true; needsDisplay = true
        super.mouseDown(with: event)
        held = false; needsDisplay = true
    }
}

/// Back or forward: a chevron.
///
/// A GLYPH HERE, WORDS THERE, and the difference is not inconsistency. "View
/// Source" and "Inspector" name ideas this platform has no sign for, so a glyph
/// would be a private code. Back and forward are the opposite case — the chevron
/// is what every browser, the Finder and System Settings already use, so drawing
/// the word instead would be the unfamiliar choice, and twice as wide.
///
/// NO CHIP. These are commands, not modes: there is no state for one to report.
/// Their extra state is the other direction — DISABLED, when there is nowhere to
/// go, which is drawn as a third, fainter ink rather than by hiding the control
/// (a button that vanishes moves its neighbour, and a title bar that reflows as
/// you navigate is worse than one greyed arrow).
final class NavButton: NSButton {
    private let back: Bool
    private var hovering = false

    init(back: Bool, tip: String, target: AnyObject, action: Selector) {
        self.back = back
        super.init(frame: .zero)
        self.target = target
        self.action = action
        toolTip = tip
        isBordered = false
        bezelStyle = .regularSquare
        title = ""
        setButtonType(.momentaryChange)
    }
    required init?(coder: NSCoder) { fatalError("not used") }

    override var intrinsicContentSize: NSSize { NSSize(width: 22, height: 22) }

    override func draw(_ dirtyRect: NSRect) {
        let c = bounds.width / 2, m = bounds.height / 2
        let w: CGFloat = 3.5, h: CGFloat = 5.5      // half-extents of the chevron
        let tip = back ? c - w : c + w
        let tail = back ? c + w : c - w
        let p = NSBezierPath()
        p.move(to: NSPoint(x: tail, y: m + h))
        p.line(to: NSPoint(x: tip, y: m))
        p.line(to: NSPoint(x: tail, y: m - h))
        p.lineWidth = 1.6
        p.lineCapStyle = .round
        p.lineJoinStyle = .round
        Ink.text(on: false, hot: hovering, enabled: isEnabled).setStroke()
        p.stroke()
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(rect: bounds,
                                       options: [.mouseEnteredAndExited, .activeInActiveApp],
                                       owner: self, userInfo: nil))
    }
    override func mouseEntered(with event: NSEvent) { hovering = true; needsDisplay = true }
    override func mouseExited(with event: NSEvent) { hovering = false; needsDisplay = true }
}

/// The LEADING accessory: back and forward, after the traffic lights.
final class WindowNav: NSTitlebarAccessoryViewController {
    let back: NavButton
    let forward: NavButton

    init(owner: ProgramWindow) {
        back = NavButton(back: true, tip: "Back (⌘[)",
                         target: owner, action: #selector(ProgramWindow.goBack))
        forward = NavButton(back: false, tip: "Forward (⌘])",
                            target: owner, action: #selector(ProgramWindow.goForward))
        super.init(nibName: nil, bundle: nil)
        let row = NSStackView(views: [back, forward])
        row.orientation = .horizontal
        row.spacing = 2
        row.edgeInsets = NSEdgeInsets(top: 0, left: 8, bottom: 0, right: 0)
        row.frame = NSRect(x: 0, y: 0, width: row.fittingSize.width, height: 24)
        view = row
        layoutAttribute = .leading
    }
    required init?(coder: NSCoder) { fatalError("not used") }

    func refresh(canGoBack: Bool, canGoForward: Bool) {
        back.isEnabled = canGoBack
        forward.isEnabled = canGoForward
        back.needsDisplay = true
        forward.needsDisplay = true
    }
}

/// The TRAILING accessory: the two ways of looking at the program.
final class WindowChrome: NSTitlebarAccessoryViewController {
    let source: ChromeButton
    let inspector: ChromeButton

    init(owner: ProgramWindow) {
        source = ChromeButton(label: "View Source", tip: "Show this program's source (⌘U)",
                              target: owner, action: #selector(ProgramWindow.toggleViewer))
        inspector = ChromeButton(label: "Inspector", tip: "Inspect this program (⌥⌘I)",
                                 target: owner, action: #selector(ProgramWindow.toggleInspector))
        super.init(nibName: nil, bundle: nil)
        let row = NSStackView(views: [source, inspector])
        row.orientation = .horizontal
        row.spacing = 6
        row.edgeInsets = NSEdgeInsets(top: 0, left: 0, bottom: 0, right: 10)
        row.frame = NSRect(x: 0, y: 0, width: row.fittingSize.width, height: 24)
        view = row
        layoutAttribute = .trailing
    }
    required init?(coder: NSCoder) { fatalError("not used") }

    /// Re-read the window's state. Cheap and idempotent — called after either
    /// toggle and whenever key status changes, so the controls never disagree
    /// with what the window is actually doing.
    func refresh(viewing: Bool, inspecting: Bool) {
        source.on = viewing
        inspector.on = inspecting
        source.needsDisplay = true
        inspector.needsDisplay = true
    }
}

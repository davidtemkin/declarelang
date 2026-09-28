// Automation — whether a program window is being driven through the control
// channel, said where a person looks: the title bar.
//
// A browser does the same (Chrome's "controlled by automated test software",
// Safari's automation-tinted, input-locked window). The difference here is that
// a rig can ATTACH to a host a person is already using — the gate drives
// whatever host is running — so the signal follows activity, not the launch.
//
// THE SESSION. A client names itself with `attach NAME` and ends with
// `detach`; the title bar reads "Automated · NAME" while it lasts. A command
// that ACTS (a pointer, a key, a window verb, `eval`) with no session attached
// starts an anonymous one, so a rig that never says `attach` is still shown. A
// command that only OBSERVES (geometry, a hit trace, stats) starts nothing —
// reading changes nothing a person needs warning about. Silence ends a session:
// a rig that dies without `detach` does not leave the label up (30 s for a named
// session, 5 s for an anonymous one).
//
// WHILE A SESSION ACTS, the driven window's CONTENT refuses a person's input —
// a stray click or key would perturb the run and make both sides baffling. The
// title bar stays live (move the window, close it, press the label). A rig that
// posts real events itself says `attach NAME input`, and input passes.
//
// STOPPING IT. Pressing the label asks, and stopping ends the session and makes
// the channel refuse that client's acting commands ("error: automation stopped
// by the user") until a new `attach` — the rig fails loudly instead of driving
// on. Observing commands still answer, so it can report what happened.

import AppKit

final class Automation {
    static let shared = Automation()

    struct Session {
        var name: String?             // nil: anonymous (an acting command with no `attach`)
        var allowInput: Bool
        var acted: Bool               // an acting command has run: input is blocked from here
        var lastSeen: Date
    }

    private(set) var session: Session?
    /// Set when a person stopped a session; acting commands are refused until
    /// the next `attach`.
    private(set) var stoppedByUser = false
    /// The windows this session has driven. Weak: a window a rig closes drops out.
    private let driven = NSHashTable<ProgramWindow>.weakObjects()
    /// Every window, to repaint the label on all of them when state changes.
    private let all = NSHashTable<ProgramWindow>.weakObjects()

    func register(_ w: ProgramWindow) { all.add(w) }

    static let namedTimeout: TimeInterval = 30
    static let anonymousTimeout: TimeInterval = 5

    /// The commands that only read. Everything else acts.
    static let observing: Set<String> = [
        "ping", "waitload", "jit", "compilecache", "geom", "trace", "who", "inside", "chain",
        "subviews", "windows", "lasterror", "platform", "stats", "froststats",
        "frostdump", "occl", "boxes", "frame", "responder", "lines", "metrics", "owns", "flows",
        "automation",
    ]

    // ── the channel's side ──────────────────────────────────────────────────

    func attach(name: String, allowInput: Bool, target: ProgramWindow?) {
        stoppedByUser = false
        session = Session(name: name, allowInput: allowInput, acted: false, lastSeen: Date())
        driven.removeAllObjects()
        if let target { driven.add(target) }
        changed()
    }

    func detach() {
        guard session != nil else { return }
        session = nil
        driven.removeAllObjects()
        changed()
    }

    /// Does this command act? (`compilecache` reports; `compilecache clear` acts.)
    static func acts(_ words: [String]) -> Bool {
        guard let verb = words.first else { return false }
        if verb == "compilecache" { return words.count > 1 && words[1] == "clear" }
        return !observing.contains(verb)
    }

    /// Called for every command before it runs. Returns a refusal to reply
    /// with, or nil to go ahead.
    func note(words: [String], target: ProgramWindow?, appLevel: Bool) -> String? {
        let acting = Self.acts(words)
        if acting && stoppedByUser { return "error: automation stopped by the user" }
        if session == nil {
            guard acting else { return nil }
            session = Session(name: nil, allowInput: false, acted: false, lastSeen: Date())
        }
        session!.lastSeen = Date()
        if acting { session!.acted = true }
        if appLevel { for w in all.allObjects { driven.add(w) } }
        else if let target { driven.add(target) }
        changed()
        return nil
    }

    /// The channel's poll tick: end a session gone quiet.
    func tick() {
        guard let s = session else { return }
        let limit = s.name == nil ? Self.anonymousTimeout : Self.namedTimeout
        if Date().timeIntervalSince(s.lastSeen) > limit { detach() }
    }

    func describe() -> String {
        guard let s = session else { return stoppedByUser ? "none stopped-by-user" : "none" }
        return "attached name=\(s.name ?? "-") input=\(s.allowInput ? "allowed" : (s.acted ? "blocked" : "open")) windows=\(driven.count)"
    }

    // ── the window's side ───────────────────────────────────────────────────

    /// The label this window should show, or nil.
    func label(for w: ProgramWindow) -> String? {
        guard let s = session, driven.contains(w) else { return nil }
        return s.name.map { "Automated · \($0)" } ?? "Automated"
    }

    /// Does this window's content refuse a person's input right now?
    func blocksInput(_ w: ProgramWindow) -> Bool {
        guard let s = session, s.acted, !s.allowInput else { return false }
        return driven.contains(w)
    }

    /// A person pressed Stop.
    func stopByUser() {
        stoppedByUser = true
        detach()
    }

    private func changed() {
        for w in all.allObjects { w.refreshAutomation() }
    }
}

/// The window that filters a person's input while automation drives it. Only
/// the CONTENT is guarded — the title bar (move, close, the label) stays live —
/// and a command-key equivalent passes, so ⌘W and ⌘Q still work.
final class ProgramNSWindow: NSWindow {
    /// Asked on every event; the owner answers (Automation.blocksInput).
    var blocksInput: () -> Bool = { false }
    /// Told when a DELIBERATE event was refused (a press, a key, a scroll), so
    /// the label can say why. Pointer movement is refused too — hover would
    /// perturb the run — but says nothing, or merely passing over the window
    /// would flash the label without end. At most once a second.
    var refused: () -> Void = {}
    private var lastSaid = Date.distantPast

    override func sendEvent(_ event: NSEvent) {
        if blocksInput() && refuses(event) {
            // AppKit updates the cursor while it handles movement; refusing the
            // movement would leave whatever the frame last set (the resize edge's
            // cursor) standing over content that is not listening. The arrow is
            // the honest cursor for it.
            if [.mouseMoved, .mouseEntered, .mouseExited].contains(event.type) { NSCursor.arrow.set() }
            if event.type != .mouseMoved && event.type != .mouseEntered && event.type != .mouseExited && event.type != .leftMouseDragged && event.type != .rightMouseDragged
                && event.type != .otherMouseDragged && event.type != .keyUp
                && event.type != .leftMouseUp && event.type != .rightMouseUp && event.type != .otherMouseUp
                && Date().timeIntervalSince(lastSaid) > 1 {
                lastSaid = Date()
                refused()
            }
            return
        }
        Watchdog.shared.during("event \(event.type.rawValue)") { super.sendEvent(event) }
    }

    private func refuses(_ e: NSEvent) -> Bool {
        switch e.type {
        case .keyDown, .keyUp:
            return !e.modifierFlags.contains(.command)
        case .leftMouseDown, .leftMouseUp, .leftMouseDragged, .rightMouseDown, .rightMouseUp,
             .rightMouseDragged, .otherMouseDown, .otherMouseUp, .otherMouseDragged, .mouseMoved,
             .scrollWheel, .magnify, .rotate, .swipe, .smartMagnify, .mouseEntered, .mouseExited:
            // entering and leaving feed the program's hover as surely as moving does
            return contentLayoutRect.contains(e.locationInWindow)
        default:
            return false
        }
    }
}

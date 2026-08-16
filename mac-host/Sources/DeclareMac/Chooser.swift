// Chooser — what a person sees when they open Declare with nothing to open.
//
// NOT an NSAlert. An alert is shaped for a sentence and a decision: its icon is
// pinned top-LEFT with the text beside it, and that layout cannot be centred.
// This panel is not raising an alarm, it is offering three ways to start, so it
// reads as a launch screen — the app's own icon, then its name, then the
// choices, all down the middle.

import AppKit

final class LaunchChooser: NSObject, NSWindowDelegate {
    enum Choice: Int { case cancel = 0, openFile = 1, openURL = 2, restore = 3 }

    private let panel: NSWindow
    private var escapeMonitor: Any?

    private init(canRestore: Bool) {
        panel = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 340, height: 300),
                         styleMask: [.titled, .closable, .fullSizeContentView],
                         backing: .buffered, defer: false)
        super.init()
        panel.titlebarAppearsTransparent = true
        panel.titleVisibility = .hidden
        panel.isMovableByWindowBackground = true
        panel.delegate = self

        // The app's own icon. A BUNDLED app has one from Info.plist; the bare
        // dev binary is given a generic file icon by the system, so the launch
        // handler's icns is already installed as applicationIconImage by then —
        // read it from there rather than reaching for the file again.
        let icon = NSImageView(image: NSApp.applicationIconImage
                               ?? NSImage(named: NSImage.applicationIconName) ?? NSImage())
        icon.imageScaling = .scaleProportionallyUpOrDown

        let title = NSTextField(labelWithString: "Declare")
        title.font = .systemFont(ofSize: 16, weight: .semibold)
        title.alignment = .center

        let sub = NSTextField(labelWithString: "Open a program to begin.")
        sub.alignment = .center
        sub.textColor = .secondaryLabelColor

        let buttons = [("Open File…", Choice.openFile, true),
                       ("Open URL…", Choice.openURL, true),
                       ("Restore Previous Windows", Choice.restore, canRestore)]
            .map { (label, choice, enabled) -> NSButton in
                let b = NSButton(title: label, target: self, action: #selector(pick(_:)))
                b.bezelStyle = .rounded
                b.tag = choice.rawValue
                b.isEnabled = enabled
                return b
            }

        let stack = NSStackView(views: [icon, title, sub] + buttons)
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 8
        stack.edgeInsets = NSEdgeInsets(top: 8, left: 24, bottom: 24, right: 24)
        stack.setCustomSpacing(14, after: icon)
        stack.setCustomSpacing(18, after: sub)
        stack.translatesAutoresizingMaskIntoConstraints = false

        let content = NSView(frame: panel.contentLayoutRect)
        content.addSubview(stack)
        panel.contentView = content
        NSLayoutConstraint.activate([
            icon.widthAnchor.constraint(equalToConstant: 72),
            icon.heightAnchor.constraint(equalToConstant: 72),
            stack.topAnchor.constraint(equalTo: content.topAnchor, constant: 18),
            stack.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            stack.bottomAnchor.constraint(equalTo: content.bottomAnchor),
        ])
        // One column: every choice the same width, so none reads as the default.
        for b in buttons {
            b.widthAnchor.constraint(equalTo: stack.widthAnchor,
                                     constant: -(stack.edgeInsets.left + stack.edgeInsets.right)).isActive = true
        }
    }

    @objc private func pick(_ sender: NSButton) {
        NSApp.stopModal(withCode: NSApplication.ModalResponse(rawValue: sender.tag))
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        NSApp.stopModal(withCode: NSApplication.ModalResponse(rawValue: Choice.cancel.rawValue))
        return false                       // the modal loop takes it down
    }

    /// Show it and wait. Returns what was chosen; `.cancel` if it was dismissed.
    static func run(canRestore: Bool) -> Choice {
        let c = LaunchChooser(canRestore: canRestore)
        c.panel.center()
        c.panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        // Escape dismisses, as it would an alert. A titled window does not do
        // this for us, and a launch screen with no way out is a trap.
        c.escapeMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { e in
            guard e.keyCode == 53 else { return e }
            NSApp.stopModal(withCode: NSApplication.ModalResponse(rawValue: Choice.cancel.rawValue))
            return nil
        }
        let code = NSApp.runModal(for: c.panel)
        if let m = c.escapeMonitor { NSEvent.removeMonitor(m) }
        c.panel.orderOut(nil)
        return Choice(rawValue: code.rawValue) ?? .cancel
    }
}

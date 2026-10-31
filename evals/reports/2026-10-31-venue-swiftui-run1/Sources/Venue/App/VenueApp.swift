import AppKit
import SwiftUI

@main
struct VenueApp: App {
    @NSApplicationDelegateAdaptor private var appDelegate: AppDelegate
    @State private var app = AppModel()

    var body: some Scene {
        WindowGroup("The Venue") {
            RootView()
                .environment(app)
                .frame(minWidth: 380, minHeight: 560)
        }
        .defaultSize(width: 1180, height: 820)
        .windowToolbarStyle(.unified)
        .commands {
            // One visit at a time; a second window would split the person's choice.
            CommandGroup(replacing: .newItem) {}
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Launched straight from `swift run`, the process isn't yet a foreground app.
        NSApp.setActivationPolicy(.regular)
        NSApp.activate()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

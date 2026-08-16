// Session — how the host was started, and what it had open when it stopped.
//
// Two small things that belong together because both answer "what should be on
// screen the moment we launch": whether a PERSON is driving (and may therefore
// be asked a question), and which windows were open last time.

import AppKit

/// Is something other than a person driving this process?
///
/// The distinction has to be explicit rather than inferred, because every
/// courtesy the host extends to a person is an obstruction to a harness: a
/// modal seizes the run loop, a chooser waits forever for a click nobody will
/// make, and a rig's throwaway windows would overwrite the session a person
/// spent the day arranging. `DECLARE_CONTROL` (the injection channel) and
/// `DECLARE_BENCH` (measure-and-quit) are the two ways this host is driven.
enum Launch {
    static var isAutomated: Bool {
        let env = ProcessInfo.processInfo.environment
        return env["DECLARE_CONTROL"] != nil || env["DECLARE_BENCH"] != nil
    }
}

/// The windows that were open, so they can be offered back.
///
/// This is a convenience, not a document: losing it costs a person one trip
/// through Open Location. So it lives in the CACHE directory, which the system
/// is free to purge, and every failure here is silent by design — a session
/// that cannot be written must never stop a window from opening.
enum SessionStore {
    struct Entry: Codable {
        var url: String
        var x: Double, y: Double, w: Double, h: Double
        var frame: NSRect { NSRect(x: x, y: y, width: w, height: h) }
    }

    private static var fileURL: URL? {
        guard let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
        else { return nil }
        let dir = caches.appendingPathComponent("Declare", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("windows.json")
    }

    static func load() -> [Entry] {
        guard let u = fileURL, let data = try? Data(contentsOf: u),
              let out = try? JSONDecoder().decode([Entry].self, from: data)
        else { return [] }
        return out
    }

    static func save(_ entries: [Entry]) {
        // A harness opens and closes windows constantly; none of that is the
        // person's session, and writing it would quietly destroy theirs.
        guard !Launch.isAutomated, let u = fileURL else { return }
        guard let data = try? JSONEncoder().encode(entries) else { return }
        try? data.write(to: u, options: .atomic)
    }
}

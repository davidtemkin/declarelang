// Clipboard — the general pasteboard for the runtime's copy, cut and paste
// (runtime clipboard.ts). The runtime names representations by MIME type; the
// pasteboard names them by type identifier. Text, HTML and links map both ways.
// Any other type the program puts travels as an identifier made from its MIME
// name (a bare MIME name is stored under a generated dyn.… name and lost),
// which this app reads back and other apps pass over. Pasted files are file
// records; a pasted image with no file behind it (a screenshot) is written to a
// temporary file and arrives as one, as it does in a browser.

import AppKit
import UniformTypeIdentifiers

enum Clipboard {
    private static let known: [(mime: String, type: NSPasteboard.PasteboardType)] = [
        ("text/plain", .string),
        ("text/html", .html),
        ("text/uri-list", .URL),
        ("text/rtf", .rtf),
    ]
    /// A program's own type, as a pasteboard type: the MIME name under a prefix.
    private static let ownPrefix = "com.declarelang.mime."
    private static func type(of mime: String) -> NSPasteboard.PasteboardType {
        known.first(where: { $0.mime == mime })?.type ?? NSPasteboard.PasteboardType(ownPrefix + mime.replacingOccurrences(of: "/", with: ".slash."))
    }

    /// Write the representations a copy put, replacing what was there.
    static func write(json: String) {
        guard let data = json.data(using: .utf8),
              let reps = (try? JSONSerialization.jsonObject(with: data)) as? [String: String], !reps.isEmpty else { return }
        let pb = NSPasteboard.general
        pb.clearContents()
        let item = NSPasteboardItem()
        for (mime, value) in reps {
            item.setString(value, forType: type(of: mime))
        }
        pb.writeObjects([item])
    }

    /// What a paste offers, as the runtime takes it: `{ data: { mime: text }, files: [record] }`.
    static func read() -> String {
        let pb = NSPasteboard.general
        var reps: [String: String] = [:]
        var files: [[String: Any]] = []
        let urls = (pb.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL]) ?? []
        if !urls.isEmpty { files = FileRecords.of(urls) }
        for type in pb.types ?? [] {
            if let k = known.first(where: { $0.type == type }) {
                if reps[k.mime] == nil, let s = pb.string(forType: type) { reps[k.mime] = s }
            } else if type.rawValue.hasPrefix(ownPrefix), let s = pb.string(forType: type) {
                // a program's own type, back under its MIME name
                reps[String(type.rawValue.dropFirst(ownPrefix.count)).replacingOccurrences(of: ".slash.", with: "/")] = s
            }
        }
        // a file's URL is its record, not its text
        if !urls.isEmpty { reps.removeValue(forKey: "text/uri-list") }
        if files.isEmpty, let png = imageAsPNG(pb) {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("Pasted \(UUID().uuidString.prefix(8)).png")
            if (try? png.write(to: url)) != nil, let r = FileRecords.record(url, path: "") { files.append(r) }
        }
        let out: [String: Any] = ["data": reps, "files": files]
        return (try? JSONSerialization.data(withJSONObject: out)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }

    private static func imageAsPNG(_ pb: NSPasteboard) -> Data? {
        if let d = pb.data(forType: .png) { return d }
        guard let tiff = pb.data(forType: .tiff), let rep = NSBitmapImageRep(data: tiff) else { return nil }
        return rep.representation(using: .png, properties: [:])
    }
}

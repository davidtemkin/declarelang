// Files — the person's own files on the native host: the open panel behind
// `Files.pick`, and files dragged into the window (DeclareView). Both answer
// with the runtime's file records (runtime/src/files.ts): name, size, MIME
// type, when it last changed, its path within a chosen or dropped folder (""
// for a file on its own), and a file: URL that reads it. A folder is every
// file in it, depth first, hidden files left out — what a browser's folder
// pick and folder drop give.

import AppKit
import UniformTypeIdentifiers

enum FileRecords {
    /// The records for chosen or dropped URLs: a file is itself; a folder is
    /// every file inside it, each with its path from the folder.
    static func of(_ urls: [URL]) -> [[String: Any]] {
        var out: [[String: Any]] = []
        for url in urls {
            var isDir: ObjCBool = false
            FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir)
            if !isDir.boolValue { if let r = record(url, path: "") { out.append(r) }; continue }
            let keys: [URLResourceKey] = [.isDirectoryKey, .fileSizeKey, .contentModificationDateKey]
            guard let walker = FileManager.default.enumerator(at: url, includingPropertiesForKeys: keys,
                                                              options: [.skipsHiddenFiles, .skipsPackageDescendants]) else { continue }
            let base = url.standardizedFileURL.path
            for case let f as URL in walker {
                if (try? f.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true { continue }
                let rel = String(f.standardizedFileURL.path.dropFirst(base.count)).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                if let r = record(f, path: url.lastPathComponent + "/" + rel) { out.append(r) }
            }
        }
        return out
    }

    static func record(_ url: URL, path: String) -> [String: Any]? {
        let v = try? url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
        let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? ""
        return [
            "name": url.lastPathComponent,
            "size": v?.fileSize ?? 0,
            "type": mime,
            "modified": ((v?.contentModificationDate ?? Date()).timeIntervalSince1970 * 1000).rounded(),
            "path": path,
            "url": url.absoluteString,
        ]
    }

    static func json(_ records: [[String: Any]]) -> String {
        (try? JSONSerialization.data(withJSONObject: records)).flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
    }

    /// The URLs a drag carries.
    static func dragged(_ info: NSDraggingInfo) -> [URL] {
        (info.draggingPasteboard.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL]) ?? []
    }

    /// `Files.pick`'s options as the open panel's: a folder, several files, the
    /// types offered (MIME types — `image/*` for a family — or extensions).
    static func pick(optionsJSON: String, in window: NSWindow?, done: @escaping ([URL]) -> Void) {
        let o = (optionsJSON.data(using: .utf8).flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]) ?? [:]
        let folder = o["folder"] as? Bool == true
        let panel = NSOpenPanel()
        panel.canChooseFiles = !folder
        panel.canChooseDirectories = folder
        panel.allowsMultipleSelection = folder ? false : (o["multiple"] as? Bool == true)
        var types: [UTType] = []
        for a in (o["accept"] as? [String]) ?? [] {
            if a.hasPrefix(".") { if let t = UTType(filenameExtension: String(a.dropFirst())) { types.append(t) } }
            else if a.hasSuffix("/*") {
                switch a.dropLast(2) {
                case "image": types.append(.image)
                case "audio": types.append(.audio)
                case "video": types.append(.movie)
                case "text": types.append(.text)
                default: break
                }
            } else if let t = UTType(mimeType: a) { types.append(t) }
        }
        if !types.isEmpty && !folder { panel.allowedContentTypes = types }
        let finish: (NSApplication.ModalResponse) -> Void = { r in done(r == .OK ? panel.urls : []) }
        if let window { panel.beginSheetModal(for: window, completionHandler: finish) }
        else { panel.begin(completionHandler: finish) }
    }

    /// `FilePicker.save`: the save panel, opening in Downloads with the name
    /// filled in; the bytes written where the person chose. Answers whether
    /// they were saved — false when the panel was cancelled or the write failed.
    static func save(optionsJSON: String, base64: String, in window: NSWindow?, done: @escaping (Bool) -> Void) {
        let o = (optionsJSON.data(using: .utf8).flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]) ?? [:]
        let name = (o["name"] as? String) ?? "Untitled"
        guard let data = Data(base64Encoded: base64) else { done(false); return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = name
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false
        panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
        let ext = (name as NSString).pathExtension
        if !ext.isEmpty, let t = UTType(filenameExtension: ext) { panel.allowedContentTypes = [t] }
        let finish: (NSApplication.ModalResponse) -> Void = { r in
            guard r == .OK, let url = panel.url else { done(false); return }
            do { try data.write(to: url, options: .atomic); done(true) } catch { done(false) }
        }
        if let window { panel.beginSheetModal(for: window, completionHandler: finish) }
        else { panel.begin(completionHandler: finish) }
    }
}

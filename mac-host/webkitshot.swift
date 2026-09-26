// webkitshot — render a page in WebKit (Safari's engine) with no window on
// screen, run a script, and write a PNG of the view.
//
//   swiftc -O webkitshot.swift -o webkitshot
//   ./webkitshot <url> <out.png> [WxH] [script.js]
//
// The script (optional) is awaited before the snapshot, so it can set state
// (scroll a sheet, switch a page) and wait for it to settle; it runs once the
// page's `window.__app` exists. The snapshot is at the backing scale pinned
// here (2×), sRGB, so it compares with a 2× Chrome screenshot directly.
//
// Off-screen, like webkitprobe: a third reference for the renderers without
// taking focus from whoever is using the machine.

import AppKit
import WebKit

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: webkitshot <url> <out.png> [WxH] [script.js]\n".data(using: .utf8)!)
    exit(2)
}
let url = URL(string: args[1])!
let out = args[2]
var size = CGSize(width: 1280, height: 800)
if args.count > 3 {
    let p = args[3].split(separator: "x").compactMap { Double($0) }
    if p.count == 2 { size = CGSize(width: p[0], height: p[1]) }
}
let script = args.count > 4 ? (try? String(contentsOfFile: args[4], encoding: .utf8)) : nil

final class Shot: NSObject, WKNavigationDelegate {
    let web: WKWebView
    var done = false
    override init() {
        let cfg = WKWebViewConfiguration()
        web = WKWebView(frame: CGRect(origin: .zero, size: size), configuration: cfg)
        super.init()
        web.navigationDelegate = self
        web.appearance = NSAppearance(named: .aqua)   // light, as headless Chrome is
        web.wantsLayer = true
        web.layer?.contentsScale = 2
    }
    func start() { web.load(URLRequest(url: url)) }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { waitForApp(tries: 0) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { fail(error.localizedDescription) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fail(error.localizedDescription) }
    private func waitForApp(tries: Int) {
        if tries > 300 { return fail("window.__app never appeared") }
        web.evaluateJavaScript("window.__app != null") { [weak self] v, _ in
            guard let self else { return }
            if (v as? Bool) == true { DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { self.runScript() } }
            else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { self.waitForApp(tries: tries + 1) } }
        }
    }
    private func runScript() {
        guard let script else { return snap() }
        web.callAsyncJavaScript("return await (\(script));", in: nil, in: .page) { [weak self] result in
            guard let self else { return }
            if case .failure(let err) = result {
                let info = (err as NSError).userInfo
                return self.fail((info["WKJavaScriptExceptionMessage"] as? String) ?? err.localizedDescription)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.snap() }
        }
    }
    private func snap() {
        let cfg = WKSnapshotConfiguration()
        cfg.snapshotWidth = NSNumber(value: Double(size.width))   // points; the image carries the 2× backing
        web.takeSnapshot(with: cfg) { [weak self] image, err in
            guard let self else { return }
            guard let image else { return self.fail(err?.localizedDescription ?? "no snapshot") }
            let px = CGSize(width: size.width * 2, height: size.height * 2)
            guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(px.width), pixelsHigh: Int(px.height),
                                             bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                             colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)?
                .retagging(with: .sRGB) else { return self.fail("no bitmap") }
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
            image.draw(in: CGRect(origin: .zero, size: px))
            NSGraphicsContext.restoreGraphicsState()
            guard let data = rep.representation(using: .png, properties: [:]) else { return self.fail("no png") }
            do { try data.write(to: URL(fileURLWithPath: out)) } catch { return self.fail(error.localizedDescription) }
            print("shot \(out) \(Int(px.width))x\(Int(px.height))")
            self.finish(0)
        }
    }
    private func fail(_ msg: String) {
        guard !done else { return }
        FileHandle.standardError.write("webkitshot: \(msg)\n".data(using: .utf8)!)
        finish(1)
    }
    private func finish(_ code: Int32) { done = true; exit(code) }
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)   // never a Dock icon, never focus
let shot = Shot()
shot.start()
DispatchQueue.main.asyncAfter(deadline: .now() + 90) { FileHandle.standardError.write("webkitshot: timed out\n".data(using: .utf8)!); exit(1) }
app.run()

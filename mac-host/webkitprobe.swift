// webkitprobe — run one measurement script in WebKit, with no browser on screen.
//
//   swiftc -O webkitprobe.swift -o webkitprobe
//   ./webkitprobe <url> <script.js> [widthxheight]
//
// Prints the script's JSON result to stdout, one line. Errors go to stderr and
// exit non-zero.
//
// WHY THIS EXISTS RATHER THAN safaridriver. Driving real Safari means a window
// that takes focus for the length of a sweep, and there is no headless mode. A
// WKWebView is the same engine with none of that — but the reason it is
// *sound*, not merely convenient, is specific:
//
//   WebKit's 2D canvas is DEFERRED. Draw calls only record; rasterization is
//   forced lazily at the first pixel read. So the flush — the thing worth
//   measuring on this engine — is triggered by getImageData, NOT by anything
//   being presented to a screen. An off-screen WKWebView rasterizes exactly as
//   a visible one does the moment the script reads a pixel.
//
// What is lost is frame CADENCE: a view that is not on a screen has no display
// to pace it, and rAF intervals here mean nothing. That is the right trade —
// cadence was never WebKit's authoritative number, the flush is.
//
// ⚠ Backing scale. Without a window there is no screen to inherit a scale from,
// so this pins the layer's contentsScale explicitly and the agent reports the
// devicePixelRatio it actually saw. Compare that field before comparing numbers
// against a browser run; a 1x measurement is not a 2x measurement.
//
// ⚠ This is WKWebView, not Safari.app. The engine is the same; the process
// model and GPU configuration need not be. Treat a large divergence from a real
// Safari run as a finding about the harness, not about the page.

import AppKit
import WebKit

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: webkitprobe <url> <script.js> [WxH]\n".data(using: .utf8)!)
    exit(2)
}
let url = URL(string: args[1])!
let script = (try? String(contentsOfFile: args[2], encoding: .utf8)) ?? ""
var size = CGSize(width: 900, height: 600)
if args.count >= 4 {
    let parts = args[3].split(separator: "x").compactMap { Double($0) }
    if parts.count == 2 { size = CGSize(width: parts[0], height: parts[1]) }
}
// `resize` oscillates the view's width for the life of the script. The frame
// really does reach the page — window.innerWidth follows it, verified — so this
// is a genuine resize gesture and not a simulated one. It runs on the main
// runloop alongside the agent, which yields between its own steps.
let resizing = args.contains("resize")

final class Probe: NSObject, WKNavigationDelegate {
    let web: WKWebView
    let script: String
    var done = false

    init(size: CGSize, script: String) {
        let cfg = WKWebViewConfiguration()
        cfg.preferences.setValue(true, forKey: "developerExtrasEnabled")
        web = WKWebView(frame: CGRect(origin: .zero, size: size), configuration: cfg)
        // no window: the layer is real, it simply never reaches a screen
        web.wantsLayer = true
        web.layer?.contentsScale = 2
        self.script = script
        super.init()
        web.navigationDelegate = self
    }

    func webView(_ w: WKWebView, didFinish _: WKNavigation!) { waitForApp(tries: 0) }

    /// A continuous width sweep: 70% to 100% of the base width and back, one
    /// step per display interval. Height is held so only one axis varies.
    func startResizing(base: CGSize) {
        var t = 0.0
        Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            t += 1.0 / 60.0
            let k = 0.85 + 0.15 * sin(t * 3.0)
            self.web.frame = CGRect(x: 0, y: 0, width: base.width * k, height: base.height)
        }
    }

    func webView(_ w: WKWebView, didFail _: WKNavigation!, withError e: Error) { fail(e.localizedDescription) }
    func webView(_ w: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError e: Error) { fail(e.localizedDescription) }

    /// The program boots asynchronously (fetch, fonts, the first settle), so a
    /// navigation callback is not readiness — poll for the app the same way a
    /// page-side driver would.
    private func waitForApp(tries: Int) {
        if tries > 200 { return fail("window.__app never appeared") }
        web.evaluateJavaScript("window.__app != null") { [weak self] v, _ in
            guard let self else { return }
            if (v as? Bool) == true {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { self.run() }
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { self.waitForApp(tries: tries + 1) }
            }
        }
    }

    private func run() {
        // callAsyncJavaScript awaits the agent's promise for us — the agent is
        // written as an async IIFE, so its body is wrapped in a return.
        web.callAsyncJavaScript("return await (\(script));", in: nil, in: .page) { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let value):
                let obj: Any = value
                if JSONSerialization.isValidJSONObject(obj),
                   let d = try? JSONSerialization.data(withJSONObject: obj),
                   let s = String(data: d, encoding: .utf8) {
                    print(s)
                    self.finish(0)
                } else {
                    self.fail("script returned a non-JSON value: \(obj)")
                }
            case .failure(let err):
                // the useful text is in userInfo, not localizedDescription —
                // "A JavaScript exception occurred" names nothing on its own
                let info = (err as NSError).userInfo
                let msg = (info["WKJavaScriptExceptionMessage"] as? String) ?? err.localizedDescription
                let line = (info["WKJavaScriptExceptionLineNumber"] as? Int).map { " (line \($0))" } ?? ""
                self.fail(msg + line)
            }
        }
    }

    private func fail(_ msg: String) {
        guard !done else { return }
        FileHandle.standardError.write("webkitprobe: \(msg)\n".data(using: .utf8)!)
        finish(1)
    }

    private func finish(_ code: Int32) {
        done = true
        exit(code)
    }
}

// An accessory app never activates, never shows in the Dock, never takes focus.
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let probe = Probe(size: size, script: script)
if resizing { probe.startResizing(base: size) }
probe.web.load(URLRequest(url: url))

// a hard ceiling, so a wedged page cannot hang a sweep
DispatchQueue.main.asyncAfter(deadline: .now() + 180) {
    FileHandle.standardError.write("webkitprobe: timed out\n".data(using: .utf8)!)
    exit(3)
}
app.run()

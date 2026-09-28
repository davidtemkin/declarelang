// Watchdog — says when the main thread stops answering, and what it was doing.
//
// The rule (Bridge.swift): nothing on main waits for the runtime or the
// compile. A slip against it shows up as the beachball, which a person sees
// and a log does not. So a background thread posts a beat to main every 50 ms
// and times its arrival; a beat that arrives more than 250 ms late logs
//
//     [hang] main thread blocked 612 ms (in: layer commit)
//
// The PHASE is what main said it was doing when the watchdog found it
// overdue — read while main is still stuck, so later work cannot overwrite it.
// Main names only the work it does in bulk (a commit, a frame, an event, a
// boot step); anything else reads "untagged", which is itself a finding.

import Foundation

final class Watchdog {
    static let shared = Watchdog()
    static let threshold: CFAbsoluteTime = 0.25

    private let lock = NSLock()
    private var phase = "launch"
    private var started = false

    /// Run `body` on main named as `name`, for a hang report; the phase it
    /// interrupted (a commit inside a frame) resumes after it.
    func during<T>(_ name: @autoclosure () -> String, _ body: () throws -> T) rethrows -> T {
        let outer = current()
        set(name())
        defer { set(outer) }
        return try body()
    }

    func set(_ name: String) { lock.lock(); phase = name; lock.unlock() }
    private func current() -> String { lock.lock(); defer { lock.unlock() }; return phase }

    func start() {
        guard !started else { return }
        started = true
        let t = Thread { [self] in
            while true {
                let posted = CFAbsoluteTimeGetCurrent()
                var stuckIn: String?
                let arrived = DispatchSemaphore(value: 0)
                DispatchQueue.main.async { arrived.signal() }
                // wait for the beat, noting the phase once it is overdue
                if arrived.wait(timeout: .now() + Self.threshold) == .timedOut {
                    stuckIn = current()
                    arrived.wait()
                }
                if let stuckIn {
                    let ms = (CFAbsoluteTimeGetCurrent() - posted) * 1000
                    NSLog("[hang] main thread blocked %.0f ms (in: %@)", ms, stuckIn)
                }
                Thread.sleep(forTimeInterval: 0.05)
            }
        }
        t.name = "declare.watchdog"
        t.qualityOfService = .utility
        t.start()
    }
}

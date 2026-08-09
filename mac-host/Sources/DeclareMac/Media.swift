// The media engine — AVFoundation behind the env's media-element shim.
//
// The JS side (mac-env.js DeclareMediaElement) speaks the HTMLMediaElement
// dialect the runtime's media.ts drives; every verb lands here by handle, and
// every fact goes back through __declareMediaEvent. Audio is a bare AVPlayer.
// Video is the same player — its PICTURE never crosses the bridge: the layer
// tree binds an AVPlayerLayer to the node (op MEDIA) and Core Animation draws
// the frames itself, which is the whole point of a native host.
//
// Every event into JS is followed by needsFrame(): the frame-observer contract
// (mac-env.js) promises that every completion requests the frame its effects
// ride on, and a time tick or an ended flag is exactly such a completion. An
// idle player holds no timers and requests nothing — the periodic observer
// fires only while playing, so a paused dashboard still costs zero frames.

import AVFoundation

final class MediaEngine {
    private unowned let bridge: Bridge

    private var players: [Int: AVPlayer] = [:]
    private var loops: [Int: Bool] = [:]
    private var rates: [Int: Float] = [:]
    private var timeObs: [Int: Any] = [:]
    private var statusObs: [Int: NSKeyValueObservation] = [:]
    private var stallObs: [Int: NSKeyValueObservation] = [:]
    private var endObs: [Int: NSObjectProtocol] = [:]

    init(bridge: Bridge) { self.bridge = bridge }

    func player(_ id: Int) -> AVPlayer? { players[id] }

    private func event(_ id: Int, _ type: String, _ args: [Any] = []) {
        bridge.call("__declareMediaEvent", [id, type] + args)
        bridge.needsFrame()
    }

    func create(_ id: Int) {
        let p = AVPlayer()
        players[id] = p
        // The playhead, ~4×/s while playing — media.ts's documented cadence.
        // AVPlayer suspends the observer while paused, so idle costs nothing.
        timeObs[id] = p.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main
        ) { [weak self] t in
            guard t.isNumeric else { return }
            self?.event(id, "time", [t.seconds])
        }
        // Buffering stalls, for `buffering`: waiting = stalled, playing = fed.
        stallObs[id] = p.observe(\.timeControlStatus, options: [.new]) { [weak self] p, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                switch p.timeControlStatus {
                case .waitingToPlayAtSpecifiedRate: self.event(id, "waiting")
                case .playing: self.event(id, "playing")
                default: break
                }
            }
        }
    }

    func load(_ id: Int, _ urlStr: String) {
        guard let p = players[id], let url = URL(string: urlStr) else {
            event(id, "error"); return
        }
        let item = AVPlayerItem(url: url)
        statusObs[id] = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                switch item.status {
                case .readyToPlay:
                    let d = item.duration.isNumeric ? item.duration.seconds : 0
                    let size = item.presentationSize
                    self.event(id, "metadata", [d, Double(size.width), Double(size.height)])
                    self.bridge.tree?.mediaReady(handle: id)
                case .failed:
                    self.event(id, "error")
                default: break
                }
            }
        }
        if let old = endObs[id] { NotificationCenter.default.removeObserver(old) }
        endObs[id] = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            if self.loops[id] == true {
                p.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero)
                p.rate = self.rates[id] ?? 1
            } else {
                let d = item.duration.isNumeric ? item.duration.seconds : 0
                self.event(id, "ended", [d])
            }
        }
        p.replaceCurrentItem(with: item)
    }

    func play(_ id: Int) {
        guard let p = players[id] else { return }
        p.rate = rates[id] ?? 1
        event(id, "play")
    }

    func pause(_ id: Int) {
        guard let p = players[id] else { return }
        p.pause()
        event(id, "pause")
    }

    func seek(_ id: Int, _ t: Double) {
        players[id]?.seek(to: CMTime(seconds: t, preferredTimescale: 600),
                          toleranceBefore: .zero, toleranceAfter: .zero)
    }

    func set(_ id: Int, _ key: String, _ value: Double) {
        guard let p = players[id] else { return }
        switch key {
        case "muted":  p.isMuted = value != 0
        case "volume": p.volume = Float(value)
        case "loop":   loops[id] = value != 0
        case "rate":
            rates[id] = Float(value)
            // mid-play, the new rate applies now; paused, it waits for play()
            if p.timeControlStatus != .paused { p.rate = Float(value) }
        default: break
        }
    }
}

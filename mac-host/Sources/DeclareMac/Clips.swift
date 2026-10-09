// In-memory sounds — `Audio [ inMemory = true ]` on the native host, behind the same seam the
// browser fills with Web Audio (runtime/src/clip-host.ts).
//
// A sound held in memory is decoded once into a PCM buffer; each play is a VOICE, an
// AVAudioPlayerNode reading that buffer, started the moment it is asked for, and voices
// overlap. Each Audio has its own mixer (its SINK), whose volume is the Audio's; every
// voice runs through a varispeed unit for the Audio's playbackRate. The JS side
// (mac-env.js __declareClipHost) names clips, sinks and voices by handle, and hears back
// through __declareClipEvent: "decoded" with the duration, "error", and "ended" when a
// voice runs out — never for a voice that was stopped.
//
// Everything here runs on main: AVAudioEngine's graph is changed from one thread, and the
// players' completion handlers hop back to it.

import AVFoundation

final class ClipEngine {
    private unowned let bridge: Bridge
    private let engine = AVAudioEngine()
    private var clips: [Int: AVAudioPCMBuffer] = [:]
    private var sinks: [Int: AVAudioMixerNode] = [:]
    private var voices: [Int: Voice] = [:]
    private var configObs: NSObjectProtocol?

    private final class Voice {
        let player = AVAudioPlayerNode()
        let speed = AVAudioUnitVarispeed()
        let buffer: AVAudioPCMBuffer
        var loop: Bool
        var stopped = false
        init(buffer: AVAudioPCMBuffer, loop: Bool) { self.buffer = buffer; self.loop = loop }
    }

    init(bridge: Bridge) {
        self.bridge = bridge
        // A change of output device stops the engine; start it again on the new one.
        configObs = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main
        ) { [weak self] _ in
            guard let self, !self.voices.isEmpty else { return }
            try? self.engine.start()
        }
    }

    private func event(_ id: Int, _ type: String, _ args: [Any] = []) {
        bridge.call("__declareClipEvent", [id, type] + args)
        bridge.needsFrame()
    }

    func decode(_ id: Int, _ urlStr: String) {
        guard let url = URL(string: urlStr), url.scheme != nil else { event(id, "error"); return }
        let land: (Data?) -> Void = { [weak self] data in
            let buffer = data.flatMap(Self.pcm)
            DispatchQueue.main.async {
                guard let self else { return }
                if let buffer {
                    self.clips[id] = buffer
                    self.event(id, "decoded", [Double(buffer.frameLength) / buffer.format.sampleRate])
                } else {
                    self.event(id, "error")
                }
            }
        }
        if url.isFileURL { land(try? Data(contentsOf: url)); return }
        Bridge.net.dataTask(with: url) { data, response, _ in
            let ok = (response as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } ?? true
            land(ok ? data : nil)
        }.resume()
    }

    /// The whole sound as samples. AVAudioFile reads only from a file, so the bytes go through
    /// a temporary one.
    private static func pcm(_ data: Data) -> AVAudioPCMBuffer? {
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: tmp) }
        do {
            try data.write(to: tmp)
            let file = try AVAudioFile(forReading: tmp)
            guard let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat,
                                                frameCapacity: AVAudioFrameCount(file.length)) else { return nil }
            try file.read(into: buffer)
            return buffer
        } catch {
            return nil
        }
    }

    /// A sink's mixer is attached now and connected when its first voice starts: a connection
    /// made before the engine has run does not hold.
    func sink(_ id: Int) {
        let mixer = AVAudioMixerNode()
        engine.attach(mixer)
        sinks[id] = mixer
    }

    func setVolume(_ id: Int, _ volume: Double) { sinks[id]?.outputVolume = Float(volume) }

    func releaseSink(_ id: Int) {
        guard let mixer = sinks.removeValue(forKey: id) else { return }
        engine.detach(mixer)
    }

    func start(_ id: Int, sink sinkId: Int, clip clipId: Int, offset: Double, loop: Bool, rate: Double) {
        guard let buffer = clips[clipId], let mixer = sinks[sinkId] else { event(id, "ended"); return }
        let v = Voice(buffer: buffer, loop: loop)
        engine.attach(v.player)
        engine.attach(v.speed)
        engine.connect(v.player, to: v.speed, format: buffer.format)
        engine.connect(v.speed, to: mixer, format: buffer.format)
        v.speed.rate = Float(rate)
        // A player whose chain does not reach the output raises when told to play, and that
        // takes the app down; every link is made first, and a voice that still cannot reach
        // the output is not started.
        connect(mixer)
        if !engine.isRunning {
            do { try engine.start() } catch { finish(v); event(id, "ended"); return }
        }
        guard reaches(v.player) else {
            NSLog("[clips] voice %d does not reach the output; not started", id)
            finish(v); event(id, "ended"); return
        }
        voices[id] = v
        let from = AVAudioFramePosition(offset * buffer.format.sampleRate)
        schedule(id, v, from: from, options: [])
        v.player.play()
    }

    /// The sink's mixer into the main mixer, and the main mixer into the output, where either
    /// link is missing.
    private func connect(_ mixer: AVAudioMixerNode) {
        if engine.outputConnectionPoints(for: engine.mainMixerNode, outputBus: 0).isEmpty {
            engine.connect(engine.mainMixerNode, to: engine.outputNode, format: nil)
        }
        if engine.outputConnectionPoints(for: mixer, outputBus: 0).isEmpty {
            engine.connect(mixer, to: engine.mainMixerNode, format: nil)
        }
    }

    /// Does `node`'s chain run, link by link, to the output?
    private func reaches(_ node: AVAudioNode) -> Bool {
        var n: AVAudioNode? = node
        for _ in 0..<8 {
            guard let at = n else { return false }
            if at === engine.outputNode { return true }
            n = engine.outputConnectionPoints(for: at, outputBus: 0).first?.node
        }
        return false
    }

    /// Play `v`'s buffer from frame `from`; a looping voice then goes round the whole buffer.
    private func schedule(_ id: Int, _ v: Voice, from: AVAudioFramePosition, options: AVAudioPlayerNodeBufferOptions) {
        let ended: (AVAudioPlayerNodeCompletionCallbackType) -> Void = { [weak self] _ in
            DispatchQueue.main.async { self?.ran(id, v) }
        }
        if from <= 0 {
            v.player.scheduleBuffer(v.buffer, at: nil, options: options.union(v.loop ? .loops : []),
                                    completionCallbackType: .dataPlayedBack, completionHandler: v.loop ? nil : ended)
            return
        }
        let rest = slice(v.buffer, from: from)
        v.player.scheduleBuffer(rest, at: nil, options: options,
                                completionCallbackType: .dataPlayedBack, completionHandler: v.loop ? nil : ended)
        if v.loop { v.player.scheduleBuffer(v.buffer, at: nil, options: .loops) }
    }

    private func slice(_ buffer: AVAudioPCMBuffer, from: AVAudioFramePosition) -> AVAudioPCMBuffer {
        let start = AVAudioFrameCount(min(max(0, from), AVAudioFramePosition(buffer.frameLength)))
        let count = buffer.frameLength - start
        guard let out = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: max(1, count)) else { return buffer }
        out.frameLength = count
        let channels = Int(buffer.format.channelCount)
        if let src = buffer.floatChannelData, let dst = out.floatChannelData {
            for c in 0..<channels { dst[c].update(from: src[c] + Int(start), count: Int(count)) }
        }
        return out
    }

    /// A voice ran out on its own.
    private func ran(_ id: Int, _ v: Voice) {
        guard voices[id] === v, !v.stopped else { return }
        voices.removeValue(forKey: id)
        finish(v)
        event(id, "ended")
    }

    func stop(_ id: Int) {
        guard let v = voices.removeValue(forKey: id) else { return }
        v.stopped = true
        v.player.stop()
        finish(v)
    }

    private func finish(_ v: Voice) {
        engine.detach(v.player)
        engine.detach(v.speed)
    }

    /// Looping turned on or off mid-play: the voice goes on from where it is.
    func setLoop(_ id: Int, _ on: Bool) {
        guard let v = voices[id], v.loop != on else { return }
        var at: AVAudioFramePosition = 0
        if let node = v.player.lastRenderTime, let t = v.player.playerTime(forNodeTime: node) {
            at = t.sampleTime % AVAudioFramePosition(max(1, v.buffer.frameLength))
        }
        v.loop = on
        schedule(id, v, from: at, options: .interrupts)
    }

    func setRate(_ id: Int, _ rate: Double) { voices[id]?.speed.rate = Float(rate) }
}

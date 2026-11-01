import AVFoundation

// Capture never writes recordings to disk. Resample on the audio callback, then
// hand off completed voice segments; only the ASR host sees PCM.
final class Microphone {
    private var engine: AVAudioEngine?
    private let lock = NSLock()
    private var suspended = false
    private var frames: [Float] = []
    private var preRoll: [Float] = []
    private var silence = 0
    private var voiced = 0
    private var lastLevel = Date.distantPast
    var onSegment: ((Data) -> Void)?
    var onLevel: ((Float) -> Void)?
    var onError: ((String) -> Void)?
    var running: Bool { engine?.isRunning == true }

    func owns(_ object: Any?) -> Bool { guard let object = object as? AVAudioEngine else { return false }; return object === engine }
    func start() throws {
        stop()
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0,
              let target = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false),
              let converter = AVAudioConverter(from: format, to: target) else {
            throw NSError(domain: "AssistantMic", code: 1, userInfo: [NSLocalizedDescriptionKey: "未找到可用麦克风，请检查声音输入设备"])
        }
        input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            let capacity = AVAudioFrameCount(Double(buffer.frameLength) * 16000 / format.sampleRate + 64)
            guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
            var supplied = false
            var error: NSError?
            converter.convert(to: output, error: &error) { _, status in
                if supplied { status.pointee = .noDataNow; return nil }
                supplied = true; status.pointee = .haveData; return buffer
            }
            guard error == nil, let data = output.floatChannelData?[0], output.frameLength > 0 else { return }
            self.consume(Array(UnsafeBufferPointer(start: data, count: Int(output.frameLength))))
        }
        do { try engine.start(); self.engine = engine }
        catch { input.removeTap(onBus: 0); throw error }
    }
    func stop() {
        if let engine { engine.inputNode.removeTap(onBus: 0); engine.stop() }
        engine = nil
        lock.lock(); reset(); lock.unlock()
    }
    func suspend(_ value: Bool) { lock.lock(); suspended = value; reset(); lock.unlock() }
    private func reset() { frames.removeAll(keepingCapacity: true); preRoll.removeAll(keepingCapacity: true); silence = 0; voiced = 0 }
    private func consume(_ samples: [Float]) {
        lock.lock()
        defer { lock.unlock() }
        guard !suspended else { return }
        let rms = sqrt(samples.reduce(Float(0)) { $0 + $1 * $1 } / Float(max(samples.count, 1)))
        if Date().timeIntervalSince(lastLevel) > 0.1 {
            lastLevel = Date(); let level = min(1, rms * 14)
            DispatchQueue.main.async { [weak self] in self?.onLevel?(level) }
        }
        let isVoice = rms > 0.009
        if frames.isEmpty {
            if !isVoice {
                preRoll.append(contentsOf: samples)
                if preRoll.count > 3200 { preRoll.removeFirst(preRoll.count - 3200) }
                return
            }
            frames = preRoll; preRoll.removeAll(keepingCapacity: true)
        }
        frames.append(contentsOf: samples)
        if isVoice { silence = 0; voiced += samples.count } else { silence += samples.count }
        if silence >= 12800 || frames.count >= 16000 * 18 {
            if voiced >= 3200 {
                let pcm = frames.withUnsafeBytes { Data($0) }
                DispatchQueue.main.async { [weak self] in self?.onSegment?(pcm) }
            }
            reset()
        }
    }
}

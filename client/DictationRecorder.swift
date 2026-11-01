import AVFoundation

/// Independent audio engine; construction never requests access or starts capture.
final class DictationRecorder {
    var onLevel: ((Float, Double) -> Void)?
    var onLimit: (() -> Void)?
    var onError: ((String) -> Void)?
    private let lock = NSLock()
    private var engine: AVAudioEngine?
    private var audio = DictationAudioBuffer()
    private var generation = 0
    private var failed = false
    private var lastLevel = Date.distantPast
    var running: Bool { engine?.isRunning == true }

    func owns(_ object: Any?) -> Bool {
        guard let other = object as? AVAudioEngine else { return false }
        return other === engine
    }

    func begin() throws {
        cancel()
        let next = AVAudioEngine()
        let input = next.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0,
              let target = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false),
              let converter = AVAudioConverter(from: format, to: target) else {
            throw NSError(domain: "DictationRecorder", code: 1, userInfo: [NSLocalizedDescriptionKey: "未找到可用麦克风，请检查声音输入设备"])
        }
        lock.lock(); failed = false; lastLevel = .distantPast; let token = generation; lock.unlock()
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
            if let error { self.fail(error.localizedDescription, token: token); return }
            guard let values = output.floatChannelData?[0], output.frameLength > 0 else { return }
            self.consume(Array(UnsafeBufferPointer(start: values, count: Int(output.frameLength))), token: token)
        }
        engine = next
        do { next.prepare(); try next.start() }
        catch { cancel(); throw error }
    }

    func finish() -> DictationRecording {
        stopEngine()
        lock.lock(); defer { lock.unlock() }
        return audio.finish()
    }

    func cancel() {
        stopEngine()
        lock.lock(); audio.reset(); lock.unlock()
    }

    private func stopEngine() {
        lock.lock(); generation += 1; lock.unlock()
        if let engine { engine.inputNode.removeTap(onBus: 0); engine.stop() }
        engine = nil
    }

    private func deliver(_ token: Int, allowFailure: Bool = false, _ callback: @escaping (DictationRecorder) -> Void) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.lock.lock(); let current = self.generation == token && (allowFailure || !self.failed); self.lock.unlock()
            if current { callback(self) }
        }
    }

    private func fail(_ message: String, token: Int) {
        lock.lock()
        guard generation == token, !failed else { lock.unlock(); return }
        failed = true
        audio.reset()
        lock.unlock()
        deliver(token, allowFailure: true) { recorder in recorder.cancel(); recorder.onError?(message) }
    }

    private func consume(_ samples: [Float], token: Int) {
        lock.lock()
        guard generation == token, !failed else { lock.unlock(); return }
        guard DictationAudioBuffer.isValid(samples) else {
            lock.unlock(); fail("麦克风返回了无效音频", token: token); return
        }
        let reachedLimit = audio.append(samples)
        let seconds = audio.seconds
        let sendLevel = Date().timeIntervalSince(lastLevel) >= 0.1
        if sendLevel { lastLevel = Date() }
        lock.unlock()
        if sendLevel {
            let energy = samples.reduce(0.0) { $0 + Double($1) * Double($1) } / Double(max(1, samples.count))
            let level = Float(min(1, sqrt(energy) * 14))
            deliver(token) { $0.onLevel?(level, seconds) }
        }
        if reachedLimit { deliver(token) { $0.onLimit?() } }
    }

    deinit {
        if let engine { engine.inputNode.removeTap(onBus: 0); engine.stop() }
    }
}

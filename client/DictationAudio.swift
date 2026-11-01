import Foundation

struct DictationRecording {
    let chunks: [Data]
    let seconds: Double
    let voiced: Bool
    let capped: Bool
}

/// In-memory PCM only. Silence remains part of the same user-controlled recording.
struct DictationAudioBuffer {
    static let sampleRate = 16000
    private static let maximum = 120 * sampleRate
    private var samples: [Float] = []
    var seconds: Double { Double(samples.count) / Double(Self.sampleRate) }

    static func isValid(_ values: [Float]) -> Bool { values.allSatisfy { $0.isFinite && abs($0) <= 2 } }

    /// Reject malformed batches atomically. True only on the transition to 120 seconds.
    mutating func append(_ values: [Float]) -> Bool {
        guard !values.isEmpty, Self.isValid(values),
              samples.count < Self.maximum else { return false }
        samples.append(contentsOf: values.prefix(Self.maximum - samples.count))
        return samples.count == Self.maximum
    }

    mutating func reset() { samples.removeAll(keepingCapacity: true) }

    mutating func finish() -> DictationRecording {
        let duration = seconds
        let capped = samples.count == Self.maximum
        var chunks: [Data] = []
        var voiced = false
        let window = 320 // 20 ms RMS windows avoid treating individual zero crossings as silence.
        for start in stride(from: 0, to: samples.count, by: window) {
            let end = min(start + window, samples.count)
            let energy = samples[start..<end].reduce(0.0) { $0 + Double($1) * Double($1) }
            if energy / Double(end - start) > 0.009 * 0.009 { voiced = true }
        }
        var start = 0
        while start < samples.count {
            var end = min(start + 18 * Self.sampleRate, samples.count)
            if end < samples.count {
                // Prefer the latest quiet window within the last three seconds.
                var bestEnergy = 0.009 * 0.009
                for candidate in stride(from: start + 15 * Self.sampleRate, through: end - window, by: window) {
                    let energy = samples[candidate..<(candidate + window)].reduce(0.0) { $0 + Double($1) * Double($1) } / Double(window)
                    if energy <= bestEnergy { bestEnergy = energy; end = candidate + window }
                }
            }
            var segment = Array(samples[start..<end])
            if segment.count < 800 { segment.append(contentsOf: repeatElement(0, count: 800 - segment.count)) }
            chunks.append(segment.withUnsafeBytes { Data($0) })
            start = end
        }
        reset()
        return DictationRecording(chunks: chunks, seconds: duration, voiced: voiced, capped: capped)
    }
}

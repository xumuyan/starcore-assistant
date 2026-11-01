import Foundation
import CoreGraphics

@main struct DictationNativeFixture {
    static func require(_ condition: @autoclosure () -> Bool, _ message: String) {
        if !condition() { fatalError(message) }
    }
    static func unpack(_ data: Data) -> [Float] {
        data.withUnsafeBytes { bytes in
            (0..<(bytes.count / 4)).map { bytes.loadUnaligned(fromByteOffset: $0 * 4, as: Float.self) }
        }
    }
    static func main() {
        var audio = DictationAudioBuffer()
        require(audio.finish().chunks.isEmpty, "empty recording")
        require(!audio.append([.nan, 0.5]), "invalid batch rejected")
        require(!audio.append([.infinity]), "infinity rejected")
        require(!audio.append([2.01]), "range rejected")
        require(audio.seconds == 0, "invalid data cannot poison duration")
        require(DictationAudioBuffer.isValid([-2, 2, 1.5]), "service-compatible finite range")
        require(!DictationAudioBuffer.isValid([.nan]), "validation helper exposes errors")
        require(!audio.append([]), "empty append")
        require(!audio.append(Array(repeating: 0, count: 16000 * 31)), "silence under cap")
        let silent = audio.finish()
        require(silent.seconds == 31 && !silent.voiced, "silence continues until finish")
        require(silent.chunks.count == 2, "31 seconds splits")
        let ordered = (0..<(16000 * 37 + 1)).map { Float($0 % 1701) / 2000 }
        _ = audio.append(ordered)
        let recording = audio.finish()
        let decoded = recording.chunks.flatMap(unpack)
        require(Array(decoded.prefix(ordered.count)) == ordered, "samples preserved in order")
        require(recording.chunks.allSatisfy { $0.count % 4 == 0 && $0.count <= 18 * 16000 * 4 && $0.count >= 800 * 4 }, "segment bounds")
        require(recording.seconds == Double(ordered.count) / 16000 && recording.voiced, "duration and voice")
        _ = audio.append(Array(repeating: 0.2, count: 17 * 16000))
        _ = audio.append(Array(repeating: 0, count: 1600))
        _ = audio.append(Array(repeating: 0.2, count: 2 * 16000))
        let quiet = audio.finish()
        require(quiet.chunks[0].count >= 17 * 16000 * 4 && quiet.chunks[0].count < 18 * 16000 * 4, "quiet boundary used")
        _ = audio.append(Array(repeating: 0.2, count: 18 * 16000 + 1))
        let tail = audio.finish()
        require(tail.chunks.count == 2 && tail.chunks[1].count == 800 * 4, "short tail padded")
        require(unpack(tail.chunks[1])[0] == 0.2, "short tail retained")
        var limitSignals = 0
        for _ in 0..<125 { if audio.append(Array(repeating: 0.1, count: 16000)) { limitSignals += 1 } }
        let capped = audio.finish()
        require(limitSignals == 1 && capped.capped && capped.seconds == 120, "one limit callback")
        require(capped.chunks.count <= 8, "eight chunks maximum")
        require(capped.chunks.reduce(0) { $0 + $1.count } == 120 * 16000 * 4, "cap has exactly 120 seconds of PCM")
        // Uneven quiet boundaries used to leave 20 ms after a full segment,
        // padding the 120-second recording above the service's hard cap.
        var uneven = Array(repeating: Float(0.1), count: 120 * 16000)
        for end in [17.0, 34, 51, 68, 85, 101.98] {
            let stop = Int((end * 16000).rounded())
            for index in (stop - 320)..<stop { uneven[index] = 0 }
        }
        _ = audio.append(uneven)
        let unevenCap = audio.finish()
        require(unevenCap.chunks.count <= 8, "uneven cap chunk count")
        let unevenDecoded = unevenCap.chunks.flatMap(unpack)
        require(unevenDecoded.count == uneven.count && unevenDecoded == uneven, "uneven cap must preserve samples without excess padding")
        require(unevenCap.chunks.allSatisfy { $0.count >= 3200 && $0.count <= 18 * 16000 * 4 }, "uneven cap segment bounds")
        // Worst case quiet boundaries still fit the service's eight-part limit.
        _ = audio.append(Array(repeating: 0, count: 120 * 16000))
        let quietCap = audio.finish()
        require(quietCap.chunks.count <= 8 && quietCap.seconds == 120, "silent cap limit")
        require(audio.seconds == 0 && audio.finish().chunks.isEmpty, "finish resets")
        _ = audio.append([0.5]); audio.reset(); require(audio.seconds == 0, "explicit reset")

        var keys = DictationKeyMatcher()
        func event(_ type: CGEventType, _ code: Int64, _ flags: CGEventFlags = [], _ active: Bool = false, _ repeatKey: Bool = false, _ tag: Int64 = 0) -> DictationKeyResult {
            keys.handle(type: type, keyCode: code, flags: flags, autorepeat: repeatKey, tag: tag, preset: "right-option", active: active)
        }
        require(event(.flagsChanged, 61, .maskAlternate).toggle == false, "option down")
        require(event(.flagsChanged, 61).toggle, "option alone release")
        _ = event(.flagsChanged, 61, .maskAlternate)
        _ = event(.keyDown, 0, .maskAlternate)
        require(!event(.flagsChanged, 61).toggle, "option combination")
        _ = event(.flagsChanged, 61, .maskAlternate)
        _ = event(.flagsChanged, 58, .maskAlternate)
        require(!event(.flagsChanged, 61, .maskAlternate).toggle, "left option held prevents toggle")
        keys.reset()
        _ = event(.flagsChanged, 61, CGEventFlags(rawValue: CGEventFlags.maskAlternate.rawValue | 0x40))
        _ = event(.flagsChanged, 58, CGEventFlags(rawValue: CGEventFlags.maskAlternate.rawValue | 0x60))
        require(!event(.flagsChanged, 61, CGEventFlags(rawValue: CGEventFlags.maskAlternate.rawValue | 0x20)).toggle, "physical right release while left held")
        keys.reset()
        _ = event(.flagsChanged, 61, [.maskAlternate, .maskShift])
        require(!event(.flagsChanged, 61).toggle, "preheld shift prevents toggle")
        for _ in 0..<3 { _ = event(.flagsChanged, 61, .maskAlternate); require(event(.flagsChanged, 61).toggle, "rapid option") }
        _ = event(.flagsChanged, 61, .maskAlternate); keys.reset(); require(!event(.flagsChanged, 61).toggle, "reset clears press")
        require(!event(.keyDown, 53).swallow, "idle escape")
        let escape = event(.keyDown, 53, [], true); require(escape.cancel && escape.swallow, "active escape")
        require(event(.keyUp, 53).swallow, "escape up paired after cancel")
        require(!event(.keyDown, 53, [], true, false, DictationHotkey.syntheticEventTag).cancel, "synthetic ignored")
        for (preset, code) in [("f8", Int64(100)), ("f9", Int64(101))] {
            keys.reset()
            let down = keys.handle(type: .keyDown, keyCode: code, flags: .maskSecondaryFn, autorepeat: false, tag: 0, preset: preset, active: false)
            require(down.toggle && down.swallow, "function key down")
            let repeated = keys.handle(type: .keyDown, keyCode: code, flags: [], autorepeat: true, tag: 0, preset: preset, active: false)
            require(!repeated.toggle && repeated.swallow, "repeat swallowed")
            require(keys.handle(type: .keyUp, keyCode: code, flags: .maskCommand, autorepeat: false, tag: 0, preset: preset, active: false).swallow, "paired up always swallowed")
            require(!keys.handle(type: .keyDown, keyCode: code, flags: .maskCommand, autorepeat: false, tag: 0, preset: preset, active: false).toggle, "modified function key ignored")
        }
        keys.reset()
        _ = event(.flagsChanged, 61, .maskAlternate)
        let keepTap = DictationHotkey.retainsTap(enabled: true, preset: "right-option", currentPreset: "right-option", running: true, permitted: true)
        require(keepTap, "same permitted configuration preserves tap")
        if !keepTap { keys.reset() }
        require(event(.flagsChanged, 61).toggle, "refresh preserves pressed Option state")
        for request in [(false, "right-option", true, true), (true, "f8", true, true), (true, "right-option", false, true), (true, "right-option", true, false)] {
            require(!DictationHotkey.retainsTap(enabled: request.0, preset: request.1, currentPreset: "right-option", running: request.2, permitted: request.3), "changed disabled revoked or missing tap cannot be retained")
        }
        let hotkey = DictationHotkey()
        require(hotkey.configure(enabled: false, preset: "right-option") && !hotkey.running, "disabled creates zero taps")
        require(hotkey.configure(enabled: false, preset: "f8") && !hotkey.running, "repeat disabled configuration stays inert")
        hotkey.stop()
        // Constructing recorder is inert: fixtures never call begin or configure a tap.
        let recorder = DictationRecorder()
        require(!recorder.running && !recorder.owns(nil), "recorder starts idle")
        recorder.cancel(); require(recorder.finish().chunks.isEmpty, "idle recorder safe")
        print("DICTATION_NATIVE_OK")
    }
}

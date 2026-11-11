import Foundation

@main struct AssistantPlaybackFixture {
    static func main() {
        var playback = AssistantPlayback()
        let old = NSObject(), current = NSObject(), stranger = NSObject()
        precondition(!playback.isActive)
        playback.begin(old, playbackID: "rust-1")
        precondition(playback.isActive, "queued speech is busy before isSpeaking becomes true")
        precondition(playback.finish(stranger) == nil && playback.isActive)
        playback.stop()
        precondition(playback.finish(old) == nil && !playback.isActive)
        playback.begin(current, playbackID: "rust-2")
        precondition(playback.finish(old) == nil && playback.isActive, "late callback cannot affect replacement")
        let event = playback.finish(current)!
        precondition(event["type"] as? String == "playbackEnded" && event["playbackId"] as? String == "rust-2")
        precondition(event.count == 2 && !playback.isActive)
        precondition(playback.finish(current) == nil, "duplicate finish/cancel/error is ignored")
        // Node emits no playbackId: preserve the exact existing event shape.
        playback.begin(old, playbackID: nil)
        let legacy = playback.finish(old)!
        precondition(legacy.count == 1 && legacy["type"] as? String == "playbackEnded")
        // Failed decode/start uses the same ownership and releases only its ID.
        playback.begin(stranger, playbackID: "rust-failed")
        precondition(playback.finish(stranger)?["playbackId"] as? String == "rust-failed")
        precondition(!playback.isActive)
        print("ASSISTANT_PLAYBACK_OK")
    }
}

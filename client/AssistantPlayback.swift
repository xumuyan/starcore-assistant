import Foundation

/// Main-thread ownership of one native playback object. Retain the object so its
/// identity cannot be reused while active. Rust IDs are echoed; legacy Node events
/// keep the original untagged acknowledgement. No audio or permissions are used here.
struct AssistantPlayback {
    private var current: AnyObject?
    private var playbackID: String?
    var isActive: Bool { current != nil }

    mutating func begin(_ object: AnyObject, playbackID: String?) {
        current = object
        self.playbackID = playbackID
    }

    mutating func stop() {
        current = nil
        playbackID = nil
    }

    mutating func finish(_ object: AnyObject) -> [String: Any]? {
        guard let current, current === object else { return nil }
        var event: [String: Any] = ["type": "playbackEnded"]
        if let playbackID { event["playbackId"] = playbackID }
        stop()
        return event
    }
}

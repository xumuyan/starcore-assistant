import AppKit
import AVFoundation

final class Host: DictationControllerHost {
    var busy = false
    var playback = AssistantPlayback()
    var dictationAssistantBusy: Bool {
        get { busy || playback.isActive }
        set { busy = newValue }
    }
    var shouldRestore = true
    var pauses = 0
    var restores: [Bool] = []
    var sent: [[String: Any]] = []
    func sendDictation(_ event: [String: Any]) { sent.append(event) }
    func pauseAssistantForDictation() -> Bool { pauses += 1; return shouldRestore }
    func resumeAssistantAfterDictation(_ value: Bool) { restores.append(value) }
    func reportDictationStatus(_ event: [String: Any]) {}
}
final class Capture: DictationCapturing {
    var onLevel: ((Float, Double) -> Void)?
    var onLimit: (() -> Void)?
    var onError: ((String) -> Void)?
    var running = false
    var starts = 0
    func begin() throws { running = true; starts += 1 }
    func finish() -> DictationRecording { running = false; return DictationRecording(chunks: [Data(repeating: 0, count: 6400)], seconds: 0.1, voiced: true, capped: false) }
    func cancel() { running = false }
    func owns(_ object: Any?) -> Bool { false }
}
final class Keys: DictationKeyListening {
    var onToggle: (() -> Void)?
    var onCancel: (() -> Void)?
    var onFailure: ((String) -> Void)?
    var isActive: () -> Bool = { false }
    var running = false
    func configure(enabled: Bool, preset: String) -> Bool { running = enabled; return true }
    func stop() { running = false }
}
final class Writer: DictationWriting {
    var inputs: [String] = []
    var onCapture: (() -> Void)?
    var pending: ((Bool, String) -> Void)?
    func capture() -> DictationPasteTarget { onCapture?(); return DictationPasteTarget(pid: 1, element: nil, selection: nil, reason: nil) }
    func insert(_ text: String, target: DictationPasteTarget, isCurrent: @escaping () -> Bool, completion: @escaping (Bool, String) -> Void) {
        if isCurrent() { inputs.append(text); pending = completion }
    }
    func cancel() {}
}
final class Panel: DictationPanelViewing {
    var onCancel: (() -> Void)?
    var onCopy: (() -> Void)?
    var onFinish: (() -> Void)?
    var visible = false
    var title = ""
    var canCopy = false
    var detail = ""
    var level: Float = 0
    var elapsed: Double = 0
    func show(title: String, detail: String, elapsed: Double?, level: Float, canCopy: Bool) { visible = true; self.title = title; self.detail = detail; self.canCopy = canCopy }
    func updateLevel(_ level: Float, elapsed: Double) { self.level = level; self.elapsed = elapsed }
    func hide() { visible = false }
}

@main
enum ControllerChecks {
    static func main() {
        for state in ["executing", "transcribing", "thinking", "loading", "speaking"] {
            precondition(DictationAssistantActivity.isBusy(state))
            let terminal = DictationAssistantActivity.next(state, event: ["type": "error", "message": "operation failed"])
            precondition(!DictationAssistantActivity.isBusy(terminal))
            precondition(DictationAssistantActivity.next(state, event: ["type": "level"]) == state)
        }
        let host = Host(), capture = Capture(), keys = Keys(), writer = Writer(), panel = Panel()
        let controller = DictationController(host: host, recorder: capture, hotkey: keys, writer: writer, panel: panel,
            permissions: { DictationPermissionState(microphone: .authorized, input: true, accessibility: true) },
            requestMicrophone: { $0(true) }, observeSystem: false)
        controller.configure([:]); precondition(!keys.running && capture.starts == 0)
        controller.presentPanel()
        precondition(panel.visible && panel.title.contains("未开启") && panel.title.contains("未录音"))
        precondition(capture.starts == 0 && host.sent.isEmpty && host.pauses == 0)
        controller.cancel()
        controller.configure(["dictationEnabled": true, "dictationHotkey": "right-option"])
        precondition(keys.running)
        writer.onCapture = { precondition(panel.visible && panel.title == "准备语音输入", "show before potentially slow AX capture") }
        keys.onToggle?(); let first = controller.requestID!
        precondition(panel.visible && panel.title == "准备语音输入", "hotkey immediately shows panel before model is ready")
        precondition(host.pauses == 1 && capture.starts == 0 && host.sent.last?["type"] as? String == "dictationPrepare")
        controller.handle(["type": "dictationReady", "id": first])
        precondition(capture.running && capture.starts == 1 && panel.visible && panel.title == "正在语音输入")
        precondition(panel.detail.contains("右 Option") && panel.detail.contains("esc取消"))
        capture.onLevel?(0.65, 2.5)
        precondition(panel.level == 0.65 && panel.elapsed == 2.5)
        panel.onFinish?()
        precondition(!capture.running && host.sent.last?["type"] as? String == "dictationFinish")
        controller.handle(["type": "dictationResult", "id": first, "text": "让 Codex 只是输入草稿"])
        precondition(writer.inputs == ["让 Codex 只是输入草稿"])
        controller.cancel()
        writer.pending?(true, "late")
        precondition(controller.requestID == nil && !panel.visible && host.restores == [true])
        controller.handle(["type": "dictationReady", "id": first])
        controller.handle(["type": "dictationResult", "id": first, "text": "old"])
        precondition(capture.starts == 1 && writer.inputs.count == 1)

        host.shouldRestore = false
        controller.toggle(); let second = controller.requestID!
        controller.handle(["type": "dictationReady", "id": second])
        controller.configure(["dictationEnabled": false])
        precondition(!keys.running && !capture.running && host.restores == [true, false])
        precondition(host.sent.last?["type"] as? String == "dictationCancel")

        controller.configure(["dictationEnabled": true])
        host.dictationAssistantBusy = true
        let count = host.pauses
        controller.toggle()
        precondition(controller.requestID == nil && host.pauses == count)
        host.dictationAssistantBusy = false
        // A queued native utterance owns the gate before AV reports isSpeaking.
        let queuedSpeech = NSObject()
        host.playback.begin(queuedSpeech, playbackID: "rust-fixture")
        controller.toggle()
        precondition(controller.requestID == nil && !capture.running)
        _ = host.playback.finish(queuedSpeech)
        controller.toggle(); let third = controller.requestID!
        let startsBeforeRejection = capture.starts
        controller.handle(["type": "dictationError", "id": "stale-id", "message": "ignored"])
        precondition(controller.requestID == third)
        controller.handle(["type": "dictationError", "id": third, "message": "Rust 宿主暂不支持全局听写，请切换回 node 引擎"])
        precondition(controller.requestID == nil && !capture.running && capture.starts == startsBeforeRejection)
        precondition(panel.title == "语音输入未完成" && panel.detail.contains("暂不支持"))
        precondition(host.sent.last?["type"] as? String == "dictationCancel")
        controller.toggle(); let fourth = controller.requestID!
        controller.handle(["type": "dictationReady", "id": fourth]); controller.toggle()
        controller.handle(["type": "dictationResult", "id": fourth, "text": "需要手动复制的识别预览"])
        writer.pending?(false, "输入焦点已变化")
        precondition(controller.requestID == nil && panel.canCopy)
        precondition(panel.detail.contains("输入焦点已变化") && panel.detail.contains("需要手动复制的识别预览"))
        controller.cancel(); precondition(!keys.isActive())
        controller.shutdown(); precondition(!keys.running && !panel.visible)
        var access = DictationPermissionState(microphone: .denied, input: false, accessibility: false)
        let blocked = DictationController(host: host, recorder: capture, hotkey: keys, writer: writer, panel: panel,
            permissions: { access }, requestMicrophone: { _ in fatalError("preview must not request microphone") }, observeSystem: false)
        blocked.configure(["dictationEnabled": true])
        let before = capture.starts
        blocked.presentPanel()
        precondition(panel.visible && panel.title.contains("等待授权") && panel.title.contains("未录音") && !keys.running)
        precondition(blocked.requestID == nil && capture.starts == before)
        access = DictationPermissionState(microphone: .authorized, input: true, accessibility: true)
        blocked.presentPanel()
        precondition(panel.title.contains("已就绪") && panel.title.contains("未录音") && blocked.requestID == nil)
        blocked.shutdown()
        print("DICTATION_CONTROLLER_PASS")
    }
}

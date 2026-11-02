import AppKit
import AVFoundation
import ApplicationServices

// Some original operations end with an error event and no following state.
// Do not keep their stale "executing"/"transcribing" caption as a permanent lock.
enum DictationAssistantActivity {
    static func isBusy(_ state: String) -> Bool {
        ["loading", "transcribing", "thinking", "polishing", "synthesizing", "speaking", "executing"].contains(state)
    }
    static func next(_ current: String, event: [String: Any]) -> String {
        if event["type"] as? String == "error" { return "error" }
        if event["type"] as? String == "state", let name = event["name"] as? String { return name }
        return current
    }
}

protocol DictationControllerHost: AnyObject {
    var dictationAssistantBusy: Bool { get }
    func sendDictation(_ event: [String: Any])
    func pauseAssistantForDictation() -> Bool
    func resumeAssistantAfterDictation(_ restore: Bool)
    func reportDictationStatus(_ event: [String: Any])
}
protocol DictationCapturing: AnyObject {
    var onLevel: ((Float, Double) -> Void)? { get set }
    var onLimit: (() -> Void)? { get set }
    var onError: ((String) -> Void)? { get set }
    var running: Bool { get }
    func begin() throws
    func finish() -> DictationRecording
    func cancel()
    func owns(_ object: Any?) -> Bool
}
protocol DictationKeyListening: AnyObject {
    var onToggle: (() -> Void)? { get set }
    var onCancel: (() -> Void)? { get set }
    var onFailure: ((String) -> Void)? { get set }
    var isActive: () -> Bool { get set }
    var running: Bool { get }
    func configure(enabled: Bool, preset: String) -> Bool
    func stop()
}
protocol DictationWriting: AnyObject {
    func capture() -> DictationPasteTarget
    func insert(_ text: String, target: DictationPasteTarget, isCurrent: @escaping () -> Bool, completion: @escaping (Bool, String) -> Void)
    func cancel()
}
protocol DictationPanelViewing: AnyObject {
    var onCancel: (() -> Void)? { get set }
    var onCopy: (() -> Void)? { get set }
    var onFinish: (() -> Void)? { get set }
    var visible: Bool { get }
    func show(title: String, detail: String, elapsed: Double?, level: Float, canCopy: Bool)
    func updateLevel(_ level: Float, elapsed: Double)
    func hide()
}
extension DictationRecorder: DictationCapturing {}
extension DictationHotkey: DictationKeyListening {}
extension DictationPaste: DictationWriting {}
extension DictationPanel: DictationPanelViewing {}

struct DictationPermissionState {
    let microphone: AVAuthorizationStatus
    let input: Bool
    let accessibility: Bool
}

/// Owns only the new input session; old assistant preferences and history stay in
/// their original host. Dependencies permit deterministic tests without OS input.
final class DictationController: NSObject {
    enum Phase { case idle, preparing, recording, processing, inserting }
    private weak var host: DictationControllerHost?
    private let recorder: DictationCapturing
    private let hotkey: DictationKeyListening
    private let writer: DictationWriting
    private let panel: DictationPanelViewing
    private let permissions: () -> DictationPermissionState
    private let requestMicrophone: (@escaping (Bool) -> Void) -> Void
    private let observeSystem: Bool
    private var observers: [(NotificationCenter, NSObjectProtocol)] = []
    private var refreshTimer: Timer?
    private var deadline: Timer?
    private var uiGeneration = 0
    private var enabled = false
    private var preset = "right-option"
    private var restoreWake = false
    private var suspended = false
    private var locked = false
    private var target: DictationPasteTarget?
    private var copyText: String?
    private var notice: String?
    private var keyFailure: String?
    private(set) var requestID: String?
    private(set) var phase = Phase.idle

    init(host: DictationControllerHost, recorder: DictationCapturing? = nil, hotkey: DictationKeyListening? = nil,
         writer: DictationWriting? = nil, panel: DictationPanelViewing? = nil,
         permissions: (() -> DictationPermissionState)? = nil,
         requestMicrophone: ((@escaping (Bool) -> Void) -> Void)? = nil, observeSystem: Bool = true) {
        self.host = host; self.recorder = recorder ?? DictationRecorder(); self.hotkey = hotkey ?? DictationHotkey()
        self.writer = writer ?? DictationPaste(); self.panel = panel ?? DictationPanel()
        self.permissions = permissions ?? {
            DictationPermissionState(microphone: AVCaptureDevice.authorizationStatus(for: .audio),
                input: CGPreflightListenEventAccess(), accessibility: AXIsProcessTrusted())
        }
        self.requestMicrophone = requestMicrophone ?? { completion in AVCaptureDevice.requestAccess(for: .audio, completionHandler: completion) }
        self.observeSystem = observeSystem
        super.init()
        self.hotkey.onToggle = { [weak self] in self?.toggle() }
        self.hotkey.onCancel = { [weak self] in self?.cancel() }
        self.hotkey.isActive = { [weak self] in self?.requestID != nil || self?.copyText != nil }
        self.hotkey.onFailure = { [weak self] message in self?.keyFailure = message }
        self.panel.onCancel = { [weak self] in self?.cancel() }
        self.panel.onCopy = { [weak self] in self?.copyResult() }
        self.panel.onFinish = { [weak self] in self?.finishRecording() }
        self.recorder.onLevel = { [weak self] level, elapsed in
            guard let self, self.phase == .recording else { return }
            self.panel.updateLevel(level, elapsed: elapsed)
        }
        self.recorder.onLimit = { [weak self] in self?.finishRecording() }
        self.recorder.onError = { [weak self] message in self?.fail(message) }
        if observeSystem { installObservers() }
    }

    func configure(_ settings: [String: Any]) {
        let next = settings["dictationEnabled"] as? Bool ?? false
        let key = settings["dictationHotkey"] as? String ?? "right-option"
        if enabled != next || preset != key { cancel() }
        enabled = next; preset = key
        refreshTimer?.invalidate(); refreshTimer = nil
        if enabled && observeSystem {
            refreshTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.refreshStatus() }
        }
        refreshStatus()
    }

    func refreshStatus() {
        let access = permissions()
        if requestID != nil && (!access.input || !access.accessibility || !enabled || suspended || locked) { cancel() }
        keyFailure = nil
        _ = hotkey.configure(enabled: enabled && access.input && access.accessibility && !suspended && !locked, preset: preset)
        host?.reportDictationStatus(["type": "dictationStatus", "enabled": enabled, "hotkey": preset,
            "monitoring": hotkey.running, "inputMonitoring": access.input, "accessibility": access.accessibility,
            "microphone": access.microphone == .authorized, "busy": requestID != nil,
            "suspended": suspended || locked, "detail": keyFailure ?? ""])
    }

    // This is called only from explicit settings buttons; it requests permission,
    // never grants it or changes the system's decision on behalf of the user.
    func requestPermission(_ kind: String) {
        switch kind {
        case "input":
            _ = CGRequestListenEventAccess()
            openSettings("Privacy_ListenEvent")
        case "accessibility":
            _ = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
            openSettings("Privacy_Accessibility")
        case "microphone":
            if [.denied, .restricted].contains(permissions().microphone) { openSettings("Privacy_Microphone") }
            else { requestMicrophone { [weak self] _ in DispatchQueue.main.async { self?.refreshStatus() } } }
        default: break
        }
        refreshStatus()
    }

    private func openSettings(_ pane: String) {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?" + pane) { NSWorkspace.shared.open(url) }
    }

    // Safe to open from settings: does not capture that settings field as a paste target,
    // enable listening, request permissions, or invent a recording preview.
    func presentPanel() {
        refreshStatus()
        guard requestID == nil, copyText == nil else { return }
        uiGeneration += 1
        guard enabled else {
            show("听写未开启 · 未录音", "在设置勾选全局语音输入并保存，再切到输入框按所选快捷键。"); return
        }
        let access = permissions()
        guard access.input && access.accessibility && access.microphone == .authorized else {
            show("等待授权 · 未录音", "请完成设置中的三项权限。输入监控没有 MOSS 时，点＋添加当前应用。"); return
        }
        show("听写已就绪 · 未录音", "切到需要输入的文本框，单独按所选快捷键开始；再按结束，Esc 取消。")
    }

    func toggle() {
        guard enabled else { presentPanel(); return }
        guard !suspended, !locked else { return }
        if phase == .recording { finishRecording(); return }
        if phase == .preparing { cancel(); return }
        guard requestID == nil else { return }
        guard let host, !host.dictationAssistantBusy else {
            show("请稍后输入", "助理正在识别、回复或播报，完成后再按快捷键"); return
        }
        let access = permissions()
        guard access.input && access.accessibility else {
            show("需要系统权限", "请在MOSS 设置中检查输入监控与辅助功能权限"); return
        }
        guard access.microphone == .authorized || access.microphone == .notDetermined else {
            show("需要麦克风权限", "请在系统设置中允许MOSS访问麦克风"); return
        }
        uiGeneration += 1; copyText = nil; notice = nil
        target = writer.capture()
        restoreWake = host.pauseAssistantForDictation()
        let id = UUID().uuidString
        requestID = id; phase = .preparing
        show("准备语音输入", "正在准备本地模型 · 再按快捷键或 Esc 取消")
        armDeadline(90)
        let prepare: (Bool) -> Void = { [weak self] allowed in
            guard let self, self.requestID == id else { return }
            if allowed { self.host?.sendDictation(["type": "dictationPrepare", "id": id]) }
            else { self.fail("macOS 未允许麦克风访问") }
        }
        if access.microphone == .authorized { prepare(true) }
        else { requestMicrophone { allowed in DispatchQueue.main.async { prepare(allowed) } } }
        refreshStatus()
    }

    @discardableResult func handle(_ event: [String: Any]) -> Bool {
        guard let type = event["type"] as? String, type.hasPrefix("dictation") else { return false }
        guard let id = event["id"] as? String, id == requestID else { return true }
        switch type {
        case "dictationReady":
            guard phase == .preparing else { return true }
            do {
                try recorder.begin(); phase = .recording
                show("正在语音输入", "再按快捷键结束 · Esc 取消", elapsed: 0)
                armDeadline(130)
            } catch { fail("麦克风启动失败，请检查输入设备") }
        case "dictationState":
            switch event["name"] as? String {
            case "cancelled": cancel()
            case "transcribing": if phase == .processing { show("本地识别中", "录音已结束 · Esc 可取消") }
            case "polishing": if phase == .processing { show("正在校对口述", "使用本轮识别文字 · Esc 可取消") }
            default: break
            }
        case "dictationNotice": notice = event["message"] as? String
        case "dictationError": fail(event["message"] as? String ?? "语音输入未完成")
        case "dictationResult":
            guard phase == .processing, let text = event["text"] as? String, !text.isEmpty, text.count <= 16000,
                  let target else { fail("听写结果状态无效"); return true }
            phase = .inserting; armDeadline(3)
            show("准备写入文字", notice ?? "只写入当前输入框，不自动发送")
            writer.insert(text, target: target, isCurrent: { [weak self] in self?.requestID == id && self?.phase == .inserting }) { [weak self] posted, detail in
                guard let self, self.requestID == id else { return }
                let info = self.notice
                self.endSession(sendCancel: false)
                if posted {
                    self.show("已发出粘贴", info.map { detail + " · " + $0 } ?? detail)
                    self.hideLater()
                } else {
                    self.copyText = text
                    self.show("文字已识别 · 点击复制", detail + "\n" + String(text.prefix(500)), canCopy: true)
                }
                self.refreshStatus()
            }
        default: break
        }
        return true
    }

    private func finishRecording() {
        guard phase == .recording, let id = requestID else { return }
        let recording = recorder.finish()
        guard recording.voiced, !recording.chunks.isEmpty, recording.chunks.count <= 8 else {
            fail("未听到有效口述，请重新按键说话"); return
        }
        phase = .processing; armDeadline(120)
        show("本地识别中", recording.capped ? "已到 120 秒上限，正在处理已有录音" : "录音已结束 · Esc 可取消")
        for (index, chunk) in recording.chunks.enumerated() {
            host?.sendDictation(["type": "dictationChunk", "id": id, "index": index, "audio": chunk.base64EncodedString()])
        }
        host?.sendDictation(["type": "dictationFinish", "id": id, "count": recording.chunks.count])
    }

    private func armDeadline(_ seconds: TimeInterval) {
        deadline?.invalidate()
        guard observeSystem else { return }
        deadline = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            guard let self, self.requestID != nil else { return }
            if self.phase == .recording { self.finishRecording() }
            else { self.fail("本轮处理超时，已取消；没有自动重试") }
        }
    }

    private func endSession(sendCancel: Bool) {
        let old = requestID
        requestID = nil; phase = .idle; uiGeneration += 1
        deadline?.invalidate(); deadline = nil
        recorder.cancel(); writer.cancel()
        if let old, sendCancel { host?.sendDictation(["type": "dictationCancel", "id": old]) }
        if old != nil { host?.resumeAssistantAfterDictation(restoreWake) }
        restoreWake = false; target = nil; notice = nil; copyText = nil
    }

    func cancel() {
        endSession(sendCancel: true)
        panel.hide()
    }

    private func fail(_ message: String) {
        endSession(sendCancel: true)
        show("语音输入未完成", message)
        hideLater()
    }

    private func copyResult() {
        guard let text = copyText else { return }
        NSPasteboard.general.clearContents(); NSPasteboard.general.setString(text, forType: .string)
        copyText = nil; panel.hide()
    }

    private func show(_ title: String, _ detail: String, elapsed: Double? = nil, canCopy: Bool = false) {
        panel.show(title: title, detail: detail, elapsed: elapsed, level: 0, canCopy: canCopy)
    }

    private func hideLater() {
        guard observeSystem else { return }
        let token = uiGeneration
        Timer.scheduledTimer(withTimeInterval: 2.5, repeats: false) { [weak self] _ in
            guard let self, self.uiGeneration == token, self.requestID == nil, self.copyText == nil else { return }
            self.panel.hide()
        }
    }

    private func installObservers() {
        let workspace = NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.willSleepNotification, NSWorkspace.sessionDidResignActiveNotification, NSWorkspace.screensDidSleepNotification] {
            observers.append((workspace, workspace.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.suspended = true; self?.cancel(); self?.refreshStatus()
            }))
        }
        for name in [NSWorkspace.didWakeNotification, NSWorkspace.sessionDidBecomeActiveNotification, NSWorkspace.screensDidWakeNotification] {
            observers.append((workspace, workspace.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.suspended = false; self?.refreshStatus()
            }))
        }
        let distributed = DistributedNotificationCenter.default()
        for (name, value) in [("com.apple.screenIsLocked", true), ("com.apple.screenIsUnlocked", false)] {
            observers.append((distributed, distributed.addObserver(forName: Notification.Name(name), object: nil, queue: .main) { [weak self] _ in
                self?.locked = value
                if value { self?.cancel() }
                self?.refreshStatus()
            }))
        }
        let center = NotificationCenter.default
        observers.append((center, center.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.refreshStatus()
        }))
        observers.append((center, center.addObserver(forName: .AVAudioEngineConfigurationChange, object: nil, queue: .main) { [weak self] event in
            guard let self, self.requestID != nil, self.recorder.owns(event.object) else { return }
            self.fail("声音输入设备发生变化，已取消本轮口述")
        }))
    }

    func shutdown() {
        enabled = false
        refreshTimer?.invalidate(); refreshTimer = nil
        cancel(); hotkey.stop()
        for (center, observer) in observers { center.removeObserver(observer) }
        observers.removeAll()
    }

    deinit {
        refreshTimer?.invalidate(); deadline?.invalidate(); hotkey.stop()
        for (center, observer) in observers { center.removeObserver(observer) }
    }
}

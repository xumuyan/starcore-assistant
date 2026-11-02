import AppKit

// Presentation only: the shared bridge remains the owner of history and task data.
struct MossPetState {
    private(set) var available = false
    private(set) var runningCount = 0
    private(set) var status = "状态未知"
    private(set) var newlyEndedCount = 0
    private var runningIDs = Set<String>()

    mutating func update(_ snapshot: [String: Any]) {
        newlyEndedCount = 0
        guard snapshot["available"] as? Bool == true else {
            available = false; runningCount = 0; runningIDs.removeAll(); status = "状态未知"; return
        }
        let tasks = snapshot["tasks"] as? [[String: Any]] ?? []
        let active = Set(tasks.filter { $0["status"] as? String == "running" }.compactMap { $0["id"] as? String })
        let ended = tasks.filter {
            guard let id = $0["id"] as? String, runningIDs.contains(id) else { return false }
            return ["completed", "failed", "error", "interrupted", "cancelled"].contains($0["status"] as? String ?? "")
        }
        available = true; runningCount = active.count; runningIDs = active; newlyEndedCount = ended.count
        if ended.contains(where: { ["failed", "error", "interrupted"].contains($0["status"] as? String ?? "") }) { status = "异常" }
        else if ended.contains(where: { $0["status"] as? String == "cancelled" }) { status = "已取消" }
        else if !ended.isEmpty { status = "本轮结束" }
        else if runningCount > 0 { status = "\(runningCount) 项运行中" }
        else if tasks.contains(where: { $0["status"] as? String == "unknown" }) { status = "状态未确认" }
        else if status != "本轮结束" && status != "异常" { status = "暂无运行任务" }
    }
}

private final class MossPetPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

private final class MossRobotView: NSView {
    override func draw(_ dirtyRect: NSRect) {
        let body = NSBezierPath(roundedRect: bounds.insetBy(dx: 12, dy: 9), xRadius: 13, yRadius: 13)
        NSColor(white: 0.87, alpha: 0.98).setFill(); body.fill()
        NSColor(white: 0.17, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: 21, y: 23, width: 62, height: 29), xRadius: 8, yRadius: 8).fill()
        for (x, color) in [(CGFloat(36), NSColor.systemCyan), (CGFloat(67), NSColor.systemRed)] {
            color.setFill(); NSBezierPath(ovalIn: NSRect(x: x - 7, y: 30, width: 14, height: 14)).fill()
            NSColor.white.withAlphaComponent(0.8).setFill(); NSBezierPath(ovalIn: NSRect(x: x - 3, y: 38, width: 3, height: 3)).fill()
        }
        NSColor.darkGray.setFill(); NSBezierPath(roundedRect: NSRect(x: 43, y: 16, width: 18, height: 3), xRadius: 1.5, yRadius: 1.5).fill()
    }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
}

final class MossPet: NSObject {
    var onSend: ((String) -> Void)?
    var onExpand: (() -> Void)?
    var onTaskNotice: ((String) -> Void)?
    var onListen: (() -> Void)?
    private(set) var state = MossPetState()
    private(set) var enabled = false
    private(set) var petPanel: NSPanel?
    private(set) var chatPanel: NSPanel?
    private var target = "未选择目标聊天"
    private var messages: [(String, String)] = []
    private var activity = ""
    private var statusLabel: NSTextField?
    private var targetLabel: NSTextField?
    private var activityLabel: NSTextField?
    private var transcript: NSTextView?
    private var input: NSTextField?

    func configure(enabled: Bool) {
        self.enabled = enabled
        if enabled { createPetIfNeeded(); petPanel?.orderFrontRegardless() }
        else { hide() }
    }
    func updateTasks(_ snapshot: [String: Any]) { state.update(snapshot); statusLabel?.stringValue = state.status; if state.newlyEndedCount > 0 { onTaskNotice?("Codex 有 \(state.newlyEndedCount) 个回合结束，请查看结果；不代表代码或测试已通过") } }
    func updateTarget(_ title: String) { target = title.isEmpty ? "未选择目标聊天" : title; targetLabel?.stringValue = "目标：\(target)" }
    func receive(_ event: [String: Any]) {
        switch event["type"] as? String {
        case "history":
            messages = (event["messages"] as? [[String: Any]] ?? []).compactMap { row in
                guard let content = row["content"] as? String else { return nil }
                return (row["role"] as? String ?? "assistant", content)
            }
        case "message":
            if let content = event["content"] as? String { messages.append((event["role"] as? String ?? "assistant", content)) }
        case "state": activity = event["detail"] as? String ?? event["name"] as? String ?? ""
        case "error", "notice": activity = event["message"] as? String ?? ""
        default: return
        }
        // A bounded, ephemeral projection, never a second history store.
        messages = Array(messages.suffix(200)); renderConversation()
    }
    func openChat() {
        guard enabled else { onExpand?(); return }
        createChatIfNeeded(); chatPanel?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true); chatPanel?.makeFirstResponder(input)
    }
    func hide() { petPanel?.orderOut(nil); chatPanel?.orderOut(nil) }
    func shutdown() { enabled = false; hide(); petPanel?.close(); chatPanel?.close(); petPanel = nil; chatPanel = nil; transcript = nil; input = nil; statusLabel = nil; targetLabel = nil; activityLabel = nil; messages.removeAll() }

    private func glass(_ size: NSSize) -> NSVisualEffectView {
        let view = NSVisualEffectView(frame: NSRect(origin: .zero, size: size))
        view.material = .hudWindow; view.blendingMode = .behindWindow; view.state = .active
        view.wantsLayer = true; view.layer?.cornerRadius = 18; view.layer?.masksToBounds = true
        return view
    }
    private func label(_ text: String, frame: NSRect, size: CGFloat = 12) -> NSTextField {
        let field = NSTextField(labelWithString: text); field.frame = frame; field.font = .systemFont(ofSize: size); field.lineBreakMode = .byTruncatingTail; return field
    }
    private func createPetIfNeeded() {
        guard petPanel == nil else { return }
        let panel = MossPetPanel(contentRect: NSRect(x: 0, y: 0, width: 136, height: 112), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.title = "MOSS 桌面宠物"; panel.setAccessibilityLabel("MOSS 桌面宠物")
        panel.isReleasedWhenClosed = false; panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = true
        panel.level = .floating; panel.hidesOnDeactivate = false; panel.isMovableByWindowBackground = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        let content = glass(panel.frame.size); panel.contentView = content
        let robot = MossRobotView(frame: NSRect(x: 16, y: 33, width: 104, height: 72)); content.addSubview(robot)
        let button = NSButton(frame: robot.frame); button.title = ""; button.isBordered = false; button.target = self; button.action = #selector(toggleChat); button.toolTip = "打开 MOSS 轻量聊天"; button.setAccessibilityLabel("打开 MOSS 轻量聊天"); content.addSubview(button)
        let status = label(state.status, frame: NSRect(x: 8, y: 11, width: 120, height: 20)); status.alignment = .center; content.addSubview(status); statusLabel = status
        if let screen = NSScreen.main { panel.setFrameOrigin(NSPoint(x: screen.visibleFrame.maxX - 158, y: screen.visibleFrame.minY + 44)) }
        petPanel = panel
    }
    @objc private func toggleChat() {
        guard enabled else { return }
        if chatPanel?.isVisible == true { chatPanel?.orderOut(nil); return }
        openChat()
    }
    private func createChatIfNeeded() {
        guard chatPanel == nil else { return }
        let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 400, height: 420), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        panel.title = "MOSS · 轻量聊天"; panel.isReleasedWhenClosed = false; panel.level = .floating
        let content = glass(NSSize(width: 400, height: 420)); panel.contentView = content
        let targetField = label("目标：\(target)", frame: NSRect(x: 16, y: 380, width: 278, height: 22)); targetField.toolTip = target; content.addSubview(targetField); targetLabel = targetField
        let expand = NSButton(title: "展开 ↗", target: self, action: #selector(expandChat)); expand.frame = NSRect(x: 305, y: 377, width: 80, height: 28); content.addSubview(expand)
        let scroll = NSScrollView(frame: NSRect(x: 16, y: 90, width: 368, height: 279)); scroll.hasVerticalScroller = true; scroll.drawsBackground = false
        let text = NSTextView(frame: scroll.bounds); text.isEditable = false; text.isSelectable = true; text.drawsBackground = false; text.font = .systemFont(ofSize: 13); text.textContainerInset = NSSize(width: 8, height: 8); text.isVerticallyResizable = true; text.autoresizingMask = [.width]; text.textContainer?.widthTracksTextView = true
        scroll.documentView = text; content.addSubview(scroll); transcript = text
        let activityField = label(activity, frame: NSRect(x: 16, y: 62, width: 368, height: 21)); content.addSubview(activityField); activityLabel = activityField
        let entry = NSTextField(frame: NSRect(x: 16, y: 19, width: 225, height: 30)); entry.placeholderString = "与 MOSS 聊天…"; entry.target = self; entry.action = #selector(sendText); content.addSubview(entry); input = entry
        let voice = NSButton(title: "语音", target: self, action: #selector(listen)); voice.frame = NSRect(x: 246, y: 18, width: 62, height: 32); content.addSubview(voice)
        let send = NSButton(title: "发送", target: self, action: #selector(sendText)); send.frame = NSRect(x: 313, y: 18, width: 71, height: 32); content.addSubview(send)
        if let pet = petPanel, let screen = pet.screen { panel.setFrameOrigin(NSPoint(x: max(screen.visibleFrame.minX, min(pet.frame.maxX - 400, screen.visibleFrame.maxX - 400)), y: max(screen.visibleFrame.minY, min(pet.frame.maxY + 12, screen.visibleFrame.maxY - 448)))) }
        chatPanel = panel; renderConversation()
    }
    private func renderConversation() {
        transcript?.string = messages.map { ($0.0 == "user" ? "你" : "MOSS") + "\n" + $0.1 }.joined(separator: "\n\n")
        if let text = transcript { text.scrollRangeToVisible(NSRange(location: (text.string as NSString).length, length: 0)) }
        activityLabel?.stringValue = activity
    }
    @objc private func sendText() {
        guard enabled, let field = input, let send = onSend else { return }
        let text = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }; field.stringValue = ""; send(text)
    }
    @objc private func listen() { guard enabled else { return }; onListen?() }
    @objc private func expandChat() { chatPanel?.orderOut(nil); onExpand?() }
}

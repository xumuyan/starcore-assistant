import AppKit
import ApplicationServices

enum DictationInputPolicy {
    static func editable(role: String, enabled: Bool, reported: Bool?, valueSettable: Bool, selectedTextSettable: Bool) -> Bool {
        enabled && reported != false && ["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField"].contains(role) &&
            (reported == true || valueSettable || selectedTextSettable)
    }

    static func permits(originalPID: Int32, currentPID: Int32, sameElement: Bool,
                        sameSelection: Bool, editable: Bool, secure: Bool,
                        terminal: Bool, currentRequest: Bool) -> Bool {
        originalPID == currentPID && sameElement && sameSelection && editable &&
            !secure && !terminal && currentRequest
    }

    static func isTerminal(bundleID: String, label: String) -> Bool {
        let identity = bundleID.lowercased()
        let terminalApps = ["com.apple.terminal", "dev.warp.", "com.googlecode.iterm2",
                            "org.alacritty", "net.kovidgoyal.kitty", "com.github.wez",
                            "com.mitchellh.ghostty"]
        return terminalApps.contains(where: identity.hasPrefix) ||
            ["terminal", "xterm", "终端"].contains(where: label.lowercased().contains)
    }
}

// Each transaction owns a snapshot only until its delayed restoration finishes.
// A new user/clipboard-manager write wins over restoring an old snapshot.
final class DictationClipboardTransaction {
    static let transientType = NSPasteboard.PasteboardType("org.nspasteboard.TransientType")
    private let board: NSPasteboard
    private let saved: [[(NSPasteboard.PasteboardType, Data)]]
    private var writtenCount: Int?

    init(board: NSPasteboard = .general) {
        self.board = board
        saved = (board.pasteboardItems ?? []).map { item in
            item.types.compactMap { type in item.data(forType: type).map { (type, $0) } }
        }
    }

    func write(_ text: String) -> Bool {
        guard writtenCount == nil else { return false }
        let item = NSPasteboardItem()
        item.setString(text, forType: .string)
        item.setData(Data(), forType: Self.transientType)
        board.clearContents()
        let success = board.writeObjects([item])
        writtenCount = board.changeCount
        return success
    }

    @discardableResult
    func restoreIfUnchanged() -> Bool {
        guard let count = writtenCount, board.changeCount == count else { return false }
        writtenCount = nil
        board.clearContents()
        let items = saved.map { entries -> NSPasteboardItem in
            let item = NSPasteboardItem()
            for (type, data) in entries { item.setData(data, forType: type) }
            return item
        }
        return items.isEmpty || board.writeObjects(items)
    }
}

struct DictationPasteTarget {
    let pid: pid_t
    let element: AXUIElement?
    let selection: CFRange?
    let reason: String?
}

final class DictationPaste {
    static let syntheticEventTag: Int64 = 0x5354415244494354
    private var inserting = false
    private var generation = 0
    private var transaction: DictationClipboardTransaction?
    private let board: () -> NSPasteboard
    private let checkTarget: ((DictationPasteTarget) -> Bool)?
    private let modifiersReleased: () -> Bool
    private let postPaste: () -> Bool
    private let schedule: (@escaping () -> Void) -> Void

    init(board: @escaping () -> NSPasteboard = { .general },
         checkTarget: ((DictationPasteTarget) -> Bool)? = nil,
         modifiersReleased: (() -> Bool)? = nil, postPaste: (() -> Bool)? = nil,
         schedule: ((@escaping () -> Void) -> Void)? = nil) {
        self.board = board; self.checkTarget = checkTarget
        self.modifiersReleased = modifiersReleased ?? {
            CGEventSource.flagsState(.combinedSessionState).intersection([.maskCommand, .maskControl, .maskAlternate, .maskShift, .maskSecondaryFn]).isEmpty
        }
        self.postPaste = postPaste ?? Self.postCommandPaste
        self.schedule = schedule ?? { action in DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: action) }
    }

    func cancel() {
        generation += 1
        transaction?.restoreIfUnchanged(); transaction = nil
        inserting = false
    }

    private static func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
        return value
    }

    private static func focused(_ pid: pid_t) -> AXUIElement? {
        let app = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(app, 0.2)
        guard let value = attribute(app, kAXFocusedUIElementAttribute),
              CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
        return (value as! AXUIElement)
    }

    private static func selection(_ element: AXUIElement) -> CFRange? {
        guard let value = attribute(element, kAXSelectedTextRangeAttribute),
              CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
        let ax = value as! AXValue
        var range = CFRange()
        guard AXValueGetType(ax) == .cfRange, AXValueGetValue(ax, .cfRange, &range) else { return nil }
        return range
    }

    private static func editable(_ element: AXUIElement) -> Bool {
        let role = attribute(element, kAXRoleAttribute) as? String ?? ""
        let enabled = (attribute(element, kAXEnabledAttribute) as? NSNumber)?.boolValue ?? true
        let reported = (attribute(element, "AXEditable") as? NSNumber)?.boolValue
        var valueSettable = DarwinBoolean(false), selectedTextSettable = DarwinBoolean(false)
        AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &valueSettable)
        AXUIElementIsAttributeSettable(element, kAXSelectedTextAttribute as CFString, &selectedTextSettable)
        return DictationInputPolicy.editable(role: role, enabled: enabled, reported: reported,
            valueSettable: valueSettable.boolValue, selectedTextSettable: selectedTextSettable.boolValue)
    }

    private static func secure(_ element: AXUIElement) -> Bool {
        (attribute(element, kAXSubroleAttribute) as? String) == "AXSecureTextField"
    }

    private static func terminal(_ app: NSRunningApplication, _ element: AXUIElement) -> Bool {
        if DictationInputPolicy.isTerminal(bundleID: app.bundleIdentifier ?? "", label: app.localizedName ?? "") { return true }
        var node: AXUIElement? = element
        for _ in 0..<5 {
            guard let current = node else { break }
            let label = [kAXDescriptionAttribute, "AXIdentifier"].compactMap { attribute(current, $0) as? String }.joined(separator: " ")
            if DictationInputPolicy.isTerminal(bundleID: "", label: label) { return true }
            guard let parent = attribute(current, kAXParentAttribute), CFGetTypeID(parent) == AXUIElementGetTypeID() else { break }
            node = (parent as! AXUIElement)
        }
        return false
    }

    func capture() -> DictationPasteTarget {
        guard let app = NSWorkspace.shared.frontmostApplication else {
            return DictationPasteTarget(pid: 0, element: nil, selection: nil, reason: "无法确认当前应用，结束后可手动复制")
        }
        guard AXIsProcessTrusted(), let element = Self.focused(app.processIdentifier) else {
            return DictationPasteTarget(pid: app.processIdentifier, element: nil, selection: nil, reason: "无法读取当前输入框，结束后可手动复制")
        }
        let range = Self.selection(element)
        let reason: String?
        if Self.secure(element) { reason = "密码框仅提供手动复制" }
        else if Self.terminal(app, element) { reason = "终端输入仅提供手动复制" }
        else if !Self.editable(element) { reason = "当前焦点不是可编辑输入框" }
        else if range == nil { reason = "此输入框无法确认光标位置，结束后可手动复制" }
        else { reason = nil }
        return DictationPasteTarget(pid: app.processIdentifier, element: element, selection: range, reason: reason)
    }

    private func targetStillMatches(_ target: DictationPasteTarget) -> Bool {
        if let checkTarget { return checkTarget(target) }
        guard target.reason == nil, AXIsProcessTrusted(), let app = NSWorkspace.shared.frontmostApplication,
              let original = target.element, let current = Self.focused(app.processIdentifier),
              let before = target.selection, let now = Self.selection(current) else { return false }
        return DictationInputPolicy.permits(originalPID: target.pid, currentPID: app.processIdentifier,
            sameElement: CFEqual(original, current), sameSelection: before.location == now.location && before.length == now.length,
            editable: Self.editable(current), secure: Self.secure(current), terminal: Self.terminal(app, current), currentRequest: true)
    }

    func insert(_ text: String, target: DictationPasteTarget, isCurrent: @escaping () -> Bool,
                completion: @escaping (_ posted: Bool, _ detail: String) -> Void) {
        guard !inserting else { completion(false, "上一轮粘贴尚未结束，可手动复制"); return }
        guard !text.isEmpty, text.count <= 16000 else { completion(false, "识别结果长度无效"); return }
        inserting = true
        generation += 1
        let token = generation
        awaitRelease(text, target: target, isCurrent: { [weak self] in self?.generation == token && isCurrent() },
                     attempt: 0, completion: { [weak self] posted, detail in
            guard self?.generation == token else { return }
            self?.inserting = false; self?.transaction = nil
            completion(posted, detail)
        })
    }

    private func awaitRelease(_ text: String, target: DictationPasteTarget, isCurrent: @escaping () -> Bool,
                              attempt: Int, completion: @escaping (Bool, String) -> Void) {
        guard isCurrent() else { completion(false, "本轮已取消"); return }
        guard targetStillMatches(target) else {
            inserting = false; completion(false, target.reason ?? "输入焦点已变化，结果保留供手动复制"); return
        }
        if !modifiersReleased() {
            guard attempt < 20 else { inserting = false; completion(false, "触发键仍未释放，可手动复制"); return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
                self?.awaitRelease(text, target: target, isCurrent: isCurrent, attempt: attempt + 1, completion: completion)
            }
            return
        }
        // Recheck immediately before touching the clipboard or posting a key.
        guard isCurrent(), targetStillMatches(target) else {
            inserting = false; completion(false, "输入状态无法确认，可手动复制"); return
        }
        let clipboard = DictationClipboardTransaction(board: board())
        transaction = clipboard
        guard clipboard.write(text) else {
            clipboard.restoreIfUnchanged(); inserting = false; completion(false, "临时剪贴板写入失败，可手动复制"); return
        }
        guard isCurrent(), targetStillMatches(target) else {
            clipboard.restoreIfUnchanged(); inserting = false; completion(false, "输入焦点已变化，结果保留供手动复制"); return
        }
        guard postPaste() else {
            clipboard.restoreIfUnchanged(); inserting = false; completion(false, "无法发出粘贴，可手动复制"); return
        }
        schedule { [weak self] in
            clipboard.restoreIfUnchanged()
            if isCurrent() { completion(true, "已发出粘贴 · 未自动发送") }
            else if self?.transaction === clipboard { self?.transaction = nil; self?.inserting = false }
        }
    }

    private static func postCommandPaste() -> Bool {
        guard let source = CGEventSource(stateID: .combinedSessionState),
              let down = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: true),
              let up = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: false) else { return false }
        down.flags = .maskCommand; up.flags = .maskCommand
        down.setIntegerValueField(.eventSourceUserData, value: Self.syntheticEventTag)
        up.setIntegerValueField(.eventSourceUserData, value: Self.syntheticEventTag)
        down.post(tap: .cghidEventTap); up.post(tap: .cghidEventTap)
        return true
    }
}

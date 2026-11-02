import AppKit
import CoreGraphics

@main struct DictationPanelFixture {
    static func require(_ condition: @autoclosure () -> Bool, _ message: String) {
        if !condition() { fatalError(message) }
    }
    static func main() {
        require(DictationPanelMetrics.elapsedText(nil) == "", "no invented duration")
        require(DictationPanelMetrics.elapsedText(65.8) == "01:05", "elapsed clock")
        require(DictationPanelMetrics.elapsedText(-1) == "00:00", "negative time")
        require(DictationPanelMetrics.elapsedText(.nan) == "", "invalid time")
        require(DictationPanelMetrics.elapsedText(.infinity) == "", "infinite time")
        require(DictationPanelMetrics.normalizedLevel(-1) == 0, "negative level")
        require(DictationPanelMetrics.normalizedLevel(2) == 1, "bounded level")
        require(DictationPanelMetrics.normalizedLevel(.nan) == 0, "invalid level")
        require(DictationPanelMetrics.normalizedLevel(0.4) == 0.4, "real level retained")
        let screen = NSRect(x: -1440, y: 200, width: 1440, height: 900)
        let frame = DictationPanelMetrics.frame(in: screen)
        require(screen.contains(frame), "panel fits secondary screen")
        require(frame.width == 208 && frame.height == 78, "recording is a small capsule")
        let expanded = DictationPanelMetrics.frame(in: screen, expanded: true)
        require(expanded.width == 340 && expanded.height == 176 && screen.contains(expanded), "only copy fallback expands")
        require(frame.midX == screen.midX && frame.minY == screen.minY + 48, "bottom centered in screen coordinates")
        let narrow = NSRect(x: 20, y: -800, width: 300, height: 600)
        require(narrow.contains(DictationPanelMetrics.frame(in: narrow)), "narrow visible frame fits")
        print("DICTATION_PANEL_PURE_OK")
        guard CGSessionCopyCurrentDictionary() != nil else {
            print("DICTATION_PANEL_WINDOWSERVER_UNAVAILABLE")
            return
        }
        _ = NSApplication.shared
        let panel = DictationPanel()
        let window = NSApp.windows.first { $0.title == "MOSS 语音输入" }!
        require(!panel.visible && !window.isVisible, "constructor stays hidden")
        require(!window.canBecomeKey && !window.canBecomeMain, "never takes focus")
        require(window.styleMask.contains(.nonactivatingPanel) && !window.styleMask.contains(.titled), "nonactivating borderless style")
        require(window.level == .floating && !window.hidesOnDeactivate, "floating across app switches")
        require(window.collectionBehavior.contains([.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]), "space behavior")
        let content = window.contentView as! DictationPanelContent
        require(content.copyButton.isHidden && content.finishButton.isHidden, "actions initially unavailable")
        require(content.meter.samples.allSatisfy { $0 == 0 }, "no simulated wave")
        require(content.cancelButton.accessibilityLabel() == "取消本次语音输入", "cancel accessibility")
        require(content.copyButton.accessibilityLabel() == "复制识别结果", "copy accessibility")
        require(content.finishButton.accessibilityLabel() == "结束听写并识别", "finish accessibility")
        // Populate only the hidden content view; never call show/orderFront or send UI input.
        content.apply(title: "正在语音输入", detail: "fixture text", elapsed: 4, level: 0.5, canCopy: false)
        require(content.copyButton.isHidden && content.detailLabel.stringValue == "fixture text", "recording does not offer copy")
        require(!content.finishButton.isHidden && !content.meter.isHidden && content.titleLabel.isHidden, "recording shows wave and finish, not large status card")
        content.layoutSubtreeIfNeeded()
        require(content.finishButton.frame.size == NSSize(width: 30, height: 30), "compact circular controls")
        panel.updateLevel(0.3, elapsed: 8)
        require(content.meter.samples.suffix(2) == [Float(0.5), Float(0.3)], "wave history uses actual supplied levels")
        require(content.timeLabel.stringValue == "00:08" && content.meter.doubleValue == Double(Float(0.3)), "live values")
        content.apply(title: "文字已识别", detail: "fixture result", elapsed: nil, level: 0, canCopy: true)
        require(!content.copyButton.isHidden && content.finishButton.isHidden && content.meter.isHidden, "copy result never offers recording completion")
        content.apply(title: "准备语音输入", detail: "本地模型准备中", elapsed: nil, level: 0, canCopy: false)
        require(content.meter.isHidden && !content.titleLabel.isHidden && content.finishButton.isHidden, "preparation is visible without pretending to record")
        panel.hide()
        require(!panel.visible && !window.isVisible, "hide stays hidden")
        require(content.titleLabel.stringValue.isEmpty && content.detailLabel.stringValue.isEmpty && content.timeLabel.stringValue.isEmpty, "hide clears every label")
        require(content.meter.doubleValue == 0 && content.copyButton.isHidden, "hide clears level and copy")
        require(content.finishButton.isHidden && content.meter.samples.allSatisfy { $0 == 0 }, "hide resets wave and finish")
        print("DICTATION_PANEL_INERT_OK")
    }
}

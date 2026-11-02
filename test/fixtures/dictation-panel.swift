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
        require(content.copyButton.isHidden, "copy initially unavailable")
        require(content.cancelButton.accessibilityLabel() == "取消本次语音输入", "cancel accessibility")
        require(content.copyButton.accessibilityLabel() == "复制识别结果", "copy accessibility")
        // Populate only the hidden content view; never call show/orderFront or send UI input.
        content.apply(title: "识别完成", detail: "fixture text", elapsed: 4, level: 0.5, canCopy: true)
        require(!content.copyButton.isHidden && content.detailLabel.stringValue == "fixture text", "caller controls content and copy")
        panel.updateLevel(0.3, elapsed: 8)
        require(content.timeLabel.stringValue == "00:08" && content.meter.doubleValue == Double(Float(0.3)), "live values")
        panel.hide()
        require(!panel.visible && !window.isVisible, "hide stays hidden")
        require(content.titleLabel.stringValue.isEmpty && content.detailLabel.stringValue.isEmpty && content.timeLabel.stringValue.isEmpty, "hide clears every label")
        require(content.meter.doubleValue == 0 && content.copyButton.isHidden, "hide clears level and copy")
        print("DICTATION_PANEL_INERT_OK")
    }
}

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
        require(frame.width == 232 && frame.height == 68, "recording matches selected compact glass tile")
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
        let window = NSApp.windows.first { $0.title == "沐言 语音输入" }!
        require(!panel.visible && !window.isVisible, "constructor stays hidden")
        require(!window.canBecomeKey && !window.canBecomeMain, "never takes focus")
        require(window.styleMask.contains(.nonactivatingPanel) && !window.styleMask.contains(.titled), "nonactivating borderless style")
        require(window.level == .floating && !window.hidesOnDeactivate, "floating across app switches")
        require(window.collectionBehavior.contains([.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]), "space behavior")
        let content = window.contentView as! DictationPanelContent
        var cancelled = 0, finished = 0, copied = 0
        panel.onCancel = { cancelled += 1 }
        panel.onFinish = { finished += 1 }
        panel.onCopy = { copied += 1 }
        require(content.copyButton.isHidden && content.finishButton.isHidden, "actions initially unavailable")
        require(content.meter.samples.allSatisfy { $0 == 0 }, "no simulated wave")
        require(content.cancelButton.accessibilityLabel() == "取消本次语音输入", "cancel accessibility")
        require(content.copyButton.accessibilityLabel() == "复制识别结果", "copy accessibility")
        require(content.finishButton.accessibilityLabel() == "结束听写并识别", "finish accessibility")
        // Populate only the hidden content view; never call show/orderFront or send UI input.
        content.apply(title: "正在语音输入", detail: "fixture text", elapsed: 4, level: 0.5, canCopy: false)
        require(content.copyButton.isHidden && content.detailLabel.stringValue == "fixture text", "recording does not offer copy")
        require(!content.finishButton.isHidden && !content.meter.isHidden && !content.timeLabel.isHidden && content.detailLabel.isHidden, "recording uses two rows without separate hint bubble")
        content.layoutSubtreeIfNeeded()
        require(content.finishButton.frame.size == NSSize(width: 46, height: 24), "compact text completion button")
        require(content.titleLabel.stringValue == "正在聆听" && content.finishButton.title == "完成", "selected design copy")
        require(content.cancelButton.image != nil && content.cancelButton.title.isEmpty, "cancel uses native SF Symbol, not text artwork")
        require(content.titleLabel.frame.minY > content.meter.frame.maxY && content.cancelButton.frame.minY > content.finishButton.frame.maxY, "status and actions align in two rows")
        require(content.appearance?.name == .aqua && content.meter.samples.count == 24, "light material and restrained waveform density")
        NSApp.sendAction(content.finishButton.action!, to: content.finishButton.target, from: content.finishButton)
        require(finished == 1, "completion button reaches the existing callback")
        panel.updateLevel(0.3, elapsed: 8)
        require(content.meter.samples.suffix(2) == [Float(0.5), Float(0.3)], "wave history uses actual supplied levels")
        require(content.timeLabel.stringValue == "00:08" && content.meter.doubleValue == Double(Float(0.3)), "live values")
        content.apply(title: "文字已识别", detail: "fixture result", elapsed: nil, level: 0, canCopy: true)
        require(!content.copyButton.isHidden && content.finishButton.isHidden && content.meter.isHidden && content.timeLabel.isHidden && !content.detailLabel.isHidden, "copy result never offers recording completion")
        NSApp.sendAction(content.copyButton.action!, to: content.copyButton.target, from: content.copyButton)
        require(copied == 1, "copy callback remains available only for a result")
        content.apply(title: "准备语音输入", detail: "本地模型准备中", elapsed: nil, level: 0, canCopy: false)
        NSApp.sendAction(content.finishButton.action!, to: content.finishButton.target, from: content.finishButton)
        require(finished == 1, "preparation cannot finish a recording")
        NSApp.sendAction(content.cancelButton.action!, to: content.cancelButton.target, from: content.cancelButton)
        require(cancelled == 1, "native close symbol reaches cancel callback")
        require(content.meter.isHidden && !content.titleLabel.isHidden && content.finishButton.isHidden, "preparation is visible without pretending to record")
        panel.hide()
        require(!panel.visible && !window.isVisible, "hide stays hidden")
        require(content.titleLabel.stringValue.isEmpty && content.detailLabel.stringValue.isEmpty && content.timeLabel.stringValue.isEmpty, "hide clears every label")
        require(content.meter.doubleValue == 0 && content.copyButton.isHidden, "hide clears level and copy")
        require(content.finishButton.isHidden && content.meter.samples.allSatisfy { $0 == 0 }, "hide resets wave and finish")
        print("DICTATION_PANEL_INERT_OK")
    }
}

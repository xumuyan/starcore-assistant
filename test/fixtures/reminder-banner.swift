import AppKit

@main struct ReminderBannerFixture {
    static func require(_ condition: @autoclosure () -> Bool, _ message: String) {
        if !condition() { fatalError(message) }
    }
    static func main() {
        require(ReminderBannerMetrics.bannerWidth == 320 && ReminderBannerMetrics.bannerHeight == 64, "banner size")
        let screen = NSRect(x: 0, y: 0, width: 1440, height: 900)
        let frame = ReminderBannerMetrics.frame(in: screen)
        require(screen.contains(frame), "banner fits the screen")
        require(frame.width == 320 && frame.height == 64, "banner keeps its size")
        require(frame.midX == screen.midX, "horizontally centered")
        require(frame.maxY == screen.maxY - ReminderBannerMetrics.topMargin, "pinned to the top edge")
        let secondary = NSRect(x: -2560, y: 120, width: 2560, height: 1440)
        require(secondary.contains(ReminderBannerMetrics.frame(in: secondary)), "banner fits a secondary screen")
        let tiny = NSRect(x: 0, y: 0, width: 200, height: 80)
        require(tiny.contains(ReminderBannerMetrics.frame(in: tiny)), "tiny visible frame still fits")
        require(ReminderBannerMetrics.title(project: "电视盒子") == "电视盒子 · Codex 本轮已结束", "title names the project and turn end")
        require(ReminderBannerMetrics.title(project: "  ") == "未命名项目 · Codex 本轮已结束", "empty project falls back")
        require(ReminderBannerMetrics.noticeTitle == "MOSS 提醒", "generic notice title")
        require(ReminderBannerMetrics.summary("") == "回合结束不代表代码或测试已通过", "empty codex summary keeps the caveat")
        require(ReminderBannerMetrics.summary("已修复登录并补充测试") == "已修复登录并补充测试", "codex summary kept")
        require(ReminderBannerMetrics.summary(String(repeating: "字", count: 200)).count == 80, "codex summary bounded")
        require(ReminderBannerMetrics.clipped("") == "", "empty notice stays empty so the banner never shows")
        require(ReminderBannerMetrics.clipped("   ") == "", "whitespace notice stays empty")
        require(ReminderBannerMetrics.clipped("微信提醒未播报：助理正忙") == "微信提醒未播报：助理正忙", "notice kept")
        require(ReminderBannerMetrics.clipped(String(repeating: "字", count: 200)).count == 80, "notice bounded")
        require(!ReminderBannerMetrics.summary("abc").contains("已通过"), "real summary wins over the caveat")
        print("REMINDER_BANNER_PURE_OK")
        guard CGSessionCopyCurrentDictionary() != nil else {
            print("REMINDER_BANNER_WINDOWSERVER_UNAVAILABLE")
            return
        }
        _ = NSApplication.shared
        let banner = ReminderBanner()
        let window = NSApp.windows.first { $0.title == "MOSS 提醒" }!
        require(!banner.visible && !window.isVisible, "constructor stays hidden")
        require(!window.canBecomeKey && !window.canBecomeMain, "never takes focus")
        require(window.styleMask.contains(.nonactivatingPanel) && !window.styleMask.contains(.titled), "nonactivating borderless style")
        require(window.level == .floating && !window.hidesOnDeactivate, "floating above other apps, survives deactivation")
        require(window.collectionBehavior.contains([.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]), "space behavior")
        require(window.accessibilityLabel() == "MOSS 提醒", "banner accessibility label")
        var opened = 0
        banner.onOpen = { opened += 1 }
        banner.openTapped()
        require(opened == 0, "a hidden banner never reports a click")
        let content = window.contentView as! ReminderBannerContent
        require(content.openButton.target === content && content.openButton.action == #selector(ReminderBannerContent.openClicked), "whole banner is the click target")
        require(content.openButton.accessibilityLabel() == "打开 MOSS 查看提醒", "open accessibility")
        require(content.titleLabel.stringValue.isEmpty && content.summaryLabel.stringValue.isEmpty, "labels start truly empty")
        // Codex completion path: show orders the banner front in a real WindowServer
        // session (above all apps, without activation) and fills the labels.
        let chosen = NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) } ?? NSScreen.main
        banner.show(project: "电视盒子", summary: "已修复登录并补充测试")
        require(banner.visible, "show displays the banner above other apps")
        require(window.accessibilityLabel() == "Codex 完成提醒", "codex accessibility per show")
        require(content.titleLabel.stringValue == "电视盒子 · Codex 本轮已结束", "codex title applied")
        require(content.summaryLabel.stringValue == "已修复登录并补充测试", "codex summary applied")
        if let chosen = chosen {
            let expected = ReminderBannerMetrics.frame(in: chosen.visibleFrame)
            require(abs(window.frame.midX - expected.midX) < 1 && abs(window.frame.maxY - expected.maxY) < 1, "banner pinned to the top center of the chosen screen")
        }
        banner.openTapped()
        require(!banner.visible && opened == 1, "a visible banner click hides it and reports onOpen")
        require(content.titleLabel.stringValue.isEmpty && content.summaryLabel.stringValue.isEmpty, "hide clears labels")
        // Generic notice path shows the assistant reminder surface.
        banner.showNotice("微信提醒未播报：当时助理正忙")
        require(banner.visible, "notice displays on the same top banner")
        require(content.titleLabel.stringValue == "MOSS 提醒", "notice uses the generic title")
        require(content.summaryLabel.stringValue == "微信提醒未播报：当时助理正忙", "notice summary applied")
        require(window.accessibilityLabel() == "MOSS 提醒", "notice accessibility per show")
        banner.hide()
        require(!banner.visible, "hide keeps the banner hidden")
        banner.showNotice("   ")
        require(!banner.visible && content.titleLabel.stringValue.isEmpty, "blank notice never shows")
        banner.showNotice(String(repeating: "长", count: 200))
        require(banner.visible && content.summaryLabel.stringValue.count == 80, "long notice truncated")
        banner.hide()
        require(!banner.visible, "final hide")
        require(!content.titleLabel.isSelectable && !content.titleLabel.isEditable, "labels are display only")
        print("REMINDER_BANNER_WINDOW_OK")
    }
}

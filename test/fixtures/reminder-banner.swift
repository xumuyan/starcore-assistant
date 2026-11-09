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
        require(ReminderBannerMetrics.summary("") == "回合结束不代表代码或测试已通过", "empty summary keeps the caveat")
        require(ReminderBannerMetrics.summary("已修复登录并补充测试") == "已修复登录并补充测试", "summary kept")
        require(ReminderBannerMetrics.summary(String(repeating: "字", count: 200)).count == 80, "summary bounded")
        require(!ReminderBannerMetrics.summary("abc").contains("已通过"), "real summary wins over the caveat")
        print("REMINDER_BANNER_PURE_OK")
        guard CGSessionCopyCurrentDictionary() != nil else {
            print("REMINDER_BANNER_WINDOWSERVER_UNAVAILABLE")
            return
        }
        _ = NSApplication.shared
        let banner = ReminderBanner()
        let window = NSApp.windows.first { $0.title == "MOSS Codex 完成提醒" }!
        require(!banner.visible && !window.isVisible, "constructor stays hidden")
        require(!window.canBecomeKey && !window.canBecomeMain, "never takes focus")
        require(window.styleMask.contains(.nonactivatingPanel) && !window.styleMask.contains(.titled), "nonactivating borderless style")
        require(window.level == .floating && !window.hidesOnDeactivate, "floating above other apps, survives deactivation")
        require(window.collectionBehavior.contains([.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]), "space behavior")
        require(window.accessibilityLabel() == "Codex 完成提醒", "banner accessibility label")
        var opened = 0
        banner.onOpen = { opened += 1 }
        banner.openTapped()
        require(opened == 0, "a hidden banner never reports a click")
        let content = window.contentView as! ReminderBannerContent
        require(content.openButton.target === content && content.openButton.action == #selector(ReminderBannerContent.openClicked), "whole banner is the click target")
        require(content.openButton.accessibilityLabel() == "打开 MOSS 查看完成提醒", "open accessibility")
        require(content.titleLabel.stringValue.isEmpty && content.summaryLabel.stringValue.isEmpty, "labels start empty")
        content.apply(project: "电视盒子", summary: "已修复登录并补充测试")
        require(content.titleLabel.stringValue == "电视盒子 · Codex 本轮已结束", "title applied without showing")
        require(content.summaryLabel.stringValue == "已修复登录并补充测试", "summary applied without showing")
        require(!content.titleLabel.isSelectable && !content.titleLabel.isEditable, "labels are display only")
        banner.hide()
        require(!banner.visible, "hide keeps the banner hidden")
        print("REMINDER_BANNER_WINDOW_OK")
    }
}

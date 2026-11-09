import AppKit

enum ReminderBannerMetrics {
    static let bannerWidth: CGFloat = 320
    static let bannerHeight: CGFloat = 64
    static let topMargin: CGFloat = 12
    static let autoHideSeconds: TimeInterval = 10

    static func frame(in visibleFrame: NSRect) -> NSRect {
        let width = min(bannerWidth, max(0, visibleFrame.width - 24))
        let height = min(bannerHeight, max(0, visibleFrame.height - 24))
        return NSRect(x: visibleFrame.midX - width / 2,
                      y: visibleFrame.maxY - height - topMargin,
                      width: width, height: height)
    }

    static func title(project: String) -> String {
        let name = project.trimmingCharacters(in: .whitespacesAndNewlines)
        return (name.isEmpty ? "未命名项目" : name) + " · Codex 本轮已结束"
    }

    static let noticeTitle = "MOSS 提醒"

    static func clipped(_ text: String, limit: Int = 80) -> String {
        String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(limit))
    }

    static func summary(_ summary: String) -> String {
        let trimmed = summary.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "回合结束不代表代码或测试已通过" }
        return String(trimmed.prefix(80))
    }
}

final class ReminderBannerPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

private final class ReminderBannerButton: NSButton {
    override var acceptsFirstResponder: Bool { false }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/// A top-of-screen glass banner for Codex completion reminders and general
/// assistant notices. Presentation only: the bridge owns when to show it; a
/// click hands the callback back to the app. All methods, including
/// construction, must be called on the main queue.
final class ReminderBanner: NSObject {
    var onOpen: (() -> Void)?
    var visible: Bool { window.isVisible }

    private let window: ReminderBannerPanel
    private let content = ReminderBannerContent(frame: NSRect(x: 0, y: 0, width: ReminderBannerMetrics.bannerWidth, height: ReminderBannerMetrics.bannerHeight))
    private var hideTimer: Timer?

    override init() {
        let width = ReminderBannerMetrics.bannerWidth, height = ReminderBannerMetrics.bannerHeight
        window = ReminderBannerPanel(contentRect: NSRect(x: -10000, y: -10000, width: width, height: height),
                                     styleMask: [.borderless, .nonactivatingPanel],
                                     backing: .buffered, defer: false)
        super.init()
        window.title = "MOSS 提醒"
        window.setAccessibilityLabel("MOSS 提醒")
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        window.hidesOnDeactivate = false
        window.isReleasedWhenClosed = false
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true
        window.isMovable = false
        window.animationBehavior = .none
        window.contentView = content
        content.openAction = { [weak self] in self?.openTapped() }
    }

    func show(project: String, summary: String) {
        show(title: ReminderBannerMetrics.title(project: project),
             summary: ReminderBannerMetrics.summary(summary),
             accessibilityLabel: "Codex 完成提醒")
    }

    /// System-level surface for assistant notices and errors: visible above all
    /// apps even when MOSS is in the background. Empty or whitespace-only
    /// messages never display. The HUD keeps its own in-window toast.
    func showNotice(_ message: String) {
        let clipped = ReminderBannerMetrics.clipped(message)
        guard !clipped.isEmpty else { return }
        show(title: ReminderBannerMetrics.noticeTitle, summary: clipped, accessibilityLabel: "MOSS 提醒")
    }

    func show(title: String, summary: String, accessibilityLabel: String) {
        content.apply(title: title, summary: summary)
        window.setAccessibilityLabel(accessibilityLabel)
        let screen = NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) } ?? NSScreen.main
        if let screen = screen { window.setFrame(ReminderBannerMetrics.frame(in: screen.visibleFrame), display: false) }
        window.orderFrontRegardless()
        content.layoutSubtreeIfNeeded()
        window.displayIfNeeded()
        hideTimer?.invalidate()
        hideTimer = Timer.scheduledTimer(withTimeInterval: ReminderBannerMetrics.autoHideSeconds, repeats: false) { [weak self] _ in self?.hide() }
    }

    func hide() {
        hideTimer?.invalidate(); hideTimer = nil
        window.orderOut(nil)
        content.clear()
    }

    @objc func openTapped() {
        guard window.isVisible else { return }
        hide()
        onOpen?()
    }
}

/// Kept separate so text rendering can be checked without ever displaying a panel.
final class ReminderBannerContent: NSView {
    var openAction: (() -> Void)?
    let titleLabel = NSTextField(labelWithString: "")
    let summaryLabel = NSTextField(labelWithString: "")
    let indicator = NSImageView()
    let openButton: NSButton = ReminderBannerButton(title: "", target: nil, action: nil)
    private let glass = NSVisualEffectView()
    private let tint = NSView()
    private let sheen = CAGradientLayer()

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        appearance = NSAppearance(named: .aqua)
        glass.material = .popover
        glass.blendingMode = .behindWindow
        glass.state = .active
        glass.wantsLayer = true
        glass.layer?.cornerRadius = 16
        glass.layer?.masksToBounds = true
        glass.layer?.borderWidth = 0.75
        glass.layer?.borderColor = NSColor(white: 1, alpha: 0.7).cgColor
        tint.wantsLayer = true
        sheen.colors = [NSColor(srgbRed: 0.94, green: 0.95, blue: 1, alpha: 0.84).cgColor,
                        NSColor(srgbRed: 0.87, green: 0.96, blue: 0.98, alpha: 0.70).cgColor]
        sheen.startPoint = CGPoint(x: 0, y: 1)
        sheen.endPoint = CGPoint(x: 1, y: 0)
        tint.layer?.addSublayer(sheen)
        glass.addSubview(tint)
        addSubview(glass)
        titleLabel.font = .systemFont(ofSize: 12, weight: .semibold)
        titleLabel.textColor = .init(srgbRed: 0.10, green: 0.19, blue: 0.30, alpha: 1)
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.setAccessibilityLabel("MOSS 提醒标题")
        summaryLabel.font = .systemFont(ofSize: 10.5)
        summaryLabel.textColor = .init(srgbRed: 0.30, green: 0.40, blue: 0.51, alpha: 1)
        summaryLabel.lineBreakMode = .byTruncatingTail
        summaryLabel.setAccessibilityLabel("MOSS 提醒内容")
        for label in [titleLabel, summaryLabel] {
            label.isSelectable = false
            label.isEditable = false
        }
        indicator.image = NSImage(systemSymbolName: "bell.badge.fill", accessibilityDescription: nil)
        indicator.contentTintColor = .init(srgbRed: 0.20, green: 0.60, blue: 0.73, alpha: 1)
        indicator.setAccessibilityElement(false)
        // One invisible button covers the banner so a click reaches openAction even
        // when MOSS is not the active application; it never takes keyboard focus.
        openButton.imagePosition = .imageOnly
        openButton.isBordered = false
        openButton.focusRingType = .none
        openButton.target = self
        openButton.action = #selector(openClicked)
        openButton.setAccessibilityLabel("打开 MOSS 查看提醒")
        openButton.toolTip = "点击打开 MOSS"
        glass.addSubview(indicator)
        glass.addSubview(titleLabel)
        glass.addSubview(summaryLabel)
        glass.addSubview(openButton)
        clear()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layout() {
        super.layout()
        glass.frame = bounds
        tint.frame = glass.bounds
        sheen.frame = tint.bounds
        let width = bounds.width
        indicator.frame = NSRect(x: 14, y: bounds.height - 22, width: 14, height: 14)
        titleLabel.frame = NSRect(x: 36, y: bounds.height - 24, width: max(0, width - 50), height: 17)
        summaryLabel.frame = NSRect(x: 36, y: 10, width: max(0, width - 50), height: 16)
        openButton.frame = NSRect(x: 0, y: 0, width: width, height: bounds.height)
    }

    func apply(title: String, summary: String) {
        titleLabel.stringValue = title
        summaryLabel.stringValue = summary
        titleLabel.toolTip = title
        summaryLabel.toolTip = summary
        setAccessibilityHelp(title.isEmpty && summary.isEmpty ? "" : "\(title)：\(summary)")
        needsLayout = true
    }

    func clear() {
        apply(title: "", summary: "")
    }

    @objc func openClicked() { openAction?() }
}

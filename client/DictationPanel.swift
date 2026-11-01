import AppKit

enum DictationPanelMetrics {
    static func normalizedLevel(_ level: Float) -> Float {
        level.isFinite ? min(1, max(0, level)) : 0
    }

    static func elapsedText(_ elapsed: Double?) -> String {
        guard let elapsed = elapsed, elapsed.isFinite else { return "" }
        let seconds = Int(min(359999, max(0, elapsed)))
        return String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }

    static func frame(in visibleFrame: NSRect) -> NSRect {
        let width = min(440, max(0, visibleFrame.width - 32))
        let height = min(188, max(0, visibleFrame.height - 32))
        return NSRect(x: visibleFrame.midX - width / 2,
                      y: visibleFrame.minY + min(48, max(0, visibleFrame.height - height)),
                      width: width, height: height)
    }
}

final class DictationNonactivatingPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

private final class DictationPanelButton: NSButton {
    override var acceptsFirstResponder: Bool { false }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/// Presentation only. The controller owns recording, status text, and copy/cancel behavior.
/// All methods, including construction, must be called on the main queue.
final class DictationPanel: NSObject {
    var onCancel: (() -> Void)?
    var onCopy: (() -> Void)?
    var visible: Bool { window.isVisible }

    private let window: DictationNonactivatingPanel
    private let content = DictationPanelContent(frame: NSRect(x: 0, y: 0, width: 440, height: 188))

    override init() {
        window = DictationNonactivatingPanel(contentRect: NSRect(x: -10000, y: -10000, width: 440, height: 188),
                                             styleMask: [.borderless, .nonactivatingPanel],
                                             backing: .buffered, defer: false)
        super.init()
        window.title = "星核语音输入"
        window.setAccessibilityLabel("星核语音输入")
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
        content.cancelButton.target = self
        content.cancelButton.action = #selector(cancel)
        content.copyButton.target = self
        content.copyButton.action = #selector(copyResult)
    }

    func show(title: String, detail: String, elapsed: Double? = nil, level: Float = 0, canCopy: Bool = false) {
        content.apply(title: title, detail: detail, elapsed: elapsed, level: level, canCopy: canCopy)
        let screen = NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) } ?? NSScreen.main
        if let screen = screen { window.setFrame(DictationPanelMetrics.frame(in: screen.visibleFrame), display: false) }
        window.orderFrontRegardless()
    }

    func updateLevel(_ level: Float, elapsed: Double) {
        content.updateLevel(level, elapsed: elapsed)
    }

    func hide() {
        window.orderOut(nil)
        content.clear()
    }

    @objc private func cancel() { onCancel?() }
    @objc private func copyResult() {
        guard !content.copyButton.isHidden else { return }
        onCopy?()
    }
}

/// Kept separate so status rendering can be checked without ever displaying a panel.
final class DictationPanelContent: NSView {
    let titleLabel = NSTextField(labelWithString: "")
    let detailLabel = NSTextField(wrappingLabelWithString: "")
    let timeLabel = NSTextField(labelWithString: "")
    let meter = NSLevelIndicator()
    let cancelButton: NSButton = DictationPanelButton(title: "取消", target: nil, action: nil)
    let copyButton: NSButton = DictationPanelButton(title: "复制结果", target: nil, action: nil)

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        appearance = NSAppearance(named: .darkAqua)
        wantsLayer = true
        layer?.cornerRadius = 18
        layer?.masksToBounds = true
        layer?.borderWidth = 1
        layer?.borderColor = NSColor(srgbRed: 0.25, green: 0.70, blue: 0.90, alpha: 0.45).cgColor

        let glass = NSVisualEffectView()
        glass.material = .hudWindow
        glass.blendingMode = .behindWindow
        glass.state = .active
        let tint = NSView()
        tint.wantsLayer = true
        tint.layer?.backgroundColor = NSColor(srgbRed: 0.025, green: 0.06, blue: 0.11, alpha: 0.87).cgColor
        for background in [glass, tint] {
            background.translatesAutoresizingMaskIntoConstraints = false
            addSubview(background)
            NSLayoutConstraint.activate([
                background.leadingAnchor.constraint(equalTo: leadingAnchor),
                background.trailingAnchor.constraint(equalTo: trailingAnchor),
                background.topAnchor.constraint(equalTo: topAnchor),
                background.bottomAnchor.constraint(equalTo: bottomAnchor)
            ])
        }

        let cyan = NSColor(srgbRed: 0.34, green: 0.83, blue: 1, alpha: 1)
        let dot = NSView()
        dot.wantsLayer = true
        dot.layer?.backgroundColor = cyan.cgColor
        dot.layer?.cornerRadius = 4
        dot.setAccessibilityElement(false)
        titleLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        titleLabel.textColor = cyan
        titleLabel.lineBreakMode = .byTruncatingTail
        timeLabel.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
        timeLabel.textColor = .init(white: 0.8, alpha: 1)
        timeLabel.setContentCompressionResistancePriority(.required, for: .horizontal)
        timeLabel.setAccessibilityLabel("录音时长")
        detailLabel.font = .systemFont(ofSize: 13)
        detailLabel.textColor = .init(white: 0.9, alpha: 1)
        detailLabel.maximumNumberOfLines = 3
        detailLabel.lineBreakMode = .byTruncatingTail
        detailLabel.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        for label in [titleLabel, detailLabel, timeLabel] {
            label.isSelectable = false
            label.isEditable = false
        }
        meter.levelIndicatorStyle = .continuousCapacity
        meter.minValue = 0
        meter.maxValue = 1
        meter.warningValue = 1
        meter.criticalValue = 1
        meter.isEditable = false
        meter.fillColor = cyan
        meter.setAccessibilityLabel("麦克风音量")

        cancelButton.setAccessibilityLabel("取消本次语音输入")
        copyButton.setAccessibilityLabel("复制识别结果")
        for button in [cancelButton, copyButton] {
            button.bezelStyle = .rounded
            button.controlSize = .small
            button.font = .systemFont(ofSize: 12, weight: .medium)
            button.contentTintColor = cyan
            button.focusRingType = .none
        }

        let header = NSStackView(views: [dot, titleLabel, NSView(), timeLabel])
        header.orientation = .horizontal
        header.alignment = .centerY
        header.spacing = 9
        let actions = NSStackView(views: [NSView(), copyButton, cancelButton])
        actions.orientation = .horizontal
        actions.spacing = 8
        for view in [header, detailLabel, meter, actions] {
            view.translatesAutoresizingMaskIntoConstraints = false
            addSubview(view)
        }
        NSLayoutConstraint.activate([
            dot.widthAnchor.constraint(equalToConstant: 8), dot.heightAnchor.constraint(equalToConstant: 8),
            header.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
            header.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -20),
            header.topAnchor.constraint(equalTo: topAnchor, constant: 18),
            header.heightAnchor.constraint(equalToConstant: 22),
            detailLabel.leadingAnchor.constraint(equalTo: header.leadingAnchor),
            detailLabel.trailingAnchor.constraint(equalTo: header.trailingAnchor),
            detailLabel.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 9),
            detailLabel.heightAnchor.constraint(equalToConstant: 49),
            meter.leadingAnchor.constraint(equalTo: header.leadingAnchor),
            meter.trailingAnchor.constraint(equalTo: header.trailingAnchor),
            meter.topAnchor.constraint(equalTo: detailLabel.bottomAnchor, constant: 10),
            meter.heightAnchor.constraint(equalToConstant: 6),
            actions.leadingAnchor.constraint(equalTo: header.leadingAnchor),
            actions.trailingAnchor.constraint(equalTo: header.trailingAnchor),
            actions.topAnchor.constraint(equalTo: meter.bottomAnchor, constant: 12),
            actions.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -14)
        ])
        clear()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func apply(title: String, detail: String, elapsed: Double?, level: Float, canCopy: Bool) {
        titleLabel.stringValue = title
        detailLabel.stringValue = detail
        timeLabel.stringValue = DictationPanelMetrics.elapsedText(elapsed)
        meter.doubleValue = Double(DictationPanelMetrics.normalizedLevel(level))
        copyButton.isHidden = !canCopy
        copyButton.isEnabled = canCopy
    }

    func updateLevel(_ level: Float, elapsed: Double) {
        meter.doubleValue = Double(DictationPanelMetrics.normalizedLevel(level))
        timeLabel.stringValue = DictationPanelMetrics.elapsedText(elapsed)
    }

    func clear() {
        apply(title: "", detail: "", elapsed: nil, level: 0, canCopy: false)
    }
}

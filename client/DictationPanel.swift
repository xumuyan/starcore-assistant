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

    static func frame(in visibleFrame: NSRect, expanded: Bool = false) -> NSRect {
        let width = min(expanded ? 340 : 232, max(0, visibleFrame.width - 32))
        let height = min(expanded ? 176 : 68, max(0, visibleFrame.height - 32))
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

/// A short history of real microphone levels. No timer or simulated waveform.
final class DictationWaveform: NSView {
    private(set) var samples = Array(repeating: Float(0), count: 24)
    var doubleValue: Double = 0 {
        didSet {
            samples.removeFirst()
            samples.append(DictationPanelMetrics.normalizedLevel(Float(doubleValue)))
            setAccessibilityValue(NSNumber(value: samples.last ?? 0))
            needsDisplay = true
        }
    }
    func reset() {
        samples = Array(repeating: 0, count: 24)
        doubleValue = 0
    }
    override func draw(_ dirtyRect: NSRect) {
        let stride = bounds.width / CGFloat(samples.count)
        for (index, sample) in samples.enumerated() {
            let height = max(2, CGFloat(sample) * bounds.height)
            let mix = CGFloat(index) / CGFloat(max(1, samples.count - 1))
            NSColor(srgbRed: 0.20 + mix * 0.14, green: 0.76 - mix * 0.08,
                    blue: 0.73 + mix * 0.14, alpha: sample > 0.01 ? 0.95 : 0.45).setFill()
            NSBezierPath(roundedRect: NSRect(x: CGFloat(index) * stride, y: bounds.midY - height / 2,
                width: max(1, stride - 3), height: height), xRadius: 1.5, yRadius: 1.5).fill()
        }
    }
}

/// Presentation only. The controller owns recording, status text, and copy/cancel behavior.
/// All methods, including construction, must be called on the main queue.
final class DictationPanel: NSObject {
    var onCancel: (() -> Void)?
    var onCopy: (() -> Void)?
    var onFinish: (() -> Void)?
    var visible: Bool { window.isVisible }

    private let window: DictationNonactivatingPanel
    private let content = DictationPanelContent(frame: NSRect(x: 0, y: 0, width: 232, height: 68))

    override init() {
        window = DictationNonactivatingPanel(contentRect: NSRect(x: -10000, y: -10000, width: 232, height: 68),
                                             styleMask: [.borderless, .nonactivatingPanel],
                                             backing: .buffered, defer: false)
        super.init()
        window.title = "MOSS 语音输入"
        window.setAccessibilityLabel("MOSS 语音输入")
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
        content.finishButton.target = self
        content.finishButton.action = #selector(finishRecording)
    }

    func show(title: String, detail: String, elapsed: Double? = nil, level: Float = 0, canCopy: Bool = false) {
        content.apply(title: title, detail: detail, elapsed: elapsed, level: level, canCopy: canCopy)
        let screen = NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) } ?? NSScreen.main
        if let screen = screen { window.setFrame(DictationPanelMetrics.frame(in: screen.visibleFrame, expanded: canCopy), display: false) }
        window.orderFrontRegardless()
        content.layoutSubtreeIfNeeded()
        window.displayIfNeeded()
    }

    func updateLevel(_ level: Float, elapsed: Double) {
        content.updateLevel(level, elapsed: elapsed)
    }

    func hide() {
        window.orderOut(nil)
        content.clear()
    }

    @objc private func cancel() { onCancel?() }
    @objc private func finishRecording() {
        guard !content.finishButton.isHidden else { return }
        onFinish?()
    }
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
    let meter = DictationWaveform()
    let cancelButton: NSButton = DictationPanelButton(title: "", target: nil, action: nil)
    let copyButton: NSButton = DictationPanelButton(title: "复制", target: nil, action: nil)
    let finishButton: NSButton = DictationPanelButton(title: "完成", target: nil, action: nil)
    private let glass = NSVisualEffectView()
    private let tint = NSView()
    private let sheen = CAGradientLayer()
    private let indicator = NSImageView()
    private var expanded = false
    private var recording = false

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        appearance = NSAppearance(named: .aqua)
        glass.material = .popover
        glass.blendingMode = .behindWindow
        glass.state = .active
        glass.wantsLayer = true
        glass.layer?.cornerRadius = 18
        glass.layer?.masksToBounds = true
        glass.layer?.borderWidth = 0.75
        glass.layer?.borderColor = NSColor(white: 1, alpha: 0.7).cgColor
        tint.wantsLayer = true
        sheen.colors = [NSColor(srgbRed: 0.93, green: 0.93, blue: 1, alpha: 0.82).cgColor,
                        NSColor(srgbRed: 0.88, green: 0.97, blue: 1, alpha: 0.70).cgColor]
        sheen.startPoint = CGPoint(x: 0, y: 1)
        sheen.endPoint = CGPoint(x: 1, y: 0)
        tint.layer?.addSublayer(sheen)
        glass.addSubview(tint)
        addSubview(glass)
        titleLabel.font = .systemFont(ofSize: 11, weight: .medium)
        titleLabel.textColor = .init(srgbRed: 0.12, green: 0.21, blue: 0.32, alpha: 1)
        titleLabel.lineBreakMode = .byTruncatingTail
        detailLabel.font = .systemFont(ofSize: 10)
        detailLabel.textColor = .init(srgbRed: 0.30, green: 0.40, blue: 0.51, alpha: 1)
        timeLabel.font = .monospacedDigitSystemFont(ofSize: 10.5, weight: .regular)
        timeLabel.textColor = .init(srgbRed: 0.34, green: 0.45, blue: 0.58, alpha: 1)
        timeLabel.alignment = .right
        timeLabel.setAccessibilityLabel("录音时长")
        for label in [titleLabel, detailLabel, timeLabel] {
            label.isSelectable = false
            label.isEditable = false
        }
        indicator.image = NSImage(systemSymbolName: "circle.fill", accessibilityDescription: nil)
        indicator.contentTintColor = .init(srgbRed: 0.20, green: 0.76, blue: 0.73, alpha: 1)
        indicator.setAccessibilityElement(false)
        meter.setAccessibilityElement(true)
        meter.setAccessibilityRole(.levelIndicator)
        meter.setAccessibilityLabel("麦克风音量")
        cancelButton.image = NSImage(systemSymbolName: "xmark", accessibilityDescription: nil)
        cancelButton.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 11, weight: .regular)
        cancelButton.imagePosition = .imageOnly
        cancelButton.contentTintColor = titleLabel.textColor
        cancelButton.setAccessibilityLabel("取消本次语音输入")
        cancelButton.toolTip = "取消 · Esc"
        copyButton.setAccessibilityLabel("复制识别结果")
        finishButton.setAccessibilityLabel("结束听写并识别")
        let blue = NSColor(srgbRed: 0.43, green: 0.57, blue: 0.71, alpha: 1)
        for button in [cancelButton, copyButton, finishButton] {
            button.isBordered = false
            button.focusRingType = .none
            if button !== cancelButton {
                button.wantsLayer = true
                button.layer?.cornerRadius = 8
                button.layer?.backgroundColor = blue.cgColor
                button.contentTintColor = .white
                button.font = .systemFont(ofSize: 11, weight: .medium)
            }
            glass.addSubview(button)
        }
        for view in [indicator, titleLabel, timeLabel, detailLabel, meter] { glass.addSubview(view) }
        clear()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layout() {
        super.layout()
        glass.frame = bounds
        tint.frame = glass.bounds
        sheen.frame = tint.bounds
        let width = bounds.width
        indicator.frame = NSRect(x: 13, y: bounds.height - 21, width: 10, height: 10)
        cancelButton.frame = NSRect(x: width - 32, y: bounds.height - 26, width: 22, height: 22)
        titleLabel.frame = NSRect(x: 30, y: bounds.height - 25, width: max(0, width - (recording ? 120 : 70)), height: 18)
        timeLabel.frame = NSRect(x: width - 88, y: bounds.height - 23, width: 46, height: 16)
        for button in [copyButton, finishButton] { button.frame = NSRect(x: width - 60, y: 10, width: 46, height: 24) }
        meter.frame = NSRect(x: 14, y: 12, width: max(0, width - 100), height: 20)
        detailLabel.frame = expanded
            ? NSRect(x: 14, y: 44, width: max(0, width - 28), height: max(0, bounds.height - 82))
            : NSRect(x: 14, y: 8, width: max(0, width - 28), height: 22)
    }

    func apply(title: String, detail: String, elapsed: Double?, level: Float, canCopy: Bool) {
        expanded = canCopy
        recording = elapsed != nil && !canCopy
        titleLabel.stringValue = recording ? "正在聆听" : title
        titleLabel.toolTip = title + "\n" + detail
        detailLabel.stringValue = detail
        detailLabel.toolTip = detail
        detailLabel.maximumNumberOfLines = canCopy ? 6 : 1
        detailLabel.lineBreakMode = .byTruncatingTail
        detailLabel.isHidden = recording
        timeLabel.stringValue = DictationPanelMetrics.elapsedText(elapsed)
        timeLabel.isHidden = !recording
        indicator.isHidden = title.isEmpty
        indicator.alphaValue = recording ? 1 : 0.45
        meter.reset()
        meter.doubleValue = Double(DictationPanelMetrics.normalizedLevel(level))
        meter.isHidden = !recording
        copyButton.isHidden = !canCopy
        copyButton.isEnabled = canCopy
        finishButton.isHidden = !recording
        finishButton.isEnabled = recording
        finishButton.toolTip = detail
        setAccessibilityHelp(detail)
        needsLayout = true
    }

    func updateLevel(_ level: Float, elapsed: Double) {
        meter.doubleValue = Double(DictationPanelMetrics.normalizedLevel(level))
        timeLabel.stringValue = DictationPanelMetrics.elapsedText(elapsed)
        meter.setAccessibilityLabel("麦克风音量 · " + timeLabel.stringValue)
    }

    func clear() {
        apply(title: "", detail: "", elapsed: nil, level: 0, canCopy: false)
        meter.setAccessibilityLabel("麦克风音量")
    }
}

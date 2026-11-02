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
        let width = min(expanded ? 340 : 208, max(0, visibleFrame.width - 32))
        let height = min(expanded ? 176 : 78, max(0, visibleFrame.height - 32))
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
    private(set) var samples = Array(repeating: Float(0), count: 32)
    var doubleValue: Double = 0 {
        didSet {
            samples.removeFirst()
            samples.append(DictationPanelMetrics.normalizedLevel(Float(doubleValue)))
            setAccessibilityValue(NSNumber(value: samples.last ?? 0))
            needsDisplay = true
        }
    }
    func reset() {
        samples = Array(repeating: 0, count: 32)
        doubleValue = 0
    }
    override func draw(_ dirtyRect: NSRect) {
        let stride = bounds.width / CGFloat(samples.count)
        for (index, sample) in samples.enumerated() {
            let height = max(2, CGFloat(sample) * bounds.height)
            NSColor(srgbRed: 1, green: 0.40, blue: 0.24, alpha: sample > 0.01 ? 0.95 : 0.25).setFill()
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
    private let content = DictationPanelContent(frame: NSRect(x: 0, y: 0, width: 208, height: 78))

    override init() {
        window = DictationNonactivatingPanel(contentRect: NSRect(x: -10000, y: -10000, width: 208, height: 78),
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
    let cancelButton: NSButton = DictationPanelButton(title: "×", target: nil, action: nil)
    let copyButton: NSButton = DictationPanelButton(title: "复制", target: nil, action: nil)
    let finishButton: NSButton = DictationPanelButton(title: "✓", target: nil, action: nil)
    private let capsule = NSVisualEffectView()
    private let hint = NSView()
    private let tint = NSView()
    private var expanded = false

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        appearance = NSAppearance(named: .darkAqua)
        capsule.material = .hudWindow
        capsule.blendingMode = .behindWindow
        capsule.state = .active
        capsule.wantsLayer = true
        capsule.layer?.cornerRadius = 22
        capsule.layer?.masksToBounds = true
        capsule.layer?.borderWidth = 1
        capsule.layer?.borderColor = NSColor(white: 0.4, alpha: 0.5).cgColor
        tint.wantsLayer = true
        tint.layer?.backgroundColor = NSColor(srgbRed: 0.10, green: 0.075, blue: 0.065, alpha: 0.93).cgColor
        capsule.addSubview(tint)
        hint.wantsLayer = true
        hint.layer?.cornerRadius = 12
        hint.layer?.backgroundColor = NSColor(srgbRed: 0.085, green: 0.065, blue: 0.06, alpha: 0.96).cgColor
        hint.layer?.borderWidth = 1
        hint.layer?.borderColor = NSColor(white: 0.4, alpha: 0.55).cgColor
        addSubview(capsule)
        addSubview(hint)
        titleLabel.font = .systemFont(ofSize: 11, weight: .medium)
        titleLabel.textColor = .init(white: 0.9, alpha: 1)
        titleLabel.alignment = .center
        titleLabel.lineBreakMode = .byTruncatingTail
        detailLabel.font = .systemFont(ofSize: 10)
        detailLabel.textColor = .init(white: 0.8, alpha: 1)
        detailLabel.alignment = .center
        timeLabel.setAccessibilityLabel("录音时长")
        for label in [titleLabel, detailLabel, timeLabel] {
            label.isSelectable = false
            label.isEditable = false
        }
        meter.setAccessibilityElement(true)
        meter.setAccessibilityRole(.levelIndicator)
        meter.setAccessibilityLabel("麦克风音量")
        cancelButton.setAccessibilityLabel("取消本次语音输入")
        copyButton.setAccessibilityLabel("复制识别结果")
        finishButton.setAccessibilityLabel("结束听写并识别")
        let orange = NSColor(srgbRed: 1, green: 0.47, blue: 0.35, alpha: 1)
        for button in [cancelButton, copyButton, finishButton] {
            button.isBordered = false
            button.wantsLayer = true
            button.layer?.cornerRadius = 15
            button.layer?.backgroundColor = (button === cancelButton ? NSColor(white: 0.22, alpha: 1) : orange).cgColor
            button.contentTintColor = button === cancelButton ? .white : .black
            button.font = .systemFont(ofSize: button === copyButton ? 10 : 23, weight: .medium)
            button.focusRingType = .none
            capsule.addSubview(button)
        }
        capsule.addSubview(titleLabel)
        capsule.addSubview(meter)
        hint.addSubview(detailLabel)
        clear()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layout() {
        super.layout()
        let width = min(208, bounds.width)
        capsule.frame = NSRect(x: (bounds.width - width) / 2, y: 0, width: width, height: 44)
        tint.frame = capsule.bounds
        cancelButton.frame = NSRect(x: 7, y: 7, width: 30, height: 30)
        for button in [copyButton, finishButton] { button.frame = NSRect(x: width - 37, y: 7, width: 30, height: 30) }
        titleLabel.frame = NSRect(x: 43, y: 12, width: max(0, width - 86), height: 20)
        meter.frame = NSRect(x: 47, y: 12, width: max(0, width - 94), height: 20)
        hint.frame = NSRect(x: 0, y: 50, width: bounds.width, height: expanded ? 126 : 24)
        detailLabel.frame = NSRect(x: 10, y: expanded ? 10 : 5, width: max(0, hint.bounds.width - 20), height: expanded ? 106 : 15)
    }

    func apply(title: String, detail: String, elapsed: Double?, level: Float, canCopy: Bool) {
        expanded = canCopy
        titleLabel.stringValue = title
        titleLabel.toolTip = title + "\n" + detail
        titleLabel.isHidden = elapsed != nil
        detailLabel.stringValue = detail
        detailLabel.toolTip = title + "\n" + detail
        detailLabel.maximumNumberOfLines = canCopy ? 7 : 1
        detailLabel.alignment = canCopy ? .left : .center
        detailLabel.lineBreakMode = .byTruncatingTail
        timeLabel.stringValue = DictationPanelMetrics.elapsedText(elapsed)
        meter.reset()
        meter.doubleValue = Double(DictationPanelMetrics.normalizedLevel(level))
        meter.isHidden = elapsed == nil
        copyButton.isHidden = !canCopy
        copyButton.isEnabled = canCopy
        finishButton.isHidden = elapsed == nil
        finishButton.isEnabled = elapsed != nil
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

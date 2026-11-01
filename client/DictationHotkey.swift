import AppKit
import CoreGraphics
import ApplicationServices

struct DictationKeyResult {
    var toggle = false
    var cancel = false
    var swallow = false
}

/// Pure event matching, independent of permission checks and event tap creation.
struct DictationKeyMatcher {
    private var optionDown = false
    private var optionAlone = false
    private var swallowed: Set<Int64> = []
    mutating func reset() { optionDown = false; optionAlone = false; swallowed.removeAll() }

    mutating func handle(type: CGEventType, keyCode: Int64, flags: CGEventFlags,
                         autorepeat: Bool, tag: Int64, preset: String, active: Bool) -> DictationKeyResult {
        guard tag != DictationHotkey.syntheticEventTag else { return DictationKeyResult() }
        if type == .keyUp, swallowed.remove(keyCode) != nil { return DictationKeyResult(swallow: true) }
        if type == .keyDown, swallowed.contains(keyCode) { return DictationKeyResult(swallow: true) }
        if optionDown, !(type == .flagsChanged && keyCode == 61) { optionAlone = false }
        if type == .keyDown, keyCode == 53, active {
            swallowed.insert(keyCode)
            return DictationKeyResult(cancel: !autorepeat, swallow: true)
        }
        if preset == "right-option", type == .flagsChanged, keyCode == 61 {
            // Device-dependent bits distinguish releasing right Option with left Option held.
            let sideBits = flags.rawValue & 0x60
            let down = sideBits != 0 ? (sideBits & 0x40 != 0) : (!optionDown && flags.contains(.maskAlternate))
            if down {
                if !optionDown {
                    optionDown = true
                    optionAlone = flags.intersection([.maskCommand, .maskControl, .maskShift, .maskSecondaryFn]).isEmpty && sideBits & 0x20 == 0
                }
                return DictationKeyResult()
            }
            let toggle = optionDown && optionAlone && !flags.contains(.maskAlternate) && flags.intersection([.maskCommand, .maskControl, .maskShift, .maskSecondaryFn]).isEmpty
            optionDown = false; optionAlone = false
            return DictationKeyResult(toggle: toggle)
        }
        let target: Int64? = preset == "f8" ? 100 : preset == "f9" ? 101 : nil
        if type == .keyDown, keyCode == target,
           flags.intersection([.maskCommand, .maskControl, .maskAlternate, .maskShift]).isEmpty,
           !autorepeat {
            swallowed.insert(keyCode)
            return DictationKeyResult(toggle: true, swallow: true)
        }
        return DictationKeyResult()
    }
}

/// A tap exists only after explicit enablement and already-granted permission.
final class DictationHotkey {
    static let syntheticEventTag: Int64 = 0x5354415244494354
    var onToggle: (() -> Void)?
    var onCancel: (() -> Void)?
    var isActive: () -> Bool = { false }
    var onFailure: ((String) -> Void)?
    private var tap: CFMachPort?
    private var source: CFRunLoopSource?
    private var matcher = DictationKeyMatcher()
    private var preset = "right-option"
    private var generation = 0
    var running: Bool { tap != nil }

    static func retainsTap(enabled: Bool, preset: String, currentPreset: String, running: Bool, permitted: Bool) -> Bool {
        enabled && permitted && running && preset == currentPreset
    }

    @discardableResult func configure(enabled: Bool, preset: String) -> Bool {
        guard enabled else { stop(); return true }
        guard ["right-option", "f8", "f9"].contains(preset) else {
            stop(); onFailure?("不支持的听写快捷键"); return false
        }
        guard CGPreflightListenEventAccess(), AXIsProcessTrusted() else {
            stop(); onFailure?("请先在系统设置中允许输入监控与辅助功能权限"); return false
        }
        if Self.retainsTap(enabled: enabled, preset: preset, currentPreset: self.preset, running: running, permitted: true) { return true }
        stop()
        self.preset = preset
        let mask = (CGEventMask(1) << CGEventType.flagsChanged.rawValue) |
                   (CGEventMask(1) << CGEventType.keyDown.rawValue) |
                   (CGEventMask(1) << CGEventType.keyUp.rawValue)
        guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap,
            options: .defaultTap, eventsOfInterest: mask, callback: { _, type, event, context in
                guard let context else { return Unmanaged.passUnretained(event) }
                return Unmanaged<DictationHotkey>.fromOpaque(context).takeUnretainedValue().receive(type, event)
            }, userInfo: Unmanaged.passUnretained(self).toOpaque()) else {
            onFailure?("无法启动听写快捷键监听，请检查系统权限"); return false
        }
        guard let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0) else {
            CFMachPortInvalidate(tap); onFailure?("无法创建听写快捷键监听"); return false
        }
        self.tap = tap; self.source = source
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        return true
    }

    func stop() {
        generation += 1
        if let tap { CGEvent.tapEnable(tap: tap, enable: false); CFMachPortInvalidate(tap) }
        if let source { CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes) }
        source = nil; tap = nil; matcher.reset()
    }

    private func receive(_ type: CGEventType, _ event: CGEvent) -> Unmanaged<CGEvent>? {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            matcher.reset()
            if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
            return Unmanaged.passUnretained(event)
        }
        let result = matcher.handle(type: type,
            keyCode: event.getIntegerValueField(.keyboardEventKeycode), flags: event.flags,
            autorepeat: event.getIntegerValueField(.keyboardEventAutorepeat) != 0,
            tag: event.getIntegerValueField(.eventSourceUserData), preset: preset, active: isActive())
        if result.cancel || result.toggle {
            let token = generation
            DispatchQueue.main.async { [weak self] in
                guard let self, self.running, self.generation == token else { return }
                if result.cancel { self.onCancel?() }
                if result.toggle { self.onToggle?() }
            }
        }
        return result.swallow ? nil : Unmanaged.passUnretained(event)
    }

    deinit { stop() }
}

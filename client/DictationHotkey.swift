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
    private var modifierDown = false
    private var modifierAlone = false
    private var swallowed: Set<Int64> = []
    mutating func reset() { modifierDown = false; modifierAlone = false; swallowed.removeAll() }

    mutating func handle(type: CGEventType, keyCode: Int64, flags: CGEventFlags,
                         autorepeat: Bool, tag: Int64, preset: String, active: Bool) -> DictationKeyResult {
        guard tag != DictationHotkey.syntheticEventTag else { return DictationKeyResult() }
        if type == .keyUp, swallowed.remove(keyCode) != nil { return DictationKeyResult(swallow: true) }
        if type == .keyDown, swallowed.contains(keyCode) { return DictationKeyResult(swallow: true) }
        let control = preset == "right-control"
        let modifierCode: Int64 = control ? 62 : 61
        let modifier: CGEventFlags = control ? .maskControl : .maskAlternate
        let rightBit: UInt64 = control ? 0x2000 : 0x40
        let leftBit: UInt64 = control ? 0x1 : 0x20
        let otherModifiers: CGEventFlags = control ? [.maskCommand, .maskAlternate, .maskShift, .maskSecondaryFn] : [.maskCommand, .maskControl, .maskShift, .maskSecondaryFn]
        if modifierDown, !(type == .flagsChanged && keyCode == modifierCode) { modifierAlone = false }
        if type == .keyDown, keyCode == 53, active {
            swallowed.insert(keyCode)
            return DictationKeyResult(cancel: !autorepeat, swallow: true)
        }
        if ["right-option", "right-control"].contains(preset), type == .flagsChanged, keyCode == modifierCode {
            // NX_DEVICERCTLKEYMASK / NX_DEVICELCTLKEYMASK distinguish physical sides.
            let sideBits = flags.rawValue & (rightBit | leftBit)
            let down = sideBits != 0 ? (sideBits & rightBit != 0) : (!modifierDown && flags.contains(modifier))
            if down {
                if !modifierDown {
                    modifierDown = true
                    modifierAlone = flags.intersection(otherModifiers).isEmpty && sideBits & leftBit == 0
                }
                return DictationKeyResult()
            }
            let toggle = modifierDown && modifierAlone && !flags.contains(modifier) && flags.intersection(otherModifiers).isEmpty
            modifierDown = false; modifierAlone = false
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
    private var keySource: CFRunLoopSource?
    private var pointerTap: CFMachPort?
    private var pointerSource: CFRunLoopSource?
    private var matcher = DictationKeyMatcher()
    private var preset = "right-option"
    private var generation = 0
    var running: Bool { tap != nil && pointerTap != nil }

    /// The filtering tap covers keyboard events only. Mouse and scroll events are
    /// observed by a separate listen-only tap: macOS never stalls system-wide
    /// event delivery for listen-only taps, so pointer input stays alive even if
    /// a callback is late. On 2026-11-09 a frozen instance left the whole UI
    /// unclickable; the mouse-covering .defaultTap was the only global pointer
    /// interception surface this app owned, so it no longer gets one.

    static func retainsTap(enabled: Bool, preset: String, currentPreset: String, running: Bool, permitted: Bool) -> Bool {
        enabled && permitted && running && preset == currentPreset
    }

    @discardableResult func configure(enabled: Bool, preset: String) -> Bool {
        guard enabled else { stop(); return true }
        guard ["right-option", "right-control", "f8", "f9"].contains(preset) else {
            stop(); onFailure?("不支持的听写快捷键"); return false
        }
        guard CGPreflightListenEventAccess(), AXIsProcessTrusted() else {
            stop(); onFailure?("请先在系统设置中允许输入监控与辅助功能权限"); return false
        }
        if Self.retainsTap(enabled: enabled, preset: preset, currentPreset: self.preset, running: running, permitted: true) { return true }
        stop()
        self.preset = preset
        let keyMask = (CGEventMask(1) << CGEventType.flagsChanged.rawValue) |
                      (CGEventMask(1) << CGEventType.keyDown.rawValue) |
                      (CGEventMask(1) << CGEventType.keyUp.rawValue)
        let pointerMask = (CGEventMask(1) << CGEventType.leftMouseDown.rawValue) |
                          (CGEventMask(1) << CGEventType.rightMouseDown.rawValue) |
                          (CGEventMask(1) << CGEventType.otherMouseDown.rawValue) |
                          (CGEventMask(1) << CGEventType.scrollWheel.rawValue)
        let callback: CGEventTapCallBack = { _, type, event, context in
            guard let context else { return Unmanaged.passUnretained(event) }
            return Unmanaged<DictationHotkey>.fromOpaque(context).takeUnretainedValue().receive(type, event)
        }
        guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap,
            options: .defaultTap, eventsOfInterest: keyMask, callback: callback, userInfo: Unmanaged.passUnretained(self).toOpaque()) else {
            onFailure?("无法启动听写快捷键监听，请检查系统权限"); return false
        }
        guard let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0) else {
            CFMachPortInvalidate(tap); onFailure?("无法创建听写快捷键监听"); return false
        }
        guard let pointerTap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap,
            options: .listenOnly, eventsOfInterest: pointerMask, callback: callback, userInfo: Unmanaged.passUnretained(self).toOpaque()) else {
            CFMachPortInvalidate(tap); onFailure?("无法创建听写指针观察监听，请检查输入监控权限"); return false
        }
        guard let pointerSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, pointerTap, 0) else {
            CFMachPortInvalidate(tap); CFMachPortInvalidate(pointerTap)
            onFailure?("无法创建听写指针观察监听"); return false
        }
        self.tap = tap; self.keySource = source
        self.pointerTap = pointerTap; self.pointerSource = pointerSource
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CFRunLoopAddSource(CFRunLoopGetMain(), pointerSource, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        CGEvent.tapEnable(tap: pointerTap, enable: true)
        return true
    }

    func stop() {
        generation += 1
        if let tap { CGEvent.tapEnable(tap: tap, enable: false); CFMachPortInvalidate(tap) }
        if let keySource { CFRunLoopRemoveSource(CFRunLoopGetMain(), keySource, .commonModes) }
        if let pointerTap { CGEvent.tapEnable(tap: pointerTap, enable: false); CFMachPortInvalidate(pointerTap) }
        if let pointerSource { CFRunLoopRemoveSource(CFRunLoopGetMain(), pointerSource, .commonModes) }
        keySource = nil; tap = nil; pointerSource = nil; pointerTap = nil
        matcher.reset()
    }

    private func receive(_ type: CGEventType, _ event: CGEvent) -> Unmanaged<CGEvent>? {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            matcher.reset()
            // Re-enable both taps; doing it on the healthy one is a no-op.
            if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
            if let pointerTap { CGEvent.tapEnable(tap: pointerTap, enable: true) }
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

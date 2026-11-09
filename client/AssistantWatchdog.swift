import Foundation

/// Pure decision logic for the page watchdog. The HUD page is the only surface
/// for stopping wake listening and dispatching clicks; on 2026-11-09 a dead
/// page left the microphone recording with no way to stop it. The watchdog
/// detects an unresponsive page (no completed JS heartbeat) and allows a
/// bounded recovery: reload the page, stop listening, surface a banner.
/// Cooldown and a lifetime cap keep a hopeless page from looping reloads.
struct AssistantWatchdog {
    var staleAfter: TimeInterval = 15
    var reloadCooldown: TimeInterval = 30
    var maxRecoveries = 5
    private(set) var lastBeat: Date?
    private(set) var lastRecovery: Date?
    private(set) var recoveries = 0

    /// Seeds the clock so a page that never answers still goes stale.
    mutating func arm(now: Date) {
        if lastBeat == nil { lastBeat = now }
    }

    mutating func beat(now: Date) { lastBeat = now }

    /// True when the page looks unresponsive and a recovery is due now.
    /// Calling this when due advances the recovery bookkeeping.
    mutating func recoveryDue(now: Date) -> Bool {
        guard recoveries < maxRecoveries else { return false }
        guard let beat = lastBeat, now.timeIntervalSince(beat) >= staleAfter else { return false }
        if let lastRecovery, now.timeIntervalSince(lastRecovery) < reloadCooldown { return false }
        recoveries += 1
        lastRecovery = now
        lastBeat = now
        return true
    }

    /// True once every recovery is spent and the page still fails to answer.
    mutating func exhausted(now: Date) -> Bool {
        guard let lastBeat else { return false }
        return recoveries >= maxRecoveries && now.timeIntervalSince(lastBeat) >= staleAfter
    }
}

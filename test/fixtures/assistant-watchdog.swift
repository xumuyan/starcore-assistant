import Foundation

@main struct AssistantWatchdogFixture {
    static var failures = 0
    static func require(_ condition: Bool, _ label: String) {
        if !condition { failures += 1; print("FAIL: \(label)") }
    }
    static func at(_ seconds: Double) -> Date { Date(timeIntervalSinceReferenceDate: seconds) }

    static func main() {
        // A healthy page keeps beating and never recovers.
        var watchdog = AssistantWatchdog()
        watchdog.arm(now: at(0))
        require(!watchdog.recoveryDue(now: at(5)), "recent beat stays healthy")
        watchdog.beat(now: at(5))
        require(!watchdog.recoveryDue(now: at(8)), "beats suppress recovery")

        // A silent page goes stale after staleAfter.
        require(watchdog.recoveryDue(now: at(25)), "silence past staleAfter recovers")
        require(!watchdog.recoveryDue(now: at(38)), "post-recovery freshness suppresses a new recovery")
        require(!watchdog.recoveryDue(now: at(45)), "cooldown suppresses rapid re-recovery")
        require(watchdog.recoveryDue(now: at(60)), "cooldown elapsed allows recovery")
        require(!watchdog.recoveryDue(now: at(80)), "second cooldown suppresses rapid re-recovery")
        require(watchdog.recoveryDue(now: at(95)), "second cooldown elapsed allows recovery")

        // Lifetime cap: recoveries 4 and 5 fire, then the watchdog refuses.
        require(!watchdog.recoveryDue(now: at(110)), "third cooldown suppresses rapid re-recovery")
        require(watchdog.recoveryDue(now: at(130)), "fourth recovery fires")
        require(!watchdog.recoveryDue(now: at(145)), "fourth cooldown suppresses rapid re-recovery")
        require(watchdog.recoveryDue(now: at(165)), "fifth recovery fires and reaches the cap")
        require(!watchdog.recoveryDue(now: at(200)), "cap blocks further recoveries")
        require(!watchdog.recoveryDue(now: at(400)), "cap still blocks later recoveries")
        require(watchdog.exhausted(now: at(200)), "cap plus silence reports exhausted")
        watchdog.beat(now: at(400))
        require(!watchdog.exhausted(now: at(410)), "a real beat clears exhaustion")

        // A page that never answers from birth still goes stale via arm().
        var silent = AssistantWatchdog()
        silent.arm(now: at(0))
        require(silent.recoveryDue(now: at(20)), "never-answering page recovers")

        if failures == 0 { print("ASSISTANT_WATCHDOG_OK") } else { print("ASSISTANT_WATCHDOG_FAILED \(failures)"); exit(1) }
    }
}

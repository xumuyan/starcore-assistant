import AppKit
import AVFoundation

extension AssistantBridge: DictationControllerHost {
    var dictationAssistantBusy: Bool {
        launchingListen || playback.isActive || synthesizer.isSpeaking || player?.isPlaying == true ||
            DictationAssistantActivity.isBusy(assistantActivity)
    }
    func sendDictation(_ event: [String: Any]) { send(event) }
    func reportDictationStatus(_ event: [String: Any]) { emit(event) }
    func pauseAssistantForDictation() -> Bool {
        let restore = wantsListen && microphone.running
        if restore { microphone.stop() }
        return restore
    }
    func resumeAssistantAfterDictation(_ restore: Bool) {
        guard restore, wantsListen, !launchingListen, microphone.running == false, host?.isRunning == true else { return }
        guard AVCaptureDevice.authorizationStatus(for: .audio) == .authorized else { return }
        do { try microphone.start(); emit(["type": "microphone", "enabled": true]) }
        catch {
            wantsListen = false; send(["type": "listen", "enabled": false])
            emit(["type": "microphone", "enabled": false])
            self.error("原唤醒监听未恢复，请检查输入设备后重新开启")
        }
    }
}

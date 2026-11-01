import AppKit
import WebKit
import AVFoundation
import Security
import CFNetwork
import LocalAuthentication

enum LegacyAssistantKeychain {
    static let service = "local.codex-weixin.assistant"
    static func read(_ account: String, quiet: Bool = false) -> String {
        var query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
            kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        if quiet { let context = LAContext(); context.interactionNotAllowed = true; query[kSecUseAuthenticationContext as String] = context }
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return "" }
        return String(data: data, encoding: .utf8) ?? ""
    }

}

final class AssistantBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate, AVAudioPlayerDelegate, AVSpeechSynthesizerDelegate {
    weak var web: WKWebView?
    weak var owner: AppDelegate?
    var host: Process?
    var input: Pipe?
    var output = Data()
    let outputLock = NSLock()
    let writeQueue = DispatchQueue(label: "assistant.host.stdin")
    var configuration: [String: Any] = [:]
    var vaultError: String?
    var pendingConfiguration: [String: Any]?
    var microphone = Microphone()
    var meteringTimer: Timer?
    var player: AVAudioPlayer?
    let synthesizer = AVSpeechSynthesizer()
    var wantsListen = false
    var launchingListen = false
    var stoppingAudio = false
    var micObserver: NSObjectProtocol?
    let directory = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".codex-weixin-notifier/assistant")

    init(owner: AppDelegate) {
        self.owner = owner
        super.init()
        synthesizer.delegate = self
        microphone.onSegment = { [weak self] data in self?.send(["type": "audio", "audio": data.base64EncodedString()]) }
        microphone.onLevel = { [weak self] level in self?.emit(["type": "level", "value": level]) }
        do { configuration = try LocalAssistantVault.preferences() }
        catch { vaultError = error.localizedDescription }
        micObserver = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: nil, queue: .main) { [weak self] notification in
            guard let self, self.wantsListen, self.microphone.owns(notification.object) else { return }
            self.microphone.stop(); self.error("声音输入设备发生变化，请关闭再开启语音监听")
            self.wantsListen = false; self.send(["type": "listen", "enabled": false]); self.emit(["type": "microphone", "enabled": false])
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.isFileURL == true,
              let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        switch action {
        case "ready": if let vaultError { error(vaultError) } else { startHost(); owner?.refresh() }
        case "listen": setListen(body["enabled"] as? Bool ?? false)
        case "save": save(body)
        case "migrateKeys":
            do {
                try LocalAssistantVault.migrateLegacy()
                send(["type": "configure", "settings": configuration, "keys": try LocalAssistantVault.keys()])
                emit(["type": "notice", "message": "已迁移可读取的密钥。以后直接使用本地加密库，无需再次读取钥匙串。"])
            } catch { self.error("旧密钥迁移未完成；原钥匙串项已保留。") }
        case "text":
            stopAudio(); send(["type": "text", "text": body["text"] as? String ?? "", "mode": body["mode"] as? String ?? "chat"])
        case "cancel": stopAudio(); send(["type": "cancel"])
        case "activate": stopAudio(); if wantsListen { send(["type": "activate"]) } else { setListen(true); send(["type": "activate"]) }
        case "clear":
            let alert = NSAlert(); alert.messageText = "清空本机助理对话？"; alert.informativeText = "Codex 聊天与微信提醒会保留。"
            alert.addButton(withTitle: "清空对话"); alert.addButton(withTitle: "取消")
            if alert.runModal() == .alertFirstButtonReturn { send(["type": "clear"]) }
        case "fullscreen": owner?.window.toggleFullScreen(nil)
        case "historyPage": send(["type": "historyPage", "before": body["before"] as? Int ?? 9007199254740991, "query": body["query"] as? String ?? ""])
        case "sleep", "targets", "latest", "previewVoice": send(["type": action])
        case "startServices": owner?.startServices()
        case "stopServices": owner?.stopServices()
        case "bind": owner?.bindWeixin()
        case "chooseModel":
            let panel = NSOpenPanel(); panel.canChooseDirectories = false; panel.allowsMultipleSelection = false
            panel.message = "选择本地 Qwen3 ASR 的 GGUF 模型文件"
            if panel.runModal() == .OK, let url = panel.url { emit(["type": "modelPath", "path": url.path]) }
        case "micSettings":
            NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")!)
        default: break
        }
    }
    func startHost() {
        guard host?.isRunning != true, let settings = owner?.settings else { return }
        let process = Process(); process.executableURL = URL(fileURLWithPath: settings.node)
        process.arguments = [settings.runtime + "/src/assistant-host.mjs"]
        process.currentDirectoryURL = URL(fileURLWithPath: settings.runtime)
        var environment = ProcessInfo.processInfo.environment
        if environment["HTTPS_PROXY"] == nil && environment["https_proxy"] == nil && environment["ALL_PROXY"] == nil && environment["all_proxy"] == nil,
           let proxies = CFNetworkCopySystemProxySettings()?.takeRetainedValue() as? [String: Any],
           proxies["HTTPSEnable"] as? Int == 1, let server = proxies["HTTPSProxy"] as? String, let port = proxies["HTTPSPort"] as? Int {
            environment["HTTPS_PROXY"] = "http://\(server):\(port)"
        }
        environment["NODE_USE_ENV_PROXY"] = "1"
        process.environment = environment
        let stdin = Pipe(), stdout = Pipe(); input = stdin; process.standardInput = stdin; process.standardOutput = stdout
        // Native ASR diagnostics are not useful in the UI; no credentials enter logs.
        process.standardError = FileHandle.nullDevice
        stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData; guard !data.isEmpty, let self else { return }
            self.outputLock.lock(); self.output.append(data)
            var messages: [Data] = []
            while let end = self.output.firstIndex(of: 10) { messages.append(self.output.subdata(in: 0..<end)); self.output.removeSubrange(0...end) }
            self.outputLock.unlock()
            for line in messages {
                if let event = try? JSONSerialization.jsonObject(with: line) as? [String: Any] {
                    DispatchQueue.main.async { [weak self] in self?.handle(event) }
                }
            }
        }
        process.terminationHandler = { [weak self] _ in
            stdout.fileHandleForReading.readabilityHandler = nil
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }; self.microphone.stop(); self.wantsListen = false; self.launchingListen = false
                self.emit(["type": "microphone", "enabled": false]); self.error("助理进程已停止，请重新打开客户端；微信后台不受影响")
            }
        }
        host = process
        do {
            try process.run()
            send(["type": "configure", "settings": configuration, "keys": try LocalAssistantVault.keys()])
        } catch { self.error("本机助理启动失败，请重新构建客户端") }
    }
    func send(_ event: [String: Any]) {
        guard let input, let data = try? JSONSerialization.data(withJSONObject: event), host?.isRunning == true else { return }
        writeQueue.async { try? input.fileHandleForWriting.write(contentsOf: data + Data([10])) }
    }
    func emit(_ event: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: event, options: [.sortedKeys]), let json = String(data: data, encoding: .utf8) else { return }
        web?.evaluateJavaScript("window.receive(\(json))", completionHandler: nil)
    }
    func error(_ message: String) { emit(["type": "state", "name": "error", "detail": message]); emit(["type": "error", "message": message]) }
    func handle(_ event: [String: Any]) {
        switch event["type"] as? String {
        case "configured":
            if let config = event["settings"] as? [String: Any] {
                configuration = config; persistConfiguration(); pendingConfiguration = nil
                owner?.window.title = "星核助理 · " + (config["name"] as? String ?? "贾维斯")
                emit(event)
                if config["autoListen"] as? Bool == true { setListen(true, persist: false) }
            }
        case "capture":
            launchingListen = false
            if event["enabled"] as? Bool == true && wantsListen {
                do { try microphone.start(); emit(["type": "microphone", "enabled": true]) }
                catch { wantsListen = false; send(["type": "listen", "enabled": false]); self.error(error.localizedDescription) }
            } else { microphone.stop(); emit(["type": "microphone", "enabled": false]) }
        case "error": launchingListen = false; emit(event)
        case "speak":
            guard let text = event["text"] as? String else { return }
            stopAudio(); microphone.suspend(true); emit(["type": "state", "name": "speaking", "detail": "正在用 Mac 系统声音回复 · 点击打断可继续说"])
            let utterance = AVSpeechUtterance(string: text); utterance.voice = AVSpeechSynthesisVoice(language: "zh-CN"); utterance.rate = 0.48
            synthesizer.speak(utterance)
        case "play":
            guard let base64 = event["audio"] as? String, let data = Data(base64Encoded: base64) else { return }
            stopAudio()
            do {
                player = try AVAudioPlayer(data: data); player?.delegate = self; player?.isMeteringEnabled = true; microphone.suspend(true)
                guard player?.play() == true else { throw NSError(domain: "AssistantAudio", code: 1) }
                meteringTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
                    guard let self, let playing = self.player, playing.isPlaying else { return }
                    playing.updateMeters()
                    let rms = pow(10.0, Double(playing.averagePower(forChannel: 0)) / 20.0)
                    self.emit(["type": "outputLevel", "value": min(1.0, rms * 3.0)])
                }
                emit(["type": "state", "name": "speaking", "detail": "正在用 Fish Audio 回复 · 点击打断可继续说"])
            } catch { self.error("语音播放失败"); microphone.suspend(false); send(["type": "playbackEnded"]) }
        case "stopAudio": stopAudio()
        case "earcon": NSSound(named: "Pop")?.play(); emit(event)
        default: emit(event)
        }
    }
    func stopAudio() {
        meteringTimer?.invalidate(); meteringTimer = nil; emit(["type": "outputLevel", "value": 0])
        stoppingAudio = true; player?.stop(); player = nil; synthesizer.stopSpeaking(at: .immediate); stoppingAudio = false
        microphone.suspend(false)
    }
    func finishedAudio() { meteringTimer?.invalidate(); meteringTimer = nil; emit(["type": "outputLevel", "value": 0]); microphone.suspend(false); send(["type": "playbackEnded"]) }
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) { self.player = nil; finishedAudio() }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) { finishedAudio() }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) { if !stoppingAudio && !synthesizer.isSpeaking { microphone.suspend(false) } }
    func setListen(_ enabled: Bool, persist: Bool = true) {
        if enabled && (microphone.running || launchingListen) { return }
        if persist {
            configuration["autoListen"] = enabled; persistConfiguration()
            emit(["type": "preference", "key": "autoListen", "value": enabled])
        }
        wantsListen = enabled
        guard enabled else { launchingListen = false; microphone.stop(); send(["type": "listen", "enabled": false]); emit(["type": "microphone", "enabled": false]); return }
        launchingListen = true
        AVCaptureDevice.requestAccess(for: .audio) { [weak self] allowed in
            DispatchQueue.main.async {
                guard let self else { return }; self.launchingListen = false
                guard self.wantsListen else { return }
                if allowed { self.launchingListen = true; self.send(["type": "listen", "enabled": true]) }
                else { self.wantsListen = false; self.emit(["type": "microphone", "enabled": false]); self.error("macOS 尚未允许麦克风访问，请在「系统设置 → 隐私与安全性 → 麦克风」开启本客户端") }
            }
        }
    }
    func save(_ body: [String: Any]) {
        guard let config = body["settings"] as? [String: Any] else { return }
        guard let name = config["name"] as? String, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.count <= 30,
              let word = config["wakeWord"] as? String, !word.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, word.count <= 20 else { error("请填写有效的名字和唤醒词"); return }
        do {
            if let key = body["gatewayKey"] as? String, !key.isEmpty { try AssistantSecrets.save("yunqiao", value: key.trimmingCharacters(in: .whitespacesAndNewlines)) }
            if body["removeGateway"] as? Bool == true { try AssistantSecrets.save("yunqiao", value: "") }
            if let key = body["deepseekKey"] as? String, !key.isEmpty { try AssistantSecrets.save("deepseek", value: key.trimmingCharacters(in: .whitespacesAndNewlines)) }
            if let key = body["fishKey"] as? String, !key.isEmpty { try AssistantSecrets.save("fish", value: key.trimmingCharacters(in: .whitespacesAndNewlines)) }
            if body["removeDeepSeek"] as? Bool == true { try AssistantSecrets.save("deepseek", value: "") }
            if body["removeFish"] as? Bool == true { try AssistantSecrets.save("fish", value: "") }
            stopAudio(); microphone.stop(); wantsListen = false; launchingListen = false
            send(["type": "listen", "enabled": false]); pendingConfiguration = config
            send(["type": "configure", "settings": config, "keys": try LocalAssistantVault.keys()])
        } catch { self.error("密钥未能存入本地加密库，未清空原数据") }
    }
    func persistConfiguration() {
        do { try LocalAssistantVault.savePreferences(configuration) }
        catch { self.error("本地加密设置保存失败，未替换原数据。") }
    }
    func shutdown() { wantsListen = false; microphone.stop(); stopAudio(); host?.terminationHandler = nil; input?.fileHandleForWriting.closeFile(); host?.terminate(); if let micObserver { NotificationCenter.default.removeObserver(micObserver) } }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        let root = Bundle.main.resourceURL!.appendingPathComponent("hud").path + "/"
        decisionHandler(url.isFileURL && url.standardizedFileURL.path.hasPrefix(root) ? .allow : .cancel)
    }
}

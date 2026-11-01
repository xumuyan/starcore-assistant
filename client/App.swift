import AppKit
import WebKit

struct Settings: Decodable { let node: String; let runtime: String }
struct Latest: Codable { let project: String; let summary: String; let status: String }
struct Snapshot: Codable {
    let serviceRunning: Bool
    let watching: Bool
    let bound: Bool
    let ready: Bool
    let paused: Bool
    let sent: Int
    let pending: Int
    let uncertain: Int
    let remoteEnabled: Bool
    let remoteProject: String?
    let remoteThreadId: String?
    let remoteStatus: String
    let latest: Latest?
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var settings: Settings!
    var window: NSWindow!
    var statusItem: NSStatusItem!
    var assistant: AssistantBridge!
    var timer: Timer?
    var refreshing = false
    var busy = false
    var loginProcess: Process?
    var loginOutput = ""
    var qrWindow: NSWindow?
    let heading = NSTextField(labelWithString: "正在启动监听…")
    let detail = NSTextField(wrappingLabelWithString: "")
    let monitor = NSTextField(labelWithString: "Codex 监听：正在检查")
    let weixin = NSTextField(labelWithString: "微信连接：正在检查")
    let counts = NSTextField(labelWithString: "")
    let remote = NSTextField(labelWithString: "")
    let latest = NSTextField(wrappingLabelWithString: "还没有提醒记录")
    let startButton = NSButton(title: "开始监听", target: nil, action: nil)
    let stopButton = NSButton(title: "停止监听", target: nil, action: nil)
    let bindButton = NSButton(title: "绑定微信", target: nil, action: nil)

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            let url = Bundle.main.url(forResource: "client-settings", withExtension: "json")!
            settings = try JSONDecoder().decode(Settings.self, from: Data(contentsOf: url))
        } catch { showError("客户端配置读取失败，请重新构建客户端。"); return }
        buildWindow()
        buildMenu()
        showWindow()
        window.toggleFullScreen(nil)
        startServices()
        timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in self?.refresh() }
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(woke), name: NSWorkspace.didWakeNotification, object: nil)
    }

    func label(_ text: String, size: CGFloat = 14, weight: NSFont.Weight = .regular) -> NSTextField {
        let field = NSTextField(labelWithString: text)
        field.font = .systemFont(ofSize: size, weight: weight)
        return field
    }

    func buildWindow() {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 720), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.title = "星核助理 · 贾维斯"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.backgroundColor = NSColor(srgbRed: 0.025, green: 0.047, blue: 0.059, alpha: 1)
        window.appearance = NSAppearance(named: .darkAqua)
        window.minSize = NSSize(width: 980, height: 720)
        window.center(); window.delegate = self; window.isReleasedWhenClosed = false
        assistant = AssistantBridge(owner: self)
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(assistant, name: "assistant")
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.setValue(false, forKey: "drawsBackground")
        web.navigationDelegate = assistant; assistant.web = web
        let container = NSView(frame: window.contentView?.bounds ?? .zero)
        container.wantsLayer = true
        container.layer?.backgroundColor = window.backgroundColor.cgColor
        window.contentView = container
        web.translatesAutoresizingMaskIntoConstraints = false; container.addSubview(web)
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            web.topAnchor.constraint(equalTo: container.topAnchor),
            web.bottomAnchor.constraint(equalTo: container.bottomAnchor)
        ])
        let url = Bundle.main.resourceURL!.appendingPathComponent("hud/index.html")
        web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
    }

    func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem()
        let applicationMenu = NSMenu(title: "星核助理")
        let reopen = NSMenuItem(title: "显示客户端", action: #selector(showWindow), keyEquivalent: "0")
        reopen.target = self
        applicationMenu.addItem(reopen)
        applicationMenu.addItem(.separator())
        let appQuit = NSMenuItem(title: "退出客户端（后台继续运行）", action: #selector(quitClient), keyEquivalent: "q")
        appQuit.target = self
        applicationMenu.addItem(appQuit)
        appItem.submenu = applicationMenu
        main.addItem(appItem)
        let editItem = NSMenuItem()
        let edit = NSMenu(title: "编辑")
        for (title, selector, key) in [("撤销", Selector(("undo:")), "z"), ("剪切", #selector(NSText.cut(_:)), "x"), ("复制", #selector(NSText.copy(_:)), "c"), ("粘贴", #selector(NSText.paste(_:)), "v"), ("全选", #selector(NSText.selectAll(_:)), "a")] {
            edit.addItem(NSMenuItem(title: title, action: selector, keyEquivalent: key))
        }
        editItem.submenu = edit; main.addItem(editItem)
        NSApp.mainMenu = main
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem.button?.image = NSImage(systemSymbolName: "bell.badge", accessibilityDescription: "星核助理")
        let menu = NSMenu()
        for (title, selector) in [("显示客户端", #selector(showWindow)), ("开始监听", #selector(startServices)), ("停止监听", #selector(stopServices)), ("绑定微信", #selector(bindWeixin))] {
            let item = NSMenuItem(title: title, action: selector, keyEquivalent: "")
            item.target = self
            menu.addItem(item)
        }
        menu.addItem(.separator())
        let quit = NSMenuItem(title: "退出客户端（后台继续运行）", action: #selector(quitClient), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
        statusItem.menu = menu
    }

    @objc func showWindow() {
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showWindow(); return true }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    @objc func woke() { refresh(); if assistant?.configuration["autoListen"] as? Bool == true { assistant?.setListen(true, persist: false) } }
    @objc func quitClient() { NSApp.terminate(nil) }
    func applicationWillTerminate(_ notification: Notification) { loginProcess?.terminate(); assistant?.shutdown() }

    func runControl(_ command: String, completion: @escaping (Snapshot?, String?) -> Void) {
        let configuration = settings!
        DispatchQueue.global(qos: .utility).async {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: configuration.node)
            process.arguments = [configuration.runtime + "/src/client-control.mjs", command]
            process.currentDirectoryURL = URL(fileURLWithPath: configuration.runtime)
            let output = Pipe()
            process.standardOutput = output
            process.standardError = FileHandle.nullDevice
            do {
                try process.run()
                let data = output.fileHandleForReading.readDataToEndOfFile()
                process.waitUntilExit()
                let snapshot = try JSONDecoder().decode(Snapshot.self, from: data)
                DispatchQueue.main.async { completion(snapshot, nil) }
            } catch {
                DispatchQueue.main.async { completion(nil, "无法读取后台服务，请检查本地安装。") }
            }
        }
    }

    func render(_ s: Snapshot) {
        if let data = try? JSONEncoder().encode(s), let snapshot = try? JSONSerialization.jsonObject(with: data) {
            assistant?.emit(["type": "snapshot", "snapshot": snapshot])
        }
        monitor.stringValue = "Codex 监听：" + (s.watching ? "运行中" : "未运行")
        weixin.stringValue = "微信连接：" + (!s.bound ? "未绑定" : s.ready ? "可以推送" : s.paused ? "已暂停" : s.serviceRunning ? "等待微信会话" : "未启动")
        counts.stringValue = "已发送 \(s.sent) 条     待发送 \(s.pending) 条     结果未确认 \(s.uncertain) 条"
        remote.stringValue = "手机续写：\(s.remoteEnabled ? "开启" : "关闭") · \(s.remoteProject ?? "等待新提醒") · \(s.remoteStatus)"
        if s.watching && s.ready {
            heading.stringValue = "正在监听，微信可推送"
            heading.textColor = .systemGreen
            detail.stringValue = "Codex 每轮结束后，将自动把项目名和最终回复摘要发到微信。"
        } else if !s.bound {
            heading.stringValue = "先连接你的微信"
            heading.textColor = .labelColor
            detail.stringValue = "点击「绑定微信」，扫描窗口里的实时二维码。"
        } else if s.watching && s.serviceRunning {
            heading.stringValue = "监听已开启，等待微信会话"
            heading.textColor = .systemOrange
            detail.stringValue = "在手机 ClawBot 发送「开启提醒」，收到回复后即可自动推送。"
        } else {
            heading.stringValue = "监听已停止或正在启动"
            heading.textColor = .secondaryLabelColor
            detail.stringValue = "点击「开始监听」启动后台服务；如持续无法运行，可重新打开客户端。"
        }
        bindButton.title = s.bound ? "重新绑定微信" : "绑定微信"
        if let event = s.latest {
            let state = event.status == "sent" ? "已发送" : event.status == "pending" ? "待发送" : "结果未确认"
            let preview = event.summary.replacingOccurrences(of: "\n", with: " ").replacingOccurrences(of: "**", with: "")
            latest.stringValue = "\(event.project) · \(state)\n\(preview.prefix(170))\(preview.count > 170 ? "…" : "")"
        }
        statusItem?.button?.toolTip = heading.stringValue
    }

    func refresh() {
        guard !refreshing && !busy else { return }
        refreshing = true
        runControl("status") { [weak self] snapshot, error in
            guard let self else { return }
            self.refreshing = false
            if let snapshot { self.render(snapshot) }
            else { self.detail.stringValue = error ?? "读取失败" }
        }
    }

    func setBusy(_ value: Bool) {
        busy = value
        for button in [startButton, stopButton, bindButton] { button.isEnabled = !value }
    }
    @objc func startServices() {
        guard !busy else { return }
        setBusy(true)
        runControl("start") { [weak self] snapshot, error in
            guard let self else { return }
            self.setBusy(false)
            if let snapshot { self.render(snapshot) }
            else { self.showError(error ?? "启动失败") }
            self.refresh()
        }
    }
    @objc func stopServices() {
        guard !busy else { return }
        setBusy(true)
        runControl("stop") { [weak self] snapshot, error in
            guard let self else { return }
            self.setBusy(false)
            if let snapshot { self.render(snapshot) }
            else { self.showError(error ?? "停止失败") }
        }
    }

    @objc func bindWeixin() {
        if loginProcess?.isRunning == true { qrWindow?.makeKeyAndOrderFront(nil); return }
        let alert = NSAlert()
        alert.messageText = "绑定微信 ClawBot"
        alert.informativeText = "绑定期间会暂停微信推送，Codex 监听会继续保留新任务。请在扫码成功后，到 ClawBot 发送「开启提醒」。"
        alert.addButton(withTitle: "显示二维码")
        alert.addButton(withTitle: "取消")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        // The QR client only stops the sender, preserving task collection.
        let stop = Process()
        stop.executableURL = URL(fileURLWithPath: "/bin/launchctl")
        stop.arguments = ["bootout", "gui/\(getuid())/local.codex-weixin-notifier"]
        stop.standardOutput = FileHandle.nullDevice
        stop.standardError = FileHandle.nullDevice
        try? stop.run()
        stop.waitUntilExit()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: settings.node)
        process.arguments = [settings.runtime + "/src/cli.mjs", "login"]
        process.currentDirectoryURL = URL(fileURLWithPath: settings.runtime)
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        loginOutput = ""
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async {
                guard let self else { return }
                self.loginOutput += text
                if self.qrWindow == nil, let range = self.loginOutput.range(of: #"LOGIN_PAGE (http://127\.0\.0\.1:\d+/)"#, options: .regularExpression) {
                    let urlText = String(self.loginOutput[range]).replacingOccurrences(of: "LOGIN_PAGE ", with: "")
                    if let url = URL(string: urlText) { self.showQR(url) }
                }
            }
        }
        process.terminationHandler = { [weak self] task in
            pipe.fileHandleForReading.readabilityHandler = nil
            DispatchQueue.main.async {
                guard let self else { return }
                self.loginProcess = nil
                self.qrWindow = nil
                if task.terminationStatus != 0 { self.showError("本次扫码未完成，请重新点击绑定微信。") }
                self.startServices()
            }
        }
        loginProcess = process
        do { try process.run() } catch { loginProcess = nil; showError("二维码服务未能启动。") }
    }

    func showQR(_ url: URL) {
        let qr = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 600, height: 720), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        qr.title = "绑定微信 · 二维码自动更新"
        qr.isReleasedWhenClosed = false
        let web = WKWebView(frame: .zero)
        qr.contentView = web
        web.load(URLRequest(url: url))
        qr.center()
        qr.makeKeyAndOrderFront(nil)
        qrWindow = qr
    }
    func showError(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "星核助理"
        alert.informativeText = message
        alert.runModal()
    }
}

@main
enum AssistantMain {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        withExtendedLifetime(delegate) { app.run() }
    }
}

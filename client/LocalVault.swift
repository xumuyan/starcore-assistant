import Foundation
import CryptoKit

// AES-GCM format shared with assistant-vault.mjs:
// JRV1 | 12-byte nonce | ciphertext | 16-byte authentication tag.
enum LocalAssistantVault {
    static let root = ProcessInfo.processInfo.environment["JARVIS_VAULT_TEST_DIR"].map { URL(fileURLWithPath: $0) } ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".codex-weixin-notifier/assistant")
    static func failure(_ text: String) -> NSError { NSError(domain: "AssistantVault", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
    static func prepare() throws {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: root.path)
    }
    static func master() throws -> SymmetricKey {
        try prepare()
        let url = root.appendingPathComponent("master.key")
        if !FileManager.default.fileExists(atPath: url.path) {
            if ["credentials.bin", "preferences.bin"].contains(where: { FileManager.default.fileExists(atPath: root.appendingPathComponent($0).path) }) {
                throw failure("本地解密密钥缺失，请恢复原 master.key；没有覆盖加密数据。")
            }
            let key = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
            do { try key.write(to: url, options: .withoutOverwriting) }
            catch { if !FileManager.default.fileExists(atPath: url.path) { throw error } }
        }
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        guard attributes[.type] as? FileAttributeType == .typeRegular,
              (attributes[.ownerAccountID] as? NSNumber)?.uint32Value == getuid() else { throw failure("本地密钥文件状态异常。") }
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        let data = try Data(contentsOf: url)
        guard data.count == 32 else { throw failure("本地密钥格式无效。") }
        return SymmetricKey(data: data)
    }
    static func seal(_ data: Data, purpose: String) throws -> Data {
        let key = try master()
        let box = try AES.GCM.seal(data, using: key, authenticating: Data("jarvis/v1/\(purpose)".utf8))
        guard let combined = box.combined else { throw failure("无法创建加密数据。") }
        return Data("JRV1".utf8) + combined
    }
    static func open(_ data: Data, purpose: String) throws -> Data {
        guard data.count >= 32, data.prefix(4) == Data("JRV1".utf8) else { throw failure("加密文件格式无效。") }
        let key = try master()
        do { return try AES.GCM.open(AES.GCM.SealedBox(combined: data.dropFirst(4)), using: key, authenticating: Data("jarvis/v1/\(purpose)".utf8)) }
        catch { throw failure("加密文件校验失败；未覆盖原数据。") }
    }
    static func write(_ data: Data, name: String, purpose: String) throws {
        let url = root.appendingPathComponent(name)
        let sealed = try seal(data, purpose: purpose)
        guard try open(sealed, purpose: purpose) == data else { throw failure("加密读回校验失败。") }
        try sealed.write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        guard try open(Data(contentsOf: url), purpose: purpose) == data else { throw failure("文件读回校验失败。") }
    }
    static func keys() throws -> [String: String] {
        let url = root.appendingPathComponent("credentials.bin")
        if FileManager.default.fileExists(atPath: url.path) {
            return try JSONDecoder().decode([String: String].self, from: open(Data(contentsOf: url), purpose: "credentials"))
        }
        // The first quiet migration never displays authorization UI. Anything
        // blocked remains in Keychain until the user chooses one-time migration.
        var values: [String: String] = [:]
        for account in ["yunqiao", "deepseek", "fish"] {
            let value = LegacyAssistantKeychain.read(account, quiet: true)
            if !value.isEmpty { values[account] = value }
        }
        try write(JSONEncoder().encode(values), name: "credentials.bin", purpose: "credentials")
        return values
    }
    static func saveKey(_ account: String, value: String) throws {
        var values = try keys()
        if value.isEmpty { values.removeValue(forKey: account) } else { values[account] = value }
        try write(JSONEncoder().encode(values), name: "credentials.bin", purpose: "credentials")
    }
    static func migrateLegacy() throws {
        var values = try keys()
        for account in ["yunqiao", "deepseek", "fish"] where values[account, default: ""].isEmpty {
            let value = LegacyAssistantKeychain.read(account, quiet: false)
            if !value.isEmpty { values[account] = value }
        }
        try write(JSONEncoder().encode(values), name: "credentials.bin", purpose: "credentials")
    }
    static func preferences() throws -> [String: Any] {
        let url = root.appendingPathComponent("preferences.bin"), legacy = root.appendingPathComponent("settings.json")
        if FileManager.default.fileExists(atPath: url.path) {
            guard let result = try JSONSerialization.jsonObject(with: open(Data(contentsOf: url), purpose: "preferences")) as? [String: Any] else { throw failure("设置格式无效。") }
            return result
        }
        _ = try master()
        if FileManager.default.fileExists(atPath: legacy.path) {
            let data = try Data(contentsOf: legacy)
            guard let result = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw failure("旧设置格式无效。") }
            try write(data, name: "preferences.bin", purpose: "preferences")
            try FileManager.default.removeItem(at: legacy)
            return result
        }
        return [:]
    }
    static func savePreferences(_ values: [String: Any]) throws {
        try write(JSONSerialization.data(withJSONObject: values, options: [.sortedKeys]), name: "preferences.bin", purpose: "preferences")
    }
}

enum AssistantSecrets {
    // Keep the call site stable; this adapter no longer writes to Keychain.
    static func save(_ account: String, value: String) throws { try LocalAssistantVault.saveKey(account, value: value) }
}

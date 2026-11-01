import Foundation

enum LegacyAssistantKeychain {
    static func read(_ account: String, quiet: Bool) -> String { "" }
}

@main
enum VaultInterop {
    static func main() throws {
        guard ProcessInfo.processInfo.environment["JARVIS_VAULT_TEST_DIR"] != nil else { exit(2) }
        if CommandLine.arguments.last == "create" {
            try LocalAssistantVault.saveKey("fixture", value: "synthetic-test-key")
            try LocalAssistantVault.savePreferences(["fixture": "中文互通验证"])
        } else {
            let url = LocalAssistantVault.root.appendingPathComponent("node.bin")
            let data = try LocalAssistantVault.open(Data(contentsOf: url), purpose: "fixture")
            guard String(data: data, encoding: .utf8) == "Node to Swift 验证" else { exit(3) }
        }
        print("SWIFT_VAULT_PASS")
    }
}

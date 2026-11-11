// 金库互操作测试：node 版（test/fixtures/vault-vectors.json）加密的数据必须能被
// rust 版开封；rust 版自封自开往返一致；purpose 绑定（AAD）篡改必须被拒绝。
use moss_host::*;
use serde_json::Value;
use std::path::PathBuf;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()
}

fn vectors() -> Value {
    serde_json::from_str(&std::fs::read_to_string(repo_root().join("test/fixtures/vault-vectors.json")).unwrap()).unwrap()
}

fn key_from_hex(hex: &str) -> [u8; 32] {
    let mut key = [0u8; 32];
    for i in 0..32 {
        key[i] = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).unwrap();
    }
    key
}

fn hex_decode(hex: &str) -> Vec<u8> {
    (0..hex.len()).step_by(2).map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap()).collect()
}

#[test]
fn opens_node_sealed_vectors() {
    let v = vectors();
    // 用共享测试密钥替代真实 master.key。
    let vault = Vault::with_key(key_from_hex(v["keyHex"].as_str().unwrap()));
    for case in v["cases"].as_array().unwrap() {
        let purpose = case["purpose"].as_str().unwrap();
        let plain = vault.open_data(&hex_decode(case["sealedHex"].as_str().unwrap()), purpose);
        let plain = plain.unwrap_or_else(|e| panic!("开封 {purpose} 失败：{e}"));
        if let Some(expect) = case.get("plain") {
            let got: Value = serde_json::from_slice(&plain).unwrap();
            assert_eq!(got, *expect, "{purpose} 明文 JSON 不一致");
        } else {
            assert_eq!(String::from_utf8(plain).unwrap(), case["plainUtf8"].as_str().unwrap(), "{purpose} 明文不一致");
        }
    }
}

#[test]
fn seal_open_roundtrip_and_purpose_binding() {
    let v = vectors();
    let vault = Vault::with_key(key_from_hex(v["keyHex"].as_str().unwrap()));
    let payload = serde_json::json!({ "role": "user", "content": "rust 封装往返" }).to_string().into_bytes();
    let sealed = vault.seal(&payload, "message/9").unwrap();
    assert_eq!(&sealed[..4], b"JRV1");
    assert_eq!(vault.open_data(&sealed, "message/9").unwrap(), payload);
    // purpose（AAD）不一致必须被拒。
    assert!(vault.open_data(&sealed, "message/10").is_err());
    // 篡改密文必须被拒。
    let mut tampered = sealed.clone();
    tampered[20] ^= 0xff;
    assert!(vault.open_data(&tampered, "message/9").is_err());
    // 魔数不对必须被拒。
    let mut bad = sealed.clone();
    bad[0] = b'X';
    assert!(vault.open_data(&bad, "message/9").is_err());
}

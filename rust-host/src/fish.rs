//! Fish Audio synthesis for chat replies and completion reminders. Like the
//! node service, snapshots (endpoint, key, model, voice, spoken text, timeout)
//! are frozen before the worker starts; the HTTP round trip runs WITHOUT the
//! Session lock, and results are re-validated against the playback claim before
//! any event is emitted. Endpoint/headers/body/45s timeout/20 MiB cap/fallback
//! strings mirror src/assistant-service.mjs speak(). MOSS_FISH_URL and
//! MOSS_FISH_TIMEOUT_MS exist for sandbox tests only; production defaults match
//! node. This module never writes chat memory and never dispatches to Codex.
use std::io::Read;
use std::time::Duration;

const DEFAULT_FISH_URL: &str = "https://api.fish.audio/v1/tts";
const DEFAULT_FISH_TIMEOUT: Duration = Duration::from_secs(45);
const MAX_AUDIO_BYTES: usize = 20 * 1024 * 1024;

pub fn endpoint() -> String {
    std::env::var("MOSS_FISH_URL").unwrap_or_else(|_| DEFAULT_FISH_URL.to_string())
}

pub fn timeout() -> Duration {
    std::env::var("MOSS_FISH_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .map(Duration::from_millis)
        .unwrap_or(DEFAULT_FISH_TIMEOUT)
}

#[derive(Clone)]
pub struct FishJob {
    /// Chat reply this synthesis belongs to; reminders have None. While Some,
    /// the generation stays claimed so a new text is rejected like node busy.
    pub generation: Option<u64>,
    /// Playback slot claimed when synthesis started; the same ID covers the
    /// audio (play) or the system-voice fallback (speak).
    pub playback: String,
    pub url: String,
    pub key: String,
    pub model: String,
    pub voice_id: String,
    pub text: String,
    pub timeout: Duration,
}

impl FishJob {
    pub fn request(&self) -> Result<String, String> {
        let agent = ureq::AgentBuilder::new().timeout(self.timeout).build();
        let body = if self.voice_id.is_empty() {
            serde_json::json!({ "text": self.text, "format": "mp3" })
        } else {
            serde_json::json!({ "text": self.text, "format": "mp3", "reference_id": self.voice_id })
        };
        let response = agent
            .post(&self.url)
            .set("Authorization", &format!("Bearer {}", self.key))
            .set("Content-Type", "application/json")
            .set("model", &self.model)
            .timeout(self.timeout)
            .send_json(body)
            .map_err(|error| match error {
                ureq::Error::Status(code, _) => format!("Fish Audio 请求失败（HTTP {code}）"),
                _ => format!("Fish Audio 合成失败：{error}"),
            })?;
        // Bound the body read before decoding; node caps the buffer at 20 MiB
        // and rejects empty payloads with the same wording.
        let mut bytes = Vec::new();
        response
            .into_reader()
            .take((MAX_AUDIO_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|_| "语音响应大小异常".to_string())?;
        if bytes.is_empty() || bytes.len() > MAX_AUDIO_BYTES {
            return Err("语音响应大小异常".to_string());
        }
        Ok(base64_encode(&bytes))
    }
}

/// RFC 4648 standard alphabet with padding, matching node Buffer.toString('base64').
pub fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[(n >> 18) as usize & 63] as char);
        out.push(TABLE[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { TABLE[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[n as usize & 63] as char } else { '=' });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_rfc_4648_vectors() {
        let cases = [
            ("", ""),
            ("f", "Zg=="),
            ("fo", "Zm8="),
            ("foo", "Zm9v"),
            ("foob", "Zm9vYg=="),
            ("fooba", "Zm9vYmE="),
            ("foobar", "Zm9vYmFy"),
        ];
        for (input, expected) in cases {
            assert_eq!(base64_encode(input.as_bytes()), expected);
        }
        // Multi-byte UTF-8 uses the same alphabet and padding as node.
        assert_eq!(base64_encode("沐言".as_bytes()), "5rKQ6KiA");
        assert_eq!(base64_encode(&[0, 250, 195, 7]), "APrDBw==");
    }

    #[test]
    fn fish_overrides_default_to_node_production_values() {
        // Sandbox-only overrides must not leak into defaults.
        std::env::remove_var("MOSS_FISH_URL");
        std::env::remove_var("MOSS_FISH_TIMEOUT_MS");
        assert_eq!(endpoint(), "https://api.fish.audio/v1/tts");
        assert_eq!(timeout(), Duration::from_secs(45));
    }
}

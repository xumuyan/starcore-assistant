//! moss-host 库层：聊天、金库、serve、状态与控制模块供 bin 与集成测试共用。
pub mod chat;
pub mod memory;
pub mod reminder;
pub mod control;
pub mod serve;
pub mod status;
pub mod vault;

pub use vault::Vault;

mod chat;
mod control;
mod serve;
mod status;

use std::process::exit;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let command = args.get(1).map(String::as_str).unwrap_or("status");
    match command {
        "--version" | "version" => println!("moss-host {}", env!("CARGO_PKG_VERSION")),
        // 与 node 版一致：start/stop 执行动作后同样输出 status 快照。
        "start" | "stop" => {
            control::run(command);
            println!("{}", status::snapshot_json());
        }
        "status" => println!("{}", status::snapshot_json()),
        // Rust 阶段二（P2）：宿主 stdio JSON 行协议最小子集（tasks/configure/listen 形状对齐）。
        "serve" => serve::run(),
        other => {
            eprintln!("Unsupported command: {}", other);
            exit(2);
        }
    }
}

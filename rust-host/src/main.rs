mod control;
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
        other => {
            eprintln!("Unsupported command: {}", other);
            exit(2);
        }
    }
}

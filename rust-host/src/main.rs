mod status;

use std::process::exit;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let command = args.get(1).map(String::as_str).unwrap_or("status");
    match command {
        "--version" | "version" => println!("moss-host {}", env!("CARGO_PKG_VERSION")),
        "status" => println!("{}", status::snapshot_json()),
        other => {
            eprintln!("Unsupported command: {}", other);
            exit(2);
        }
    }
}

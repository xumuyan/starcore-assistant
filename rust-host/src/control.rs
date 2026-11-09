// moss-host start/stop：与 src/client-control.mjs 的 start/stop 命令逐调用对齐。
// 语义基准：operatelog SC-20261109-012 之后的行为——
//   start：Disabled 的代理跳过（绝不复活用户停用的微信代理）；已注册跳过；否则 bootstrap（失败吞掉）。
//   stop：倒序 bootout（先桌面监视后微信 bot），失败吞掉；node 版此处硬编码 /bin/launchctl，本实现保持一致。
// 两者的 stdout 都由随后的 status 快照输出（与 node 版一致），本模块只负责动作。
use crate::status::{home_dir, launchctl_path, plutil_path, domain, LABELS};
use serde_json::Value;
use std::path::Path;
use std::process::{Command, Stdio};

/// node 版 plistDisabled：plutil -convert json 解析，Disabled === true 才算停用；
/// 文件缺失、plutil 失败、JSON 损坏一律视为未停用（与 node 版 catch { return false; } 一致）。
pub fn plist_disabled(plutil: &str, launch_agents: &Path, label: &str) -> bool {
    let plist = launch_agents.join(format!("{label}.plist"));
    let output = Command::new(plutil)
        .args(["-convert", "json", "-o", "-"])
        .arg(&plist)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output();
    match output {
        Ok(out) if out.status.success() => {
            serde_json::from_str::<Value>(&String::from_utf8_lossy(&out.stdout))
                .ok()
                .and_then(|value| value.get("Disabled").cloned())
                == Some(Value::Bool(true))
        }
        _ => false,
    }
}

/// 已注册（可能等待重启）则不重复注册；node 版用 try/catch 包 print 的语义等价。
pub fn is_registered(launchctl: &str, domain: &str, label: &str) -> bool {
    Command::new(launchctl)
        .args(["print", &format!("{domain}/{label}")])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

pub fn start_agents(launchctl: &str, launch_agents: &Path, domain: &str, plutil: &str) {
    for label in LABELS {
        if plist_disabled(plutil, launch_agents, label) {
            continue;
        }
        if is_registered(launchctl, domain, label) {
            continue;
        }
        let plist = launch_agents.join(format!("{label}.plist"));
        let _ = Command::new(launchctl)
            .args(["bootstrap", domain])
            .arg(&plist)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output();
    }
}

pub fn stop_agents(launchctl: &str, domain: &str) {
    for label in LABELS.iter().rev() {
        let _ = Command::new(launchctl)
            .args(["bootout", &format!("{domain}/{label}")])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output();
    }
}

/// 生产入口：与 node 版完全相同的参数来源（MOSS_LAUNCHCTL / MOSS_PLUTIL / HOME / getuid domain）。
pub fn run(command: &str) {
    let launchctl = launchctl_path();
    let domain = &domain();
    if command == "start" {
        let launch_agents = home_dir().join("Library/LaunchAgents");
        start_agents(&launchctl, &launch_agents, domain, &plutil_path());
    } else if command == "stop" {
        // node 版 stop 硬编码 /bin/launchctl，不走注入；保持一致。
        stop_agents("/bin/launchctl", domain);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!(
            "moss-host-control-{}-{}-{}",
            tag,
            std::process::id(),
            nanos
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn fixture_plist(dir: &Path, label: &str, disabled: bool) {
        let disabled_line = if disabled { "<key>Disabled</key><true/>" } else { "<key>RunAtLoad</key><true/>" };
        fs::write(
            dir.join(format!("{label}.plist")),
            format!(
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<plist version=\"1.0\"><dict><key>Label</key><string>{label}</string>{disabled_line}</dict></plist>\n"
            ),
        )
        .unwrap();
    }

    /// 假 launchctl：记录全部调用；print 退出码可配（1=未注册），其余动作成功。
    fn fake_launchctl(dir: &Path, log: &Path, print_exit: i32) -> String {
        let script = dir.join("fake-launchctl.sh");
        fs::write(
            &script,
            format!(
                "#!/bin/bash\necho \"$*\" >> \"{}\"\nif [ \"$1\" = \"print\" ]; then exit {}; fi\nexit 0\n",
                log.display(),
                print_exit
            ),
        )
        .unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
        script.to_string_lossy().to_string()
    }

    fn log_contents(log: &Path) -> String {
        fs::read_to_string(log).unwrap_or_default()
    }

    #[test]
    fn start_never_bootstraps_disabled_agents() {
        if !cfg!(target_os = "macos") { return; } // plutil 语义
        let dir = temp_dir("disabled");
        let agents = dir.join("LaunchAgents");
        fs::create_dir_all(&agents).unwrap();
        for label in LABELS {
            fixture_plist(&agents, label, true);
        }
        let log = dir.join("launchctl.log");
        let fake = fake_launchctl(&dir, &log, 1);
        start_agents(&fake, &agents, "gui/test", "/usr/bin/plutil");
        assert!(!log_contents(&log).contains("bootstrap"), "Disabled 代理绝不引导");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn start_bootstraps_enabled_unregistered_agents() {
        if !cfg!(target_os = "macos") { return; }
        let dir = temp_dir("enabled");
        let agents = dir.join("LaunchAgents");
        fs::create_dir_all(&agents).unwrap();
        for label in LABELS {
            fixture_plist(&agents, label, false);
        }
        let log = dir.join("launchctl.log");
        let fake = fake_launchctl(&dir, &log, 1);
        start_agents(&fake, &agents, "gui/test", "/usr/bin/plutil");
        let text = log_contents(&log);
        assert_eq!(
            text.matches("bootstrap").count(),
            2,
            "两个启用中的代理都引导"
        );
        for label in LABELS {
            assert!(text.contains(&format!("bootstrap gui/test {}/{}.plist", agents.display(), label)));
        }
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn start_skips_registered_agents() {
        if !cfg!(target_os = "macos") { return; }
        let dir = temp_dir("registered");
        let agents = dir.join("LaunchAgents");
        fs::create_dir_all(&agents).unwrap();
        for label in LABELS {
            fixture_plist(&agents, label, false);
        }
        let log = dir.join("launchctl.log");
        // print 成功 = 已注册：不再 bootstrap（对应 node 版「可能等待重启」分支）。
        let fake = fake_launchctl(&dir, &log, 0);
        start_agents(&fake, &agents, "gui/test", "/usr/bin/plutil");
        assert!(!log_contents(&log).contains("bootstrap"), "已注册不重复引导");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn stop_bootouts_in_reverse_order() {
        let dir = temp_dir("stop");
        let log = dir.join("launchctl.log");
        let fake = fake_launchctl(&dir, &log, 1);
        stop_agents(&fake, "gui/test");
        let text = log_contents(&log);
        let first = text.lines().next().unwrap_or("");
        assert!(
            first.ends_with(&format!("bootout gui/test/{}", LABELS[1])),
            "stop 先停桌面监视（倒序），实际首行: {first}"
        );
        assert!(text.contains(&format!("bootout gui/test/{}", LABELS[0])));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn plist_disabled_garbage_or_missing_is_false() {
        if !cfg!(target_os = "macos") { return; }
        let dir = temp_dir("garbage");
        let agents = dir.join("LaunchAgents");
        fs::create_dir_all(&agents).unwrap();
        fs::write(agents.join(format!("{}.plist", LABELS[0])), "not a plist").unwrap();
        assert!(!plist_disabled("/usr/bin/plutil", &agents, LABELS[0]), "损坏 plist 视为未停用");
        assert!(!plist_disabled("/usr/bin/plutil", &agents, LABELS[1]), "缺失 plist 视为未停用");
        fs::remove_dir_all(&dir).ok();
    }
}

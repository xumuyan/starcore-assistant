fn main() {
    let manifest = tauri_build::AppManifest::new().commands(&[
        "probe_snapshot",
        "probe_open",
        "probe_demo",
        "probe_hide",
        "probe_hotkey",
        "probe_quit",
        "probe_check_ready",
        "probe_check_rendered",
        "probe_check",
        "probe_check_finish",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("bounded probe ACL build failed");
}

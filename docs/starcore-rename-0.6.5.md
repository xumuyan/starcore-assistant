# 星核助理 · 0.6.5 / build 15

应用正式命名为「星核助理」（STARCORE），采用已生成并选定的 AppIcon-v3.png。

- 应用包：`~/Applications/星核助理.app`。
- CFBundleName、CFBundleDisplayName、应用菜单、提示框、窗口标题与页面副品牌同步更新。
- 助理个性称呼与唤醒词保持用户原配置；标题为“星核助理 · [助理称呼]”。
- 图标资源改为 StarCoreIcon-v3.icns，并更新 bundle 版本，避免继续引用旧资源路径。
- 保留原 bundle identifier、内部可执行文件名和运行数据目录，避免把改名变成一次全新安装。

原应用目录在同一 Applications 目录中改名，顶层 inode 保持不变，便于文件书签和快捷方式跟随；Contents 完整替换为通过签名校验的新构建，旧应用路径不再保留重复入口。旧版完整包位于 `dist/backups/Codex 微信提醒-0.6.4-14.app`，迁移前 Contents 另保存在 `dist/backups/name-migration-0.6.4-14-contents`。

校验：arm64 构建成功，严格签名校验通过；安装包 ICNS 与新构建 SHA-256 一致；原生窗口与应用菜单显示新名称，动态效果正在运行，加密密钥状态恢复。未改用户设置或聊天数据，未调用付费接口。Dock 系统界面直接读取超时，未将其作为图形验收证据；未强制重启 Dock。新应用已由新路径打开。

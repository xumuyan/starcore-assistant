# SC-20261128-002 Beam探针安装替换

- 记录时间：2026-11-28 10:54:23 +08:00。用户明确授权安装新包并替换旧包；目标仅 /Applications/MOSS T0 Probe.app，不是 ~/Applications/MuYan.app，也不是沐宿。
- 用户此前反馈菜单点不开。只读查询发现运行的是安装副本，非上一批临时Beam包；两者程序摘要不同。此证据未确认故障根因，当前未确认修复，需重新点击验收。
- 源包：/private/tmp/moss-t0-artifact-FXWogm，源码提交60b9280b4dd9ba6324ac9fdefc8252321405a3ae，dirty=false。复核manifest及严格签名后，先复制到Applications内唯一暂存目录，再核对二进制/整包摘要。无重新签名、无公证声明。
- 旧安装身份核对为dev.starcore.moss.t0-probe；精确路径查询PID 83696，仅对此进程发送SIGTERM，随后成功查询无同路径进程。此操作不是设置退出按钮验收，也不证明全部子进程/资源清理。
- 将旧包移至备份：~/Library/Application Support/MOSS T0 Probe Backups/SC-20261128-002-tet1Zm/MOSS T0 Probe.app；备份整包摘要与替换前一致。同目录installation.json记录来源及摘要。回退时先退出新探针，再恢复此旧包；旧包历史签名及菜单问题不因备份而获得通过结论。
- 新安装二进制SHA256：91ddb238320778bdc3546a474980af49371e2e2d633e6e37d59bf13bf1df1ac4；整包SHA256：2e5d0743bb57034d0c57e43f9d18cf612057d43916e822b195798e352e78dca5。安装后verifyBundle严格签名、二进制和整包比对通过。
- 精确路径open安装包后，查询新PID 93672。仅证明启动与路径，不证明菜单像素/点击成功。源manifest中的installed/launched=false描述打包时状态，未修改源清单；本记录补充随后安装与启动事实。
- 未改产品源码、配置、权限、launchd或旧沐言；本批为已构建包安装及证据更新，未重复原生构建。相关测试与完整回归结果见操作日志。

下一步：真实点击新版菜单栏图标，确认一个整体Beam菜单；测试历史/设置、再次点击和一秒后外点收起。新样式视觉/裁切及完整T0矩阵仍待验收。T0未验收，T1未启动。

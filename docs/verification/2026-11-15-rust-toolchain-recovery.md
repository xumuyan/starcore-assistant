# Rust 工具链恢复与回归检查点 · SC-20261115-001

## 范围

仅恢复开发工具并记录证据，不改产品、离线模型、测试超时或默认工具链配置；未安装或替换运行中的助理，不接真实剪贴板或输入。SC-20261114-021 仍未整批验收。T0 未验收、T1 未启动，G1～G6 仍未验收。

## 官方下载路径与完整性

static.rust-lang.org 解析不稳定：一次取得 stable 1.100.0 清单，但 rustc 组件下载再次 DNS 失败；普通及提升网络权限的标准安装均未恢复。公共 DNS 查询亦未解决。

通过 Rust 官方基础设施仓库核实源站，不是第三方镜像：

- [生产配置](https://github.com/rust-lang/simpleinfra/blob/master/terragrunt/accounts/legacy/releases-prod/release-distribution/terragrunt.hcl) 将 static_domain_name=static.rust-lang.org 与 static_bucket=static-rust-lang-org 关联；本次读取 Git blob 为 a3f9a76425debf9068ae82a5c8fc8eebe3e7750a。
- [CloudFront 配置](https://github.com/rust-lang/simpleinfra/blob/master/terragrunt/modules/release-distribution/cloudfront-static.tf) 使用该 S3 bucket 的 regional domain 作为源站。
- 仅进程级 RUSTUP_DIST_SERVER 指向 https://static-rust-lang-org.s3.us-west-1.amazonaws.com，HTTPS 正常验证，未修改 DNS/hosts、默认工具链、持久下载源或用户运行配置。

源站两次 rustup 下载达到 600 秒工具时限，留下部分安装与下载文件；partial installation 并非可用工具链。分段下载保留原 partial，第一次有一个分段 DNS 失败，续传后按官方 stable 清单逐一核对完整归档 SHA-256，再放入 rustup 内容寻址缓存：

| 组件 | SHA-256 |
| --- | --- |
| rustc | 3fcd7f1709f62dda58bf4db2dcfd630a451e750aadaaa551a21cc4a627a37b4c |
| cargo | 7e18265d2d2cda8dec6cac4d0faa3bbafe927b401e5185350abc7d669f9adafb |
| rust-std | 9345645b6f56eea28bf8cc2c0f628a61d507a688f91c1bec5ae6bfad216a16c7 |

cargo 原缓存已校验；rustc/rust-std 拼接后全量校验一致。不关闭 TLS、不绕过 rustup 校验、不删除缓存。直接对中断的 stable 执行 component add 返回 missing manifest，未把残留 cargo 当成功。随后正常 `rustup toolchain install 1.100.0 --profile minimal`（临时上述源站）完成安装；初次安装摘要读取 rustc 版本超时，但随后实际执行均成功：

- rustc 1.100.0 (0ef1bc386 2026-11-09)
- cargo 1.100.0 (3acc79c0c 2026-11-05)

stable 别名的中断状态未修复、默认配置未重置；后续检查显式使用 `RUSTUP_TOOLCHAIN=1.100.0`。fmt/clippy/Tauri 构建未验证，不以 minimal 安装代表全部工具齐备。

## 回归实际结果

`RUSTUP_TOOLCHAIN=1.100.0 npm test`：736 项，729 pass / 6 fail / 1 cancelled / 0 skipped。不再是先前 52 项 Rust 构建 hook 失败，但不是完整通过。

- client-control.test.mjs 两项 start 场景：Node 子进程 ETIMEDOUT。
- dictation-controller.test.mjs：原生检查子进程 status=null，期望 0；此输出不能单独证明取消/超时原因。
- rust-host.test.mjs：start、stop、minimal stdio 三项子进程 ETIMEDOUT。
- service.test.mjs：原 20000ms testTimeoutFailure，作为 cancelled 计数；既有根因仍未定位。

缩小到上述四个文件复测（原断言与时限不改）：13 项，10 pass / 3 fail / 0 cancelled/skipped。两项 client-control start 与一项 rust-host start 仍 ETIMEDOUT；其他项此次通过不代表修复。测试后 uptime 报告 load averages 673.06 / 680.20 / 665.72；只是观察，未证明负载与失败的因果，未停止未知进程或用户应用。

临时原始工具输出仅留本机，不作为私人运行数据附件提交。没有新前端/原生源码改动，未做浏览器、原生构建或真机验收。

## 下一步与解除条件

先定位可复现的 client-control/rust-host start 子进程阻塞，区分系统工具耗时与控制逻辑问题；保留 service 超时和原生检查的独立问题。完整 npm test 真正通过并补充阶段证据前，不把 SC-20261114-021 勾为验收完成，不叠加展示与等待提示功能。当前不要求用户授予额外权限，也不要求真实剪贴板或输入操作。

后续 SC-20261115-002 [子进程诊断检查点](2026-11-15-control-subprocess-diagnostics.md)保留原时限，完整回归 739 pass/4 fail；工具链可用但尚未恢复整批验收。

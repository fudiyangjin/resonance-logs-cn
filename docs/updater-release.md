# 应用内更新发布

应用仅在启动后检查一次更新。用户点击侧栏版本号旁的提示后，自动下载、验证签名、静默安装并重启。更新模式保留安装目录以外的用户配置、数据库和语音资源，不生成配置备份。

## 更新源

三种语言都先读取 `https://bptimer.cn/resonance-logs/` 下对应语言的清单，请求失败时回退到 GitHub 最新 Release 的同名清单。不会跨语言回退，避免改变安装包下载来源。

| 应用语言 | 清单文件            | 清单中的 EXE 下载来源                                   |
| -------- | ------------------- | ------------------------------------------------------- |
| 中文     | `latest.json`       | 国内站 `/resonance-logs/releases/<版本>/<安装包文件名>` |
| 英文     | `latest.en-US.json` | GitHub Releases 对应版本附件                            |
| 日文     | `latest.ja-JP.json` | GitHub Releases 对应版本附件                            |

国内站与 GitHub 上传同一组三份清单，无需分别修改。安装包下载地址由清单的语言决定，与清单从哪个站点读取无关。两个站点托管完全相同的已签名 EXE，共用同一签名；下载失败不会自动切换 EXE 来源。

## 发布地址配置

发布构建前设置 `PUBLIC_SITE_URL` 为正式站点源地址（仅协议和域名）；`PUBLIC_RELEASES_BASE` 默认 `/resonance-logs/`，也可指定独立下载站的完整基址。`PUBLIC_RESONANCE_REPOSITORY` 使用 `owner/repository` 格式配置 GitHub 仓库。这些变量与 BPTimer 网站及部署配置保持一致，生成器不内置国内域名。

下文中的国内站地址仅为当前部署示例。安装器清单生成时会使用上述配置。桌面应用内置的清单查询地址仍沿用现有更新器配置；迁移它需要单独发布桌面版本。

## 构建与发布

1. 同步 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 的版本，并准备 `doc/{zh-CN,en-US,ja-JP}/changelog/v<版本>.md`。
2. 在构建环境中配置与现有更新公钥匹配的 `TAURI_SIGNING_PRIVATE_KEY` 和必要的 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。不要更换公钥来迁就另一把密钥，也不要提交私钥。
3. 运行 `npm run tauri:build:release`。构建脚本验证安装器版本、安装包签名及公钥，生成 `target/release/bundle/updater/` 下三份清单；使用 Cargo 自定义 target 目录时以脚本输出为准。
4. 先向 GitHub 对应版本标签（例如 `0.2.5`，与现有命名一致）上传 `resonance-logs-cn_<版本>_x64-setup.exe` 和 `.exe.sig`。将完全相同的 EXE 上传到国内站 `https://bptimer.cn/resonance-logs/releases/<版本>/resonance-logs-cn_<版本>_x64-setup.exe`；国内站可同时存放 `.exe.sig`，客户端只读取清单内的签名。
5. 确认两个站点的 EXE 都可下载后，再将生成的 `latest.json`、`latest.en-US.json`、`latest.ja-JP.json` 上传至 GitHub 最新 Release，并同步到国内站 `https://bptimer.cn/resonance-logs/`。两处使用同一组清单；确保国内站清单及时更新，因为国内站返回有效清单后不会再向 GitHub 比较版本。

不要继续发布仓库根目录中历史遗留的手填清单。新清单直接引用 `.exe`，不需要另行压缩为 ZIP。独立重新生成清单可运行：

```powershell
node scripts/generate-update-manifests.mjs <安装包.exe> <输出目录>
```

## 发布前验证

自动检查：`npm run check`、`npx vitest run src/lib/stores/update-store.svelte.test.ts`、`npm run test:updater-release`、`cargo test --manifest-path src-tauri/Cargo.toml --lib updater::`。

若 Windows 测试程序在执行用例前报 `STATUS_ENTRYPOINT_NOT_FOUND`，检查其通用控件 v6 清单。当前 Tauri 单元测试产物可能不含此清单，可用 Windows SDK 的 `mt.exe` 向生成的测试 EXE 嵌入 Common-Controls v6 依赖后再运行；不要修改生产应用的权限清单来解决测试环境问题。

使用独立 Windows 测试账户或虚拟机，以同一测试密钥签名的两个版本验证真实升级；不要用测试密钥替换生产公钥。分别验证默认安装位置和含空格的自定义路径。

- 旧版本启动后仅侧栏出现提示，点击一次后自动安装并启动新版本。
- 下载时切换页面、隐藏到托盘、修改设置；升级后设置、已有历史数据库、语音模型和音频仍在。
- 正在战斗和生成语音时更新，不等待战斗结束，语音子进程不阻碍安装。
- 断网、无 Content-Length、错误签名和损坏安装包不触发退出；失败后可重试。
- 更新器不写入配置备份目录，不显示卸载、清理用户数据或选择安装目录的界面。Windows UAC 提示由系统权限决定。

首次获得此功能的旧用户需要手动安装一次。应用完全退出会取消尚未完成的下载；不提供跨启动续传。

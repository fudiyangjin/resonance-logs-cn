# Resonance Logs CN

[Blue Protocol: Star Resonance](https://www.starresonance.com/) 战斗数据分析桌面应用，支持实时 DPS 统计、Buff 监控、技能 CD 展示等功能。

本项目修改自 [resonance-logs](https://github.com/resonance-logs/resonance-logs)

## 功能特性

- **DPS 检测**：实时秒伤统计、全局活跃时间、历史记录
- **Buff 监控**：技能 CD、Buff 监控、Buff 别名、分类快捷监听（食物/炼金）
- **模组计算**：基于抓包的模组数据，智能筛选最优模组搭配（支持 GPU 加速）
- **自定义面板**：以进度条形式展示计数器和 Buff 监控
- **游戏浮窗**：透明置顶窗口，支持遮罩与快捷键切换
- **自动更新**：支持应用内 OTA 更新

## 技术栈

- **后端**：Rust + [Tauri 2](https://tauri.app/)
- **前端**：SvelteKit 5 + Svelte + TypeScript + Tailwind CSS
- **数据捕获**：WinDivert / Npcap（Windows 网络包捕获）

## 系统要求

- **平台**：Windows（WinDivert 需管理员权限；Npcap 需安装 [Npcap](https://npcap.com/) 并选择正确网卡）
- **Node.js**：用于前端构建
- **Rust**：用于 Tauri 构建

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run tauri dev
```

### 构建

```bash
npm run tauri build
```

构建产物默认在 `src-tauri/target/release/bundle/` 下，支持 NSIS 安装包。

### 模组计算构建说明

模组计算功能依赖 C++ 扩展，并可选用 GPU（CUDA/OpenCL）加速。构建前请参考 [StarResonanceAutoMod](https://github.com/fudiyangjin/StarResonanceAutoMod) 的环境要求：

**基础要求（CPU 版本）：**

- **Visual Studio Build Tools 2019/2022** 或 Visual Studio（MSVC 编译器）
- Windows SDK

**GPU 版本额外要求：**

- **CUDA Toolkit 12.9**（NVIDIA 显卡，RTX 20XX 及以上, 12.9 以上支持 50XX 的构建）
- 或 **OpenCL**（NVIDIA/AMD/Intel 显卡，通常随显卡驱动或 CUDA 提供）

构建时脚本会自动检测 CUDA/OpenCL：若未检测到，则仅编译 CPU 版本；若 C++ 源码目录 `src-tauri/src/module_optimizer/cpp/` 不存在，则跳过模组计算模块构建，其余功能不受影响。

## 文档

文档支持 **简体中文**、**English**、**日本語** 三种语言：

- 源码：[doc/zh-CN/](./doc/zh-CN/README.md) · [doc/en-US/](./doc/en-US/README.md) · [doc/ja-JP/](./doc/ja-JP/README.md)
- 首次使用请先阅读各语言的 [快速入门 / Getting Started / はじめに](./doc/zh-CN/getting-started.md)（Npcap 安装、网卡选择、**重启应用**）
- 构建 HTML：`npm run doc:html` → 输出 [doc/html_doc/](./doc/html_doc/index.html)（含语言切换页）

## 下载

- [Releases](https://github.com/fudiyangjin/resonance-logs-cn/releases) - 预构建安装包

## 社区

- QQ 群：1084866292
- discord: RHeX47wvDU

## 更新日志

详见 [CHANGELOG.md](./CHANGELOG.md)

## 许可证

[AGPL-3.0-only](LICENSE)

## 致谢

- [resonance-logs](https://github.com/resonance-logs/resonance-logs) - 原始项目
- [BPSR-ZDPS](https://github.com/Blue-Protocol-Source/BPSR-ZDPS) - ZDPS 项目（DPS 统计与相关功能参考）
- [StarResonanceDamageCounter](https://github.com/dmlgzs/StarResonanceDamageCounter) - 伤害统计参考实现
- [StarResonanceAutoMod](https://github.com/fudiyangjin/StarResonanceAutoMod) - 模组优化算法与构建参考

This is a fork of Resonance Logs CN. I have no idea what I'm doing, so I added a translation layer to it lol. 

Don't expect patchnotes for this until it's nearly done.
Also some minor UI adjustments were done. 


-Donne



# Resonance Logs GLOBAL

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

- **平台**：Windows（需管理员权限以使用 WinDivert）
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

- [doc/](./doc/) - 功能说明与 [FAQ](./doc/faq.md)

## 下载

- [Releases](https://github.com/fudiyangjin/resonance-logs-cn/releases) - 预构建安装包

## 社区

- QQ 群：1084866292

## 更新日志

详见 [CHANGELOG.md](./CHANGELOG.md)

## 许可证

[AGPL-3.0-only](LICENSE)

## 致谢

- [resonance-logs](https://github.com/resonance-logs/resonance-logs) - 原始项目
- [StarResonanceDamageCounter](https://github.com/dmlgzs/StarResonanceDamageCounter) - 伤害统计参考实现
- [StarResonanceAutoMod](https://github.com/fudiyangjin/StarResonanceAutoMod) - 模组优化算法与构建参考

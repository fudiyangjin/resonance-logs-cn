# Resonance Logs CN 开发指南

## 项目概览

星痕共鸣（Blue Protocol: Star Resonance）战斗数据分析桌面应用，提供实时 DPS、Buff、技能 CD 和游戏浮窗。

## 技术栈

- 前端：Svelte 5、SvelteKit、TypeScript、Tailwind CSS。
- 桌面后端：Rust、Tauri 2；Windows 网络捕获使用 WinDivert / Npcap。
- 组件：Bits UI；数据校验：Valibot；测试：Vitest。

## 常用命令

- 安装依赖：`npm install`
- 前端开发：`npm run dev`
- 桌面开发：`npm run tauri dev`
- 前端构建：`npm run build`
- 类型检查：`npm run check`
- 测试：`npm test`
- 格式与静态检查：`npm run lint`

## 代码约定

- 通用逻辑在 `src/lib`，页面和浮窗在 `src/routes`，后端在 `src-tauri`。
- Svelte 使用 runes；单元测试与源码同目录，命名为 `*.test.ts`。
- 界面翻译位于 `src/lib/i18n/messages`，文档位于 `doc`，维护中文、英文和日文。

## 注意事项

- 保留已有未提交改动。
- `secrets` 是本地签名密钥目录，不提交或输出其中的内容。
- Tauri 完整构建依赖 Windows 原生工具链；前端检查和 Vitest 可单独运行。

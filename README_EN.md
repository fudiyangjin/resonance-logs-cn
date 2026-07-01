# Resonance Logs CN

A desktop combat analysis application for [Blue Protocol: Star Resonance](https://www.starresonance.com/) that provides real-time DPS tracking, buff monitoring, skill cooldown display, and more.

This project is based on and modified from [resonance-logs](https://github.com/resonance-logs/resonance-logs).

## Features

* **DPS Meter**: Real-time DPS statistics, global active time tracking, and combat history.
* **Buff Monitoring**: Skill cooldown tracking, buff monitoring, buff aliases, and quick category-based monitoring (Food/Alchemy).
* **Module Optimizer**: Uses packet-captured module data to intelligently calculate optimal module combinations (GPU acceleration supported).
* **Custom Panels**: Display counters and buff monitoring as customizable progress bars.
* **In-Game Overlay**: Transparent always-on-top overlay with masking support and hotkey toggles.
* **Automatic Updates**: Supports in-app OTA (Over-the-Air) updates.

## Tech Stack

* **Backend**: Rust + [Tauri 2](https://tauri.app/)
* **Frontend**: SvelteKit 5 + Svelte + TypeScript + Tailwind CSS
* **Packet Capture**: WinDivert / Npcap (Windows network packet capture)

## System Requirements

* **Platform**: Windows (WinDivert requires administrator privileges; Npcap requires [Npcap](https://npcap.com/) to be installed and the correct network adapter selected)
* **Node.js**: Required for building the frontend
* **Rust**: Required for building the Tauri application

## Getting Started

### Install Dependencies

```bash
npm install
```

### Development

```bash
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

The generated installer can be found in `src-tauri/target/release/bundle/` by default. NSIS installers are supported.

### Module Optimizer Build Requirements

The Module Optimizer depends on a native C++ extension and optionally supports GPU acceleration (CUDA/OpenCL). Before building, please refer to the requirements of [StarResonanceAutoMod](https://github.com/fudiyangjin/StarResonanceAutoMod).

**Basic Requirements (CPU Version):**

* **Visual Studio Build Tools 2019/2022** or Visual Studio (MSVC compiler)
* Windows SDK

**Additional Requirements for GPU Acceleration:**

* **CUDA Toolkit 12.9** (NVIDIA GPUs, RTX 20-series and newer; CUDA 12.9+ is required to build for RTX 50-series GPUs)
* Or **OpenCL** (NVIDIA, AMD, or Intel GPUs; typically included with GPU drivers or the CUDA Toolkit)

During the build process, the script automatically detects CUDA/OpenCL support. If neither is available, only the CPU version will be built. If the C++ source directory `src-tauri/src/module_optimizer/cpp/` is missing, the Module Optimizer will be skipped entirely while all other features continue to build normally.

## Documentation

Documentation is available in **Simplified Chinese**, **English**, and **Japanese**.

* Source: [doc/zh-CN/](./doc/zh-CN/README.md) · [doc/en-US/](./doc/en-US/README.md) · [doc/ja-JP/](./doc/ja-JP/README.md)
* First-time users should read the corresponding **Getting Started / 快速入门 / はじめに** guide for their language (Npcap installation, network adapter selection, and **restarting the application**).
* Generate the HTML documentation with:

```bash
npm run doc:html
```

The output will be generated in `doc/html_doc/` and includes a language selection page.

## Downloads

* [Releases](https://github.com/fudiyangjin/resonance-logs-cn/releases) - Prebuilt installers

## Community

* QQ Group: 1084866292
* Discord: https://discord.gg/RHeX47wvDU

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

[AGPL-3.0-only](LICENSE)

## Acknowledgements

* [resonance-logs](https://github.com/resonance-logs/resonance-logs) - Original project
* [BPSR-ZDPS](https://github.com/Blue-Protocol-Source/BPSR-ZDPS) - Reference implementation for DPS tracking and related features
* [StarResonanceDamageCounter](https://github.com/dmlgzs/StarResonanceDamageCounter) - Reference implementation for damage tracking
* [StarResonanceAutoMod](https://github.com/fudiyangjin/StarResonanceAutoMod) - Module optimization algorithms and build reference

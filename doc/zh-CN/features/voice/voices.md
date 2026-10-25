# 音色与短句

播报文案配置好后，需要生成对应的音频才能播放。本页介绍音色的五种来源，以及如何管理 **{{ui:voice.tabs.phrases}}**。

| 方式 | 准备工作 | 效果 | 适合 |
| --- | --- | --- | --- |
| [预置音色](#方式一预置音色) | 无 | 标准、稳定 | 所有人，开箱即用 |
| [克隆音色](#方式二克隆音色) | 一段 5～10 秒的干声 | 接近参考音频 | 想要某个角色的声音 |
| [微调音色](#方式三微调音色进阶) | 10～30 分钟语音 + 显卡训练 | 还原度最高 | 有经验的进阶用户 |
| [导入音频](#方式四导入现成音频) | 现成的音频文件 | 就是原音频 | 音效、录音、不想用 TTS |
| [HTTP 语音服务](#方式五http-语音服务) | 一个能通过 HTTP 调用的 TTS | 取决于所用的服务 | 已有喜欢的 TTS，或不想在本机跑模型 |

前三种方式生成音频前，需要先在 **{{ui:voice.tabs.model}}** 中安装语音模型。导入音频和 HTTP 语音服务不需要模型。

## 方式一：预置音色

在 **{{ui:voice.tabs.phrases}} → {{ui:voice.phrases.generate.title}}** 中选择 **{{ui:voice.phrases.generate.presetSource}}**（默认选中），勾选短句后点 **{{ui:voice.phrases.generate.start}}**。在播报总览中点 **{{ui:voice.bindings.generateMissing}}** 时同样默认使用预置音色。

- 预置音色按**当前界面语言**自动选择（简体中文 / English / 日本語），与短句本身是什么语言无关。
- 切换界面语言后再生成，会自动改用新语言的预置音色。

## 方式二：克隆音色

只需一段参考音频，无需训练。

![克隆音色批量生成](../../../shared/img/voice/voice_2.png)

1. 在 **{{ui:voice.phrases.generate.title}}** 中选择 **{{ui:voice.phrases.generate.cloneSource}}**。
2. 选择 **{{ui:voice.phrases.generate.useExisting}}**，或者 **{{ui:voice.phrases.generate.createNew}}**：填写 **{{ui:voice.phrases.generate.newProfileName}}**，点 **{{ui:voice.phrases.generate.pickReference}}**。可以勾选 **{{ui:voice.phrases.generate.keepReference}}**。
3. 勾选要生成的短句（可以 **{{ui:voice.phrases.generate.selectAll}}**），点 **{{ui:voice.phrases.generate.start}}**。

> [!TIP]
> 参考音频选 **5～10 秒的角色干声**：只有一个人说话，清晰，没有背景音乐和混响。参考音频越干净，克隆出来越像。

保存过的音色会出现在 **{{ui:voice.tabs.model}} → {{ui:voice.model.profiles.title}}** 中，下次直接选用即可。

## 方式三：微调音色（进阶）

克隆只依赖几秒参考音频，相似度和稳定性有限。想要更高的还原度，可以用目标角色的语音数据**微调**一个专属模型，导出后在应用中引用。

大致流程：

1. **获取素材**：B 站视频可以用 [bilibilidownloadtool](https://github.com/NANblogink/bilibilidownloadtool) 下载。
2. **提取音频**：用 FFmpeg 转成无损 PCM WAV，保留原始采样率，不要先压成 MP3。
3. **分离人声**：用 [Ultimate Vocal Remover](https://github.com/Anjok07/ultimatevocalremovergui) 去掉背景音，导出 `Vocals` 干声，并完整试听检查。
4. **制作数据集**：按静音切分，重采样到 24kHz，用 ASR 转写后人工校对文本。
5. **训练**：生成音频离散码和 speaker embedding，微调 Qwen3-TTS 0.6B CustomVoice。推荐在 Docker 中运行，预构建镜像为 `ghcr.io/mozi1924/qwen3-tts-easyfinetuning`。
6. **导出**：导出 GGUF 部署目录，在 **{{ui:voice.tabs.model}} → {{ui:voice.model.finetuned.title}}** 中点 **{{ui:voice.model.finetuned.import}}**。之后在批量生成中选择 **{{ui:voice.phrases.generate.finetunedSource}}**。

数据与环境要求：

- 只使用你自己拥有或已获授权的声音数据，一个数据集只包含一个说话人。
- 建议准备 **10～30 分钟**干净的有效语音。数据少也能训练，但相似度和稳定性会差一些。
- 训练建议使用显存 ≥ 16GB 的 NVIDIA 显卡；Windows 下推荐 WSL2 + Docker Desktop。

微调效果示例（日语音色）：

- 蒂娜 CD 结束提醒：<audio controls src="../../../shared/audio/voice/ja_01_tina_cd.wav"></audio>
- N20 治疗提醒：<audio controls src="../../../shared/audio/voice/ja_02_n20_healbot.wav"></audio>

部署目录移动或文件变化后，微调音色会显示 **{{ui:voice.model.finetuned.missing}}** 或 **{{ui:voice.model.finetuned.modified}}**。用 **{{ui:voice.model.finetuned.relink}}** 指向新位置，并用 **{{ui:voice.model.finetuned.verify}}** 确认完整。**{{ui:voice.model.finetuned.remove}}** 只移除引用，不会删除外部文件。

## 方式四：导入现成音频

不想用 TTS，或者想用一段音效时，可以直接导入音频文件：

1. 在 **{{ui:voice.tabs.phrases}}** 中填写 **{{ui:voice.phrases.namePlaceholder}}**，点击 **{{ui:voice.phrases.import.newButton}}**。
2. 选择 wav / mp3 / flac / ogg / m4a 文件，大小不超过 50 MiB，时长 0.2～30 秒。
3. 已有的短句也可以点这一行的 **{{ui:voice.phrases.import.rowButton}}**，用文件替换当前语音。

导入的音频会统一转为单声道 24kHz，状态显示为 **{{ui:voice.phrases.status.imported}}**，不参与语音生成。在功能页中选择 **{{ui:voice.binding.source.phrase}}** 就能使用它。

> [!NOTE]
> 导入短句的 ID 由音频内容决定。同一段音频在另一台电脑上导入后 ID 相同，所以分享方案时，对方导入同一个文件就能自动对上。

## 方式五：HTTP 语音服务

已经有喜欢的 TTS（本地部署的 TTS 服务、OpenAI 兼容接口、Google Cloud TTS 等），或者不想在本机跑模型时，可以通过 HTTP 调用它来生成音频。音频在生成时请求一次并保存到本地，**播报时不联网**，也不需要安装语音模型。

![HTTP 语音服务设置示例](../../../shared/img/changelog/voice_http.png)

1. 在 **{{ui:voice.tabs.model}} → {{ui:voice.http.title}}** 中选择一个预设，点击 **{{ui:voice.http.add}}**：
   - **{{ui:voice.http.preset.openaiCompatible}}**：POST `/v1/audio/speech`，很多本地 TTS 服务也兼容这个接口；
   - **{{ui:voice.http.preset.googleCloud}}**：填入 API Key，从返回 JSON 的 `audioContent` 中取音频；
   - **{{ui:voice.http.preset.customGet}}**：给自己写的本地转发服务用，一个 GET 请求直接返回音频文件。任何只有命令行或 SDK 的 TTS，都可以包一层这样的转发服务接入。
2. 按服务的文档修改 URL、请求头和请求体。可以使用这些占位符：

   | 占位符 | 替换为 |
   | --- | --- |
   | `{text}` | 短句文本 |
   | `{lang}` / `{voice}` | 按短句语言（中文 / 英文 / 日文）分别填写的语言代码和音色 |
   | `{secret}` | 密钥 |

   占位符会按所在位置自动转义（URL 编码、JSON 字符串、XML 实体），模板里直接写 `"input": "{text}"` 即可。
3. 点击 **{{ui:voice.http.form.testButton}}** 试听一句，确认没问题后点 **{{ui:voice.http.form.save}}**。
4. 在 **{{ui:voice.phrases.generate.title}}** 中选择 **{{ui:voice.phrases.generate.httpSource}}** 和刚添加的服务，之后的生成方式与其他来源相同，**{{ui:voice.bindings.generateMissing}}** 也会使用它。可以添加多个服务，随时切换。

> [!NOTE]
> - 服务返回的音频需要是 wav / mp3 / flac / ogg（vorbis）/ m4a。**不支持 Opus 和没有文件头的原始 PCM**，请在服务端选择 wav 或 mp3。
> - 远端地址必须使用 https；明文 http 只允许本机（`127.0.0.1`、`localhost`）和局域网 IP。
> - 使用远端服务时，短句文本会发送给该服务。
> - 密钥以明文保存在本机的语音目录中，不会随方案分享出去。更换密钥不会让已生成的音频过期；修改了 URL、请求体或音色后，用这个服务生成的音频会显示 **{{ui:voice.phrases.status.stale}}**。
> - 鉴权失败（如 401）或服务连不上时，批量生成会立即停止；已经生成成功的音频会保留。

## 管理短句库

**{{ui:voice.tabs.phrases}}** 中每条短句都有一个状态：

| 状态 | 含义 |
| --- | --- |
| **{{ui:voice.phrases.status.ready}}** | 可以直接播放 |
| **{{ui:voice.phrases.status.stale}}** | 音色或文本改过，旧音频已过期 |
| **{{ui:voice.phrases.status.pending}}** | 还没有音频 |
| **{{ui:voice.phrases.status.imported}}** | 来自导入的文件 |

你也可以手动 **{{ui:voice.phrases.add}}**，写好常用的句子，在多个功能页中通过短语库引用复用。

自动生成的短语按**文案内容**区分：同一条播报在不同方案里写了不同文案，会各自保留一份音频；文案相同则共用一份。修改文案后，在新文案的音频生成之前，这条播报会继续播放之前的音频。

删除播报、取消监控对象或修改文案后，旧文案的自动短语会变成未引用短语。它们不会被自动删除：清理之前重新配置同样文案的播报，会直接复用已生成的音频。点击 **清理未引用短语** 可以一键删除它们，确认框会列出将要删除的短语。清理会检查所有监控方案（不只是当前方案），以下短语不会被清理：

- 任一方案中仍在使用的，包括暂时关闭的事件；
- 在功能页中通过 **{{ui:voice.binding.source.phrase}}** 选用的；
- 新文案还没有音频时，正在代替它播放的旧短语；
- 带有导入音频的，需要在列表中逐条手动删除；
- 你手动创建的短句，以及应用自带的提示音。

## 例

- [用自己的音效提醒 Boss 大招](./examples/custom-sfx.md)
- [下载模型、克隆音色与导入音频短句](./examples/clone-import.md)

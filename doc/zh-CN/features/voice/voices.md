# 音色与短句

播报文案配置好后，需要生成对应的音频才能播放。本页介绍音色的四种来源，以及如何管理 **{{ui:voice.tabs.phrases}}**。

| 方式 | 准备工作 | 效果 | 适合 |
| --- | --- | --- | --- |
| [预置音色](#方式一预置音色) | 无 | 标准、稳定 | 所有人，开箱即用 |
| [克隆音色](#方式二克隆音色) | 一段 5～10 秒的干声 | 接近参考音频 | 想要某个角色的声音 |
| [微调音色](#方式三微调音色进阶) | 10～30 分钟语音 + 显卡训练 | 还原度最高 | 有经验的进阶用户 |
| [导入音频](#方式四导入现成音频) | 现成的音频文件 | 就是原音频 | 音效、录音、不想用 TTS |

生成音频前，需要先在 **{{ui:voice.tabs.model}}** 中安装语音模型。导入音频不需要模型。

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

## 管理短句库

**{{ui:voice.tabs.phrases}}** 中每条短句都有一个状态：

| 状态 | 含义 |
| --- | --- |
| **{{ui:voice.phrases.status.ready}}** | 可以直接播放 |
| **{{ui:voice.phrases.status.stale}}** | 音色或文本改过，旧音频已过期 |
| **{{ui:voice.phrases.status.pending}}** | 还没有音频 |
| **{{ui:voice.phrases.status.imported}}** | 来自导入的文件 |

你也可以手动 **{{ui:voice.phrases.add}}**，写好常用的句子，在多个功能页中通过短语库引用复用。

删除播报或修改文案后，会留下一些没人用的自动生成短语。点击 **清理未引用短语** 可以一键删除。清理会检查所有监控方案（不只是当前方案），只删除没有被任何方案引用的自动短语；你手动创建的短句不会被删除。

## 例

### 例：用自己的音效提醒 Boss 大招

**场景**：团队约定 Boss 放某个大招时听一声警报，而不是一句 TTS 语音。你手上有一段 2 秒的警报音效 `alarm.mp3`，想让它在大招读条时以最高优先级播放。

#### 第 1 步：导入音效

1. 打开 **{{ui:routes.tools.voice}} → {{ui:voice.tabs.phrases}}**。
2. 在 **{{ui:voice.phrases.namePlaceholder}}** 中填写「大招警报」。
3. 点击 **{{ui:voice.phrases.import.newButton}}**，选择 `alarm.mp3`。
4. 列表中出现「大招警报」，状态为 **{{ui:voice.phrases.status.imported}}**，点 **{{ui:voice.phrases.tryPlay}}** 确认声音正常。

导入音频不需要安装语音模型。

#### 第 2 步：在 Boss DBM 中引用

1. 打开 **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.bossDbm}}**。
2. 在 **{{ui:monsterMonitor.bossDbm.voice.title}}** 中添加这个技能，事件选 **{{ui:voice.binding.event.onCast}}**。
3. 文案来源选 **{{ui:voice.binding.source.phrase}}**，点 **{{ui:voice.binding.pickPhrase}}**，选「大招警报」。
4. **{{ui:voice.binding.priority}}** 选 **{{ui:voice.binding.priority.urgent}}**。

#### 第 3 步：允许打断

在 **{{ui:voice.tabs.overview}} → {{ui:voice.overview.queuePolicy}}** 中开启 **{{ui:voice.overview.queue.interrupt}}**。这样即使正在播报别的内容，警报也会立即响起。

#### 分享给队友

把方案 [导出](../app/loadouts.md#例把方案分享给队友) 给队友时，播报绑定会一起带过去，但音频文件不会。让队友把同一个 `alarm.mp3` 也导入短句库：导入短句的 ID 由音频内容决定，同一个文件的 ID 相同，绑定会自动对上。

> [!TIP]
> 音效时长最好控制在 1～3 秒。过长的音效会占住队列，拖慢后面的播报。

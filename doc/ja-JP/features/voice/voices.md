# 音色とフレーズ

読み上げの文言を設定したら、対応する音声を生成しないと再生できません。このページでは、音色の 4 つの入手方法と **{{ui:voice.tabs.phrases}}** の管理方法を説明します。

| 方法 | 準備 | 仕上がり | 向いている人 |
| --- | --- | --- | --- |
| [プリセット音色](#方法-1プリセット音色) | なし | 標準的で安定 | すべての人、すぐ使える |
| [クローン音色](#方法-2クローン音色) | 5～10 秒のドライボイス 1 本 | 参照音声に近い | 特定キャラクターの声を使いたい人 |
| [微調整音色](#方法-3微調整音色上級) | 10～30 分の音声 + GPU での学習 | 再現度が最も高い | 経験のある上級ユーザー |
| [音声のインポート](#方法-4既存の音声をインポート) | 既存の音声ファイル | 元の音声そのもの | 効果音、録音、TTS を使いたくない場合 |

音声を生成する前に、**{{ui:voice.tabs.model}}** で音声モデルをインストールしておく必要があります。音声のインポートにはモデルは不要です。

## 方法 1：プリセット音色

**{{ui:voice.tabs.phrases}} → {{ui:voice.phrases.generate.title}}** で **{{ui:voice.phrases.generate.presetSource}}**（既定で選択済み）を選び、フレーズにチェックを入れて **{{ui:voice.phrases.generate.start}}** をクリックします。読み上げ総覧で **{{ui:voice.bindings.generateMissing}}** をクリックした場合も、既定でプリセット音色が使われます。

- プリセット音色は**現在の画面言語**（简体中文 / English / 日本語）に応じて自動的に選ばれ、フレーズ自体の言語とは関係ありません。
- 画面言語を切り替えてから生成すると、自動的に新しい言語のプリセット音色が使われます。

## 方法 2：クローン音色

参照音声が 1 本あれば使え、学習は不要です。

![クローン音色での一括生成](../../../shared/img/voice/voice_2.png)

1. **{{ui:voice.phrases.generate.title}}** で **{{ui:voice.phrases.generate.cloneSource}}** を選びます。
2. **{{ui:voice.phrases.generate.useExisting}}** を選ぶか、**{{ui:voice.phrases.generate.createNew}}** を選んで **{{ui:voice.phrases.generate.newProfileName}}** を入力し、**{{ui:voice.phrases.generate.pickReference}}** をクリックします。**{{ui:voice.phrases.generate.keepReference}}** にチェックを入れることもできます。
3. 生成するフレーズにチェックを入れ（**{{ui:voice.phrases.generate.selectAll}}** も可）、**{{ui:voice.phrases.generate.start}}** をクリックします。

> [!TIP]
> 参照音声には **5～10 秒のキャラクターのドライボイス** を選びましょう。話者が 1 人だけで、明瞭で、BGM やリバーブがないものが理想です。参照音声がきれいなほど、クローンの再現度が上がります。

保存した音色は **{{ui:voice.tabs.model}} → {{ui:voice.model.profiles.title}}** に表示され、次回からはそのまま選んで使えます。

## 方法 3：微調整音色（上級）

クローンは数秒の参照音声だけに頼るため、類似度と安定性に限界があります。より高い再現度を求める場合は、対象キャラクターの音声データで専用モデルを**微調整**し、エクスポートしたものをアプリで参照できます。

おおまかな流れ：

1. **素材の入手**：Bilibili の動画は [bilibilidownloadtool](https://github.com/NANblogink/bilibilidownloadtool) でダウンロードできます。
2. **音声の抽出**：FFmpeg でロスレスの PCM WAV に変換し、元のサンプルレートを保持します。先に MP3 に圧縮しないでください。
3. **ボーカル分離**：[Ultimate Vocal Remover](https://github.com/Anjok07/ultimatevocalremovergui) で背景音を除去し、`Vocals` のドライボイスを書き出して、全体を聴いて確認します。
4. **データセットの作成**：無音区間で分割し、24kHz にリサンプリングして、ASR で書き起こしたあと人手でテキストを校正します。
5. **学習**：音声の離散コードと speaker embedding を生成し、Qwen3-TTS 0.6B CustomVoice を微調整します。Docker での実行を推奨します。ビルド済みイメージは `ghcr.io/mozi1924/qwen3-tts-easyfinetuning` です。
6. **エクスポート**：GGUF のデプロイフォルダーを書き出し、**{{ui:voice.tabs.model}} → {{ui:voice.model.finetuned.title}}** で **{{ui:voice.model.finetuned.import}}** をクリックします。その後、一括生成で **{{ui:voice.phrases.generate.finetunedSource}}** を選びます。

データと環境の要件：

- 自分が所有している、または使用許諾を得た音声データのみを使ってください。1 つのデータセットには 1 人の話者だけを含めます。
- クリーンな有効音声を **10～30 分** 用意するのが目安です。少なくても学習はできますが、類似度と安定性は下がります。
- 学習には VRAM 16GB 以上の NVIDIA GPU を推奨します。Windows では WSL2 + Docker Desktop を推奨します。

微調整の結果サンプル（日本語音色）：

- ティナ CD 終了のお知らせ：<audio controls src="../../../shared/audio/voice/ja_01_tina_cd.wav"></audio>
- N20 回復のお知らせ：<audio controls src="../../../shared/audio/voice/ja_02_n20_healbot.wav"></audio>

デプロイフォルダーを移動したりファイルが変わったりすると、微調整音色に **{{ui:voice.model.finetuned.missing}}** または **{{ui:voice.model.finetuned.modified}}** と表示されます。**{{ui:voice.model.finetuned.relink}}** で新しい場所を指定し、**{{ui:voice.model.finetuned.verify}}** で欠けがないか確認してください。**{{ui:voice.model.finetuned.remove}}** は参照を外すだけで、外部のファイルは削除しません。

## 方法 4：既存の音声をインポート

TTS を使いたくない場合や、効果音を使いたい場合は、音声ファイルを直接インポートできます。

1. **{{ui:voice.tabs.phrases}}** で **{{ui:voice.phrases.namePlaceholder}}** を入力し、**{{ui:voice.phrases.import.newButton}}** をクリックします。
2. wav / mp3 / flac / ogg / m4a ファイルを選びます。サイズは 50 MiB 以下、長さは 0.2～30 秒です。
3. 既存のフレーズも、その行の **{{ui:voice.phrases.import.rowButton}}** をクリックすれば、現在の音声をファイルで置き換えられます。

インポートした音声はモノラル 24kHz に統一して変換され、状態は **{{ui:voice.phrases.status.imported}}** と表示されます。音声生成の対象にはなりません。機能ページで **{{ui:voice.binding.source.phrase}}** を選べば使えます。

> [!NOTE]
> インポートしたフレーズの ID は音声の内容から決まります。同じ音声を別の PC でインポートしても ID は同じになるため、ロードアウトを共有するときは、相手が同じファイルをインポートするだけで自動的に対応付けられます。

## フレーズ集の管理

**{{ui:voice.tabs.phrases}}** の各フレーズには状態があります。

| 状態 | 意味 |
| --- | --- |
| **{{ui:voice.phrases.status.ready}}** | そのまま再生できる |
| **{{ui:voice.phrases.status.stale}}** | 音色またはテキストが変更され、古い音声が使えなくなった |
| **{{ui:voice.phrases.status.pending}}** | まだ音声がない |
| **{{ui:voice.phrases.status.imported}}** | インポートしたファイル由来 |

よく使う文を **{{ui:voice.phrases.add}}** から手動で作っておき、複数の機能ページでフレーズ集から参照して使い回すこともできます。

読み上げを削除したり文言を変更したりすると、どこからも使われていない自動生成フレーズが残ります。**未参照フレーズを整理** をクリックすると、まとめて削除できます。整理ではすべてのロードアウト（現在のものだけでなく）を確認し、どのロードアウトからも参照されていない自動生成フレーズだけを削除します。手動で作成したフレーズは削除されません。

## 例

### 例：自分の効果音で Boss の大技を知らせる

**シナリオ**：パーティー内で、Boss が特定の大技を使うときは TTS の音声ではなく警報音を鳴らすと決めています。手元に 2 秒の警報効果音 `alarm.mp3` があり、大技の詠唱時に最優先で再生したいとします。

#### ステップ 1：効果音をインポートする

1. **{{ui:routes.tools.voice}} → {{ui:voice.tabs.phrases}}** を開きます。
2. **{{ui:voice.phrases.namePlaceholder}}** に「大技警報」と入力します。
3. **{{ui:voice.phrases.import.newButton}}** をクリックし、`alarm.mp3` を選びます。
4. リストに「大技警報」が表示され、状態が **{{ui:voice.phrases.status.imported}}** になります。**{{ui:voice.phrases.tryPlay}}** をクリックして、正しく鳴るか確認します。

音声のインポートには音声モデルのインストールは不要です。

#### ステップ 2：Boss DBM で参照する

1. **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.bossDbm}}** を開きます。
2. **{{ui:monsterMonitor.bossDbm.voice.title}}** でこのスキルを追加し、イベントに **{{ui:voice.binding.event.onCast}}** を選びます。
3. 文言のソースに **{{ui:voice.binding.source.phrase}}** を選び、**{{ui:voice.binding.pickPhrase}}** をクリックして「大技警報」を選びます。
4. **{{ui:voice.binding.priority}}** を **{{ui:voice.binding.priority.urgent}}** にします。

#### ステップ 3：割り込みを許可する

**{{ui:voice.tabs.overview}} → {{ui:voice.overview.queuePolicy}}** で **{{ui:voice.overview.queue.interrupt}}** をオンにします。これで、ほかの内容を読み上げている最中でも、警報がすぐに鳴ります。

#### パーティーメンバーと共有する

ロードアウトをパーティーメンバーに [エクスポート](../app/loadouts.md#例ロードアウトをパーティーメンバーと共有する) して渡すと、読み上げの設定は一緒に渡りますが、音声ファイルは含まれません。メンバーにも同じ `alarm.mp3` をフレーズ集にインポートしてもらいましょう。インポートしたフレーズの ID は音声の内容から決まるため、同じファイルなら ID も同じになり、設定が自動的に対応付けられます。

> [!TIP]
> 効果音の長さは 1～3 秒程度に抑えるのがおすすめです。長すぎる効果音はキューを占有し、後ろの読み上げを遅らせてしまいます。

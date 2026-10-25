# 音色とフレーズ

読み上げの文言を設定したら、対応する音声を生成しないと再生できません。このページでは、音色の 5 つの入手方法と **{{ui:voice.tabs.phrases}}** の管理方法を説明します。

| 方法 | 準備 | 仕上がり | 向いている人 |
| --- | --- | --- | --- |
| [プリセット音色](#方法-1プリセット音色) | なし | 標準的で安定 | すべての人、すぐ使える |
| [クローン音色](#方法-2クローン音色) | 5～10 秒のドライボイス 1 本 | 参照音声に近い | 特定キャラクターの声を使いたい人 |
| [微調整音色](#方法-3微調整音色上級) | 10～30 分の音声 + GPU での学習 | 再現度が最も高い | 経験のある上級ユーザー |
| [音声のインポート](#方法-4既存の音声をインポート) | 既存の音声ファイル | 元の音声そのもの | 効果音、録音、TTS を使いたくない場合 |
| [HTTP 音声サービス](#方法-5http-音声サービス) | HTTP で呼び出せる TTS | 使うサービス次第 | 好みの TTS がある人、ローカルでモデルを動かしたくない人 |

最初の 3 つの方法で音声を生成するには、**{{ui:voice.tabs.model}}** で音声モデルをインストールしておく必要があります。音声のインポートと HTTP 音声サービスにはモデルは不要です。

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

## 方法 5：HTTP 音声サービス

好みの TTS（ローカルで動かしている TTS サーバー、OpenAI 互換 API、Google Cloud TTS など）がある場合や、ローカルでモデルを動かしたくない場合は、HTTP で呼び出して音声を生成できます。音声は生成時に 1 回だけリクエストしてローカルに保存するため、**読み上げ時に通信は発生せず**、音声モデルも不要です。

1. **{{ui:voice.tabs.model}} → {{ui:voice.http.title}}** でプリセットを選び、**{{ui:voice.http.add}}** をクリックします。
   - **{{ui:voice.http.preset.openaiCompatible}}**：POST `/v1/audio/speech`。多くのローカル TTS サーバーもこのインターフェースに対応しています。
   - **{{ui:voice.http.preset.googleCloud}}**：API キーを入力します。レスポンス JSON の `audioContent` から音声を取り出します。
   - **{{ui:voice.http.preset.customGet}}**：自作のローカル中継サービス用で、GET 1 回で音声ファイルを返します。CLI や SDK しかない TTS も、このような中継サービスで包めば利用できます。
2. サービスのドキュメントに合わせて URL・ヘッダー・本文を編集します。使えるプレースホルダー：

   | プレースホルダー | 置き換え先 |
   | --- | --- |
   | `{text}` | フレーズの文 |
   | `{lang}` / `{voice}` | フレーズの言語（中国語 / 英語 / 日本語）ごとに入力した言語コードと音声 |
   | `{secret}` | キー |

   プレースホルダーは位置に応じて自動でエスケープされる（URL エンコード、JSON 文字列、XML 実体参照）ため、テンプレートには `"input": "{text}"` のようにそのまま書けます。
3. **{{ui:voice.http.form.testButton}}** で 1 文試聴し、問題なければ **{{ui:voice.http.form.save}}** をクリックします。
4. **{{ui:voice.phrases.generate.title}}** で **{{ui:voice.phrases.generate.httpSource}}** と追加したサービスを選びます。あとは他のソースと同じように生成でき、**{{ui:voice.bindings.generateMissing}}** でも使われます。サービスは複数追加して切り替えられます。

> [!NOTE]
> - サービスが返す音声は wav / mp3 / flac / ogg（vorbis）/ m4a である必要があります。**Opus とヘッダーのない生の PCM は非対応**のため、サービス側で wav か mp3 を選んでください。
> - リモートのアドレスは https 必須です。平文の http は、この PC（`127.0.0.1`、`localhost`）と LAN の IP アドレスにのみ使えます。
> - リモートのサービスを使う場合、フレーズの文はそのサービスに送信されます。
> - キーはローカルの音声フォルダーに平文で保存され、ロードアウトの共有には含まれません。キーを変更しても生成済みの音声は無効になりません。URL・本文・音声を変更すると、そのサービスで生成した音声は **{{ui:voice.phrases.status.stale}}** と表示されます。
> - 認証エラー（401 など）やサービスに接続できない場合、一括生成はすぐに停止します。生成に成功した音声は残ります。

## フレーズ集の管理

**{{ui:voice.tabs.phrases}}** の各フレーズには状態があります。

| 状態 | 意味 |
| --- | --- |
| **{{ui:voice.phrases.status.ready}}** | そのまま再生できる |
| **{{ui:voice.phrases.status.stale}}** | 音色またはテキストが変更され、古い音声が使えなくなった |
| **{{ui:voice.phrases.status.pending}}** | まだ音声がない |
| **{{ui:voice.phrases.status.imported}}** | インポートしたファイル由来 |

よく使う文を **{{ui:voice.phrases.add}}** から手動で作っておき、複数の機能ページでフレーズ集から参照して使い回すこともできます。

自動生成フレーズは**文言の内容**で区別されます。同じ読み上げでもロードアウトごとに文言が違えばそれぞれの音声が残り、文言が同じなら 1 つの音声を共有します。文言を変更した場合、新しい文言の音声が生成されるまでは以前の音声で読み上げます。

読み上げを削除したり、対象の監視を外したり、文言を変更したりすると、古い自動生成フレーズは未参照フレーズになります。自動では削除されないため、整理する前に同じ文言の読み上げを設定し直せば、生成済みの音声がそのまま使われます。**未参照フレーズを整理** をクリックするとまとめて削除でき、確認欄に削除されるフレーズが一覧表示されます。整理ではすべてのロードアウト（現在のものだけでなく）を確認し、次のフレーズは削除しません：

- いずれかのロードアウトで使われているもの（オフにしたイベントを含む）
- 機能ページで **{{ui:voice.binding.source.phrase}}** から選んだもの
- 新しい文言の音声が未生成の間、代わりに再生されている古いフレーズ
- インポートした音声を持つもの（一覧から 1 件ずつ手動で削除してください）
- 手動で作成したフレーズと、アプリ同梱の通知音

## 例

- [自分の効果音で Boss の大技を知らせる](./examples/custom-sfx.md)
- [モデルのダウンロード、音声のクローン、音声ファイルのインポート](./examples/clone-import.md)
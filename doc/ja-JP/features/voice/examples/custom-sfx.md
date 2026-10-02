# 自分の効果音で Boss の大技を知らせる

関連ページ：[音色とフレーズ](../voices.md)

**シナリオ**：パーティー内で、Boss が特定の大技を使うときは TTS の音声ではなく警報音を鳴らすと決めています。手元に 2 秒の警報効果音 `alarm.mp3` があり、大技の詠唱時に最優先で再生したいとします。

## ステップ 1：効果音をインポートする

1. **{{ui:routes.tools.voice}} → {{ui:voice.tabs.phrases}}** を開きます。
2. **{{ui:voice.phrases.namePlaceholder}}** に「大技警報」と入力します。
3. **{{ui:voice.phrases.import.newButton}}** をクリックし、`alarm.mp3` を選びます。
4. リストに「大技警報」が表示され、状態が **{{ui:voice.phrases.status.imported}}** になります。**{{ui:voice.phrases.tryPlay}}** をクリックして、正しく鳴るか確認します。

音声のインポートには音声モデルのインストールは不要です。

## ステップ 2：Boss DBM で参照する

1. **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.bossDbm}}** を開きます。
2. **{{ui:monsterMonitor.bossDbm.voice.title}}** でこのスキルを追加し、イベントに **{{ui:voice.binding.event.onCast}}** を選びます。
3. 文言のソースに **{{ui:voice.binding.source.phrase}}** を選び、**{{ui:voice.binding.pickPhrase}}** をクリックして「大技警報」を選びます。
4. **{{ui:voice.binding.priority}}** を **{{ui:voice.binding.priority.urgent}}** にします。

## ステップ 3：割り込みを許可する

**{{ui:voice.tabs.overview}} → {{ui:voice.overview.queuePolicy}}** で **{{ui:voice.overview.queue.interrupt}}** をオンにします。これで、ほかの内容を読み上げている最中でも、警報がすぐに鳴ります。

## パーティーメンバーと共有する

ロードアウトをパーティーメンバーに [エクスポート](../../app/examples/share-loadout.md) して渡すと、読み上げの設定は一緒に渡りますが、音声ファイルは含まれません。メンバーにも同じ `alarm.mp3` をフレーズ集にインポートしてもらいましょう。インポートしたフレーズの ID は音声の内容から決まるため、同じファイルなら ID も同じになり、設定が自動的に対応付けられます。

> [!TIP]
> 効果音の長さは 1～3 秒程度に抑えるのがおすすめです。長すぎる効果音はキューを占有し、後ろの読み上げを遅らせてしまいます。

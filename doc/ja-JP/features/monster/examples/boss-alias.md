# Boss スキルに別名を付けて音声で予告する

関連ページ：[Boss DBM](../boss-dbm.md)

**シナリオ**：ある Boss の大技は名前がとても長く、パーティでは「頭割り」と呼んでいます。Boss の詠唱時にオーバーレイに「頭割り」と表示し、音声でも読み上げてほしいとします。

## ステップ 1：Boss DBM エリアをオンにする

1. **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.overlay}}** で **Boss DBM エリア** をオンにします。
2. **{{ui:monsterMonitor.actions.editLayout}}** で、警告エリアを画面中央上部にドラッグします。

## ステップ 2：スキル別名を設定する

1. **{{ui:monsterMonitor.tabs.bossDbm}}** を開き、**{{ui:monsterMonitor.bossDbm.alias.title}}** でこのスキルを検索します。
2. 表示名に「頭割り」と入力します。

見つからない場合は、まず一度この Boss と戦ってください。オーバーレイに `#数字` と表示された項目の数字がスキル効果 ID なので、それで検索できます。

## ステップ 3：音声を設定する

1. **{{ui:monsterMonitor.bossDbm.voice.title}}** でこのスキルを追加し、イベントに **発生時** を選びます。
2. 文言はカスタムを選び、「頭割り、集合」と入力します。
3. **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** で **{{ui:voice.bindings.generateMissing}}** をクリックします。
4. 大技の通知は重要なので、通常の読み上げに埋もれないよう、この読み上げの優先度を **高** にします。[再生と優先度](../../voice/playback.md#優先度とキュー) を参照してください。

## 結果

Boss が詠唱を始めると、警告エリアに「頭割り」とカウントダウンが表示され、同時に音声で通知されます。

> [!TIP]
> このダンジョンが [ダンジョンギミック](../../minimap/dungeons.md) の対応リストに含まれていれば、ギミックミニマップも同時にオンにできます。Boss DBM が「いつ」を、ミニマップが「どこに立つか」を教えてくれます。

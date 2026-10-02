# レイド初攻略前のミニマップ設定

関連ページ：[ダンジョンギミック](../README.md)

**シナリオ**：初めて「忘却幻夢の野」に挑みます。ギミックが多く、指名も頻繁です。ミニマップには自分に関係する情報だけを表示し、指名されたらすぐに自分を見つけられて、音声でも通知してほしいとします。

## ステップ 1：オーバーレイを有効にして配置する

1. **{{ui:routes.tools.minimap}} → {{ui:minimap.tabs.minimap}}** で **{{ui:minimap.settings.enabled.label}}** をオンにします。
2. **{{ui:minimap.actions.editLayout}}**：**{{ui:minimap.panels.map}}** をキャラクターに被らない画面の端に、**{{ui:minimap.panels.info}}** をその下に置きます。終わったら **{{ui:minimap.edit.done}}** をクリックします。

## ステップ 2：余計な表示を減らす

- **{{ui:minimap.settings.hideNormalTeammates.label}}** をオン：指名されていない味方は表示しません。
- **{{ui:minimap.settings.autoHideInDailyScenes.label}}** をオン：街に戻ると自動で非表示になります。
- パーティでマーカーを使って指示する場合は、**{{ui:minimap.settings.showMarkers.label}}** をオンにします。

## ステップ 3：自分を目立たせる

1. **{{ui:minimap.settings.localRing.enabled.label}}** をオンにし、**{{ui:minimap.settings.localRing.color}}** はギミックの色とはっきり区別できる色（白など）を選び、線幅を少し太くします。
2. **{{ui:minimap.settings.localFacing.label}}** をオンにします。
3. **{{ui:minimap.settings.sizes.title}}** で **{{ui:minimap.settings.sizes.local}}** を大きくします。

## ステップ 4：指名時に音声で通知する

1. ダンジョンに入り（または **{{ui:minimap.settings.voiceCues.title}}** を直接展開し）、**{{ui:minimap.s3Raid.shareGroup}}**、**{{ui:minimap.s3Raid.killMark.group}}** など通知したいギミックを探します。
2. 各ギミックに短い文言を入力します。たとえば「頭割り」「隅へ」など。
3. **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** で **{{ui:voice.bindings.generateMissing}}** をクリックします。

> [!TIP]
> 文言が短いほど読み上げは早く終わります。同時に複数のギミックが来ることもあるので、最も致命的なギミックは優先度を高くしておくのがおすすめです。[優先度とキュー](../../voice/playback.md#優先度とキュー) を参照してください。

## ステップ 5：Boss DBM と組み合わせる

[モンスターモニター](../../monster/README.md) で Boss DBM エリアをオンにし、画面中央上部に置きます。ミニマップがどこに立つかを、Boss DBM が残り何秒かを教えてくれます。[例：Boss スキルに別名を付けて音声で予告する](../../monster/examples/boss-alias.md) も参考にしてください。

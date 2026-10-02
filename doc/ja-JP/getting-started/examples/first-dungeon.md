# 初めてダンジョンに行く前の準備

関連ページ：[クイックスタート](../README.md)

**シナリオ**：アプリをインストールしたばかりで、今夜は固定パーティでマスターダンジョンに行く予定です。パーティの DPS、自分のスキル CD、Boss のギミックを見られるようにし、終わったあとに振り返りもしたいと考えています。

この例では、上の [パケット取得方法の設定](../README.md#3-パケット取得方法を設定) を完了し、ライブ DPS ウィンドウが表示できていることを前提とします。

## ステップ 1：プリセットのロードアウトを適用する

1. **{{ui:routes.tools.loadouts}}** を開きます。
2. **{{ui:loadout.page.presetsTitle}}** で自分のスペック（例：「ヴァーダントオラクル · 森癒」）を探し、クリックして適用します。
3. 適用するとそのロードアウトはスペックに自動で関連付けられ、以後そのスペックに切り替えると自動的にこの設定が有効になります。

自分のスペックがなくても大丈夫です。まず空のロードアウトを新規作成し、以降のステップで手動で追加してください。

## ステップ 2：スキル CD と Buff のオーバーレイを開く

1. **{{ui:routes.tools.skillMonitor}}** を開き、ページ上部の **{{ui:skillMonitor.main.enabled.label}}** がオンになっていることを確認します。
2. **{{ui:skillMonitor.tabs.skillCd}}** で、特に気になるスキルにいくつかチェックを入れます（最大 10 個）。
3. **{{ui:skillMonitor.tabs.buff}}** で、自分のバースト系 Buff を検索して追加します。
4. **{{ui:skillMonitor.layout.editOverlayLayout}}** をクリックし、オーバーレイをキャラクター付近の視界の端に来る位置へドラッグして、完了をクリックします。

詳しくは [スキル CD](../../features/monitor/skill-cd.md) と [Buff モニター](../../features/monitor/buff.md) を参照してください。

## ステップ 3：モンスターオーバーレイとダンジョンギミックを開く

1. **{{ui:routes.tools.monsterMonitor}}** を開き、**{{ui:monsterMonitor.enabled}}** をオンにします。
2. **{{ui:monsterMonitor.tabs.overlay}}** で **Boss DBM エリア**（既定ではオフ）をオンにします。Boss が詠唱を始めると予告バーが表示されます。
3. このダンジョンが [対応ダンジョン](../../features/minimap/dungeons.md) の一覧にある場合は、さらに **{{ui:routes.tools.minimap}}** で **{{ui:minimap.settings.enabled.label}}** をオンにします。

## ステップ 4：DPS ウィンドウのレイアウトを確認する

- 画面スペースが足りない場合は、**{{ui:routes.tools.dps}} → {{ui:routes.dps.themes}}** でサイズプリセットを「スモール」にするか、[コンパクトモード](../../features/dps/themes.md#コンパクトモード) をオンにします。
- ウィンドウを透明にしたい場合は、[例：透明でミニマルな DPS ウィンドウ](../../features/dps/examples/transparent-window.md) を参照してください。

## ステップ 5：ダンジョンに入る前にマップを 1 回切り替える

ゲームの途中でアプリを起動した場合は、ダンジョンに入る前にどこかへ 1 回テレポートして、スキル CD、ステータス、ファクターを完全に同期させてください。

## 終わったあと

- Boss ごとに自動で履歴として保存されます。**{{ui:routes.tools.dps}} → {{ui:routes.dps.history}}** で確認できます。
- どこで火力が落ちたかを探したい場合は、[例：タイムラインで火力の空白を見つける](../../features/dps/examples/timeline-gaps.md) に沿って操作してください。
- この設定が気に入ったら、[エクスポートして味方に共有](../../features/app/examples/share-loadout.md) できます。

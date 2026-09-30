# 味方 CD

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.teammateCd}}** は、モンスターオーバーレイに味方ごとのスキルクールダウンを 1 行ずつ表示します。指揮役やサポートが、パーティの必殺技・軽減・全体バフがいつ戻るかを把握するのに向いています。

ゲームから届くのは**自分自身**のクールダウンだけなので、味方のクールダウンは味方自身のアプリから共有されます。味方も本アプリを使い、共有を有効にしている場合にだけここに表示されます。アプリを使っていない味方は表示されず、推測もしません。

## 共有を有効にする

1. **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.general}} → {{ui:appSettings.teamShare.title}}** を開き、**{{ui:appSettings.teamShare.enable}}** にチェックを入れます。表示する側と表示される側の**両方**で有効にする必要があります。
2. ゲームを起動してパーティを組みます。状態が「接続済み」になれば、味方がスキルを使うとすぐに反映されます。

- 自分のアプリは**すべて**のスキルクールダウンを共有します。どれを表示するかは各自が自分の側で決めます。
- クールダウンはゲームサーバーの時刻を基準にしているため、PC 間の時計のずれや中継の遅延でカウントダウンが速くなったり遅くなったりすることはありません。
- 同じゲームの Steam・Epic・公式ランチャーは同じ配信区として扱われ、互いに共有できます。

> [!NOTE]
> {{ui:appSettings.teamShare.privacy}}

## 表示するスキルを選ぶ

**{{ui:monsterMonitor.tabs.teammateCd}}** タブで：

1. 職業ボタンで職業を切り替えます。ボタンの数字は選択済みのスキル数です。
2. スキルアイコンをクリックして表示／非表示を切り替え、下の ← → で表示順を変えます。
3. スキルを選んでいない職業の味方は表示されません。

## スタイル

**{{ui:monsterMonitor.teammateCd.styleTitle}}**：**{{ui:monsterMonitor.teammateCd.style.iconSize}}**、**{{ui:monsterMonitor.teammateCd.style.iconGap}}**、**{{ui:monsterMonitor.teammateCd.style.rowGap}}**、**{{ui:monsterMonitor.teammateCd.style.nameColumnWidth}}**、**{{ui:monsterMonitor.teammateCd.style.fontSize}}**、**{{ui:monsterMonitor.teammateCd.style.showClassIcon}}**、**{{ui:monsterMonitor.style.nameColor}}**、**{{ui:monsterMonitor.style.deadNameColor}}**、**{{ui:monsterMonitor.style.deadRowPlacement}}**。

スキルマスの表示は [スキル CD](../monitor/skill-cd.md) と同じです。クールダウン中は暗くなって残り秒数が表示され、チャージスキルは右上に使用可能回数が表示されます。サーバーとの接続が切れている間は行が薄くなり、最後に受け取った状態であることを示します。

オーバーレイに表示するかどうかは、[ウィンドウを有効化](./overlay.md) の **{{ui:monsterOverlay.teammateCdGroupTag}}** で切り替えます。

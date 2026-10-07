# 味方 CD

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.teammateCd}}** は、モンスターオーバーレイに味方のスキルクールダウンを表示します。既定ではゲームのチームパネルで各味方の行の横に表示し、独立したリストパネルに切り替えることもできます。指揮役やサポートが、パーティの必殺技・軽減・全体バフがいつ戻るかを把握するのに向いています。

ゲームから届くのは**自分自身**のクールダウンだけなので、味方のクールダウンは味方自身のアプリから共有されます。味方も本アプリを使い、共有を有効にしている場合にだけここに表示されます。アプリを使っていない味方は表示されず、推測もしません。

## 共有を有効にする

1. **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.general}} → {{ui:appSettings.teamShare.title}}** を開き、**{{ui:appSettings.teamShare.enable}}** にチェックが入っていることを確認します（既定で有効）。表示する側と表示される側の**両方**で有効にする必要があります。
2. ゲームを起動してパーティを組みます。状態が「接続済み」になれば、味方がスキルを使うとすぐに反映されます。

- 自分のアプリは**すべて**のスキルクールダウンを共有します。どれを表示するかは各自が自分の側で決めます。
- クールダウンはゲームサーバーの時刻を基準にしているため、PC 間の時計のずれや中継の遅延でカウントダウンが速くなったり遅くなったりすることはありません。
- 同じゲームの Steam・Epic・公式ランチャーは同じ配信区として扱われ、互いに共有できます。

> [!NOTE]
> 有効にすると、キャラクター ID・キャラクター名・職業・パーティ ID・スキルクールダウンを bptimer.cn に送信します。サーバーは同じパーティで共有を有効にしている味方にだけ中継し、メモリ上にのみ保持してデータベースには書き込みません。パーティを抜けるか無効にすると削除されます。

## 表示するスキルを選ぶ

**{{ui:monsterMonitor.tabs.teammateCd}}** タブで：

1. 職業ボタンで職業を切り替えます。ボタンの数字は選択済みのスキル数です。
2. スキルアイコンをクリックして表示／非表示を切り替え、下の ← → で表示順を変えます。
3. スキルを選んでいない職業の味方は表示されません。

## 表示方式

- **{{ui:monsterMonitor.teammateCd.mode.slots}}**（既定）：画面左のチームパネルで、各味方の行の横に選択したスキルアイコンを表示します。メンバーの加入・脱退やリーダーによる組分け変更があると、アイコンもゲームのチームパネルに合わせて移動します。自分、アプリを使っていない味方、ボットの行は空のままです。
- **{{ui:monsterMonitor.teammateCd.mode.list}}**：独立したパネルです。各行に味方の名前・職業アイコン・スキル CD を、ゲームのチームパネルと同じ順で表示します。

> [!NOTE]
> 並び順は、パーティ加入時と編成変更時にゲームが送る通知から得ます。そのため、**プラグインを起動した状態でパーティに入る**必要があります。

## チームパネルに合わせる

**{{ui:monsterMonitor.teammateCd.mode.slots}}** では、5 人と 20 人のチームパネルは表示位置が異なるため、それぞれ一度合わせます。

1. オーバーレイの編集モードを開き、**{{ui:monsterMonitor.teammateCd.slots.editKind}}** で **{{ui:monsterOverlay.teammateCd.slotKind.five}}** または **{{ui:monsterOverlay.teammateCd.slotKind.twenty}}** を選びます（編集モードではここで選んだパネルの枠が表示されます）。オーバーレイに 5 枠または 20 枠分の番号付きプレースホルダーが表示されます。
2. プレースホルダーをドラッグし、1 番の枠をチームパネルの 1 行目の横に合わせます。
3. **{{ui:monsterMonitor.teammateCd.slots.rowPitch}}** で 5 番の枠を 5 行目に合わせます。20 人パネルではさらに **{{ui:monsterMonitor.teammateCd.slots.columnOffset}}** で 6 番（右列の 1 行目）、**{{ui:monsterMonitor.teammateCd.slots.blockOffset}}** で 11 番（下半分の 1 行目）を合わせます。
4. **{{ui:monsterMonitor.teammateCd.slots.side}}**（20 人では **{{ui:monsterMonitor.teammateCd.slots.leftSide}}** と **{{ui:monsterMonitor.teammateCd.slots.rightSide}}**）でアイコンを並べる方向を決めます。最初のスキルは常にチームパネル側に来ます。

20 人パネルの 4 つの組は位置が固定です：左上が 1 組、右上が 2 組、左下が 3 組、右下が 4 組。組内で誰かが抜けると下のメンバーが繰り上がり、アイコンも一緒に移動します。ゲームの解像度や UI スケールを変えた後は合わせ直してください。

## スタイル

**{{ui:monsterMonitor.teammateCd.styleTitle}}**：

- **{{ui:monsterMonitor.teammateCd.mode.slots}}**：**{{ui:monsterMonitor.teammateCd.style.iconSize}}**、**{{ui:monsterMonitor.teammateCd.style.iconGap}}**。
- **{{ui:monsterMonitor.teammateCd.mode.list}}**：**{{ui:monsterMonitor.teammateCd.style.iconSize}}**、**{{ui:monsterMonitor.teammateCd.style.iconGap}}**、**{{ui:monsterMonitor.teammateCd.style.rowGap}}**、**{{ui:monsterMonitor.teammateCd.style.nameColumnWidth}}**、**{{ui:monsterMonitor.teammateCd.style.fontSize}}**、**{{ui:monsterMonitor.teammateCd.style.showClassIcon}}**、**{{ui:monsterMonitor.style.nameColor}}**、**{{ui:monsterMonitor.style.deadNameColor}}**、**{{ui:monsterMonitor.style.deadRowPlacement}}**。

スキルマスの表示は [スキル CD](../monitor/skill-cd.md) と同じです。クールダウン中は暗くなって残り秒数が表示され、チャージスキルは右上に使用可能回数が表示されます。チームパネル横の表示では、戦闘不能の味方のアイコンが暗くなります。サーバーとの接続が切れている間はアイコン（リストでは行全体）が薄くなり、最後に受け取った状態であることを示します。

オーバーレイに表示するかどうかは、[ウィンドウを有効化](./overlay.md) の **{{ui:monsterOverlay.teammateCdGroupTag}}** で切り替えます。

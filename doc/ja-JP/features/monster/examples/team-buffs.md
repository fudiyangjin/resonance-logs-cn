# パーティ全員にバフが付いているか確認する

関連ページ：[味方 Buff](../teammate.md)

**シナリオ**：サポートとして、いくつかのパーティバフを維持する役目です。味方ごとにそれぞれのバフの残り時間を 1 つの表で見て、誰に付いていないか、誰のバフが切れそうかをひと目で知りたいとします。

## ステップ 1：見たいバフを追加する

1. **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.teammate}}** を開きます。
2. 担当しているパーティバフを検索し、**{{ui:monsterMonitor.teammate.groupTitle}}** に追加します。数が多いときは分類からまとめて追加することもできます。

## ステップ 2：列を見分けやすくする

監視中のバフはそれぞれ表の 1 列になります。いちばん重要な列には個別の **{{ui:monsterMonitor.style.progressColor}}** を設定し、ほかの列と区別します。

## ステップ 3：表を調整する

**{{ui:monsterMonitor.teammate.styleTitle}}** で次を設定します。

- **{{ui:monsterMonitor.style.rowHeight}}**、**{{ui:monsterMonitor.style.nameColumnWidth}}**、**{{ui:monsterMonitor.style.buffColumnWidth}}** を調整し、5 人パーティの表が場所を取りすぎないようにします。
- **{{ui:monsterMonitor.style.deadNameColor}}** と **{{ui:monsterMonitor.style.deadRowPlacement}}** を設定し、倒れた味方がすぐわかるようにします。
- 秒単位でかけ直したい場合は **{{ui:monsterMonitor.style.preciseTimer}}** をオンにすると、カウントダウンが 0.1 秒単位で表示されます。

## ステップ 4：位置を決める

1. **{{ui:monsterMonitor.tabs.overlay}}** で **味方 Buff エリア** がオンになっているか確認します（既定でオン）。
2. **{{ui:monsterMonitor.actions.editLayout}}** をクリックし、表をゲームのパーティ表示の横へドラッグします。

## 結果

味方ごとに 1 行、バフごとに 1 列で表示されます。空のマスはその味方にバフが付いていないこと、残り少ないバーはまもなく切れることを示します。

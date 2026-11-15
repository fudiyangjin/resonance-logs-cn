# エリートの危険な詠唱を知らせる

関連ページ：[モンスタースキル](../monster-skill.md)

**シナリオ**：あるエリートモンスターの詠唱スキルには DBM の予告がなく、当たるとダウンしてしまいます。詠唱が始まったらすぐオーバーレイに目立つ 1 行とカウントダウンを表示し、音声でも知らせてほしいとします。

## ステップ 1：スキルを探す

1. **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.monsterSkill}}** を開き、**{{ui:monsterMonitor.monsterSkill.searchTitle}}** でスキル名から検索します。
2. 名前がわからない場合は、一度そのモンスターと戦ってから、[履歴](../../dps/history.md) のタイムラインのスキルマーカーでスキル ID を確認し、ID で検索します。表に載っていないスキルも、完全な ID を入力すれば追加できます。

## ステップ 2：表示を設定する

**{{ui:monsterMonitor.monsterSkill.listTitle}}** で次を設定します。

1. **{{ui:monsterMonitor.monsterSkill.label}}** に「避けて」と入力します。
2. **{{ui:monsterMonitor.monsterSkill.displaySeconds}}** にそのスキルの詠唱秒数を入力します。
3. **{{ui:monsterMonitor.monsterSkill.countdown}}** にチェックを入れると、残り秒数と進捗バーが表示されます。

## ステップ 3：音声を設定する

このスキルの **発生時** の読み上げをオンにし、文言はカスタムで「避けて」と入力します。続けて **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** で **{{ui:voice.bindings.generateMissing}}** をクリックします。

## ステップ 4：モンスタースキルエリアをオンにする

**{{ui:monsterMonitor.tabs.overlay}}** で **モンスタースキルエリア** をオンにし（既定でオフ）、**{{ui:monsterMonitor.actions.editLayout}}** をクリックして画面中央の少し上へドラッグします。

## 結果

エリートが詠唱を始めると、オーバーレイに「避けて」とカウントダウンが表示され、同時に音声が流れます。カウントダウンが 0 になるのがちょうどスキルの着弾タイミングです。

> [!TIP]
> Boss によっては、スキル A の一定秒数後に必ずスキル B を使います。A をリストに追加し、別名を「B が来る」、表示秒数を 2 つの間隔にすると、B を前もって知らせられます。[次のスキルまでのカウントダウン](../monster-skill.md#次のスキルまでのカウントダウン) を参照してください。

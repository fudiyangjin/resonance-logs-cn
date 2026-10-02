# 鎌車の残り時間を表示する

関連ページ：[エンティティ持続](../entity-duration.md)

**シナリオ**：鎌車が切れる前に出し直す必要があるので、自分の鎌車の残り時間をオーバーレイに表示し、残り 5 秒で知らせてほしいとします。

## ステップ 1：プリセットを追加する

1. **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.entityDuration}}** を開きます。
2. **{{ui:monsterMonitor.entityDuration.presetsTitle}}** で **鎌車**（ID 179903、35 秒、自分のみ、同じ ID をまとめる）をクリックします。鎌車は 1 回の発動でエンティティが 2 つ生成されますが、プリセットでは **{{ui:monsterMonitor.entityDuration.merge}}** が最初から有効なので、オーバーレイには 1 行だけ表示されます。

## ステップ 2：通知を設定する

音声読み上げで鎌車の **残り x 秒** にチェックを入れ、秒数に 5 を入力し、文言を「鎌車そろそろ」にします。

## ステップ 3：表示を確認する

1. **{{ui:monsterMonitor.tabs.overlay}}** で **エンティティ持続エリア** が表示になっていることを確認します。
2. **{{ui:monsterMonitor.actions.editLayout}}** で位置を調整します。
3. 鎌車を一度出すと、エンティティ持続エリアに「鎌車」とカウントダウンが表示されます。

## 味方の鎌車も見る

味方の鎌車も見たい場合、同じ ID を手動でもう一度追加することはできません（ID ごとに 1 件のみ保持）。既存項目の **{{ui:monsterMonitor.entityDuration.scope}}** を **{{ui:monsterMonitor.entityDuration.scope.any}}** に変更すると、各行が「鎌車-発動者」と表示されます。範囲を変更したら音声を設定し直す必要があります。

## ほかのエンティティ

プリセットのない召喚物や設置物は、**{{ui:monsterMonitor.entityDuration.manualTitle}}** でエンティティ ID と持続時間を入力するだけです。持続時間がわからない場合は空欄にすると `∞` と表示され、エンティティが消えるまで続きます。

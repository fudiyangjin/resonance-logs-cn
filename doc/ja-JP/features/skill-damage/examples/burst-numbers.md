# 必殺技のダメージ数値を目立たせる

関連ページ：[スキルダメージ表示](../README.md)

**シナリオ**：必殺技を当てたとき、キャラクターの上に必殺技のアイコン付きで大きな金色の数値を表示したいとします。画面が散らからないよう、ほかのスキルのダメージは表示しません。

## ステップ 1：有効にしてスキルグループを作る

1. サイドバーの **{{ui:routes.tools.skillDamage}}** を開き、**{{ui:skillDamage.enabled}}** をオンにします。
2. **{{ui:skillDamage.addGroup}}** をクリックし、**{{ui:skillDamage.groupName}}** に「必殺技」と入力します。

## ステップ 2：必殺技のダメージを追加する

1. グループ設定の一番下の検索ボックスに必殺技の名前を入力し、結果をクリックして追加します。
2. 同じ名前の結果が複数あるときは、先に DPS スキル詳細の「ID」列をオンにし（[表示設定](../../dps/settings.md)）、必殺技を 1 回使ってダメージ ID を確認してから、ID で検索して追加します。
3. 必殺技のダメージが複数段に分かれている場合は全段を追加し、**{{ui:skillDamage.groupMerge}}** をオンにします。同一バッチの各段が合算され、グループ名「必殺技」で 1 つの数値として表示されます。

## ステップ 3：スタイルを調整する

1. **{{ui:skillDamage.displayMode}}** は **{{ui:skillDamage.mergeMode}}** のままにします。
2. **{{ui:skillDamage.labelMode}}** を **{{ui:skillDamage.nameIcon}}** にし、**{{ui:skillDamage.iconPresets}}** からクラスごとに必殺技のアイコンを選びます。
3. **{{ui:skillDamage.fontSize}}** を 40 前後に上げ、**{{ui:skillDamage.numberStyle}}** で **{{ui:skillDamage.fill}}** を金色のグラデーションにし、暗い色の **{{ui:skillDamage.outline}}** を付けます。明るい場面でも読みやすくなります。
4. **{{ui:skillDamage.format}}** を **{{ui:skillDamage.western}}** にすると、大きな数値が読みやすくなります。
5. **{{ui:skillDamage.test}}** をクリックしてプレビューします。

## ステップ 4：位置を決める

ページ上部の **{{ui:skillDamage.actions.editLayout}}** をクリックし、「必殺技」グループのエリアをキャラクターの上へドラッグし、角をドラッグして大きさを調整します。終わったら編集を終了します。

## 結果

必殺技を当てると、キャラクターの上にアイコン付きの金色のダメージ数値が表示されます。

![ゲーム内のスキルダメージ表示](../../../../shared/img/changelog/v0.2.9_1.png)

> [!TIP]
> ほかのスキルも見たい場合は、スキルグループをもう 1 つ作り、小さめの文字で反対側に置きます。グループごとのエリアとスタイルは互いに影響しません。

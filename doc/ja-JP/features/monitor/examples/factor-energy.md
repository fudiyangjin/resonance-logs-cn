# 因子エネルギーとシーズンノードを自動表示する

関連ページ：[カスタムモニター](../custom-panel.md)

**シナリオ**：戦闘中にいつでも因子エネルギーがどれだけ溜まったか、因子効果やシーズンノード Buff がいつ発動したかを見たいが、カウンタールールの設定方法までは調べたくない。

## ステップ 1：因子エリアを新規作成する

1. **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.customPanel}}** を開きます。
2. **{{ui:skillMonitor.customPanel.newFactor}}** をクリックします。
3. **{{ui:skillMonitor.customPanel.groupName}}** に名前（例：「因子」）を付けます。

現在のシーズンに応じて、作成されるのは次のどちらかです：

- **S3 以前**：{{ui:skillMonitor.customPanel.kind.factor}}。装備中の因子のエネルギーと Buff 効果を表示；
- **S4 以降**：{{ui:skillMonitor.customPanel.kind.seasonNode}}。有効化済みノードの Buff 効果を表示。

## ステップ 2：マップを一度切り替える

項目はゲームから同期される完全なキャラクターデータから作られます。作成後にテレポートするか、ダンジョンに一度出入りすると、因子エリアに内容が入ります。以降、ゲーム内で因子を変更したりパスを切り替えたりしても項目は自動で更新されるので、エリアを作り直す必要はありません。

![S4 シーズンノードエリアの表示](../../../../shared/img/changelog/v0.2.1_1.png)

## ステップ 3：わかりやすい名前に変える（因子設定エリアのみ）

既定の名前は内部的な説明文になっていることがあるので、使い慣れた呼び方に変えられます：

- **エネルギー系の項目**：**{{ui:skillMonitor.customPanel.factorSlots.title}}** でその slot を検索し、「カスタム表示名」に「A エネルギー」などと入力します。
- **Buff 効果の項目**：**{{ui:skillMonitor.tabs.buff}} → {{ui:skillMonitor.buff.alias.title}}** でその Buff を検索し、「A 発動」などの別名を設定します。

シーズンノードエリアの名前はノード Buff からそのまま取られるため、設定は不要です。

## ステップ 4：スタイルと位置を調整する

1. **{{ui:skillMonitor.customPanel.style.title}}** でフォントサイズを大きくし、プログレスバーの色を設定します。
2. ページ上部の **{{ui:skillMonitor.layout.editOverlayLayout}}** をクリックし、因子エリアをスキル CD の横までドラッグします。

## 応用：ほかの Buff と並べて見る

因子エリアには項目を手動で追加できません。特定のバースト Buff も一緒に見たい場合は、**{{ui:skillMonitor.customPanel.new}}** で手動エリアをもう 1 つ作ってその Buff を入れ、レイアウトで 2 つのエリアを隣り合わせに配置してください。

# パーティの強化 Buff 稼働率を振り返る

関連ページ：[バフ稼働率](../buff-coverage.md)

**シナリオ**：あなたはサポート役で、パーティに与ダメージ増加 Buff を付ける担当です。このボス戦で強化 Buff の稼働率がどのくらいだったか、どこで途切れたかを知りたい。

## ステップ 1：集計する Buff を追加する

1. **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.buffCoverage}}** を開きます。
2. **{{ui:skillMonitor.buffCoverage.list.title}}** で担当する強化 Buff（「灼熱の戦意（山賊頭目）」「高原血統（バジリスク）」など）を検索し、1 つずつ追加します。

## ステップ 2：オーバーレイに表示するか決める

- 戦闘中に自分の稼働率をリアルタイムで見たい場合：その項目の **{{ui:skillMonitor.buffCoverage.entry.showInLive}}** をオンにし、[ウィンドウを有効化](.././overlay.md) で **バフ稼働率エリア** をオンにします。
- 後で振り返るだけの場合：オフのままで構いません。集計は通常どおり行われます。

![リアルタイムの稼働率](../../../../shared/img/changelog/v0.2.3_1.png)

## ステップ 3：戦闘後に履歴を見る

1. **{{ui:routes.tools.dps}} → {{ui:routes.dps.history}}** を開き、この戦闘をクリックします。
2. **{{ui:history.buffCoverage.title}}** に各 Buff の稼働率と発動回数が表示されます。稼働率は**アクティブな戦闘時間**で計算されるため、ボスの無敵やフェーズ移行の空白時間で数値が下がることはありません。

![稼働率のまとめ](../../../../shared/img/changelog/v0.2.3_3.png)

3. **{{ui:history.timeline.buff.title}}** を展開して確認したいプレイヤーを選ぶと、各色ブロックが Buff の発効していた時間を表します。上の DPS 曲線と見比べれば、強化 Buff がバーストのタイミングに合っていたかがわかります。

![Buff カバータイムライン](../../../../shared/img/changelog/v0.2.3_2.png)

> [!NOTE]
> 記録されるのは監視リストに追加済みの Buff だけです。新しく追加した Buff は次の戦闘から集計されます。

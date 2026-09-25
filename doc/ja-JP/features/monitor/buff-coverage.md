# バフ稼働率

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.buffCoverage}}** は、指定した Buff の戦闘中の**稼働率**（発効時間 ÷ アクティブな戦闘時間）と**発動回数**を集計します。リアルタイムで確認できるほか、履歴で振り返ることもできます。

![リアルタイムの稼働率](../../../shared/img/changelog/v0.2.3_1.png)

## 監視を追加する

**{{ui:skillMonitor.buffCoverage.list.title}}** で Buff を検索して追加します。追加できる数には上限があり、ページに「追加済み / 上限」が表示されます。

各項目には **{{ui:skillMonitor.buffCoverage.entry.showInLive}}** スイッチがあります：

- **オン**：自分の稼働率がライブモニターのオーバーレイのバフ稼働率エリアに表示されます；
- **オフ**：オーバーレイには表示されませんが、味方と履歴のデータは引き続き集計されます。

## オーバーレイのスタイル

**{{ui:skillMonitor.buffCoverage.style.title}}** では、各行に **状態ドット**、**名前**、**残り時間**、**稼働率 %**、**発動回数**、**カウントダウンバー** を表示するかどうかを切り替え、名前・数値・プログレスバーの色を設定できます。

## 履歴で確認する

戦闘終了後、[履歴](../dps/history.md#buff-カバー率) の詳細ページを開くと、各メンバーについてこれらの Buff のカバータイムラインと稼働率のまとめを確認できます。

![稼働率のまとめ](../../../shared/img/changelog/v0.2.3_3.png)

## 例

### 例：パーティの強化 Buff 稼働率を振り返る

**シナリオ**：あなたはサポート役で、パーティに与ダメージ増加 Buff を付ける担当です。このボス戦で強化 Buff の稼働率がどのくらいだったか、どこで途切れたかを知りたい。

#### ステップ 1：集計する Buff を追加する

1. **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.buffCoverage}}** を開きます。
2. **{{ui:skillMonitor.buffCoverage.list.title}}** で担当する強化 Buff（「灼熱の戦意（山賊頭目）」「高原血統（バジリスク）」など）を検索し、1 つずつ追加します。

#### ステップ 2：オーバーレイに表示するか決める

- 戦闘中に自分の稼働率をリアルタイムで見たい場合：その項目の **{{ui:skillMonitor.buffCoverage.entry.showInLive}}** をオンにし、[ウィンドウを有効化](./overlay.md) で **バフ稼働率エリア** をオンにします。
- 後で振り返るだけの場合：オフのままで構いません。集計は通常どおり行われます。

![リアルタイムの稼働率](../../../shared/img/changelog/v0.2.3_1.png)

#### ステップ 3：戦闘後に履歴を見る

1. **{{ui:routes.tools.dps}} → {{ui:routes.dps.history}}** を開き、この戦闘をクリックします。
2. **{{ui:history.buffCoverage.title}}** に各 Buff の稼働率と発動回数が表示されます。稼働率は**アクティブな戦闘時間**で計算されるため、ボスの無敵やフェーズ移行の空白時間で数値が下がることはありません。

![稼働率のまとめ](../../../shared/img/changelog/v0.2.3_3.png)

3. **{{ui:history.timeline.buff.title}}** を展開して確認したいプレイヤーを選ぶと、各色ブロックが Buff の発効していた時間を表します。上の DPS 曲線と見比べれば、強化 Buff がバーストのタイミングに合っていたかがわかります。

![Buff カバータイムライン](../../../shared/img/changelog/v0.2.3_2.png)

> [!NOTE]
> 記録されるのは監視リストに追加済みの Buff だけです。新しく追加した Buff は次の戦闘から集計されます。

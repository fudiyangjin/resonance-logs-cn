# 表示設定

**{{ui:routes.tools.dps}} → {{ui:routes.dps.settings}}** では、DPS ウィンドウに「どのデータを表示するか」——名前、列、数値の書式、更新レート、訓練用ダミーのルール——を決めます。**{{ui:settings.tabs.live}}** と **{{ui:settings.tabs.history}}** の 2 つのタブに分かれており、互いに影響しません。

> [!NOTE]
> これらの設定は **DPS 設定プロファイル** に保存され、[ロードアウト](../app/loadouts.md) と一緒に切り替え・エクスポートされます。パケットキャプチャ、ショートカット、ログなどのアプリ全体の設定は [アプリ設定](../app/README.md) に移動しました。

## ライブ

### 共通設定

| 設定 | 説明 |
| --- | --- |
| **{{ui:settings.common.name.your}}** / **{{ui:settings.common.name.others}}** | 名前、クラス、名前 - クラス、名前 - スペックを表示、または非表示（動画撮影時によく使います） |
| **能力スコア / シーズン強度** | 自分と他プレイヤーのスコアを名前の横に表示するか |
| **最高値に合わせてスケール** | バーの長さを全体の最高値基準にするか、合計基準にするか |
| **数値を短縮表示** | DPS / TPS / 能力スコアを短縮表示するか |
| **{{ui:settings.common.abbreviationStyle}}** | {{ui:settings.common.abbreviationStyle.western}} または {{ui:settings.common.abbreviationStyle.cn}} |
| **{{ui:settings.common.decimalPlaces}}** | 1～4 桁 |
| **{{ui:settings.live.fantasyCastIcons}}** | 最近発動した幻想のアイコンをプレイヤー名の横に表示 |
| **{{ui:settings.live.refreshRate}}** | 50～2000 ms。低いほど滑らかですが、CPU 負荷も増えます |

### 列

**{{ui:settings.common.columns.dpsPlayers}}**、**{{ui:settings.common.columns.dpsSkills}}**、回復、被ダメージ、**{{ui:settings.common.columns.deathReplay}}** には、それぞれ列の設定があります：

- スイッチで列の表示・非表示を切り替え；
- 矢印で列の順序を変更；
- **カスタム列名**を入力でき、空欄なら既定の列名を使用。

死亡リプレイの列はライブと履歴で共通です。

### 訓練用ダミー

| 設定 | 説明 |
| --- | --- |
| **{{ui:settings.live.trainingWindow}}** | ダミーに命中した時点から計測し、時間になるとそのラウンドを終了。既定は 3:03（183 秒） |
| **{{ui:settings.live.trainingLockPolicy}}** | **{{ui:settings.live.trainingLockPolicy.eliteDummies}}**：訓練場のエリートダミーのみを対象；**{{ui:settings.live.trainingLockPolicy.firstMonster}}**：自分（召喚物を含む）が次に命中させたモンスターをロック。フィールドやダンジョンでのテストに便利 |

訓練用ダミーの流れは [例：訓練用ダミーモードで 3 分間の火力を測る](./examples/dummy-rotation.md) を参照してください。

## 履歴

履歴タブには、ライブと同じ構成の共通設定と列設定があり、履歴の詳細を開いたときにのみ適用されます。ほかにタイムライン関連の設定があります：

| 設定 | 説明 |
| --- | --- |
| **{{ui:settings.history.timeline.laneH}}** | 各レーンの高さ |
| **{{ui:settings.history.timeline.curveH}}** | DPS 曲線エリアの高さ |
| **{{ui:settings.history.timeline.instantWindow}}** | 瞬間 DPS 曲線が直近何秒を集計するか |
| **{{ui:settings.history.fantasyCastIcons}}** | 戦闘全体で最近発動した幻想 2 種をプレイヤー名の横に表示 |

## 例

- [テーブルの表示列をカスタマイズする](./examples/table-columns.md)
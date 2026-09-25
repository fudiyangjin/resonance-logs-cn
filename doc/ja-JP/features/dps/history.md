# 履歴

**{{ui:routes.tools.dps}} → {{ui:routes.dps.history}}** には自動で区切られたすべての戦闘が保存され、いつでも開いて振り返ることができます。

![履歴](../../../shared/img/dps/dps_3.png)

## 履歴一覧

- **絞り込み**：**{{ui:history.list.filters.favorite}}**、ボス、プレイヤー、エンカウントで絞り込み。**{{ui:history.list.filters.favoriteOnly}}** をクリックするとお気に入りだけを表示します。
- **一括削除**：複数の記録にチェックを入れて **{{ui:history.list.actions.delete}}** をクリック。削除は元に戻せません。
- **ページ送り**：下部で 1 ページあたりの行数を設定できます。

> [!NOTE]
> 履歴が **200 件** を超えると、次回起動時に古い記録から時間順に自動削除されます。重要な記録は **お気に入りに追加** しておけば削除されません。

## 戦闘の詳細

任意の記録をクリックすると詳細が開きます。上部には **{{ui:history.detail.tabs.damage}}**、**{{ui:history.detail.tabs.tanked}}**、**{{ui:history.detail.tabs.healing}}**、**{{ui:history.detail.tabs.death}}** の 4 つのタブがあります。

右上の操作：

| ボタン | 機能 |
| --- | --- |
| **{{ui:history.detail.actions.addFavorite}}** | この戦闘をお気に入りに登録し、一覧ですばやく絞り込めるようにする |
| **ウェブサイトで開く** | resonance-logs.com でこの戦闘を表示 |
| **削除** | この記録を削除 |

プレイヤーをクリックすると、スキル詳細（最大 / 最小 / 平均ダメージを含む）と、**ダメージ対象 / 回復対象 / ダメージソース** 別の内訳を確認できます。たとえば、自分のダメージが Boss に入っているのか雑魚に入っているのかを確認できます。

## タイムライン

詳細ページの **{{ui:history.timeline.title}}** は戦闘全体を時間軸で展開します：

- **曲線**：**{{ui:history.timeline.series.instant}}** はその時点の火力の上下を、**{{ui:history.timeline.series.average}}** は全体の傾向を示します。表示するメンバーの曲線を選択できます。
- **レーン**：**{{ui:history.timeline.lanes.boss}}** レーンには Boss のスキル、**{{ui:history.timeline.lanes.team}}** レーンにはメンバーの主要スキルと幻想の発動が表示されます。

![履歴タイムライン](../../../shared/img/changelog/v0.2.1_2.png)

操作方法：**ドラッグ** で範囲選択 · **Shift + ドラッグ** でパン · **スクロール** でズーム · **ダブルクリック** でリセット · 下端をドラッグして高さを調整。

範囲を選択すると、ページ上のダメージ統計が**選択範囲だけで再計算**されます。**{{ui:history.timeline.selection.zoomToRange}}** をクリックすると拡大表示できます。

## Buff カバー率

[Buff カバー率](../monitor/buff-coverage.md) で監視リストを設定している場合、履歴の詳細に次の内容が追加で表示されます：

- **{{ui:history.timeline.buff.title}}** タイムライン：各 Buff がいつ有効になり、どれだけ持続したか；
- **{{ui:history.buffCoverage.title}}**：アクティブ戦闘時間を基準にしたカバー率と発動回数。

![Buff カバー率タイムライン](../../../shared/img/changelog/v0.2.3_2.png)

![Buff カバー率サマリー](../../../shared/img/changelog/v0.2.3_3.png)

> [!NOTE]
> カバー率データは v0.2.3 から記録されています。それ以前の履歴にはこの内容はありません。

監視リストの設定から戦闘後の振り返りまでの流れは、[例：パーティの強化 Buff 稼働率を振り返る](../monitor/buff-coverage.md#例パーティの強化-buff-稼働率を振り返る) を参照してください。

## 履歴ページの表示設定

レーンの行の高さ、曲線の高さ、瞬間 DPS の集計時間、履歴テーブルの列は、すべて **{{ui:routes.dps.settings}} → {{ui:settings.tabs.history}}** で設定します。[表示設定](./settings.md#履歴) を参照してください。

## 例

### 例：タイムラインで火力の空白を見つける

**シナリオ**：Boss 戦を終えたところ、DPS がいつもより低かった。どの区間で火力が落ちたのか、なぜ落ちたのかを確かめたい場合です。

#### ステップ 1：その戦闘を開く

1. **{{ui:routes.tools.dps}} → {{ui:routes.dps.history}}** を開きます。
2. 「ボス」フィルターでこの Boss を絞り込み、先ほどの記録を開きます。

#### ステップ 2：瞬間 DPS 曲線を見る

**{{ui:history.timeline.title}}** で曲線を **{{ui:history.timeline.series.instant}}** に切り替え、曲線の選択では自分と参考にするメンバー 1～2 人だけにチェックを入れます。

- 曲線全体が低い → スキル回しや構成の問題；
- ある区間で急に 0 近くまで落ちている → その時間に空白がある。

![履歴タイムライン](../../../shared/img/changelog/v0.2.1_2.png)

#### ステップ 3：空白を範囲選択する

1. 曲線上で落ち込んでいる区間を**ドラッグ**して選択します。
2. ページのダメージ統計が**その区間だけで**再計算され、その間にどのスキルを使い、誰に当てたかがわかります。
3. **{{ui:history.timeline.selection.zoomToRange}}** をクリックして拡大し、上の **{{ui:history.timeline.lanes.boss}}** レーンと照らし合わせます。よくある原因は、Boss のフェーズ移行 / 無敵、またはギミックの回避中です。

#### ステップ 4：バフが切れていないか確認する

[Buff カバー率](../monitor/buff-coverage.md) を設定している場合は、**{{ui:history.timeline.buff.title}}** を展開して自分を選び、空白の間にバースト Buff がちょうど切れていなかったかを確認します。

![Buff カバー率タイムライン](../../../shared/img/changelog/v0.2.3_2.png)

#### ステップ 5：戦闘不能になっていた場合

**{{ui:history.detail.tabs.death}}** に切り替え、死亡前の数秒間に受けたすべてのダメージを確認して、どのギミックが原因だったかを判断します。

> [!TIP]
> 長期的に比較したい場合は、最も成績のよかった戦闘を **{{ui:history.detail.actions.addFavorite}}** しておき、以後の振り返りで同じフェーズの曲線と見比べましょう。

# スキルダメージ表示

**{{ui:routes.tools.skillDamage}}** は、**自分**が指定したスキルのヒットごとのダメージ数値をゲームオーバーレイに表示します。必殺技やバーストスキルだけ目立つフォントとアニメーションにしたり、一定時間のダメージを 1 つの合計にまとめたりできます。

![ゲーム内のスキルダメージ表示](../../../shared/img/changelog/v0.2.9_1.png)

## 有効にする

1. サイドバーの **{{ui:routes.tools.skillDamage}}** を開き、**{{ui:skillDamage.enabled}}** をオンにします（既定はオフ）。ページ上部の **{{ui:skillDamage.actions.toggleOverlay}}** ボタンも同じスイッチです。
2. スキルグループ設定の一番下でスキルを検索して追加します。既定のスキルグループは空なので、スキルを追加するまで何も表示されません。**{{ui:skillDamage.allSelfDamage}}** をオンにすると、自分のすべてのスキルのダメージを表示できます。
3. ページ上部の **{{ui:skillDamage.actions.editLayout}}** をクリックし、各スキルグループの表示エリアを好きな位置へドラッグします。

**{{ui:skillDamage.autoHideInDailyScenes.label}}**：メインシティなどの日常シーンでは自動的に非表示にし、離れると元に戻します。

## プロファイル

ダメージ表示の設定はダメージ表示プロファイルに保存され、[ロードアウト](../app/loadouts.md) に合わせて切り替わります。ページ上部の **{{ui:skillDamage.profile.title}}** でプロファイルの作成・名前変更・削除や、現在のロードアウトのプロファイル切り替えができます。**{{ui:routes.tools.loadouts}}** ページで各ロードアウトの **{{ui:loadout.page.damageProfileLabel}}** を選ぶこともできます。アップロードしたフォントは 1 つだけ保存され、すべてのプロファイルとスキルグループで共有されます。

## スキルグループ

1 つのプロファイルに複数のスキルグループを作れます。グループごとに表示エリア、表示モード、数値のスタイルを持ちます。**{{ui:skillDamage.addGroup}}** / **{{ui:skillDamage.deleteGroup}}** で管理し、**{{ui:skillDamage.groupEnabled}}** で一時的にオフにできます。

### スキルを追加する

グループ設定の一番下の検索ボックスで、スキル名・別名・ダメージ ID から検索し、結果をクリックして追加します。

- 同じ名前で ID が異なるダメージは別々に追加できます。
- 表に名前のないダメージも、完全な ID を入力すれば追加できます。
- スキルごとに **{{ui:skillDamage.alias}}** を入力すると、スキル名の代わりに別名を表示します。

ダメージ ID は DPS スキル詳細の「ID」列で確認できます。この列は既定で非表示なので、[表示設定](../dps/settings.md) でオンにしてください。

**{{ui:skillDamage.allSelfDamage}}**：自分のすべてのスキルのダメージをこのグループのダメージとして扱うので、スキルを 1 つずつ追加する必要はありません。どちらの表示モードでも使えます。

### 表示モード

| モード | 表示 |
| --- | --- |
| **{{ui:skillDamage.mergeMode}}**（既定） | ヒットごとに数値を 1 つ表示 |
| **{{ui:skillDamage.continuousMode}}** | 加算され続ける数値を 1 つだけ表示し、ウィンドウ終了時に合計のアニメーションを再生 |

**{{ui:skillDamage.mergeMode}}** の設定：

- **{{ui:skillDamage.mergeHits}}**：同じスキルの同一バッチ内の複数ヒットを合計して表示します。オフ（既定）のときはヒットごとに 1 件ずつ表示します。
- **{{ui:skillDamage.groupMerge}}**：同一バッチ内のグループ内スキルのダメージを合算し、グループ名で表示します。
- **{{ui:skillDamage.maxVisible}}**（既定 8）、**{{ui:skillDamage.scrollDirection}}**、**{{ui:skillDamage.animation}}**、**{{ui:skillDamage.duration}}**（既定 2.5 秒）。

**{{ui:skillDamage.continuousMode}}** では、**{{ui:skillDamage.windowMode}}** で累計の開始と精算のタイミングを決めます。

| ウィンドウの条件 | 累計開始 | 精算 |
| --- | --- | --- |
| **{{ui:skillDamage.windowRolling}}**（既定） | グループ内スキルの命中 | **{{ui:skillDamage.continuousWindow}}**（既定 1.5 秒）内に新しい命中がない |
| **{{ui:skillDamage.windowSkills}}** | 開始スキルがダメージを与えたとき。指定しない場合はグループ内のどのスキルの命中でも開始 | 終了スキルの命中、または **{{ui:skillDamage.windowTimeout}}**（既定 15 秒） |
| **{{ui:skillDamage.windowCast}}** | 自分が詠唱を開始（現在は寒氷射線とヴァーダントオラクルの灌注） | 詠唱終了後、**{{ui:skillDamage.castCloseDelay}}** が経過したとき |

- **{{ui:skillDamage.continuousAll}}**：ウィンドウ内のほかのスキルのダメージも合計と連撃数に含めます。ただし、ウィンドウを開始・更新するのはグループ内スキルの命中だけです。
- **{{ui:skillDamage.continuousAnimation}}** と **{{ui:skillDamage.continuousFinalAnimation}}** は別々に設定でき、**{{ui:skillDamage.continuousTotalDuration}}** で合計を表示しておく時間を決めます。
- **{{ui:skillDamage.showComboCount}}**：`1 HIT` または `×1` の形式で、数値の上・下・左・右に表示できます。

### スキルの表示形式と数値のスタイル

- **{{ui:skillDamage.labelMode}}**：**{{ui:skillDamage.nameText}}**、**{{ui:skillDamage.nameIcon}}**、**{{ui:skillDamage.nameNone}}**。アイコンの場合は **{{ui:skillDamage.iconPresets}}** からクラスごとにスキルアイコンやタレントアイコンを選び、**{{ui:skillDamage.iconBackground}}** と **{{ui:skillDamage.iconOpacity}}** を設定できます。
- **{{ui:skillDamage.format}}**：**{{ui:skillDamage.integer}}**、**{{ui:skillDamage.grouped}}**（既定）、**{{ui:skillDamage.cn}}**、**{{ui:skillDamage.western}}**。
- **{{ui:skillDamage.font}}**：システムフォント、または .woff2 / .woff / .ttf / .otf ファイルのアップロード。あわせて **{{ui:skillDamage.fontSize}}**、**{{ui:skillDamage.fontWeight}}** も設定できます。
- **{{ui:skillDamage.numberStyle}}**：斜体、**{{ui:skillDamage.fill}}**（単色 / グラデーション）、**{{ui:skillDamage.innerGlow}}**、**{{ui:skillDamage.outline}}**、**{{ui:skillDamage.outerGlow}}**、**{{ui:skillDamage.shadow}}**。
- 設定したら **{{ui:skillDamage.test}}** をクリックすると、ページ下部で現在のフォントとアニメーションをプレビューできます。

> [!NOTE]
> ここに表示されるのは自分のダメージだけです。DPS 設定の [除外対象](../dps/settings.md#除外対象) はここには影響しないので、ダミーへのダメージ数値も表示されます。

## 例

- [必殺技のダメージ数値を目立たせる](./examples/burst-numbers.md)
- [寒氷射線 1 回分の合計ダメージ](./examples/frost-ray-total.md)

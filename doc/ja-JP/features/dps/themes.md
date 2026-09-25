# テーマと外観

**{{ui:routes.tools.dps}} → {{ui:routes.dps.themes}}** では、ライブ DPS ウィンドウの「見た目」——配色、サイズ、テーブルのスタイル、ヘッダーのレイアウト——を決めます。ページは **{{ui:themes.tabs.general}}**、**{{ui:themes.tabs.live}}**、**{{ui:themes.tabs.presets}}** の 3 つのタブに分かれています。

![テーマページ](../../../shared/img/dps/dps_4.png)

> [!TIP]
> いちばん手早いのは、まず **{{ui:themes.tabs.presets}}** でカラープリセットとサイズプリセットを選び、ほかのタブで微調整する方法です。

## プリセット

### カラープリセット

| プリセット | スタイル |
| --- | --- |
| **{{ui:themes.preset.color.dark.name}}** | 既定のダーク。ほとんどの場面に適しています |
| **{{ui:themes.preset.color.light.name}}** | 明るい背景 |
| **{{ui:themes.preset.color.pink.name}}** / **{{ui:themes.preset.color.green.name}}** / **{{ui:themes.preset.color.matcha.name}}** | やわらかい配色 |
| **{{ui:themes.preset.color.rainbow.name}}** | カラフルなグラデーション行 |

カラープリセットは**現在のロードアウト**のライブウィンドウに適用されます。

![カラープリセット](../../../shared/img/faq/faq_3.png)

### サイズプリセット

| プリセット | 効果 |
| --- | --- |
| **{{ui:themes.preset.size.compact.name}}** | 余白なし・ヘッダーなしで、テーブルだけを表示 |
| **{{ui:themes.preset.size.small.name}}** / **{{ui:themes.preset.size.medium.name}}** / **{{ui:themes.preset.size.large.name}}** | 行の高さ、文字サイズ、アイコンが段階的に大きくなる |

## 色

**{{ui:themes.tabs.general}} → {{ui:themes.section.colorThemes}}** で設定します：

- **{{ui:themes.section.customColorTheme}}**：背景、**背景（ライブ）**、文字、ボタン、枠線、テーブル文字、K/M/% 接尾辞、ツールチップなどの色を項目ごとに変更できます。どの項目も透明度に対応しています。
- **{{ui:themes.section.classSpecColors}}**：テーブルでクラス / スペックごとに色分けする際の色。

**背景（ライブ）** の透明度を下げると半透明のウィンドウになります。[例：透明なミニマル DPS ウィンドウ](#例透明なミニマル-dps-ウィンドウ) を参照してください。

![背景の透明度を調整](../../../shared/img/faq/faq_2.png)

> [!NOTE]
> ここでの色は DPS ウィンドウにのみ影響します。メインウィンドウ自体の配色、背景画像、フォントは [アプリ設定 · 外観](../app/README.md#外観) で設定します。

## テーブル

**{{ui:themes.table.playerSettings}}** と **{{ui:themes.skillTable.settings}}** で各行の見た目を調整します：

- 行の高さ、文字サイズ、アイコンサイズ；
- 行のハイライト方式（グラデーション（下線） / グラデーション / ソリッド）、**{{ui:themes.table.rowGlowOpacity}}**、行の角丸；
- テーブルヘッダーの表示有無、高さ、文字サイズ、色；
- K/M/% 接尾辞の文字サイズ。

## コンパクトモード

**{{ui:themes.compact.enable}}** をオンにすると、プレイヤーテーブルとスキルテーブルの両方でヘッダーが非表示になり、各行には合計（DPS）と割合だけが表示され、合計の降順に並びます。DPS パネルでは、括弧内に **{{ui:themes.compact.option.dps}}** と **{{ui:themes.compact.option.tdps}}** のどちらを表示するかを選べます。

![コンパクトモード](../../../shared/img/dps/dps_5.png)

## ヘッダー設定

**{{ui:themes.tabs.live}} → {{ui:themes.header.title}}** では、ウィンドウ上部のバーを管理します：

- **レイアウトモード**：**{{ui:themes.header.layoutMode.classic}}** は固定の 2 行構成です。**{{ui:themes.header.layoutMode.custom}}** では、タイマー、エンカウント名、訓練用ダミーの状態、総ダメージ、総 DPS、Boss HP、ナビゲーションタブ、操作ボタンを複数行に自由に配置し、順序や間隔も調整できます。
- **Boss HP**：**{{ui:themes.header.bossHealthLayout.vertical}}** または **{{ui:themes.header.bossHealthLayout.horizontal}}** を選択できます。横は狭いウィンドウで HP に 1 行を割り当てたいときに向いています。
- **ボタン**：リセット、一時停止、**{{ui:themes.header.showHeaderControl}}**、設定、最小化の各ボタンを個別に切り替えます。
- **タイマー**：**{{ui:themes.header.showActiveTimer}}** をオンにすると、True DPS に使われるアクティブ時間がタイマーの横に表示されます。
- **ナビゲーションタブ**：**{{ui:themes.header.showDeathTab}}** をオフにできます。死亡データ自体には影響しません。
- 各項目の文字サイズ、ウィンドウとヘッダーの余白。

![ヘッダーのカスタムレイアウト](../../../shared/img/dps/dps_6.png)

![ヘッダー設定](../../../shared/img/faq/faq_4.png)

## クリックスルー

**{{ui:themes.tabs.live}} → ライブウィンドウ表示設定 → {{ui:themes.liveDisplay.clickthrough}}** をオンにすると、マウス操作が DPS ウィンドウを通り抜けて背後のゲームに届きます。再びウィンドウを操作したいときは、[ショートカット](../app/README.md#ショートカット) またはトレイメニューの **Disable Clickthrough** でオフにします。

## 例

### 例：透明なミニマル DPS ウィンドウ

**シナリオ**：画面の隅に半透明の小さなウィンドウを置き、全員の DPS と割合だけを表示したい。ヘッダーやテーブルヘッダーは不要で、ゲーム操作の邪魔もしてほしくない場合です。

#### ステップ 1：サイズプリセットを適用する

**{{ui:routes.tools.dps}} → {{ui:routes.dps.themes}} → {{ui:themes.tabs.presets}}** で、サイズに **{{ui:themes.preset.size.compact.name}}** を選びます。余白とヘッダーが消え、テーブルだけが残ります。

#### ステップ 2：コンパクトモードをオンにする

**{{ui:themes.tabs.general}} → {{ui:themes.compact.title}}** で **{{ui:themes.compact.enable}}** をオンにし、括弧内の種類に **{{ui:themes.compact.option.tdps}}** を選びます。各行には名前、True DPS、割合だけが表示されます。

![コンパクトモード](../../../shared/img/dps/dps_5.png)

#### ステップ 3：背景を透明にする

**{{ui:themes.tabs.general}} → {{ui:themes.section.colorThemes}} → {{ui:themes.section.customColorTheme}}** で **背景（ライブ）** を見つけ、透明度を 30%～50% に調整します。

![背景の透明度を調整](../../../shared/img/faq/faq_2.png)

明るい場面で文字が見えにくい場合は、**{{ui:themes.table.rowGlowOpacity}}** を少し上げてカラーバーをはっきりさせましょう。

#### ステップ 4：クリックスルーをオンにする

**{{ui:themes.tabs.live}} → ライブウィンドウ表示設定 → {{ui:themes.liveDisplay.clickthrough}}** をオンにします。以降、マウス操作はウィンドウを通り抜けます。

> [!IMPORTANT]
> クリックスルーをオンにすると、マウスでウィンドウをドラッグしたりリセットしたりできなくなります。先に [アプリ設定 · ショートカット](../app/README.md#ショートカット) で「クリックスルーの切替」と「エンカウントをリセット」を割り当て、必要なときはショートカットで操作することをおすすめします。

#### 元に戻したいとき

**{{ui:themes.tabs.presets}}** で **{{ui:themes.preset.size.medium.name}}** と **{{ui:themes.preset.color.dark.name}}** を選び直すだけです。

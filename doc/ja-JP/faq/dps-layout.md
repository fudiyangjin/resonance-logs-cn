# よくある質問 · DPS とレイアウト

関連ドキュメント：[DPSメーター](../features/dps/README.md) · [履歴](../features/dps/history.md) · [テーマと外観](../features/dps/themes.md) · [表示設定](../features/dps/settings.md)

## データ

### 秒間ダメージと真秒間ダメージの違いは？

- **秒間ダメージ (DPS)**：総ダメージ ÷ 戦闘の総時間。
- **真秒間ダメージ (TDPS)**：総ダメージ ÷ アクティブ戦闘時間。長時間攻撃していない時間や移動中などの空白を除外します。

アクティブ時間を確認するには、**{{ui:routes.dps.themes}} → {{ui:themes.tabs.live}} → {{ui:themes.header.title}}** で **{{ui:themes.header.showActiveTimer}}** をオンにします。

### データはいつ自動でクリアされる？

[戦闘がいつ分割され、いつリセットされるか](../features/dps/README.md#戦闘の区切りとリセット) を参照してください。手動でクリアしたい場合は、タイトルバーのリセットボタンをクリックするか、[ショートカット](../features/app/README.md#ショートカット) を押します。

### 履歴は自動で整理される？

未お気に入りの記録は既定で 200 件保持され、アプリ設定で 1～2000 件に変更できます。次回起動時に古い記録から時間順に自動削除されます。大事な記録はお気に入りに追加してください。[履歴](../features/dps/history.md#履歴一覧) を参照してください。

## 外観

### DPS ウィンドウを透明にするには？

**{{ui:routes.tools.dps}} → {{ui:routes.dps.themes}} → {{ui:themes.tabs.general}}** で **{{ui:themes.section.customColorTheme}}** を展開し、**背景（ライブ）** の透明度を下げます。

![背景の透明度](../../shared/img/faq/faq_2.png)

詳しい手順は [例：透明でミニマルな DPS ウィンドウ](../features/dps/examples/transparent-window.md) を参照してください。

### タイトルバーがごちゃごちゃしている。すっきりさせるには？

**{{ui:themes.tabs.live}} → {{ui:themes.header.title}}** で不要な項目やボタンをオフにするか、フリーレイアウトに切り替えて複数行に分けます。[タイトルバー設定](../features/dps/themes.md#ヘッダー設定) を参照してください。

### テーブルに表示する列を変えたい？

- ライブウィンドウ：**{{ui:routes.dps.settings}} → {{ui:settings.tabs.live}}**。
- 履歴詳細：**{{ui:routes.dps.settings}} → {{ui:settings.tabs.history}}**。

両者の列設定は互いに影響しません。各列はオン/オフ、並べ替え、見出しのカスタマイズができます。[表示設定](../features/dps/settings.md) を参照してください。

### クリックスルーにしたらウィンドウをクリックできなくなった？

ショートカット **{{ui:settings.shortcuts.toggleClickthrough}}** を使うか、トレイアイコンを右クリックして **Disable Clickthrough** を選びます。

### メインウィンドウと DPS ウィンドウの配色が違う？

両者は別々に設定します。DPS ウィンドウは [テーマと外観](../features/dps/themes.md)、メインウィンドウは [アプリ設定 · 外観](../features/app/README.md#外観) で設定します。

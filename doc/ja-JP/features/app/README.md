# アプリ設定

**{{ui:routes.tools.appSettings}}** には、特定の機能に依存しないグローバルな設定がまとめられています。言語、メインウィンドウの外観、パケットキャプチャ、ショートカット、診断ツールです。これらの設定はこの PC に保存され、**ロードアウトと一緒にエクスポート・共有されることはありません**。

| タブ | 内容 |
| --- | --- |
| [{{ui:appSettings.tabs.general}}](#一般) | 画面言語、閉じるボタンの動作、パーティ共有 |
| [{{ui:appSettings.tabs.appearance}}](#外観) | メインウィンドウの配色、背景画像、フォント |
| [{{ui:appSettings.tabs.network}}](#ネットワーク) | キャプチャ方式とネットワークアダプター |
| [{{ui:appSettings.tabs.shortcuts}}](#ショートカット) | グローバルショートカット |
| [{{ui:appSettings.tabs.diagnostics}}](#診断) | ログと診断バンドル |

## 一般

- **{{ui:appSettings.language.title}}**：简体中文 / English / 日本語。ゲームクライアントと同じ言語にすることをおすすめします。Buff やスキルの名前もそれに合わせて切り替わり、プリセットの音声音色も画面言語に応じて選ばれます。
- **{{ui:appSettings.behavior.exitOnClose}}**：既定ではオフで、メインウィンドウの閉じるボタンをクリックしてもシステムトレイに隠れるだけで、オーバーレイや音声はそのまま動作します。オンにすると、閉じるボタンでアプリが終了します。
- **{{ui:appSettings.teamShare.title}}**：既定ではオフです。オンにすると、同じくオンにしている味方とスキルクールダウンを共有し、[味方 CD](../monster/teammate-cd.md) パネルに表示します。スイッチの下に現在の接続状態が表示されます。

## 外観

ここでの設定は**メインウィンドウ**にのみ影響します。DPS ウィンドウの配色やレイアウトは [テーマと外観](../dps/themes.md) で別途設定します。

- **{{ui:themes.presets.colorTitle}}**：プリセットの配色を選びます。**{{ui:themes.section.customColorTheme}}** で色と不透明度を個別に調整することもできます。
- **{{ui:themes.background.title}}**：PNG / JPG / WebP 画像を背景に使います。**{{ui:themes.background.opacity}}** と **{{ui:themes.background.imageMode}}**（**{{ui:themes.background.imageMode.cover}}** または **{{ui:themes.background.imageMode.contain}}**。コンテインの場合は **{{ui:themes.background.fillColor}}** も設定可能）を調整できます。
- **{{ui:themes.fonts.title}}**：.woff2 / .woff / .ttf / .otf フォントをインポートし、**{{ui:themes.fonts.sansTitle}}** と **{{ui:themes.fonts.monoTitle}}** をそれぞれ置き換えます。**{{ui:themes.fonts.applyToOverlay}}** をオンにすると、スキル・モンスター・ミニマップのオーバーレイでもカスタムのサンセリフフォントが使われます。

## ネットワーク

キャプチャ方式を選びます。**WinDivert**（追加のインストール不要。まずはこちらを試すのがおすすめ）または **Npcap**（[Npcap](https://npcap.com/) のインストールが必要で、**{{ui:settings.network.device}}** でゲームの通信が流れるネットワークアダプターを選択します）です。詳しくは [クイックスタート · パケット取得方法を設定](../../getting-started/README.md#3-パケット取得方法を設定) を参照してください。

> [!WARNING]
> キャプチャ方式やネットワークアダプターを変更したあとは、アプリを**完全に終了**（トレイアイコンを右クリック → **Quit**）してから再起動しないと反映されません。

## ショートカット

よく使う操作にグローバルショートカットを割り当てると、ゲーム中でも使えます。項目をクリックしてから、使いたいキーの組み合わせを押すだけです。**右クリック**で解除できます。

| 操作 | 用途 |
| --- | --- |
| **{{ui:settings.shortcuts.toggleLiveMeter}}** / **{{ui:settings.shortcuts.showLiveMeter}}** / **{{ui:settings.shortcuts.hideLiveMeter}}** | リアルタイム DPS ウィンドウの表示・非表示 |
| **{{ui:settings.shortcuts.toggleClickthrough}}** / **{{ui:settings.shortcuts.enableClickthrough}}** / **{{ui:settings.shortcuts.disableClickthrough}}** | DPS ウィンドウをマウスでクリックできるかどうかの切り替え |
| **{{ui:settings.shortcuts.resetEncounter}}** | 現在の戦闘データを消去し、集計をやり直す |
| **{{ui:settings.shortcuts.togglePauseEncounter}}** | 集計の一時停止 / 再開 |
| **{{ui:settings.shortcuts.toggleBossHp}}** | DPS ウィンドウでの Boss HP の表示・非表示 |
| **{{ui:settings.shortcuts.toggleOverlayWindow}}** | ライブモニターのオーバーレイのオン・オフ |
| **{{ui:settings.shortcuts.toggleOverlayEdit}}** | オーバーレイのレイアウト編集モードに入る / 抜ける |
| **{{ui:settings.shortcuts.toggleMinimizeAll}}** | DPS ウィンドウとすべてのオーバーレイをまとめて収納・再表示。画面の切り替えやスクリーンショットのときに便利 |

おすすめの割り当て方は [例：ショートカットで戦闘中にオーバーレイを調整する](./examples/combat-shortcuts.md) を参照してください。

> [!TIP]
> ゲームと競合するキーは避けてください。たとえば `Ctrl+\` はゲーム標準の UI 非表示キーなので、ここには割り当てないでください。

## 診断

- **{{ui:settings.debug.openLogs}}**：ログファイルのあるフォルダーを開きます。
- **{{ui:settings.debug.createDiagnosticsBundle}}**：ログと必要な設定を 1 つの Zip ファイルにまとめます。問題を報告するときに添付すると、原因の調査がずっと早くなります。

## 例

- [ショートカットで戦闘中にオーバーレイを調整する](./examples/combat-shortcuts.md)
## 関連ページ

- [ロードアウト](./loadouts.md)：監視設定一式の保存・切り替え・共有。
- [アップデート、トレイ、設定の復旧](./update.md)

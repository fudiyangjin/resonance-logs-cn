# ロードアウト

**ロードアウト** は、あるクラス用に用意した設定をすべて 1 つにまとめたものです。スキル CD、Buff、カスタムパネル、モンスター監視、DPS ウィンドウの設定、そしてそれらの音声設定が含まれます。クラスを変えるときはロードアウトを 1 回切り替えるだけで、すべてのオーバーレイがそれに合わせて切り替わります。

## ロードアウトの構成

| プロファイル | 含まれる内容 |
| --- | --- |
| **{{ui:loadout.page.skillProfileLabel}}** | [ライブモニター](../monitor/README.md) のスキル CD、Buff、カスタムパネル、属性パネルとその音声 |
| **{{ui:loadout.page.monsterProfileLabel}}** | [モンスターモニター](../monster/README.md) の Buff、Boss DBM、エンティティタイマーとその音声 |
| **{{ui:loadout.page.liveProfileLabel}}** | [DPS ウィンドウ](../dps/settings.md) の列、名前の表示、更新頻度など |

プロファイルは複数のロードアウトで共用できます。たとえば 2 つのアタッカークラスでスキル監視は別々にしつつ、モンスター監視は同じものを使いたい場合、両方のロードアウトで同じ **{{ui:loadout.page.monsterProfileLabel}}** を選べば、1 か所の変更が両方に反映されます。

[アプリ設定](./README.md) の外観、ショートカット、パケットキャプチャなどはロードアウトに含まれず、ロードアウトを切り替えても変わりません。

## ロードアウトの管理

**{{ui:routes.tools.loadouts}}** を開くか、左サイドバーの **{{ui:loadout.sidebar.label}}** の横にある **{{ui:loadout.sidebar.manage}}** をクリックします。

- **{{ui:loadout.page.new}}**：空のロードアウトを新しく作成します。
- **{{ui:loadout.page.activate}}**：このロードアウトに切り替えます。左サイドバーの **{{ui:loadout.sidebar.label}}** から直接切り替えることもできます。
- **{{ui:loadout.page.rename}}** / **{{ui:loadout.page.duplicate}}** / **{{ui:loadout.page.delete}}**：ロードアウトは最低 1 つ残す必要があります。
- 3 つのプロファイルのドロップダウンを変更して、このロードアウトで使うプロファイルを決めます。

## プリセット

**{{ui:loadout.page.presetsTitle}}** には、一部のスペック向けに設定済みのロードアウト（光盾型、光砕型、剛守型、剛身型、威咲型、森癒型、烈風型、響奏型など）が用意されています。クリックすると新しいロードアウトが作成され、それをもとに自由に変更でき、ほかのロードアウトには影響しません。初回起動時に表示される **{{ui:loadout.firstRun.title}}** も、ここにあるプリセットです。

## スペックで自動切替

1. 各ロードアウトに **{{ui:loadout.page.linkedSpecLabel}}** を設定します。たとえば「森癒型」のロードアウトを森癒型スペックに連携させます。
2. **{{ui:loadout.autoSwitch.toggle}}** をオンにします。

以降、ゲーム内でスペックを切り替えると、アプリが連携したロードアウトに自動で切り替えます。**{{ui:loadout.autoSwitch.detected}}** にはアプリが識別した現在のスペックが表示されます。**{{ui:loadout.autoSwitch.unknown}}** と表示される場合は、一度マップを切り替えてください。詳しい手順は [例：スペック切り替え時にロードアウトを自動で切り替える](./examples/spec-loadout.md) を参照してください。

## インポートとエクスポート

- **{{ui:loadout.page.exportButton}}**：各ロードアウトの右側にあるダウンロードアイコンで、ロードアウト全体（3 つのプロファイルと音声設定を含む）を 1 つの JSON ファイルとして保存します。
- **{{ui:loadout.page.importButton}}**：ほかの人が共有した JSON ファイルを選び、新しいロードアウトとしてインポートします。既存のロードアウトは上書きされません。

> [!NOTE]
> エクスポートされるのは設定だけで、生成済みの音声やインポートした効果音ファイルは含まれません。インポートした側は **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** で **{{ui:voice.bindings.generateMissing}}** をクリックすれば再生成できます。

共有の流れは [例：ロードアウトをパーティーメンバーと共有する](./examples/share-loadout.md) を参照してください。

## 例

- [スペック切り替え時にロードアウトを自動で切り替える](./examples/spec-loadout.md)
- [ロードアウトをパーティーメンバーと共有する](./examples/share-loadout.md)
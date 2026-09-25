# よくある質問 · ライブモニター

関連ドキュメント：[ライブモニター](../features/monitor/README.md) · [スキル CD](../features/monitor/skill-cd.md) · [Buff モニター](../features/monitor/buff.md) · [カスタムモニター](../features/monitor/custom-panel.md) · [ウィンドウの有効化とレイアウト](../features/monitor/overlay.md)

### スキル CD やステータスの表示が欠けるときは？

ゲームは変化したデータしか送ってこないため、途中でアプリを起動すると完全な状態を取得できません。**マップを 1 回切り替える**と直ります。

### ファクターエネルギーやシーズンノードを表示するには？

カウンターを手動で設定する必要はありません。**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.customPanel}}** で **{{ui:skillMonitor.customPanel.newFactor}}** をクリックすると、現在のシーズンに合わせてファクター設定エリアまたはシーズンノードエリアが自動作成され、装備しているファクターとノードが自動で表示されます。[ファクター設定エリア](../features/monitor/custom-panel.md#因子設定エリア) と [例：ファクターエネルギーとシーズンノードを自動表示する](../features/monitor/custom-panel.md#例因子エネルギーとシーズンノードを自動表示する) を参照してください。

### Buff の名前がわかりにくい。変更できる？

できます。Buff モニターの **{{ui:skillMonitor.buff.alias.title}}** で別名を設定してください。[名前とアイコン](../features/monitor/buff.md#名前とアイコン) を参照してください。

### 監視したい Buff の名前がわからない？

まず「すべての Buff をモニター」をオンにすると、オーバーレイに自分にかかっているすべての Buff が表示されます。名前を確認したら個別監視リストに追加し、「すべての Buff をモニター」をオフに戻してください。

### 料理や錬金の Buff をまとめて監視するには？

[カテゴリクイックモニター](../features/monitor/buff.md#カテゴリ一括監視) を使います。

### オーバーレイが表示されない？

1. ページ上部のライブモニターのスイッチがオンになっていることを確認します。
2. **{{ui:skillMonitor.tabs.overlay}}** で、該当エリアが表示になっていることを確認します。
3. オーバーレイが画面外にある可能性があります。トレイアイコンを右クリックして **Reset All Windows** を選んでください。

### 職業を変えたのに、オーバーレイの内容が前の職業のまま？

オーバーレイの内容は現在の [ロードアウト](../features/app/loadouts.md) に従います。ロードアウトを切り替えるか、**{{ui:loadout.autoSwitch.toggle}}** をオンにしてください。[例：スペック切り替え時にロードアウトを自動切替](../features/app/loadouts.md#例スペック切り替え時にロードアウトを自動で切り替える) を参照してください。

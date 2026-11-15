# パーティ表示の横に味方の軽減スキルを出す

関連ページ：[味方 CD](../teammate-cd.md)

**シナリオ**：5 人ダンジョンで指揮をしています。ゲーム左側のパーティ表示で、各メンバーの横に必殺技や軽減スキルがあと何秒で戻るかを表示し、次の大技を誰が受け持つか決めたいとします。

## ステップ 1：双方で共有をオンにする

味方の CD は味方自身のプラグインから共有されるので、自分も味方も本プラグインを使い、共有をオンにする必要があります。

1. **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.general}} → {{ui:appSettings.teamShare.title}}** を開き、**{{ui:appSettings.teamShare.enable}}** にチェックが入っているか確認します（既定でオン）。
2. ゲームでパーティを組み、状態が「接続済み」になれば準備完了です。

## ステップ 2：表示するスキルを選ぶ

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.teammateCd}}** を開きます。

1. クラスボタンで味方のクラスに切り替え、スキルアイコンをクリックして必殺技と軽減スキルを追加します。
2. パーティに来る可能性のあるクラスすべてで選んでおきます。スキルを選んでいないクラスの味方は表示されません。

## ステップ 3：パーティ表示に合わせる

1. **{{ui:monsterMonitor.tabs.overlay}}** で **味方 CD エリア** をオンにし、表示方式は **{{ui:monsterMonitor.teammateCd.mode.slots}}** のままにします。
2. **{{ui:monsterMonitor.actions.editLayout}}** をクリックし、**{{ui:monsterMonitor.teammateCd.slots.editKind}}** で **{{ui:monsterOverlay.teammateCd.slotKind.five}}** を選びます。
3. 番号付きのプレースホルダーアイコンをドラッグして、1 番目のマスをパーティ表示の 1 行目の横に合わせます。次に **{{ui:monsterMonitor.teammateCd.slots.rowPitch}}** を調整して、5 番目のマスを 5 行目に合わせます。
4. **{{ui:monsterMonitor.teammateCd.slots.side}}** で、アイコンをどちら側へ並べるか決めます。

## 結果

味方が軽減スキルを使うと、その行の横のアイコンが暗くなって残り秒数が表示され、使えるようになると明るく戻ります。メンバーの出入りがあっても、アイコンはパーティ表示と一緒に移動します。

> [!NOTE]
> プラグインを入れていない味方やボットの行は空のままで、推定はしません。20 人レイドでは **{{ui:monsterOverlay.teammateCd.slotKind.twenty}}** を別途合わせる必要があります。[チームパネルに合わせる](../teammate-cd.md#チームパネルに合わせる) を参照してください。

# バースト中にステータスを確認する

関連ページ：[キャラクターパネル](../panel-attr.md)

**シナリオ**：バースト時にはバフを重ねるので、{{ui:game.panelAttr.11710}}・{{ui:game.panelAttr.11930}}・{{ui:game.panelAttr.11780}}がどこまで上がったかを直接見て、バフがすべて乗ったか確認したいとします。ほかのステータスは不要です。

## ステップ 1：必要なステータスだけ有効にする

1. **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.panelAttr}}** を開きます。
2. 有効にするステータスで、{{ui:game.panelAttr.11710}}・{{ui:game.panelAttr.11930}}・{{ui:game.panelAttr.11780}}だけにチェックを入れます。

## ステップ 2：色と順序を調整する

1. **{{ui:skillMonitor.panelAttr.displayColor}}** で、いちばん気にする{{ui:game.panelAttr.11930}}を目立つ色にします。
2. **{{ui:skillMonitor.panelAttr.rowOrder}}** で{{ui:game.panelAttr.11930}}を一番上に移動します。
3. **{{ui:skillMonitor.panelAttr.textStyle}}** で文字を大きくし、行間を詰めます。

## ステップ 3：キャラクター属性エリアをオンにする

1. **{{ui:skillMonitor.tabs.overlay}}** で **キャラクター属性エリア** がオンになっているか確認します（既定でオン）。
2. ページ上部の **{{ui:skillMonitor.layout.editOverlayLayout}}** をクリックし、属性エリアをスキル CD の横へドラッグします。

## 結果

バーストを始めると属性エリアの数値がリアルタイムで上がり、乗っていないバフがひと目でわかります。

> [!NOTE]
> ステータスの一部が表示されない、または明らかに遅れている場合は、一度シーンを切り替えると完全に同期し直されます。

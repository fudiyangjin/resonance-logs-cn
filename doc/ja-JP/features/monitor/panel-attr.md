# キャラクターパネル

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.panelAttr}}** は、攻撃速度、クリティカル率、知力、ヘイスト、幸運などのリアルタイム属性をオーバーレイに表示し、戦闘中に Buff による属性の変化を確認しやすくします。

## 設定

- **有効化する属性**：表示する属性にチェックを入れます。上部に「x/合計 属性を有効化」と表示されます。
- **{{ui:skillMonitor.panelAttr.displayColor}}**：属性ごとに色を設定できます。
- **{{ui:skillMonitor.panelAttr.rowOrder}}**：上へ / 下へでオーバーレイでの並び順を調整します。
- **{{ui:skillMonitor.panelAttr.textStyle}}**：行間、フォントサイズ、名前と数値の間隔。

属性が一部しか表示されない、または数値が明らかに遅れている場合は、シーンを一度切り替えると完全な同期に戻ります。

オーバーレイにこのエリアを表示するかどうかは、[ウィンドウを有効化](./overlay.md) の **キャラクター属性エリア** で切り替えます。

# 味方 Buff

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.teammate}}** では、味方ごとに監視中の Buff をマトリクス形式で表示します。指揮役やサポート役がパーティのバフが残っているか確認するのに向いています。

## 設定

- Buff を検索して **{{ui:monsterMonitor.teammate.groupTitle}}** に追加します。カテゴリ単位でまとめて追加することもできます
- 監視中の列ごとに **{{ui:monsterMonitor.style.progressColor}}** と **{{ui:monsterMonitor.style.valueColor}}** を個別に上書きできます。**{{ui:monsterMonitor.teammate.columnColorReset}}** でパネルの色に戻します
- **{{ui:monsterMonitor.teammate.styleTitle}}**：**{{ui:monsterMonitor.style.rowHeight}}**、**{{ui:monsterMonitor.style.nameColumnWidth}}**、**{{ui:monsterMonitor.style.buffColumnWidth}}**、**{{ui:monsterMonitor.style.deadNameColor}}**、**{{ui:monsterMonitor.style.deadRowPlacement}}**。死亡した味方は行を残し、名前は死亡時の色になり、選んだ位置へ並びます

オーバーレイに表示するかどうかは、[ウィンドウを有効化](./overlay.md) の **味方 Buff エリア** で切り替えます。

# HP/シールドエリア

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.shieldDetail}}** は、現在の HP とシールド吸収量を横バーで表示します。タンクやシールド頼みのクラスが、あとどれだけ耐えられるかを判断するのに役立ちます。

## 表示項目

| オプション | 内容 |
| --- | --- |
| **{{ui:skillMonitor.shieldDetail.showHpBar}}** | 現在の HP |
| **{{ui:skillMonitor.shieldDetail.showTotalShieldBar}}** | すべてのシールドの合計 |
| **{{ui:skillMonitor.shieldDetail.showShieldEntries}}** | シールドの発生源ごとに 1 行ずつ表示 |

## バーのスタイル

**{{ui:skillMonitor.shieldDetail.hpColor}}**、**{{ui:skillMonitor.shieldDetail.shieldColor}}**、**{{ui:skillMonitor.shieldDetail.healShieldColor}}**（過剰回復から変換されたシールド）をそれぞれ設定でき、バーの幅も調整できます。

オーバーレイにこのエリアを表示するかどうかは、[ウィンドウを有効化](./overlay.md) の **HP/シールドエリア** で切り替えます。

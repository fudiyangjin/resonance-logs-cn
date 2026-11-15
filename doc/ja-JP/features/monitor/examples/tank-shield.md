# タンクはあとどれだけ耐えられるか

関連ページ：[HP/シールドエリア](../shield.md)

**シナリオ**：タンクとして、Boss の大技の前に HP とシールドで耐えきれるか確認したいとします。シールドは複数のソースから付くので、それぞれの残量も知りたいところです。

## ステップ 1：表示項目を選ぶ

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.shieldDetail}}** を開き、次をオンにします。

- **{{ui:skillMonitor.shieldDetail.showHpBar}}**：現在の HP
- **{{ui:skillMonitor.shieldDetail.showTotalShieldBar}}**：すべてのシールドの合計
- **{{ui:skillMonitor.shieldDetail.showShieldEntries}}**：シールドのソースごとに 1 行

## ステップ 2：色と幅を調整する

**{{ui:skillMonitor.shieldDetail.hpColor}}**、**{{ui:skillMonitor.shieldDetail.shieldColor}}**、**{{ui:skillMonitor.shieldDetail.healShieldColor}}** を見分けやすい 3 色にし、バーの幅をスキル CD エリアと同じくらいにします。

## ステップ 3：HP/シールドエリアをオンにする

1. **{{ui:skillMonitor.tabs.overlay}}** で **HP/シールドエリア** をオンにします（既定でオフ）。
2. ページ上部の **{{ui:skillMonitor.layout.editOverlayLayout}}** をクリックし、画面の中央下、キャラクターの近くへドラッグします。

## 結果

戦闘中、HP バーの下に合計シールドと各シールドの残量が並びます。大技の前にひと目見れば、先に軽減スキルを使うべきか判断できます。

> [!TIP]
> シールドファイターの「光明の盾」中に出る縦のシールドバーはリソース区分にあり、このエリアと一緒に使うと便利です。[リソース区分でクラスリソースを見る](./resource-bar.md) を参照してください。

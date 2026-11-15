# ブレイクと HP の節目に合わせてバーストする

関連ページ：[スタン値・HP・味方幻想](../status.md)

**シナリオ**：Boss のスタン値を削りきると被ダメージが増える時間があるので、スタン値の残りを見てバーストをブレイクに合わせたいとします。また、Boss は HP が一定の割合になるとフェーズが変わるので、HP に合わせてスキルを使いたいところです。

## ステップ 1：スタンバーと HP バーをオンにする

1. **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.overlay}}** で **スタンバーゲージエリア** と **HP バーエリア** をオンにします（どちらも既定でオフ）。
2. **{{ui:monsterMonitor.actions.editLayout}}** をクリックし、2 本を画面の中央上部に重ね、スタンを上、HP を下に置きます。

## ステップ 2：スタイルを調整する

- **{{ui:monsterMonitor.tabs.stun}}** の **{{ui:monsterMonitor.stun.styleTitle}}** で、スタンバーを HP バーと見分けやすい色にし、幅を HP バーと揃えます。
- **{{ui:monsterMonitor.tabs.hp}}** の **{{ui:monsterMonitor.hp.styleTitle}}** で文字を大きくし、割合を読みやすくします。

## ステップ 3（任意）：味方の幻想を見る

**{{ui:monsterMonitor.tabs.fantasy}}** を開き、**{{ui:monsterMonitor.fantasy.showAll}}** をオンにするか、気になる幻想だけを検索します。そのうえで、ウィンドウの有効化で **味方幻想エリア** をオンにします。

## 結果

スタンバーが 0 に近づいたらバーストの準備をし、ブレイクした瞬間に全力で攻撃します。HP がフェーズ切り替えの割合に近づいたら、予定どおりスキルを使います。どちらのバーも現在のターゲットに追従します。

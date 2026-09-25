# モンスターモニター

**{{ui:routes.tools.monsterMonitor}}** は独立した**モンスターオーバーレイ**で、**現在の攻撃ターゲット**の情報を表示します：ターゲットに付いている Buff / Debuff、味方が付与した効果、ヘイト、スタン値、HP、さらに Boss スキルの予兆とフィールド上のエンティティの持続時間です。

## できること

- 自分が Boss に付与した脆弱・与ダメージアップがまだ残っているかを確認し、切れそうなときはハイライトで知らせる
- 味方の Debuff がすべて付与されているかを確認する
- タンクはヘイト順位を、アタッカーは Boss のブレイクまで残りのスタン値を確認する
- Boss の詠唱時に DBM 警告バーを表示し、音声で知らせる
- 召喚物や設置物（鎌車など）の残り時間を表示する

## 現在のターゲットに追従

オーバーレイの内容はキャラクターの**攻撃ターゲット**に合わせて自動で切り替わるため、事前にモンスターを指定する必要はありません：

- 別のモンスターを攻撃または選択すると、オーバーレイもそのモンスターに切り替わります
- ターゲットが死亡または見失われると、関連する内容はクリアされ、新しいターゲットができるまで待機します
- 木人や雑魚も、現在の攻撃ターゲットであれば同様に表示されます

## 上部のスイッチとサブプロファイル

| スイッチ | 役割 |
| --- | --- |
| **{{ui:monsterMonitor.enabled}}** | マスタースイッチ |
| **{{ui:monsterMonitor.autoHideInDailyScenes.label}}** | 日常シーンでオーバーレイを自動的に非表示にする |
| **{{ui:monsterMonitor.actions.toggleOverlay}}** | モンスターオーバーレイの表示 / 非表示 |
| **{{ui:monsterMonitor.actions.editLayout}}** | 各エリアをドラッグ・リサイズ。リアルタイムデータがない場合はプレースホルダーでプレビュー |

モンスターモニターには独自の**設定サブプロファイル**（新規作成、名前変更、削除）があり、ロードアウトがそのうち 1 つを参照します。[ロードアウト](../app/loadouts.md) を参照してください。

## ページ構成

| タブ | ドキュメント | 例 |
| --- | --- | --- |
| **{{ui:monsterMonitor.tabs.buff}}** | [ターゲット Buff](./buff.md) | [自分が付与した脆弱を監視する](./buff.md#例自分が付与した脆弱を監視し切れる前に知らせる) |
| **{{ui:monsterMonitor.tabs.teammate}}** | [味方 Buff](./teammate.md) | — |
| **{{ui:monsterMonitor.tabs.hate}}** | [ヘイトリスト](./hate.md) | — |
| **{{ui:monsterMonitor.tabs.stun}}** / **{{ui:monsterMonitor.tabs.hp}}** / **{{ui:monsterMonitor.tabs.fantasy}}** | [スタン値・HP・味方幻想](./status.md) | — |
| **{{ui:monsterMonitor.tabs.bossDbm}}** | [Boss DBM](./boss-dbm.md) | [Boss スキルに別名を付けて音声で予告する](./boss-dbm.md#例boss-スキルに別名を付けて音声で予告する) |
| **{{ui:monsterMonitor.tabs.entityDuration}}** | [エンティティ持続](./entity-duration.md) | [鎌車の残り時間を表示する](./entity-duration.md#例鎌車の残り時間を表示する) |
| **{{ui:monsterMonitor.tabs.overlay}}** | [ウィンドウを有効化](./overlay.md) | — |

## ライブモニターとの違い

| | ライブモニター | モンスターモニター |
| --- | --- | --- |
| 対象 | 自分 | 現在のターゲット |
| 主な内容 | スキル CD、自身の Buff、因子、属性 | ターゲットの Debuff、ヘイト、スタン値、Boss スキル |
| オーバーレイ | ライブモニターオーバーレイ | モンスターオーバーレイ |

両者の設定は互いに影響せず、同時にオンにできます。

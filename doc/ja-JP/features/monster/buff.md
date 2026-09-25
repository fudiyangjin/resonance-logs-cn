# ターゲット Buff

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.buff}}** では、ターゲットに付いているどの Buff をモンスター Buff エリアに表示するかを設定します。

## 2 種類の監視方式

検索する前に追加方式を選びます：

| 方式 | 表示条件 | 向いている用途 |
| --- | --- | --- |
| **{{ui:monsterMonitor.buffSearch.self}}** | **自分**がターゲットに付与したものだけを表示 | 自分が維持を担当する脆弱や DoT |
| **{{ui:monsterMonitor.buffSearch.global}}** | 誰が付与したかに関係なく、ターゲットに付いていれば表示 | Boss 自身のギミック Buff、パーティ共通の Debuff |

同じ Buff はどちらか一方にしか所属できません。もう一方の方式で追加すると自動的に移動します。

**{{ui:monsterMonitor.buffGroups.self.monitorAll}}**：オンにすると、自分が付与したすべての Buff をオーバーレイに一覧表示します。まず名前を把握してから絞り込むのに便利です。

## 優先度・アラート・表示名

| 設定 | 役割 |
| --- | --- |
| **{{ui:monsterMonitor.priority.title}}** | 表示スペースが足りないとき、上位の Buff を優先して表示 |
| **{{ui:monsterMonitor.alert.title}}** | 残り時間が設定秒数以下になるとハイライト。点滅も選択可能 |
| **{{ui:monsterMonitor.alias.title}}** | 監視中の Buff にオーバーレイ上の別名を設定 |
| **{{ui:monsterMonitor.style.panelTitle}}** | 行 / 列の間隔、フォントサイズ、名前 / 数値 / プログレスバーの色と不透明度 |

Buff を監視から削除すると、その優先度・アラート・音声の設定もまとめて削除されます。

## 音声読み上げ

**{{ui:monsterMonitor.buffVoice.title}}** では、監視中の Buff に **獲得時 / 残り x 秒 / 終了時** の読み上げを設定できます。各項目には対象範囲が表示されます：

- **{{ui:monsterMonitor.buffVoice.scope.localPlayerSource}}**：自分が付与した分だけで判定します。味方が付与した同名 Buff では、読み上げが発生したり延長されたりしません
- **{{ui:monsterMonitor.buffVoice.scope.anySource}}**：Buff 全体が存在するかで判定します。複数人が付与している場合、最初の 1 件が現れた時点を獲得、最後の 1 件が消えた時点を終了とみなします

## よく使う Debuff 一覧

| 幻想 | 検索名 | Buff ID | 効果 |
| --- | --- | --- | --- |
| 劇毒蜂巣 | ヴェノム脆弱（劇毒蜂巣） | 2110099 | モンスターの被ダメージアップ |
| ロリーラ | 呪術（ロリーラ） | 2110111 | モンスターへの与ダメージアップ |
| ロリーラ | 呪術スタック（ロリーラ） | 2110135 | スタック式の与ダメージアップ |

プレイヤー側のバフや幻想 CD は [ライブモニター · Buff モニター](../monitor/buff.md#よく使う-buff-リファレンス) を参照してください。

## 例

### 例：自分が付与した脆弱を監視し、切れる前に知らせる

**シナリオ**：あなたは劇毒蜂巣を持っていき、Boss に「ヴェノム脆弱（劇毒蜂巣）」を付与する担当です。オーバーレイで脆弱の残り時間を確認し、終わりそうなときはハイライトで、切れたときは音声で付け直しを知らせてほしいとします。

#### ステップ 1：「自己付与」に追加する

1. **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.buff}}** を開きます。
2. **{{ui:monsterMonitor.buffSearch.self}}** を選び、**ヴェノム脆弱（劇毒蜂巣）**（ID 2110099）を検索して追加します。

「自己付与」を選ぶのは、自分が付与した分だけを気にしているからです。パーティに劇毒蜂巣を持つ人が 2 人いる場合、「グローバル」ではどちらのものか区別できません。

#### ステップ 2：アラートを設定する

**{{ui:monsterMonitor.alert.title}}** で「ヴェノム脆弱（劇毒蜂巣）」にアラートを追加します：残り 3 秒以下で赤くハイライトし、点滅をオンにします。

#### ステップ 3：終了時に音声で知らせる

**{{ui:monsterMonitor.buffVoice.title}}** に「ヴェノム脆弱（劇毒蜂巣）」を追加し、**終了時** にチェックを入れ、文言を「脆弱付け直し」にします。[音声読み上げ](../voice/README.md) がオンになっていて、音声が生成済みであることを確認してください。

#### ステップ 4：オーバーレイを開いて配置する

1. **{{ui:monsterMonitor.enabled}}** がオンになっていることを確認し、**{{ui:monsterMonitor.actions.toggleOverlay}}** をクリックします。
2. **{{ui:monsterMonitor.actions.editLayout}}** で、モンスター Buff エリアを Boss の HP バーの近くにドラッグします。

#### 確認

訓練場で木人に劇毒蜂巣を一度付与します。木人が**現在の攻撃ターゲット**になっていないと、オーバーレイにその Buff は表示されません。

> [!TIP]
> 自分が付与する Debuff の名前がわからない場合は、まず **{{ui:monsterMonitor.buffGroups.self.monitorAll}}** をオンにし、木人を攻撃してオーバーレイに何が表示されるかを確認してから、正確に追加しましょう。

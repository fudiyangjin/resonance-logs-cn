# Buff モニター

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.buff}}** は、**あなた自身にかかっている** Buff を監視します。持続時間・スタック数の表示、終了間際のアラート、獲得・終了時の音声通知に対応しています。

> [!TIP]
> 見たいのがボスにかかっている Debuff（自分が付与した被ダメージ増加など）なら、[モンスターモニター · Buff モニター](../monster/buff.md) を使います。

## Buff を追加する

検索ボックスに **名前または ID** を入力し、結果をクリックすると **{{ui:skillMonitor.buff.selectedTitle}}** に追加されます。結果が多い場合はページ分けして表示されます。内蔵テーブルにない ID でも、ID を指定して直接追加できます。

Buff の名前がわからないときは、まず **{{ui:skillMonitor.buff.all.title}}** をオンにすると、現在得ているすべての Buff がオーバーレイに表示されます。目的の Buff を見つけたら個別に追加し、最後に「すべて監視」をオフにしてください。

### カテゴリ一括監視

**{{ui:skillMonitor.buff.category.title}}** では、**食事** または **錬金** の Buff をまとめて監視できます。ダンジョンに入る前に料理や薬を使ったか確認するのに便利です。

## 表示モード

**{{ui:skillMonitor.buff.display.title}}** でどちらかを選びます：

| モード | 特徴 |
| --- | --- |
| **{{ui:skillMonitor.buff.display.individual}}** | Buff ごとに個別のアイコンを表示し、それぞれ位置やサイズを調整できる |
| **{{ui:skillMonitor.buff.display.grouped}}** | 複数の Buff を 1 つのグループにまとめ、行と列で揃えて並べる |

![個別モード](../../../shared/img/monitor/buff_2.png)

![グループモード](../../../shared/img/monitor/buff_1.png)

### グループモード

**{{ui:skillMonitor.buff.group.title}}** では：

- **{{ui:skillMonitor.buff.group.new}}** / **{{ui:skillMonitor.buff.group.delete}}**。グループごとに Buff を選ぶか、**{{ui:skillMonitor.buff.group.monitorAll}}** に設定できます；
- グループに食事・錬金カテゴリをワンクリックで追加・削除できます；
- グループごとにアイコンサイズ、行数・列数、間隔、および名前・残り時間・スタック数を表示するかどうかを設定できます；
- **{{ui:skillMonitor.buff.group.previewTitle}}** で見た目を事前に確認できます。

### アイコンなし Buff

アイコンのない Buff は 1 行のテキスト + プログレスバーで表示されます。**{{ui:skillMonitor.buff.display.modernText}}** か **{{ui:skillMonitor.buff.display.classicText}}** を選べ、最大表示件数も制限できます。

### スタック数で変化する Buff

一部の Buff はスタック数に応じてアイコンが自動で変わります。たとえばゲイルランサーの「追撃身法」は 1 スタックで単一アイコン、2 スタックで二重アイコンになります。追加の設定は不要です。

## 名前とアイコン

| 設定 | 役割 | 適用範囲 |
| --- | --- | --- |
| **{{ui:skillMonitor.buff.alias.title}}** | 名前がわかりにくい Buff に別名を付ける。例：「[热枕]」を「生命波動」と表示 | グローバル。プロファイル切り替えの影響を受けない |
| **{{ui:skillMonitor.buff.icon.title}}** | Buff のアイコンとして任意の画像を選ぶ | グローバル |

Buff の別名は、[因子エリア](./custom-panel.md#因子設定エリア) での Buff 効果の表示名にも使われます。

幻想由来の Buff は、幻想の階数を判別できる場合「名前 | n階」と表示されます。

## 優先度

- **{{ui:skillMonitor.buff.priority.globalTitle}}**：個別モードでの表示順；
- **{{ui:skillMonitor.buff.priority.groupTitle}}**：グループモードでの各グループ内の順序。

## カウントダウンアラート

**{{ui:skillMonitor.buff.alert.title}}** では Buff ごとにしきい値を設定します。残り時間が設定秒数以下になると指定した色でハイライトされ、**点滅**させることもできます。切れかけている強化 Buff を見張るのに向いています。

## 音声読み上げ

**{{ui:skillMonitor.buff.voice.title}}** セクションで監視中の Buff を検索してルールを追加します。**獲得時 / 残り x 秒 / 終了時** の 3 種類のイベントを選べ、読み上げ文は自動生成・自由入力・フレーズライブラリからの引用のいずれかにできます。詳しくは [音声読み上げ](../voice/README.md#機能ページで読み上げを設定する) を参照してください。

![Buff 音声読み上げの設定](../../../shared/img/voice/voice_1.png)

## よく使う Buff リファレンス

下表の検索名は、そのまま検索ボックスに入力できます：

| 種類 | 幻想 | 検索名 | Buff ID |
| --- | --- | --- | --- |
| 強化 | 山賊頭目 | 灼熱の戦意（山賊頭目） | 2110065 |
| 強化 | ターター | フレイムハート（ターター） | 2110061 |
| 強化 | ティナ | リキャスト短縮 | 2110034 |
| 強化 | バジリスク | 高原血統（バジリスク） | 2110125 |
| 強化 | カットグリフ | 機械の力（カットグリフ） | 2110140 |
| 幻想 CD | カットグリフ | 機械の故障（カットグリフCD） | 2110049 |
| 幻想 CD | ティナ | 時間凝固（ティナCD） | 2110056 |
| 幻想 CD | ターター | 疲労・烈火の焼身（ターターCD） | 2110055 |
| 幻想 CD | 復活系 | 虚弱・祈り禁止（復活CD） | 2110057 |
| 幻想 CD | バジリスク | 属性停滞（バジリスクCD） | 2110050 |

モンスターにかかる被ダメージ増加・与ダメージ増加（ヴェノム脆弱（劇毒蜂巣）、呪術（ロリーラ）など）は [モンスターモニター · Buff モニター](../monster/buff.md#よく使う-debuff-一覧) を参照してください。

## 例

### 例：ティナの CD が戻ったら音声で知らせる

**シナリオ**：パーティでティナを使う担当なので、オーバーレイにティナのクールダウンを表示し、CD が終わったら「ティナ CD 準備完了」と読み上げてほしい。ずっと画面を見張らなくて済むようにしたい。

#### ステップ 1：ティナ CD の Buff を監視する

ティナを使うと、クールダウンを表す Buff が自分に残ります。

1. **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.buff}}** を開きます。
2. **時間凝固（ティナCD）**（ID 2110056）を検索し、選択した Buff に追加します。
3. あわせて **リキャスト短縮**（ID 2110034）も追加すると、ティナによる強化がまだ続いているか確認できます。

#### ステップ 2：わかりやすい名前を付ける（任意）

**{{ui:skillMonitor.buff.alias.title}}** で「時間凝固（ティナCD）」を検索し、別名を「ティナ」に設定します。

#### ステップ 3：終了間際にハイライトする

**{{ui:skillMonitor.buff.alert.title}}** でアラートを追加します。残り 5 秒以下で緑色にハイライトして点滅させ、使う準備を促します。

#### ステップ 4：終了時に音声で知らせる

1. まず [音声読み上げ](../voice/README.md) でモデルがインストール済みで、**{{ui:voice.overview.enabled}}** がオンになっていることを確認します。
2. **{{ui:skillMonitor.tabs.buff}}** に戻って **{{ui:skillMonitor.buff.voice.title}}** を展開し、「時間凝固（ティナCD）」を検索して追加します。
3. **終了時に読み上げ** にチェックを入れ、読み上げ文は **カスタムテキスト** を選んで「ティナ CD 準備完了」と入力します。
4. **試聴** をクリックします。生成待ちと表示された場合は、**{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** で **{{ui:voice.bindings.generateMissing}}** をクリックします。

![Buff 音声読み上げの設定](../../../shared/img/voice/voice_1.png)

日本語の微調整音色で生成した例：

<audio controls src="../../../shared/audio/voice/ja_01_tina_cd.wav"></audio>

> [!TIP]
> 読み上げにティナの階数を入れたい場合は、読み上げ文を「ティナ${阶数}準備完了」と書くと、読み上げ時に「ティナ5阶準備完了」のように自動で置き換わります。[音声読み上げ · 幻想階数プレースホルダー](../voice/playback.md#幻想階級プレースホルダー) を参照してください。

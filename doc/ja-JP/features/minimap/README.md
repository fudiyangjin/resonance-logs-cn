# ダンジョンギミック

対応済みのダンジョンでは、**{{ui:routes.tools.minimap}}** がゲーム画面の上に俯瞰ミニマップとギミック通知を表示します。誰が指名されたか、どこに立つべきか、次のギミックまであと何秒かがひと目でわかります。

![呪いの煌墓のギミックミニマップ](../../../shared/img/minimap/s3_minimap_1.png)

## できること

- **立ち位置を確認**：ミニマップに自分、味方、Boss、ギミック関連のポイントや領域（安全地帯、危険な扇形範囲、線つなぎ）を描画します。
- **指名を確認**：ギミックで指名された味方は対応する色に染まり、ギミック通知にも指名対象とカウントダウンが同時に表示されます。
- **音声で通知**：ギミックの予兆に音声を割り当てれば、画面を見ていなくても自分の番だとわかります。

対応ダンジョンに入ると、アプリはシーンに応じて対応するギミック解析を自動で読み込みます。それ以外のシーンでは、オーバーレイにギミック内容は表示されません。対応ダンジョンとそれぞれで表示されるギミックは [対応ダンジョン](./dungeons.md) を参照してください。

## オーバーレイを有効にする

1. **{{ui:routes.tools.minimap}} → {{ui:minimap.tabs.minimap}}** を開きます。
2. **{{ui:minimap.settings.enabled.label}}** をオンにするか、ページ上部の **{{ui:minimap.actions.toggleOverlay}}** をクリックします。どちらも同じスイッチです。
3. **{{ui:minimap.actions.editLayout}}** をクリックして 2 つのパネルをドラッグ・リサイズし、終わったら **{{ui:minimap.edit.done}}** をクリックします。

オーバーレイは 2 つのパネルで構成され、**{{ui:minimap.overlay.title}}** でそれぞれオン / オフできます：

| パネル | 内容 |
| --- | --- |
| **{{ui:minimap.panels.map}}** | 俯瞰ミニマップ：プレイヤー、Boss、マーカー、ギミック領域 |
| **{{ui:minimap.panels.info}}** | テキスト一覧：進行中のギミック名、指名対象、残り時間 |

## 表示オプション

| オプション | 効果 |
| --- | --- |
| **{{ui:minimap.settings.autoHideInDailyScenes.label}}** | 街などの日常シーンに戻ると自動的に非表示になり、離れると元に戻る |
| **{{ui:minimap.settings.hideNormalTeammates.label}}** | 普段は自分だけを表示し、味方はギミックで指名されたり染められたりすると自動で表示される。最もすっきりした表示 |
| **{{ui:minimap.settings.hideAllTeammates.label}}** | 味方は指名されても一切表示せず、自分だけを残す。前の項目より優先される |
| **{{ui:minimap.settings.showBoss.label}}** | マップ上に Boss の位置を表示。既定ではオフ |
| **{{ui:minimap.settings.showMarkers.label}}** | パーティマーカー 1～6 番（色付き数字）を表示。既定ではオフ |

> [!TIP]
> 初めてのダンジョンでは、まず味方をすべて表示しておき、ギミックに慣れてから **{{ui:minimap.settings.hideNormalTeammates.label}}** をオンにして、自分に関係するポイントだけを見るのがおすすめです。

## 自分を見つけやすくする

ギミックで指名されると自分の点の色が変わり、味方に紛れて見失いがちです。次の設定を組み合わせられます：

- **{{ui:minimap.settings.localRing.title}}**：**{{ui:minimap.settings.localRing.enabled.label}}** をオンにすると、自分の点の外側に縁取りの輪を表示します。色と線幅は調整できます。
- **{{ui:minimap.settings.localFacing.label}}**：自分のマーカーに現在の向きを示す小さな矢印を描き、向きを判断しやすくします。
- **{{ui:minimap.settings.sizes.title}}**：**{{ui:minimap.settings.sizes.local}}** を味方より少し大きくします。

## 色と死亡時の表示

- **{{ui:minimap.settings.colors.title}}**：ギミックによる色付けがないときの **{{ui:minimap.settings.colors.local}}**、**{{ui:minimap.settings.colors.teammate}}**、**{{ui:minimap.settings.colors.boss}}**、および **{{ui:minimap.settings.colors.marker1}}**～6 の色を設定します。ギミックの指名には常に専用の識別しやすい色が使われ、ここの設定の影響を受けません。
- **{{ui:minimap.settings.deadStyle.title}}**：味方や自分が倒れたあとの表示方法です。× マークに切り替えたり、色と不透明度を設定したりできます。死亡時の表示はギミックの指名色より優先されます。

## ギミック音声読み上げ

**{{ui:minimap.settings.voiceCues.title}}** には、現在のダンジョンで読み上げ可能なギミックが一覧表示されます。展開したあとの設定方法は Buff や Boss ギミックの読み上げと同じで、イベントを選び、文言を入力し、音声を生成します。現在のマップにまだ読み上げ可能なギミックが組み込まれていない場合、ここは空になります。音声関連の共通設定は [音声読み上げ](../voice/README.md) を参照してください。

## Boss DBM との違い

| | ダンジョンギミック | [モンスターモニター · Boss DBM](../monster/boss-dbm.md) |
| --- | --- | --- |
| 答えてくれること | どこに立つか、誰が指名されたか | Boss がいつ何のスキルを使うか |
| 表示内容 | ミニマップ + ギミック通知 | スキル名 + カウントダウン |
| 対象範囲 | 対応済みのダンジョンのみ | Boss スキルイベントのある任意の戦闘 |

両方同時にオンにでき、画面の別々の位置に置いて補い合うように使えます。

## 例

### 例：レイド初攻略前のミニマップ設定

**シナリオ**：初めて「忘却幻夢の野」に挑みます。ギミックが多く、指名も頻繁です。ミニマップには自分に関係する情報だけを表示し、指名されたらすぐに自分を見つけられて、音声でも通知してほしいとします。

#### ステップ 1：オーバーレイを有効にして配置する

1. **{{ui:routes.tools.minimap}} → {{ui:minimap.tabs.minimap}}** で **{{ui:minimap.settings.enabled.label}}** をオンにします。
2. **{{ui:minimap.actions.editLayout}}**：**{{ui:minimap.panels.map}}** をキャラクターに被らない画面の端に、**{{ui:minimap.panels.info}}** をその下に置きます。終わったら **{{ui:minimap.edit.done}}** をクリックします。

#### ステップ 2：余計な表示を減らす

- **{{ui:minimap.settings.hideNormalTeammates.label}}** をオン：指名されていない味方は表示しません。
- **{{ui:minimap.settings.autoHideInDailyScenes.label}}** をオン：街に戻ると自動で非表示になります。
- パーティでマーカーを使って指示する場合は、**{{ui:minimap.settings.showMarkers.label}}** をオンにします。

#### ステップ 3：自分を目立たせる

1. **{{ui:minimap.settings.localRing.enabled.label}}** をオンにし、**{{ui:minimap.settings.localRing.color}}** はギミックの色とはっきり区別できる色（白など）を選び、線幅を少し太くします。
2. **{{ui:minimap.settings.localFacing.label}}** をオンにします。
3. **{{ui:minimap.settings.sizes.title}}** で **{{ui:minimap.settings.sizes.local}}** を大きくします。

#### ステップ 4：指名時に音声で通知する

1. ダンジョンに入り（または **{{ui:minimap.settings.voiceCues.title}}** を直接展開し）、**{{ui:minimap.s3Raid.shareGroup}}**、**{{ui:minimap.s3Raid.killMark.group}}** など通知したいギミックを探します。
2. 各ギミックに短い文言を入力します。たとえば「頭割り」「隅へ」など。
3. **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** で **{{ui:voice.bindings.generateMissing}}** をクリックします。

> [!TIP]
> 文言が短いほど読み上げは早く終わります。同時に複数のギミックが来ることもあるので、最も致命的なギミックは優先度を高くしておくのがおすすめです。[優先度とキュー](../voice/playback.md#優先度とキュー) を参照してください。

#### ステップ 5：Boss DBM と組み合わせる

[モンスターモニター](../monster/README.md) で Boss DBM エリアをオンにし、画面中央上部に置きます。ミニマップがどこに立つかを、Boss DBM が残り何秒かを教えてくれます。[例：Boss スキルに別名を付けて音声で予告する](../monster/boss-dbm.md#例boss-スキルに別名を付けて音声で予告する) も参考にしてください。

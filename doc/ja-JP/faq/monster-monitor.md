# よくある質問 · モンスターモニター

関連ドキュメント：[モンスターモニター](../features/monster/README.md) · [対象バフ](../features/monster/buff.md) · [Boss DBM](../features/monster/boss-dbm.md) · [エンティティ持続](../features/monster/entity-duration.md) · [ウィンドウを有効化](../features/monster/overlay.md)

### モンスターモニターとライブモニターの違いは？

- **ライブモニター**：**自分自身**のスキル CD、Buff、ステータスを表示します。
- **モンスターモニター**：**現在の攻撃対象**にかかっている Buff、ヘイト、スタン、Boss スキルの予告などを表示します。

両者の設定は互いに影響せず、別々のオーバーレイを使います。

### オーバーレイに表示されるのはどのモンスター？

自分の**現在の攻撃対象**です。ターゲットを切り替えると自動で追従し、モンスター ID を指定する必要はありません。旧バージョンの `ExtraBuffMonitoredMonsters.json` は廃止されており、編集しても反映されません。

### 木人や雑魚に Buff が表示されない？

1. 木人が現在の攻撃対象になっていない：まず木人にダメージを与えてください。
2. モンスターモニターまたはオーバーレイが開いていない：**{{ui:monsterMonitor.enabled}}** がオンになっていて、**{{ui:monsterMonitor.actions.toggleOverlay}}** をクリック済みであることを確認してください。
3. 見たい Buff を追加していない：**{{ui:monsterMonitor.tabs.buff}}** で追加するか、先に「すべてモニター」をオンにして名前を調べてください。
4. ターゲットがすでに倒れている：データの更新が止まるので、別のターゲットに切り替えてください。

### Boss DBM の予告が表示されない？

1. **Boss DBM エリア** は既定でオフです。**{{ui:monsterMonitor.tabs.overlay}}** でオンにしてください。
2. モンスターモニターとオーバーレイの両方がオンになっていることを確認してください。
3. すべての Boss スキルに予告イベントがあるわけではありません。イベントがないときはエリアが表示されません（レイアウト編集モードではプレースホルダーが見えます）。

### Boss DBM と Buff モニターの違いは？

Boss DBM は Boss の詠唱やフェーズスキルを自動で表示し、監視項目を追加する必要はありません。Buff モニターは先にリストへ追加する必要があり、特定の Buff の残り時間やスタック数を見張るために使います。[Boss DBM](../features/monster/boss-dbm.md) を参照してください。

### 召喚物の残り時間を見るには？

[エンティティ持続](../features/monster/entity-duration.md) を使います。よくある召喚物にはプリセットがあります（例：[鎌車](../features/monster/examples/scythe-cart.md)）。

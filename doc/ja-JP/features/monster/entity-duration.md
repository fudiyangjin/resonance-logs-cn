# エンティティ持続

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.entityDuration}}** は、召喚物や設置物などの**フィールド上のエンティティ**を計時します。エンティティが出現するとカウントダウンを開始し、消滅すると削除して、モンスターオーバーレイの **エンティティ持続エリア** に表示します。

主な用途：鎌車などの持続型召喚、張り直しが必要な設置エリア。

> [!NOTE]
> この機能はライブモニターの旧「持続時間スキル」を置き換えるものです。旧プロファイルで選択していた鎌車は、「自分のみ」の項目として自動移行されます。

## 仕組み

この種のスキルはフィールド上に独立したエンティティを生成し、そのエンティティは**エンティティ ID**（モンスターテンプレート ID）と**発動者**を持っています。アプリはエンティティの出現と消滅を監視します：

- スキルの再使用で古いエンティティが消えて新しいエンティティが生成されると、古い行は削除され、新しい行で計時し直します
- マップを移動するとエンティティは消滅し、項目も一緒に削除されます
- **{{ui:monsterMonitor.entityDuration.merge}}** にチェックを入れると、同じ発動者の同じ ID のエンティティが 1 行にまとまります。残り時間が最も短いものをカウントダウンし、それが終わると次のものに切り替わり、すべて終了または消滅するとその行が削除されます

## プリセット

**{{ui:monsterMonitor.entityDuration.presetsTitle}}** には現在以下の項目が組み込まれており、クリックするだけで追加できます：

| プリセット | ID | 持続時間 | {{ui:monsterMonitor.entityDuration.scope}} | {{ui:monsterMonitor.entityDuration.merge}} |
| --- | --- | --- | --- | --- |
| **鎌車** | 179903 | 35 秒 | {{ui:monsterMonitor.entityDuration.scope.self}} | はい |
| **ファファラ職責**（領域） | 55 | 10 秒 | {{ui:monsterMonitor.entityDuration.scope.any}} | いいえ |
| **ファファラ幻想**（領域） | 53 | 15 秒 | {{ui:monsterMonitor.entityDuration.scope.any}} | いいえ |

## 手動追加

| 項目 | 説明 |
| --- | --- |
| **{{ui:monsterMonitor.entityDuration.monsterId}}** | 正の整数のエンティティ ID |
| **{{ui:monsterMonitor.entityDuration.label}}** | パネルに表示する名前。空欄の場合はゲーム内の名前を使用 |
| **{{ui:monsterMonitor.entityDuration.durationSeconds}}** | カウントダウンの長さ。空欄の場合は `∞` を表示し、エンティティが消えるまで続く |
| **{{ui:monsterMonitor.entityDuration.scope}}** | **{{ui:monsterMonitor.entityDuration.scope.self}}**：自分が出したものだけを表示。**{{ui:monsterMonitor.entityDuration.scope.any}}**：全員分を表示し、名前は「名前-発動者」になる |
| **{{ui:monsterMonitor.entityDuration.merge}}** | 1 回の発動で同じ ID のエンティティが複数生成される場合にチェック。発動者ごとに 1 行にまとめ、残り時間が最も短いものを表示する。**{{ui:monsterMonitor.entityDuration.scope.any}}** の場合は発動者ごとに 1 行 |

エンティティ ID ごとに 1 件のみ保持され、最大 32 件です。**{{ui:monsterMonitor.entityDuration.listTitle}}** で編集、並べ替え、削除、まとめ表示の切り替えができます。

## 音声読み上げ

**出現時 / 残り x 秒 / 消滅時** の 3 種類のイベントを設定できます：

- 「残り x 秒」には、その項目に持続時間が設定されている必要があります
- まとめ表示の場合、「残り x 秒」はオーバーレイのカウントダウンに従います。同時に出現したエンティティは 1 回だけ読み上げ、あとから行を引き継いだエンティティは残りが x 秒より多い場合のみもう一度読み上げます
- エンティティが早めに消滅した場合は「消滅」だけが読み上げられます
- 持続時間を変更すると、フィールド上の既存のエンティティは新しい長さで計時し直されます
- 音声の割り当てはエンティティ ID ごとに記録されるため、発動者の範囲を変更してもそのまま使えます。項目を削除すると音声の割り当ても削除されます
- **{{ui:monsterMonitor.enabled}}** をオフにするとオーバーレイにはエンティティが表示されなくなりますが、音声の読み上げは引き続き動作します

## 例

- [鎌車の残り時間を表示する](./examples/scythe-cart.md)
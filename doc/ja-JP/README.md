# Resonance Logs CN 使用ガイド

Resonance Logs CN は『ブループロトコル：スターレゾナンス』（星痕共鳴）の戦闘補助ツールです。ダメージと回復の集計、スキル CD と Buff の監視、Boss ギミックの予告、重要なタイミングの音声通知、モジュールの組み合わせ計算を行えます。

> [!TIP]
> 初めてお使いですか？ [クイックスタート](./getting-started/README.md) から始めましょう。[例：初めてダンジョンに行く前の準備](./getting-started/examples/first-dungeon.md) に沿って進めれば、10 分で使い始められます。

## はじめに

| ドキュメント | わかること |
| --- | --- |
| [クイックスタート](./getting-started/README.md) | インストール、キャプチャ方式の設定、データが出ることの確認 |
| [画面ガイド](./getting-started/interface.md) | メインウィンドウの各ページとオーバーレイの役割 |

## こんなことをしたい

| シーン | 参照先 |
| --- | --- |
| パーティ全員のダメージ量を見たい | [DPSメーター](./features/dps/README.md) |
| 木人で決まった時間の火力を測りたい | [例：ダミーモードで 3 分間の火力を測る](./features/dps/examples/dummy-rotation.md) |
| 戦闘後に火力の空白を振り返りたい | [例：タイムラインで火力の空白を見つける](./features/dps/examples/timeline-gaps.md) |
| 自分のスキル CD と Buff を画面に表示したい | [ライブモニター](./features/monitor/README.md) |
| ファクターエネルギーとシーズンノードを自動表示したい | [例：ファクターエネルギーとシーズンノードを自動表示する](./features/monitor/examples/factor-energy.md) |
| Boss の被ダメージ増加デバフや詠唱を見張りたい | [モンスターモニター](./features/monster/README.md) |
| 味方の必殺技や軽減がいつ戻るか知りたい | [味方 CD](./features/monster/teammate-cd.md) |
| レイドでギミックの立ち位置を確認したい | [ダンジョンギミック](./features/minimap/README.md) |
| スキルの CD 明けや Boss の大技を音声で知りたい | [音声読み上げ](./features/voice/README.md) |
| 大量のモジュールから最適な組み合わせを探したい | [モジュール計算](./features/module-calc/README.md) |
| 職業を変えたら設定一式を自動で切り替えたい | [例：スペック切り替え時にロードアウトを自動切替](./features/app/examples/spec-loadout.md) |

## 機能ドキュメント

### DPSメーター

| ドキュメント | 説明 | 例 |
| --- | --- | --- |
| [DPSメーター](./features/dps/README.md) | リアルタイム集計、ダミーモード、戦闘の分割とリセット | [木人で火力測定](./features/dps/examples/dummy-rotation.md) |
| [履歴](./features/dps/history.md) | 履歴リスト、スキル詳細、タイムライン | [タイムラインで振り返り](./features/dps/examples/timeline-gaps.md) |
| [チャレンジ監視](./features/dps/challenge.md) | チャレンジダンジョンでの被弾とミスの集計 | [チャレンジの被弾](./features/dps/examples/challenge-hits.md) |
| [テーマと外観](./features/dps/themes.md) | 配色、透明度、タイトルバー、コンパクトモード | [ミニマルな透明ウィンドウ](./features/dps/examples/transparent-window.md) · [カスタムレイアウトと死亡リプレイ](./features/dps/examples/header-death.md) |
| [表示設定](./features/dps/settings.md) | ライブと履歴テーブルの列設定 | [表示列のカスタマイズ](./features/dps/examples/table-columns.md) |

### ライブモニター

| ドキュメント | 説明 | 例 |
| --- | --- | --- |
| [ライブモニター](./features/monitor/README.md) | 機能の概要と使い方の流れ | — |
| [スキル CD](./features/monitor/skill-cd.md) | 監視するスキルを選ぶ | — |
| [Buff モニター](./features/monitor/buff.md) | 個別監視、カテゴリクイックモニター、別名 | [ティーナ CD の音声通知](./features/monitor/examples/tina-cd.md) · [複合 Buff 監視](./features/monitor/examples/attribute-symphony.md) |
| [バフ稼働率](./features/monitor/buff-coverage.md) | 戦闘中のバフの維持時間を集計 | [稼働率の振り返り](./features/monitor/examples/buff-coverage.md) |
| [キャラクターパネル](./features/monitor/panel-attr.md) | ステータスをリアルタイム表示 | — |
| [HP/シールドエリア](./features/monitor/shield.md) | 自分の HP とシールド | — |
| [カスタムモニター](./features/monitor/custom-panel.md) | 通常エリア、ファクター設定エリア、シーズンノードエリア、カウンター | [ファクターエリア](./features/monitor/examples/factor-energy.md) · [プリセットカウンター](./features/monitor/examples/preset-counter.md) |
| [ウィンドウの有効化とレイアウト](./features/monitor/overlay.md) | オーバーレイ各エリアのオン/オフとレイアウト編集 | — |

### モンスターモニター

| ドキュメント | 説明 | 例 |
| --- | --- | --- |
| [モンスターモニター](./features/monster/README.md) | 機能の概要、ライブモニターとの違い | — |
| [対象バフ](./features/monster/buff.md) | ターゲットにかかっている Buff とアラート | [被ダメージ増加デバフを見張る](./features/monster/examples/vulnerability.md) · [ロリーラ Buff 監視](./features/monster/examples/lorola.md) |
| [味方 Buff](./features/monster/teammate.md) | 味方にかかっている Buff | — |
| [味方 CD](./features/monster/teammate-cd.md) | 味方から共有されたスキルクールダウン | — |
| [スタン、HP と味方幻想](./features/monster/status.md) | ターゲットの状態バー | — |
| [ヘイトリスト](./features/monster/hate.md) | ターゲットのヘイト順位 | — |
| [Boss DBM](./features/monster/boss-dbm.md) | Boss スキルの予告バー | [Boss スキルの音声予告](./features/monster/examples/boss-alias.md) |
| [エンティティ持続](./features/monster/entity-duration.md) | 召喚物などエンティティの存在時間 | [鎌車の残り時間](./features/monster/examples/scythe-cart.md) |
| [ウィンドウを有効化](./features/monster/overlay.md) | モンスターオーバーレイ各エリアのオン/オフ | — |

### ダンジョンギミック

| ドキュメント | 説明 | 例 |
| --- | --- | --- |
| [ダンジョンギミック](./features/minimap/README.md) | ミニマップオーバーレイ、表示オプション、ギミック音声 | [レイド攻略前のミニマップ設定](./features/minimap/examples/raid-setup.md) |
| [対応ダンジョン](./features/minimap/dungeons.md) | 各ダンジョンのギミック説明 | — |

### 音声読み上げ

| ドキュメント | 説明 | 例 |
| --- | --- | --- |
| [音声読み上げ](./features/voice/README.md) | クイックスタート、機能ページでの読み上げ設定 | [Buff 音声の一括生成](./features/voice/examples/buff-voice.md) |
| [音色と短文](./features/voice/voices.md) | プリセット・クローン・微調整音色、音声のインポート | [カスタム効果音](./features/voice/examples/custom-sfx.md) · [音声クローンとインポート](./features/voice/examples/clone-import.md) |
| [再生と通知](./features/voice/playback.md) | 音量、優先度、プレースホルダー、マッチング通知 | [マッチング成功の通知](./features/voice/examples/match-found.md) |

### モジュール計算

| ドキュメント | 説明 | 例 |
| --- | --- | --- |
| [モジュール計算](./features/module-calc/README.md) | モジュールの読み込み、最適な組み合わせの計算、フィルター | [知力 + 会心の最適な組み合わせを探す](./features/module-calc/examples/intellect-crit.md) |

### アプリとロードアウト

| ドキュメント | 説明 | 例 |
| --- | --- | --- |
| [アプリ設定](./features/app/README.md) | 一般、外観、ネットワーク、ショートカット、診断 | [戦闘中にショートカットを使う](./features/app/examples/combat-shortcuts.md) |
| [ロードアウト](./features/app/loadouts.md) | ロードアウト管理、スペック別の切り替え、インポート/エクスポート | [スペック切り替えでロードアウトを変更](./features/app/examples/spec-loadout.md) · [ロードアウトを共有する](./features/app/examples/share-loadout.md) |
| [アップデート、トレイと設定の復元](./features/app/update.md) | 自動アップデート、トレイメニュー、設定の復元 | — |

## よくある質問と更新

| ドキュメント | 説明 |
| --- | --- |
| [よくある質問](./faq.md) | 機能別の質問と回答 |
| [バージョン更新](./changelog/README.md) | 各バージョンの更新内容 |

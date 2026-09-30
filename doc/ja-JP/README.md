# Resonance Logs CN 使用ガイド

Resonance Logs CN は『ブループロトコル：スターレゾナンス』（星痕共鳴）の戦闘補助ツールです。ダメージと回復の集計、スキル CD と Buff の監視、Boss ギミックの予告、重要なタイミングの音声通知、モジュールの組み合わせ計算を行えます。

> [!TIP]
> 初めてお使いですか？ [クイックスタート](./getting-started/README.md) から始めましょう。[例：初めてダンジョンに行く前の準備](./getting-started/README.md#例初めてダンジョンに行く前の準備) に沿って進めれば、10 分で使い始められます。

## はじめに

| ドキュメント | わかること |
| --- | --- |
| [クイックスタート](./getting-started/README.md) | インストール、キャプチャ方式の設定、データが出ることの確認 |
| [画面ガイド](./getting-started/interface.md) | メインウィンドウの各ページとオーバーレイの役割 |

## こんなことをしたい

| シーン | 参照先 |
| --- | --- |
| パーティ全員のダメージ量を見たい | [DPSメーター](./features/dps/README.md) |
| 木人で決まった時間の火力を測りたい | [例：ダミーモードで 3 分間の火力を測る](./features/dps/README.md#例訓練用ダミーモードで-3-分間の火力を測る) |
| 戦闘後に火力の空白を振り返りたい | [例：タイムラインで火力の空白を見つける](./features/dps/history.md#例タイムラインで火力の空白を見つける) |
| 自分のスキル CD と Buff を画面に表示したい | [ライブモニター](./features/monitor/README.md) |
| ファクターエネルギーとシーズンノードを自動表示したい | [例：ファクターエネルギーとシーズンノードを自動表示する](./features/monitor/custom-panel.md#例因子エネルギーとシーズンノードを自動表示する) |
| Boss の被ダメージ増加デバフや詠唱を見張りたい | [モンスターモニター](./features/monster/README.md) |
| 味方の必殺技や軽減がいつ戻るか知りたい | [味方 CD](./features/monster/teammate-cd.md) |
| レイドでギミックの立ち位置を確認したい | [ダンジョンギミック](./features/minimap/README.md) |
| スキルの CD 明けや Boss の大技を音声で知りたい | [音声読み上げ](./features/voice/README.md) |
| 大量のモジュールから最適な組み合わせを探したい | [モジュール計算](./features/module-calc/README.md) |
| 職業を変えたら設定一式を自動で切り替えたい | [例：スペック切り替え時にロードアウトを自動切替](./features/app/loadouts.md#例スペック切り替え時にロードアウトを自動で切り替える) |

## 機能ドキュメント

### DPSメーター

| ドキュメント | 説明 | 例 |
| --- | --- | --- |
| [DPSメーター](./features/dps/README.md) | リアルタイム集計、ダミーモード、戦闘の分割とリセット | [木人で火力測定](./features/dps/README.md#例訓練用ダミーモードで-3-分間の火力を測る) |
| [履歴](./features/dps/history.md) | 履歴リスト、スキル詳細、タイムライン | [タイムラインで振り返り](./features/dps/history.md#例タイムラインで火力の空白を見つける) |
| [チャレンジ監視](./features/dps/challenge.md) | チャレンジダンジョンでの被弾とミスの集計 | [チャレンジの被弾](./features/dps/challenge.md#例チャレンジダンジョンで浮遊砲を受けたのは誰か確認する) |
| [テーマと外観](./features/dps/themes.md) | 配色、透明度、タイトルバー、コンパクトモード | [ミニマルな透明ウィンドウ](./features/dps/themes.md#例透明なミニマル-dps-ウィンドウ) |
| [表示設定](./features/dps/settings.md) | ライブと履歴テーブルの列設定 | — |

### ライブモニター

| ドキュメント | 説明 | 例 |
| --- | --- | --- |
| [ライブモニター](./features/monitor/README.md) | 機能の概要と使い方の流れ | — |
| [スキル CD](./features/monitor/skill-cd.md) | 監視するスキルを選ぶ | — |
| [Buff モニター](./features/monitor/buff.md) | 個別監視、カテゴリクイックモニター、別名 | [ティーナ CD の音声通知](./features/monitor/buff.md#例ティナの-cd-が戻ったら音声で知らせる) |
| [バフ稼働率](./features/monitor/buff-coverage.md) | 戦闘中のバフの維持時間を集計 | [稼働率の振り返り](./features/monitor/buff-coverage.md#例パーティの強化-buff-稼働率を振り返る) |
| [キャラクターパネル](./features/monitor/panel-attr.md) | ステータスをリアルタイム表示 | — |
| [HP/シールドエリア](./features/monitor/shield.md) | 自分の HP とシールド | — |
| [カスタムモニター](./features/monitor/custom-panel.md) | 通常エリア、ファクター設定エリア、シーズンノードエリア、カウンター | [ファクターエリア](./features/monitor/custom-panel.md#例因子エネルギーとシーズンノードを自動表示する) · [プリセットカウンター](./features/monitor/custom-panel.md#例プリセットカウンターで炎角の絶対幸運を見張る) |
| [ウィンドウの有効化とレイアウト](./features/monitor/overlay.md) | オーバーレイ各エリアのオン/オフとレイアウト編集 | — |

### モンスターモニター

| ドキュメント | 説明 | 例 |
| --- | --- | --- |
| [モンスターモニター](./features/monster/README.md) | 機能の概要、ライブモニターとの違い | — |
| [対象バフ](./features/monster/buff.md) | ターゲットにかかっている Buff とアラート | [被ダメージ増加デバフを見張る](./features/monster/buff.md#例自分が付与した脆弱を監視し切れる前に知らせる) |
| [味方 Buff](./features/monster/teammate.md) | 味方にかかっている Buff | — |
| [味方 CD](./features/monster/teammate-cd.md) | 味方から共有されたスキルクールダウン | — |
| [スタン、HP と味方幻想](./features/monster/status.md) | ターゲットの状態バー | — |
| [ヘイトリスト](./features/monster/hate.md) | ターゲットのヘイト順位 | — |
| [Boss DBM](./features/monster/boss-dbm.md) | Boss スキルの予告バー | [Boss スキルの音声予告](./features/monster/boss-dbm.md#例boss-スキルに別名を付けて音声で予告する) |
| [エンティティ持続](./features/monster/entity-duration.md) | 召喚物などエンティティの存在時間 | [鎌車の残り時間](./features/monster/entity-duration.md#例鎌車の残り時間を表示する) |
| [ウィンドウを有効化](./features/monster/overlay.md) | モンスターオーバーレイ各エリアのオン/オフ | — |

### ダンジョンギミック

| ドキュメント | 説明 | 例 |
| --- | --- | --- |
| [ダンジョンギミック](./features/minimap/README.md) | ミニマップオーバーレイ、表示オプション、ギミック音声 | [レイド攻略前のミニマップ設定](./features/minimap/README.md#例レイド初攻略前のミニマップ設定) |
| [対応ダンジョン](./features/minimap/dungeons.md) | 各ダンジョンのギミック説明 | — |

### 音声読み上げ

| ドキュメント | 説明 | 例 |
| --- | --- | --- |
| [音声読み上げ](./features/voice/README.md) | クイックスタート、機能ページでの読み上げ設定 | — |
| [音色と短文](./features/voice/voices.md) | プリセット・クローン・微調整音色、音声のインポート | [カスタム効果音](./features/voice/voices.md#例自分の効果音で-boss-の大技を知らせる) |
| [再生と通知](./features/voice/playback.md) | 音量、優先度、プレースホルダー、マッチング通知 | [マッチング成功の通知](./features/voice/playback.md#例放置でマッチング待ちしているときにマッチ成立を聞き逃さない) |

### モジュール計算

| ドキュメント | 説明 | 例 |
| --- | --- | --- |
| [モジュール計算](./features/module-calc/README.md) | モジュールの読み込み、最適な組み合わせの計算、フィルター | [知力 + 会心の最適な組み合わせを探す](./features/module-calc/README.md#例アタッカー向けに知力--会心の最適な組み合わせを探す) |

### アプリとロードアウト

| ドキュメント | 説明 | 例 |
| --- | --- | --- |
| [アプリ設定](./features/app/README.md) | 一般、外観、ネットワーク、ショートカット、診断 | [戦闘中にショートカットを使う](./features/app/README.md#例ショートカットで戦闘中にオーバーレイを調整する) |
| [ロードアウト](./features/app/loadouts.md) | ロードアウト管理、スペック別の切り替え、インポート/エクスポート | [スペック切り替えでロードアウトを変更](./features/app/loadouts.md#例スペック切り替え時にロードアウトを自動で切り替える) · [ロードアウトを共有する](./features/app/loadouts.md#例ロードアウトをパーティーメンバーと共有する) |
| [アップデート、トレイと設定の復元](./features/app/update.md) | 自動アップデート、トレイメニュー、設定の復元 | — |

## よくある質問と更新

| ドキュメント | 説明 |
| --- | --- |
| [よくある質問](./faq.md) | 機能別の質問と回答 |
| [バージョン更新](./changelog/README.md) | 各バージョンの更新内容 |

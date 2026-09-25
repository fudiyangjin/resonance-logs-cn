# 対応ダンジョン

下の表は、現在ギミックを表示できるダンジョンの一覧です。同じダンジョンのノーマル、ハード、マスターなどの難易度は同じ解析を共有し、シーン ID だけが異なります。ギミック名はオーバーレイに実際に表示されるものに準じます。

| ダンジョン | シーン ID | 主なギミック |
| --- | --- | --- |
| [呪いの煌墓](#呪いの煌墓) | 6513 / 6514 / 6515 | 青塔、エネルギー柱の指名、半面突進、突進分身、パズルの指名 |
| [環海岩礁](#環海岩礁) | 6563 / 6564 / 6565 | 道中の行列ルーン、デュエット色、氷 / 海浪の安全地帯、ピザ危険区域 |
| [忘却幻夢の野](#忘却幻夢の野) | 13021 / 13022 / 13023 | フェーズの床、頭割り / 減衰 / 散開、因果跳躍、累刎宣告、電磁リング、ピンボール |
| [蝕·巨塔の遺跡](#蝕巨塔の遺跡) | 1150 / 1151 / 1152 | 正しいポータル、重力雷爆、粘着弾 |
| [蝕·ティナ精神領域](#蝕ティナ精神領域) | 1631 / 1632 / 1633 | ピザ危険扇形、重傷、赤光束縛、無敵斬マーク |
| [マスター·荒蕪の庭](#マスター荒蕪の庭) | 6615 | 虚痕ペア、変換球、3 種類の輪、ヘルガの影、近距離・遠距離連鎖 |

## 呪いの煌墓

- **{{ui:minimap.s3CursedTomb.tower.group}}**：青塔の起動進行度と、起動完了・金塔への転換待ち・金塔完了などの状態を表示します。
- **{{ui:minimap.s3CursedTomb.energy.group}}**：指名された味方とエネルギー柱の位置を示します。
- **{{ui:minimap.s3CursedTomb.chargeTarget.group}}** / **{{ui:minimap.s3CursedTomb.clone.group}}**：突進の方向（左側、右側、ランダム）と、分身が左手・右手・正面のどこにいるかを示します。
- **{{ui:minimap.s3CursedTomb.puzzle.group}}**：パズル 1 / パズル 2 の指名対象。

![呪いの煌墓](../../../shared/img/minimap/s3_minimap_1.png)

## 環海岩礁

**道中**：{{ui:minimap.s3SeaRingedReef.matrix.group}}（ルーン A～D）と {{ui:minimap.s3SeaRingedReef.matrix.calloutGroup}}。味方の立ち位置も同時に表示します。

![環海岩礁の道中行列](../../../shared/img/minimap/s3_minimap_2.png)

**Boss**：

- **{{ui:minimap.s3SeaRingedReef.boss.dualGroup}}**：氷または水。
- **{{ui:minimap.s3SeaRingedReef.boss.waveGroup}}**：氷の波、海浪、単独の波の安全地帯と、十字の交点・横線・縦線。
- **{{ui:minimap.s3SeaRingedReef.boss.pizzaGroup}}**：オレンジと紫の扇形。

![環海岩礁 Boss](../../../shared/img/minimap/s3_minimap_3.png)

## 忘却幻夢の野

- **{{ui:minimap.s3Raid.phase.group}}**：四隅の爆発、辺の中央の爆発と、対応する床（左上～右下）。
- **{{ui:minimap.s3Raid.shareGroup}}**：幻想版を含みます。味方は指名の種類ごとに色分けされます。
- **{{ui:minimap.s3Raid.causalJump.group}}**、**{{ui:minimap.s3Raid.killMark.group}}**、**{{ui:minimap.s3Raid.presetReturn.group}}**。
- **{{ui:minimap.s3Raid.electromagneticPulse.group}}**（A / B / C）と **{{ui:minimap.s3Raid.electromagneticRing.group}}**（内環、中環、外環）。
- **{{ui:minimap.s3Raid.normalDecay.group}}**、**{{ui:minimap.s3Raid.hitOrder.group}}**、**{{ui:minimap.s3Raid.pinball.group}}**。

## 蝕·巨塔の遺跡

- **{{ui:minimap.s3GiantTower.portal.group}}**：今回の **{{ui:minimap.s3GiantTower.portal.correct}}** の色を示します。
- **{{ui:minimap.s3GiantTower.gravity.group}}** / **{{ui:minimap.s3GiantTower.sticky.group}}**：爆発までのカウントダウンを表示します。

## 蝕·ティナ精神領域

- **{{ui:minimap.s3TinaMindrealm.pizzaGroup}}**：遅い波・速い波の扇形。
- **{{ui:minimap.s3TinaMindrealm.buffGroup}}**：重傷、赤光束縛、無敵斬マーク（何刀目かを表示）。

## マスター·荒蕪の庭

- **{{ui:minimap.s4WastelandCourt.pair.group}}**：3 マスの色、ロック状態、入れ替えが必要なマス。**{{ui:minimap.s4WastelandCourt.orb.group}}** と組み合わせて使います。
- **{{ui:minimap.s4WastelandCourt.wheel.group}}**：{{ui:minimap.s4WastelandCourt.wheel.blue}}、{{ui:minimap.s4WastelandCourt.wheel.red}}、{{ui:minimap.s4WastelandCourt.wheel.doom}}。
- **{{ui:minimap.s4WastelandCourt.shadow.group}}**：{{ui:minimap.s4WastelandCourt.shadow.energyTarget}}。
- **{{ui:minimap.s4WastelandCourt.chain.group}}**：近距離円・遠距離円の数と爆発順。

![荒蕪の庭：虚痕ペア](../../../shared/img/changelog/v0.2.3_4.png)

![荒蕪の庭：エネルギー球追尾](../../../shared/img/changelog/v0.2.3_5.png)

> [!NOTE]
> 一覧にないダンジョンでは、現在ミニマップは表示されません。新しいダンジョンへの対応をご希望の場合は、[GitHub Issues](https://github.com/fudiyangjin/resonance-logs-cn/issues) でお気軽にお知らせください。

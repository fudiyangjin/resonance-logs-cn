# Supported dungeons

The table below lists the dungeons that currently show mechanics. Normal, Hard, Master and other difficulties of the same dungeon share one parser; only the scene IDs differ. Mechanic names follow what is actually shown in the overlay.

| Dungeon | Scene ID | Main mechanics |
| --- | --- | --- |
| [Cursed Tomb](#cursed-tomb) | 6513 / 6514 / 6515 | Blue tower, energy pillar targets, half-field charge, charge clones, puzzle targets |
| [Sea-Ringed Reef](#sea-ringed-reef) | 6563 / 6564 / 6565 | Mid-run matrix runes, duet colors, ice / sea wave safe zones, pizza danger zones |
| [Forgotten Dreamwilds](#forgotten-dreamwilds) | 13021 / 13022 / 13023 | Phase tiles, share / decay / spread, causal jump, execution sentence, electromagnetic rings, pinball |
| [Eroded Towering Ruin](#eroded-towering-ruin) | 1150 / 1151 / 1152 | Correct portal, gravity blast, sticky bombs |
| [Tina's Mindrealm](#tinas-mindrealm) | 1631 / 1632 / 1633 | Pizza danger sectors, Heavy Wound, Red-Light Bind, Wudi-Slash marks |
| [Master: Wasteland Court](#master-wasteland-court) | 6615 | Void-mark swap, swap orbs, three kinds of wheels, Shadow of Heluga, near/far chain circles |

## Cursed Tomb

- **{{ui:minimap.s3CursedTomb.tower.group}}**: shows blue tower activation progress, plus states such as activation complete, turning into a gold tower, and gold tower complete.
- **{{ui:minimap.s3CursedTomb.energy.group}}**: marks the targeted teammates and the energy pillar positions.
- **{{ui:minimap.s3CursedTomb.chargeTarget.group}}** / **{{ui:minimap.s3CursedTomb.clone.group}}**: shows the charge direction (left, right, random) and whether the clone is on the left hand, right hand or straight ahead.
- **{{ui:minimap.s3CursedTomb.puzzle.group}}**: the targets of puzzle 1 / puzzle 2.

![Cursed Tomb](../../../shared/img/minimap/s3_minimap_1.png)

## Sea-Ringed Reef

**Mid-run**: {{ui:minimap.s3SeaRingedReef.matrix.group}} (runes A–D) and {{ui:minimap.s3SeaRingedReef.matrix.calloutGroup}}, with teammate positions shown as well.

![Sea-Ringed Reef mid-run matrix](../../../shared/img/minimap/s3_minimap_2.png)

**Boss**:

- **{{ui:minimap.s3SeaRingedReef.boss.dualGroup}}**: ice or water.
- **{{ui:minimap.s3SeaRingedReef.boss.waveGroup}}**: ice wave, sea wave and single-wave safe zones, plus the cross intersection, horizontal line and vertical line.
- **{{ui:minimap.s3SeaRingedReef.boss.pizzaGroup}}**: orange and purple sectors.

![Sea-Ringed Reef Boss](../../../shared/img/minimap/s3_minimap_3.png)

## Forgotten Dreamwilds

- **{{ui:minimap.s3Raid.phase.group}}**: corner explosions, edge-center explosions, and the corresponding tiles (top left to bottom right).
- **{{ui:minimap.s3Raid.shareGroup}}**: including the fantasy versions; teammates are colored by target type.
- **{{ui:minimap.s3Raid.causalJump.group}}**, **{{ui:minimap.s3Raid.killMark.group}}**, **{{ui:minimap.s3Raid.presetReturn.group}}**.
- **{{ui:minimap.s3Raid.electromagneticPulse.group}}** (A / B / C) and **{{ui:minimap.s3Raid.electromagneticRing.group}}** (inner, middle, outer ring).
- **{{ui:minimap.s3Raid.normalDecay.group}}**, **{{ui:minimap.s3Raid.hitOrder.group}}**, **{{ui:minimap.s3Raid.pinball.group}}**.

## Eroded Towering Ruin

- **{{ui:minimap.s3GiantTower.portal.group}}**: marks the color of this round's **{{ui:minimap.s3GiantTower.portal.correct}}**.
- **{{ui:minimap.s3GiantTower.gravity.group}}** / **{{ui:minimap.s3GiantTower.sticky.group}}**: shows the explosion countdown.

## Tina's Mindrealm

- **{{ui:minimap.s3TinaMindrealm.pizzaGroup}}**: slow wave and fast wave sectors.
- **{{ui:minimap.s3TinaMindrealm.buffGroup}}**: Heavy Wound, Red-Light Bind, Wudi-Slash marks (shown as which slash).

## Master: Wasteland Court

- **{{ui:minimap.s4WastelandCourt.pair.group}}**: colors of the 3 cells, lock state, and which cells need to be swapped; use together with **{{ui:minimap.s4WastelandCourt.orb.group}}**.
- **{{ui:minimap.s4WastelandCourt.wheel.group}}**: {{ui:minimap.s4WastelandCourt.wheel.blue}}, {{ui:minimap.s4WastelandCourt.wheel.red}}, {{ui:minimap.s4WastelandCourt.wheel.doom}}.
- **{{ui:minimap.s4WastelandCourt.shadow.group}}**: {{ui:minimap.s4WastelandCourt.shadow.energyTarget}}.
- **{{ui:minimap.s4WastelandCourt.chain.group}}**: the number of near and far circles and their explosion order.

![Wasteland Court: Void-mark swap](../../../shared/img/changelog/v0.2.3_4.png)

![Wasteland Court: Energy orb tracking](../../../shared/img/changelog/v0.2.3_5.png)

> [!NOTE]
> Dungeons not on this list don't show a minimap for now. If you'd like a new dungeon supported, feel free to let us know in [GitHub Issues](https://github.com/fudiyangjin/resonance-logs-cn/issues).

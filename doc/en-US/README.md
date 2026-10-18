# Resonance Logs CN User Guide

Resonance Logs CN is a combat helper for *Blue Protocol: Star Resonance*: it tracks damage and healing, monitors skill CDs and Buffs, warns you about Boss mechanics, calls out key moments by voice, and helps you work out module combinations.

> [!TIP]
> First time here? Start with [Getting Started](./getting-started/README.md). Follow [Example: Preparing for your first dungeon](./getting-started/examples/first-dungeon.md) and you'll be up and running in 10 minutes.

## Getting started

| Document | What you'll learn |
| --- | --- |
| [Getting Started](./getting-started/README.md) | Install, set up packet capture, confirm data is coming in |
| [Interface Tour](./getting-started/interface.md) | What each main-window page and overlay does |

## I want to…

| Scenario | Go here |
| --- | --- |
| See how much damage everyone in the party dealt | [DPS Meter](./features/dps/README.md) |
| Test a fixed-length damage rotation on a training dummy | [Example: Test a 3-minute rotation in dummy mode](./features/dps/examples/dummy-rotation.md) |
| Review damage gaps after a fight | [Example: Find damage gaps with the timeline](./features/dps/examples/timeline-gaps.md) |
| See my own skill CDs and Buffs on screen | [Live Monitor](./features/monitor/README.md) |
| Show factor energy and season nodes automatically | [Example: Show factor energy and season nodes automatically](./features/monitor/examples/factor-energy.md) |
| Keep an eye on vulnerability debuffs on the Boss and watch Boss casts | [Monster Monitor](./features/monster/README.md) |
| See when teammates' ultimates and mitigation come back | [Teammate CD](./features/monster/teammate-cd.md) |
| See mechanic positioning in raids | [Dungeon Mechanics](./features/minimap/README.md) |
| Hear a voice call when a skill comes off cooldown or a Boss uses a big attack | [Voice Announcements](./features/voice/README.md) |
| Find the best combination from a pile of modules | [Module Calculator](./features/module-calc/README.md) |
| Switch my whole setup automatically when I change class | [Example: Switch loadouts automatically when changing spec](./features/app/examples/spec-loadout.md) |

## Feature guides

### DPS Meter

| Document | Description | Examples |
| --- | --- | --- |
| [DPS Meter](./features/dps/README.md) | Live stats, dummy mode, combat splitting and resets | [Dummy damage test](./features/dps/examples/dummy-rotation.md) |
| [History](./features/dps/history.md) | History list, skill breakdown, timeline | [Timeline review](./features/dps/examples/timeline-gaps.md) |
| [Challenge Watch](./features/dps/challenge.md) | Hits taken and mistakes in challenge dungeons | [Challenge hits taken](./features/dps/examples/challenge-hits.md) |
| [Themes & Appearance](./features/dps/themes.md) | Colors, opacity, title bar, compact mode | [Minimal transparent window](./features/dps/examples/transparent-window.md) · [Custom layout & death replay](./features/dps/examples/header-death.md) |
| [Display Settings](./features/dps/settings.md) | Column settings for the live and history tables | [Customize columns](./features/dps/examples/table-columns.md) |

### Live Monitor

| Document | Description | Examples |
| --- | --- | --- |
| [Live Monitor](./features/monitor/README.md) | Feature overview and workflow | — |
| [Skill CD](./features/monitor/skill-cd.md) | Choose which skills to monitor | — |
| [Buff Monitor](./features/monitor/buff.md) | Exact monitoring, category quick monitor, aliases | [Tina CD voice reminder](./features/monitor/examples/tina-cd.md) · [Track 3-stack buff](./features/monitor/examples/attribute-symphony.md) |
| [Buff Coverage](./features/monitor/buff-coverage.md) | Measure how long buffs stay up during combat | [Coverage review](./features/monitor/examples/buff-coverage.md) |
| [Character Panel](./features/monitor/panel-attr.md) | Live attribute display | — |
| [HP/Shield Area](./features/monitor/shield.md) | Your own HP and shields | — |
| [Custom Monitor](./features/monitor/custom-panel.md) | Standard areas, factor config area, season node area, counters | [Factor area](./features/monitor/examples/factor-energy.md) · [Preset counters](./features/monitor/examples/preset-counter.md) |
| [Enable Window & Layout](./features/monitor/overlay.md) | Overlay area toggles and layout editing | — |

### Monster Monitor

| Document | Description | Examples |
| --- | --- | --- |
| [Monster Monitor](./features/monster/README.md) | Feature overview and how it differs from Live Monitor | — |
| [Target Buffs](./features/monster/buff.md) | Buffs on your target and alerts | [Watch vulnerability debuffs](./features/monster/examples/vulnerability.md) · [Monitor Lorola buffs](./features/monster/examples/lorola.md) |
| [Teammate Buffs](./features/monster/teammate.md) | Buffs on your teammates | — |
| [Teammate CD](./features/monster/teammate-cd.md) | Skill cooldowns shared by your teammates | — |
| [Stun, HP & Teammate Fantasies](./features/monster/status.md) | Target status bars | — |
| [Hate List](./features/monster/hate.md) | Threat ranking on your target | — |
| [Boss DBM](./features/monster/boss-dbm.md) | Boss skill warning bars | [Boss skill voice warnings](./features/monster/examples/boss-alias.md) |
| [Entity Duration](./features/monster/entity-duration.md) | How long summons and other entities stay around | [Scythe Cart remaining time](./features/monster/examples/scythe-cart.md) |
| [Monster Skills](./features/monster/monster-skill.md) | Shown when a nearby monster casts a listed skill | — |
| [Enable Window](./features/monster/overlay.md) | Toggles for each area of the monster overlay | — |

### Dungeon Mechanics

| Document | Description | Examples |
| --- | --- | --- |
| [Dungeon Mechanics](./features/minimap/README.md) | Minimap overlay, display options, mechanic voice calls | [Minimap setup before progressing a raid](./features/minimap/examples/raid-setup.md) |
| [Supported Dungeons](./features/minimap/dungeons.md) | Mechanic notes for each dungeon | — |

### Voice Announcements

| Document | Description | Examples |
| --- | --- | --- |
| [Voice Announcements](./features/voice/README.md) | Quick start, binding announcements on feature pages | [Buff voice announcement](./features/voice/examples/buff-voice.md) |
| [Voices & Phrases](./features/voice/voices.md) | Preset, cloned and fine-tuned voices, importing audio | [Custom sound effects](./features/voice/examples/custom-sfx.md) · [Clone voices & import audio](./features/voice/examples/clone-import.md) |
| [Playback & Reminders](./features/voice/playback.md) | Volume, priority, placeholders, match-found reminders | [Match-found reminder](./features/voice/examples/match-found.md) |

### Module Calculator

| Document | Description | Examples |
| --- | --- | --- |
| [Module Calculator](./features/module-calc/README.md) | Read modules, calculate the best combination, filters | [Find the best Intellect + Crit combination](./features/module-calc/examples/intellect-crit.md) |

### App & Loadouts

| Document | Description | Examples |
| --- | --- | --- |
| [App Settings](./features/app/README.md) | General, appearance, network, shortcuts, diagnostics | [Use shortcuts in combat](./features/app/examples/combat-shortcuts.md) |
| [Loadouts](./features/app/loadouts.md) | Managing loadouts, switching by spec, import/export | [Switch loadouts by spec](./features/app/examples/spec-loadout.md) · [Share a loadout](./features/app/examples/share-loadout.md) |
| [Updates, Tray & Config Recovery](./features/app/update.md) | Auto-update, tray menu, config recovery | — |

## FAQ & updates

| Document | Description |
| --- | --- |
| [FAQ](./faq.md) | Answers grouped by feature |
| [Changelog](./changelog/README.md) | Release notes for each version |

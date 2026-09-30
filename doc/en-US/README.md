# Resonance Logs CN User Guide

Resonance Logs CN is a combat helper for *Blue Protocol: Star Resonance*: it tracks damage and healing, monitors skill CDs and Buffs, warns you about Boss mechanics, calls out key moments by voice, and helps you work out module combinations.

> [!TIP]
> First time here? Start with [Getting Started](./getting-started/README.md). Follow [Example: Preparing for your first dungeon](./getting-started/README.md#example-preparing-for-your-first-dungeon) and you'll be up and running in 10 minutes.

## Getting started

| Document | What you'll learn |
| --- | --- |
| [Getting Started](./getting-started/README.md) | Install, set up packet capture, confirm data is coming in |
| [Interface Tour](./getting-started/interface.md) | What each main-window page and overlay does |

## I want to…

| Scenario | Go here |
| --- | --- |
| See how much damage everyone in the party dealt | [DPS Meter](./features/dps/README.md) |
| Test a fixed-length damage rotation on a training dummy | [Example: Test a 3-minute rotation in dummy mode](./features/dps/README.md#example-test-a-3-minute-rotation-with-training-dummy-mode) |
| Review damage gaps after a fight | [Example: Find damage gaps with the timeline](./features/dps/history.md#example-find-dps-gaps-with-the-timeline) |
| See my own skill CDs and Buffs on screen | [Live Monitor](./features/monitor/README.md) |
| Show factor energy and season nodes automatically | [Example: Show factor energy and season nodes automatically](./features/monitor/custom-panel.md#example-automatically-show-factor-energy-and-season-nodes) |
| Keep an eye on vulnerability debuffs on the Boss and watch Boss casts | [Monster Monitor](./features/monster/README.md) |
| See when teammates' ultimates and mitigation come back | [Teammate CD](./features/monster/teammate-cd.md) |
| See mechanic positioning in raids | [Dungeon Mechanics](./features/minimap/README.md) |
| Hear a voice call when a skill comes off cooldown or a Boss uses a big attack | [Voice Announcements](./features/voice/README.md) |
| Find the best combination from a pile of modules | [Module Calculator](./features/module-calc/README.md) |
| Switch my whole setup automatically when I change class | [Example: Switch loadouts automatically when changing spec](./features/app/loadouts.md#example-switch-loadouts-automatically-when-changing-spec) |

## Feature guides

### DPS Meter

| Document | Description | Examples |
| --- | --- | --- |
| [DPS Meter](./features/dps/README.md) | Live stats, dummy mode, combat splitting and resets | [Dummy damage test](./features/dps/README.md#example-test-a-3-minute-rotation-with-training-dummy-mode) |
| [History](./features/dps/history.md) | History list, skill breakdown, timeline | [Timeline review](./features/dps/history.md#example-find-dps-gaps-with-the-timeline) |
| [Challenge Watch](./features/dps/challenge.md) | Hits taken and mistakes in challenge dungeons | [Challenge hits taken](./features/dps/challenge.md#example-see-who-got-hit-by-the-drone-cannon-in-a-challenge-dungeon) |
| [Themes & Appearance](./features/dps/themes.md) | Colors, opacity, title bar, compact mode | [Minimal transparent window](./features/dps/themes.md#example-a-transparent-minimal-dps-window) |
| [Display Settings](./features/dps/settings.md) | Column settings for the live and history tables | — |

### Live Monitor

| Document | Description | Examples |
| --- | --- | --- |
| [Live Monitor](./features/monitor/README.md) | Feature overview and workflow | — |
| [Skill CD](./features/monitor/skill-cd.md) | Choose which skills to monitor | — |
| [Buff Monitor](./features/monitor/buff.md) | Exact monitoring, category quick monitor, aliases | [Tina CD voice reminder](./features/monitor/buff.md#example-voice-reminder-when-tinas-cd-is-ready) |
| [Buff Coverage](./features/monitor/buff-coverage.md) | Measure how long buffs stay up during combat | [Coverage review](./features/monitor/buff-coverage.md#example-review-your-teams-boost-coverage) |
| [Character Panel](./features/monitor/panel-attr.md) | Live attribute display | — |
| [HP/Shield Area](./features/monitor/shield.md) | Your own HP and shields | — |
| [Custom Monitor](./features/monitor/custom-panel.md) | Standard areas, factor config area, season node area, counters | [Factor area](./features/monitor/custom-panel.md#example-automatically-show-factor-energy-and-season-nodes) · [Preset counters](./features/monitor/custom-panel.md#example-track-flamehorns-absolute-luck-with-a-preset-counter) |
| [Enable Window & Layout](./features/monitor/overlay.md) | Overlay area toggles and layout editing | — |

### Monster Monitor

| Document | Description | Examples |
| --- | --- | --- |
| [Monster Monitor](./features/monster/README.md) | Feature overview and how it differs from Live Monitor | — |
| [Target Buffs](./features/monster/buff.md) | Buffs on your target and alerts | [Watch vulnerability debuffs](./features/monster/buff.md#example-watch-the-vulnerability-you-applied-and-get-alerted-before-it-drops) |
| [Teammate Buffs](./features/monster/teammate.md) | Buffs on your teammates | — |
| [Teammate CD](./features/monster/teammate-cd.md) | Skill cooldowns shared by your teammates | — |
| [Stun, HP & Teammate Fantasies](./features/monster/status.md) | Target status bars | — |
| [Hate List](./features/monster/hate.md) | Threat ranking on your target | — |
| [Boss DBM](./features/monster/boss-dbm.md) | Boss skill warning bars | [Boss skill voice warnings](./features/monster/boss-dbm.md#example-give-a-boss-skill-an-alias-and-add-a-voice-warning) |
| [Entity Duration](./features/monster/entity-duration.md) | How long summons and other entities stay around | [Scythe Cart remaining time](./features/monster/entity-duration.md#example-show-the-scythe-carts-remaining-time) |
| [Enable Window](./features/monster/overlay.md) | Toggles for each area of the monster overlay | — |

### Dungeon Mechanics

| Document | Description | Examples |
| --- | --- | --- |
| [Dungeon Mechanics](./features/minimap/README.md) | Minimap overlay, display options, mechanic voice calls | [Minimap setup before progressing a raid](./features/minimap/README.md#example-minimap-setup-before-a-raids-first-clear) |
| [Supported Dungeons](./features/minimap/dungeons.md) | Mechanic notes for each dungeon | — |

### Voice Announcements

| Document | Description | Examples |
| --- | --- | --- |
| [Voice Announcements](./features/voice/README.md) | Quick start, binding announcements on feature pages | — |
| [Voices & Phrases](./features/voice/voices.md) | Preset, cloned and fine-tuned voices, importing audio | [Custom sound effects](./features/voice/voices.md#example-warn-about-a-bosss-big-attack-with-your-own-sound-effect) |
| [Playback & Reminders](./features/voice/playback.md) | Volume, priority, placeholders, match-found reminders | [Match-found reminder](./features/voice/playback.md#example-hear-match-found-while-queueing-afk) |

### Module Calculator

| Document | Description | Examples |
| --- | --- | --- |
| [Module Calculator](./features/module-calc/README.md) | Read modules, calculate the best combination, filters | [Find the best Intellect + Crit combination](./features/module-calc/README.md#example-find-the-best-intellect--crit-combination-for-a-dps-class) |

### App & Loadouts

| Document | Description | Examples |
| --- | --- | --- |
| [App Settings](./features/app/README.md) | General, appearance, network, shortcuts, diagnostics | [Use shortcuts in combat](./features/app/README.md#example-adjust-overlays-in-combat-with-shortcuts) |
| [Loadouts](./features/app/loadouts.md) | Managing loadouts, switching by spec, import/export | [Switch loadouts by spec](./features/app/loadouts.md#example-switch-loadouts-automatically-when-changing-spec) · [Share a loadout](./features/app/loadouts.md#example-share-a-loadout-with-teammates) |
| [Updates, Tray & Config Recovery](./features/app/update.md) | Auto-update, tray menu, config recovery | — |

## FAQ & updates

| Document | Description |
| --- | --- |
| [FAQ](./faq.md) | Answers grouped by feature |
| [Changelog](./changelog/README.md) | Release notes for each version |

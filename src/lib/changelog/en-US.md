# Changelog v0.2.5-beta

## Changes

### DPS / History

- Compact mode now applies to the player list only; skill details stay as a full table unless you enable "Also Compact Detail Pages" (DPS Meter → Themes → Compact Mode)
- History timeline now includes Deter Shot and Luminary Bolt
- History Buff coverage now sits between the skill lanes and the curve: full Buff names, grouping by player or by Buff, gray hatching for inactive time that coverage does not count, and the same hover, selection and zoom as the lanes; expand it from the timeline header (collapsed by default, shows you when expanded; other players can be added independently of the teammate lane picker, and you are listed first in player lists and the summary). The Buff coverage summary now has one row per Buff
- Damage element labels: Water is now Ice, Wood is now Forest
- Fixed difficulty names not being appended to scene names

### Overlay Monitor

- Added **Entity Duration** to Monster Monitor (Monster Monitor → Entity Duration): times nearby entities by id (e.g. Scythe Cart 179903) with presets / manual entries and a caster scope (self only / anyone). The timer starts when the entity appears and ends when it disappears. The optional **Merge same ID** shows one caster's entities with the same id as a single row counting down the one that expires soonest (on by default for the Scythe Cart preset)
- Removed **Duration Skills** from Live Monitor; a selected Scythe Cart is migrated automatically to Monster Monitor → Entity Duration
- Monster Monitor area visibility is now controlled from the enable window
- Monster HP values follow the abbreviation setting (Western / Chinese)
- Added Composite Buffs (Live Monitor → Buff → Composite Buffs): 2–8 Buffs that must all be present, or at least a set number of them, act as one Buff for monitor areas, coverage, and voice
- Teammate Buffs can override colors per entry and show downed teammates (Monster Monitor → Teammate Buffs)
- The season node area no longer hides Symphony Buffs
- Added skill CDs for Shield Knight, Heavy Guardian, and Marksman
- Minimap now tracks Lapsis, the first boss of the S4 raid Above the Firmament, End of Day and Night

### Voice

- The phrase library can import any audio file (Voice → Phrase Library)
- Skill CD and entity duration announcements can be bound on their own, without adding the skill to Skill CD monitoring first
- Voice rules are saved with the monitoring loadout
- Fixed charge-skill CD announcements when the remaining time crosses the threshold
- Fixed the playback queue, and imported audio is now resampled in one pass

### App Settings

- Clicking an available update now downloads it silently in the background, then verifies, installs, and restarts

### Data

- Updated monster names, Buffs, skill effects, and DBM data
- Restored monster names that had been removed by mistake

## Notes

### Compatibility

- If you used 0.0.2 or 0.0.3, first launch on 0.0.4-0.2.5-beta requires deleting `resonance-logs-cn.db` under `%LOCALAPPDATA%\resonance-logs-cn` and restarting
- 0.2.2 and 0.2.1 went through large refactors; if existing features break, please contact me promptly
- 0.2.2 changed table fields; errors on old history records are expected, new records work normally
- Voice announcements require a separate model download; the first phrase generation may take a while, but playback after that does not reload the model

### Important

- If you modify the code and share builds without opening a PR, please change the app name, version, and other upstream identifiers so your fork is not mistaken for the original
- The close button now hides to the bottom-right; drag the hidden bar back to the corner if you have many windows
- See the HTML user guide for common questions

### Community

- QQ group: `1084866292`
- Discord: https://discord.gg/RHeX47wvDU

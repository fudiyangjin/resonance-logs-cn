# Changelog v0.2.7

## Changes

### Custom monitoring

- Reworked custom counters. Counters can accumulate from skill casts or hits, Buff gains or consumption, movement distance, combat resources, and other events; each slot can define a target, display mode, reset action, pause state, and cooldown.
- Counters can be copied from presets, searched by skill, damage, or Buff name/ID, added to custom panels, and bound to a voice cue when a target is reached.
- Factor and season-node panels now synchronize automatically. From S4 onward, active season-node Buffs can be shown directly. Legacy custom-counter rules are cleaned up during migration, together with their panel entries and voice bindings.

### Skill cooldowns and announcements

- Skill cooldowns support multiple independent regions. Each region can be named, moved, resized, and configured with 1–10 rows or columns and adjustable icon spacing. Drag-and-swap, keyboard movement, compact layout, and loadout import/export are supported.
- Added duty skills grouped by attack, survival, support, and collection, including charge display and duty-skill icons and data.
- Resonance skills can be added to cooldown monitoring and voice announcements independently. Class, resonance, and duty skills share a maximum of 10 monitored slots, and a skill no longer needs to be shown in the cooldown panel to receive an announcement.
- Skill icons now use element-colored backplates and show skill transformations more clearly; teammate cooldowns use the same style.

### Monster monitoring and minimap

- Monster Skill monitoring now watches listed skills cast by any nearby monster, with configurable duration, order, aliases, and voice cues. The Monster Skills area is hidden by default ([@nekoyama32767](https://github.com/nekoyama32767)).
- The minimap now parses new party-mark data and shows the matching icon for marked teammates, with additional marker display settings.
- Added part of the S4 “Sky’s End, Day and Night’s End” mechanics and icons as a test feature.

### Voice

- Added HTTP voice services for OpenAI-compatible APIs, Google Cloud TTS, and custom GET forwarders, with configurable URLs, headers, bodies, response formats, and `{text}`, `{lang}`, `{voice}`, and `{secret}` placeholders.
- After adding a service, select HTTP and that provider during phrase generation or in the announcement binding; otherwise the preset voice remains active. Requests can be tested before saving, and generated audio is stored locally, so playback makes no network request and does not require a local voice model.

![HTTP voice service setup example](/images/changelog/voice_http_en.png)

### Module optimizer and builds

- Improved Windows CUDA builds by separating MSVC and MinGW CMake caches, tracking PATH changes, and preserving useful CMake diagnostics; CUDA still falls back to CPU when unavailable ([@nekoyama32767](https://github.com/nekoyama32767)).
- Updated special-attribute string handling in the module optimizer to avoid compiler encoding differences.

## Documentation

- Added the HTTP voice service setup example and usage guide.
- Added instructions for opening, filtering, and switching history records from the live DPS window.
- Updated the custom-counter, skill cooldown, duty-skill, and Monster Skill guides.

## Notes

- Legacy custom-counter rules are replaced during migration; their old panel entries and voice bindings are not retained.
- Remote HTTP services receive phrase text; keys stay in the local voice directory and are not included in shared loadouts.
- Preset, cloned, and fine-tuned voices still need a voice model. HTTP voice services do not.


### Compatibility

- If you used 0.0.2 or 0.0.3, first launch on 0.0.4-0.2.7 requires deleting `resonance-logs-cn.db` under `%LOCALAPPDATA%\resonance-logs-cn` and restarting
- 0.2.2 and 0.2.1 went through large refactors; if existing features break, please contact me promptly
- 0.2.2 changed table fields; errors on old history records are expected, new records work normally
- Voice announcements require a separate model download; the first phrase generation may take a while, but playback after that does not reload the model. HTTP voice services do not require a model

### Important

- If you modify the code and share builds without opening a PR, please change the app name, version, and other upstream identifiers so your fork is not mistaken for the original
- The close button now hides to the bottom-right; drag the hidden bar back to the corner if you have many windows
- See the HTML user guide for common questions

### Community

- QQ group: `1084866292`
- Discord: https://discord.gg/RHeX47wvDU

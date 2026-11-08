# Changelog v0.2.9

## Changes

### Skill damage display

- New "Skill Damage Display" page (main window sidebar › Skill Damage Display). It shows the damage number of each hit of the skills you choose on the game overlay ([@nekoyama32767](https://github.com/nekoyama32767)).
  - Skills are organized in skill groups, and each group has its own display area that can be dragged in edit mode. Add skills by searching for a skill name, alias or damage ID; different IDs with the same name can be added separately.
  - The skill label can be the skill name, the skill icon, or hidden. Preset icons are split into skill icons and talent icons with one tab per class; talent icons are further split into general and per-spec sections, plus a "Common" tab. The icon background colour and opacity are adjustable.
  - Damage numbers can set the font (a system font, or an uploaded .woff2 / .woff / .ttf / .otf file), font size, font weight and italic, plus fill colour (solid / gradient), inner glow, outline, outer glow and shadow. Number formats: integer, thousands separators, 万 / 亿, and K / M / B.
  - Animations: "Pop" or "Float up and fade", with display duration, gradual shrink, simultaneous display count and the scroll direction of subsequent numbers. Press "Test animation" to preview.
  - With "Combine multiple hits into total damage" on, multiple hits of the same skill in one batch are shown as their total; with it off, only the largest hit of the batch is shown. With "Combine simultaneous group damage" on, the damage of all skills in the group from one batch is added up and shown under the group name.
  - Damage display profiles follow the loadout: pick a "Damage display profile" for each loadout under Loadouts. Uploaded fonts are stored only once and shared by all skill groups.
  - Supports auto hide in daily scenes.

  ![Skill damage numbers in game](/images/changelog/v0.2.9_1.png)

- The DPS skill breakdown has a new "ID" column showing the skill damage ID, so you can look up the skill to add. It is hidden by default; turn it on under DPS Meter › Settings.

### Monster monitor

- New "Battle Roster" (Monster Monitor › Battle Roster). It lists the HP of every monster you and your teammates are fighting; turn on the "Battle Roster area" under Monster Monitor › Enable Window to show it.
  - The main target is pinned to the top with ★, and every Boss gets its own row. Normal and elite monsters show the first few by HP (5 by default); the rest are combined into small bars on a last row marked with their highest and lowest HP, so no monster is hidden however many there are.
  - "Tank mode": the header counts monsters that are not on you and whom they are attacking; those monsters all get their own row with the target at the end. "Monsters not attacking me first" puts monsters targeting someone else at the top.
  - Optionally show exact HP values and your horizontal distance, to tell apart monsters with the same name.
  - Monsters whose HP you don't care about, such as mechanic markers and scene objects, can be blocked by monster ID, across all profiles and dungeons. Pick them from "Monsters met this session" or search by name or ID. Common mechanic objects such as invisible monsters and floor markers are blocked by default.
- The Battle Roster supports "Watched skills": pick the monster skills you care about and the roster shows their state at the end of that monster's row — a grey countdown while on cooldown, amber when ready, red while casting or just cast.
  - Monsters that can use a watched skill are listed under the main target, always on their own row, without using up the rows for normal and elite monsters.
  - Cooldowns come from the game tables by default, or enter your own seconds. Open a monster under "Monsters met this session" to tick its skills directly; the cooldown, the opening cast window and the cast time are listed next to each skill.

  ![Battle Roster with watched skills at the end of a row](/images/changelog/v0.2.9_2.en-US.png)

- Entity Duration has a new debug toggle, "Show all your own entities" (Monster Monitor › Entity Duration). When on, the entity monitor area also lists, after your list entries, the entities you spawned that are not in the watch list, as `name#ID ×count` with the seconds since it appeared on the right (such as `+12s`), so you can fill in the entity ID and duration from it. Once the ID is added to the list, that row turns into a countdown.
- The Monster Skills watch list limit is raised from 32 to 128 entries.
- Fixed the hate list keeping old entries after a monster left combat and reset.

### Colour settings

- Every colour setting is now one line of colour swatch + colour value, and you can type `#38BDF8`, `38bdf8` or `rgb(56, 189, 248)` directly. Expand it to pick from a palette, the colours of the current scheme and recently used colours, so several places can get exactly the same colour.
- The Live Monitor and Monster Monitor pages have a new "Color schemes" button at the top with 6 schemes — Vivid, Ice, Amber, Jade, Violet and Muted — applied to the current loadout's game overlay panels.
  - Only name, value and progress bar colours change; font sizes, gaps and backgrounds stay. Buff alert highlights and per-column teammate buff colours are kept.
  - HP, stagger, Boss alerts and the Battle Roster keep their red, blue and amber colours in every scheme.
  - Each panel's style settings can also apply a scheme to that panel alone.
  - While some panels still use the plain white default, the page shows a hint at the top where you can apply a scheme or choose not to see it again.
- DPS Meter › Themes › Presets has a new "Recommended Style" that applies the recommended colours, table, title bar, display format, columns and history display in one click, keeping your challenge watch settings.

  ![Recommended Style](/images/changelog/v0.2.9_3.en-US.png)

- Fresh installs now use the recommended DPS style and the "Vivid" overlay colours, and new DPS profiles use the recommended style too. The preset loadouts now have colours set for every panel.

### DPS / History

- The timeline in history details now uses the class / spec colours from settings everywhere, matching the tables. You also use your spec colour, with line styles telling the instant and average curves apart; players with the same colour (such as the same spec) automatically get shifted lightness and hue. The history player table also uses spec colours now.
- In history details, right-click goes back one level while viewing a player's skill, damage taken or death details; right-clicking the overview does not return to the list.
- History details remember the teammate cast lanes, teammate curves, average curve toggle, the Buff section's expanded state / grouping / player selection, and whether the Buff coverage summary is open, across fights and restarts.

### Dungeon mechanics

- S4 "Twilight's Edge" (test feature): the first boss's Rune Wheel now draws two red circles separating the three rings, in both the regular nightmare and the gauntlet.

### Game data

- Updated the game data tables. English and Japanese Buff, skill, monster and scene names now prefer the game's official text, replacing many machine-translated names.

## Documentation

- Added the "Battle Roster" guide, covering watched skills, voice cues and blocked monsters.
- Documented the "Show all your own entities" debug toggle in Entity Duration; the "Show the Scythe Cart's remaining time" example now reads the entity ID and duration with the debug toggle first.

## Notes

- The Battle Roster area is off by default; turn it on under Monster Monitor › Enable Window. If only watched-skill voice cues are configured, the roster is still tracked in the background while the panel is off.
- Watched-skill voice cues only play for monsters on the Battle Roster. Mechanic objects that never enter the hate list are not on the roster; configure voice for those skills under Monster Monitor › Monster Skills.
- A watched skill's cooldown is the earliest it can be used; once ready, the monster's AI may not use it right away. Script-triggered skills (such as several monsters casting together) cannot be predicted and are only announced when cast, and the real cooldown can be longer after an interrupted cast.
- "Show all your own entities" only shows entities you spawned yourself; entities already present before turning it on are counted from the moment you turn it on. The toggle is saved with the profile and exported with loadouts, so remember to turn it off once you are done.
- Existing colour settings are not changed automatically; use "Color schemes" or "Recommended Style" to switch. Both overwrite the corresponding colours, and loadouts that share the same profile change together (the confirmation lists them).


### Compatibility

- If you used 0.0.2 or 0.0.3, first launch on 0.0.4-0.2.9 requires deleting `resonance-logs-cn.db` under `%LOCALAPPDATA%\resonance-logs-cn` and restarting
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

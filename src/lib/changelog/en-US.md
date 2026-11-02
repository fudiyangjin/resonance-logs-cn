# Changelog v0.2.8

## Changes

### Live monitor

- Rebuilt the class resource HUD after the in-game style and completed it for every class (Live Monitor › Enable Window › Resource sections). The resource area is split into the resource bar, resource points, shield bar and class counter, and each block can be shown / hidden and dragged separately.
  - The coloured bar on the resource bar frame is the remaining time of the class buff; Twin Striker's crimson orb, Marksman's wolf / hawk frames and Beat Performer's performance bar are shown there too.
  - The shield bar is Shield Knight's vertical shield bar during "Radiant Shield".
  - The class counter reproduces the game HUD's stack numbers, Wind Knight's wind mark, Stormblade's special thunder sigil, Twin Striker's rank letter and more. Icons that used to change with stacks in the Buff area (such as Wind Knight's "Chasing Step") are now shown here.
  - Added "Resource text" to set the size and colour of the numbers on the resource bar, resource points and shield bar.

  ![Resource bar and resource points of each class](/images/changelog/v0.2.8_1.en-US.png)

- Composite buffs have a new display mode, "Most urgent member" (Live Monitor › Buff Monitor › Composite Buffs › Display). It takes a single slot while any member is active: a missing member is shown greyed out and marked "Missing"; otherwise the member with the least time left is shown. Useful for keeping several buffs refreshed in turn, such as the Attribute Symphony variants.
  - Voice cues fire for the composite as a whole (appears, disappears, about to end). To get a cue for a single member, configure voice on that member.
  - The composite does not hide its members' own display; members that are also added to other areas keep showing there.

  ![The member that expires first is shown while all members are active](/images/changelog/v0.2.8_2.en-US.png)

  ![A missing member is reported](/images/changelog/v0.2.8_3.en-US.png)

- Skill charges now show only the number of available charges and scale with the icon, fixing charge counts that were larger than small teammate cooldown icons; the recharge time text is removed. This applies to both your own skill cooldowns and teammate cooldowns.
- Attempted fix (upgraded the Svelte framework): after switching loadouts while the game overlay was auto-hidden in town, newly gained Buffs with icons did not appear until edit mode was toggled once.

### DPS / History

- When viewing history in the live window, the top banner has a new "Buff Coverage" button. Pick a player in the player strip to see the coverage and trigger count of each Buff in that fight; players are ordered as yourself, healers, tanks, then DPS.
  - Only Buffs added under Live Monitor › Buff Coverage are recorded, and only for fights after they were added.
  - Switching to an older / newer fight keeps you on the coverage page; press the button again to return to the meter tab you came from.

  ![Buff Coverage button in the history banner](/images/changelog/v0.2.8_4.en-US.png)

  ![Buff coverage of a history fight in the live window](/images/changelog/v0.2.8_5.en-US.png)

### Monster monitor

- Monster Skills have a new "Countdown" option (Monster Monitor › Monster Skills). When enabled, the display time is used as a countdown with the remaining seconds and a progress bar, and the row disappears when it reaches zero.
  - Use it to announce "skill B always follows skill A after N seconds": add A to the list, set its alias to B and set the display time to the interval.
- The Monster Skills panel style adds column gap, value colour, progress bar colour and progress bar opacity.

### Dungeon mechanics

- The background opacity of the map panel and Mechanic Calls can be set separately (Dungeon Mechanics › Minimap Mechanics › Panel Visibility). At 0 the map keeps only lines, mechanic areas and player dots, and Mechanic Calls keeps only text.
- S4 "Twilight's Edge" (test feature)
  - Added voice callouts for its mechanics, configurable under Dungeon Mechanics › Minimap Mechanics › Mechanic voice callouts ([@nekoyama32767](https://github.com/nekoyama32767)).
  - Fixed the first boss's Rune Wheel runes never being shown. Added the gauntlet mechanics: the Rune Wheel marks slots that are being lit, Golden Chasers use their rune colour, and Mechanic Calls lists the boss's rune lighting order and the charge interval.
  - Third boss Celestial Collision: two-orb rounds now predict the blast position and time from when the orbs appear; three-orb rounds only draw the ① ② positions and route, with a countdown to the 1st / 2nd blast in Mechanic Calls (two light orbs and one dark orb).

  ![First boss Rune Wheel and gauntlet Mechanic Calls](/images/changelog/v0.2.8_6.png)

  ![The boss's rune lighting order](/images/changelog/v0.2.8_7.png)

### Voice

- Announcements whose text is "Auto-generated" or "Custom text" can pick their own "Generation voice" (a voice or an HTTP service) for that entry; "Custom text" can also pick a "Generation language", and has a "Generate audio" button ([@nekoyama32767](https://github.com/nekoyama32767)).
- "Generate missing voices" now reports how many entries succeeded and failed; the reason for a failure is shown under the announcement that failed.
- Fixed the local voice model occasionally not stopping on short phrases, which made memory / VRAM usage explode. Generation length is now limited by text length and retried automatically up to 3 times.
- Attempted fix (upgraded the rodio / cpal audio playback libraries): announcements kept playing on the old device after switching to headphones or another output device while the app was running.

## Documentation

- Added the "Generate cues with an online Fish Audio voice" example and documented per-entry generation voice / language.
- Added the "Show only the Attribute Symphony that needs refreshing with 'most urgent member'" example.
- Added the "Check a history fight's Buff coverage in the live window" example, and documented it on the History and Buff Coverage pages.
- Updated the guides for resource sections (resource bar and class counter examples for every class), Monster Skill countdowns, and the Dungeon Mechanics background opacity.

## Notes

- The class counter is no longer shown in the Buff area. It is now the "Class counter" section of the resource area and appears only when the Resource Monitor Area is enabled. New sections such as the shield bar and class counter first appear below the resource area's original position; drag them into place in edit mode.
- "Most urgent member" does not hide its members' own display. If you want a single slot, remove those members from other areas.


### Compatibility

- If you used 0.0.2 or 0.0.3, first launch on 0.0.4-0.2.8 requires deleting `resonance-logs-cn.db` under `%LOCALAPPDATA%\resonance-logs-cn` and restarting
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

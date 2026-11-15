# Changelog v0.3.1

## Changes

### Skill damage display

- Skill groups have a new "Display mode". "Merged display" is the existing behaviour; the new "Continuous display" shows a single number that keeps adding up and plays a final total animation when the window ends ([@nekoyama32767](https://github.com/nekoyama32767)).
  - The "Window rule" decides when accumulating starts and when it settles:
    - Rolling window: starts on a hit from a skill in the group, restarts its timer on every hit, and settles once no new hit arrives within the "Continuous window" seconds.
    - Skill-triggered window: pick the "Opening damage skills" and "Closing damage skills" (both allow several; with no opening skill, any skill in the group opens it). A hit from a closing skill settles at once, otherwise the "Timeout" settles it. Another hit from an opening skill restarts the timer and keeps the damage and combo count so far.
    - Channeling preset: "Frost Ray" and "Infusion (Verdant Oracle)" for now. The window follows your own cast start and end, with no timeout; "Window closing delay" (0–1 seconds) keeps accumulating for a moment after the cast ends before settling.
  - With "Accumulate all your damage" on, damage from your other skills inside the window also counts toward the total and the combo count, but only hits from skills in the group open or refresh the window.
  - The running total and the final total each have their own animation, and the final total has its own display time.
  - The combo count can be shown as `1 HIT` or `×1`, above, below, left or right of the number, with adjustable spacing.
- Skill groups have a new "Show all your damage" switch: all of your own skill damage counts as the group's damage, so you don't have to add skills one by one. It works with both display modes.
- With "Combine multiple hits into total damage" off, every hit is now shown on its own (previously only the largest hit of the batch was shown).

### Voice

- "x seconds left" and "x seconds before ready" announcements have two new switches next to the seconds, both off by default:
  - "Finish by then": start earlier by the length of the audio so the line has finished with x seconds left (a 3-second line set to 5 seconds starts with 8 seconds left).
  - "Count down": after the line, count the seconds down, each digit on its own second, from 10 at most. Together with "Finish by then" the count starts at x; on its own it starts at the whole seconds left once the line is over.
  - A countdown plays over other announcements; neither waits for the other. Only one countdown counts at a time, and a higher-priority one can take over.
  - A countdown follows the real remaining time: when the buff is refreshed, the cooldown is reduced or the mechanic re-triggers, the remaining digits stop at once, and the line and the count play again when the new time reaches x seconds. If the target is gone, the count just stops.
- New "Countdown Digits" card at the bottom of Voice › Match Alerts. The digits ship with the app; set "Digits" to "Generate my own" to generate a set in your own voice. Your digits are kept apart from the preset ones, so you can switch back to "Preset" at any time; a digit that is not generated yet still plays the preset one.

### Monster monitor

- Battle Roster watched-skill voice has a new "Broadcast x seconds before ready" event (Monster Monitor › Battle Roster › Watched skills › Voice Broadcast). It follows the grey countdown at the end of the row and plays when x seconds are left.
  - Both the battle-start window and the cooldown after a cast are announced.
  - Each monster is timed on its own; monsters that come due within 2 seconds of each other share one line.
  - Works with "Finish by then" and "Count down".
  - A monster that dies or leaves the roster is no longer announced, and a countdown in progress stops; a monster that casts again early is timed from the new cast.
  - Like "Broadcast on trigger", it keeps playing while the roster panel is hidden or "Enable Monster Monitor" is off.

### Live monitor

- The class selector moved to "Profiles" at the top of the page (Live Monitor › Profiles › Profile class), and the skill CD and class resources share this one class. "Change profile class" in the skill CD and resource settings jumps there, and the current class stays visible when resources are turned off.
  - When several loadouts share one monitor configuration, the sharing loadouts are listed. When changing class you can pick "Copy for this loadout only" so the other loadouts keep the original configuration. "Copy" at the top also copies the whole monitor configuration for the current loadout only.
  - Before changing class, if there are monitored skills or skill voices, the number about to be cleared is shown first; cancelling changes nothing. Other monitor content and resource layouts are kept.
- Twin Striker's Crimson Mark orb is split out of the resource bar into its own "Crimson Mark orb" section that can be dragged and scaled on its own. To show only the orb, hide the resource bar, resource points and class counter.

### DPS

- Challenge Watch is now organised in groups (DPS Meter › Challenge Watch), one per challenge. Groups belong to the current loadout and travel with it when you export the loadout.
  - Click a built-in preset to add it as a group, or click "New group" and search under "Add damage" by mechanic, damage name or damage ID. IDs match by prefix, e.g. "#110098" (the `#` is optional), and long result lists can be paged; type a full ID and press Enter to add a damage the tables don't name.
  - Every damage in a group shows as "name #ID", so different damages that share a name stay distinguishable.
  - Click "Save as my preset" on a group to add it in one click from "My presets" in any loadout. A preset is only a template: adding it gives you an independent group, and later changes to the preset don't affect groups already added. After editing a group that came from one of your presets, click "Update my preset" to save the changes back.
  - The red triangle's tooltip lists the damage taken by group, each with its name, ID and hit count.
- Healing and damage-taken skill details now have an "ID" column too, in both Live and History. Like DPS, it is hidden by default; turn it on under DPS Meter › Settings in "Healing (Skill Details) Columns" and "Damage Taken (Skill Details) Columns". In damage taken, the ID tells apart monster skills with the same name and helps you find the damage IDs to add to Challenge Watch.
- Skills with the same name in the skill details show `#ID` after the name to tell them apart; skills outside a skill group (such as monster damage) now do this too. With the ID column on, the ID is no longer repeated after the name (compact mode only has the name cell, so the ID still shows there).
- New "Excluded Targets" under DPS Meter › Settings › Live. Damage dealt to these monsters is left out of DPS stats and history; hitting only them does not start an encounter, and the training dummy's "First Monster Hit" never locks onto them.
  - Built-in preset "Ravine Aberration dummy (Arcane! Sharkspin Torrent)" (#3000090), added with one click. This battle imagine places a hostile dummy that passes part of the damage it takes on to nearby monsters, so hitting the dummy itself is not real output. The damage it passes on still counts for the summoner and shows in the skill list as the dummy passive.
  - You can also search by name or monster ID; a numeric ID missing from the tables can be added directly.
  - The list is saved in the DPS settings profile and follows loadout switching and export.

### Packet capture

- Reworked packet capture: receiving packets and reassembling / parsing them now run on separate threads, so a busy parser or UI no longer slows down capture, reducing packet loss under heavy load (such as the game downloading in the background or a proxy being on).
- Fixed stream reassembly getting stuck after retransmitted packets, which could leave later combat data missing or duplicated for a long time.
- Game connections are told apart more accurately: other connections of the game process, such as downloads, are recognised and ignored at their start instead of being parsed.
- Npcap mode turns off promiscuous mode and filters out acknowledgement-only packets in the driver.
- The log records capture statistics every minute. When the game holds connections but no game data has been captured for a long time, the log suggests checking the Npcap adapter (pick the TUN / VPN adapter when a proxy is on).

## Documentation

- Battle Roster: documented "Broadcast x seconds before ready".
- Voice: documented "Finish by then", "Count down", "Countdown Digits" and the new catch-up rule.
- Challenge Watch: rewritten for groups and "My presets".
- DPS display settings: added "Excluded Targets".
- Live Monitor: documented the "Profiles" card and class selection at the top; Enable Window & Layout lists the new "Crimson Mark orb" section.
- Added the "Skill Damage Display" guide, covering both display modes, window rules and number styles; Themes & Appearance now covers the "Recommended style".
- New examples: resource sections and the Lifebind flower countdown, skill CD areas, attributes during burst, tank shields, every monster's HP on the Battle Roster, party buffs, teammate CDs by the party panel, avoiding aggro, bursting on break, elite cast warnings, setting up the monster overlay for your role, applying the recommended style, ultimate damage numbers and the Frost Ray total.
- Corrections: the Monster Skills list holds up to 128 skills; the Teammate Fantasy Area is hidden by default; switching class for skill CD voice now points to the profile class at the top of the page.

## Notes

- The catch-up rule for "x seconds left" and "x seconds before ready" changed: after an update (a cooldown reduction, a shortened buff, a re-triggered mechanic) the announcement plays right away only if the remaining time just passed x seconds, by no more than 1.5 seconds. Nothing is played if it jumped further (set to 5 seconds with only 3 left), or if the line waited more than 1.5 seconds behind another one.
- "Finish by then" needs the length of the audio; until the line is generated it is not moved earlier.
- After updating, the Crimson Mark orb starts below the resource bar; drag it to where you want it. The resource bar area now only covers the bar itself. For Twin Striker, resource points and the class counter without a saved position move down one slot.
- Changing class in the Live Monitor clears monitored skills and skill voices. When several loadouts share one configuration the change applies to all of them; pick "Copy for this loadout only" to leave the others alone.
- Existing forbidden damages are converted to groups automatically: those belonging to a built-in preset go into that preset's group, the rest into one unnamed group.
- "Excluded Targets" is empty by default; add monsters yourself. The damage-number overlay and counters are unaffected and still show and count these hits. Changes apply to later hits only; saved history records do not change.
- Like the grey countdown at the end of the row, the Battle Roster's "Broadcast x seconds before ready" marks the earliest possible cast; the monster may wait longer. When x is not shorter than the cooldown or the battle-start window itself, that stretch is not announced. A skill with neither cooldown data nor a battle-start window is never announced; enter a cooldown to enable it.


### Compatibility

- If you used 0.0.2 or 0.0.3, first launch on 0.0.4-0.3.1 requires deleting `resonance-logs-cn.db` under `%LOCALAPPDATA%\resonance-logs-cn` and restarting
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

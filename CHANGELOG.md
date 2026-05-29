# Changelog

## v1.0.7 - Global

- Updated package, Tauri, Rust crate, lockfile, and window-title metadata for the `1.0.7` release.
- Refreshed generated parser data and icon coverage from the latest game files, including skill, buff, item, monster, scene, modifier, resonance/imagine, class/spec, talent, and Phantom Factor assets.
- Added generated spec icon output and wired Name-Spec display modes to show spec icons in live, history, shared player info, and death replay views.
- Tinted spec icons with the same role palette as class icons: DPS red, support/healer green, and tank blue.
- Expanded skill monitor class/spec coverage and localization support so more skills, talents, and icons resolve through generated data instead of hardcoded/manual rows.
- Cleaned up skill monitor hover descriptions with readable generated tooltip sections, removed trailing tips text, fixed missing descriptions on first app start, and replaced native browser titles with stable app-owned tooltips.
- Fixed an overlay startup edge case where monitor settings could show the overlay window after a later settings write even when `Start with App` was off.
- Improved resonance skill search by matching description text too, making imagine/resonance entries easier to find when the visible skill name is not the searched name.
- Fixed several localization and naming fallbacks, including Twin Axe no longer displaying as Flame Berserker when only the class fallback is known.
- Improved Name-Spec recovery for nearby players by inferring specs from selector/passive evidence even when WIP modifier parsing is disabled.
- Fixed live ability-score/season-strength spacing so abbreviated `k` values no longer clip in player rows.
- Fixed Buff Uptime tracking so it works independently from Buff Monitor selections and refreshes immediately when monitor settings change or clear.
- Fixed missing season strength in live/player parse rows by retaining positive identity attrs on encounter entities and ignoring zero/default attr-cache values when a known value already exists.
- Kept WIP modifier parsing behind the explicit opt-in switch and tightened the disabled path so live parsing skips factor/effect source derivation, selected-factor cache sync, and modifier temp-attr source lookups when modifier reports are off.
- Improved modifier source/reportability handling for factor, talent, and spec-owned rows while keeping unresolved modifier work marked as WIP.
- Restored scrollability for Module Calculator filter settings.
- Built the `Resonance Logs - Global_1.0.7_x64-setup.exe` NSIS installer; updater artifacts still require `TAURI_SIGNING_PRIVATE_KEY` when publishing.

## v1.0.6_beta5 - Global Beta

- Stabilized monitor runtime startup so saved monitor settings apply even when the backend snapshot is corrupt or stale.
- Hardened live reset behavior so parsing resumes cleanly and stale meter totals clear immediately.
- Improved history responsiveness with compact persisted entity summaries and lighter default history loads.
- Fixed boss/elite aggregate display and filtered Rock Serpent crystal mechanics out of boss metrics.
- Restored monster-monitor event routing in the embedded game overlay.
- Fixed the health and shield overlay area localization and HP refresh behavior.
- Kept WIP modifier analysis behind the explicit opt-in switch.

## v1.0.6_beta4 - Global Beta

- Disabled WIP modifier analysis by default to reduce live/history CPU cost while modifier attribution work continues.
- Kept the Modifiers history tab visibly marked as WIP.
- Improved installed-build parser-data lookup for generated names and monitor support files.
- Added monitor/runtime visibility fixes and history loading optimizations.
- Fixed history boss/elite aggregate display so Total boss columns use Boss:/Elite: targets while per-target views stay per-target.

## v1.0.6_beta3 - Global Beta

- Renamed the local app identity to Resonance Logs - Global.
- Changed package, Tauri, Rust crate, window title, log, and database naming to the global line.
- Redirected update checks and release links to `donneeee/resonance-logs-global`.
- Added first-launch migration from the legacy CN AppData/database paths into the new global paths without overwriting existing global files.
- Marked the Modifiers history tab as WIP while modifier attribution accuracy work continues.

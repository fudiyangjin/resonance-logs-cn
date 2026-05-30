# Changelog

## v1.0.8 - Global

- Kept Skill CD hover cards inside the app window and widened them so longer descriptions are readable without clipping offscreen.
- Replaced native `title` hover text with persistent app-rendered tooltips globally, so pressing keys such as Ctrl no longer dismisses hover text during screenshots.
- Added fallback descriptions for Rage Cleave variant IDs and a no-source notice for Lethal Shot when the game data exposes the skill name but no standalone tooltip text.
- Localized the Shield Knight Shattered Illusion child buff damage row so Yumiko parses no longer show the raw `虚妄裁定-子BUFF技能` label in skill details.
- Added an optional Dynamic Live Window setting under Settings > Themes > Live with enable/disable and a 5-20 visible-player cap; live tables grow to the cap and the player table becomes scrollable beyond it.
- Added Live-only General settings to auto-hide the live window until damage is detected, show it when live damage appears, and hide it again after a configurable no-new-damage delay.
- Localized the new live parser UI settings for Dynamic Live Window, Clear Meter on Scene Change, Auto-hide Live Window, and Auto-hide Delay across supported UI locales.
- Moved the live Boss section onto its own header row in both classic and custom header layouts, widened the spacing between T.DMG and T.DPS, and filtered boss HP display to the active/top-HP boss tier so low-HP mechanics no longer crowd out the real encounter boss.
- Localized design-only shield buff names used by the health/shield overlay, including Life Barrier Shield, so the live overlay follows the selected locale instead of showing raw Chinese design labels.
- Hardened Module Calculator startup when the game/module data is unavailable, with separate refresh/calculation/GPU loading states, timeouts, and friendlier no-data errors.
- Hardened Module Calculator against GPU driver probe hangs, falling back to CPU mode when GPU availability cannot be confirmed, and reduced generated-data build chunks by loading bundled skill names as a static JSON asset.
- Deferred automatic Module Calculator GPU checks until module data is synced, added a manual GPU recheck for driver updates, and removed the native one-shot GPU probe cache so a stale or stuck first probe cannot poison later checks.
- Stopped Module Calculator from auto-starting a module-data refresh on page open, kept remembered profile filters from touching transient refresh state, and added a refresh watchdog so a hung module-data read cannot leave the page stuck on "Checking module data...".
- Changed Module Calculator Refresh Data to return a lightweight module status/count response instead of the full module list, so successful backend parses can update the UI without getting stuck after module deserialization.
- Made Module Calculator Refresh Data recover from stale calculation state and show its current refresh phase in the Data Status card, with backend breadcrumbs for status request start, worker start, parse completion, and count readiness.
- Hardened the Module Calculator status response parser so Refresh Data accepts camelCase, snake_case, or generated-result payloads and reports unexpected payloads visibly instead of silently leaving the UI at Not Synced.
- Deduped Module Calculator profile persistence so synced module counts cannot trigger repeated settings writes, and decoupled Refresh Data from GPU probing so the refresh button only refreshes module status; GPU checks now run from the manual Check GPU action.
- Reworked Module Calculator filter/profile memory to save from explicit control-change callbacks instead of a broad page-level reactive effect, keeping remembered filters out of the Refresh Data response path.
- Temporarily disabled Module Calculator profile-backed filter memory while investigating the page-entry lock, so entering the tool and refreshing data no longer reads or writes the shared skill-monitor profile store.
- Restored Module Calculator filter memory through a separate lightweight per-profile Module Calculator settings store, avoiding shared skill-monitor profile writes that could kick live runtime sync while the calculator page is open.
- Reduced noisy live Skill CD dev logging so large cooldown packets no longer dump hundreds of IDs/payload rows into normal app logs while the parser is active.
- Fixed Windows CUDA native builds by moving the CMake CUDA scratch/build directory out of Cargo's long build-script hash path, preventing MSBuild FileTracker path failures and restoring the `module_optimizer_cuda` static library link.
- Fixed Unbound Meteor recount icons so live/history skill rows use the actual Flame Berserker skill icon instead of the basic attack icon.
- Fixed Formless Flame Slash and Great Crimson Lotus proc icons so their recount and detail rows use the talent icons that enable them.
- Added a Skill CD overlay display option to hide tracked skill slot outlines and active-skill glow while keeping the current look enabled by default.
- Hardened update handling so Global ignores stale CN release payloads and only shows update prompts from `donneeee/resonance-logs-global`.

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

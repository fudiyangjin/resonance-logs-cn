# Changelog v0.1.5

## Changes

### DPS

- Improved overall latency and responsiveness
- Removed WinDivert logic and refactored packet capture
- Fixed lucky-rate calculation and display
  - Lucky trigger rate is now tracked per skill
  - Lucky-rate calculation excludes hits from Lucky Strike
- Added block rate and lucky block rate display for Tank
- Tank live and history views now aggregate by monster first; click a monster to view detailed incoming skill damage
- Updated training dummy mode
  - Removed frontend target selection; dummy mode now auto-detects elite attack dummy or guardian dummy
  - Flow changed to `waiting -> active -> finished`; reset returns to waiting
  - Live view no longer refreshes after dummy mode finishes, making it easier to inspect results directly
- Added live-server data up to the Fairy Tail version, including buffs, scenes, and new fantasies. Thanks @YozoraHoshi

### Live Monitor

- Added “New Factor Zone” in custom monitor to auto-configure current character factor effects
  - True Factor A energy
  - True Factor B energy
  - True Factor A buff effect
  - True Factor B buff effect
- Factor buff effect names can be renamed in Live Monitor -> Buff Monitor -> Buff Alias Settings
- True factor counters can be renamed from the corresponding factor zone display-name search
- Fixed Denver self-damage not entering Tank records, which caused related counter errors
- Added true factors: Thunder Shadow, Soul, Marksman, Ice Mage, Wind, Shield, Giant Blade
- Added false factors: Thunder Shadow, Wind, Dual Axe, Soul, Marksman, Shield, Giant Blade
- Added CDs for Ensemble, Center of Attention, Ascension, and Infinite Fantasy

### Monster Monitor

- Deprecated `ExtraBuffMonitoredMonsters.json`; monster buffs and threat now automatically use your current primary target
- Added teammate buff monitoring
- Improved live monitor ghost-layer display
- Monster buff monitor can now show all buffs applied by yourself via “Self Only”

## Notes

### Compatibility

- If you used 0.0.2 or 0.0.3, first launch on 0.0.4-0.1.4 requires deleting `resonance-logs-cn.db` under `%LOCALAPPDATA%\resonance-logs-cn` and restarting
- 0.1.5 removes WinDivert packet capture; users who previously used WinDivert should install Npcap
- 0.1.5 changes instance storage keys from uid to uuid and refactors packet capture; report logs if issues occur
- 0.1.5 adds new statistic fields, so old history records are no longer compatible for display
- Some newly added factors were not fully self-tested; please report abnormal behavior

### Important

- If you fork without submitting a PR, change app name, version, and upstream branding before sharing
- Close button hides to bottom-right; drag hidden bar contents to bottom-right to show them
- FAQ is available in the manual HTML

### Community

- `https://discord.gg/UpmhgdZP`

# 1

**Commit message**

```text
ci: add automated build and GitHub release workflow
```

**Commit description**

```text
- Add GitHub Actions workflow to automatically build the application on every push
- Automatically generate release tags in the format vYYYY.MM.DD-r<run_number>
- Automatically create GitHub Releases
- Upload NSIS installer and updater artifacts
- Generate and upload a portable ZIP package
- Upload the standalone executable for portable use
- Cache Node.js and Rust dependencies to speed up builds
- Use the default GitHub token to push tags and publish releases
```

# 2

## Documentation Improvements

This update significantly improves the documentation entry point and makes it more accessible for international users.

### What's changed

* Translated the documentation index from Simplified Chinese to English.
* Added a cleaner, more organized README layout.
* Added quick navigation buttons for:

  * `README.md`
  * `README_EN.md`
  * `README_CN.md`
  * `CHANGELOG.md`
  * `CHANGELOG_FORK.md`
* Added a language selection table for all available documentation.
* Added preview images for major features, including:

  * Compact Theme
  * Theme Settings
  * Accuracy Test
  * Dungeon Mechanics Minimap
  * DPS Overlay UI
  * Language Settings
* Expanded the documentation build instructions.
* Improved explanations for HTML generation and single-language builds.
* Added documentation maintenance guidelines for shared images and UI placeholder localization.
* Added GitHub callout blocks:

  * **NOTE**
  * **TIP**
  * **IMPORTANT**
  * **WARNING**
  * **CAUTION**
* Improved formatting, readability, and navigation throughout the documentation.

This commit focuses entirely on documentation quality and does not introduce any application code changes.

# 3


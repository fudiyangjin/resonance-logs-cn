#1

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

#2

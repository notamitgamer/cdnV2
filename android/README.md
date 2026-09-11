# amit/cdn — Android app

A thin native WebView shell around the live web UI at
`https://cdn-zt7p.onrender.com`. There's no local caching or sync logic —
files and folders shown in the app are exactly what the server renders,
live, same as the website.

Features:
- Pull-to-refresh to re-fetch the current listing
- Downloads route through Android's system Download Manager (land in
  the normal Downloads folder, with a progress notification)
- Dark theme matching the site
- Back button navigates WebView history before exiting

## Building locally

```
cd android
./gradlew assembleRelease
```
(Or `gradle assembleRelease` if you don't have a wrapper jar committed.)

The APK is signed with the Gradle debug keystore — fine for personal/
sideloaded use. For a Play Store release, swap in a real signing config.

## Automated builds

Push a tag matching `android-v*` (e.g. `android-v1.0.0`) and the
`.github/workflows/android-release.yml` workflow builds the APK on
GitHub's runners and attaches it to a new GitHub Release automatically.
You can also trigger it manually from the Actions tab (workflow_dispatch).

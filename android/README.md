# amit/cdn for Android

A native Kotlin app (Jetpack Compose, Material 3) for browsing the CDN and copying links. It uses the same
HTTP API as the website (`/api/tree`), so nothing on the server changes.

Four tabs along the bottom:

- **Files:** browse folders, filter, open a file, copy its CDN page / raw / download link.
- **Search:** finds files and folders by name across the whole CDN, as you type.
- **Upload:** pick files from the phone (or paste a link) and upload to `uploads` or `third-party`, then copy the new links.
  Same endpoints and rules as the website (`/api/put`, `/api/put-url`), so the server limits apply.
- **History:** what this phone uploaded and opened. Stored on the phone only.

Share-to-CDN: use Share in any app and pick **amit/cdn**. Files go straight to the Upload tab; a shared web link is
filled in for "From a link".

## Get the APK

Every merge to `main` that touches `android/` publishes a **Release** with the APK attached
(`amit-cdn-<version>.apk`). Open the Releases page, download it and install it (allow "install unknown apps").
Pull requests and manual runs still upload the APK as the `amit-cdn-debug-apk` workflow artifact.

It is a debug build, signed with a throwaway key, so installing a newer one over an older one may need an uninstall first.

## Build locally

Open `android/` in Android Studio (it creates the Gradle wrapper for you), or with Gradle 8.10+ and JDK 17:

    gradle :app:assembleDebug

## Point it at another deployment

Edit `app/src/main/java/dev/amit/cdn/Config.kt`.

## Layout

    Config.kt         CDN and raw base URLs
    CdnApi.kt         /api/tree with an on-disk copy and ETag, so reopening is nearly free
    Tree.kt           folder listing built from the flat file list, link building, search
    UploadApi.kt      multipart upload and upload-from-link
    History.kt        uploads and opened files, saved as one small JSON file
    CdnViewModel.kt   loading, upload and history state; handles shared files
    Theme.kt          the site's dark tokens, square corners
    MainActivity.kt   bottom tabs and the Files tab
    SearchScreen.kt   HistoryScreen.kt   UploadScreen.kt   FileScreen.kt

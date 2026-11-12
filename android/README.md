# amit/cdn for Android

A native Kotlin app (Jetpack Compose, Material 3) for browsing the CDN and copying links. It uses the same
HTTP API as the website (`/api/tree`), so nothing on the server changes.

**Phase 1 (this folder):** browse folders, filter, open a file, copy its CDN page / raw / download link.
Planned: upload, history, search, share-to-CDN.

## Get the APK

Every push that touches `android/` runs the **Android** workflow. Open the run on GitHub, download the
`amit-cdn-debug-apk` artifact, unzip it and install `app-debug.apk` on your phone (allow "install unknown apps").

## Build locally

Open `android/` in Android Studio (it creates the Gradle wrapper for you), or with Gradle 8.10+ and JDK 17:

    gradle :app:assembleDebug

## Point it at another deployment

Edit `app/src/main/java/dev/amit/cdn/Config.kt`.

## Layout

    Config.kt         CDN and raw base URLs
    CdnApi.kt         /api/tree with an on-disk copy and ETag, so reopening is nearly free
    Tree.kt           folder listing built from the flat file list, link building
    CdnViewModel.kt   loading state
    Theme.kt          the site's dark tokens, square corners
    MainActivity.kt   screens: folder list, file sheet with copy buttons

package dev.amit.cdn

/** Where the CDN lives. Change these lines to point the app at another deployment. */
object Config {
    const val CDN_BASE = "https://cdn.amit.is-a.dev"
    const val RAW_BASE = "https://raw.cdn.amit.is-a.dev"

    // Info pages, opened in an in-app browser tab so the app never holds a second copy of the text.
    const val DOCS_URL = "$CDN_BASE/documentation"
    const val SYNC_DOCS_URL = "$CDN_BASE/gh-sync"
    const val PRIVACY_URL = "$CDN_BASE/privacy"
    const val TERMS_URL = "$CDN_BASE/terms"
}

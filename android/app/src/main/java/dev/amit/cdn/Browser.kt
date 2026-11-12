package dev.amit.cdn

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.widget.Toast
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent

/** Opens a page in an in-app browser tab (dark, matching the app); falls back to the default browser. */
fun openInBrowser(context: Context, url: String) {
    val colors = CustomTabColorSchemeParams.Builder()
        .setToolbarColor(0xFF1E1F23.toInt())
        .build()
    val tab = CustomTabsIntent.Builder()
        .setColorScheme(CustomTabsIntent.COLOR_SCHEME_DARK)
        .setDefaultColorSchemeParams(colors)
        .build()
    try {
        tab.launchUrl(context, Uri.parse(url))
    } catch (e: Exception) {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }
}

fun shareLink(context: Context, title: String, url: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, title)
        putExtra(Intent.EXTRA_TEXT, url)
    }
    context.startActivity(Intent.createChooser(send, "Share link"))
}

/** Copies text to the clipboard. Android 13 and newer show their own "copied" notice, older ones need ours. */
fun copyText(context: Context, label: String, value: String) {
    val manager = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    manager.setPrimaryClip(ClipData.newPlainText(label, value))
    if (Build.VERSION.SDK_INT < 33) Toast.makeText(context, "Copied", Toast.LENGTH_SHORT).show()
}

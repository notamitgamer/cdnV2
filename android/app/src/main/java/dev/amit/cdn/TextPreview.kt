package dev.amit.cdn

import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okio.Buffer

/** How much of a file the in-app preview reads. Bigger files show their start and offer the full file in the browser. */
const val PREVIEW_LIMIT = 64 * 1024

sealed interface PreviewResult {
    data class Text(val text: String, val truncated: Boolean) : PreviewResult
    data object NotText : PreviewResult
    data class Failed(val message: String) : PreviewResult
}

private val previewClient = OkHttpClient()

/**
 * Reads the start of a file and decides whether it is text. Asks for a byte range, and stops reading at
 * [PREVIEW_LIMIT] even if the server sends the whole file. A NUL byte in the first 8 KB means "not text".
 */
suspend fun loadTextPreview(url: String): PreviewResult = withContext(Dispatchers.IO) {
    try {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", Config.USER_AGENT)
            .header("Range", "bytes=0-${PREVIEW_LIMIT - 1}")
            .build()
        previewClient.newCall(request).execute().use { r ->
            if (!r.isSuccessful) return@use PreviewResult.Failed("The server answered ${r.code}")
            val source = r.body?.source() ?: return@use PreviewResult.Failed("The server sent an empty answer")

            val out = Buffer()
            var remaining = PREVIEW_LIMIT.toLong()
            while (remaining > 0) {
                val n = source.read(out, remaining)
                if (n == -1L) break
                remaining -= n
            }
            val bytes = out.readByteArray()
            val totalFromRange = r.header("Content-Range")?.substringAfterLast('/')?.toLongOrNull()
            val truncated = !source.exhausted() || (totalFromRange != null && totalFromRange > bytes.size)

            if (bytes.take(8000).any { it == 0.toByte() }) return@use PreviewResult.NotText
            PreviewResult.Text(String(bytes, Charsets.UTF_8).removePrefix("﻿"), truncated)
        }
    } catch (e: Exception) {
        PreviewResult.Failed(e.message ?: "Could not load the preview")
    }
}

/**
 * Shows the start of a text or code file inside the app. [mustBeText] is true when the extension says
 * "text"; for unknown types a binary file just falls back to the plain "no preview" message.
 */
@Composable
fun TextPreview(rawUrl: String, size: Long, mustBeText: Boolean) {
    val context = LocalContext.current
    var result by remember(rawUrl) { mutableStateOf<PreviewResult?>(null) }
    LaunchedEffect(rawUrl) { result = loadTextPreview(rawUrl) }

    val border = MaterialTheme.colorScheme.outlineVariant
    val muted = MaterialTheme.colorScheme.onSurfaceVariant

    when (val r = result) {
        null -> Row(
            Modifier.fillMaxWidth().border(1.dp, border).padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            Text("Loading preview…", color = muted, fontSize = 13.sp)
        }
        is PreviewResult.Text -> {
            val vertical = rememberScrollState()
            val horizontal = rememberScrollState()
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SelectionContainer {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .border(1.dp, border)
                            .heightIn(max = 420.dp)
                            .verticalScroll(vertical)
                            .horizontalScroll(horizontal)
                            .padding(12.dp),
                    ) {
                        Text(
                            r.text.ifEmpty { "(empty file)" },
                            fontFamily = FontFamily.Monospace,
                            fontSize = 12.sp,
                            lineHeight = 17.sp,
                            softWrap = false,
                        )
                    }
                }
                if (r.truncated) {
                    val of = if (size > 0) " of ${formatSize(size)}" else ""
                    Text("Showing the first ${formatSize(PREVIEW_LIMIT.toLong())}$of.", color = muted, fontSize = 12.sp)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(
                        onClick = { copyText(context, "Preview", r.text) },
                        modifier = Modifier.weight(1f),
                    ) { Text(if (r.truncated) "Copy shown text" else "Copy text") }
                    if (r.truncated) {
                        OutlinedButton(
                            onClick = { openInBrowser(context, rawUrl) },
                            modifier = Modifier.weight(1f),
                        ) { Text("Open full file") }
                    }
                }
            }
        }
        PreviewResult.NotText -> Message(
            if (mustBeText) "This file doesn't look like text, so there is no preview." else "No preview for this file type.",
            border,
            muted,
        )
        is PreviewResult.Failed -> Column(
            Modifier.fillMaxWidth().border(1.dp, border).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Could not load the preview: ${r.message}", color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
            OutlinedButton(onClick = { openInBrowser(context, rawUrl) }) { Text("Open in browser") }
        }
    }
}

@Composable
private fun Message(text: String, border: androidx.compose.ui.graphics.Color, muted: androidx.compose.ui.graphics.Color) {
    Column(Modifier.fillMaxWidth().border(1.dp, border).padding(16.dp)) {
        Text(text, color = muted, fontSize = 13.sp)
    }
}

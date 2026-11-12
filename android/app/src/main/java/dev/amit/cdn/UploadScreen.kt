package dev.amit.cdn

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Upload files from the phone (or from a web link) to the CDN, then copy the new links. */
@Composable
fun UploadScreen(
    ui: UploadUi,
    onPicked: (List<Uri>) -> Unit,
    onRemove: (Uri) -> Unit,
    onFolder: (String) -> Unit,
    onUseUrl: (Boolean) -> Unit,
    onUrlText: (String) -> Unit,
    onUpload: () -> Unit,
    onOpenFile: (String) -> Unit,
    onNavigate: (String) -> Unit,
) {
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        onPicked(uris)
    }
    val context = LocalContext.current
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val hasVideo = !ui.useUrl && ui.picked.any { isBlockedVideo(it.name) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Files or link
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            Choice("From this phone", selected = !ui.useUrl, modifier = Modifier.weight(1f)) { onUseUrl(false) }
            Choice("From a link", selected = ui.useUrl, modifier = Modifier.weight(1f)) { onUseUrl(true) }
        }

        // Folder
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Folder", fontSize = 12.sp, color = muted)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                UPLOAD_FOLDERS.forEach { f ->
                    Choice(f, selected = ui.folder == f, modifier = Modifier.weight(1f)) { onFolder(f) }
                }
            }
        }

        if (ui.useUrl) {
            OutlinedTextField(
                value = ui.urlText,
                onValueChange = onUrlText,
                singleLine = true,
                label = { Text("File link (https://…)") },
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            OutlinedButton(onClick = { picker.launch("*/*") }, modifier = Modifier.fillMaxWidth(), enabled = !ui.busy) {
                Text(if (ui.picked.isEmpty()) "Choose files" else "Add more files")
            }
            ui.picked.forEach { p ->
                val video = isBlockedVideo(p.name)
                Row(
                    Modifier
                        .fillMaxWidth()
                        .border(1.dp, if (video) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outlineVariant)
                        .padding(start = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f).padding(vertical = 8.dp)) {
                        Text(p.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (video) {
                            Text("Video files aren't accepted. Remove it to upload the rest.", fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
                        } else if (p.size >= 0) {
                            Text(formatSize(p.size), fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = muted)
                        }
                    }
                    IconButton(onClick = { onRemove(p.uri) }, enabled = !ui.busy) {
                        Icon(Icons.Filled.Close, contentDescription = "Remove ${p.name}")
                    }
                }
            }
        }

        val ready = (if (ui.useUrl) ui.urlText.isNotBlank() else ui.picked.isNotEmpty()) && !hasVideo
        Button(onClick = onUpload, enabled = ready && !ui.busy, modifier = Modifier.fillMaxWidth()) {
            Text(
                when {
                    ui.busy -> "Uploading…"
                    !ui.useUrl && ui.picked.size > 1 -> "Upload ${ui.picked.size} files"
                    else -> "Upload"
                },
            )
        }
        if (ui.busy) {
            val p = ui.progress
            if (p != null && p < 1f) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    LinearProgressIndicator(progress = { p }, modifier = Modifier.fillMaxWidth())
                    Text("Sending ${(p * 100).toInt()}%", fontSize = 12.sp, color = muted)
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    // Once every byte is sent the server still has to store the file.
                    Text(if (p != null) "Saving to the CDN…" else "Working…", fontSize = 12.sp, color = muted)
                }
            }
        }

        // The rules, said where the upload button is.
        Text(
            rich(
                "Everything you upload is public. By uploading you agree to the [Terms of Use](app:terms) and the [Privacy Policy](app:privacy).",
                MaterialTheme.colorScheme.primary,
                onNavigate,
            ),
            fontSize = 12.sp,
            color = muted,
        )

        ui.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        if (ui.results.isNotEmpty()) {
            Text("Uploaded", fontSize = 12.sp, color = muted)
            ui.results.forEach { r ->
                Column(
                    Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant).padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(r.filename.ifEmpty { r.path.substringAfterLast('/') }, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        "${r.path} · ${formatSize(r.size)}",
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp,
                        color = muted,
                    )
                    Button(onClick = { copyText(context, "CDN link", r.cdnUrl) }, modifier = Modifier.fillMaxWidth()) { Text("Copy CDN link") }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        OutlinedButton(onClick = { copyText(context, "Raw link", r.rawUrl) }, modifier = Modifier.weight(1f)) { Text("Copy raw link") }
                        OutlinedButton(onClick = { onOpenFile(r.path) }, modifier = Modifier.weight(1f)) { Text("Open") }
                    }
                }
            }
            ui.batchUrl?.let { batch ->
                OutlinedButton(onClick = { copyText(context, "Link to all files", batch) }, modifier = Modifier.fillMaxWidth()) {
                    Text("Copy link to all files")
                }
            }
        }
        Box(Modifier.padding(bottom = 8.dp))
    }
}

/** A two-state button: filled when selected, outlined when not. */
@Composable
private fun Choice(label: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    if (selected) Button(onClick = onClick, modifier = modifier) { Text(label, maxLines = 1) }
    else OutlinedButton(onClick = onClick, modifier = modifier) { Text(label, maxLines = 1) }
}

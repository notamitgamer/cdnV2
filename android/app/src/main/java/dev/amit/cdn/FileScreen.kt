package dev.amit.cdn

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage

/** The app's version of the website's file page: name, type and size, a preview, link buttons and the embed snippet. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FileScreen(path: String, size: Long, onBack: () -> Unit) {
    BackHandler(onBack = onBack)
    val context = LocalContext.current
    val links = remember(path) { linksFor(path) }
    val kind = remember(path) { kindOf(path) }
    val ext = remember(path) { extOf(path) }
    val name = path.substringAfterLast('/')
    val embed = remember(path) { embedFor(path, links.raw) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.onBackground,
                ),
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                title = { Text(name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (ext.isNotEmpty()) Pill(ext.uppercase())
                Pill(formatSize(size))
            }
            Text(
                path,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
            )

            Preview(path, name, kind, ext, size, links)

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                CopyButton("Copy CDN link", links.page, primary = true)
                CopyButton("Copy raw link", links.raw)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(onClick = { openInBrowser(context, links.download) }, modifier = Modifier.weight(1f)) { Text("Download") }
                    OutlinedButton(onClick = { openInBrowser(context, links.raw) }, modifier = Modifier.weight(1f)) { Text("Open raw") }
                    OutlinedButton(onClick = { shareLink(context, name, links.page) }, modifier = Modifier.weight(1f)) { Text("Share") }
                }
            }

            if (embed != null) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Embed", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Box(Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant).padding(12.dp)) {
                        Text(embed, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                    }
                    CopyButton("Copy embed snippet", embed)
                }
            }
            Box(Modifier.padding(bottom = 16.dp))
        }
    }
}

@Composable
private fun Preview(path: String, name: String, kind: Kind, ext: String, size: Long, links: Links) {
    val context = LocalContext.current
    // SVG and ICO need extra decoders, so they open in the browser like the other kinds.
    val inline = kind == Kind.IMAGE && ext != "svg" && ext != "ico"
    if (inline) {
        Box(Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant), contentAlignment = Alignment.Center) {
            AsyncImage(
                model = links.raw,
                contentDescription = "Preview of $name",
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        return
    }
    // Text and code show right here. Unknown types are tried too, and fall back if they turn out to be binary.
    if (kind == Kind.TEXT || kind == Kind.OTHER) {
        TextPreview(rawUrl = links.raw, size = size, mustBeText = kind == Kind.TEXT)
        return
    }
    val hint = when (kind) {
        Kind.VIDEO -> "Video preview opens in your browser."
        Kind.AUDIO -> "Audio plays in your browser."
        Kind.PDF -> "PDFs open in your browser."
        else -> "This image type opens in your browser."
    }
    Column(
        Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(hint, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
        OutlinedButton(onClick = { openInBrowser(context, links.raw) }) { Text("Open preview") }
    }
}

@Composable
private fun Pill(text: String) {
    Box(Modifier.border(1.dp, MaterialTheme.colorScheme.outline).padding(horizontal = 8.dp, vertical = 2.dp)) {
        Text(text, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
    }
}

@Composable
private fun CopyButton(label: String, value: String, primary: Boolean = false) {
    val context = LocalContext.current
    val onClick = { copyText(context, label, value) }
    if (primary) Button(onClick = onClick, modifier = Modifier.fillMaxWidth()) { Text(label) }
    else OutlinedButton(onClick = onClick, modifier = Modifier.fillMaxWidth()) { Text(label) }
}

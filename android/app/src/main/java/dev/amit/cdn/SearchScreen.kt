package dev.amit.cdn

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** One tappable row: a name, an optional muted line under it, and a small label on the right. */
@Composable
fun ListRow(
    title: String,
    subtitle: String?,
    trailing: String,
    isDir: Boolean,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f).padding(end = 12.dp)) {
            Text(
                text = if (isDir) "$title/" else title,
                color = if (isDir) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!subtitle.isNullOrEmpty()) {
                Text(
                    text = subtitle,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Text(
            text = trailing,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = FontFamily.Monospace,
            fontSize = 12.sp,
        )
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

/** Searches every file and folder name in the CDN. Runs on the phone, so results update as you type. */
@Composable
fun SearchScreen(
    files: List<FileRec>?,
    onOpenFolder: (String) -> Unit,
    onOpenFile: (String) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    val folders = remember(files) { if (files == null) emptyList() else allFolders(files) }
    val results = remember(files, folders, query) {
        if (files == null) emptyList() else searchTree(files, folders, query)
    }

    Column(Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            singleLine = true,
            label = { Text("Search all files and folders") },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        )
        HorizontalDivider()
        when {
            files == null -> Centered { Text("Loading the file list…", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            query.isBlank() -> Centered { Text("Type a name to search", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            results.isEmpty() -> Centered { Text("Nothing matches", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            else -> LazyColumn(Modifier.fillMaxSize()) {
                items(results, key = { (if (it.isDir) "d:" else "f:") + it.path }) { e ->
                    ListRow(
                        title = e.name,
                        subtitle = e.path.substringBeforeLast('/', ""),
                        trailing = if (e.isDir) "folder" else formatSize(e.size),
                        isDir = e.isDir,
                        onClick = { if (e.isDir) onOpenFolder(e.path) else onOpenFile(e.path) },
                    )
                }
            }
        }
    }
}

@Composable
fun Centered(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
}

package dev.amit.cdn

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** What this phone uploaded and opened. Kept on the phone only. */
@Composable
fun HistoryScreen(
    history: HistoryState,
    onOpenFolder: (String) -> Unit,
    onOpenFile: (String) -> Unit,
    onClearUploads: () -> Unit,
    onClearVisited: () -> Unit,
) {
    var tab by rememberSaveable { mutableIntStateOf(0) }

    Column(Modifier.fillMaxSize()) {
        TabRow(
            selectedTabIndex = tab,
            containerColor = MaterialTheme.colorScheme.background,
            contentColor = MaterialTheme.colorScheme.primary,
        ) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Uploads") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Visited") })
        }
        val count = if (tab == 0) history.uploads.size else history.visited.size
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                if (tab == 0) "$count uploaded from this phone" else "$count opened",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
            )
            TextButton(onClick = { if (tab == 0) onClearUploads() else onClearVisited() }, enabled = count > 0) {
                Text("Clear")
            }
        }
        HorizontalDivider()

        if (count == 0) {
            Centered {
                Text(
                    if (tab == 0) "No uploads yet on this phone" else "Nothing opened yet",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            return
        }

        if (tab == 0) {
            LazyColumn(Modifier.fillMaxSize()) {
                items(history.uploads, key = { it.path + it.ts }) { u ->
                    ListRow(
                        title = u.filename.ifEmpty { u.path.substringAfterLast('/') },
                        subtitle = u.path,
                        trailing = listOf(if (u.size > 0) formatSize(u.size) else "", relTime(u.ts))
                            .filter { it.isNotEmpty() }.joinToString(" · "),
                        isDir = false,
                        onClick = { onOpenFile(u.path) },
                    )
                }
            }
        } else {
            LazyColumn(Modifier.fillMaxSize()) {
                items(history.visited, key = { it.path }) { v ->
                    ListRow(
                        title = v.path.substringAfterLast('/'),
                        subtitle = v.path.substringBeforeLast('/', ""),
                        trailing = relTime(v.ts),
                        isDir = v.isDir,
                        onClick = { if (v.isDir) onOpenFolder(v.path) else onOpenFile(v.path) },
                    )
                }
            }
        }
    }
}

package dev.amit.cdn

import android.content.Intent
import android.graphics.Color as AndroidColor
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

class MainActivity : ComponentActivity() {
    private val vm: CdnViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(AndroidColor.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(AndroidColor.TRANSPARENT),
        )
        // Files shared to the app from another app's Share sheet. Skipped after a rotation, when the
        // same intent would otherwise be handled twice.
        if (savedInstanceState == null) vm.handleShare(intent)
        setContent {
            CdnTheme {
                CdnApp(vm)
            }
        }
    }

    // The app is singleTop, so a second share while it is open arrives here.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        vm.handleShare(intent)
    }
}

/** The four main screens, shown as tabs along the bottom. */
private enum class Section(val label: String, val icon: ImageVector) {
    FILES("Files", Icons.Filled.Home),
    SEARCH("Search", Icons.Filled.Search),
    UPLOAD("Upload", Icons.Filled.Add),
    HISTORY("History", Icons.Filled.DateRange),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CdnApp(vm: CdnViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    val history by vm.history.collectAsStateWithLifecycle()
    val upload by vm.upload.collectAsStateWithLifecycle()
    var section by rememberSaveable { mutableStateOf(Section.FILES.name) }
    var folder by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf("") }
    var selectedPath by rememberSaveable { mutableStateOf<String?>(null) }
    var menuOpen by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val current = Section.valueOf(section)

    // Something was shared to the app: show the Upload screen once.
    LaunchedEffect(upload.incoming) {
        if (upload.incoming) {
            section = Section.UPLOAD.name
            selectedPath = null
            vm.consumeIncoming()
        }
    }

    fun goUp() {
        folder = folder.substringBeforeLast('/', "")
        filter = ""
    }

    fun openFile(path: String) {
        vm.visit(path, false)
        selectedPath = path
    }

    fun openFolder(path: String) {
        vm.visit(path, true)
        folder = path
        filter = ""
        section = Section.FILES.name
    }

    BackHandler(enabled = selectedPath == null && current == Section.FILES && folder.isNotEmpty()) { goUp() }
    BackHandler(enabled = selectedPath == null && current != Section.FILES) { section = Section.FILES.name }

    val openPath = selectedPath
    if (openPath != null) {
        val size = state.files?.firstOrNull { it.path == openPath }?.size
            ?: history.uploads.firstOrNull { it.path == openPath }?.size
            ?: 0L
        FileScreen(path = openPath, size = size, onBack = { selectedPath = null })
        return
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.onBackground,
                ),
                navigationIcon = {
                    if (current == Section.FILES && folder.isNotEmpty()) {
                        IconButton(onClick = { goUp() }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Up one folder")
                        }
                    }
                },
                title = {
                    Text(
                        text = when {
                            current != Section.FILES -> current.label
                            folder.isEmpty() -> "amit/cdn"
                            else -> folder
                        },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                actions = {
                    IconButton(onClick = { vm.refresh() }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                    }
                    Box {
                        IconButton(onClick = { menuOpen = true }) {
                            Icon(Icons.Filled.MoreVert, contentDescription = "More")
                        }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            listOf(
                                "Docs" to Config.DOCS_URL,
                                "GitHub sync" to Config.SYNC_DOCS_URL,
                                "Privacy Policy" to Config.PRIVACY_URL,
                                "Terms of Use" to Config.TERMS_URL,
                            ).forEach { (label, url) ->
                                DropdownMenuItem(
                                    text = { Text(label) },
                                    onClick = { menuOpen = false; openInBrowser(context, url) },
                                )
                            }
                        }
                    }
                },
            )
        },
        bottomBar = {
            BottomTabs(current = current, onSelect = { section = it.name })
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            if (state.loading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            when (current) {
                Section.FILES -> FilesTab(
                    state = state,
                    folder = folder,
                    filter = filter,
                    onFilter = { filter = it },
                    onRetry = { vm.refresh() },
                    onOpenFolder = { openFolder(it) },
                    onOpenFile = { openFile(it) },
                )
                Section.SEARCH -> SearchScreen(
                    files = state.files,
                    onOpenFolder = { openFolder(it) },
                    onOpenFile = { openFile(it) },
                )
                Section.UPLOAD -> UploadScreen(
                    ui = upload,
                    onPicked = { vm.addPicked(it) },
                    onRemove = { vm.removePicked(it) },
                    onFolder = { vm.setFolder(it) },
                    onUseUrl = { vm.setUseUrl(it) },
                    onUrlText = { vm.setUrlText(it) },
                    onUpload = { vm.startUpload() },
                    onOpenFile = { openFile(it) },
                )
                Section.HISTORY -> HistoryScreen(
                    history = history,
                    onOpenFolder = { openFolder(it) },
                    onOpenFile = { openFile(it) },
                    onClearUploads = { vm.clearUploads() },
                    onClearVisited = { vm.clearVisited() },
                )
            }
        }
    }
}

/** Plain square tabs along the bottom, in the site's colours. */
@Composable
private fun BottomTabs(current: Section, onSelect: (Section) -> Unit) {
    Column(Modifier.background(MaterialTheme.colorScheme.surface).navigationBarsPadding()) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Row(Modifier.fillMaxWidth()) {
            Section.entries.forEach { s ->
                val on = s == current
                val tint = if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                Column(
                    Modifier.weight(1f).clickable { onSelect(s) }.padding(vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(s.icon, contentDescription = null, tint = tint)
                    Text(s.label, color = tint, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun FilesTab(
    state: UiState,
    folder: String,
    filter: String,
    onFilter: (String) -> Unit,
    onRetry: () -> Unit,
    onOpenFolder: (String) -> Unit,
    onOpenFile: (String) -> Unit,
) {
    val files = state.files
    if (files == null) {
        Centered {
            if (state.loading) {
                CircularProgressIndicator()
            } else {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(state.error ?: "Could not load files", color = MaterialTheme.colorScheme.error)
                    Button(onClick = onRetry, modifier = Modifier.padding(top = 12.dp)) {
                        Text("Retry")
                    }
                }
            }
        }
        return
    }
    Column(Modifier.fillMaxSize()) {
        state.error?.let {
            Text(
                "Refresh failed: $it",
                color = MaterialTheme.colorScheme.error,
                fontSize = 13.sp,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }
        FolderList(
            files = files,
            folder = folder,
            filter = filter,
            onFilter = onFilter,
            onOpenFolder = onOpenFolder,
            onOpenFile = onOpenFile,
        )
    }
}

@Composable
private fun FolderList(
    files: List<FileRec>,
    folder: String,
    filter: String,
    onFilter: (String) -> Unit,
    onOpenFolder: (String) -> Unit,
    onOpenFile: (String) -> Unit,
) {
    val all = remember(files, folder) { listFolder(files, folder) }
    val shown = remember(all, filter) {
        val q = filter.trim()
        if (q.isEmpty()) all else all.filter { it.name.contains(q, ignoreCase = true) }
    }
    val fileCount = all.count { !it.isDir }
    val folderCount = all.size - fileCount

    OutlinedTextField(
        value = filter,
        onValueChange = onFilter,
        singleLine = true,
        label = { Text("Filter this folder") },
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    )
    Text(
        "$folderCount folders · $fileCount files",
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 13.sp,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
    )
    HorizontalDivider()

    if (shown.isEmpty()) {
        Centered { Text(if (all.isEmpty()) "This folder is empty" else "Nothing matches", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        return
    }

    LazyColumn(Modifier.fillMaxSize()) {
        items(shown, key = { it.path }) { e ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable { if (e.isDir) onOpenFolder(e.path) else onOpenFile(e.path) }
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = if (e.isDir) e.name + "/" else e.name,
                    color = if (e.isDir) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f).padding(end = 12.dp),
                )
                Text(
                    text = if (e.isDir) "${e.count} ${if (e.count == 1) "file" else "files"}" else formatSize(e.size),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 12.sp,
                )
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
    }
}

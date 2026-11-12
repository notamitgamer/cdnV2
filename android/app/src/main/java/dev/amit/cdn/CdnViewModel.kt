package dev.amit.cdn

import android.app.Application
import android.content.Intent
import android.net.Uri
import androidx.core.content.IntentCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class UiState(
    val files: List<FileRec>? = null,
    val loading: Boolean = true,
    val error: String? = null,
)

/** Everything the Upload screen shows. */
data class UploadUi(
    val picked: List<Picked> = emptyList(),
    val useUrl: Boolean = false,
    val urlText: String = "",
    val folder: String = UPLOAD_FOLDERS.first(),
    val busy: Boolean = false,
    /** 0..1 while file bytes are going out; null when unknown (or for a link upload). */
    val progress: Float? = null,
    val error: String? = null,
    val results: List<UploadResult> = emptyList(),
    val batchUrl: String? = null,
    /** True right after another app shared something to us, so the UI can jump to the Upload screen once. */
    val incoming: Boolean = false,
)

class CdnViewModel(app: Application) : AndroidViewModel(app) {
    private val api = CdnApi(app.cacheDir)
    private val uploader = UploadApi(app.contentResolver)
    private val historyStore = HistoryStore(app.filesDir)

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private val _history = MutableStateFlow(HistoryState())
    val history: StateFlow<HistoryState> = _history.asStateFlow()

    private val _upload = MutableStateFlow(UploadUi())
    val upload: StateFlow<UploadUi> = _upload.asStateFlow()

    init {
        refresh(showCachedFirst = true)
        viewModelScope.launch {
            val saved = withContext(Dispatchers.IO) { historyStore.load() }
            _history.update { saved }
        }
    }

    fun refresh(showCachedFirst: Boolean = false) {
        viewModelScope.launch {
            if (showCachedFirst) {
                api.cachedTree()?.let { _state.value = UiState(files = it, loading = true) }
            } else {
                _state.value = _state.value.copy(loading = true, error = null)
            }
            try {
                _state.value = UiState(files = api.loadTree(), loading = false)
            } catch (e: Exception) {
                // Keep whatever we already showed; just tell the user the refresh failed.
                _state.value = _state.value.copy(loading = false, error = e.message ?: "Could not load files")
            }
        }
    }

    // ---- history -------------------------------------------------------------------------------

    private fun persist(next: HistoryState) {
        _history.value = next
        viewModelScope.launch(Dispatchers.IO) { historyStore.save(next) }
    }

    /** Remember that a file or folder was opened (newest first, no duplicates). */
    fun visit(path: String, isDir: Boolean) {
        val cur = _history.value
        val list = listOf(VisitedItem(path, isDir, System.currentTimeMillis())) + cur.visited.filter { it.path != path }
        persist(cur.copy(visited = list.take(HISTORY_LIMIT)))
    }

    fun clearUploads() = persist(_history.value.copy(uploads = emptyList()))

    fun clearVisited() = persist(_history.value.copy(visited = emptyList()))

    // ---- upload --------------------------------------------------------------------------------

    fun addPicked(uris: List<Uri>) {
        if (uris.isEmpty()) return
        val resolver = getApplication<Application>().contentResolver
        viewModelScope.launch {
            val items = withContext(Dispatchers.IO) { uris.map { describe(resolver, it) } }
            _upload.update { cur ->
                cur.copy(
                    picked = (cur.picked + items).distinctBy { it.uri },
                    useUrl = false,
                    error = null,
                    results = emptyList(),
                    batchUrl = null,
                )
            }
        }
    }

    fun removePicked(uri: Uri) = _upload.update { cur -> cur.copy(picked = cur.picked.filter { it.uri != uri }) }

    fun setFolder(folder: String) = _upload.update { it.copy(folder = folder) }

    fun setUseUrl(useUrl: Boolean) = _upload.update { it.copy(useUrl = useUrl, error = null) }

    fun setUrlText(text: String) = _upload.update { it.copy(urlText = text) }

    fun consumeIncoming() = _upload.update { it.copy(incoming = false) }

    /** Starts the upload for whichever mode (files or link) is showing. */
    fun startUpload() {
        val s = _upload.value
        if (s.busy) return
        val url = s.urlText.trim()
        if (s.useUrl && url.isEmpty()) return
        if (!s.useUrl && s.picked.isEmpty()) return
        _upload.update { it.copy(busy = true, progress = null, error = null, results = emptyList(), batchUrl = null) }
        viewModelScope.launch {
            try {
                val r = if (s.useUrl) {
                    uploader.uploadUrl(url, s.folder)
                } else {
                    uploader.uploadFiles(s.picked, s.folder) { p ->
                        // Called for every chunk; only touch the UI when the bar would visibly move.
                        val last = _upload.value.progress ?: -1f
                        if (p - last >= 0.01f || p >= 1f) _upload.update { it.copy(progress = p) }
                    }
                }
                val now = System.currentTimeMillis()
                val added = r.files.map { UploadedItem(it.filename, it.path, it.size, now) }
                val cur = _history.value
                persist(cur.copy(uploads = (added.reversed() + cur.uploads).take(HISTORY_LIMIT)))
                _upload.update {
                    it.copy(
                        busy = false,
                        progress = null,
                        picked = if (s.useUrl) it.picked else emptyList(),
                        urlText = if (s.useUrl) "" else it.urlText,
                        results = r.files,
                        batchUrl = r.batchUrl,
                    )
                }
                refresh() // so the new files show up in Files and Search
            } catch (e: Exception) {
                _upload.update { it.copy(busy = false, progress = null, error = e.message ?: "Upload failed") }
            }
        }
    }

    /** Files or a link shared to the app from another app's Share sheet. */
    fun handleShare(intent: Intent?) {
        if (intent == null) return
        val uris: List<Uri> = when (intent.action) {
            Intent.ACTION_SEND ->
                listOfNotNull(IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java))
            Intent.ACTION_SEND_MULTIPLE ->
                IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java).orEmpty()
            else -> return
        }
        if (uris.isNotEmpty()) {
            addPicked(uris)
            _upload.update { it.copy(incoming = true) }
            return
        }
        // Plain text: if it holds a web link, offer to upload from that link.
        val text = intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
        val link = Regex("https?://\\S+").find(text)?.value
        if (link != null) {
            _upload.update {
                it.copy(useUrl = true, urlText = link, error = null, results = emptyList(), batchUrl = null, incoming = true)
            }
        }
    }
}

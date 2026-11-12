package dev.amit.cdn

import java.io.File
import org.json.JSONArray
import org.json.JSONObject

/** A file this phone uploaded. Kept on the phone only, like the website keeps it in the browser. */
data class UploadedItem(val filename: String, val path: String, val size: Long, val ts: Long)

/** A file or folder that was opened in the app. */
data class VisitedItem(val path: String, val isDir: Boolean, val ts: Long)

data class HistoryState(
    val uploads: List<UploadedItem> = emptyList(),
    val visited: List<VisitedItem> = emptyList(),
)

const val HISTORY_LIMIT = 50

/** Saves the history as one small JSON file in the app's private storage. */
class HistoryStore(private val dir: File) {
    private val file get() = File(dir, "history.json")

    @Synchronized
    fun load(): HistoryState {
        return try {
            if (!file.exists()) return HistoryState()
            val root = JSONObject(file.readText())
            val ups = root.optJSONArray("uploads") ?: JSONArray()
            val vis = root.optJSONArray("visited") ?: JSONArray()
            HistoryState(
                uploads = (0 until ups.length()).map {
                    val o = ups.getJSONObject(it)
                    UploadedItem(o.getString("filename"), o.getString("path"), o.optLong("size"), o.optLong("ts"))
                },
                visited = (0 until vis.length()).map {
                    val o = vis.getJSONObject(it)
                    VisitedItem(o.getString("path"), o.optBoolean("dir"), o.optLong("ts"))
                },
            )
        } catch (e: Exception) {
            HistoryState()
        }
    }

    @Synchronized
    fun save(state: HistoryState) {
        try {
            val root = JSONObject()
            root.put("uploads", JSONArray().also { arr ->
                state.uploads.forEach {
                    arr.put(JSONObject().put("filename", it.filename).put("path", it.path).put("size", it.size).put("ts", it.ts))
                }
            })
            root.put("visited", JSONArray().also { arr ->
                state.visited.forEach {
                    arr.put(JSONObject().put("path", it.path).put("dir", it.isDir).put("ts", it.ts))
                }
            })
            val tmp = File(dir, "history.json.tmp")
            tmp.writeText(root.toString())
            if (!tmp.renameTo(file)) {
                file.writeText(root.toString())
                tmp.delete()
            }
        } catch (e: Exception) {
            // History is a convenience; never crash over it.
        }
    }
}

/** "just now", "5m ago", "3h ago", or a short date, like the website. */
fun relTime(ts: Long): String {
    if (ts <= 0) return ""
    val mins = (System.currentTimeMillis() - ts) / 60000
    return when {
        mins < 1 -> "just now"
        mins < 60 -> "${mins}m ago"
        mins < 1440 -> "${mins / 60}h ago"
        else -> java.text.SimpleDateFormat("MMM d", java.util.Locale.getDefault()).format(java.util.Date(ts))
    }
}

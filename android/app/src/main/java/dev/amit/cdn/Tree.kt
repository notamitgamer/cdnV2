package dev.amit.cdn

import android.net.Uri

/** One file from /api/tree: its path inside the bucket and its size in bytes. */
data class FileRec(val path: String, val size: Long)

/** One row in a folder listing: a sub-folder (with how many files it holds) or a file. */
data class Entry(
    val name: String,
    val path: String,
    val isDir: Boolean,
    val size: Long,
    val count: Int,
)

/**
 * Builds a folder listing from the flat file list, the same way the website does it in the browser.
 * [folder] is "" for the root, or a path like "uploads/2026" without slashes at either end.
 */
fun listFolder(files: List<FileRec>, folder: String): List<Entry> {
    val prefix = if (folder.isEmpty()) "" else "$folder/"
    val dirs = LinkedHashMap<String, IntArray>() // name -> [file count]
    val dirSizes = HashMap<String, Long>()
    val out = ArrayList<Entry>()

    for (f in files) {
        if (!f.path.startsWith(prefix)) continue
        val rest = f.path.substring(prefix.length)
        val slash = rest.indexOf('/')
        if (slash < 0) {
            out.add(Entry(rest, f.path, false, f.size, 0))
        } else {
            val name = rest.substring(0, slash)
            dirs.getOrPut(name) { IntArray(1) }[0]++
            dirSizes[name] = (dirSizes[name] ?: 0L) + f.size
        }
    }

    val folders = dirs.map { (name, c) ->
        Entry(name, prefix + name, true, dirSizes[name] ?: 0L, c[0])
    }
    val byName = compareBy<Entry, String>(String.CASE_INSENSITIVE_ORDER) { it.name }
    return folders.sortedWith(byName) + out.sortedWith(byName)
}

/** Encodes each path segment but keeps the slashes, e.g. "my files/a b.png" -> "my%20files/a%20b.png". */
fun encodePath(path: String): String = path.split('/').joinToString("/") { Uri.encode(it) }

/** The three links the website's file page offers. */
data class Links(val page: String, val raw: String, val download: String)

fun linksFor(path: String): Links {
    val p = encodePath(path)
    return Links(
        page = "${Config.CDN_BASE}/$p",
        raw = "${Config.RAW_BASE}/$p",
        download = "${Config.CDN_BASE}/api/get/$p",
    )
}

fun formatSize(bytes: Long): String {
    if (bytes < 1024) return "$bytes B"
    val units = arrayOf("KB", "MB", "GB", "TB")
    var v = bytes.toDouble()
    var i = -1
    while (v >= 1024 && i < units.size - 1) {
        v /= 1024
        i++
    }
    return String.format(java.util.Locale.US, "%.2f %s", v, units[i])
}

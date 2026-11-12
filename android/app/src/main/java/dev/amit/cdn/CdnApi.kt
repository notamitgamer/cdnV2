package dev.amit.cdn

import java.io.File
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

/**
 * Talks to the CDN's own HTTP API. /api/tree returns every file as [path, size]; the server answers
 * 304 when nothing changed, so a copy is kept on disk and reopening the app is nearly free.
 */
class CdnApi(private val cacheDir: File) {
    private val client = OkHttpClient()
    private val treeFile get() = File(cacheDir, "tree.json")
    private val etagFile get() = File(cacheDir, "tree.etag")

    /** The last saved tree, or null on first run. Lets the UI show something before the network answers. */
    suspend fun cachedTree(): List<FileRec>? = withContext(Dispatchers.IO) {
        try {
            if (treeFile.exists()) parse(treeFile.readText()) else null
        } catch (e: Exception) {
            null
        }
    }

    suspend fun loadTree(): List<FileRec> = withContext(Dispatchers.IO) {
        val builder = Request.Builder()
            .url("${Config.CDN_BASE}/api/tree")
            .header("User-Agent", "amit-cdn-android/0.1")
        if (treeFile.exists() && etagFile.exists()) {
            builder.header("If-None-Match", etagFile.readText())
        }
        client.newCall(builder.build()).execute().use { r ->
            if (r.code == 304) {
                return@withContext parse(treeFile.readText())
            }
            if (!r.isSuccessful) throw IOException("The server answered ${r.code}")
            val body = r.body?.string() ?: throw IOException("The server sent an empty answer")
            val files = parse(body)
            treeFile.writeText(body)
            val etag = r.header("ETag")
            if (etag != null) etagFile.writeText(etag) else etagFile.delete()
            files
        }
    }

    private fun parse(body: String): List<FileRec> {
        val json = JSONObject(body)
        if (json.optBoolean("too_large")) throw IOException("The file list is too large for the app")
        val arr = json.getJSONArray("files")
        val out = ArrayList<FileRec>(arr.length())
        for (i in 0 until arr.length()) {
            val row = arr.getJSONArray(i)
            out.add(FileRec(row.getString(0), row.getLong(1)))
        }
        return out
    }
}

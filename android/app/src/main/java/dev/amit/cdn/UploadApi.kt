package dev.amit.cdn

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import okio.source
import org.json.JSONObject

/** A file the user picked (or shared to the app), not uploaded yet. [size] is -1 when the source did not say. */
data class Picked(val uri: Uri, val name: String, val size: Long)

/** What the server says about one stored file. */
data class UploadResult(val filename: String, val path: String, val size: Long, val cdnUrl: String, val rawUrl: String)

data class UploadResponse(val files: List<UploadResult>, val batchUrl: String?)

/** The two folders the website lets anyone upload to. */
val UPLOAD_FOLDERS = listOf("uploads", "third-party")

/** The server refuses video files (app/upload_guard.py), so say so before spending the upload. */
private val blockedVideoExts = setOf(
    "mp4", "m4v", "mov", "webm", "mkv", "avi", "wmv", "flv", "mpg", "mpeg", "3gp", "3g2", "ogv",
)

fun isBlockedVideo(name: String): Boolean = extOf(name) in blockedVideoExts

/** Reads the display name and size of a picked file. */
fun describe(resolver: ContentResolver, uri: Uri): Picked {
    var name: String? = null
    var size = -1L
    try {
        resolver.query(uri, null, null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                val ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val si = c.getColumnIndex(OpenableColumns.SIZE)
                if (ni >= 0 && !c.isNull(ni)) name = c.getString(ni)
                if (si >= 0 && !c.isNull(si)) size = c.getLong(si)
            }
        }
    } catch (e: Exception) {
        // Some providers refuse the query; the file can still be read, so fall back to the path.
    }
    return Picked(uri, name ?: uri.lastPathSegment ?: "file", size)
}

/**
 * Streams a picked file straight from its content URI, so large files never sit in memory.
 * [onBytes] is told how many bytes were just written, for the progress bar.
 */
private class StreamBody(
    private val resolver: ContentResolver,
    private val picked: Picked,
    private val onBytes: (Int) -> Unit,
) : RequestBody() {
    override fun contentType() = "application/octet-stream".toMediaType()
    override fun contentLength(): Long = picked.size
    override fun writeTo(sink: BufferedSink) {
        val input = resolver.openInputStream(picked.uri) ?: throw IOException("Could not read ${picked.name}")
        input.use { stream ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val n = stream.read(buffer)
                if (n < 0) break
                sink.write(buffer, 0, n)
                onBytes(n)
            }
        }
    }
}

/** Uploads through the same endpoints the website uses: /api/put (files) and /api/put-url (a link). */
class UploadApi(private val resolver: ContentResolver) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(5, TimeUnit.MINUTES)
        .readTimeout(5, TimeUnit.MINUTES)
        .build()

    /** [onProgress] gets 0..1 as bytes go out; it is not called when the sizes are not known. */
    suspend fun uploadFiles(
        files: List<Picked>,
        folder: String,
        onProgress: (Float) -> Unit = {},
    ): UploadResponse = withContext(Dispatchers.IO) {
        val total = files.sumOf { it.size.coerceAtLeast(0L) }
        val known = total > 0 && files.none { it.size < 0 }
        var sent = 0L
        val form = MultipartBody.Builder().setType(MultipartBody.FORM)
        form.addFormDataPart("folder", folder)
        for (p in files) {
            form.addFormDataPart(
                "files",
                p.name,
                StreamBody(resolver, p) { n ->
                    sent += n
                    if (known) onProgress((sent.toDouble() / total).coerceAtMost(1.0).toFloat())
                },
            )
        }
        send(Request.Builder().url("${Config.CDN_BASE}/api/put").post(form.build()))
    }

    suspend fun uploadUrl(url: String, folder: String): UploadResponse = withContext(Dispatchers.IO) {
        val json = JSONObject().put("url", url).put("folder", folder).toString()
        val body = json.toRequestBody("application/json".toMediaType())
        send(Request.Builder().url("${Config.CDN_BASE}/api/put-url").post(body))
    }

    private fun send(builder: Request.Builder): UploadResponse {
        val request = builder.header("User-Agent", Config.USER_AGENT).build()
        client.newCall(request).execute().use { r ->
            val text = r.body?.string().orEmpty()
            if (!r.isSuccessful) throw IOException(errorText(r.code, text))
            return parse(text)
        }
    }

    /** FastAPI errors look like {"detail": "..."}; show that text, which is written for people. */
    private fun errorText(code: Int, body: String): String {
        try {
            val detail = JSONObject(body).opt("detail")
            if (detail is String && detail.isNotBlank()) return detail
        } catch (e: Exception) {
            // not JSON
        }
        return when (code) {
            413 -> "That file is too large"
            429 -> "Too many uploads. Try again later"
            else -> "The server answered $code"
        }
    }

    private fun parse(body: String): UploadResponse {
        val json = JSONObject(body)
        val arr = json.getJSONArray("files")
        val out = ArrayList<UploadResult>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            out.add(
                UploadResult(
                    filename = o.optString("filename"),
                    path = o.getString("hf_path"),
                    size = o.optLong("size"),
                    cdnUrl = o.getString("cdn_url"),
                    rawUrl = o.getString("raw_url"),
                ),
            )
        }
        val batch = json.optString("batch_url", "")
        return UploadResponse(out, batch.ifEmpty { null })
    }
}

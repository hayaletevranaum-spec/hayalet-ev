package com.hayaletev.androidcompanion.transport

import com.hayaletev.androidcompanion.debug.CompanionDiagnostics
import com.hayaletev.androidcompanion.model.CompanionManifest
import com.hayaletev.androidcompanion.capture.CameraPreviewFrame
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

data class BridgeCommand(
    val id: String,
    val kind: String,
    val target: String,
    val requestId: String? = null,
    val profile: BridgeCommandProfile? = null,
    val ambient: BridgeAmbientOptions? = null,
    val torch: BridgeTorchPayload? = null,
    val tts: BridgeTtsPayload? = null,
)

data class BridgePermissions(
    val camera: String,
    val microphone: String
)

data class BridgeCommandProfile(
    val defaultLens: String? = null,
    val photoQuality: String? = null,
    val photoFlashMode: String = "off",
    val androidDictationBackend: String = "vosk",
    val transcriptModel: BridgeTranscriptModelProfile? = null,
    val torchEnabled: Boolean = false,
    val livePreview: Boolean = false,
)

data class BridgeTorchPayload(
    val enabled: Boolean,
)

data class BridgeTranscriptModelProfile(
    val backend: String,
    val modelId: String,
    val fileName: String,
    val expectedSha1: String,
    val expectedBytes: Long?,
    val language: String,
    val variant: String,
    val archiveFormat: String,
)

data class BridgeAmbientOptions(
    val wakePhrases: List<String>,
    val activeWindowMs: Long,
    val silenceTimeoutMs: Long,
)

data class BridgeTtsProfile(
    val engine: String,
    val modelId: String,
    val language: String,
    val voice: String,
    val sampleRate: Int?,
)

data class BridgeTtsPayload(
    val text: String,
    val language: String,
    val modelId: String,
    val profile: BridgeTtsProfile,
)

data class BridgeOperationOwner(
    val id: String,
    val label: String,
    val roomId: String? = null,
)

data class BridgeOperationRecord(
    val capability: String,
    val owner: BridgeOperationOwner,
    val startedAt: Long,
)

data class BridgeOperationsStatus(
    val records: List<BridgeOperationRecord>,
    val updatedAt: Long,
)

class DesktopBridgeClient(private val manifest: CompanionManifest) {
    private val client = OkHttpClient.Builder()
        .callTimeout(10, TimeUnit.SECONDS)
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()
    private val modelDownloadClient = client.newBuilder()
        .callTimeout(5, TimeUnit.MINUTES)
        .readTimeout(5, TimeUnit.MINUTES)
        .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
    private val baseUrl = "http://127.0.0.1:${manifest.bridgePort}"

    init {
        CompanionDiagnostics.setState("Bridge endpoint", baseUrl)
    }

    suspend fun registerSession(
        deviceId: String,
        target: String,
        permissions: BridgePermissions,
        previewActive: Boolean,
        reportFailureToDiagnostics: Boolean = true,
    ): List<BridgeCommand> {
        val payload = JSONObject()
            .put("deviceId", deviceId)
            .put("appVersion", manifest.versionName)
            .put("target", target)
            .put("transport", "adb-reverse")
            .put("previewActive", previewActive)
            .put(
                "permissions",
                JSONObject()
                    .put("camera", permissions.camera)
                    .put("microphone", permissions.microphone)
            )
        val response = postJson("/api/v1/session/register", payload, reportFailureToDiagnostics)
        return parseCommands(response.optJSONArray("pendingCommands"))
    }

    suspend fun pollCommands(
        deviceId: String,
        reportFailureToDiagnostics: Boolean = true,
    ): List<BridgeCommand> {
        val response = getJson(
            "/api/v1/session/commands?deviceId=$deviceId",
            reportFailureToDiagnostics,
        )
        val commands = parseCommands(response.optJSONArray("commands"))
        if (commands.isNotEmpty()) {
            CompanionDiagnostics.i(
                "bridge",
                "Desktop command queue returned ${commands.size} command(s).",
                commands.joinToString(", ") { it.kind },
            )
        }
        return commands
    }

    suspend fun acknowledgeCommand(
        deviceId: String,
        command: BridgeCommand,
        status: String,
        message: String,
        previewActive: Boolean? = null,
    ) {
        val payload = JSONObject()
            .put("deviceId", deviceId)
            .put("commandId", command.id)
            .put("kind", command.kind)
            .put("target", command.target)
            .put("requestId", command.requestId ?: command.id)
            .put("status", status)
            .put("message", message)
        if (previewActive != null) {
            payload.put("previewActive", previewActive)
        }
        postJson("/api/v1/session/ack", payload)
        CompanionDiagnostics.i(
            "bridge",
            "Acknowledged command ${command.kind}.",
            "status=$status, previewActive=$previewActive",
        )
    }

    suspend fun uploadAnalyzeCapture(
        deviceId: String,
        target: String,
        requestId: String,
        file: File,
        stageForAnalyze: Boolean = false,
    ) {
        val bytes = withContext(Dispatchers.IO) { file.readBytes() }
        val payload = JSONObject()
            .put("requestId", requestId)
            .put("deviceId", deviceId)
            .put("target", target)
            .put("fileName", file.name)
            .put("stageForAnalyze", stageForAnalyze)
            .put("contentBase64", android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP))
        postJson("/api/v1/media/analyze", payload)
        CompanionDiagnostics.i(
            "bridge",
            "Uploaded analyze capture to desktop.",
            "file=${file.name}, bytes=${bytes.size}",
        )
    }

    suspend fun submitLiveCameraFrame(
        deviceId: String,
        target: String,
        requestId: String,
        frame: CameraPreviewFrame,
    ) {
        val payload = JSONObject()
            .put("requestId", requestId)
            .put("deviceId", deviceId)
            .put("target", target)
            .put("width", frame.width)
            .put("height", frame.height)
            .put("capturedAt", frame.capturedAtMs)
            .put(
                "contentBase64",
                android.util.Base64.encodeToString(frame.jpegBytes, android.util.Base64.NO_WRAP),
            )
        postJson(
            "/api/v1/live/camera/frame",
            payload,
            reportFailureToDiagnostics = false,
        )
    }

    suspend fun submitTranscript(
        requestId: String,
        deviceId: String,
        target: String,
        text: String,
        isFinal: Boolean,
        metadata: JSONObject? = null,
    ) {
        val payload = JSONObject()
            .put("requestId", requestId)
            .put("deviceId", deviceId)
            .put("target", target)
            .put("text", text)
            .put("isFinal", isFinal)
        if (metadata != null) {
            payload.put("metadata", metadata)
        }
        postJson("/api/v1/transcript/ingress", payload)
        CompanionDiagnostics.d(
            "speech",
            "Submitted transcript to desktop bridge.",
            "target=$target, final=$isFinal",
        )
    }

    suspend fun submitAmbientStatus(
        requestId: String,
        deviceId: String,
        target: String,
        status: String,
        message: String,
        transcript: String? = null,
        metadata: JSONObject? = null,
    ) {
        val payload = JSONObject()
            .put("requestId", requestId)
            .put("deviceId", deviceId)
            .put("target", target)
            .put("status", status)
            .put("message", message)
        if (transcript != null) {
            payload.put("transcript", transcript)
        }
        if (metadata != null) {
            payload.put("metadata", metadata)
        }
        postJson("/api/v1/ambient/status", payload)
        CompanionDiagnostics.d(
            "ambient",
            "Submitted ambient status to desktop bridge.",
            "target=$target, status=$status",
        )
    }

    suspend fun submitTtsStatus(
        requestId: String,
        deviceId: String,
        target: String,
        status: String,
        message: String,
        progress: Double? = null,
        language: String? = null,
        modelId: String? = null,
        error: String? = null,
    ) {
        val payload = JSONObject()
            .put("requestId", requestId)
            .put("deviceId", deviceId)
            .put("target", target)
            .put("status", status)
            .put("message", message)
        if (progress != null) {
            payload.put("progress", progress)
        }
        if (language != null) {
            payload.put("language", language)
        }
        if (modelId != null) {
            payload.put("modelId", modelId)
        }
        if (error != null) {
            payload.put("error", error)
        }
        postJson("/api/v1/tts/status", payload)
        CompanionDiagnostics.d(
            "tts",
            "Submitted TTS status to desktop bridge.",
            "target=$target, status=$status",
        )
    }

    suspend fun downloadTranscriptModel(
        fileName: String,
        destination: File,
    ) = withContext(Dispatchers.IO) {
        destination.parentFile?.mkdirs()
        val request = Request.Builder()
            .url("$baseUrl/api/v1/transcript/model?fileName=$fileName")
            .get()
            .build()

        modelDownloadClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                val body = response.body?.string().orEmpty()
                CompanionDiagnostics.e(
                    "transcript",
                    "Transcript model download failed with ${response.code}.",
                    body.ifBlank { "Bridge model download failed." },
                )
                throw IllegalStateException(body.ifBlank { "Bridge model download failed: ${response.code}" })
            }

            val body = response.body ?: throw IllegalStateException("Bridge model response was empty.")
            FileOutputStream(destination).use { output ->
                body.byteStream().use { input ->
                    input.copyTo(output)
                }
            }
            CompanionDiagnostics.i(
                "transcript",
                "Downloaded transcript model from desktop bridge.",
                "file=${destination.name}, bytes=${destination.length()}",
            )
        }
    }

    suspend fun submitDiagnosticsSnapshot(deviceId: String) {
        postJson(
            "/api/v1/diagnostics/snapshot",
            CompanionDiagnostics.buildSnapshotPayload(deviceId),
            reportFailureToDiagnostics = false,
        )
    }

    suspend fun fetchOperationsStatus(
        reportFailureToDiagnostics: Boolean = false,
    ): BridgeOperationsStatus {
        val response = getJson("/api/v1/operations/status", reportFailureToDiagnostics)
        return response.toBridgeOperationsStatus()
    }

    private suspend fun getJson(
        path: String,
        reportFailureToDiagnostics: Boolean = true,
    ): JSONObject = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$baseUrl$path")
            .get()
            .build()

        try {
            client.newCall(request).execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    if (reportFailureToDiagnostics) {
                        CompanionDiagnostics.e(
                            "bridge",
                            "GET $path failed with ${response.code}.",
                            body.ifBlank { "Bridge request failed." },
                        )
                    }
                    throw IllegalStateException(body.ifBlank { "Bridge request failed: ${response.code}" })
                }
                JSONObject(body.ifBlank { "{}" })
            }
        } catch (error: Exception) {
            if (reportFailureToDiagnostics) {
                CompanionDiagnostics.e("bridge", "GET $path failed.", throwable = error)
            }
            throw error
        }
    }

    private suspend fun postJson(
        path: String,
        payload: JSONObject,
        reportFailureToDiagnostics: Boolean = true,
    ): JSONObject = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$baseUrl$path")
            .post(payload.toString().toRequestBody(jsonMediaType))
            .build()

        try {
            client.newCall(request).execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    if (reportFailureToDiagnostics) {
                        CompanionDiagnostics.e(
                            "bridge",
                            "POST $path failed with ${response.code}.",
                            body.ifBlank { "Bridge request failed." },
                        )
                    }
                    throw IllegalStateException(body.ifBlank { "Bridge request failed: ${response.code}" })
                }
                JSONObject(body.ifBlank { "{}" })
            }
        } catch (error: Exception) {
            if (reportFailureToDiagnostics) {
                CompanionDiagnostics.e("bridge", "POST $path failed.", throwable = error)
            }
            throw error
        }
    }

    private fun parseCommands(array: JSONArray?): List<BridgeCommand> {
        if (array == null) {
            return emptyList()
        }

        return buildList {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val id = item.optString("id")
                val kind = item.optString("kind")
                val target = item.optString("target")
                if (id.isBlank() || kind.isBlank() || target.isBlank()) {
                    continue
                }
                add(
                    BridgeCommand(
                        id = id,
                        kind = kind,
                        target = target,
                        requestId = item.optString("requestId").trim().ifBlank { null },
                        profile = item.optJSONObject("profile")?.toBridgeCommandProfile(),
                        ambient = item.optJSONObject("ambient")?.toBridgeAmbientOptions(),
                        torch = item.optJSONObject("torch")?.toBridgeTorchPayload(),
                        tts = item.optJSONObject("tts")?.toBridgeTtsPayload(),
                    )
                )
            }
        }
    }

    private fun JSONObject.toBridgeCommandProfile(): BridgeCommandProfile {
        return BridgeCommandProfile(
            defaultLens = optString("defaultLens").ifBlank { null },
            photoQuality = optString("photoQuality").ifBlank { null },
            photoFlashMode = optString("photoFlashMode").trim().ifBlank {
                if (optBoolean("photoFlashEnabled", false)) "on" else "off"
            },
            androidDictationBackend = optString("androidDictationBackend").trim().ifBlank {
                "vosk"
            },
            transcriptModel = optJSONObject("transcriptModel")?.toBridgeTranscriptModelProfile(),
            torchEnabled = optBoolean("torchEnabled", false),
            livePreview = optBoolean("livePreview", false),
        )
    }

    private fun JSONObject.toBridgeTorchPayload(): BridgeTorchPayload {
        return BridgeTorchPayload(enabled = optBoolean("enabled", false))
    }

    private fun JSONObject.toBridgeTranscriptModelProfile(): BridgeTranscriptModelProfile? {
        val modelId = optString("modelId").trim()
        val fileName = optString("fileName").trim()
        val expectedSha1 = optString("expectedSha1").trim()
        val language = optString("language").trim().ifBlank { "tr" }
        val variant = optString("variant").trim().ifBlank { "full" }
        if (modelId.isBlank() || fileName.isBlank() || expectedSha1.isBlank()) {
            return null
        }

        return BridgeTranscriptModelProfile(
            backend = optString("backend").trim().ifBlank { "vosk" },
            modelId = modelId,
            fileName = fileName,
            expectedSha1 = expectedSha1,
            expectedBytes = if (has("expectedBytes") && isNull("expectedBytes").not()) {
                optLong("expectedBytes")
            } else {
                null
            },
            language = language,
            variant = variant,
            archiveFormat = optString("archiveFormat").trim().ifBlank { "file" },
        )
    }

    private fun JSONObject.toBridgeAmbientOptions(): BridgeAmbientOptions {
        val wakeArray = optJSONArray("wakePhrases")
        val wakePhrases = buildList {
            if (wakeArray != null) {
                for (index in 0 until wakeArray.length()) {
                    val phrase = wakeArray.optString(index).trim()
                    if (phrase.isNotBlank()) {
                        add(phrase)
                    }
                }
            }
        }.ifEmpty { listOf("Hey Jarvis") }

        return BridgeAmbientOptions(
            wakePhrases = wakePhrases,
            activeWindowMs = optLong("activeWindowMs", 6_000L).coerceIn(1_000L, 30_000L),
            silenceTimeoutMs = optLong("silenceTimeoutMs", 1_200L).coerceIn(300L, 10_000L),
        )
    }

    private fun JSONObject.toBridgeTtsPayload(): BridgeTtsPayload? {
        val text = optString("text").trim()
        val language = optString("language").trim().ifBlank { "tr" }
        val modelId = optString("modelId").trim()
        val profile = optJSONObject("profile")?.toBridgeTtsProfile()
        if (text.isBlank() || modelId.isBlank() || profile == null) {
            return null
        }

        return BridgeTtsPayload(
            text = text,
            language = language,
            modelId = modelId,
            profile = profile,
        )
    }

    private fun JSONObject.toBridgeTtsProfile(): BridgeTtsProfile {
        return BridgeTtsProfile(
            engine = optString("engine").trim().ifBlank { "sherpa-onnx" },
            modelId = optString("modelId").trim(),
            language = optString("language").trim().ifBlank { "tr" },
            voice = optString("voice").trim().ifBlank { "unknown" },
            sampleRate =
                if (has("sampleRate") && isNull("sampleRate").not()) {
                    optInt("sampleRate")
                } else {
                    null
                },
        )
    }

    private fun JSONObject.toBridgeOperationsStatus(): BridgeOperationsStatus {
        val array = optJSONArray("records")
        val records = buildList {
            if (array == null) {
                return@buildList
            }

            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val capability = item.optString("capability").trim()
                val ownerJson = item.optJSONObject("owner") ?: continue
                val ownerId = ownerJson.optString("id").trim()
                val ownerLabel = ownerJson.optString("label").trim().ifBlank { ownerId }
                if (capability.isBlank() || ownerId.isBlank()) {
                    continue
                }

                add(
                    BridgeOperationRecord(
                        capability = capability,
                        owner =
                            BridgeOperationOwner(
                                id = ownerId,
                                label = ownerLabel,
                                roomId = ownerJson.optString("roomId").trim().ifBlank { null },
                            ),
                        startedAt = item.optLong("startedAt", 0L),
                    )
                )
            }
        }

        return BridgeOperationsStatus(
            records = records,
            updatedAt = optLong("updatedAt", 0L),
        )
    }

}

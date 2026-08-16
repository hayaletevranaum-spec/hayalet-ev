package com.hayaletev.androidcompanion.transcript

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.SystemClock
import androidx.core.content.ContextCompat
import com.hayaletev.androidcompanion.debug.CompanionDiagnostics
import com.hayaletev.androidcompanion.transport.BridgeTranscriptModelProfile
import com.rementia.openwakeword.lib.WakeWordEngine
import com.rementia.openwakeword.lib.model.DetectionMode
import com.rementia.openwakeword.lib.model.WakeWordDetection
import com.rementia.openwakeword.lib.model.WakeWordModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import java.io.File
import java.text.Normalizer
import java.util.Locale

private const val AMBIENT_VOSK_SAMPLE_RATE = 16_000.0f
private const val AMBIENT_MIN_CAPTURE_MS = 500L
private const val OPEN_WAKE_DEFAULT_WAKE_PHRASE = "Hey Jarvis"
private const val OPEN_WAKE_HEY_JARVIS_MODEL = "hey_jarvis_v0.1.onnx"
private const val OPEN_WAKE_THRESHOLD = 0.5f
private const val OPEN_WAKE_COOLDOWN_MS = 2_000L

data class AndroidAmbientListenerConfig(
    val requestId: String,
    val target: String,
    val wakePhrases: List<String>,
    val activeWindowMs: Long,
    val silenceTimeoutMs: Long,
    val modelProfile: BridgeTranscriptModelProfile,
    val modelDirectory: File,
)

data class AndroidAmbientTranscript(
    val text: String,
    val wakePhrase: String,
    val activeWindowMs: Long,
    val silenceTimeoutMs: Long,
    val capturedMs: Long,
)

private data class AndroidOpenWakeModel(
    val phrase: String,
    val assetPath: String,
    val threshold: Float,
)

class AndroidAmbientOpenWakeListener(
    private val context: Context,
    private val scope: CoroutineScope,
) {
    private val sampleRate = 16_000
    private var activeWakeEngine: WakeWordEngine? = null
    private var commandRecorder: AudioRecord? = null
    private var listenerJob: Job? = null

    fun isRunning(): Boolean = listenerJob?.isActive == true

    fun start(
        config: AndroidAmbientListenerConfig,
        onStatus: suspend (status: String, message: String, transcript: String?, metadata: JSONObject?) -> Unit,
        onTranscript: suspend (transcript: AndroidAmbientTranscript) -> Unit,
    ) {
        stop()
        if (
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            throw IllegalStateException("Android microphone permission is missing.")
        }

        val wakeModels = resolveOpenWakeModels(config.wakePhrases)
        requireOpenWakeAssets(wakeModels)
        listenerJob =
            scope.launch(Dispatchers.IO) {
                runAmbientLoop(
                    config = config,
                    wakeModels = wakeModels,
                    onStatus = onStatus,
                    onTranscript = onTranscript,
                )
            }
    }

    fun stop() {
        listenerJob?.cancel()
        listenerJob = null
        activeWakeEngine?.release()
        activeWakeEngine = null
        runCatching { commandRecorder?.stop() }
    }

    private suspend fun runAmbientLoop(
        config: AndroidAmbientListenerConfig,
        wakeModels: List<AndroidOpenWakeModel>,
        onStatus: suspend (status: String, message: String, transcript: String?, metadata: JSONObject?) -> Unit,
        onTranscript: suspend (transcript: AndroidAmbientTranscript) -> Unit,
    ) {
        try {
            CompanionDiagnostics.i(
                "ambient",
                "Android openWakeWord ambient listener started.",
                "target=${config.target}, wake=${wakeModels.joinToString("|") { it.phrase }}",
            )
            onStatus(
                "started",
                "Android openWakeWord ambient wake listener started.",
                null,
                JSONObject()
                    .put("wakeEngine", "openWakeWord")
                    .put("wakePhrases", wakeModels.joinToString(", ") { it.phrase }),
            )

            Model(config.modelDirectory.absolutePath).use { commandModel ->
                while (scope.isActive && listenerJob?.isActive == true) {
                    val detection = awaitWakeDetection(wakeModels)
                    val wakePhrase = detection.model.name
                    onStatus(
                        "wake-detected",
                        "OpenWakeWord wake phrase detected.",
                        null,
                        JSONObject()
                            .put("wakeEngine", "openWakeWord")
                            .put("wakeModel", detection.model.modelPath)
                            .put("wakePhrase", wakePhrase)
                            .put("wakeScore", detection.score.toDouble()),
                    )

                    val transcript =
                        captureAmbientCommand(
                            config = config,
                            commandModel = commandModel,
                            wakePhrase = wakePhrase,
                            onStatus = onStatus,
                        ) ?: continue

                    onStatus("transcribing", "Ambient phrase recognized on phone.", transcript.text, null)
                    onTranscript(transcript)
                    onStatus("done", "Ambient transcript submitted.", transcript.text, null)
                }
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            CompanionDiagnostics.e("ambient", "Android ambient listener failed.", throwable = error)
            onStatus(
                "failed",
                error.message?.trim().takeUnless { it.isNullOrEmpty() } ?: "Ambient listener failed.",
                null,
                null,
            )
        } finally {
            activeWakeEngine?.release()
            activeWakeEngine = null
            runCatching { commandRecorder?.stop() }
            CompanionDiagnostics.i("ambient", "Android ambient listener stopped.")
        }
    }

    private suspend fun awaitWakeDetection(wakeModels: List<AndroidOpenWakeModel>): WakeWordDetection {
        val engine =
            WakeWordEngine(
                context = context,
                models =
                    wakeModels.map { model ->
                        WakeWordModel(
                            name = model.phrase,
                            modelPath = model.assetPath,
                            threshold = model.threshold,
                        )
                    },
                detectionMode = DetectionMode.SINGLE_BEST,
                detectionCooldownMs = OPEN_WAKE_COOLDOWN_MS,
                scope = scope,
            )
        activeWakeEngine = engine
        return try {
            coroutineScope {
                val detection = async { engine.detections.first() }
                engine.start()
                detection.await()
            }
        } finally {
            engine.release()
            if (activeWakeEngine === engine) {
                activeWakeEngine = null
            }
        }
    }

    private suspend fun captureAmbientCommand(
        config: AndroidAmbientListenerConfig,
        commandModel: Model,
        wakePhrase: String,
        onStatus: suspend (status: String, message: String, transcript: String?, metadata: JSONObject?) -> Unit,
    ): AndroidAmbientTranscript? {
        val bufferSize = resolveBufferSize()
        val recorder = createRecorder(bufferSize)
        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            recorder.release()
            throw IllegalStateException("Android ambient command recorder could not be initialized.")
        }

        commandRecorder = recorder
        var recognizer: Recognizer? = null
        try {
            recognizer = Recognizer(commandModel, AMBIENT_VOSK_SAMPLE_RATE)
            recorder.startRecording()
            onStatus("capturing", "Ambient command capture started.", null, null)

            val buffer = ByteArray(bufferSize)
            val captureStartedAtMs = SystemClock.elapsedRealtime()
            var lastSpeechAtMs = captureStartedAtMs

            while (scope.isActive && listenerJob?.isActive == true) {
                val read = recorder.read(buffer, 0, buffer.size)
                if (read <= 0) {
                    continue
                }

                val now = SystemClock.elapsedRealtime()
                recognizer.acceptWaveForm(buffer, read)
                val partial = readVoskText(recognizer.partialResult)
                if (partial.isNotBlank()) {
                    lastSpeechAtMs = now
                }

                val capturedMs = now - captureStartedAtMs
                val windowExpired = capturedMs >= config.activeWindowMs
                val silenceExpired =
                    capturedMs >= AMBIENT_MIN_CAPTURE_MS &&
                        now - lastSpeechAtMs >= config.silenceTimeoutMs
                if (windowExpired.not() && silenceExpired.not()) {
                    continue
                }

                val transcriptText =
                    readVoskText(recognizer.finalResult)
                        .replace(Regex("\\s+"), " ")
                        .trim()
                if (transcriptText.isBlank()) {
                    onStatus("done", "Ambient wake captured no speech.", null, null)
                    return null
                }

                return AndroidAmbientTranscript(
                    text = transcriptText,
                    wakePhrase = wakePhrase,
                    activeWindowMs = config.activeWindowMs,
                    silenceTimeoutMs = config.silenceTimeoutMs,
                    capturedMs = capturedMs,
                )
            }
            return null
        } finally {
            runCatching { recognizer?.close() }
            runCatching { recorder.stop() }
            recorder.release()
            if (commandRecorder === recorder) {
                commandRecorder = null
            }
        }
    }

    private fun resolveOpenWakeModels(wakePhrases: List<String>): List<AndroidOpenWakeModel> {
        val requestedPhrases = wakePhrases.map(::normalizeAmbientText).filter { it.isNotBlank() }.toSet()
        val models =
            listOf(
                AndroidOpenWakeModel(
                    phrase = OPEN_WAKE_DEFAULT_WAKE_PHRASE,
                    assetPath = OPEN_WAKE_HEY_JARVIS_MODEL,
                    threshold = OPEN_WAKE_THRESHOLD,
                )
            )
        val selected =
            if (requestedPhrases.isEmpty()) {
                models
            } else {
                models.filter { requestedPhrases.contains(normalizeAmbientText(it.phrase)) }
            }
        if (selected.isEmpty()) {
            throw IllegalStateException(
                "No bundled openWakeWord model matches configured wake phrases: " +
                    wakePhrases.joinToString(", ") +
                    ". Supported wake phrase: $OPEN_WAKE_DEFAULT_WAKE_PHRASE."
            )
        }
        return selected
    }

    private fun requireOpenWakeAssets(wakeModels: List<AndroidOpenWakeModel>) {
        val requiredAssets =
            buildList {
                add("melspectrogram.onnx")
                add("embedding_model.onnx")
                wakeModels.forEach { add(it.assetPath) }
            }.distinct()
        for (asset in requiredAssets) {
            runCatching { context.assets.open(asset).close() }.getOrElse {
                throw IllegalStateException("OpenWakeWord asset is missing: $asset")
            }
        }
    }

    private fun resolveBufferSize(): Int {
        val minimum = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        if (minimum <= 0) {
            throw IllegalStateException("Android microphone buffer size could not be resolved.")
        }
        return minimum.coerceAtLeast(sampleRate / 2)
    }

    @SuppressLint("MissingPermission")
    private fun createRecorder(bufferSize: Int): AudioRecord {
        return AudioRecord(
            MediaRecorder.AudioSource.MIC,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize,
        )
    }

    private fun readVoskText(payload: String?): String {
        if (payload.isNullOrBlank()) {
            return ""
        }
        val json = runCatching { JSONObject(payload) }.getOrNull() ?: return ""
        return (json.optString("text").ifBlank { json.optString("partial") }).trim()
    }

    private fun normalizeAmbientText(value: String): String {
        val lower = value.lowercase(Locale.forLanguageTag("tr-TR")).replace('ı', 'i')
        return Normalizer.normalize(lower, Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")
            .replace(Regex("[^\\p{L}\\p{N}\\s]+"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
    }
}

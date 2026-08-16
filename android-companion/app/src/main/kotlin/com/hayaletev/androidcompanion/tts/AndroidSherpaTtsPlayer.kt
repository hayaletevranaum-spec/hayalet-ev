package com.hayaletev.androidcompanion.tts

import android.content.Context
import android.content.pm.PackageManager
import android.content.res.AssetManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.hayaletev.androidcompanion.transport.BridgeTtsPayload
import com.k2fsa.sherpa.onnx.GenerationConfig
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.getOfflineTtsConfig
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.Locale

data class AndroidSherpaTtsResult(
    val stopped: Boolean,
    val sampleRate: Int,
    val sampleCount: Int,
)

private const val SHERPA_TTS_ENGINE_PACKAGE = "com.k2fsa.sherpa.onnx.tts.engine"

private data class AndroidSherpaTtsModelSpec(
    val modelId: String,
    val language: String,
    val assetDir: String,
    val modelFileName: String,
    val voice: String,
)

private val ANDROID_SHERPA_TTS_MODELS =
    listOf(
        AndroidSherpaTtsModelSpec(
            modelId = "tr_TR-dfki-medium",
            language = "tr",
            assetDir = "vits-piper-tr_TR-dfki-medium",
            modelFileName = "tr_TR-dfki-medium.onnx",
            voice = "dfki",
        ),
        AndroidSherpaTtsModelSpec(
            modelId = "en_US-lessac-medium",
            language = "en",
            assetDir = "vits-piper-en_US-lessac-medium",
            modelFileName = "en_US-lessac-medium.onnx",
            voice = "lessac",
        ),
    )

class AndroidSherpaTtsPlayer(private val context: Context) {
    @Volatile
    private var stopped = false
    private var activeTrack: AudioTrack? = null
    private val ttsCache = mutableMapOf<String, OfflineTts>()
    private val ncnnPiperPlayer = AndroidNcnnPiperTtsPlayer(context.applicationContext)
    private val systemEnginePlayer = AndroidSherpaSystemTtsEnginePlayer(context.applicationContext)

    suspend fun speak(
        payload: BridgeTtsPayload,
        onPlaybackStarted: (() -> Unit)? = null,
    ): AndroidSherpaTtsResult =
        withContext(Dispatchers.IO) {
            val spec = resolveModelSpec(payload)
            stopped = false
            if (ncnnPiperPlayer.isSupported(spec.language)) {
                return@withContext ncnnPiperPlayer.speak(payload.copy(language = spec.language), onPlaybackStarted)
            }

            if (systemEnginePlayer.isAvailable()) {
                return@withContext systemEnginePlayer.speak(payload, spec, onPlaybackStarted)
            }

            val tts = obtainTts(spec)
            val sampleRate = tts.sampleRate()
            val track = createAudioTrack(sampleRate)
            var playbackStarted = false

            activeTrack = track
            track.play()

            try {
                val audio =
                    tts.generateWithConfigAndCallback(
                        text = payload.text,
                        config = GenerationConfig(sid = 0, speed = 1.0f),
                        callback = { samples ->
                            if (stopped) {
                                0
                            } else {
                                if (!playbackStarted && samples.isNotEmpty()) {
                                    playbackStarted = true
                                    onPlaybackStarted?.invoke()
                                }
                                track.write(samples, 0, samples.size, AudioTrack.WRITE_BLOCKING)
                                1
                            }
                        },
                    )

                AndroidSherpaTtsResult(
                    stopped = stopped,
                    sampleRate = sampleRate,
                    sampleCount = audio.samples.size,
                )
            } finally {
                runCatching {
                    track.pause()
                    track.flush()
                    track.stop()
                }
                track.release()
                if (activeTrack === track) {
                    activeTrack = null
                }
            }
        }

    fun stop() {
        stopped = true
        ncnnPiperPlayer.stop()
        systemEnginePlayer.stop()
        val track = activeTrack ?: return
        runCatching {
            track.pause()
            track.flush()
        }
    }

    fun release() {
        stop()
        ncnnPiperPlayer.release()
        systemEnginePlayer.release()
        activeTrack?.release()
        activeTrack = null
        ttsCache.values.forEach { tts -> runCatching { tts.release() } }
        ttsCache.clear()
    }

    private fun resolveModelSpec(payload: BridgeTtsPayload): AndroidSherpaTtsModelSpec {
        return ANDROID_SHERPA_TTS_MODELS.firstOrNull { it.modelId == payload.modelId }
            ?: ANDROID_SHERPA_TTS_MODELS.firstOrNull { it.language == payload.language }
            ?: throw IllegalStateException("Unsupported Android TTS language: ${payload.language}")
    }

    private fun obtainTts(spec: AndroidSherpaTtsModelSpec): OfflineTts {
        return ttsCache.getOrPut(spec.modelId) {
            val assetModelDir = "tts-models/${spec.assetDir}"
            val copiedAssetRoot = copyAssetDirectory(assetModelDir)
            val modelDir = File(copiedAssetRoot, assetModelDir).absolutePath
            val dataDir = File(modelDir, "espeak-ng-data").absolutePath
            val config =
                getOfflineTtsConfig(
                    modelDir = modelDir,
                    modelName = spec.modelFileName,
                    acousticModelName = "",
                    vocoder = "",
                    voices = "",
                    lexicon = "",
                    dataDir = dataDir,
                    dictDir = "",
                    ruleFsts = "",
                    ruleFars = "",
                    numThreads = 1,
                )
            OfflineTts(config = config)
        }
    }

    private fun createAudioTrack(sampleRate: Int): AudioTrack {
        val minBufferSize =
            AudioTrack.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_FLOAT,
            )
        val bufferSize = if (minBufferSize > 0) minBufferSize else sampleRate * 2
        val attributes =
            AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .build()
        val format =
            AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .setSampleRate(sampleRate)
                .build()

        return AudioTrack(
            attributes,
            format,
            bufferSize,
            AudioTrack.MODE_STREAM,
            AudioManager.AUDIO_SESSION_ID_GENERATE,
        )
    }

    private fun copyAssetDirectory(assetPath: String): File {
        val externalRoot = context.getExternalFilesDir(null) ?: context.filesDir
        val targetRoot = File(externalRoot, assetPath)
        if (!targetRoot.exists()) {
            targetRoot.mkdirs()
        }

        copyAssetPath(context.assets, assetPath, externalRoot)
        return externalRoot
    }

    private fun copyAssetPath(assetManager: AssetManager, assetPath: String, externalRoot: File) {
        val children = assetManager.list(assetPath).orEmpty()
        if (children.isEmpty()) {
            copyAssetFile(assetManager, assetPath, File(externalRoot, assetPath))
            return
        }

        File(externalRoot, assetPath).mkdirs()
        children.forEach { child ->
            copyAssetPath(assetManager, "$assetPath/$child", externalRoot)
        }
    }

    private fun copyAssetFile(assetManager: AssetManager, assetPath: String, targetFile: File) {
        targetFile.parentFile?.mkdirs()
        if (targetFile.exists() && targetFile.length() > 0L) {
            return
        }
        try {
            assetManager.open(assetPath).use { input ->
                FileOutputStream(targetFile).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var read = input.read(buffer)
                    while (read >= 0) {
                        output.write(buffer, 0, read)
                        read = input.read(buffer)
                    }
                }
            }
        } catch (error: IOException) {
            throw IllegalStateException("Failed to copy Android TTS asset $assetPath.", error)
        }
    }
}

private class AndroidSherpaSystemTtsEnginePlayer(private val context: Context) {
    @Volatile
    private var stopped = false
    private var activeTts: TextToSpeech? = null
    private var activeCompletion: CompletableDeferred<AndroidSherpaTtsResult>? = null

    fun isAvailable(): Boolean {
        return try {
            context.packageManager.getPackageInfo(SHERPA_TTS_ENGINE_PACKAGE, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }
    }

    suspend fun speak(
        payload: BridgeTtsPayload,
        spec: AndroidSherpaTtsModelSpec,
        onPlaybackStarted: (() -> Unit)? = null,
    ): AndroidSherpaTtsResult =
        withContext(Dispatchers.Main.immediate) {
            stopped = false
            val tts = createEngine()
            val completion = CompletableDeferred<AndroidSherpaTtsResult>()
            val utteranceId = "hayalet-tts-${System.nanoTime()}"
            activeTts = tts
            activeCompletion = completion

            val languageResult = tts.setLanguage(spec.locale())
            if (
                languageResult == TextToSpeech.LANG_MISSING_DATA ||
                    languageResult == TextToSpeech.LANG_NOT_SUPPORTED
            ) {
                cleanup(tts)
                throw IllegalStateException(
                    "Installed Sherpa Android TTS Engine does not support ${spec.language}."
                )
            }

            tts.setOnUtteranceProgressListener(
                object : UtteranceProgressListener() {
                    override fun onStart(id: String?) {
                        if (id == utteranceId && !stopped) {
                            onPlaybackStarted?.invoke()
                        }
                    }

                    override fun onDone(id: String?) {
                        if (id == utteranceId) {
                            completion.complete(engineResult(stopped))
                        }
                    }

                    @Deprecated("Deprecated by Android framework")
                    override fun onError(id: String?) {
                        if (id == utteranceId) {
                            completion.completeExceptionally(
                                IllegalStateException("Sherpa Android TTS Engine failed playback.")
                            )
                        }
                    }

                    override fun onError(id: String?, errorCode: Int) {
                        if (id == utteranceId) {
                            completion.completeExceptionally(
                                IllegalStateException(
                                    "Sherpa Android TTS Engine failed playback ($errorCode)."
                                )
                            )
                        }
                    }

                    override fun onStop(id: String?, interrupted: Boolean) {
                        if (id == utteranceId) {
                            completion.complete(engineResult(true))
                        }
                    }
                }
            )

            val speakResult =
                tts.speak(payload.text, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
            if (speakResult == TextToSpeech.ERROR) {
                cleanup(tts)
                throw IllegalStateException("Sherpa Android TTS Engine rejected the speech request.")
            }

            try {
                withTimeout(90_000) { completion.await() }
            } finally {
                cleanup(tts)
            }
        }

    fun stop() {
        stopped = true
        activeTts?.stop()
        activeCompletion?.complete(engineResult(true))
    }

    fun release() {
        stop()
        activeTts?.shutdown()
        activeTts = null
        activeCompletion = null
    }

    private suspend fun createEngine(): TextToSpeech {
        val ready = CompletableDeferred<Unit>()
        lateinit var tts: TextToSpeech
        tts =
            TextToSpeech(
                context,
                { status ->
                    if (status == TextToSpeech.SUCCESS) {
                        ready.complete(Unit)
                    } else {
                        ready.completeExceptionally(
                            IllegalStateException(
                                "Sherpa Android TTS Engine could not be initialized ($status)."
                            )
                        )
                    }
                },
                SHERPA_TTS_ENGINE_PACKAGE,
            )

        return try {
            withTimeout(15_000) { ready.await() }
            tts
        } catch (error: Throwable) {
            tts.shutdown()
            throw error
        }
    }

    private fun cleanup(tts: TextToSpeech) {
        if (activeTts === tts) {
            activeTts = null
            activeCompletion = null
        }
        tts.setOnUtteranceProgressListener(null)
        tts.shutdown()
    }

    private fun engineResult(stopped: Boolean): AndroidSherpaTtsResult =
        AndroidSherpaTtsResult(
            stopped = stopped,
            sampleRate = 0,
            sampleCount = 0,
        )
}

private fun AndroidSherpaTtsModelSpec.locale(): Locale =
    when (language) {
        "tr" -> Locale.forLanguageTag("tr-TR")
        "en" -> Locale.US
        else -> Locale.forLanguageTag(language)
    }

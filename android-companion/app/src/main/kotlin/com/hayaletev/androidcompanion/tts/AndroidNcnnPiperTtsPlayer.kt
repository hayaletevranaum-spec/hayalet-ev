package com.hayaletev.androidcompanion.tts

import android.content.Context
import android.content.res.AssetManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.util.Log
import com.hayaletev.androidcompanion.transport.BridgeTtsPayload
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlin.math.max

private const val NCNN_PIPER_SAMPLE_RATE = 22_050
private const val NCNN_PIPER_TAG = "HayaletNcnnTts"

class AndroidNcnnPiperTtsPlayer(private val context: Context) {
    @Volatile
    private var stopped = false
    private var activeTrack: AudioTrack? = null
    private val native = NcnnPiperNative()

    fun isSupported(language: String): Boolean {
        return NcnnPiperLibrary.available && (language == "tr" || language == "en")
    }

    suspend fun speak(
        payload: BridgeTtsPayload,
        onPlaybackStarted: (() -> Unit)? = null,
    ): AndroidSherpaTtsResult =
        withContext(Dispatchers.IO) {
            val language = normalizeLanguage(payload.language)
            if (!isSupported(language)) {
                throw IllegalStateException("Unsupported ncnn Piper TTS language: ${payload.language}")
            }

            stopped = false
            if (!native.loadModel(context.assets, language)) {
                throw IllegalStateException("ncnn Piper TTS model could not be loaded for $language.")
            }

            val pcm = native.synthesize(payload.text, 0, 1.0f)
            if (stopped) {
                return@withContext AndroidSherpaTtsResult(
                    stopped = true,
                    sampleRate = NCNN_PIPER_SAMPLE_RATE,
                    sampleCount = pcm.size,
                )
            }
            if (pcm.isEmpty()) {
                throw IllegalStateException("ncnn Piper TTS returned no audio.")
            }

            val track = createAudioTrack()
            activeTrack = track
            try {
                track.play()
                onPlaybackStarted?.invoke()
                val written = track.write(pcm, 0, pcm.size, AudioTrack.WRITE_BLOCKING)
                waitForPlayback(track, max(written, 0))
                AndroidSherpaTtsResult(
                    stopped = stopped,
                    sampleRate = NCNN_PIPER_SAMPLE_RATE,
                    sampleCount = pcm.size,
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
        val track = activeTrack ?: return
        runCatching {
            track.pause()
            track.flush()
        }
    }

    fun release() {
        stop()
        native.release()
    }

    private suspend fun waitForPlayback(track: AudioTrack, frameCount: Int) {
        while (!stopped && track.playState == AudioTrack.PLAYSTATE_PLAYING) {
            if (track.playbackHeadPosition >= frameCount) {
                break
            }
            delay(20)
        }
    }

    private fun createAudioTrack(): AudioTrack {
        val minBufferSize =
            AudioTrack.getMinBufferSize(
                NCNN_PIPER_SAMPLE_RATE,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
            )
        val bufferSize = if (minBufferSize > 0) minBufferSize else NCNN_PIPER_SAMPLE_RATE
        val attributes =
            AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .build()
        val format =
            AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .setSampleRate(NCNN_PIPER_SAMPLE_RATE)
                .build()

        return AudioTrack(
            attributes,
            format,
            bufferSize,
            AudioTrack.MODE_STREAM,
            AudioManager.AUDIO_SESSION_ID_GENERATE,
        )
    }

    private fun normalizeLanguage(language: String): String =
        when (language.lowercase()) {
            "tr", "tr-tr" -> "tr"
            "en", "en-us", "en-gb" -> "en"
            else -> language.lowercase()
        }
}

private object NcnnPiperLibrary {
    val available: Boolean =
        runCatching {
                System.loadLibrary("hayalet_tts_ncnn")
                true
            }
            .onFailure { error ->
                Log.w(NCNN_PIPER_TAG, "ncnn Piper native library is unavailable.", error)
            }
            .getOrDefault(false)
}

private class NcnnPiperNative {
    external fun loadModel(assetManager: AssetManager, language: String): Boolean
    external fun synthesize(text: String, speakerId: Int, lengthScale: Float): ShortArray
    external fun release()
}

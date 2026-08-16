package com.hayaletev.androidcompanion.transcript

import com.hayaletev.androidcompanion.debug.CompanionDiagnostics
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import java.io.File

private const val ANDROID_VOSK_SAMPLE_RATE = 16_000.0f
private const val WAV_HEADER_BYTES = 44

class AndroidVoskTranscriber {
    suspend fun transcribe(
        modelDirectory: File,
        audioFile: File,
        language: String,
    ): String = withContext(Dispatchers.Default) {
        CompanionDiagnostics.i(
            "transcript",
            "Starting Android Vosk transcription.",
            "model=${modelDirectory.name}, audio=${audioFile.name}, language=$language",
        )

        val text = Model(modelDirectory.absolutePath).use { model ->
            Recognizer(model, ANDROID_VOSK_SAMPLE_RATE).use { recognizer ->
                audioFile.inputStream().buffered().use { input ->
                    val header = ByteArray(WAV_HEADER_BYTES)
                    input.read(header, 0, header.size)
                    val buffer = ByteArray(4096)
                    while (true) {
                        val read = input.read(buffer)
                        if (read <= 0) {
                            break
                        }
                        recognizer.acceptWaveForm(buffer, read)
                    }
                }
                JSONObject(recognizer.finalResult).optString("text").trim()
            }
        }

        if (text.isBlank()) {
            throw IllegalStateException("Android Vosk returned an empty transcript.")
        }
        CompanionDiagnostics.i("transcript", "Android Vosk transcription completed.")
        text
    }
}

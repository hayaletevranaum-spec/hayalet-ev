package com.hayaletev.androidcompanion.transcript

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import com.hayaletev.androidcompanion.debug.CompanionDiagnostics
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

data class AndroidRecordingResult(
    val file: File,
    val durationMs: Long,
    val sampleRate: Int,
    val bytesWritten: Long,
)

class AndroidAudioRecorder(
    private val context: Context,
    private val scope: CoroutineScope,
) {
    private val sampleRate = 16_000
    private var recorder: AudioRecord? = null
    private var recordingJob: Job? = null
    private var outputFile: File? = null
    private var startedAtMs = 0L
    private var bytesWritten = 0L
    private var recording = false

    suspend fun start(): File = withContext(Dispatchers.Main.immediate) {
        if (recording) {
            throw IllegalStateException("Android dictation recording is already active.")
        }
        if (
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            throw IllegalStateException("Android microphone permission is missing.")
        }

        val bufferSize = resolveBufferSize()
        val nextRecorder = createRecorder(bufferSize)
        if (nextRecorder.state != AudioRecord.STATE_INITIALIZED) {
            nextRecorder.release()
            throw IllegalStateException("Android microphone recorder could not be initialized.")
        }

        val directory = File(context.cacheDir, "transcript-recordings").apply { mkdirs() }
        val file = File(directory, "android-dictation-${System.currentTimeMillis()}.wav")
        outputFile = file
        bytesWritten = 0
        startedAtMs = System.currentTimeMillis()
        recording = true
        nextRecorder.startRecording()
        recorder = nextRecorder
        recordingJob = scope.launch(Dispatchers.IO) {
            writeRecordingLoop(nextRecorder, file, bufferSize)
        }
        CompanionDiagnostics.i(
            "transcript",
            "Android microphone recording started.",
            "file=${file.absolutePath}, sampleRate=$sampleRate",
        )
        file
    }

    suspend fun stop(): AndroidRecordingResult = withContext(Dispatchers.Main.immediate) {
        val activeRecorder = recorder ?: throw IllegalStateException("Android recording is not active.")
        val file = outputFile ?: throw IllegalStateException("Android recording file is missing.")
        recording = false
        runCatching { activeRecorder.stop() }
        recordingJob?.join()
        recordingJob = null
        activeRecorder.release()
        recorder = null
        outputFile = null
        val durationMs = System.currentTimeMillis() - startedAtMs
        CompanionDiagnostics.i(
            "transcript",
            "Android microphone recording stopped.",
            "file=${file.absolutePath}, durationMs=$durationMs, bytes=$bytesWritten",
        )
        AndroidRecordingResult(
            file = file,
            durationMs = durationMs,
            sampleRate = sampleRate,
            bytesWritten = bytesWritten,
        )
    }

    fun cancel() {
        recording = false
        recordingJob?.cancel()
        recordingJob = null
        runCatching { recorder?.stop() }
        recorder?.release()
        recorder = null
        outputFile = null
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

    private fun writeRecordingLoop(recorder: AudioRecord, file: File, bufferSize: Int) {
        RandomAccessFile(file, "rw").use { output ->
            output.setLength(0)
            writeWavHeader(output, 0)
            val buffer = ByteArray(bufferSize)
            while (recording && scope.isActive) {
                val read = recorder.read(buffer, 0, buffer.size)
                if (read > 0) {
                    output.write(buffer, 0, read)
                    bytesWritten += read.toLong()
                }
            }
            writeWavHeader(output, bytesWritten)
        }
    }

    private fun writeWavHeader(output: RandomAccessFile, dataBytes: Long) {
        output.seek(0)
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray(Charsets.US_ASCII))
        header.putInt((36 + dataBytes).toInt())
        header.put("WAVE".toByteArray(Charsets.US_ASCII))
        header.put("fmt ".toByteArray(Charsets.US_ASCII))
        header.putInt(16)
        header.putShort(1)
        header.putShort(1)
        header.putInt(sampleRate)
        header.putInt(sampleRate * 2)
        header.putShort(2)
        header.putShort(16)
        header.put("data".toByteArray(Charsets.US_ASCII))
        header.putInt(dataBytes.toInt())
        output.write(header.array())
        output.seek(44 + dataBytes)
    }
}

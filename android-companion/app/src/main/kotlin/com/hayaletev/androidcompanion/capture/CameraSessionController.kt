package com.hayaletev.androidcompanion.capture

import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.os.SystemClock
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture.FLASH_MODE_AUTO
import androidx.camera.core.ImageCapture.FLASH_MODE_OFF
import androidx.camera.core.ImageCapture.FLASH_MODE_ON
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.UseCase
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.hayaletev.androidcompanion.debug.CompanionDiagnostics
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

private const val LIVE_PREVIEW_FRAME_INTERVAL_MS = 100L
private const val LIVE_PREVIEW_JPEG_QUALITY = 55

enum class CaptureLens {
    BACK,
    FRONT,
}

enum class CapturePhotoQuality {
    HIGH,
    BALANCED,
}

enum class CapturePhotoFlashMode {
    OFF,
    AUTO,
    ON,
}

data class CameraSessionConfig(
    val lens: CaptureLens = CaptureLens.BACK,
    val photoQuality: CapturePhotoQuality = CapturePhotoQuality.HIGH,
    val photoFlashMode: CapturePhotoFlashMode = CapturePhotoFlashMode.OFF,
)

data class CameraPreviewFrame(
    val jpegBytes: ByteArray,
    val width: Int,
    val height: Int,
    val capturedAtMs: Long,
)

class CameraSessionController(
    private val activity: AppCompatActivity,
    private val previewView: PreviewView,
) {
    private var cameraProvider: ProcessCameraProvider? = null
    private var imageCapture: ImageCapture? = null
    private var imageAnalysis: ImageAnalysis? = null
    private var activeCamera: Camera? = null
    private var currentConfig: CameraSessionConfig? = null
    private var livePreviewFrameSink: ((CameraPreviewFrame) -> Unit)? = null
    private var liveAnalysisEnabled = false
    private var lastLiveFrameAtMs = 0L
    private val analysisExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    fun isPreviewBound(): Boolean = imageCapture != null

    fun setTorchOnBoundCamera(enabled: Boolean): Boolean {
        val camera = activeCamera ?: return false
        if (!camera.cameraInfo.hasFlashUnit()) {
            return false
        }
        camera.cameraControl.enableTorch(enabled)
        return true
    }

    fun setLivePreviewFrameSink(sink: ((CameraPreviewFrame) -> Unit)?) {
        livePreviewFrameSink = sink
        if (sink == null) {
            lastLiveFrameAtMs = 0L
            CompanionDiagnostics.setState("Live feed", "Idle")
        }
    }

    suspend fun ensurePreview(config: CameraSessionConfig) {
        val wantsLiveAnalysis = livePreviewFrameSink != null
        if (imageCapture != null && currentConfig == config && liveAnalysisEnabled == wantsLiveAnalysis) {
            CompanionDiagnostics.d("camera", "Camera preview is already active.", describeConfig(config))
            return
        }

        CompanionDiagnostics.i("camera", "Binding camera preview.", describeConfig(config))
        suspendCancellableCoroutine { continuation ->
            val cameraProviderFuture = ProcessCameraProvider.getInstance(activity)
            cameraProviderFuture.addListener(
                {
                    try {
                        val resolvedProvider = cameraProviderFuture.get()
                        val preview =
                            Preview.Builder().build().also {
                                it.surfaceProvider = previewView.surfaceProvider
                            }
                        val nextImageAnalysis =
                            if (wantsLiveAnalysis) {
                                ImageAnalysis.Builder()
                                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                    .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
                                    .build()
                                    .also { analysis ->
                                        analysis.setAnalyzer(analysisExecutor) { image ->
                                            analyzeLivePreviewFrame(image)
                                        }
                                    }
                            } else {
                                null
                            }
                        val nextImageCapture =
                            ImageCapture.Builder()
                                .setCaptureMode(
                                    if (config.photoQuality == CapturePhotoQuality.HIGH) {
                                        ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY
                                    } else {
                                        ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY
                                    }
                                )
                                .setJpegQuality(
                                    if (config.photoQuality == CapturePhotoQuality.HIGH) 95 else 82
                                )
                                .setFlashMode(
                                    when (config.photoFlashMode) {
                                        CapturePhotoFlashMode.AUTO -> FLASH_MODE_AUTO
                                        CapturePhotoFlashMode.ON -> FLASH_MODE_ON
                                        CapturePhotoFlashMode.OFF -> FLASH_MODE_OFF
                                    }
                                )
                                .build()
                        resolvedProvider.unbindAll()
                        val useCases =
                            if (nextImageAnalysis != null) {
                                arrayOf<UseCase>(preview, nextImageCapture, nextImageAnalysis)
                            } else {
                                arrayOf<UseCase>(preview, nextImageCapture)
                            }
                        val boundCamera = resolvedProvider.bindToLifecycle(
                            activity,
                            if (config.lens == CaptureLens.FRONT) {
                                CameraSelector.DEFAULT_FRONT_CAMERA
                            } else {
                                CameraSelector.DEFAULT_BACK_CAMERA
                            },
                            *useCases,
                        )

                        cameraProvider = resolvedProvider
                        imageCapture = nextImageCapture
                        activeCamera = boundCamera
                        imageAnalysis = nextImageAnalysis
                        currentConfig = config
                        liveAnalysisEnabled = nextImageAnalysis != null
                        CompanionDiagnostics.setState("Camera preview", "Bound (${describeConfig(config)})")
                        CompanionDiagnostics.setState(
                            "Live feed",
                            if (liveAnalysisEnabled) "Streaming" else "Idle",
                        )
                        CompanionDiagnostics.i("camera", "Camera preview is active.", describeConfig(config))
                        continuation.resume(Unit)
                    } catch (error: Exception) {
                        CompanionDiagnostics.e("camera", "Failed to bind camera preview.", throwable = error)
                        continuation.resumeWithException(error)
                    }
                },
                ContextCompat.getMainExecutor(activity),
            )
        }
    }

    fun stopSession() {
        if (imageCapture != null) {
            CompanionDiagnostics.i("camera", "Stopping camera preview session.")
        }
        imageAnalysis?.clearAnalyzer()
        cameraProvider?.unbindAll()
        imageCapture = null
        imageAnalysis = null
        activeCamera = null
        currentConfig = null
        liveAnalysisEnabled = false
        livePreviewFrameSink = null
        lastLiveFrameAtMs = 0L
        CompanionDiagnostics.setState("Camera preview", "Idle")
        CompanionDiagnostics.setState("Live feed", "Idle")
    }

    suspend fun takePhoto(outputFile: File): File {
        val capture = imageCapture ?: throw IllegalStateException("Camera preview is not ready yet.")
        val outputOptions = ImageCapture.OutputFileOptions.Builder(outputFile).build()
        CompanionDiagnostics.i("camera", "Capturing photo.", outputFile.name)
        return suspendCancellableCoroutine { continuation ->
            capture.takePicture(
                outputOptions,
                ContextCompat.getMainExecutor(activity),
                object : ImageCapture.OnImageSavedCallback {
                    override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                        CompanionDiagnostics.i("camera", "Photo capture completed.", outputFile.name)
                        continuation.resume(outputFile)
                    }

                    override fun onError(exception: ImageCaptureException) {
                        CompanionDiagnostics.e("camera", "Photo capture failed.", throwable = exception)
                        continuation.resumeWithException(exception)
                    }
                },
            )
        }
    }

    private fun describeConfig(config: CameraSessionConfig): String {
        return buildString {
            append(config.lens.name.lowercase(Locale.US))
            append(" / ")
            append(config.photoQuality.name.lowercase(Locale.US))
            append(" / flash=")
            append(config.photoFlashMode.name.lowercase(Locale.US))
        }
    }

    private fun analyzeLivePreviewFrame(image: ImageProxy) {
        try {
            val nowMs = SystemClock.elapsedRealtime()
            if (nowMs - lastLiveFrameAtMs < LIVE_PREVIEW_FRAME_INTERVAL_MS) {
                return
            }
            val sink = livePreviewFrameSink ?: return
            if (image.format != ImageFormat.YUV_420_888) {
                return
            }

            val jpegBytes = imageProxyToJpeg(image)
            lastLiveFrameAtMs = nowMs
            sink(
                CameraPreviewFrame(
                    jpegBytes = jpegBytes,
                    width = image.width,
                    height = image.height,
                    capturedAtMs = System.currentTimeMillis(),
                ),
            )
        } catch (error: Exception) {
            CompanionDiagnostics.w("camera", "Live preview frame was dropped.", throwable = error)
        } finally {
            image.close()
        }
    }

    private fun imageProxyToJpeg(image: ImageProxy): ByteArray {
        val nv21 = imageProxyToNv21(image)
        val output = ByteArrayOutputStream()
        YuvImage(nv21, ImageFormat.NV21, image.width, image.height, null)
            .compressToJpeg(
                Rect(0, 0, image.width, image.height),
                LIVE_PREVIEW_JPEG_QUALITY,
                output,
            )
        return output.toByteArray()
    }

    private fun imageProxyToNv21(image: ImageProxy): ByteArray {
        val width = image.width
        val height = image.height
        val ySize = width * height
        val output = ByteArray(ySize + ySize / 2)
        val yPlane = image.planes[0]
        val uPlane = image.planes[1]
        val vPlane = image.planes[2]
        val yBuffer = yPlane.buffer
        for (row in 0 until height) {
            val sourceOffset = row * yPlane.rowStride
            val targetOffset = row * width
            yBuffer.position(sourceOffset)
            yBuffer.get(output, targetOffset, width)
        }

        val uBuffer = uPlane.buffer
        val vBuffer = vPlane.buffer
        val chromaHeight = height / 2
        val chromaWidth = width / 2
        for (row in 0 until chromaHeight) {
            for (column in 0 until chromaWidth) {
                val outputIndex = ySize + row * width + column * 2
                val uIndex = row * uPlane.rowStride + column * uPlane.pixelStride
                val vIndex = row * vPlane.rowStride + column * vPlane.pixelStride
                output[outputIndex] = vBuffer.get(vIndex)
                output[outputIndex + 1] = uBuffer.get(uIndex)
            }
        }
        return output
    }

}

package com.hayaletev.androidcompanion.session

import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.media.ToneGenerator
import android.hardware.camera2.CameraManager
import android.os.SystemClock
import com.hayaletev.androidcompanion.R
import com.hayaletev.androidcompanion.capture.CameraPreviewFrame
import com.hayaletev.androidcompanion.capture.CameraSessionConfig
import com.hayaletev.androidcompanion.capture.CameraSessionController
import com.hayaletev.androidcompanion.capture.CaptureLens
import com.hayaletev.androidcompanion.capture.CapturePhotoFlashMode
import com.hayaletev.androidcompanion.capture.CapturePhotoQuality
import com.hayaletev.androidcompanion.debug.CompanionDiagnostics
import com.hayaletev.androidcompanion.model.CompanionManifest
import com.hayaletev.androidcompanion.transcript.AndroidAudioRecorder
import com.hayaletev.androidcompanion.transcript.AndroidAmbientListenerConfig
import com.hayaletev.androidcompanion.transcript.AndroidAmbientOpenWakeListener
import com.hayaletev.androidcompanion.transcript.AndroidAmbientTranscript
import com.hayaletev.androidcompanion.transcript.AndroidRecordingResult
import com.hayaletev.androidcompanion.transcript.AndroidVoskTranscriber
import com.hayaletev.androidcompanion.transcript.TranscriptModelManager
import com.hayaletev.androidcompanion.transcript.requireAndroidVoskModelProfile
import com.hayaletev.androidcompanion.tts.AndroidSherpaTtsPlayer
import com.hayaletev.androidcompanion.transport.BridgeCommand
import com.hayaletev.androidcompanion.transport.BridgeCommandProfile
import com.hayaletev.androidcompanion.transport.BridgeOperationRecord
import com.hayaletev.androidcompanion.transport.BridgePermissions
import com.hayaletev.androidcompanion.transport.BridgeTorchPayload
import com.hayaletev.androidcompanion.transport.BridgeTranscriptModelProfile
import com.hayaletev.androidcompanion.transport.BridgeTtsPayload
import com.hayaletev.androidcompanion.transport.DesktopBridgeClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val BRIDGE_OFFLINE_RETRY_MS = 5_000L
private const val DIAGNOSTICS_SYNC_INTERVAL_MS = 15_000L
private const val AMBIENT_HISTORY_LIMIT = 12

data class CompanionUiState(
    val connectionStatus: String,
    val target: String,
    val permissionsSummary: String,
    val operationsSummary: String? = null,
    val dictationStatus: String? = null,
    val dictationDetail: String? = null,
    val dictationModel: String? = null,
    val ambientMicrophoneStatus: String? = null,
    val ambientListeningStatus: String? = null,
    val ambientDetail: String? = null,
    val ambientWakePhrase: String? = null,
    val ambientHistory: String? = null,
    val ttsStatus: String? = null,
    val ttsDetail: String? = null,
    val ttsModel: String? = null,
    val ttsTextSummary: String? = null,
    val torchStatus: String? = null,
)

data class CompanionLaunchContext(
    val deviceId: String = "android-companion",
    val target: String = "analyze-compose",
    val cameraConfig: CameraSessionConfig = CameraSessionConfig(),
    val transcriptModel: BridgeTranscriptModelProfile? = null,
)

class CompanionSessionCoordinator(
    private val appContext: Context,
    private val scope: CoroutineScope,
    private val manifest: CompanionManifest,
    private val bridgeClient: DesktopBridgeClient,
    private val cameraController: CameraSessionController,
    private val onUiState: (CompanionUiState) -> Unit,
) {
    private var launchContext = CompanionLaunchContext()
    private var pollJob: Job? = null
    private var lastBridgeFailureSignature: String? = null
    private var lastDiagnosticsSyncFailureSignature: String? = null
    private var lastOperationsSyncFailureSignature: String? = null
    private var lastDiagnosticsSyncAtMs = -DIAGNOSTICS_SYNC_INTERVAL_MS
    private var lastUiState: CompanionUiState? = null
    private var bridgeConnected = false
    private val audioRecorder = AndroidAudioRecorder(appContext, scope)
    private val ambientListener = AndroidAmbientOpenWakeListener(appContext, scope)
    private val modelManager = TranscriptModelManager(appContext, bridgeClient)
    private val voskTranscriber = AndroidVoskTranscriber()
    private val ttsPlayer = AndroidSherpaTtsPlayer(appContext)
    private val cameraManager = appContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    private var ambientTone: ToneGenerator? =
        runCatching { ToneGenerator(AudioManager.STREAM_MUSIC, 70) }.getOrNull()
    private var ttsJob: Job? = null
    private var activeTtsRequestId: String? = null
    private var activeTtsPayload: BridgeTtsPayload? = null
    private var livePreviewRequestId: String? = null
    private var livePreviewUploadInFlight = false
    private var lastLivePreviewFailureSignature: String? = null
    private val livePreviewUploadLock = Any()
    private var dictationStatus = appContext.getString(R.string.dictation_status_idle)
    private var dictationDetail = appContext.getString(R.string.dictation_detail_waiting)
    private var ambientMicrophoneStatus = appContext.getString(R.string.ambient_microphone_idle)
    private var ambientListeningStatus = appContext.getString(R.string.ambient_status_idle)
    private var ambientDetail = appContext.getString(R.string.ambient_detail_waiting)
    private var ambientWakePhraseSummary = "Hey Jarvis"
    private var ttsStatus = appContext.getString(R.string.tts_status_idle)
    private var ttsDetail = appContext.getString(R.string.tts_detail_waiting)
    private var ttsModel = appContext.getString(R.string.tts_model_waiting)
    private var ttsTextSummary = appContext.getString(R.string.tts_text_empty)
    private var torchEnabled = false
    private var torchCameraId: String? = null
    private var operationsSummary = appContext.getString(R.string.operations_status_idle)
    private val ambientHistoryEntries = mutableListOf<String>()
    private val ambientHistoryClock = SimpleDateFormat("HH:mm:ss", Locale.US)

    fun updateLaunchContext(intent: Intent?) {
        val deviceId = intent?.getStringExtra("deviceId")?.trim().orEmpty()
        val target = intent?.getStringExtra("target")?.trim().orEmpty()

        launchContext =
            launchContext.copy(
                deviceId = if (deviceId.isNotEmpty()) deviceId else launchContext.deviceId,
                target = if (target.isNotEmpty()) target else launchContext.target,
                cameraConfig =
                    CameraSessionConfig(
                        lens =
                            if (intent?.getStringExtra("defaultLens") == "front") {
                                CaptureLens.FRONT
                            } else {
                                CaptureLens.BACK
                            },
                        photoQuality =
                            if (intent?.getStringExtra("photoQuality") == "balanced") {
                                CapturePhotoQuality.BALANCED
                            } else {
                                CapturePhotoQuality.HIGH
                            },
                        photoFlashMode = resolvePhotoFlashMode(
                            intent?.getStringExtra("photoFlashMode")
                                ?: if (intent?.getBooleanExtra("photoFlashEnabled", false) == true) "on" else "off",
                        ),
                    ),
            )

        publishLaunchContextDiagnostics()
        CompanionDiagnostics.i(
            "intent",
            "Launch context updated.",
            buildLaunchContextSummary(),
        )
        publishUiState(
            connectionStatus = appContext.getString(R.string.status_waiting_desktop),
            permissionsSummary = appContext.getString(R.string.permissions_missing),
        )
    }

    fun start(hasPermissions: () -> Boolean) {
        if (pollJob != null) {
            CompanionDiagnostics.d("session", "Desktop session loop is already running.")
            return
        }

        CompanionDiagnostics.i("session", "Starting desktop session loop.")
        CompanionDiagnostics.setState("Session loop", "Running")
        pollJob =
            scope.launch(Dispatchers.Main.immediate) {
                while (isActive) {
                    if (!hasPermissions()) {
                        bridgeConnected = false
                        CompanionDiagnostics.setState("Bridge", "Blocked by missing permissions")
                        publishUiState(
                            connectionStatus = appContext.getString(R.string.status_permissions_required),
                            permissionsSummary = appContext.getString(R.string.permissions_missing),
                        )
                        delay(BRIDGE_OFFLINE_RETRY_MS)
                        continue
                    }

                    var nextDelayMs = manifest.commandPollIntervalMs.toLong()
                    try {
                        if (bridgeConnected.not() && lastBridgeFailureSignature == null) {
                            publishUiState(
                                connectionStatus = appContext.getString(R.string.status_connecting_desktop),
                                permissionsSummary = appContext.getString(R.string.permissions_ready),
                            )
                        }

                        val commands =
                            bridgeClient.registerSession(
                                deviceId = launchContext.deviceId,
                                target = launchContext.target,
                                permissions = BridgePermissions(camera = "granted", microphone = "granted"),
                                previewActive = cameraController.isPreviewBound(),
                                reportFailureToDiagnostics = false,
                            ) + bridgeClient.pollCommands(
                                launchContext.deviceId,
                                reportFailureToDiagnostics = false,
                            )
                        val uniqueCommands = commands.distinctBy { it.id }
                        CompanionDiagnostics.setState("Bridge", "Connected")
                        CompanionDiagnostics.clearState("Last bridge error")
                        if (bridgeConnected.not()) {
                            CompanionDiagnostics.i(
                                "bridge",
                                "Desktop bridge connected.",
                                buildLaunchContextSummary(),
                            )
                        }
                        bridgeConnected = true
                        lastBridgeFailureSignature = null
                        if (uniqueCommands.isNotEmpty()) {
                            CompanionDiagnostics.i(
                                "bridge",
                                "Received ${uniqueCommands.size} command(s) from desktop.",
                                uniqueCommands.joinToString(", ") { it.kind },
                            )
                        }

                        syncOperationsSnapshot()
                        publishUiState(
                            connectionStatus = appContext.getString(R.string.status_connected_desktop),
                            permissionsSummary = appContext.getString(R.string.permissions_ready),
                        )

                        uniqueCommands.forEach { command ->
                            handleCommand(command)
                        }
                        syncDiagnosticsSnapshotIfDue()
                    } catch (error: Exception) {
                        nextDelayMs = BRIDGE_OFFLINE_RETRY_MS
                        bridgeConnected = false
                        val errorSignature = summarizeError(error)
                        CompanionDiagnostics.setState("Bridge", "Waiting for desktop")
                        CompanionDiagnostics.setState("Last bridge error", errorSignature)
                        if (lastBridgeFailureSignature != errorSignature) {
                            CompanionDiagnostics.w(
                                "bridge",
                                "Desktop bridge loop is waiting for a healthy connection.",
                                throwable = error,
                            )
                        }
                        lastBridgeFailureSignature = errorSignature
                        publishUiState(
                            connectionStatus = appContext.getString(R.string.status_waiting_desktop),
                            permissionsSummary = appContext.getString(R.string.permissions_ready),
                        )
                    }

                    delay(nextDelayMs)
                }
            }
    }

    fun stop() {
        CompanionDiagnostics.i("session", "Stopping desktop session loop.")
        pollJob?.cancel()
        pollJob = null
        bridgeConnected = false
        CompanionDiagnostics.setState("Session loop", "Stopped")
        CompanionDiagnostics.setState("Bridge", "Idle")
        updateDictationUi(
            appContext.getString(R.string.dictation_status_idle),
            appContext.getString(R.string.dictation_detail_waiting),
        )
        ambientListener.stop()
        updateAmbientUi("stopped", appContext.getString(R.string.ambient_event_stopped), null)
        audioRecorder.cancel()
        stopLivePreviewStreaming()
        setTorch(false)
        cameraController.stopSession()
        ttsPlayer.stop()
        ttsJob?.cancel()
        ttsJob = null
        activeTtsRequestId = null
        activeTtsPayload = null
        operationsSummary = appContext.getString(R.string.operations_status_idle)
        updateTtsUi(
            appContext.getString(R.string.tts_status_idle),
            appContext.getString(R.string.tts_detail_waiting),
            null,
        )
    }

    fun destroy() {
        CompanionDiagnostics.i("session", "Destroying session coordinator.")
        stop()
        ttsPlayer.release()
        ambientTone?.release()
        ambientTone = null
    }

    suspend fun captureManualPhoto(): File {
        cameraController.ensurePreview(launchContext.cameraConfig)
        val file = File.createTempFile("analyze-capture-", ".jpg", appContext.cacheDir)
        val captured = cameraController.takePhoto(file)
        CompanionDiagnostics.i(
            "manual-image",
            "Manual phone capture completed.",
            "target=${launchContext.target}, file=${captured.name}",
        )
        return captured
    }

    suspend fun uploadManualPhoto(file: File) {
        bridgeClient.uploadAnalyzeCapture(
            deviceId = launchContext.deviceId,
            target = launchContext.target,
            requestId = "manual-${SystemClock.elapsedRealtime()}",
            file = file,
            stageForAnalyze = true,
        )
        CompanionDiagnostics.i(
            "manual-image",
            "Manual phone capture uploaded to Analyze.",
            "target=${launchContext.target}, file=${file.name}",
        )
    }

    private fun startLivePreviewStreaming(command: BridgeCommand) {
        val requestId = command.requestId ?: command.id
        livePreviewRequestId = requestId
        livePreviewUploadInFlight = false
        lastLivePreviewFailureSignature = null
        cameraController.setLivePreviewFrameSink { frame ->
            submitLivePreviewFrame(command.target, requestId, frame)
        }
        CompanionDiagnostics.setState("Live feed", "Streaming")
        CompanionDiagnostics.i(
            "camera",
            "Desktop live preview streaming is enabled.",
            "target=${command.target}, requestId=$requestId",
        )
    }

    private fun stopLivePreviewStreaming() {
        livePreviewRequestId = null
        synchronized(livePreviewUploadLock) {
            livePreviewUploadInFlight = false
        }
        lastLivePreviewFailureSignature = null
        cameraController.setLivePreviewFrameSink(null)
        CompanionDiagnostics.setState("Live feed", "Idle")
    }

    private fun submitLivePreviewFrame(
        target: String,
        requestId: String,
        frame: CameraPreviewFrame,
    ) {
        val shouldUpload =
            synchronized(livePreviewUploadLock) {
                if (livePreviewRequestId != requestId || livePreviewUploadInFlight) {
                    false
                } else {
                    livePreviewUploadInFlight = true
                    true
                }
            }
        if (!shouldUpload) {
            return
        }

        scope.launch(Dispatchers.IO) {
            try {
                bridgeClient.submitLiveCameraFrame(
                    deviceId = launchContext.deviceId,
                    target = target,
                    requestId = requestId,
                    frame = frame,
                )
                lastLivePreviewFailureSignature = null
            } catch (error: Exception) {
                val signature = summarizeError(error)
                if (lastLivePreviewFailureSignature != signature) {
                    CompanionDiagnostics.w(
                        "camera",
                        "Live preview frame upload failed.",
                        throwable = error,
                    )
                }
                lastLivePreviewFailureSignature = signature
            } finally {
                synchronized(livePreviewUploadLock) {
                    livePreviewUploadInFlight = false
                }
            }
        }
    }

    private suspend fun handleCommand(command: BridgeCommand) {
        applyCommandProfile(command.profile)
        CompanionDiagnostics.setState("Last command", command.kind)
        CompanionDiagnostics.i(
            "command",
            "Handling command ${command.kind}.",
            "target=${command.target}",
        )
        runCatching {
            when (command.kind) {
                "open-camera" -> {
                    if (command.profile?.livePreview == true) {
                        startLivePreviewStreaming(command)
                    } else {
                        stopLivePreviewStreaming()
                    }
                    cameraController.ensurePreview(launchContext.cameraConfig)
                    bridgeClient.acknowledgeCommand(
                        deviceId = launchContext.deviceId,
                        command = command,
                        status = "accepted",
                        message = "Phone preview is active.",
                        previewActive = cameraController.isPreviewBound(),
                    )
                }

                "capture-photo" -> {
                    cameraController.ensurePreview(launchContext.cameraConfig)
                    val file = File.createTempFile("analyze-capture-", ".jpg", appContext.cacheDir)
                    val captured = cameraController.takePhoto(file)
                    bridgeClient.uploadAnalyzeCapture(
                        launchContext.deviceId,
                        command.target,
                        command.requestId ?: command.id,
                        captured,
                        stageForAnalyze = true,
                    )
                    bridgeClient.acknowledgeCommand(
                        deviceId = launchContext.deviceId,
                        command = command,
                        status = "done",
                        message = "Phone capture uploaded to Hayalet Ev.",
                        previewActive = cameraController.isPreviewBound(),
                    )
                }

                "retake-photo" -> {
                    cameraController.ensurePreview(launchContext.cameraConfig)
                    bridgeClient.acknowledgeCommand(
                        deviceId = launchContext.deviceId,
                        command = command,
                        status = "accepted",
                        message = "Ready to retake the phone capture.",
                        previewActive = cameraController.isPreviewBound(),
                    )
                }

                "close-camera" -> {
                    ambientListener.stop()
                    updateAmbientUi("stopped", appContext.getString(R.string.ambient_event_stopped), null)
                    audioRecorder.cancel()
                    stopLivePreviewStreaming()
                    updateDictationUi(
                        appContext.getString(R.string.dictation_status_idle),
                        appContext.getString(R.string.dictation_detail_waiting),
                    )
                    cameraController.stopSession()
                    bridgeClient.acknowledgeCommand(
                        deviceId = launchContext.deviceId,
                        command = command,
                        status = "done",
                        message = "Phone capture session closed.",
                        previewActive = cameraController.isPreviewBound(),
                    )
                }

                "start-dictation" -> {
                    ambientListener.stop()
                    val file = audioRecorder.start()
                    updateDictationUi(
                        appContext.getString(R.string.dictation_status_recording),
                        appContext.getString(R.string.dictation_detail_recording_file, file.name),
                    )
                    publishUiState(
                        connectionStatus = appContext.getString(R.string.status_connected_desktop),
                        permissionsSummary = appContext.getString(R.string.permissions_ready),
                    )
                    bridgeClient.acknowledgeCommand(
                        deviceId = launchContext.deviceId,
                        command = command,
                        status = "accepted",
                        message = "Android microphone recording started.",
                        previewActive = cameraController.isPreviewBound(),
                    )
                    CompanionDiagnostics.setState("Dictation recording", file.name)
                }

                "stop-dictation" -> {
                    val recording = audioRecorder.stop()
                    updateDictationUi(
                        appContext.getString(R.string.dictation_status_recorded),
                        appContext.getString(
                            R.string.dictation_detail_recorded,
                            recording.durationMs,
                            recording.bytesWritten,
                        ),
                    )
                    publishUiState(
                        connectionStatus = appContext.getString(R.string.status_connected_desktop),
                        permissionsSummary = appContext.getString(R.string.permissions_ready),
                    )
                    bridgeClient.acknowledgeCommand(
                        deviceId = launchContext.deviceId,
                        command = command,
                        status = "accepted",
                        message = "Android microphone recording stopped; transcribing on phone.",
                        previewActive = cameraController.isPreviewBound(),
                    )
                    updateDictationUi(
                        appContext.getString(R.string.dictation_status_transcribing),
                        appContext.getString(R.string.dictation_detail_transcribing),
                    )
                    publishUiState(
                        connectionStatus = appContext.getString(R.string.status_connected_desktop),
                        permissionsSummary = appContext.getString(R.string.permissions_ready),
                    )
                    val modelProfile = requireAndroidVoskModelProfile(launchContext.transcriptModel)
                    val model = modelManager.ensureModel(modelProfile)
                    val transcript =
                        voskTranscriber.transcribe(
                            modelDirectory = model,
                            audioFile = recording.file,
                            language = modelProfile.language,
                        )
                    bridgeClient.submitTranscript(
                        requestId = command.requestId ?: command.id,
                        deviceId = launchContext.deviceId,
                        target = command.target,
                        text = transcript,
                        isFinal = true,
                        metadata = buildTranscriptMetadata(recording, modelProfile),
                    )
                    updateDictationUi(
                        appContext.getString(R.string.dictation_status_done),
                        appContext.getString(
                            R.string.dictation_detail_done,
                            transcript.replace(Regex("\\s+"), " ").take(120),
                        ),
                    )
                    publishUiState(
                        connectionStatus = appContext.getString(R.string.status_connected_desktop),
                        permissionsSummary = appContext.getString(R.string.permissions_ready),
                    )
                    bridgeClient.acknowledgeCommand(
                        deviceId = launchContext.deviceId,
                        command = command,
                        status = "done",
                        message = "Android Vosk transcript submitted.",
                        previewActive = cameraController.isPreviewBound(),
                    )
                }

                "start-ambient-listener" -> {
                    audioRecorder.cancel()
                    updateAmbientUi(
                        "preparing",
                        appContext.getString(R.string.ambient_event_preparing),
                        null,
                    )
                    publishUiState(
                        connectionStatus = appContext.getString(R.string.status_connected_desktop),
                        permissionsSummary = appContext.getString(R.string.permissions_ready),
                    )
                    val modelProfile = requireAndroidVoskModelProfile(launchContext.transcriptModel)
                    val model = modelManager.ensureModel(modelProfile)
                    val ambientOptions = command.ambient
                    val requestId = command.requestId ?: command.id
                    ambientWakePhraseSummary =
                        ambientOptions?.wakePhrases?.joinToString(", ") ?: "Hey Jarvis"
                    ambientListener.start(
                        config =
                            AndroidAmbientListenerConfig(
                                requestId = requestId,
                                target = command.target,
                                wakePhrases = ambientOptions?.wakePhrases ?: listOf("Hey Jarvis"),
                                activeWindowMs = ambientOptions?.activeWindowMs ?: 6_000L,
                                silenceTimeoutMs = ambientOptions?.silenceTimeoutMs ?: 1_200L,
                                modelProfile = modelProfile,
                                modelDirectory = model,
                            ),
                        onStatus = { status, message, transcript, metadata ->
                            publishAmbientStatus(
                                requestId = requestId,
                                target = command.target,
                                status = status,
                                message = message,
                                transcript = transcript,
                                metadata = metadata,
                            )
                        },
                        onTranscript = { transcript ->
                            bridgeClient.submitTranscript(
                                requestId = requestId,
                                deviceId = launchContext.deviceId,
                                target = command.target,
                                text = transcript.text,
                                isFinal = true,
                                metadata = buildAmbientTranscriptMetadata(transcript, modelProfile),
                            )
                        },
                    )
                    updateDictationUi(
                        appContext.getString(R.string.dictation_status_ambient),
                        appContext.getString(
                            R.string.dictation_detail_ambient,
                            ambientWakePhraseSummary,
                        ),
                    )
                    publishUiState(
                        connectionStatus = appContext.getString(R.string.status_connected_desktop),
                        permissionsSummary = appContext.getString(R.string.permissions_ready),
                    )
                    bridgeClient.acknowledgeCommand(
                        deviceId = launchContext.deviceId,
                        command = command,
                        status = "accepted",
                        message = "Android ambient listener started.",
                        previewActive = cameraController.isPreviewBound(),
                    )
                }

                "stop-ambient-listener" -> {
                    ambientListener.stop()
                    publishAmbientStatus(
                        requestId = command.requestId ?: command.id,
                        target = command.target,
                        status = "stopped",
                        message = "Android ambient listener stopped.",
                    )
                    bridgeClient.acknowledgeCommand(
                        deviceId = launchContext.deviceId,
                        command = command,
                        status = "done",
                        message = "Android ambient listener stopped.",
                        previewActive = cameraController.isPreviewBound(),
                    )
                }

                "start-tts" -> {
                    audioRecorder.cancel()
                    ambientListener.stop()
                    activeTtsRequestId = null
                    ttsPlayer.stop()
                    ttsJob?.cancel()
                    ttsJob = null
                    val payload = command.tts
                        ?: throw IllegalStateException(appContext.getString(R.string.tts_error_missing_payload))
                    val requestId = command.requestId ?: command.id
                    activeTtsRequestId = requestId
                    activeTtsPayload = payload
                    updateTtsUi(
                        appContext.getString(R.string.tts_status_preparing),
                        appContext.getString(R.string.tts_detail_preparing),
                        payload,
                    )
                    publishUiState(
                        connectionStatus = appContext.getString(R.string.status_connected_desktop),
                        permissionsSummary = appContext.getString(R.string.permissions_ready),
                    )
                    bridgeClient.submitTtsStatus(
                        requestId = requestId,
                        deviceId = launchContext.deviceId,
                        target = command.target,
                        status = "preparing",
                        message = "Android companion accepted TTS command.",
                        progress = 0.2,
                        language = payload.language,
                        modelId = payload.modelId,
                    )
                    bridgeClient.acknowledgeCommand(
                        deviceId = launchContext.deviceId,
                        command = command,
                        status = "accepted",
                        message = "Android sherpa-onnx TTS request accepted.",
                        previewActive = cameraController.isPreviewBound(),
                    )
                    ttsJob =
                        scope.launch {
                            runCatching {
                                bridgeClient.submitTtsStatus(
                                    requestId = requestId,
                                    deviceId = launchContext.deviceId,
                                    target = command.target,
                                    status = "preparing",
                                    message = "Preparing Android sherpa-onnx TTS runtime on the phone.",
                                    progress = 0.35,
                                    language = payload.language,
                                    modelId = payload.modelId,
                                )
                                val result =
                                    ttsPlayer.speak(payload) {
                                        scope.launch {
                                            if (activeTtsRequestId == requestId) {
                                                withContext(Dispatchers.Main.immediate) {
                                                    updateTtsUi(
                                                        appContext.getString(R.string.tts_status_playing),
                                                        appContext.getString(R.string.tts_detail_playing),
                                                        payload,
                                                    )
                                                    publishUiState(
                                                        connectionStatus =
                                                            appContext.getString(R.string.status_connected_desktop),
                                                        permissionsSummary =
                                                            appContext.getString(R.string.permissions_ready),
                                                    )
                                                }
                                                bridgeClient.submitTtsStatus(
                                                    requestId = requestId,
                                                    deviceId = launchContext.deviceId,
                                                    target = command.target,
                                                    status = "playing",
                                                    message = "Android companion is playing TTS on the phone.",
                                                    progress = 0.45,
                                                    language = payload.language,
                                                    modelId = payload.modelId,
                                                )
                                            }
                                        }
                                    }
                                if (activeTtsRequestId != requestId) {
                                    return@runCatching
                                }
                                activeTtsRequestId = null
                                activeTtsPayload = null
                                if (result.stopped) {
                                    withContext(Dispatchers.Main.immediate) {
                                        updateTtsUi(
                                            appContext.getString(R.string.tts_status_idle),
                                            appContext.getString(R.string.tts_detail_stopped),
                                            payload,
                                        )
                                        publishUiState(
                                            connectionStatus = appContext.getString(R.string.status_connected_desktop),
                                            permissionsSummary = appContext.getString(R.string.permissions_ready),
                                        )
                                    }
                                    bridgeClient.submitTtsStatus(
                                        requestId = requestId,
                                        deviceId = launchContext.deviceId,
                                        target = command.target,
                                        status = "stopped",
                                        message = "Android TTS stopped.",
                                        progress = 1.0,
                                        language = payload.language,
                                        modelId = payload.modelId,
                                    )
                                } else {
                                    val doneDetail =
                                        if (result.sampleRate > 0 && result.sampleCount > 0) {
                                            appContext.getString(
                                                R.string.tts_detail_done,
                                                result.sampleRate,
                                                result.sampleCount,
                                            )
                                        } else {
                                            appContext.getString(R.string.tts_detail_done_engine)
                                        }
                                    withContext(Dispatchers.Main.immediate) {
                                        updateTtsUi(
                                            appContext.getString(R.string.tts_status_done),
                                            doneDetail,
                                            payload,
                                        )
                                        publishUiState(
                                            connectionStatus = appContext.getString(R.string.status_connected_desktop),
                                            permissionsSummary = appContext.getString(R.string.permissions_ready),
                                        )
                                    }
                                    bridgeClient.submitTtsStatus(
                                        requestId = requestId,
                                        deviceId = launchContext.deviceId,
                                        target = command.target,
                                        status = "done",
                                        message = "Android TTS playback finished.",
                                        progress = 1.0,
                                        language = payload.language,
                                        modelId = payload.modelId,
                                    )
                                }
                            }.onFailure { error ->
                                if (activeTtsRequestId != requestId) {
                                    return@onFailure
                                }
                                activeTtsRequestId = null
                                activeTtsPayload = null
                                val errorSummary = summarizeError(error)
                                withContext(Dispatchers.Main.immediate) {
                                    updateTtsUi(
                                        appContext.getString(R.string.tts_status_error),
                                        errorSummary,
                                        payload,
                                    )
                                    publishUiState(
                                        connectionStatus = appContext.getString(R.string.status_connected_desktop),
                                        permissionsSummary = appContext.getString(R.string.permissions_ready),
                                    )
                                }
                                bridgeClient.submitTtsStatus(
                                    requestId = requestId,
                                    deviceId = launchContext.deviceId,
                                    target = command.target,
                                    status = "failed",
                                    message = errorSummary,
                                    language = payload.language,
                                    modelId = payload.modelId,
                                    error = errorSummary,
                                )
                            }
                        }
                }

                "stop-tts" -> {
                    val stoppedPayload = command.tts ?: activeTtsPayload
                    activeTtsRequestId = null
                    activeTtsPayload = null
                    ttsPlayer.stop()
                    ttsJob = null
                    updateTtsUi(
                        appContext.getString(R.string.tts_status_idle),
                        appContext.getString(R.string.tts_detail_stopped),
                        stoppedPayload,
                    )
                    publishUiState(
                        connectionStatus = appContext.getString(R.string.status_connected_desktop),
                        permissionsSummary = appContext.getString(R.string.permissions_ready),
                    )
                    bridgeClient.submitTtsStatus(
                        requestId = command.requestId ?: command.id,
                        deviceId = launchContext.deviceId,
                        target = command.target,
                        status = "stopped",
                        message = "Android TTS stopped.",
                        progress = 1.0,
                        language = stoppedPayload?.language,
                        modelId = stoppedPayload?.modelId,
                    )
                    bridgeClient.acknowledgeCommand(
                        deviceId = launchContext.deviceId,
                        command = command,
                        status = "done",
                        message = "Android TTS stopped.",
                        previewActive = cameraController.isPreviewBound(),
                    )
                }

                "set-torch" -> {
                    val torch = command.torch
                        ?: BridgeTorchPayload(command.profile?.torchEnabled == true)
                    setTorch(torch.enabled)
                    publishUiState(
                        connectionStatus = appContext.getString(R.string.status_connected_desktop),
                        permissionsSummary = appContext.getString(R.string.permissions_ready),
                    )
                    bridgeClient.acknowledgeCommand(
                        deviceId = launchContext.deviceId,
                        command = command,
                        status = "done",
                        message = if (torch.enabled) {
                            "Android torch is on."
                        } else {
                            "Android torch is off."
                        },
                        previewActive = cameraController.isPreviewBound(),
                    )
                }
            }
        }.onFailure { error ->
            CompanionDiagnostics.e(
                "command",
                "Command ${command.kind} failed.",
                throwable = error,
            )
            val errorSummary = summarizeError(error)
            CompanionDiagnostics.setState("Last bridge error", errorSummary)
            if (command.kind == "start-dictation") {
                audioRecorder.cancel()
            }
            if (command.kind == "start-ambient-listener") {
                ambientListener.stop()
            }
            if (
                command.kind == "start-dictation" ||
                command.kind == "stop-dictation" ||
                command.kind == "start-ambient-listener" ||
                    command.kind == "stop-ambient-listener"
            ) {
                if (
                    command.kind == "start-ambient-listener" ||
                    command.kind == "stop-ambient-listener"
                ) {
                    updateAmbientUi("failed", errorSummary, null)
                    playAmbientStatusTone("failed")
                }
                updateDictationUi(
                    appContext.getString(R.string.dictation_status_error),
                    errorSummary,
                )
                publishUiState(
                    connectionStatus = appContext.getString(R.string.status_connected_desktop),
                    permissionsSummary = appContext.getString(R.string.permissions_ready),
                )
            }
            if (command.kind == "start-tts" || command.kind == "stop-tts") {
                updateTtsUi(
                    appContext.getString(R.string.tts_status_error),
                    errorSummary,
                    command.tts,
                )
                publishUiState(
                    connectionStatus = appContext.getString(R.string.status_connected_desktop),
                    permissionsSummary = appContext.getString(R.string.permissions_ready),
                )
                runCatching {
                    bridgeClient.submitTtsStatus(
                        requestId = command.requestId ?: command.id,
                        deviceId = launchContext.deviceId,
                        target = command.target,
                        status = "failed",
                        message = errorSummary,
                        language = command.tts?.language,
                        modelId = command.tts?.modelId,
                        error = errorSummary,
                    )
                }
            }
            if (command.kind == "set-torch") {
                publishUiState(
                    connectionStatus = appContext.getString(R.string.status_connected_desktop),
                    permissionsSummary = appContext.getString(R.string.permissions_ready),
                )
            }
            runCatching {
                bridgeClient.acknowledgeCommand(
                    deviceId = launchContext.deviceId,
                    command = command,
                    status = "failed",
                    message = errorSummary,
                    previewActive = cameraController.isPreviewBound(),
                )
            }.onFailure { ackError ->
                CompanionDiagnostics.e(
                    "bridge",
                    "Failed to report command failure to desktop.",
                    throwable = ackError,
                )
            }
            throw error
        }
    }

    private fun buildUiState(connectionStatus: String, permissionsSummary: String): CompanionUiState {
        return CompanionUiState(
            connectionStatus = connectionStatus,
            target = launchContext.target,
            permissionsSummary = permissionsSummary,
            operationsSummary = operationsSummary,
            dictationStatus = dictationStatus,
            dictationDetail = dictationDetail,
            dictationModel =
                launchContext.transcriptModel?.let { "${it.backend} / ${it.modelId}" }
                    ?: appContext.getString(R.string.dictation_model_waiting),
            ambientMicrophoneStatus = ambientMicrophoneStatus,
            ambientListeningStatus = ambientListeningStatus,
            ambientDetail = ambientDetail,
            ambientWakePhrase = ambientWakePhraseSummary,
            ambientHistory = ambientHistoryEntries.joinToString("\n"),
            ttsStatus = ttsStatus,
            ttsDetail = ttsDetail,
            ttsModel = ttsModel,
            ttsTextSummary = ttsTextSummary,
            torchStatus = if (torchEnabled) {
                appContext.getString(R.string.torch_status_on)
            } else {
                appContext.getString(R.string.torch_status_off)
            },
        )
    }

    private fun publishUiState(connectionStatus: String, permissionsSummary: String) {
        val state =
            buildUiState(
                connectionStatus = connectionStatus,
                permissionsSummary = permissionsSummary,
            )
        if (state == lastUiState) {
            return
        }
        lastUiState = state
        onUiState(state)
    }

    private fun updateDictationUi(status: String, detail: String) {
        dictationStatus = status
        dictationDetail = detail
        CompanionDiagnostics.setState("Dictation", status)
        CompanionDiagnostics.setState("Dictation detail", detail)
    }

    private fun updateAmbientUi(status: String, message: String, transcript: String?) {
        ambientMicrophoneStatus = resolveAmbientMicrophoneStatus(status)
        ambientListeningStatus = resolveAmbientMonitorStatus(status)
        ambientDetail = resolveAmbientMonitorDetail(status, message, transcript)
        appendAmbientHistory(resolveAmbientHistoryEntry(status, message, transcript))
        CompanionDiagnostics.setState("Ambient", ambientListeningStatus)
        CompanionDiagnostics.setState("Ambient detail", ambientDetail)
    }

    private fun updateTtsUi(status: String, detail: String, payload: BridgeTtsPayload?) {
        ttsStatus = status
        ttsDetail = detail
        ttsModel = payload?.let { "${it.profile.engine} / ${it.modelId}" }
            ?: appContext.getString(R.string.tts_model_waiting)
        ttsTextSummary =
            payload?.text
                ?.replace(Regex("\\s+"), " ")
                ?.trim()
                ?.take(160)
                ?.ifBlank { appContext.getString(R.string.tts_text_empty) }
                ?: appContext.getString(R.string.tts_text_empty)
        CompanionDiagnostics.setState("TTS", status)
        CompanionDiagnostics.setState("TTS detail", detail)
    }

    private fun setTorch(enabled: Boolean) {
        val source =
            if (cameraController.setTorchOnBoundCamera(enabled)) {
                "cameraX"
            } else {
                val cameraId = resolveTorchCameraId()
                    ?: throw IllegalStateException(appContext.getString(R.string.torch_error_unavailable))
                cameraManager.setTorchMode(cameraId, enabled)
                "cameraId=$cameraId"
            }
        torchEnabled = enabled
        CompanionDiagnostics.setState(
            "Torch",
            if (enabled) appContext.getString(R.string.torch_status_on) else appContext.getString(R.string.torch_status_off),
        )
        CompanionDiagnostics.i(
            "torch",
            if (enabled) "Phone torch enabled." else "Phone torch disabled.",
            source,
        )
    }

    private fun resolveTorchCameraId(): String? {
        torchCameraId?.let { return it }
        val resolved = cameraManager.cameraIdList.firstOrNull { cameraId ->
            val characteristics = cameraManager.getCameraCharacteristics(cameraId)
            characteristics.get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
        }
        torchCameraId = resolved
        return resolved
    }

    private suspend fun publishAmbientStatus(
        requestId: String,
        target: String,
        status: String,
        message: String,
        transcript: String? = null,
        metadata: JSONObject? = null,
    ) {
        withContext(Dispatchers.Main.immediate) {
            updateDictationUi(
                resolveAmbientUiStatus(status),
                resolveAmbientUiDetail(status, message, transcript),
            )
            updateAmbientUi(status, message, transcript)
            playAmbientStatusTone(status)
            publishUiState(
                connectionStatus = appContext.getString(R.string.status_connected_desktop),
                permissionsSummary = appContext.getString(R.string.permissions_ready),
            )
        }
        bridgeClient.submitAmbientStatus(
            requestId = requestId,
            deviceId = launchContext.deviceId,
            target = target,
            status = status,
            message = message,
            transcript = transcript,
            metadata = metadata,
        )
    }

    private fun resolveAmbientMicrophoneStatus(status: String): String {
        return when (status) {
            "started", "done" -> appContext.getString(R.string.ambient_microphone_wake)
            "wake-detected", "capturing" -> appContext.getString(R.string.ambient_microphone_command)
            "transcribing" -> appContext.getString(R.string.ambient_microphone_transcribing)
            "preparing" -> appContext.getString(R.string.ambient_microphone_ready)
            "stopped", "failed" -> appContext.getString(R.string.ambient_microphone_idle)
            else -> appContext.getString(R.string.ambient_microphone_ready)
        }
    }

    private fun resolveAmbientMonitorStatus(status: String): String {
        return when (status) {
            "preparing" -> appContext.getString(R.string.ambient_status_preparing)
            "started" -> appContext.getString(R.string.ambient_status_waiting)
            "wake-detected" -> appContext.getString(R.string.ambient_status_wake_detected)
            "capturing" -> appContext.getString(R.string.ambient_status_command)
            "transcribing" -> appContext.getString(R.string.ambient_status_transcribing)
            "done" -> appContext.getString(R.string.ambient_status_done)
            "stopped" -> appContext.getString(R.string.ambient_status_idle)
            "failed" -> appContext.getString(R.string.ambient_status_error)
            else -> appContext.getString(R.string.ambient_status_waiting)
        }
    }

    private fun resolveAmbientMonitorDetail(status: String, message: String, transcript: String?): String {
        if (status == "preparing") {
            return appContext.getString(R.string.ambient_event_preparing)
        }

        return resolveAmbientUiDetail(status, message, transcript)
    }

    private fun resolveAmbientHistoryEntry(status: String, message: String, transcript: String?): String {
        val compactTranscript = transcript?.replace(Regex("\\s+"), " ")?.trim().orEmpty()
        return when (status) {
            "preparing" -> appContext.getString(R.string.ambient_event_preparing)
            "started" -> appContext.getString(R.string.ambient_event_started, ambientWakePhraseSummary)
            "wake-detected" -> appContext.getString(R.string.ambient_event_wake_detected)
            "capturing" -> appContext.getString(R.string.ambient_event_capturing)
            "transcribing" ->
                appContext.getString(
                    R.string.ambient_event_transcribing,
                    compactTranscript.ifBlank { message },
                )

            "done" ->
                if (compactTranscript.isBlank()) {
                    appContext.getString(R.string.ambient_event_empty_done)
                } else {
                    appContext.getString(R.string.ambient_event_done, compactTranscript)
                }

            "stopped" -> appContext.getString(R.string.ambient_event_stopped)
            "failed" -> appContext.getString(R.string.ambient_event_failed, message)
            else -> message
        }
    }

    private fun appendAmbientHistory(entry: String) {
        val normalizedEntry = entry.trim()
        if (normalizedEntry.isEmpty()) {
            return
        }

        ambientHistoryEntries.add(0, "[${ambientHistoryClock.format(Date())}] $normalizedEntry")
        while (ambientHistoryEntries.size > AMBIENT_HISTORY_LIMIT) {
            ambientHistoryEntries.removeAt(ambientHistoryEntries.lastIndex)
        }
    }

    private fun resolveAmbientUiStatus(status: String): String {
        return when (status) {
            "started" -> appContext.getString(R.string.dictation_status_ambient)
            "wake-detected" -> appContext.getString(R.string.dictation_status_ambient_ready)
            "capturing" -> appContext.getString(R.string.dictation_status_ambient_capturing)
            "transcribing" -> appContext.getString(R.string.dictation_status_transcribing)
            "done" -> appContext.getString(R.string.dictation_status_done)
            "stopped" -> appContext.getString(R.string.dictation_status_idle)
            "failed" -> appContext.getString(R.string.dictation_status_error)
            else -> appContext.getString(R.string.dictation_status_ambient)
        }
    }

    private fun resolveAmbientUiDetail(status: String, message: String, transcript: String?): String {
        return when (status) {
            "started" -> appContext.getString(R.string.dictation_detail_ambient, ambientWakePhraseSummary)
            "wake-detected" -> appContext.getString(R.string.dictation_detail_ambient_ready)
            "capturing" -> appContext.getString(R.string.dictation_detail_ambient_capturing)
            "transcribing" ->
                appContext.getString(
                    R.string.dictation_detail_ambient_transcribing,
                    transcript?.replace(Regex("\\s+"), " ")?.take(120).orEmpty(),
                )

            "done" ->
                transcript?.replace(Regex("\\s+"), " ")?.take(120)?.takeIf { it.isNotBlank() }
                    ?.let { appContext.getString(R.string.dictation_detail_done, it) }
                    ?: appContext.getString(R.string.dictation_detail_ambient_waiting)

            "stopped" -> appContext.getString(R.string.dictation_detail_waiting)
            "failed" -> message
            else -> message
        }
    }

    private fun playAmbientStatusTone(status: String) {
        val toneType =
            when (status) {
                "failed" -> ToneGenerator.TONE_PROP_NACK
                "done", "transcribing" -> ToneGenerator.TONE_PROP_ACK
                "stopped" -> ToneGenerator.TONE_PROP_BEEP
                else -> ToneGenerator.TONE_PROP_BEEP
            }
        val durationMs =
            when (status) {
                "wake-detected" -> 140
                "failed" -> 220
                else -> 110
            }
        runCatching { ambientTone?.startTone(toneType, durationMs) }
    }

    private fun buildTranscriptMetadata(
        recording: AndroidRecordingResult,
        modelProfile: BridgeTranscriptModelProfile,
    ): JSONObject {
        return JSONObject()
            .put("speechBackend", "${modelProfile.backend}-android")
            .put("recordedOn", "android-device")
            .put("microphone", "android-default-mic")
            .put("audioPath", recording.file.absolutePath)
            .put("durationMs", recording.durationMs)
            .put("sampleRate", recording.sampleRate)
            .put("bytesWritten", recording.bytesWritten)
            .put("modelId", modelProfile.modelId)
            .put("modelFile", modelProfile.fileName)
            .put("language", modelProfile.language)
            .put("archiveFormat", modelProfile.archiveFormat)
    }

    private fun buildAmbientTranscriptMetadata(
        transcript: AndroidAmbientTranscript,
        modelProfile: BridgeTranscriptModelProfile,
    ): JSONObject {
        return JSONObject()
            .put("speechBackend", "${modelProfile.backend}-android-ambient-command")
            .put("recordedOn", "android-device")
            .put("microphone", "android-default-mic")
            .put("ambient", true)
            .put("wakeEngine", "openWakeWord")
            .put("wakePhrase", transcript.wakePhrase)
            .put("activeWindowMs", transcript.activeWindowMs)
            .put("silenceTimeoutMs", transcript.silenceTimeoutMs)
            .put("capturedMs", transcript.capturedMs)
            .put("modelId", modelProfile.modelId)
            .put("modelFile", modelProfile.fileName)
            .put("language", modelProfile.language)
            .put("archiveFormat", modelProfile.archiveFormat)
    }

    private fun applyCommandProfile(profile: BridgeCommandProfile?) {
        if (profile == null) {
            return
        }

        launchContext =
            launchContext.copy(
                cameraConfig =
                    launchContext.cameraConfig.copy(
                        lens =
                            when (profile.defaultLens) {
                                "front" -> CaptureLens.FRONT
                                "back" -> CaptureLens.BACK
                                else -> launchContext.cameraConfig.lens
                            },
                        photoQuality =
                            when (profile.photoQuality) {
                                "balanced" -> CapturePhotoQuality.BALANCED
                                "high" -> CapturePhotoQuality.HIGH
                                else -> launchContext.cameraConfig.photoQuality
                            },
                        photoFlashMode = resolvePhotoFlashMode(profile.photoFlashMode),
                    ),
                transcriptModel = requireAndroidVoskModelProfile(profile.transcriptModel),
            )

        publishLaunchContextDiagnostics()
        CompanionDiagnostics.d(
            "command",
            "Applied command profile overrides.",
            "defaultLens=${profile.defaultLens ?: "unchanged"}, photoQuality=${profile.photoQuality ?: "unchanged"}, photoFlashMode=${profile.photoFlashMode}, dictationBackend=vosk",
        )
    }

    private fun publishLaunchContextDiagnostics() {
        CompanionDiagnostics.setState("Device", launchContext.deviceId)
        CompanionDiagnostics.setState("Target", launchContext.target)
        CompanionDiagnostics.setState(
            "Camera config",
            "${launchContext.cameraConfig.lens.name.lowercase()} / ${launchContext.cameraConfig.photoQuality.name.lowercase()} / flash=${launchContext.cameraConfig.photoFlashMode.name.lowercase()}",
        )
        CompanionDiagnostics.setState(
            "Transcript model",
            launchContext.transcriptModel?.modelId ?: "Waiting for desktop command",
        )
    }

    private fun buildLaunchContextSummary(): String {
        return buildString {
            append("deviceId=")
            append(launchContext.deviceId)
            append(", target=")
            append(launchContext.target)
            append(", lens=")
            append(launchContext.cameraConfig.lens.name.lowercase())
            append(", photoQuality=")
            append(launchContext.cameraConfig.photoQuality.name.lowercase())
            append(", photoFlashMode=")
            append(launchContext.cameraConfig.photoFlashMode.name.lowercase())
            append(", transcriptModel=")
            append(launchContext.transcriptModel?.modelId ?: "pending")
        }
    }

    private fun resolvePhotoFlashMode(value: String?): CapturePhotoFlashMode {
        return when (value) {
            "auto" -> CapturePhotoFlashMode.AUTO
            "on" -> CapturePhotoFlashMode.ON
            else -> CapturePhotoFlashMode.OFF
        }
    }

    private suspend fun syncDiagnosticsSnapshotIfDue() {
        val now = SystemClock.elapsedRealtime()
        if (now - lastDiagnosticsSyncAtMs < DIAGNOSTICS_SYNC_INTERVAL_MS) {
            return
        }
        lastDiagnosticsSyncAtMs = now
        syncDiagnosticsSnapshot()
    }

    private suspend fun syncOperationsSnapshot() {
        runCatching {
            bridgeClient.fetchOperationsStatus(reportFailureToDiagnostics = false)
        }.onSuccess { status ->
            operationsSummary = summarizeOperationRecords(status.records)
            CompanionDiagnostics.setState("Operations", operationsSummary)
            if (lastOperationsSyncFailureSignature != null) {
                CompanionDiagnostics.i("bridge", "Desktop operations snapshot sync recovered.")
            }
            lastOperationsSyncFailureSignature = null
        }.onFailure { error ->
            val errorSignature = summarizeError(error)
            if (lastOperationsSyncFailureSignature != errorSignature) {
                CompanionDiagnostics.w(
                    "bridge",
                    "Desktop operations snapshot sync failed.",
                    throwable = error,
                )
            }
            lastOperationsSyncFailureSignature = errorSignature
        }
    }

    private fun summarizeOperationRecords(records: List<BridgeOperationRecord>): String {
        if (records.isEmpty()) {
            return appContext.getString(R.string.operations_status_idle)
        }

        val visibleRecords = records.take(4)
        val summary =
            visibleRecords.joinToString(" • ") { record ->
                "${formatOperationCapability(record.capability)}: ${record.owner.label}"
            }
        val extraCount = records.size - visibleRecords.size
        return if (extraCount > 0) {
            appContext.getString(R.string.operations_status_active_extra, summary, extraCount)
        } else {
            summary
        }
    }

    private fun formatOperationCapability(capability: String): String {
        return when (capability) {
            "local-microphone" -> "Local mic"
            "android-microphone" -> "Android mic"
            "android-camera" -> "Camera"
            "local-tts" -> "Local TTS"
            "android-tts" -> "Android TTS"
            "android-torch" -> "Torch"
            "ambient-listening" -> "Ambient"
            "live-feed" -> "Live feed"
            else -> capability
        }
    }

    private suspend fun syncDiagnosticsSnapshot() {
        runCatching {
            bridgeClient.submitDiagnosticsSnapshot(launchContext.deviceId)
        }.onSuccess {
            if (lastDiagnosticsSyncFailureSignature != null) {
                CompanionDiagnostics.i("diagnostics", "Desktop diagnostics shadow sync recovered.")
            }
            lastDiagnosticsSyncFailureSignature = null
        }.onFailure { error ->
            val errorSignature = summarizeError(error)
            if (lastDiagnosticsSyncFailureSignature != errorSignature) {
                CompanionDiagnostics.w(
                    "diagnostics",
                    "Desktop diagnostics shadow sync failed.",
                    throwable = error,
                )
            }
            lastDiagnosticsSyncFailureSignature = errorSignature
        }
    }

    private fun summarizeError(error: Throwable): String {
        val message = error.message?.trim().takeUnless { it.isNullOrEmpty() } ?: "No detail"
        return "${error::class.simpleName}: $message"
    }
}

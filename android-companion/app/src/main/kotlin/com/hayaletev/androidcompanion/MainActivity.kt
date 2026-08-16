package com.hayaletev.androidcompanion

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import androidx.lifecycle.lifecycleScope
import com.hayaletev.androidcompanion.capture.CameraSessionController
import com.hayaletev.androidcompanion.capture.CaptureForegroundService
import com.hayaletev.androidcompanion.databinding.ActivityMainBinding
import com.hayaletev.androidcompanion.debug.CompanionDiagnostics
import com.hayaletev.androidcompanion.debug.CompanionDiagnosticsListener
import com.hayaletev.androidcompanion.debug.CompanionDiagnosticsSnapshot
import com.hayaletev.androidcompanion.model.CompanionManifest
import com.hayaletev.androidcompanion.session.CompanionSessionCoordinator
import com.hayaletev.androidcompanion.session.CompanionUiState
import com.hayaletev.androidcompanion.transport.DesktopBridgeClient
import com.hayaletev.androidcompanion.transcript.AndroidAudioRecorder
import com.hayaletev.androidcompanion.transcript.AndroidVoskTranscriber
import com.hayaletev.androidcompanion.transcript.TranscriptModelManager
import com.hayaletev.androidcompanion.transcript.defaultAndroidVoskModelProfile
import com.hayaletev.androidcompanion.transport.BridgeTranscriptModelProfile
import com.google.android.material.tabs.TabLayout
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import java.io.File

private const val MANUAL_DICTATION_TRANSCRIBE_TIMEOUT_MS = 90_000L
private const val DIAGNOSTICS_RENDER_THROTTLE_MS = 500L

private enum class CompanionTab {
    IMAGE,
    DICTATE,
    AMBIENT,
    TTS,
    LOGS,
}

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var cameraController: CameraSessionController
    private lateinit var sessionCoordinator: CompanionSessionCoordinator
    private lateinit var manifest: CompanionManifest
    private lateinit var manualAudioRecorder: AndroidAudioRecorder
    private lateinit var manualModelManager: TranscriptModelManager
    private lateinit var manualVoskTranscriber: AndroidVoskTranscriber
    private var activeTab = CompanionTab.IMAGE
    private var manualRecordingActive = false
    private var desktopSessionEnabled = false
    private var manualImageCaptureFile: File? = null
    private var manualImageActionBusy = false
    private var diagnosticsRenderJob: Job? = null
    private var pendingDiagnosticsSnapshot: CompanionDiagnosticsSnapshot? = null
    private val diagnosticsListener =
        CompanionDiagnosticsListener { snapshot ->
            runOnUiThread {
                if (isDestroyed.not()) {
                    scheduleDiagnosticsRender(snapshot)
                }
            }
        }

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
            CompanionDiagnostics.i(
                "permissions",
                "Permission result received.",
                grants.entries.joinToString(", ") { "${it.key}=${it.value}" },
            )
            updatePermissionsUi()
            if (hasCapturePermissions()) {
                maybeStartPreviewAndSessionLoop()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureLaunchWakeBehavior()
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        manifest = CompanionManifest.load(this)
        CompanionDiagnostics.addListener(diagnosticsListener)
        CompanionDiagnostics.setState("App", "${manifest.versionName} (${manifest.versionCode})")
        CompanionDiagnostics.setState("Bridge endpoint", "127.0.0.1:${manifest.bridgePort}")
        CompanionDiagnostics.i("lifecycle", "MainActivity created.", describeIntent(intent))

        cameraController = CameraSessionController(this, binding.cameraPreview)
        val bridgeClient = DesktopBridgeClient(manifest)
        manualAudioRecorder = AndroidAudioRecorder(applicationContext, lifecycleScope)
        manualModelManager = TranscriptModelManager(applicationContext, bridgeClient)
        manualVoskTranscriber = AndroidVoskTranscriber()
        activeTab = resolveIntentTab(intent) ?: CompanionTab.IMAGE
        sessionCoordinator = CompanionSessionCoordinator(
            appContext = applicationContext,
            scope = lifecycleScope,
            manifest = manifest,
            bridgeClient = bridgeClient,
            cameraController = cameraController,
            onUiState = ::renderUiState
        )
        configureTabs()
        configureDiagnosticsPanel()
        configureManualImagePanel()
        configureManualDictationPanel()

        binding.previewValue.text = getString(R.string.preview_waiting_desktop_command)
        binding.imageCaptureFeedbackValue.text = getString(R.string.image_capture_feedback_waiting)
        binding.dictationStatusValue.text = getString(R.string.dictation_status_idle)
        binding.dictationDetailValue.text = getString(R.string.dictation_detail_waiting)
        binding.dictationModelValue.text = getString(R.string.dictation_model_waiting)
        binding.dictationTargetValue.text = getString(R.string.target_waiting)
        binding.ambientMicrophoneValue.text = getString(R.string.ambient_microphone_missing)
        binding.ambientStatusValue.text = getString(R.string.ambient_status_idle)
        binding.ambientDetailValue.text = getString(R.string.ambient_detail_waiting)
        binding.ambientWakePhraseValue.text = getString(R.string.ambient_wake_phrase_waiting)
        binding.ambientHistoryValue.text = getString(R.string.ambient_history_empty)
        binding.ttsStatusValue.text = getString(R.string.tts_status_idle)
        binding.ttsDetailValue.text = getString(R.string.tts_detail_waiting)
        binding.ttsModelValue.text = getString(R.string.tts_model_waiting)
        binding.ttsTextValue.text = getString(R.string.tts_text_empty)
        renderUiState(
            CompanionUiState(
                connectionStatus = getString(R.string.status_waiting_desktop),
                target = getString(R.string.target_waiting),
                permissionsSummary = getString(R.string.permissions_missing)
            )
        )
        renderPreviewState()

        desktopSessionEnabled = hasDesktopSessionIntent(intent)
        if (desktopSessionEnabled) {
            ensureCaptureForegroundService()
        }
        renderManualImageControls()
        sessionCoordinator.updateLaunchContext(intent)
        requestPermissionsIfNeeded()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        configureLaunchWakeBehavior()
        CompanionDiagnostics.i("intent", "Activity received a new launch intent.", describeIntent(intent))
        if (hasDesktopSessionIntent(intent)) {
            desktopSessionEnabled = true
            ensureCaptureForegroundService()
            renderManualImageControls()
        }
        resolveIntentTab(intent)?.let { setActiveTab(it) }
        sessionCoordinator.updateLaunchContext(intent)
        updatePermissionsUi()
        if (hasCapturePermissions()) {
            maybeStartPreviewAndSessionLoop()
        }
    }

    private fun configureLaunchWakeBehavior() {
        setShowWhenLocked(true)
        setTurnScreenOn(true)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    override fun onStart() {
        super.onStart()
        CompanionDiagnostics.i("lifecycle", "MainActivity started.")
        updatePermissionsUi()
        if (hasCapturePermissions()) {
            maybeStartPreviewAndSessionLoop()
        }
    }

    override fun onStop() {
        CompanionDiagnostics.i("lifecycle", "MainActivity stopped.")
        manualRecordingActive = false
        manualAudioRecorder.cancel()
        sessionCoordinator.stop()
        super.onStop()
    }

    override fun onDestroy() {
        CompanionDiagnostics.i("lifecycle", "MainActivity destroyed.")
        CompanionDiagnostics.removeListener(diagnosticsListener)
        diagnosticsRenderJob?.cancel()
        clearManualImageCaptureFile()
        sessionCoordinator.destroy()
        super.onDestroy()
    }

    private fun requestPermissionsIfNeeded() {
        if (hasCapturePermissions()) {
            CompanionDiagnostics.i("permissions", "Capture permissions are already granted.")
            maybeStartPreviewAndSessionLoop()
            return
        }

        val permissions = buildList {
            add(Manifest.permission.CAMERA)
            add(Manifest.permission.RECORD_AUDIO)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        CompanionDiagnostics.i(
            "permissions",
            "Requesting capture permissions.",
            permissions.joinToString(", "),
        )
        permissionLauncher.launch(permissions.toTypedArray())
    }

    private fun hasDesktopSessionIntent(intent: Intent?): Boolean {
        return intent?.hasExtra("deviceId") == true || intent?.hasExtra("target") == true
    }

    private fun maybeStartPreviewAndSessionLoop() {
        if (desktopSessionEnabled.not()) {
            CompanionDiagnostics.setState("Session loop", "Paused for local manual use")
            return
        }
        ensureCaptureForegroundService()
        startPreviewAndSessionLoop()
    }

    private fun ensureCaptureForegroundService() {
        ContextCompat.startForegroundService(
            this,
            Intent(this, CaptureForegroundService::class.java)
        )
    }

    private fun startPreviewAndSessionLoop() {
        CompanionDiagnostics.i("session", "Requesting preview/session loop start.")
        sessionCoordinator.start(::hasCapturePermissions)
        lifecycleScope.launch {
            updatePermissionsUi()
        }
    }

    private fun hasCapturePermissions(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED
    }

    private fun updatePermissionsUi() {
        val permissionsText =
            if (hasCapturePermissions()) {
                getString(R.string.permissions_ready)
            } else {
                getString(R.string.permissions_missing)
            }
        binding.permissionsValue.text = permissionsText
        CompanionDiagnostics.setState("Permissions", permissionsText)
        renderAmbientMicrophonePermissionState()
        renderPreviewState()
    }

    private fun renderUiState(state: CompanionUiState) {
        binding.statusValue.text = state.connectionStatus
        binding.targetValue.text = state.target
        binding.permissionsValue.text = state.permissionsSummary
        binding.operationsValue.text =
            state.operationsSummary ?: getString(R.string.operations_status_idle)
        binding.dictationStatusValue.text =
            state.dictationStatus ?: getString(R.string.dictation_status_idle)
        binding.dictationDetailValue.text =
            state.dictationDetail ?: getString(R.string.dictation_detail_waiting)
        binding.dictationModelValue.text =
            state.dictationModel ?: getString(R.string.dictation_model_waiting)
        binding.dictationTargetValue.text = state.target
        binding.ambientMicrophoneValue.text =
            if (hasCapturePermissions()) {
                state.ambientMicrophoneStatus ?: getString(R.string.ambient_microphone_ready)
            } else {
                getString(R.string.ambient_microphone_missing)
            }
        binding.ambientStatusValue.text =
            state.ambientListeningStatus ?: getString(R.string.ambient_status_idle)
        binding.ambientDetailValue.text =
            state.ambientDetail ?: getString(R.string.ambient_detail_waiting)
        binding.ambientWakePhraseValue.text =
            state.ambientWakePhrase ?: getString(R.string.ambient_wake_phrase_waiting)
        binding.ambientHistoryValue.text =
            state.ambientHistory?.takeIf { it.isNotBlank() }
                ?: getString(R.string.ambient_history_empty)
        binding.ttsStatusValue.text = state.ttsStatus ?: getString(R.string.tts_status_idle)
        binding.ttsDetailValue.text = state.ttsDetail ?: getString(R.string.tts_detail_waiting)
        binding.ttsModelValue.text = state.ttsModel ?: getString(R.string.tts_model_waiting)
        binding.ttsTextValue.text = state.ttsTextSummary ?: getString(R.string.tts_text_empty)
        binding.torchValue.text = state.torchStatus ?: getString(R.string.torch_status_off)
        CompanionDiagnostics.setState("Connection", state.connectionStatus)
        CompanionDiagnostics.setState("Target", state.target)
        CompanionDiagnostics.setState("Permissions", state.permissionsSummary)
        renderPreviewState()
    }

    private fun renderAmbientMicrophonePermissionState() {
        if (hasCapturePermissions().not()) {
            binding.ambientMicrophoneValue.text = getString(R.string.ambient_microphone_missing)
            return
        }

        if (binding.ambientMicrophoneValue.text == getString(R.string.ambient_microphone_missing)) {
            binding.ambientMicrophoneValue.text = getString(R.string.ambient_microphone_ready)
        }
    }

    private fun renderPreviewState() {
        val previewBound = cameraController.isPreviewBound()
        binding.previewPlaceholder.isVisible = previewBound.not()
        binding.previewValue.text =
            if (previewBound) {
                getString(R.string.preview_active_on_phone)
            } else {
                getString(R.string.preview_waiting_desktop_command)
            }
        CompanionDiagnostics.setState(
            "Preview",
            if (previewBound) {
                "Active on this phone"
            } else {
                "Waiting for desktop command"
            },
        )
        renderManualImageControls()
    }

    private fun configureManualImagePanel() {
        binding.imageCaptureClearButton.setOnClickListener {
            clearManualImageCapture()
        }
        binding.imageCaptureButton.setOnClickListener {
            takeManualImageCapture()
        }
        binding.imageCaptureAddButton.setOnClickListener {
            addManualImageCapture()
        }
        renderManualImageControls()
    }

    private fun renderManualImageControls() {
        val hasCapture = manualImageCaptureFile != null
        val hasPermissions = hasCapturePermissions()
        binding.imageCaptureButton.isEnabled =
            manualImageActionBusy.not() && hasPermissions && desktopSessionEnabled
        binding.imageCaptureClearButton.isEnabled = manualImageActionBusy.not() && hasCapture
        binding.imageCaptureAddButton.isEnabled =
            manualImageActionBusy.not() && hasCapture && desktopSessionEnabled
    }

    private fun setManualImageBusy(busy: Boolean) {
        manualImageActionBusy = busy
        renderManualImageControls()
    }

    private fun takeManualImageCapture() {
        if (hasCapturePermissions().not()) {
            requestPermissionsIfNeeded()
            binding.imageCaptureFeedbackValue.text = getString(R.string.status_permissions_required)
            renderManualImageControls()
            return
        }
        if (desktopSessionEnabled.not()) {
            binding.imageCaptureFeedbackValue.text =
                getString(R.string.image_capture_feedback_desktop_required)
            renderManualImageControls()
            return
        }

        lifecycleScope.launch {
            setManualImageBusy(true)
            binding.imageCaptureFeedbackValue.text = getString(R.string.image_capture_feedback_capturing)
            runCatching {
                val captured = sessionCoordinator.captureManualPhoto()
                clearManualImageCaptureFile()
                manualImageCaptureFile = captured
                binding.imageCaptureFeedbackValue.text =
                    getString(R.string.image_capture_feedback_ready, captured.name)
                CompanionDiagnostics.i(
                    "manual-image",
                    "Manual image capture is ready.",
                    "file=${captured.name}, bytes=${captured.length()}",
                )
            }.onFailure { error ->
                renderManualImageError(error)
            }
            setManualImageBusy(false)
        }
    }

    private fun addManualImageCapture() {
        val captureFile = manualImageCaptureFile
        if (captureFile == null) {
            renderManualImageControls()
            return
        }
        if (desktopSessionEnabled.not()) {
            binding.imageCaptureFeedbackValue.text =
                getString(R.string.image_capture_feedback_desktop_required)
            renderManualImageControls()
            return
        }

        lifecycleScope.launch {
            setManualImageBusy(true)
            binding.imageCaptureFeedbackValue.text = getString(R.string.image_capture_feedback_uploading)
            runCatching {
                sessionCoordinator.uploadManualPhoto(captureFile)
                clearManualImageCaptureFile()
                binding.imageCaptureFeedbackValue.text = getString(R.string.image_capture_feedback_added)
                Toast.makeText(this@MainActivity, R.string.image_capture_feedback_added, Toast.LENGTH_SHORT)
                    .show()
            }.onFailure { error ->
                renderManualImageError(error)
            }
            setManualImageBusy(false)
        }
    }

    private fun clearManualImageCapture() {
        clearManualImageCaptureFile()
        binding.imageCaptureFeedbackValue.text = getString(R.string.image_capture_feedback_cleared)
        renderManualImageControls()
    }

    private fun clearManualImageCaptureFile() {
        manualImageCaptureFile?.delete()
        manualImageCaptureFile = null
    }

    private fun renderManualImageError(error: Throwable) {
        val message = error.message ?: error.toString()
        binding.imageCaptureFeedbackValue.text = getString(R.string.image_capture_feedback_error, message)
        CompanionDiagnostics.e("manual-image", "Manual image capture failed.", throwable = error)
    }

    private fun configureTabs() {
        binding.companionTabs.addOnTabSelectedListener(
            object : TabLayout.OnTabSelectedListener {
                override fun onTabSelected(tab: TabLayout.Tab) {
                    setActiveTab(
                        when (tab.position) {
                            1 -> CompanionTab.DICTATE
                            2 -> CompanionTab.AMBIENT
                            3 -> CompanionTab.TTS
                            4 -> CompanionTab.LOGS
                            else -> CompanionTab.IMAGE
                        }
                    )
                }

                override fun onTabUnselected(tab: TabLayout.Tab) = Unit

                override fun onTabReselected(tab: TabLayout.Tab) = Unit
            }
        )
        setActiveTab(activeTab)
    }

    private fun setActiveTab(tab: CompanionTab) {
        activeTab = tab
        binding.imageTabPanel.isVisible = tab == CompanionTab.IMAGE
        binding.dictateTabPanel.isVisible = tab == CompanionTab.DICTATE
        binding.ambientTabPanel.isVisible = tab == CompanionTab.AMBIENT
        binding.ttsTabPanel.isVisible = tab == CompanionTab.TTS
        binding.logsTabPanel.isVisible = tab == CompanionTab.LOGS
        val tabIndex =
            when (tab) {
                CompanionTab.IMAGE -> 0
                CompanionTab.DICTATE -> 1
                CompanionTab.AMBIENT -> 2
                CompanionTab.TTS -> 3
                CompanionTab.LOGS -> 4
            }
        if (binding.companionTabs.selectedTabPosition != tabIndex) {
            binding.companionTabs.getTabAt(tabIndex)?.select()
        }
        if (tab == CompanionTab.LOGS) {
            diagnosticsRenderJob?.cancel()
            diagnosticsRenderJob = null
            val snapshot = pendingDiagnosticsSnapshot ?: CompanionDiagnostics.snapshot()
            pendingDiagnosticsSnapshot = null
            renderDiagnostics(snapshot)
        }
    }

    private fun resolveIntentTab(intent: Intent?): CompanionTab? {
        return when (intent?.getStringExtra("activeTab")?.trim()?.lowercase()) {
            "image" -> CompanionTab.IMAGE
            "dictate" -> CompanionTab.DICTATE
            "ambient" -> CompanionTab.AMBIENT
            "tts" -> CompanionTab.TTS
            "logs" -> CompanionTab.LOGS
            else -> null
        }
    }

    private fun configureDiagnosticsPanel() {
        binding.diagnosticsCopyButton.setOnClickListener {
            copyDiagnosticsToClipboard()
        }
        binding.diagnosticsShareButton.setOnClickListener {
            shareDiagnostics()
        }
        binding.diagnosticsClearButton.setOnClickListener {
            CompanionDiagnostics.clearLogs()
            CompanionDiagnostics.i("ui", "Diagnostics log cleared by user.")
        }
    }

    private fun configureManualDictationPanel() {
        binding.manualDictationTranscriptValue.setText(R.string.manual_dictation_transcript_empty)
        binding.manualDictationToggleButton.setOnClickListener {
            if (manualRecordingActive) {
                stopManualDictation()
            } else {
                startManualDictation()
            }
        }
    }

    private fun startManualDictation() {
        if (hasCapturePermissions().not()) {
            requestPermissionsIfNeeded()
            binding.manualDictationTranscriptValue.setText(R.string.status_permissions_required)
            return
        }

        lifecycleScope.launch {
            runCatching {
                if (desktopSessionEnabled) {
                    sessionCoordinator.stop()
                    CompanionDiagnostics.setState("Session loop", "Paused for manual dictation")
                }
                val file = manualAudioRecorder.start()
                manualRecordingActive = true
                binding.manualDictationToggleButton.text = getString(R.string.manual_dictation_stop)
                binding.manualDictationTranscriptValue.setText(
                    getString(R.string.manual_dictation_recording, file.name)
                )
                CompanionDiagnostics.i(
                    "manual-dictation",
                    "Manual dictation recording started.",
                    "backend=${getManualVoskLabel()}, file=${file.name}",
                )
            }.onFailure { error ->
                manualRecordingActive = false
                renderManualDictationError(error)
                maybeStartPreviewAndSessionLoop()
            }
        }
    }

    private fun stopManualDictation() {
        lifecycleScope.launch {
            val backendLabel = getManualVoskLabel()
            binding.manualDictationToggleButton.isEnabled = false
            binding.manualDictationTranscriptValue.setText(
                getString(R.string.manual_dictation_transcribing, backendLabel)
            )

            runCatching {
                val recording = manualAudioRecorder.stop()
                manualRecordingActive = false
                val profile = buildManualTranscriptModelProfile()
                val modelStartedAt = SystemClock.elapsedRealtime()
                val model = manualModelManager.ensureLocalModel(profile)
                val modelMs = SystemClock.elapsedRealtime() - modelStartedAt
                val transcriptionStartedAt = SystemClock.elapsedRealtime()
                val transcript =
                    withTimeout(MANUAL_DICTATION_TRANSCRIBE_TIMEOUT_MS) {
                        manualVoskTranscriber.transcribe(
                            modelDirectory = model,
                            audioFile = recording.file,
                            language = profile.language,
                        )
                    }
                val transcriptionMs = SystemClock.elapsedRealtime() - transcriptionStartedAt
                val totalMs = modelMs + transcriptionMs
                binding.manualDictationTranscriptValue.setText(
                    getString(
                        R.string.manual_dictation_result,
                        backendLabel,
                        recording.durationMs,
                        modelMs,
                        transcriptionMs,
                        totalMs,
                        transcript,
                    )
                )
                binding.manualDictationTranscriptValue.post {
                    binding.manualDictationTranscriptValue.setSelection(0)
                    binding.manualDictationTranscriptValue.scrollTo(0, 0)
                }
                CompanionDiagnostics.i(
                    "manual-dictation",
                    "Manual dictation transcript completed.",
                    "backend=$backendLabel, durationMs=${recording.durationMs}, bytes=${recording.bytesWritten}, modelMs=$modelMs, transcriptionMs=$transcriptionMs",
                )
            }.onFailure { error ->
                manualRecordingActive = false
                manualAudioRecorder.cancel()
                renderManualDictationError(error)
            }

            binding.manualDictationToggleButton.isEnabled = true
            binding.manualDictationToggleButton.text = getString(R.string.manual_dictation_start)
            maybeStartPreviewAndSessionLoop()
        }
    }

    private fun getManualVoskLabel(): String {
        return getString(R.string.manual_dictation_backend_vosk)
    }

    private fun buildManualTranscriptModelProfile(): BridgeTranscriptModelProfile {
        return defaultAndroidVoskModelProfile()
    }

    private fun renderManualDictationError(error: Throwable) {
        val message = error.message ?: error.toString()
        binding.manualDictationTranscriptValue.setText(
            getString(R.string.manual_dictation_error, message)
        )
        binding.manualDictationToggleButton.text = getString(R.string.manual_dictation_start)
        binding.manualDictationToggleButton.isEnabled = true
        CompanionDiagnostics.e("manual-dictation", "Manual dictation failed.", throwable = error)
    }

    private fun scheduleDiagnosticsRender(snapshot: CompanionDiagnosticsSnapshot) {
        pendingDiagnosticsSnapshot = snapshot
        if (activeTab != CompanionTab.LOGS || diagnosticsRenderJob?.isActive == true) {
            return
        }
        diagnosticsRenderJob =
            lifecycleScope.launch {
                delay(DIAGNOSTICS_RENDER_THROTTLE_MS)
                val nextSnapshot = pendingDiagnosticsSnapshot ?: return@launch
                pendingDiagnosticsSnapshot = null
                if (isDestroyed.not() && activeTab == CompanionTab.LOGS) {
                    renderDiagnostics(nextSnapshot)
                }
            }
    }

    private fun renderDiagnostics(snapshot: CompanionDiagnosticsSnapshot) {
        binding.diagnosticsSummaryValue.text =
            if (snapshot.stateEntries.isEmpty()) {
                getString(R.string.diagnostics_summary_empty)
            } else {
                snapshot.stateEntries.joinToString("\n") { (key, value) -> "$key: $value" }
            }
        binding.diagnosticsLogsValue.text =
            if (snapshot.logEntries.isEmpty()) {
                getString(R.string.diagnostics_logs_empty)
            } else {
                snapshot.logEntries
                    .takeLast(160)
                    .asReversed()
                    .joinToString("\n\n", transform = CompanionDiagnostics::formatEntry)
            }
    }

    private fun copyDiagnosticsToClipboard() {
        val clipboard = getSystemService(ClipboardManager::class.java)
        val export = CompanionDiagnostics.buildShareText()
        clipboard?.setPrimaryClip(
            ClipData.newPlainText(getString(R.string.diagnostics_clipboard_label), export),
        )
        CompanionDiagnostics.i("ui", "Diagnostics copied to clipboard.")
        Toast.makeText(this, getString(R.string.diagnostics_copy_success), Toast.LENGTH_SHORT).show()
    }

    private fun shareDiagnostics() {
        CompanionDiagnostics.i("ui", "Sharing diagnostics.")
        startActivity(
            Intent.createChooser(
                Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_SUBJECT, getString(R.string.diagnostics_clipboard_label))
                    putExtra(Intent.EXTRA_TEXT, CompanionDiagnostics.buildShareText())
                },
                getString(R.string.diagnostics_share_title),
            ),
        )
    }

    private fun describeIntent(intent: Intent?): String? {
        if (intent == null) {
            return null
        }

        val summary =
            buildList {
                intent.getStringExtra("deviceId")?.takeIf { it.isNotBlank() }?.let {
                    add("deviceId=$it")
                }
                intent.getStringExtra("target")?.takeIf { it.isNotBlank() }?.let {
                    add("target=$it")
                }
                intent.getStringExtra("defaultLens")?.takeIf { it.isNotBlank() }?.let {
                    add("defaultLens=$it")
                }
                intent.getStringExtra("photoQuality")?.takeIf { it.isNotBlank() }?.let {
                    add("photoQuality=$it")
                }
                intent.getStringExtra("photoFlashMode")?.takeIf { it.isNotBlank() }?.let {
                    add("photoFlashMode=$it")
                }
            }
        return summary.joinToString(", ").ifBlank { null }
    }
}

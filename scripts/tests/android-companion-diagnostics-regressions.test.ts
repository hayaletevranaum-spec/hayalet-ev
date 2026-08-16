import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

void test("android companion diagnostics panel stays wired across ui and runtime flows", () => {
  const layoutSource = readFileSync(
    "android-companion/app/src/main/res/layout/activity_main.xml",
    "utf8"
  );
  const stringsSource = readFileSync(
    "android-companion/app/src/main/res/values/strings.xml",
    "utf8"
  );
  const diagnosticsSource = readFileSync(
    "android-companion/app/src/main/kotlin/com/hayaletev/androidcompanion/debug/CompanionDiagnostics.kt",
    "utf8"
  );
  const manifestSource = readFileSync("android-companion/app/src/main/AndroidManifest.xml", "utf8");
  const networkSecurityConfigSource = readFileSync(
    "android-companion/app/src/main/res/xml/network_security_config.xml",
    "utf8"
  );
  const activitySource = readFileSync(
    "android-companion/app/src/main/kotlin/com/hayaletev/androidcompanion/MainActivity.kt",
    "utf8"
  );
  const captureServiceSource = readFileSync("electron/capture-service.ts", "utf8");
  const captureDiagnosticsHelperSource = readFileSync(
    "electron/capture/diagnostics-helper.ts",
    "utf8"
  );
  const sessionSource = readFileSync(
    "android-companion/app/src/main/kotlin/com/hayaletev/androidcompanion/session/CompanionSessionCoordinator.kt",
    "utf8"
  );
  const transportSource = readFileSync(
    "android-companion/app/src/main/kotlin/com/hayaletev/androidcompanion/transport/DesktopBridgeClient.kt",
    "utf8"
  );
  const cameraSource = readFileSync(
    "android-companion/app/src/main/kotlin/com/hayaletev/androidcompanion/capture/CameraSessionController.kt",
    "utf8"
  );
  const recorderSource = readFileSync(
    "android-companion/app/src/main/kotlin/com/hayaletev/androidcompanion/transcript/AndroidAudioRecorder.kt",
    "utf8"
  );

  assert.match(layoutSource, /id="@\+id\/companionTabs"/);
  assert.match(layoutSource, /id="@\+id\/imageTabPanel"/);
  assert.match(layoutSource, /id="@\+id\/dictateTabPanel"/);
  assert.match(layoutSource, /id="@\+id\/ambientTabPanel"/);
  assert.match(layoutSource, /id="@\+id\/logsTabPanel"/);
  assert.match(layoutSource, /id="@\+id\/dictationStatusValue"/);
  assert.match(layoutSource, /id="@\+id\/dictationDetailValue"/);
  assert.match(layoutSource, /id="@\+id\/dictationModelValue"/);
  assert.match(layoutSource, /id="@\+id\/ambientMicrophoneValue"/);
  assert.match(layoutSource, /id="@\+id\/ambientStatusValue"/);
  assert.match(layoutSource, /id="@\+id\/ambientDetailValue"/);
  assert.match(layoutSource, /id="@\+id\/ambientWakePhraseValue"/);
  assert.match(layoutSource, /id="@\+id\/ambientHistoryValue"/);
  assert.match(layoutSource, /id="@\+id\/imageCaptureActions"/);
  assert.match(layoutSource, /id="@\+id\/imageCaptureClearButton"/);
  assert.match(layoutSource, /id="@\+id\/imageCaptureButton"/);
  assert.match(layoutSource, /id="@\+id\/imageCaptureAddButton"/);
  assert.match(layoutSource, /id="@\+id\/imageCaptureFeedbackValue"/);
  assert.match(layoutSource, /id="@\+id\/manualDictationBackendValue"/);
  assert.doesNotMatch(layoutSource, /id="@\+id\/manualDictationBackendSpinner"/);
  assert.match(layoutSource, /id="@\+id\/manualDictationToggleButton"/);
  assert.match(layoutSource, /id="@\+id\/manualDictationTranscriptValue"/);
  assert.match(layoutSource, /id="@\+id\/diagnosticsPanel"/);
  assert.match(layoutSource, /id="@\+id\/diagnosticsSummaryValue"/);
  assert.match(layoutSource, /id="@\+id\/diagnosticsLogsValue"/);
  assert.match(layoutSource, /id="@\+id\/diagnosticsCopyButton"/);
  assert.match(layoutSource, /id="@\+id\/diagnosticsShareButton"/);
  assert.match(layoutSource, /id="@\+id\/diagnosticsClearButton"/);

  assert.match(stringsSource, /name="tab_image"/);
  assert.match(stringsSource, /name="tab_dictate"/);
  assert.match(stringsSource, /name="tab_ambient"/);
  assert.match(stringsSource, /name="tab_logs"/);
  assert.match(stringsSource, /name="dictation_status_recording"/);
  assert.match(stringsSource, /name="dictation_status_transcribing"/);
  assert.match(stringsSource, /name="ambient_microphone_wake"/);
  assert.match(stringsSource, /name="ambient_status_waiting"/);
  assert.match(stringsSource, /name="ambient_event_done"/);
  assert.match(stringsSource, /name="ambient_history_empty"/);
  assert.match(stringsSource, /name="manual_dictation_title"/);
  assert.match(stringsSource, /name="manual_dictation_backend_vosk"/);
  assert.doesNotMatch(stringsSource, /manual_dictation_backend_whisper/);
  assert.match(stringsSource, /name="manual_dictation_result"/);
  assert.match(stringsSource, /%6\$s\\n\\nEngine: %1\$s/);
  assert.match(stringsSource, /name="manual_dictation_transcript_empty"/);
  assert.match(stringsSource, /name="image_capture_clear"/);
  assert.match(stringsSource, /name="image_capture_take"/);
  assert.match(stringsSource, /name="image_capture_add"/);
  assert.match(stringsSource, /name="image_capture_feedback_ready"/);
  assert.match(stringsSource, /name="image_capture_feedback_desktop_required"/);
  assert.match(stringsSource, /name="diagnostics_label"/);
  assert.match(stringsSource, /name="diagnostics_copy"/);
  assert.match(stringsSource, /name="diagnostics_share"/);
  assert.match(manifestSource, /android:networkSecurityConfig="@xml\/network_security_config"/);
  assert.match(manifestSource, /android:usesCleartextTraffic="true"/);
  assert.match(networkSecurityConfigSource, /cleartextTrafficPermitted="true"/);

  assert.match(diagnosticsSource, /MAX_LOG_ENTRIES = 400/);
  assert.match(diagnosticsSource, /fun buildShareText\(\): String/);
  assert.match(diagnosticsSource, /fun buildSnapshotPayload\(deviceId: String\): JSONObject/);
  assert.match(diagnosticsSource, /fun interface CompanionDiagnosticsListener/);
  assert.match(diagnosticsSource, /stateEntries\[normalizedKey\] != normalizedValue/);
  assert.match(diagnosticsSource, /if \(changed\.not\(\)\) \{/);
  assert.match(diagnosticsSource, /Log\.e\(LOG_TAG, message\)/);

  assert.match(activitySource, /CompanionDiagnostics\.addListener\(diagnosticsListener\)/);
  assert.match(activitySource, /configureTabs\(\)/);
  assert.match(activitySource, /configureManualImagePanel\(\)/);
  assert.match(activitySource, /renderManualImageControls\(\)/);
  assert.match(activitySource, /clearManualImageCaptureFile\(\)/);
  assert.match(activitySource, /CompanionTab\.AMBIENT/);
  assert.match(activitySource, /ambientTabPanel\.isVisible = tab == CompanionTab\.AMBIENT/);
  assert.match(activitySource, /renderAmbientMicrophonePermissionState\(\)/);
  assert.match(activitySource, /configureManualDictationPanel\(\)/);
  assert.match(activitySource, /startManualDictation\(\)/);
  assert.match(activitySource, /stopManualDictation\(\)/);
  assert.match(activitySource, /setActiveTab\(tab: CompanionTab\)/);
  assert.match(activitySource, /DIAGNOSTICS_RENDER_THROTTLE_MS = 500L/);
  assert.match(activitySource, /scheduleDiagnosticsRender\(snapshot\)/);
  assert.match(activitySource, /activeTab != CompanionTab\.LOGS/);
  assert.match(activitySource, /hasDesktopSessionIntent\(intent: Intent\?\)/);
  assert.match(activitySource, /private fun ensureCaptureForegroundService\(\)/);
  assert.match(activitySource, /Paused for local manual use/);
  assert.match(activitySource, /configureDiagnosticsPanel\(\)/);
  assert.match(activitySource, /copyDiagnosticsToClipboard\(\)/);
  assert.match(activitySource, /shareDiagnostics\(\)/);
  assert.match(activitySource, /CompanionDiagnostics\.buildShareText\(\)/);

  assert.match(sessionSource, /CompanionDiagnostics\.i\(\s*"session"/);
  assert.match(sessionSource, /CompanionDiagnostics\.w\(\s*"bridge"/);
  assert.match(sessionSource, /CompanionDiagnostics\.e\(\s*"command"/);
  assert.match(sessionSource, /dictationStatus = appContext\.getString/);
  assert.match(sessionSource, /updateDictationUi\(/);
  assert.match(sessionSource, /val ambientMicrophoneStatus: String\? = null/);
  assert.match(sessionSource, /ambientHistoryEntries/);
  assert.match(sessionSource, /updateAmbientUi\(/);
  assert.match(sessionSource, /resolveAmbientMonitorStatus/);
  assert.match(sessionSource, /resolveAmbientHistoryEntry/);
  assert.match(sessionSource, /syncDiagnosticsSnapshot\(\)/);
  assert.match(sessionSource, /syncDiagnosticsSnapshotIfDue\(\)/);
  assert.match(sessionSource, /BRIDGE_OFFLINE_RETRY_MS/);
  assert.match(sessionSource, /bridgeClient\.submitDiagnosticsSnapshot\(launchContext\.deviceId\)/);
  assert.doesNotMatch(sessionSource, /catch \(_: Exception\)/);

  assert.match(captureServiceSource, /\/api\/v1\/diagnostics\/snapshot/);
  assert.match(captureServiceSource, /writeCompanionDiagnosticsShadowSnapshot/);
  assert.match(captureDiagnosticsHelperSource, /Paths\.getLogsDir\(\),\s*"android-companion"/);

  assert.match(transportSource, /CompanionDiagnostics\.e\("bridge", "GET \$path failed\."/);
  assert.match(transportSource, /reportFailureToDiagnostics: Boolean = true/);
  assert.match(transportSource, /CompanionDiagnostics\.i\(\s*"bridge",\s*"Acknowledged command/);
  assert.match(transportSource, /fun submitDiagnosticsSnapshot\(deviceId: String\)/);
  assert.match(transportSource, /reportFailureToDiagnostics = false/);

  assert.match(cameraSource, /CompanionDiagnostics\.i\("camera", "Binding camera preview\."/);
  assert.match(cameraSource, /CompanionDiagnostics\.e\("camera", "Photo capture failed\."/);

  assert.match(recorderSource, /CompanionDiagnostics\.i\(\s*"transcript"/);
  assert.match(recorderSource, /Android microphone recording started/);
});

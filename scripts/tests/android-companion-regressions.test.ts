import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";

void test("android companion keeps openWake ambient, Vosk dictation, and live camera contract wired", () => {
  const sessionSource = readFileSync(
    "android-companion/app/src/main/kotlin/com/hayaletev/androidcompanion/session/CompanionSessionCoordinator.kt",
    "utf8"
  );
  const transportSource = readFileSync(
    "android-companion/app/src/main/kotlin/com/hayaletev/androidcompanion/transport/DesktopBridgeClient.kt",
    "utf8"
  );
  const cameraControllerSource = readFileSync(
    "android-companion/app/src/main/kotlin/com/hayaletev/androidcompanion/capture/CameraSessionController.kt",
    "utf8"
  );
  const recorderSource = readFileSync(
    "android-companion/app/src/main/kotlin/com/hayaletev/androidcompanion/transcript/AndroidAudioRecorder.kt",
    "utf8"
  );
  const voskTranscriberSource = readFileSync(
    "android-companion/app/src/main/kotlin/com/hayaletev/androidcompanion/transcript/AndroidVoskTranscriber.kt",
    "utf8"
  );
  const ambientListenerSource = readFileSync(
    "android-companion/app/src/main/kotlin/com/hayaletev/androidcompanion/transcript/AndroidAmbientOpenWakeListener.kt",
    "utf8"
  );
  const voskProfileSource = readFileSync(
    "android-companion/app/src/main/kotlin/com/hayaletev/androidcompanion/transcript/AndroidVoskModelProfile.kt",
    "utf8"
  );
  const modelManagerSource = readFileSync(
    "android-companion/app/src/main/kotlin/com/hayaletev/androidcompanion/transcript/TranscriptModelManager.kt",
    "utf8"
  );
  const gradleSource = readFileSync("android-companion/app/build.gradle.kts", "utf8");
  const activitySource = readFileSync(
    "android-companion/app/src/main/kotlin/com/hayaletev/androidcompanion/MainActivity.kt",
    "utf8"
  );
  const activityLayoutSource = readFileSync(
    "android-companion/app/src/main/res/layout/activity_main.xml",
    "utf8"
  );
  const stringsSource = readFileSync(
    "android-companion/app/src/main/res/values/strings.xml",
    "utf8"
  );
  const captureServiceSource = readFileSync("electron/capture-service.ts", "utf8");
  const companionLiveFeedSource = readFileSync("electron/capture/companion-live-feed.ts", "utf8");
  const captureTypesSource = readFileSync("electron/capture/types-and-defaults.ts", "utf8");
  const scrcpySessionManagerSource = readFileSync("electron/scrcpy-session-manager.ts", "utf8");

  assert.match(sessionSource, /previewActive = cameraController\.isPreviewBound\(\)/);
  assert.match(sessionSource, /cameraController\.stopSession\(\)/);
  assert.match(sessionSource, /startLivePreviewStreaming\(command\)/);
  assert.match(sessionSource, /stopLivePreviewStreaming\(\)/);
  assert.match(sessionSource, /submitLivePreviewFrame/);
  assert.match(sessionSource, /livePreviewUploadInFlight/);
  assert.match(sessionSource, /applyCommandProfile\(command\.profile\)/);
  assert.match(sessionSource, /"start-dictation"/);
  assert.match(sessionSource, /"stop-dictation"/);
  assert.doesNotMatch(sessionSource, /"start-preview-stream"/);
  assert.doesNotMatch(sessionSource, /"stop-preview-stream"/);
  assert.match(sessionSource, /"start-ambient-listener"/);
  assert.match(sessionSource, /"stop-ambient-listener"/);
  assert.match(sessionSource, /AndroidAmbientOpenWakeListener/);
  assert.match(sessionSource, /submitAmbientStatus/);
  assert.match(sessionSource, /publishAmbientStatus/);
  assert.match(sessionSource, /ToneGenerator/);
  assert.match(sessionSource, /buildAmbientTranscriptMetadata/);
  assert.match(sessionSource, /requestId = command\.requestId \?: command\.id/);
  assert.match(sessionSource, /target = command\.target/);
  assert.match(sessionSource, /"speechBackend"/);
  assert.match(sessionSource, /\$\{modelProfile\.backend\}-android/);
  assert.match(sessionSource, /AndroidVoskTranscriber/);
  assert.match(sessionSource, /requireAndroidVoskModelProfile/);
  assert.doesNotMatch(sessionSource, /AndroidWhisperTranscriber/);
  assert.doesNotMatch(sessionSource, /whisperTranscriber/);
  assert.match(sessionSource, /BRIDGE_OFFLINE_RETRY_MS = 5_000L/);
  assert.match(sessionSource, /DIAGNOSTICS_SYNC_INTERVAL_MS = 15_000L/);
  assert.match(sessionSource, /bridgeConnected\.not\(\) && lastBridgeFailureSignature == null/);
  assert.match(sessionSource, /reportFailureToDiagnostics = false/);
  assert.match(sessionSource, /syncDiagnosticsSnapshotIfDue\(\)/);
  assert.match(sessionSource, /private fun publishUiState/);
  assert.match(
    sessionSource,
    /if \(command\.kind == "start-dictation"\) \{[\s\S]*audioRecorder\.cancel\(\)/
  );
  assert.match(sessionSource, /val dictationStatus: String\? = null/);
  assert.match(sessionSource, /val ambientMicrophoneStatus: String\? = null/);
  assert.match(sessionSource, /val ambientListeningStatus: String\? = null/);
  assert.match(sessionSource, /ambientHistoryEntries\.joinToString\("\\n"\)/);
  assert.match(sessionSource, /updateAmbientUi\(\s*"preparing"/);
  assert.match(sessionSource, /updateAmbientUi\(status, message, transcript\)/);
  assert.match(sessionSource, /resolveAmbientMicrophoneStatus/);
  assert.match(sessionSource, /resolveAmbientMonitorStatus/);
  assert.match(sessionSource, /appendAmbientHistory/);
  assert.match(sessionSource, /R\.string\.dictation_status_recording/);
  assert.match(sessionSource, /R\.string\.dictation_status_transcribing/);
  assert.match(sessionSource, /R\.string\.dictation_status_done/);
  assert.match(sessionSource, /suspend fun captureManualPhoto\(\): File/);
  assert.match(sessionSource, /cameraController\.ensurePreview\(launchContext\.cameraConfig\)/);
  assert.match(sessionSource, /suspend fun uploadManualPhoto\(file: File\)/);
  assert.match(sessionSource, /stageForAnalyze = true/);

  assert.match(transportSource, /put\("previewActive", previewActive\)/);
  assert.match(transportSource, /put\("requestId", command\.requestId \?: command\.id\)/);
  assert.match(transportSource, /optJSONObject\("profile"\)/);
  assert.match(transportSource, /androidDictationBackend/);
  assert.match(transportSource, /BridgeAmbientOptions/);
  assert.match(transportSource, /optJSONObject\("ambient"\)/);
  assert.match(transportSource, /\/api\/v1\/ambient\/status/);
  assert.match(transportSource, /\/api\/v1\/live\/camera\/frame/);
  assert.doesNotMatch(transportSource, /\/api\/v1\/live\/analyze\/frame/);
  assert.match(transportSource, /submitLiveCameraFrame/);
  assert.doesNotMatch(transportSource, /submitAnalyzePreviewFrame/);
  assert.doesNotMatch(transportSource, /submitAnalyzePreviewChunk/);
  assert.match(transportSource, /archiveFormat/);
  assert.match(transportSource, /downloadTranscriptModel/);
  assert.match(transportSource, /modelDownloadClient/);
  assert.match(transportSource, /callTimeout\(5, TimeUnit\.MINUTES\)/);
  assert.match(transportSource, /val androidDictationBackend: String = "vosk"/);
  assert.match(transportSource, /reportFailureToDiagnostics: Boolean = true/);
  assert.match(
    transportSource,
    /postJson\("\/api\/v1\/session\/register", payload, reportFailureToDiagnostics\)/
  );
  assert.match(transportSource, /stageForAnalyze: Boolean = false/);
  assert.match(transportSource, /put\("stageForAnalyze", stageForAnalyze\)/);

  assert.match(cameraControllerSource, /ImageAnalysis\.Builder\(\)/);
  assert.match(cameraControllerSource, /STRATEGY_KEEP_ONLY_LATEST/);
  assert.match(cameraControllerSource, /CameraPreviewFrame/);
  assert.match(cameraControllerSource, /compressToJpeg/);
  assert.match(cameraControllerSource, /LIVE_PREVIEW_FRAME_INTERVAL_MS/);
  assert.match(cameraControllerSource, /private var activeCamera: Camera\? = null/);
  assert.match(cameraControllerSource, /fun setTorchOnBoundCamera\(enabled: Boolean\): Boolean/);
  assert.match(cameraControllerSource, /camera\.cameraControl\.enableTorch\(enabled\)/);
  assert.match(sessionSource, /cameraController\.setTorchOnBoundCamera\(enabled\)/);
  assert.match(sessionSource, /cameraManager\.setTorchMode\(cameraId, enabled\)/);

  assert.match(recorderSource, /MediaRecorder\.AudioSource\.MIC/);
  assert.match(recorderSource, /android-dictation-/);
  assert.match(voskTranscriberSource, /org\.vosk\.Model/);
  assert.match(voskTranscriberSource, /Recognizer\(model, ANDROID_VOSK_SAMPLE_RATE\)/);
  assert.match(voskTranscriberSource, /recognizer\.acceptWaveForm/);
  assert.match(ambientListenerSource, /class AndroidAmbientOpenWakeListener/);
  assert.match(ambientListenerSource, /WakeWordEngine/);
  assert.match(ambientListenerSource, /openWakeWord/);
  assert.match(ambientListenerSource, /hey_jarvis_v0\.1\.onnx/);
  assert.match(ambientListenerSource, /wake-detected/);
  assert.match(ambientListenerSource, /capturing/);
  assert.match(ambientListenerSource, /transcribing/);
  assert.match(ambientListenerSource, /Recognizer\(commandModel, AMBIENT_VOSK_SAMPLE_RATE\)/);
  assert.match(ambientListenerSource, /captureAmbientCommand/);
  assert.doesNotMatch(ambientListenerSource, /stripWakePhrase/);
  assert.doesNotMatch(ambientListenerSource, /ignoredWakeSuffix/);
  assert.doesNotMatch(ambientListenerSource, /leadingPhrase/);
  assert.match(voskProfileSource, /defaultAndroidVoskModelProfile/);
  assert.match(voskProfileSource, /requireAndroidVoskModelProfile/);
  assert.match(voskProfileSource, /vosk-model-small-tr-0\.3\.zip/);
  assert.match(modelManagerSource, /archiveFormat == "zip-directory"/);
  assert.match(modelManagerSource, /suspend fun ensureLocalModel/);
  assert.match(modelManagerSource, /copyAssetModelIfAvailable/);
  assert.match(modelManagerSource, /Bundled local Vosk model checksum did not match/);
  assert.match(modelManagerSource, /Local \$\{profile\.backend\} model is not available/);
  assert.match(modelManagerSource, /ZipInputStream/);
  assert.match(modelManagerSource, /Vosk model archive contains an unsafe path/);
  assert.match(gradleSource, /abiFilters \+= listOf\("armeabi-v7a", "arm64-v8a"\)/);
  assert.match(gradleSource, /compileSdk = 37/);
  assert.match(gradleSource, /androidx\.core:core-ktx:1\.19\.0/);
  assert.match(gradleSource, /com\.alphacephei:vosk-android:0\.3\.75/);
  assert.match(gradleSource, /com\.microsoft\.onnxruntime:onnxruntime-android:1\.24\.3/);
  assert.match(gradleSource, /xyz\.rementia:openwakeword:0\.1\.5/);
  assert.doesNotMatch(gradleSource, /WHISPER_CPP_DIR/);
  assert.doesNotMatch(gradleSource, /externalNativeBuild/);
  assert.match(activitySource, /manualDictationToggleButton/);
  assert.match(activitySource, /manualDictationTranscriptValue/);
  assert.match(activitySource, /buildManualTranscriptModelProfile/);
  assert.match(activitySource, /manualModelManager\.ensureLocalModel\(profile\)/);
  assert.match(activitySource, /withTimeout\(MANUAL_DICTATION_TRANSCRIBE_TIMEOUT_MS\)/);
  assert.match(activitySource, /manualVoskTranscriber\.transcribe/);
  assert.match(activitySource, /manualDictationTranscriptValue\.setSelection\(0\)/);
  assert.match(activitySource, /manualDictationTranscriptValue\.scrollTo\(0, 0\)/);
  assert.match(activitySource, /hasDesktopSessionIntent\(intent\)/);
  assert.match(activitySource, /maybeStartPreviewAndSessionLoop\(\)/);
  assert.match(activitySource, /ensureCaptureForegroundService\(\)/);
  assert.match(activitySource, /configureLaunchWakeBehavior\(\)/);
  assert.match(activitySource, /setShowWhenLocked\(true\)/);
  assert.match(activitySource, /setTurnScreenOn\(true\)/);
  assert.match(activitySource, /FLAG_KEEP_SCREEN_ON/);
  assert.match(activitySource, /configureManualImagePanel\(\)/);
  assert.match(activitySource, /imageCaptureButton\.setOnClickListener/);
  assert.match(activitySource, /CompanionTab\.AMBIENT/);
  assert.match(activitySource, /ambientMicrophoneValue/);
  assert.match(activitySource, /ambientStatusValue/);
  assert.match(activitySource, /ambientHistoryValue/);
  assert.match(activitySource, /takeManualImageCapture\(\)/);
  assert.match(activitySource, /addManualImageCapture\(\)/);
  assert.match(activitySource, /sessionCoordinator\.captureManualPhoto\(\)/);
  assert.match(activitySource, /sessionCoordinator\.uploadManualPhoto\(captureFile\)/);
  assert.match(activitySource, /Paused for manual dictation/);
  assert.doesNotMatch(activitySource, /manualModelManager\.ensureModel\(profile\)/);
  assert.doesNotMatch(activitySource, /AndroidWhisperTranscriber/);
  assert.doesNotMatch(activitySource, /ManualDictationBackend/);
  assert.match(activitySource, /defaultAndroidVoskModelProfile/);
  assert.match(
    activityLayoutSource,
    /android:id="@\+id\/subtitleText"[\s\S]*android:visibility="gone"/
  );
  assert.match(
    activityLayoutSource,
    /android:id="@\+id\/statusPanel"[\s\S]*android:visibility="gone"/
  );
  assert.match(stringsSource, /name="dictation_status_ambient_ready"/);
  assert.match(stringsSource, /name="dictation_detail_ambient_capturing"/);
  assert.match(stringsSource, /name="tab_ambient"/);
  assert.match(stringsSource, /name="ambient_status_waiting"/);
  assert.match(stringsSource, /name="ambient_event_wake_detected"/);
  assert.match(stringsSource, /name="ambient_history_empty"/);

  assert.match(captureServiceSource, /const previewActive =/);
  assert.match(captureServiceSource, /\/api\/v1\/transcript\/model/);
  assert.match(captureServiceSource, /\/api\/v1\/ambient\/status/);
  assert.match(captureServiceSource, /\/api\/v1\/live\/camera\/frame/);
  assert.match(captureServiceSource, /\/api\/v1\/live\/camera\/stream/);
  assert.match(captureServiceSource, /\/api\/v1\/live\/analyze\/frame/);
  assert.match(captureServiceSource, /\/api\/v1\/live\/analyze\/stream/);
  assert.match(captureServiceSource, /dropped: true/);
  assert.doesNotMatch(captureServiceSource, /CAPTURE_PREVIEW_FRAME_CHANNEL/);
  assert.match(captureServiceSource, /CAPTURE_AMBIENT_STATUS_CHANNEL/);
  assert.match(captureServiceSource, /CAPTURE_SCRCPY_V4L2_LABEL/);
  assert.match(scrcpySessionManagerSource, /--video-source=camera/);
  assert.match(scrcpySessionManagerSource, /--no-window/);
  assert.match(scrcpySessionManagerSource, /--v4l2-sink/);
  assert.doesNotMatch(scrcpySessionManagerSource, /startWindowsCameraFeed/);
  assert.doesNotMatch(captureServiceSource, /windows-camera-feed/);
  assert.match(captureServiceSource, /CompanionLiveFeedHub/);
  assert.match(captureServiceSource, /function shouldUseCompanionLiveFeed/);
  assert.match(captureServiceSource, /target === CAPTURE_ANALYZE_TARGET/);
  assert.match(captureServiceSource, /target\?\.startsWith\("room:"\)/);
  assert.match(companionLiveFeedSource, /\/api\/v1\/live\/camera\/stream/);
  assert.doesNotMatch(companionLiveFeedSource, /\/api\/v1\/live\/analyze\/stream/);
  assert.match(companionLiveFeedSource, /target=\$\{encodeURIComponent\(options\.target\)\}/);
  assert.match(captureServiceSource, /existingBridgeSession/);
  assert.match(captureServiceSource, /queuePendingBridgeCommand/);
  assert.match(captureServiceSource, /buildImmediateActionOutcome/);
  assert.match(captureServiceSource, /livePreview: useCompanionLiveFeed/);
  assert.doesNotMatch(captureServiceSource, /process\.platform === "win32"/);
  assert.doesNotMatch(scrcpySessionManagerSource, /--stay-awake/);
  assert.match(captureTypesSource, /CAPTURE_VOSK_MODEL_DESCRIPTORS/);
  assert.match(captureTypesSource, /return "vosk";/);
  assert.doesNotMatch(captureServiceSource, /commandKind === "open-camera"\s*\?\s*"ready"/);

  const bundledVoskModel = readFileSync(
    "android-companion/app/src/main/assets/transcript-models/vosk-model-small-tr-0.3.zip"
  );
  const openWakeMelModel = readFileSync(
    "android-companion/app/src/main/assets/melspectrogram.onnx"
  );
  const openWakeEmbeddingModel = readFileSync(
    "android-companion/app/src/main/assets/embedding_model.onnx"
  );
  const openWakeJarvisModel = readFileSync(
    "android-companion/app/src/main/assets/hey_jarvis_v0.1.onnx"
  );
  assert.equal(
    createHash("sha1").update(bundledVoskModel).digest("hex"),
    "1bc2391ea03d6091c39c4ff42b627c811501d41f"
  );
  assert.equal(
    createHash("sha1").update(openWakeMelModel).digest("hex"),
    "fa67c8a1c60c01a85fa65d79f666eb17b12e996d"
  );
  assert.equal(
    createHash("sha1").update(openWakeEmbeddingModel).digest("hex"),
    "7d6c08da684647b875a06cccd2cf9bf8bf90cb2a"
  );
  assert.equal(
    createHash("sha1").update(openWakeJarvisModel).digest("hex"),
    "1cca40997c29b7851b7a71ab84a228df92505375"
  );
  assert.equal(
    existsSync(
      "android-companion/app/src/main/kotlin/com/hayaletev/androidcompanion/transcript/AndroidWhisperTranscriber.kt"
    ),
    false
  );
  assert.equal(existsSync("android-companion/app/src/main/cpp/native-lib.cpp"), false);
  assert.equal(existsSync("android-companion/app/src/main/cpp/CMakeLists.txt"), false);
});

void test("capture settings exposes shared host dependency preparation", () => {
  const captureServiceSource = readFileSync("electron/capture-service.ts", "utf8");
  const hostDependencySource = readFileSync("electron/host-dependency-service.ts", "utf8");
  const captureTypesSource = readFileSync("src/types/capture.ts", "utf8");
  const analyzeSource = readFileSync("src/js/pages/analyze.ts", "utf8");
  const captureClientSource = readFileSync("src/js/modules/capture/electron-client.ts", "utf8");
  const capturePanelSource = readFileSync("src/js/pages/settings/panels/capture.ts", "utf8");
  const settingsHtmlSource = readFileSync("src/pages/settings.html", "utf8");
  const packageSource = readFileSync("package.json", "utf8");
  const preloadSource = readFileSync("electron/preload.cjs", "utf8");
  const ipcCaptureSource = readFileSync("electron/handlers/ipc-capture.ts", "utf8");
  const androidCompanionUtilsSource = readFileSync("scripts/android-companion-utils.mjs", "utf8");
  const v4l2SetupSource = readFileSync("scripts/setup-scrcpy-v4l2loopback.mjs", "utf8");
  const adbHelperSource = readFileSync("electron/capture/adb-helper.ts", "utf8");
  const windowManagerSource = readFileSync("electron/window-manager.ts", "utf8");
  const companionLiveFeedSource = readFileSync("electron/capture/companion-live-feed.ts", "utf8");

  assert.match(hostDependencySource, /host-dependencies/);
  assert.match(hostDependencySource, /getManagedAdbPath/);
  assert.match(hostDependencySource, /getWindowsScrcpyBundleCandidatePaths/);
  assert.match(hostDependencySource, /FFmpeg-Builds/);
  assert.match(hostDependencySource, /stagingFfmpegPath/);
  assert.match(hostDependencySource, /backupDir/);
  assert.match(hostDependencySource, /installManagedFfmpeg/);
  assert.match(hostDependencySource, /inspectV4l2LoopbackDependency/);
  assert.match(hostDependencySource, /getScrcpyV4l2SetupCommand/);
  assert.match(captureTypesSource, /export interface CaptureHostDependenciesStatus/);
  assert.match(captureTypesSource, /"partial"/);
  assert.match(captureTypesSource, /v4l2Loopback: CaptureV4l2LoopbackDependencyStatus/);
  assert.match(captureTypesSource, /"mjpeg-stream"/);
  assert.match(captureTypesSource, /"prepare-host-dependencies"/);
  assert.match(captureServiceSource, /async prepareHostDependencies\(\)/);
  assert.match(captureServiceSource, /inspectHostDependencies/);
  assert.match(captureServiceSource, /installManagedFfmpeg/);
  assert.match(captureServiceSource, /inspectV4l2LoopbackDependency/);
  assert.match(captureServiceSource, /v4l2LoopbackPartial/);
  assert.match(captureServiceSource, /androidBuildPartial/);
  assert.match(preloadSource, /capturePrepareHostDependencies/);
  assert.match(ipcCaptureSource, /capture-prepare-host-dependencies/);
  assert.match(captureClientSource, /case "prepare-host-dependencies":/);
  assert.match(analyzeSource, /previewVideo\.source === "mjpeg-stream"/);
  assert.match(analyzeSource, /android-camera-frame/);
  assert.match(capturePanelSource, /renderHostDependencies/);
  assert.match(capturePanelSource, /renderDependencyRow/);
  assert.match(capturePanelSource, /v4l2Loopback/);
  assert.match(settingsHtmlSource, /capture-host-dependencies-prepare-btn/);
  assert.match(settingsHtmlSource, /capture\.dependencies\.title/);
  assert.match(packageSource, /capture:v4l2:setup/);
  assert.match(androidCompanionUtilsSource, /ANDROID_COMPILE_SDK = "37\.0"/);
  assert.match(androidCompanionUtilsSource, /ANDROID_BUILD_TOOLS = "37\.0\.0"/);
  assert.match(androidCompanionUtilsSource, /getAndroidSdkCandidatePaths/);
  assert.match(androidCompanionUtilsSource, /homedir/);
  assert.match(androidCompanionUtilsSource, /join\(homeDir, "Android", "Sdk"\)/);
  assert.match(v4l2SetupSource, /waitForReadWriteAccess/);
  assert.match(v4l2SetupSource, /deviceReadyTimeoutMs/);
  assert.match(androidCompanionUtilsSource, /extractZipArchive/);
  assert.match(androidCompanionUtilsSource, /extractTarBzipArchive/);
  assert.match(androidCompanionUtilsSource, /unbzip2Stream/);
  assert.doesNotMatch(androidCompanionUtilsSource, /runCommand\("unzip"/);
  assert.doesNotMatch(androidCompanionUtilsSource, /\["-xjf"/);
  assert.match(androidCompanionUtilsSource, /isWindowsBatchCommand/);
  assert.match(androidCompanionUtilsSource, /process\.env\.ComSpec \?\? "cmd\.exe"/);
  assert.match(androidCompanionUtilsSource, /writeCompanionLocalProperties/);
  assert.match(androidCompanionUtilsSource, /sdk\.dir=\$\{normalizedSdkRoot\}/);
  assert.match(captureServiceSource, /createCompanionBuildScriptEnv/);
  assert.match(captureServiceSource, /ELECTRON_RUN_AS_NODE: "1"/);
  assert.match(captureServiceSource, /structuredErrorMessage/);
  assert.match(captureServiceSource, /INSTALL_FAILED_UPDATE_INCOMPATIBLE/);
  assert.match(captureServiceSource, /"uninstall",\s*CAPTURE_ANDROID_COMPANION_PACKAGE/);
  assert.match(captureServiceSource, /Clean installing the APK/);
  assert.match(adbHelperSource, /env\?: NodeJS\.ProcessEnv/);
  assert.match(adbHelperSource, /capture:v4l2:setup/);
  assert.equal((statSync("android-companion/gradlew").mode & 0o111) !== 0, true);
  assert.match(
    windowManagerSource,
    /media-src 'self' data: blob: http:\/\/localhost:\* http:\/\/127\.0\.0\.1:\*/
  );
  assert.match(windowManagerSource, /media-src 'self' data: blob: http:\/\/127\.0\.0\.1:\*/);
  assert.match(
    windowManagerSource,
    /img-src 'self' data: blob: https: http:\/\/localhost:\* http:\/\/127\.0\.0\.1:\*/
  );
  assert.match(windowManagerSource, /img-src 'self' data: blob: https: http:\/\/127\.0\.0\.1:\*/);
  assert.match(analyzeSource, /_cameraPreviewVideoSource/);
  assert.match(analyzeSource, /this\._cameraPreviewVideoSource === "mjpeg-stream"/);
  assert.match(captureServiceSource, /CompanionLiveFeedHub/);
  assert.match(captureServiceSource, /normalizeCompanionLiveFramePayload/);
  assert.match(companionLiveFeedSource, /mjpeg-stream/);
  assert.equal(existsSync("electron/capture/windows-camera-feed.ts"), false);
});

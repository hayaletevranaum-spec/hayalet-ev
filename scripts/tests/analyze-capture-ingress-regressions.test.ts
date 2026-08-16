import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

void test("analyze page wires central capture inbox imports into staged attachments", () => {
  const htmlSource = readFileSync("src/pages/analyze.html", "utf8");
  const settingsHtmlSource = readFileSync("src/pages/settings.html", "utf8");
  const pageSource = readFileSync("src/js/pages/analyze.ts", "utf8");
  const shellSource = readFileSync("src/index.html", "utf8");
  const operationsIndicatorsSource = readFileSync("src/js/app/operations-indicators.ts", "utf8");
  const operationSettingsOverlaySource = readFileSync(
    "src/js/modules/companion/operation-settings-overlay.ts",
    "utf8"
  );
  const uploadSource = readFileSync("src/js/pages/analyze/upload-handler.ts", "utf8");
  const captureClientSource = readFileSync("src/js/modules/capture/electron-client.ts", "utf8");
  const dictationUiSource = readFileSync("src/js/modules/transcript/dictation-ui.ts", "utf8");
  const voiceCommandMatcherSource = readFileSync(
    "src/js/modules/transcript/voice-command-matcher.ts",
    "utf8"
  );
  const captureServiceSource = readFileSync("electron/capture-service.ts", "utf8");
  const captureTypesSource = readFileSync("electron/capture/types-and-defaults.ts", "utf8");
  const captureAdbHelperSource = readFileSync("electron/capture/adb-helper.ts", "utf8");
  const scrcpySessionManagerSource = readFileSync("electron/scrcpy-session-manager.ts", "utf8");
  const commandCatalogSource = readFileSync("shared/capture/command-catalog.ts", "utf8");
  const companionCoordinatorSource = readFileSync(
    "android-companion/app/src/main/kotlin/com/hayaletev/androidcompanion/session/CompanionSessionCoordinator.kt",
    "utf8"
  );
  const settingsTypeSource = readFileSync("src/types/settings.ts", "utf8");
  const settingsDefaultsSource = readFileSync("src/types/settings-defaults.ts", "utf8");
  const settingsSchemaSource = readFileSync("src/js/modules/settings/settings-schema.ts", "utf8");

  assert.match(htmlSource, /id="capture-import-btn"/);
  assert.match(htmlSource, /class="compose-user-header"/);
  assert.match(htmlSource, /id="compose-android-status"/);
  assert.match(htmlSource, /id="compose-ambient-btn"/);
  assert.doesNotMatch(htmlSource, /id="compose-ambient-status"/);
  assert.doesNotMatch(htmlSource, /id="analyze-tts-settings-btn"/);
  assert.doesNotMatch(htmlSource, /id="compose-android-dictation-checkbox"/);
  assert.doesNotMatch(htmlSource, /id="compose-voice-command-btn"/);
  assert.match(shellSource, /id="topbar-companion-settings-btn"/);
  assert.match(shellSource, /id="operation-indicator-torch"/);
  assert.match(shellSource, /data-shell-i18n-title="indicators\.companionSettingsTitle"/);
  assert.match(shellSource, /data-shell-i18n-aria-label="indicators\.companionSettingsTitle"/);
  assert.match(shellSource, /data-shell-i18n-text="indicators\.companionSettingsLabel"/);
  assert.match(operationsIndicatorsSource, /openCompanionOperationSettings/);
  assert.match(operationsIndicatorsSource, /aria-expanded", "true"/);
  assert.match(operationsIndicatorsSource, /aria-expanded", "false"/);
  assert.match(operationsIndicatorsSource, /topbar-companion-settings-open-error/);
  assert.match(operationsIndicatorsSource, /android-torch/);
  assert.match(htmlSource, /id="android-camera-panel"/);
  assert.match(htmlSource, /<video[\s\S]*id="android-camera-feed"/);
  assert.match(htmlSource, /<img[\s\S]*id="android-camera-frame"/);
  assert.doesNotMatch(htmlSource, /compose-user-identity/);
  assert.doesNotMatch(htmlSource, /id="analyze-capture-shell"/);
  assert.doesNotMatch(htmlSource, /id="capture-clear-btn"/);
  assert.doesNotMatch(htmlSource, /id="capture-panel-close-btn"/);
  assert.doesNotMatch(htmlSource, /id="capture-photo-btn"/);
  assert.doesNotMatch(htmlSource, /id="capture-session-btn"/);
  assert.doesNotMatch(htmlSource, /id="capture-stop-btn"/);
  assert.doesNotMatch(htmlSource, /id="analyze-capture-latest-image"/);
  assert.match(pageSource, /consumeAnalyzeCaptureAssets/);
  assert.match(pageSource, /handleCaptureImportClick/);
  assert.match(pageSource, /renderCaptureSessionState/);
  assert.match(pageSource, /onCaptureMediaIngress/);
  assert.match(pageSource, /_handleCaptureMediaIngress/);
  assert.match(pageSource, /toggleAndroidCameraPanel/);
  assert.match(pageSource, /_attachAndroidCameraFeed/);
  assert.match(pageSource, /getUserMedia/);
  assert.match(pageSource, /_stageCaptureAsset/);
  assert.match(pageSource, /acquireOperationCapability/);
  assert.match(pageSource, /releaseOperationCapability/);
  assert.match(pageSource, /ANALYZE_CAMERA_OPERATION_CAPABILITIES:[\s\S]*"android-camera"/);
  assert.match(pageSource, /ANALYZE_CAMERA_OPERATION_CAPABILITIES:[\s\S]*"live-feed"/);
  assert.match(pageSource, /_acquireAndroidCameraPanelOperations/);
  assert.match(pageSource, /_releaseAndroidCameraPanelOperations/);
  assert.match(pageSource, /openAndroidCameraManagement/);
  assert.match(operationSettingsOverlaySource, /openCompanionOperationSettings/);
  assert.match(operationSettingsOverlaySource, /capture\.defaults\.dictationMode/);
  assert.match(operationSettingsOverlaySource, /capture\.defaults\.dictationLanguage/);
  assert.match(operationSettingsOverlaySource, /photoFlashMode/);
  assert.match(operationSettingsOverlaySource, /normalizeCapturePhraseList/);
  assert.doesNotMatch(pageSource, /_openCapturePanel/);
  assert.doesNotMatch(pageSource, /_closeCapturePanel/);
  assert.doesNotMatch(pageSource, /_openTtsSettingsOverlay/);
  assert.doesNotMatch(pageSource, /clearCapturePreview/);
  assert.match(pageSource, /capture-analyze-photo/);
  assert.match(pageSource, /start-camera-feed/);
  assert.match(pageSource, /stop-camera-feed/);
  assert.match(pageSource, /start-analyze-session/);
  assert.match(pageSource, /stop-analyze-session/);
  assert.match(pageSource, /_syncVoiceCommandSettings/);
  assert.match(pageSource, /subscribeCompanionOperationSettingsEvents/);
  assert.match(operationSettingsOverlaySource, /voiceCommands[\s\S]*analyzeEnabled/);
  assert.match(operationSettingsOverlaySource, /subscribeCompanionOperationSettingsEvents/);
  assert.match(pageSource, /path\.startsWith\("voiceCommands"\)/);
  assert.match(pageSource, /onCaptureAmbientStatus/);
  assert.match(pageSource, /_handleAmbientTranscriptIngress/);
  assert.match(pageSource, /_stripAmbientWakePhrase/);
  assert.match(pageSource, /_parseAmbientDictationIntent/);
  assert.match(pageSource, /_announceAmbientFeedback/);
  assert.match(pageSource, /_playAmbientFeedbackTone/);
  assert.match(pageSource, /ANALYZE_AMBIENT_DICTATION_PREFIXES/);
  assert.match(pageSource, /start-ambient-listener/);
  assert.match(pageSource, /stop-ambient-listener/);
  assert.match(
    pageSource,
    /matchVoiceCommand\(payload\.text, this\._buildAnalyzeVoiceCommandSpecs\(\)\)/
  );
  assert.match(pageSource, /payload\.target !== "analyze-compose"/);
  assert.match(pageSource, /payload\.requestId !== this\._ambientRequestId/);
  assert.match(pageSource, /requireEnabled: false/);
  assert.match(pageSource, /ambientFeedback: true/);
  assert.match(pageSource, /ambientCommandDetectedMessage/);
  assert.match(pageSource, /ambientDictationInsertedMessage/);
  assert.doesNotMatch(pageSource, /import-capture/);
  assert.doesNotMatch(pageSource, /\{\s*id:\s*"retake"/);
  assert.doesNotMatch(pageSource, /\{\s*id:\s*"attach"/);
  assert.doesNotMatch(pageSource, /\{\s*id:\s*"cancel"/);
  assert.match(voiceCommandMatcherSource, /\.normalize\("NFD"\)/);
  assert.match(voiceCommandMatcherSource, /\[ıİ\]/);
  assert.doesNotMatch(commandCatalogSource, /^\s*(retake|attach|cancel):/m);
  assert.match(companionCoordinatorSource, /stageForAnalyze = true/);
  assert.match(pageSource, /page\.captureImport\.success/);
  assert.match(uploadSource, /export function mergeUploadFiles/);
  assert.match(captureClientSource, /captureConsumeAnalyzeAssets/);
  assert.match(captureClientSource, /captureStartAnalyzeSession/);
  assert.match(captureClientSource, /captureStopAnalyzeSession/);
  assert.match(captureClientSource, /captureStartAnalyzePreview/);
  assert.match(captureClientSource, /captureStopAnalyzePreview/);
  assert.match(captureClientSource, /captureStartCameraFeed/);
  assert.match(captureClientSource, /captureStopCameraFeed/);
  assert.match(captureClientSource, /captureStartInteractiveMirror/);
  assert.match(captureClientSource, /captureStopInteractiveMirror/);
  assert.match(captureClientSource, /captureStartAmbientListener/);
  assert.match(captureClientSource, /captureStopAmbientListener/);
  assert.doesNotMatch(captureClientSource, /onCapturePreviewFrame/);
  assert.match(captureClientSource, /onCaptureAmbientStatus/);
  assert.match(captureClientSource, /captureRequestAnalyzePhoto/);
  assert.match(captureServiceSource, /consumeAnalyzeInboxAssets/);
  assert.match(captureServiceSource, /api\/v1\/media\/analyze/);
  assert.doesNotMatch(captureServiceSource, /api\/v1\/preview\/analyze/);
  assert.match(captureServiceSource, /api\/v1\/live\/analyze\/frame/);
  assert.match(captureServiceSource, /api\/v1\/live\/analyze\/stream/);
  assert.match(captureServiceSource, /api\/v1\/transcript\/ingress/);
  assert.match(captureServiceSource, /api\/v1\/ambient\/status/);
  assert.match(captureServiceSource, /CAPTURE_MEDIA_INGRESS_CHANNEL = "capture:media-ingress"/);
  assert.doesNotMatch(captureServiceSource, /CAPTURE_PREVIEW_FRAME_CHANNEL/);
  assert.match(captureServiceSource, /CAPTURE_AMBIENT_STATUS_CHANNEL = "capture:ambient-status"/);
  assert.match(captureServiceSource, /CAPTURE_SCRCPY_V4L2_LABEL/);
  assert.match(captureAdbHelperSource, /HAYALET_SCRCPY_V4L2_DEVICE/);
  assert.match(scrcpySessionManagerSource, /--video-source=camera/);
  assert.match(scrcpySessionManagerSource, /--camera-size/);
  assert.match(scrcpySessionManagerSource, /--no-window/);
  assert.match(scrcpySessionManagerSource, /--v4l2-sink/);
  assert.match(scrcpySessionManagerSource, /--v4l2-buffer/);
  assert.match(captureServiceSource, /startCameraFeedForAction/);
  assert.match(scrcpySessionManagerSource, /startInteractiveMirror/);
  assert.match(scrcpySessionManagerSource, /args: \["--serial", options\.deviceId\]/);
  const interactiveMirrorBlock =
    scrcpySessionManagerSource.match(
      /async startInteractiveMirror[\s\S]*?async stopSession/
    )?.[0] ?? "";
  assert.doesNotMatch(interactiveMirrorBlock, /--video-source=camera/);
  assert.doesNotMatch(interactiveMirrorBlock, /--v4l2-sink/);
  assert.doesNotMatch(interactiveMirrorBlock, /--no-window/);
  assert.match(captureServiceSource, /previewVideo/);
  assert.doesNotMatch(captureServiceSource, /--stay-awake/);
  assert.match(captureServiceSource, /stopScrcpyCameraFeed/);
  assert.match(
    captureServiceSource,
    /async startAnalyzePreviewStream[\s\S]*return await this\.startCameraFeedForAction\(options, "start-analyze-preview"\)/
  );
  assert.match(
    captureServiceSource,
    /if \(target === CAPTURE_ANALYZE_TARGET\)[\s\S]*const launchOutcome = await this\.launchCompanion\(\{ target, activeTab: "image" \}\)/
  );
  assert.match(captureServiceSource, /normalizeTranscriptTarget/);
  assert.match(captureServiceSource, /requestId and target are required/);
  assert.match(
    captureServiceSource,
    /const hasActiveRequest = this\.activeAnalyzeMediaRequestIds\.has\(requestId\)/
  );
  assert.match(captureServiceSource, /const stageForAnalyze = body\["stageForAnalyze"\] === true/);
  assert.match(captureServiceSource, /stageForAnalyze !== true \|\| activeSession === null/);
  assert.match(
    captureServiceSource,
    /stageForAnalyze === true \|\| captureSettings\.attachMode === "auto-stage"/
  );
  assert.match(captureServiceSource, /metadata:[\s\S]*stageForAnalyze/);
  assert.match(captureServiceSource, /Analyze capture request is not active/);
  assert.match(
    captureServiceSource,
    /activeAnalyzeMediaRequestIds\.add\(getCommandRequestId\(command\)\)/
  );
  assert.match(captureServiceSource, /statusText === "failed" \|\| statusText === "done"/);
  assert.match(captureServiceSource, /this\.analyzeState\.state === "result-ready"/);
  assert.match(captureServiceSource, /target !== CAPTURE_ANALYZE_TARGET/);
  assert.match(captureServiceSource, /open-camera/);
  assert.match(captureServiceSource, /close-camera/);
  assert.match(captureServiceSource, /start-dictation/);
  assert.match(captureServiceSource, /stop-dictation/);
  assert.doesNotMatch(captureServiceSource, /start-preview-stream/);
  assert.doesNotMatch(captureServiceSource, /stop-preview-stream/);
  assert.match(captureServiceSource, /start-ambient-listener/);
  assert.match(captureServiceSource, /stop-ambient-listener/);
  assert.match(captureServiceSource, /setTorch/);
  assert.match(captureClientSource, /captureSetTorch/);
  assert.match(captureServiceSource, /resolveAmbientCommandProfile/);
  assert.match(captureServiceSource, /cancelAnalyzeDictation/);
  assert.match(captureServiceSource, /am", "force-stop", CAPTURE_ANDROID_COMPANION_PACKAGE/);
  assert.match(captureClientSource, /captureCancelAnalyzeDictation/);
  assert.match(pageSource, /cancelAndroidDictation/);
  assert.match(captureServiceSource, /previewActive/);
  assert.match(captureServiceSource, /transcriptModel/);
  assert.match(settingsTypeSource, /transcriptBackend\?: TranscriptDictationBackend/);
  assert.match(settingsTypeSource, /androidTranscriptModelVariant\?: TranscriptModelVariant/);
  assert.match(settingsTypeSource, /androidDictationBackend\?: AndroidDictationBackend/);
  assert.match(settingsTypeSource, /export type AnalyzeDictationMode = "local" \| "android"/);
  assert.match(settingsTypeSource, /dictationMode\?: AnalyzeDictationMode/);
  assert.match(settingsTypeSource, /dictationLanguage\?: TranscriptSupportedLanguage/);
  assert.match(settingsTypeSource, /ambient\?: VoiceCommandAmbientSettings/);
  assert.match(settingsDefaultsSource, /androidTranscriptModelVariant: "light"/);
  assert.match(settingsDefaultsSource, /androidDictationBackend: "vosk"/);
  assert.match(settingsDefaultsSource, /androidTorchEnabled: false/);
  assert.match(settingsDefaultsSource, /photoFlashMode: "off"/);
  assert.match(settingsDefaultsSource, /dictationMode: "local"/);
  assert.match(settingsDefaultsSource, /dictationLanguage: "tr"/);
  assert.match(settingsDefaultsSource, /DEFAULT_AMBIENT_WAKE_PHRASES/);
  assert.match(settingsSchemaSource, /androidTranscriptModelVariant:[\s\S]*"light"/);
  assert.match(
    settingsSchemaSource,
    /androidDictationBackend:[\s\S]*normalizeAndroidDictationBackend/
  );
  assert.match(captureTypesSource, /defaults\["androidTranscriptModelVariant"\][\s\S]*"light"/);
  assert.match(captureTypesSource, /defaults\?\.\["androidDictationBackend"\]/);
  assert.match(captureTypesSource, /androidDictationBackend: settings\.androidDictationBackend/);
  assert.match(settingsSchemaSource, /normalizeAmbientWakePhrases/);
  assert.match(settingsSchemaSource, /normalizeAnalyzeDictationMode/);
  assert.match(settingsSchemaSource, /androidTorchEnabled:[\s\S]*=== true/);
  assert.match(settingsSchemaSource, /photoFlashMode:[\s\S]*normalizeCapturePhotoFlashMode/);
  assert.match(settingsSchemaSource, /dictationLanguage:[\s\S]*resolveTranscriptSupportedLanguage/);
  assert.match(captureTypesSource, /photoFlashMode: settings\.photoFlashMode/);
  assert.match(settingsSchemaSource, /DEFAULT_AMBIENT_ACTIVE_WINDOW_MS/);
  assert.match(captureTypesSource, /return "vosk";/);
  assert.match(captureTypesSource, /vosk-model-small-tr-0\.3\.zip/);
  assert.match(captureServiceSource, /ensureDirectCompanionModelArchive/);
  assert.doesNotMatch(
    captureServiceSource,
    /normalizeTranscriptModelVariant\(general\["transcriptModelVariant"\], "full"\)/
  );
  assert.doesNotMatch(captureServiceSource, /commandCatalogJson/);
  assert.match(captureClientSource, /"error" in value/);
  assert.match(captureServiceSource, /summarizeCompanionBuildFailure/);
  assert.match(
    dictationUiSource,
    /activeAndroidRequestId = requestId;[\s\S]*await options\.requestAndroidDictation\?\.\(\{[\s\S]*action: "start"/
  );
  assert.match(dictationUiSource, /payload\.status === "started"[\s\S]*currentState = "listening"/);
  assert.match(dictationUiSource, /ANDROID_TRANSCRIPTION_TIMEOUT_MS = 35_000/);
  assert.match(dictationUiSource, /scheduleAndroidTranscriptionTimeout/);
  assert.match(
    dictationUiSource,
    /cancelAndroidTranscription\(requestId, options\.getLabels\(\)\.androidTimeoutMessage\)/
  );
  assert.match(dictationUiSource, /getLanguage\?: \(\) => string \| null/);
  assert.match(dictationUiSource, /language: options\.getLanguage\?\.\(\) \?\? null/);
  assert.match(
    dictationUiSource,
    /button\.disabled = state === "transcribing" && mode !== "android"/
  );
  assert.match(dictationUiSource, /transcriptionBackend: transcription\.backend/);
  assert.match(dictationUiSource, /transcriptionMs: transcription\.transcriptionMs/);
  assert.match(dictationUiSource, /if \(result === "ready"\)[\s\S]*currentState = "listening"/);
  assert.match(
    dictationUiSource,
    /currentState = "listening";[\s\S]*labels\.androidPreparingMessage/
  );
  assert.match(
    dictationUiSource,
    /currentState === "listening" \|\| currentState === "transcribing"/
  );
  assert.match(captureServiceSource, /requirePreviewActive: false/);
  assert.match(captureServiceSource, /requireSession: false/);
  assert.doesNotMatch(pageSource, /captureState === "pending-launch"[\s\S]*return "starting"/);
  assert.match(settingsHtmlSource, /id="capture-host-dependencies-prepare-btn"/);
  assert.match(settingsHtmlSource, /data-i18n-text="capture\.dependencies\.title"/);
  assert.doesNotMatch(settingsHtmlSource, /data-i18n-text="capture\.defaults\.title"/);
  assert.doesNotMatch(settingsHtmlSource, /data-i18n-text="capture\.voiceCommands\.title"/);
  assert.doesNotMatch(settingsHtmlSource, /data-i18n-text="capture\.policy\.title"/);
  assert.doesNotMatch(settingsHtmlSource, /id="capture-default-device-select"/);
  assert.doesNotMatch(settingsHtmlSource, /id="capture-provider-android-companion"/);
  assert.doesNotMatch(settingsHtmlSource, /id="capture-voice-command-save-btn"/);
  assert.doesNotMatch(settingsHtmlSource, /id="app-transcript-backend-select"/);
  assert.doesNotMatch(settingsHtmlSource, /id="app-transcript-profile-select"/);
});

import { LogCategory } from "@shared/logging-core";
import { getErrorMessage } from "@shared/index.js";
import type { TranslationParams } from "@shared/i18n.js";
import { SettingsManager } from "../modules/settings-manager.js";
import { TrafficManager } from "../modules/traffic-manager.js";
import { Logger } from "../modules/logger/index.js";
import { AppState } from "../modules/app-state.js";
import { AppI18n } from "../modules/i18n/index.js";
import { ConversationListManager } from "../modules/conversation-list-manager.js";
import {
  dispatchInternalSlotBridge,
  sendProtocolThroughSlotBridge,
} from "../modules/commands/slot-bridge-runtime.js";
import { getMimeTypeFromPath } from "../constants/index.js";
import { SlotController, SlotEvent } from "../modules/slot-controller.js";
import { ButtonStates } from "../ui/button-states.js";
import { isSceneUiMode } from "../ui/ui-mode.js";
import { notifyUser } from "../ui/user-notification.js";
import { shellT } from "../app/shell-i18n.js";
import { isAssistantAccountsSettingsPath, isAssistantSlotSettingsPath } from "@shared/settings.js";
import type { Us1RoomPackageCandidate, Us1SessionEvent } from "@shared/us1-mail.js";
import {
  applySceneAlphaWindowBoundsToTarget,
  clearSceneAlphaWindowFrameVariables,
} from "../scene/alpha-window.js";
import { dispatchSceneAction } from "../scene/action-dispatcher.js";
import {
  navigateToScenePage,
  openSceneSettingsPanel,
  openSceneWorkspaceTool,
} from "../scene/navigation.js";
import { getCoverSceneProjectionFromElement } from "../scene/projection.js";
import { renderSceneBackLayer } from "../scene/renderers/back-layer.js";
import { renderSceneCharacterLayer } from "../scene/renderers/character-layer.js";
import { renderSceneObjectLayer } from "../scene/renderers/object-layer.js";
import {
  applySceneDebugFlag,
  createSceneLayoutEditorAssetBindings,
  createSceneDebugRuntimeSession,
  SceneLayoutEditor,
  type SceneLayoutEditorSelection,
  getSceneDebugRoomOptions,
  isSceneDebugRoomActive,
  openSceneDebugRoom,
  subscribeSceneThemeAssetDraft,
} from "../scene-editor/index.js";
import { buildSceneCharacterRoster, resolveSceneAvatarSource } from "../scene/characters/index.js";
import type { SceneClickableThemeDefinition } from "../scene/schema.js";
import type { SceneLayoutConfig } from "../scene/layout/index.js";
import {
  getSceneBackNodeForView,
  getSceneObjectNodesForView,
  resolveSceneNodeLabelText,
} from "../scene/layout/index.js";
import {
  getSceneRoomBackgroundSrc,
  getSceneRoomPanelSrc,
  getSceneRoomPanelTransparentWindow,
  SceneThemeManager,
} from "../scene-system/index.js";
import { syncSceneViewRuntime } from "../scene/runtime.js";

import { renderMessages, resetMessageRenderState } from "./analyze/message-renderer.js";
import type { RenderCallbacks } from "./analyze/message-renderer.js";
import { createMessageBubble } from "./analyze/message-renderer-bubble.js";
import {
  isDbAttachmentsResult,
  isDbMessagesResult,
  normalizeAttachmentData,
  normalizeMessageItem,
  type AttachmentData,
} from "./analyze/message-renderer-types.js";
import {
  renderUploadList,
  addUploadFiles,
  mergeUploadFiles,
  removeUploadFile,
} from "./analyze/upload-handler.js";
import type { StagedFile } from "./analyze/upload-handler.js";
import { applyMessageAction } from "./analyze/context-menu.js";
import { initDraft, loadDraft, persistDraft } from "./analyze/draft-manager.js";
import {
  bindDictationTrigger,
  type DictationBinding,
  type DictationMode,
} from "../modules/transcript/dictation-ui.js";
import { insertTranscriptIntoTextarea } from "../modules/transcript/textarea-insertion.js";
import {
  matchVoiceCommand,
  normalizeVoiceCommandText,
  type VoiceCommandSpec,
} from "../modules/transcript/voice-command-matcher.js";
import {
  consumeAnalyzeCaptureAssets,
  getCaptureStatus,
  onCaptureAmbientStatus,
  onCaptureMediaIngress,
  onCaptureDictationStatus,
  refreshCaptureStatus,
  runCaptureAction,
} from "../modules/capture/electron-client.js";
import {
  acquireOperationCapability,
  releaseOperationCapability,
} from "../modules/operations/electron-client.js";
import { onTranscriptIngress } from "../modules/transcript/electron-client.js";
import {
  getTtsStatus,
  onTtsStatus,
  speakText,
  stopSpeech,
} from "../modules/tts/electron-client.js";
import type {
  CaptureActionOutcome,
  CaptureAmbientStatusPayload,
  CaptureAnalyzePreviewVideoStatus,
  CaptureAndroidDeviceStatus,
  CaptureHostAction,
  CaptureMediaIngressPayload,
  CaptureServiceStatus,
} from "../../types/capture.js";
import type {
  TranscriptIngressPayload,
  TranscriptSupportedLanguage,
  TranscriptTargetId,
} from "../../types/transcript.js";
import type { TtsRuntimeStatus, TtsStatus } from "../../types/tts.js";
import type { OperationCapability, OperationOwner } from "../../types/operations.js";
import {
  ambientActiveWindowMs,
  ambientSilenceTimeoutMs,
  ambientWakePhrases,
  dictationLanguage,
  settingsDictationMode,
  subscribeCompanionOperationSettingsEvents,
  ttsLanguage,
  ttsMode,
  voiceCommandPhrases,
} from "../modules/companion/operation-settings-overlay.js";
interface ConversationSelectedDetail {
  provider?: "ai0" | "ai1" | "ai2" | "us1";
  isNew?: boolean;
  localSessionId?: string | null;
}

interface DraftState {
  message: string;
  files: StagedFile[];
}

interface CaptureRunOptions {
  notify?: boolean;
  poll?: boolean;
}

type AnalyzeVoiceAction = CaptureHostAction;

type AnalyzeParticipant = "ai1" | "ai2" | "us1";
type AnalyzeSceneViewId = "table";
type AnalyzeAmbientStatus = CaptureAmbientStatusPayload["status"] | "idle";
type AnalyzeAmbientFeedbackKind = "success" | "error" | "warning" | "info";
type AnalyzeAmbientFeedbackTone =
  "started" | "wake" | "capturing" | "transcribing" | "success" | "stopped" | "failed";

interface AnalyzeAmbientDictationIntent {
  explicit: boolean;
  text: string;
}

const ANALYZE_AMBIENT_DICTATION_PREFIXES = ["mesaj yaz", "mesaj", "yaz", "dikte"] as const;
const ANALYZE_AMBIENT_CANCEL_PHRASES = ["iptal", "iptal et", "vazgeç", "vazgec"] as const;
const ANALYZE_CAMERA_OPERATION_OWNER: OperationOwner = {
  id: "analyze-room",
  label: "Analyze Room",
  roomId: "analyze",
};
const ANALYZE_CAMERA_OPERATION_CAPABILITIES: OperationCapability[] = [
  "android-camera",
  "live-feed",
];

function analyzeT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`app.analyze.${key}`, params);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertNeverAnalyzeValue(value: never): never {
  throw new Error(`Unexpected Analyze value: ${String(value)}`);
}

function isConversationSelectedDetail(value: unknown): value is ConversationSelectedDetail {
  if (value === null || value === undefined || typeof value !== "object") {
    return false;
  }

  const maybe = value as Record<string, unknown>;
  const provider = maybe["provider"];
  const isNew = maybe["isNew"];

  const providerValid =
    provider === undefined ||
    provider === "ai0" ||
    provider === "ai1" ||
    provider === "ai2" ||
    provider === "us1";
  const isNewValid = isNew === undefined || typeof isNew === "boolean";
  const localSessionIdValid =
    maybe["localSessionId"] === undefined ||
    maybe["localSessionId"] === null ||
    typeof maybe["localSessionId"] === "string";

  return providerValid && isNewValid && localSessionIdValid;
}

function isDraftState(value: unknown): value is DraftState {
  if (value === null || value === undefined || typeof value !== "object") {
    return false;
  }

  const maybe = value as Record<string, unknown>;
  return typeof maybe["message"] === "string" && Array.isArray(maybe["files"]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Array.isArray(value) === false;
}

function isUs1SessionEvent(value: unknown): value is Us1SessionEvent {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value["remoteUserId"] === "string" &&
    typeof value["localSessionId"] === "string" &&
    typeof value["conversationId"] === "string" &&
    typeof value["isNewSession"] === "boolean" &&
    (value["sessionTitle"] === undefined ||
      value["sessionTitle"] === null ||
      typeof value["sessionTitle"] === "string") &&
    (value["mode"] === undefined || value["mode"] === "new" || value["mode"] === "reply") &&
    (value["openHint"] === undefined ||
      value["openHint"] === "auto_if_idle" ||
      value["openHint"] === "list_only") &&
    (value["createdAt"] === undefined || typeof value["createdAt"] === "number") &&
    (value["sentAt"] === undefined || typeof value["sentAt"] === "number")
  );
}

function isUs1RoomPackageCandidate(value: unknown): value is Us1RoomPackageCandidate {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value["remoteUserId"] === "string" &&
    typeof value["localSessionId"] === "string" &&
    typeof value["conversationId"] === "string" &&
    typeof value["messageId"] === "string" &&
    typeof value["originalName"] === "string" &&
    typeof value["storedPath"] === "string" &&
    (value["attachmentId"] === undefined || typeof value["attachmentId"] === "string") &&
    (value["mimeType"] === undefined ||
      value["mimeType"] === null ||
      typeof value["mimeType"] === "string") &&
    (value["size"] === undefined || typeof value["size"] === "number")
  );
}

export class AnalyzeController {
  stagedFiles: StagedFile[];
  lastMessages: Record<AnalyzeParticipant, string>;
  us1SessionId: string | null;
  us1SessionIdentityId: string | null;
  _slotActiveStates: Record<AnalyzeParticipant, boolean>;
  beforeUnloadHandler: (() => void) | null;
  _unsubSettings: (() => void) | null;
  _unsubSlotController: (() => void) | null;
  _unsubAppState: (() => void) | null;
  _unsubI18n: (() => void) | null;
  _unsubCaptureMediaIngress: (() => void) | null;
  _unsubCaptureAmbientStatus: (() => void) | null;
  _unsubAmbientTranscriptIngress: (() => void) | null;
  _unsubTtsStatus: (() => void) | null;
  _unsubCompanionOperationSettings: (() => void) | null;
  _boundActions: boolean;
  _us1PollTimer: number | null;
  _us1SyncInFlight: boolean;
  _us1LoadingBusy: boolean;
  _us1SendBusy: boolean;
  _us1AwaitingReply: boolean;
  _syncingUs1Indicators: boolean;
  _analyzeSceneActiveView: AnalyzeSceneViewId | null;
  _analyzeSceneDebugEnabled: boolean;
  private readonly _analyzeSceneSession = createSceneDebugRuntimeSession("analyze");
  _analyzeSceneEditor: SceneLayoutEditor | null;
  _analyzeSceneSelection: SceneLayoutEditorSelection;
  _analyzeSceneResizeObserver: ResizeObserver | null;
  _analyzeSceneCharacterRenderToken: number;
  _unsubSceneTheme: (() => void) | null;
  _unsubSceneThemeAssets: (() => void) | null;
  _dictationBinding: DictationBinding | null;
  _dictationMode: DictationMode;
  _captureStatus: CaptureServiceStatus | null;
  _captureStatusPollTimer: number | null;
  _lastAutoStagedCapturePath: string | null;
  _cameraPanelOpen: boolean;
  _cameraPreviewRequestId: string | null;
  _cameraPreviewStream: MediaStream | null;
  _cameraPreviewVideoSource: CaptureAnalyzePreviewVideoStatus["source"] | null;
  _cameraPanelOperationCapabilities: OperationCapability[];
  _cameraPanelStatusMessage: string | null;
  _cameraPanelHasFrame: boolean;
  _ttsRuntimeStatus: TtsRuntimeStatus | null;
  _ttsActiveRequestId: string | null;
  _ttsActiveMessageId: string | null;
  _voiceCommandsEnabled: boolean;
  _ambientEnabled: boolean;
  _ambientRequestId: string | null;
  _ambientStatus: AnalyzeAmbientStatus;
  _ambientStatusMessage: string | null;
  _ambientStatusMessageKind: AnalyzeAmbientFeedbackKind | null;
  _ambientToneLastPlayedAt: Partial<Record<AnalyzeAmbientFeedbackTone, number>>;

  get _analyzeSceneLayout(): SceneLayoutConfig {
    return this._analyzeSceneSession.getSceneLayout();
  }

  set _analyzeSceneLayout(sceneLayout: SceneLayoutConfig) {
    this._analyzeSceneSession.setSceneLayout(sceneLayout);
  }

  get _analyzeSceneClickableTheme(): SceneClickableThemeDefinition {
    return this._analyzeSceneSession.getSceneClickableTheme();
  }

  set _analyzeSceneClickableTheme(sceneClickableTheme: SceneClickableThemeDefinition) {
    this._analyzeSceneSession.setSceneClickableTheme(sceneClickableTheme);
  }

  constructor() {
    this.stagedFiles = [];
    this.lastMessages = { ai1: "", ai2: "", us1: "" };
    this.us1SessionId = null;
    this.us1SessionIdentityId = null;
    this._slotActiveStates = { ai1: false, ai2: false, us1: false };
    this.beforeUnloadHandler = null;
    this._unsubSettings = null;
    this._unsubSlotController = null;
    this._unsubAppState = null;
    this._unsubI18n = null;
    this._unsubCaptureMediaIngress = null;
    this._unsubCaptureAmbientStatus = null;
    this._unsubAmbientTranscriptIngress = null;
    this._unsubTtsStatus = null;
    this._unsubCompanionOperationSettings = null;
    this._boundActions = false;
    this._us1PollTimer = null;
    this._us1SyncInFlight = false;
    this._us1LoadingBusy = false;
    this._us1SendBusy = false;
    this._us1AwaitingReply = false;
    this._syncingUs1Indicators = false;
    this._analyzeSceneActiveView = null;
    this._analyzeSceneDebugEnabled = false;
    this._analyzeSceneEditor = null;
    this._analyzeSceneSelection = null;
    this._analyzeSceneResizeObserver = null;
    this._analyzeSceneCharacterRenderToken = 0;
    this._unsubSceneTheme = null;
    this._unsubSceneThemeAssets = null;
    this._dictationBinding = null;
    this._dictationMode = settingsDictationMode();
    this._captureStatus = null;
    this._captureStatusPollTimer = null;
    this._lastAutoStagedCapturePath = null;
    this._cameraPanelOpen = false;
    this._cameraPreviewRequestId = null;
    this._cameraPreviewStream = null;
    this._cameraPreviewVideoSource = null;
    this._cameraPanelOperationCapabilities = [];
    this._cameraPanelStatusMessage = null;
    this._cameraPanelHasFrame = false;
    this._ttsRuntimeStatus = null;
    this._ttsActiveRequestId = null;
    this._ttsActiveMessageId = null;
    this._voiceCommandsEnabled =
      SettingsManager.getSnapshot().voiceCommands?.analyzeEnabled === true;
    this._ambientEnabled = false;
    this._ambientRequestId = null;
    this._ambientStatus = "idle";
    this._ambientStatusMessage = null;
    this._ambientStatusMessageKind = null;
    this._ambientToneLastPlayedAt = {};
  }

  async init(): Promise<void> {
    await this.loadSettings();
    this._syncVoiceCommandSettings();
    this._analyzeSceneDebugEnabled = applySceneDebugFlag();
    this._analyzeSceneSession.load(this._analyzeSceneDebugEnabled);
    this.applyAvatars();
    this.applyNames();

    this._unsubSettings ??= SettingsManager.subscribe(
      ({ changedPaths }: { changedPaths: string[] }) => {
        if (changedPaths.includes("*") || changedPaths.some((path) => path.startsWith("capture"))) {
          this._dictationMode = settingsDictationMode();
          this._syncDictationAvailability();
          this.renderCaptureSessionState();
          this._renderAmbientToggle();
          this._syncTtsBubbleStates();
        }
        if (
          changedPaths.includes("*") ||
          changedPaths.some((path) => path.startsWith("voiceCommands"))
        ) {
          this._syncVoiceCommandSettings();
          this._renderAmbientToggle();
        }

        const shouldRefreshAnalyzeHeader =
          changedPaths.includes("*") ||
          changedPaths.some(
            (path) =>
              path.startsWith("user") ||
              path.startsWith("accounts") ||
              path.startsWith("remoteUsers") ||
              isAssistantAccountsSettingsPath(path) ||
              path.startsWith("slots") ||
              path.startsWith("us1Slot") ||
              isAssistantSlotSettingsPath(path)
          );

        if (!shouldRefreshAnalyzeHeader) {
          return;
        }

        this.applyAvatars();
        this.applyNames();
        this.updateConnectionStates();
        void this._renderAnalyzeSceneCharacters();
      }
    );

    this.bindActions();
    this._bindDictationUi();
    this._unsubCaptureMediaIngress ??= onCaptureMediaIngress((payload) => {
      this._handleCaptureMediaIngress(payload);
    });
    this._unsubCaptureAmbientStatus ??= onCaptureAmbientStatus((payload) => {
      this._handleAmbientStatus(payload);
    });
    this._unsubAmbientTranscriptIngress ??= onTranscriptIngress((payload) => {
      void this._handleAmbientTranscriptIngress(payload);
    });
    this._unsubTtsStatus ??= onTtsStatus((payload) => {
      this._handleTtsStatus(payload);
    });
    this._unsubCompanionOperationSettings ??= subscribeCompanionOperationSettingsEvents((event) => {
      if (event.type === "capture-status") {
        this._captureStatus = event.status;
        this.renderCaptureSessionState();
        return;
      }
      if (event.type === "tts-runtime-status") {
        this._ttsRuntimeStatus = event.status;
        this._syncTtsBubbleStates();
        return;
      }
      if (event.type === "dictation-mode") {
        this._dictationMode = event.mode;
        this._syncDictationAvailability();
        return;
      }
      this._syncVoiceCommandSettings();
      this._renderAmbientToggle();
    });
    TrafficManager.onUpdate(() => {
      this.updateSendButtonState();
      void this._renderAnalyzeSceneCharacters();
    });

    this._unsubSlotController ??= SlotController.on(SlotEvent.STATE_CHANGED, () => {
      this.applyNames();
      this.updateConnectionStates();
      void this._renderAnalyzeSceneCharacters();
    });

    this._unsubAppState ??= AppState.subscribe(() => {
      this.applyNames();
      void this._renderAnalyzeSceneCharacters();
    });

    this._unsubI18n ??= AppI18n.subscribe(() => {
      this.applyNames();
      this.updateConnectionStates();
      this._dictationBinding?.refresh();
      this._renderAmbientToggle();
      this._syncTtsBubbleStates();
      this.refreshUploads();
      this.renderCaptureSessionState();
      this._renderAnalyzeSceneHotspots();
      this._analyzeSceneEditor?.refresh();
      void this._renderMessages("ai1");
      void this._renderMessages("ai2");
      void this._renderUs1Messages();
      void this._renderAnalyzeSceneCharacters();
    });

    this.updateConnectionStates();
    this.refreshUploads();
    this.renderCaptureSessionState();
    this._renderAmbientToggle();
    void this._refreshTtsRuntimeStatus();
    this._initializeAnalyzeScene();
    this._unsubSceneTheme ??= SceneThemeManager.onChange(() => {
      this._analyzeSceneSession.reloadFromActiveTheme(this._analyzeSceneDebugEnabled);
      this._analyzeSceneSelection = null;
      this._syncAnalyzeSceneVisibility();
    });
    this._unsubSceneThemeAssets ??= subscribeSceneThemeAssetDraft(() => {
      this._syncAnalyzeSceneVisibility();
    });

    void this._initDraftSystem();
    void this.refreshCaptureSessionState(true);

    window.addEventListener("conversation-selected", (e) => {
      const rawDetail: unknown = (e as CustomEvent<unknown>).detail;
      const detail = isConversationSelectedDetail(rawDetail) ? rawDetail : {};
      Logger.debug(LogCategory.ANALYZE, analyzeT("logs.conversationSelectedReceived"), { detail });
      if (detail.provider !== undefined) {
        if (detail.isNew === true) {
          Logger.debug(
            LogCategory.ANALYZE,
            analyzeT("logs.newConversationSelected", { provider: detail.provider })
          );
          this._clearSlotMessages(detail.provider);
        } else if (detail.provider === "us1") {
          this.us1SessionId =
            typeof detail.localSessionId === "string" && detail.localSessionId.trim() !== ""
              ? detail.localSessionId.trim()
              : null;
          void this._renderUs1Messages();
        } else if (detail.provider === "ai0") {
          return;
        } else {
          Logger.debug(
            LogCategory.ANALYZE,
            analyzeT("logs.renderMessagesForProvider", { provider: detail.provider })
          );
          void this._renderMessages(detail.provider);
        }
      } else {
        Logger.warn(LogCategory.ANALYZE, analyzeT("logs.conversationSelectedMissingProvider"), {
          detail,
        });
      }
    });
  }

  _initializeAnalyzeScene(): void {
    this._setupAnalyzeSceneDebug();
    this._syncAnalyzeSceneAssets();
    this._renderAnalyzeScene();
    this._syncAnalyzeSceneVisibility();
    this._observeAnalyzeSceneLayout();
  }

  _syncAnalyzeSceneAssets(): void {
    const background = document.getElementById(
      "analyze-scene-background"
    ) as HTMLImageElement | null;
    const tableArt = document.getElementById("analyze-scene-table-art") as HTMLImageElement | null;

    if (background !== null) {
      background.src = getSceneRoomBackgroundSrc("analyze");
      background.alt = "";
    }

    if (tableArt !== null) {
      const panelId = this._analyzeSceneActiveView ?? "table";
      tableArt.src = getSceneRoomPanelSrc("analyze", panelId) ?? "";
      tableArt.alt = "";
    }
  }

  _syncAnalyzeSceneTransparentWindow(): void {
    const tableView = document.getElementById("analyze-scene-table-view");
    const room = document.querySelector(".analyze-room");
    if (!(tableView instanceof HTMLElement) || !(room instanceof HTMLElement)) {
      return;
    }

    const panelId = this._analyzeSceneActiveView ?? "table";
    if (!isSceneUiMode() || this._analyzeSceneActiveView === null) {
      clearSceneAlphaWindowFrameVariables(room, "analyze-scene");
      return;
    }

    applySceneAlphaWindowBoundsToTarget({
      bounds: getSceneRoomPanelTransparentWindow("analyze", panelId),
      container: tableView,
      target: room,
      variablePrefix: "analyze-scene",
    });
  }

  _setupAnalyzeSceneDebug(): void {
    const editorHost = document.getElementById("analyze-scene-editor-host");
    if (!(editorHost instanceof HTMLElement)) {
      this._analyzeSceneEditor = null;
      return;
    }

    if (!this._analyzeSceneDebugEnabled) {
      editorHost.replaceChildren();
      this._analyzeSceneEditor = null;
      return;
    }

    const assetBindings = createSceneLayoutEditorAssetBindings({
      roomId: "analyze",
      getSceneLayout: (): SceneLayoutConfig => this._analyzeSceneLayout,
      getSelection: (): SceneLayoutEditorSelection => this._analyzeSceneSelection,
      onAfterChange: (): void => {
        this._syncAnalyzeSceneAssets();
        this._syncAnalyzeSceneVisibility();
      },
    });

    this._analyzeSceneEditor = new SceneLayoutEditor(editorHost, {
      isActive: (): boolean => this._isAnalyzeSceneDebugActive(),
      getSceneLayout: (): SceneLayoutConfig => this._analyzeSceneLayout,
      getSceneClickableTheme: (): SceneClickableThemeDefinition => this._analyzeSceneClickableTheme,
      getSelection: (): SceneLayoutEditorSelection => this._analyzeSceneSelection,
      getRoomOptions: (): Array<{ id: string; label: string }> => getSceneDebugRoomOptions(shellT),
      getActiveRoomId: (): string => "analyze",
      setSelection: (selection): void => {
        this._analyzeSceneSelection = selection;
        this._analyzeSceneEditor?.refresh();
        this._renderAnalyzeScene();
      },
      navigateToRoom: (roomId: string): void => {
        this._navigateToAnalyzeSceneDebugRoom(roomId);
      },
      updateObject: (id, updater): void => {
        this._analyzeSceneSession.updateObject(id, updater);
        this._syncAnalyzeSceneVisibility();
        this._renderAnalyzeScene();
        this._analyzeSceneEditor?.refresh();
      },
      updateBack: (id, updater): void => {
        this._analyzeSceneSession.updateBack(id, updater);
        this._syncAnalyzeSceneVisibility();
        this._analyzeSceneEditor?.refresh();
      },
      updateCharacter: (id, updater): void => {
        this._analyzeSceneSession.updateCharacter(id, updater);
        this._renderAnalyzeScene();
        this._analyzeSceneEditor?.refresh();
      },
      resetDraft: (): void => {
        this._analyzeSceneLayout = this._analyzeSceneSession.resetSceneLayoutDraft();
        this._analyzeSceneSelection = null;
        this._renderAnalyzeScene();
        this._analyzeSceneEditor?.refresh();
      },
      copySceneLayout: async (): Promise<void> => {
        try {
          await this._analyzeSceneSession.copySceneLayout();
        } catch {
          console.info("Analyze scene layout copy failed.");
        }
      },
      saveSceneLayoutToSource: async (): Promise<void> => {
        await this._analyzeSceneSession.saveSceneLayoutToSource();
      },
      updateSceneClickableTheme: (updater): void => {
        this._analyzeSceneClickableTheme =
          this._analyzeSceneSession.updateSceneClickableTheme(updater);
        this._syncAnalyzeSceneVisibility();
        this._renderAnalyzeScene();
        this._analyzeSceneEditor?.refresh();
      },
      resetSceneClickableThemeDraft: (): void => {
        this._analyzeSceneClickableTheme =
          this._analyzeSceneSession.resetSceneClickableThemeDraft();
        this._syncAnalyzeSceneVisibility();
        this._renderAnalyzeScene();
        this._analyzeSceneEditor?.refresh();
      },
      copySceneClickableTheme: async (): Promise<void> => {
        try {
          await this._analyzeSceneSession.copySceneClickableTheme();
        } catch {
          console.info("Analyze scene clickable theme copy failed.");
        }
      },
      saveSceneClickableThemeToSource: async (): Promise<void> => {
        await this._analyzeSceneSession.saveSceneClickableThemeToSource();
      },
      ...assetBindings,
    });
    this._analyzeSceneEditor.refresh();
  }

  _observeAnalyzeSceneLayout(): void {
    const sceneRoot = document.getElementById("analyze-scene-root");
    if (!(sceneRoot instanceof HTMLElement) || typeof ResizeObserver === "undefined") {
      return;
    }

    this._analyzeSceneResizeObserver?.disconnect();
    this._analyzeSceneResizeObserver = new ResizeObserver(() => {
      if (!isSceneUiMode()) {
        return;
      }
      this._syncAnalyzeSceneVisibility();
    });
    this._analyzeSceneResizeObserver.observe(sceneRoot);
  }

  _renderAnalyzeScene(): void {
    this._renderAnalyzeSceneHotspots();
    void this._renderAnalyzeSceneCharacters();
  }

  _renderAnalyzeSceneHotspots(): void {
    const hotspotLayer = document.getElementById("analyze-scene-hotspots");
    if (!(hotspotLayer instanceof HTMLElement)) {
      return;
    }

    renderSceneObjectLayer({
      layer: hotspotLayer,
      nodes: getSceneObjectNodesForView(this._analyzeSceneLayout),
      themeDefaults: this._analyzeSceneClickableTheme.object,
      projection: this._getAnalyzeSceneProjection(),
      cssVarPrefix: "analyze-scene-hotspot",
      classNames: {
        item: "analyze-scene__hotspot-item",
        button: "analyze-scene__hotspot",
        label: "analyze-scene__hotspot-label",
      },
      selection: this._analyzeSceneSelection,
      clickableLabels: true,
      resolveLabel: (node) => resolveSceneNodeLabelText(node, shellT),
      onActivate: (node) => {
        this._handleAnalyzeSceneObject(node.id);
      },
    });
  }

  async _renderAnalyzeSceneCharacters(): Promise<void> {
    const characterLayer = document.getElementById("analyze-scene-characters");
    if (!(characterLayer instanceof HTMLElement)) {
      return;
    }

    if (!isSceneUiMode()) {
      characterLayer.replaceChildren();
      return;
    }

    const characters = buildSceneCharacterRoster(
      this._analyzeSceneLayout.characters,
      this._analyzeSceneLayout.characterRosterPreset
    );
    const renderToken = ++this._analyzeSceneCharacterRenderToken;
    await renderSceneCharacterLayer({
      layer: characterLayer,
      characters,
      projection: this._getAnalyzeSceneProjection(),
      sceneDebugEnabled: this._analyzeSceneDebugEnabled,
      interactive: this._analyzeSceneEditor !== null,
      selectedCharacterId:
        this._analyzeSceneSelection?.kind === "character" ? this._analyzeSceneSelection.id : null,
      isStale: () => renderToken !== this._analyzeSceneCharacterRenderToken,
      getDepthScale: (depth) => this._getAnalyzeSceneDepthScale(depth),
      resolveAvatarSource: async (character) => {
        return await resolveSceneAvatarSource(character.avatarSource);
      },
      getNodeClassName: (character) =>
        `entrance-scene__character analyze-scene__character is-${character.state}`,
      getFallbackHeadLabel: (character) => character.headLabel ?? "?",
      onActivate: (character) => {
        if (this._analyzeSceneEditor === null) {
          return;
        }
        this._analyzeSceneSelection = { kind: "character", id: character.anchorId };
        this._analyzeSceneEditor.refresh();
        this._renderAnalyzeScene();
      },
    });
  }

  _getAnalyzeSceneProjection(): { offsetX: number; offsetY: number; scale: number } {
    const sceneRoot = document.getElementById("analyze-scene-root");
    return getCoverSceneProjectionFromElement(
      sceneRoot instanceof HTMLElement ? sceneRoot : null,
      this._analyzeSceneLayout.referenceSize
    );
  }

  _getAnalyzeSceneDepthScale(depth: number): number {
    const normalizedDepth = Math.max(1, Number.isFinite(depth) ? depth : 1);
    const scaled = 1 - (normalizedDepth - 1) * 0.02;
    return Number(Math.max(0.75, scaled).toFixed(3));
  }

  _persistAnalyzeSceneLayoutDraft(): void {
    this._analyzeSceneSession.saveSceneLayoutDraft();
  }

  _isAnalyzeSceneDebugActive(): boolean {
    return isSceneDebugRoomActive("analyze");
  }

  _handleAnalyzeSceneObject(id: string): void {
    const sceneObject = this._analyzeSceneLayout.objects.find((node) => node.id === id) ?? null;
    if (sceneObject === null) {
      return;
    }

    if (this._analyzeSceneEditor !== null) {
      this._analyzeSceneSelection = { kind: "object", id: sceneObject.id };
      this._analyzeSceneEditor.refresh();
      this._renderAnalyzeScene();
      return;
    }

    dispatchSceneAction(sceneObject.action, {
      onNavigate: (page) => {
        this._setAnalyzeSceneActiveView(null);
        this._navigateToPage(page);
      },
      onSettings: (action) => {
        this._setAnalyzeSceneActiveView(null);
        openSceneSettingsPanel(action.panel);
      },
      onSettingsSceneClose: () => {
        this._setAnalyzeSceneActiveView(null);
      },
      onScreen: (action) => {
        if (action.screen === "archive") {
          this._setAnalyzeSceneActiveView(null);
          openSceneWorkspaceTool("archives");
          return;
        }

        this._setAnalyzeSceneActiveView("table");
      },
      onWhisper: () => {},
      onBack: () => {
        this._setAnalyzeSceneActiveView(null);
      },
    });
  }

  _setAnalyzeSceneActiveView(viewId: AnalyzeSceneViewId | null): void {
    this._analyzeSceneActiveView = viewId;
    this._syncAnalyzeSceneVisibility();
  }

  _syncAnalyzeSceneVisibility(): void {
    const sceneRoot = document.getElementById("analyze-scene-root");
    const tableView = document.getElementById("analyze-scene-table-view");
    const panelSlot = document.getElementById("analyze-scene-panel-slot");
    const room = document.querySelector(".analyze-room");
    const sceneActive = isSceneUiMode();
    const viewOpen = this._analyzeSceneActiveView !== null;

    syncSceneViewRuntime({
      elements: {
        root: sceneRoot instanceof HTMLElement ? sceneRoot : null,
        view: tableView instanceof HTMLElement ? tableView : null,
        room: room instanceof HTMLElement ? room : null,
        viewSlot: panelSlot instanceof HTMLElement ? panelSlot : null,
      },
      state: {
        sceneActive,
        viewOpen,
        roomOpenClass: "is-scene-table-open",
      },
    });

    if (tableView instanceof HTMLElement) {
      renderSceneBackLayer({
        host: tableView,
        node:
          sceneActive && this._analyzeSceneActiveView !== null
            ? getSceneBackNodeForView(this._analyzeSceneLayout, this._analyzeSceneActiveView)
            : null,
        themeDefaults: this._analyzeSceneClickableTheme.back,
        projection: this._getAnalyzeSceneProjection(),
        resolveLabel: (node) => resolveSceneNodeLabelText(node, shellT),
        onActivate: (node) => {
          if (this._analyzeSceneEditor !== null) {
            this._analyzeSceneSelection = { kind: "back", id: node.id };
            this._analyzeSceneEditor.refresh();
            return;
          }

          dispatchSceneAction(node.action, {
            onNavigate: () => {},
            onSettings: () => {},
            onSettingsSceneClose: () => {},
            onScreen: () => {},
            onWhisper: () => {},
            onBack: () => {
              this._setAnalyzeSceneActiveView(null);
            },
          });
        },
      });
    }

    if (!sceneActive) {
      if (room instanceof HTMLElement) {
        clearSceneAlphaWindowFrameVariables(room, "analyze-scene");
      }
      return;
    }

    this._syncAnalyzeSceneAssets();
    this._syncAnalyzeSceneTransparentWindow();
    this._renderAnalyzeScene();
    this._analyzeSceneEditor?.refresh();
  }

  _navigateToPage(page: string): void {
    navigateToScenePage(page);
  }

  _navigateToAnalyzeSceneDebugRoom(roomId: string): void {
    this._setAnalyzeSceneActiveView(null);
    openSceneDebugRoom(roomId);
  }

  async loadSettings(): Promise<void> {
    await SettingsManager.load();
  }

  applyAvatars(): void {
    const avatarTargets: Array<{
      provider: "user" | "ai1" | "ai2" | "us1";
      elementId: string;
      fallbackText?: string;
    }> = [
      { provider: "ai1", elementId: "avatar-ai1" },
      { provider: "ai2", elementId: "avatar-ai2" },
      { provider: "us1", elementId: "avatar-us1", fallbackText: "US" },
      { provider: "user", elementId: "avatar-user-compose", fallbackText: "U" },
    ];

    avatarTargets.forEach(({ provider, elementId, fallbackText = "" }) => {
      const configuredPath = AppState.getAvatar(provider).trim();
      const isUser = provider === "user";
      const isUs1 = provider === "us1";
      const slotAssigned = isUser
        ? true
        : isUs1
          ? AppState.hasUs1Identity()
          : AppState.getAccountForSlot(provider) !== null;

      const el = document.getElementById(elementId);
      if (!el) return;

      if (!slotAssigned) {
        el.textContent = "";
        el.innerHTML = "";
        return;
      }

      const electronApi = window.electronAPI;
      if (electronApi === undefined) {
        el.textContent = fallbackText;
        return;
      }

      const fallbackCandidates: string[] = [];
      if (isUser) {
        fallbackCandidates.push("src/assets/user.png", "src/assets/default.png");
      } else {
        const providerId = isUs1 ? "" : (AppState.getProviderIdForSlot(provider) ?? "");
        if (providerId !== "") {
          fallbackCandidates.push(`src/assets/${providerId}.png`);
        }
        fallbackCandidates.push("src/assets/default.png");
      }

      const candidates = [configuredPath, ...fallbackCandidates];
      const filteredCandidates = candidates.filter(
        (candidate, index, arr) => candidate !== "" && arr.indexOf(candidate) === index
      );

      const tryLoad = (index: number): void => {
        const candidate = filteredCandidates[index];
        if (candidate === undefined) {
          el.textContent = fallbackText;
          return;
        }

        electronApi
          .readFile(candidate)
          .then((data) => {
            const base64 = String(data ?? "");
            if (base64 === "") {
              tryLoad(index + 1);
              return;
            }

            const mime = getMimeTypeFromPath(candidate);
            el.innerHTML = `<img src="data:${mime};base64,${base64}" alt="${provider} avatar" class="img-cover" />`;
          })
          .catch(() => {
            tryLoad(index + 1);
          });
      };

      tryLoad(0);
    });
  }

  applyNames(): void {
    const nickUser = AppState.getNickname("user");
    const nickAi1 = AppState.getNickname("ai1");
    const nickAi2 = AppState.getNickname("ai2");
    const nickUs1 = AppState.getNickname("us1");

    const nameAi1 = document.getElementById("name-ai1");
    const nameAi2 = document.getElementById("name-ai2");
    const nameUs1 = document.getElementById("name-us1");
    if (nameAi1) nameAi1.textContent = nickAi1;
    if (nameAi2) nameAi2.textContent = nickAi2;
    if (nameUs1) nameUs1.textContent = nickUs1;

    const sendLabelAi1 = document.getElementById("send-ai1-label");
    const sendLabelAi2 = document.getElementById("send-ai2-label");
    const sendLabelUs1 = document.getElementById("send-us1-label");
    const nameUserCompose = document.getElementById("name-user-compose");
    if (sendLabelAi1) sendLabelAi1.textContent = nickAi1;
    if (sendLabelAi2) sendLabelAi2.textContent = nickAi2;
    if (sendLabelUs1) sendLabelUs1.textContent = nickUs1;
    if (nameUserCompose) nameUserCompose.textContent = nickUser;
  }

  _syncUs1IdentityContext(): void {
    const identityId = AppState.getUs1ArchiveAccountId();
    if (identityId === this.us1SessionIdentityId) {
      return;
    }

    this.us1SessionIdentityId = identityId;
    this.us1SessionId = null;
    this.lastMessages.us1 = "";
    AppState.setActiveConversation("us1", null);
  }

  _createUs1LocalSessionId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  _ensureUs1LocalSessionId(): string | null {
    this._syncUs1IdentityContext();
    if (this.us1SessionIdentityId === null) {
      return null;
    }

    if (this.us1SessionId === null || this.us1SessionId === "") {
      this.us1SessionId = this._createUs1LocalSessionId();
    }

    return this.us1SessionId;
  }

  _chooseUs1AutoOpenSession(
    sessionEvents: Us1SessionEvent[],
    options: {
      currentSessionId: string | null;
      currentConversationId: string | null;
      isNewSelected: boolean;
      composeHasDraft: boolean;
    }
  ): Us1SessionEvent | null {
    const eligibleEvents = sessionEvents.filter(
      (sessionEvent) =>
        sessionEvent.localSessionId.trim() !== "" && sessionEvent.conversationId.trim() !== ""
    );
    if (eligibleEvents.length === 0) {
      return null;
    }

    const currentMatch =
      [...eligibleEvents]
        .reverse()
        .find(
          (sessionEvent) =>
            (options.currentSessionId !== null &&
              sessionEvent.localSessionId === options.currentSessionId) ||
            (options.currentConversationId !== null &&
              sessionEvent.conversationId === options.currentConversationId)
        ) ?? null;
    if (currentMatch !== null) {
      return currentMatch;
    }

    if (options.isNewSelected === true) {
      return null;
    }

    if (options.currentConversationId === null) {
      return eligibleEvents[eligibleEvents.length - 1] ?? null;
    }

    if (options.composeHasDraft === false && options.currentSessionId === null) {
      return eligibleEvents[eligibleEvents.length - 1] ?? null;
    }

    return null;
  }

  _applyUs1PendingSessions(
    sessionEvents: Us1SessionEvent[],
    activeSessionId: string | null,
    activeConversationId: string | null
  ): void {
    const seenSessionIds = new Set<string>();
    for (const sessionEvent of sessionEvents) {
      const localSessionId = sessionEvent.localSessionId.trim();
      const conversationId = sessionEvent.conversationId.trim();
      if (localSessionId === "" || conversationId === "" || seenSessionIds.has(localSessionId)) {
        continue;
      }
      seenSessionIds.add(localSessionId);

      if (
        (activeSessionId !== null && localSessionId === activeSessionId) ||
        (activeConversationId !== null && conversationId === activeConversationId)
      ) {
        AppState.clearUs1PendingSession(localSessionId);
        AppState.clearUs1PendingSessionByConversation(conversationId);
        continue;
      }

      const updatedAt = sessionEvent.sentAt ?? sessionEvent.createdAt;
      AppState.markUs1PendingSession(localSessionId, {
        conversationId,
        unreadDelta: 1,
        ...(updatedAt !== undefined ? { updatedAt } : {}),
      });
    }
  }

  updateConnectionStates(): void {
    this._syncUs1IdentityContext();

    const composeInput = document.getElementById("compose-input") as HTMLTextAreaElement | null;
    const uploadBtn = document.getElementById("upload-add-btn") as HTMLButtonElement | null;
    const sendBtn = document.getElementById("compose-send-btn") as HTMLButtonElement | null;
    if (composeInput) composeInput.disabled = false;
    if (uploadBtn) uploadBtn.disabled = false;
    if (sendBtn) sendBtn.disabled = false;

    const ai1Connected = AppState.isConnected("ai1");
    const ai2Connected = AppState.isConnected("ai2");
    const ai1HasAccount = !!AppState.getAccountForSlot("ai1");
    const ai2HasAccount = !!AppState.getAccountForSlot("ai2");
    const us1Connected = AppState.isUs1Connected();
    const us1HasIdentity = AppState.hasUs1Identity();
    if (us1Connected === false) {
      this._us1AwaitingReply = false;
    }

    (["ai1", "ai2", "us1"] as const).forEach((slot) => {
      const hasAccount =
        slot === "ai1" ? ai1HasAccount : slot === "ai2" ? ai2HasAccount : us1HasIdentity;
      const connected =
        slot === "ai1" ? ai1Connected : slot === "ai2" ? ai2Connected : us1Connected;
      const isActive = hasAccount;
      const wasActive = this._slotActiveStates[slot];

      this._updateSlotUI(slot, hasAccount, connected);

      if (wasActive && !isActive) {
        this._clearSlotMessages(slot);
      }

      this._slotActiveStates[slot] = isActive;
    });

    this._applyUs1Indicators(us1Connected);

    this._updateGridLayout({
      ai1: ai1HasAccount,
      ai2: ai2HasAccount,
      us1: us1HasIdentity,
    });
    void this._renderUs1Messages();

    this._updateAIAIControls();
  }

  _updateSlotUI(slot: string, hasAccount: boolean, connected: boolean): void {
    const card = document.getElementById(`card-${slot}`);
    const status = document.getElementById(`status-${slot}`);
    const sendToggle = document.getElementById(`send-${slot}`);

    if (status) {
      if (!hasAccount) status.textContent = analyzeT("page.slotEmptyStatus");
      else if (connected) status.textContent = analyzeT("page.connectedStatus");
      else status.textContent = analyzeT("page.disconnectedStatus");
    }

    if (card) {
      card.classList.toggle("slot-empty", !hasAccount);
      card.classList.toggle("slot-disconnected", hasAccount && !connected);
      card.classList.toggle("slot-connected", hasAccount && connected);
    }

    if (sendToggle) {
      (sendToggle as HTMLInputElement).disabled = !hasAccount;
      if (!hasAccount) (sendToggle as HTMLInputElement).checked = false;
    }
  }

  _updateGridLayout(participants: Record<AnalyzeParticipant, boolean>): void {
    const grid = document.querySelector(".conversation-grid");
    const cardAi1 = document.getElementById("card-ai1");
    const cardAi2 = document.getElementById("card-ai2");
    const cardUs1 = document.getElementById("card-us1");

    if (!grid) return;

    const configuredParticipants = (
      Object.entries(participants) as Array<[AnalyzeParticipant, boolean]>
    )
      .filter(([, visible]) => visible)
      .map(([slot]) => slot);
    const fallbackParticipants: AnalyzeParticipant[] = ["ai1", "ai2"];
    const visibleParticipants =
      configuredParticipants.length > 0 ? configuredParticipants : fallbackParticipants;
    const participantCount = Math.min(3, Math.max(1, visibleParticipants.length));

    grid.classList.remove("participant-count-1", "participant-count-2", "participant-count-3");
    grid.classList.add(`participant-count-${participantCount}`);

    if (cardAi1) cardAi1.classList.toggle("is-hidden", !visibleParticipants.includes("ai1"));
    if (cardAi2) cardAi2.classList.toggle("is-hidden", !visibleParticipants.includes("ai2"));
    if (cardUs1) cardUs1.classList.toggle("is-hidden", !visibleParticipants.includes("us1"));
  }

  _updateAIAIControls(): void {
    const ai1Assigned = !!AppState.getAccountForSlot("ai1");
    const ai2Assigned = !!AppState.getAccountForSlot("ai2");
    const aiChatEnabled = ai1Assigned && ai2Assigned;

    const analyzeBtn = document.getElementById("compose-start-btn") as HTMLButtonElement | null;
    if (analyzeBtn) analyzeBtn.disabled = !aiChatEnabled;

    const analyzeStopBtn = document.getElementById("compose-stop-btn") as HTMLButtonElement | null;
    if (analyzeStopBtn) analyzeStopBtn.disabled = !aiChatEnabled;

    this._updateCrossCheckboxState();
  }

  bindActions(): void {
    if (this._boundActions) return;
    this._boundActions = true;

    document.getElementById("compose-start-btn")?.addEventListener("click", () => {
      void this.handleAnalyzeStart();
    });

    document.getElementById("compose-stop-btn")?.addEventListener("click", () => {
      void this.handleAnalyzeStop();
    });

    // NOTE: Prevent duplicate sends while the button is already loading.
    const sendBtn = document.getElementById("compose-send-btn") as HTMLButtonElement | null;
    if (sendBtn) {
      sendBtn.addEventListener("click", () => {
        if (ButtonStates.isLoading(sendBtn)) {
          Logger.debug(LogCategory.ANALYZE, analyzeT("logs.sendIgnoredWhileLoading"));
          return;
        }
        this.handleSend();
      });
    }

    document.getElementById("upload-add-btn")?.addEventListener("click", () => {
      void this.handleUploadClick();
    });
    document.getElementById("capture-import-btn")?.addEventListener("click", () => {
      void this.toggleAndroidCameraPanel();
    });
    document.getElementById("compose-input")?.addEventListener("input", () => {
      this.updateSendButtonState();
    });
    document.getElementById("compose-ambient-btn")?.addEventListener("click", () => {
      void this._toggleAmbientListener();
    });

    // NOTE: Allow Ctrl+Enter sends while still preventing duplicate dispatches.
    document.getElementById("compose-input")?.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        const sendBtn = document.getElementById("compose-send-btn") as HTMLButtonElement | null;
        if (sendBtn && ButtonStates.isLoading(sendBtn)) {
          Logger.debug(LogCategory.ANALYZE, analyzeT("logs.sendShortcutIgnoredWhileLoading"));
          return;
        }
        this.handleSend();
      }
    });

    ["send-ai1", "send-ai2", "send-us1", "send-cross"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => {
        this.updateSendButtonState();
      });
    });
  }

  _bindDictationUi(): void {
    this._dictationBinding?.dispose();

    this._dictationBinding = bindDictationTrigger({
      button: document.getElementById("compose-dictation-btn") as HTMLButtonElement | null,
      textarea: document.getElementById("compose-input") as HTMLTextAreaElement | null,
      targetId: "analyze-compose",
      getLabels: () => ({
        idleTitle: analyzeT("page.dictation.idleTitle"),
        listeningTitle: analyzeT("page.dictation.listeningTitle"),
        transcribingTitle: analyzeT("page.dictation.transcribingTitle"),
        listeningMessage: analyzeT("page.dictation.listeningMessage"),
        preparingMessage: analyzeT("page.dictation.preparingMessage"),
        emptyResultMessage: analyzeT("page.dictation.emptyResultMessage"),
        insertedMessage: analyzeT("page.dictation.insertedMessage"),
        transcribedMessage: (backend: string, durationMs: number): string =>
          analyzeT("page.dictation.transcribedMessage", { backend, durationMs }),
        captureError: (message: string): string =>
          analyzeT("page.dictation.captureError", { message }),
        transcriptionError: (message: string): string =>
          analyzeT("page.dictation.transcriptionError", { message }),
        androidIdleTitle: analyzeT("page.dictation.androidIdleTitle"),
        androidPreparingMessage: analyzeT("page.dictation.androidPreparingMessage"),
        androidListeningMessage: analyzeT("page.dictation.androidListeningMessage"),
        androidTimeoutMessage: analyzeT("page.dictation.androidTimeoutMessage"),
        androidError: (message: string): string =>
          analyzeT("page.dictation.androidError", { message }),
      }),
      showNotice: (message, kind = "info") => {
        notifyUser({
          kind,
          title: message,
          dedupeKey: "analyze-dictation",
        });
      },
      getMode: (): DictationMode => this._dictationMode,
      getLanguage: (): TranscriptSupportedLanguage => dictationLanguage(),
      requestAndroidDictation: async (request) => {
        return await this._requestAndroidDictation(request);
      },
      cancelAndroidDictation: async (request) => {
        await this._cancelAndroidDictation(request);
      },
      onFinalTranscript: async (payload) => {
        return await this._handleAnalyzeVoiceCommand(payload);
      },
      isTargetActive: () => document.documentElement.getAttribute("data-active-page") === "analyze",
      subscribeIngress: onTranscriptIngress,
      subscribeAndroidDictationStatus: onCaptureDictationStatus,
    });
    this._syncDictationAvailability();
  }

  _captureDefaults(): NonNullable<
    ReturnType<typeof SettingsManager.getSnapshot>["capture"]
  >["defaults"] {
    return SettingsManager.getSnapshot().capture?.defaults ?? {};
  }

  _captureProviders(): NonNullable<
    ReturnType<typeof SettingsManager.getSnapshot>["capture"]
  >["providers"] {
    return SettingsManager.getSnapshot().capture?.providers ?? {};
  }

  _isTtsStatusActive(status: TtsStatus | null | undefined): boolean {
    return (
      status?.status === "queued" || status?.status === "preparing" || status?.status === "playing"
    );
  }

  async _refreshTtsRuntimeStatus(): Promise<void> {
    this._ttsRuntimeStatus = await getTtsStatus().catch(() => null);
    const active = this._ttsRuntimeStatus?.active ?? null;
    if (this._isTtsStatusActive(active) === true && active?.target === "analyze-compose") {
      this._ttsActiveRequestId = active.requestId;
    }
    this._syncTtsBubbleStates();
  }

  _primaryAmbientWakePhrase(): string {
    return ambientWakePhrases()[0] ?? "Hey Jarvis";
  }

  _buildAnalyzeVoiceCommandSpecs(): VoiceCommandSpec[] {
    const phrases = voiceCommandPhrases();
    return [
      { id: "openCamera", phrases: phrases.openCamera },
      { id: "capture", phrases: phrases.capture },
      { id: "stop", phrases: phrases.stop },
    ];
  }

  _syncVoiceCommandSettings(): void {
    this._voiceCommandsEnabled =
      SettingsManager.getSnapshot().voiceCommands?.analyzeEnabled === true;
  }

  _renderAmbientToggle(): void {
    const button = document.getElementById("compose-ambient-btn") as HTMLButtonElement | null;
    if (button === null) {
      return;
    }

    const androidAvailable = this._isAndroidDictationAvailable();
    button.disabled = androidAvailable !== true && this._ambientEnabled !== true;
    button.classList.toggle("is-active", this._ambientEnabled);
    button.setAttribute("aria-pressed", this._ambientEnabled ? "true" : "false");
    button.textContent = this._ambientEnabled
      ? analyzeT("page.dictation.ambientActive")
      : analyzeT("page.dictation.ambientInactive");
    button.title =
      androidAvailable === true
        ? this._ambientEnabled
          ? analyzeT("page.dictation.ambientStopTitle")
          : analyzeT("page.dictation.ambientStartTitle")
        : analyzeT("page.dictation.androidUnavailableTitle");
  }

  _ambientStatusKind(status: AnalyzeAmbientStatus): AnalyzeAmbientFeedbackKind {
    switch (status) {
      case "failed":
        return "error";
      case "done":
        return "success";
      case "stopped":
      case "idle":
        return "warning";
      case "started":
      case "wake-detected":
      case "capturing":
      case "transcribing":
        return "info";
      default:
        return assertNeverAnalyzeValue(status);
    }
  }

  _defaultAmbientStatusMessage(status: AnalyzeAmbientStatus, detail?: string): string {
    switch (status) {
      case "idle":
        return analyzeT("page.dictation.ambientIdleMessage");
      case "started":
        return analyzeT("page.dictation.ambientWaitingMessage", {
          wakePhrase: this._primaryAmbientWakePhrase(),
        });
      case "wake-detected":
        return analyzeT("page.dictation.ambientWakeDetectedMessage");
      case "capturing":
        return analyzeT("page.dictation.ambientCapturingMessage");
      case "transcribing":
        return analyzeT("page.dictation.ambientTranscribingMessage");
      case "done":
        return analyzeT("page.dictation.ambientDoneMessage", {
          wakePhrase: this._primaryAmbientWakePhrase(),
        });
      case "stopped":
        return analyzeT("page.dictation.ambientStoppedMessage");
      case "failed":
        return analyzeT("page.dictation.ambientFailedMessage", {
          message: detail ?? analyzeT("page.dictation.ambientUnknownError"),
        });
      default:
        return assertNeverAnalyzeValue(status);
    }
  }

  _ambientToneForStatus(status: AnalyzeAmbientStatus): AnalyzeAmbientFeedbackTone | null {
    switch (status) {
      case "started":
        return "started";
      case "wake-detected":
        return "wake";
      case "capturing":
        return "capturing";
      case "transcribing":
        return "transcribing";
      case "done":
        return "success";
      case "stopped":
      case "idle":
        return "stopped";
      case "failed":
        return "failed";
      default:
        return assertNeverAnalyzeValue(status);
    }
  }

  _announceAmbientFeedback(
    status: AnalyzeAmbientStatus,
    options: {
      dedupeKey?: string;
      detail?: string;
      kind?: AnalyzeAmbientFeedbackKind;
      message?: string;
      showToast?: boolean;
      tone?: AnalyzeAmbientFeedbackTone | null;
    } = {}
  ): void {
    const message = options.message ?? this._defaultAmbientStatusMessage(status, options.detail);
    const kind = options.kind ?? this._ambientStatusKind(status);
    this._ambientStatus = status;
    this._ambientStatusMessage = message;
    this._ambientStatusMessageKind = kind;
    this._renderAmbientToggle();

    const tone = options.tone === undefined ? this._ambientToneForStatus(status) : options.tone;
    if (tone !== null) {
      this._playAmbientFeedbackTone(tone);
    }

    if (options.showToast !== false) {
      notifyUser({
        kind,
        title: message,
        dedupeKey: options.dedupeKey ?? "analyze-ambient-feedback",
      });
    }
  }

  _playAmbientFeedbackTone(tone: AnalyzeAmbientFeedbackTone): void {
    const now = Date.now();
    const lastPlayedAt = this._ambientToneLastPlayedAt[tone] ?? 0;
    if (now - lastPlayedAt < 800) {
      return;
    }
    this._ambientToneLastPlayedAt[tone] = now;

    try {
      const audioContextConstructor = window.AudioContext;
      if (typeof audioContextConstructor !== "function") {
        return;
      }
      const context = new audioContextConstructor();
      const sequences: Record<AnalyzeAmbientFeedbackTone, Array<[number, number, number]>> = {
        started: [
          [520, 80, 0],
          [680, 90, 95],
        ],
        wake: [[880, 110, 0]],
        capturing: [[640, 70, 0]],
        transcribing: [[740, 70, 0]],
        success: [
          [660, 70, 0],
          [880, 90, 90],
        ],
        stopped: [
          [520, 70, 0],
          [390, 90, 85],
        ],
        failed: [
          [220, 110, 0],
          [180, 120, 140],
        ],
      };
      let totalMs = 0;
      const startAt = context.currentTime + 0.01;
      for (const [frequency, durationMs, delayMs] of sequences[tone]) {
        totalMs = Math.max(totalMs, delayMs + durationMs);
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const beginsAt = startAt + delayMs / 1_000;
        const endsAt = beginsAt + durationMs / 1_000;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, beginsAt);
        gain.gain.setValueAtTime(0.0001, beginsAt);
        gain.gain.exponentialRampToValueAtTime(0.055, beginsAt + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(beginsAt);
        oscillator.stop(endsAt + 0.02);
      }
      window.setTimeout(() => {
        void context.close().catch(() => {});
      }, totalMs + 120);
    } catch {
      // Audio feedback is best-effort and must never block capture control.
    }
  }

  async _toggleAmbientListener(): Promise<void> {
    if (this._ambientEnabled) {
      await this._stopAmbientListener();
      return;
    }

    await this._startAmbientListener();
  }

  async _startAmbientListener(): Promise<void> {
    const requestId = crypto.randomUUID();
    this._ambientRequestId = requestId;
    this._ambientEnabled = true;
    this._ambientStatus = "started";
    this._ambientStatusMessage = null;
    this._ambientStatusMessageKind = null;
    this._renderAmbientToggle();

    const outcome = await runCaptureAction("start-ambient-listener", {
      target: "analyze-compose",
      requestId,
      wakePhrases: ambientWakePhrases(),
      activeWindowMs: ambientActiveWindowMs(),
      silenceTimeoutMs: ambientSilenceTimeoutMs(),
    }).catch((error) => {
      const message = getErrorMessage(error);
      return {
        action: "start-ambient-listener" as const,
        ok: false,
        message,
        status: this._captureStatus ?? ({} as CaptureServiceStatus),
      };
    });
    this._captureStatus = outcome.status;
    this.renderCaptureSessionState();
    if (outcome.ok !== true) {
      this._ambientEnabled = false;
      this._ambientRequestId = null;
      this._announceAmbientFeedback("failed", {
        detail: outcome.message,
        dedupeKey: "analyze-ambient-start-error",
        kind: "error",
      });
      return;
    }
    this._announceAmbientFeedback("started", {
      dedupeKey: "analyze-ambient-listening",
      kind: "info",
      message: analyzeT("page.dictation.ambientListeningMessage", {
        wakePhrase: this._primaryAmbientWakePhrase(),
      }),
    });
  }

  async _stopAmbientListener(): Promise<void> {
    const requestId = this._ambientRequestId;
    this._ambientEnabled = false;
    this._ambientStatus = "stopped";
    this._ambientStatusMessage = null;
    this._ambientStatusMessageKind = null;
    this._renderAmbientToggle();
    if (requestId === null) {
      this._announceAmbientFeedback("stopped", {
        dedupeKey: "analyze-ambient-stopped",
        kind: "info",
      });
      return;
    }

    const outcome = await runCaptureAction("stop-ambient-listener", {
      target: "analyze-compose",
      requestId,
    }).catch((error) => {
      const message = getErrorMessage(error);
      return {
        action: "stop-ambient-listener" as const,
        ok: false,
        message,
        status: this._captureStatus ?? ({} as CaptureServiceStatus),
      };
    });
    this._captureStatus = outcome.status;
    this._ambientRequestId = null;
    this.renderCaptureSessionState();
    if (outcome.ok !== true) {
      this._announceAmbientFeedback("failed", {
        detail: outcome.message,
        dedupeKey: "analyze-ambient-stop-error",
        kind: "error",
      });
      return;
    }
    this._announceAmbientFeedback("stopped", {
      dedupeKey: "analyze-ambient-stopped",
      kind: "info",
    });
  }

  _handleAmbientStatus(payload: CaptureAmbientStatusPayload): void {
    if (payload.target !== "analyze-compose" || payload.requestId !== this._ambientRequestId) {
      return;
    }

    if (payload.status === "failed" || payload.status === "stopped") {
      this._ambientEnabled = false;
      this._ambientRequestId = null;
    }
    this._announceAmbientFeedback(payload.status, {
      dedupeKey: `analyze-ambient-${payload.status}`,
      detail: payload.message,
      kind: payload.status === "failed" ? "error" : this._ambientStatusKind(payload.status),
    });
  }

  async _handleAmbientTranscriptIngress(payload: TranscriptIngressPayload): Promise<void> {
    if (
      this._ambientRequestId === null ||
      this._ambientEnabled !== true ||
      payload.source !== "android-bridge" ||
      payload.target !== "analyze-compose" ||
      payload.requestId !== this._ambientRequestId ||
      payload.isFinal !== true
    ) {
      return;
    }

    const text = this._stripAmbientWakePhrase(payload.text);
    if (text === "") {
      this._announceAmbientFeedback("done", {
        dedupeKey: "analyze-ambient-empty",
        kind: "warning",
        message: analyzeT("page.dictation.ambientEmptyCommandMessage"),
        tone: "failed",
      });
      return;
    }

    if (this._isAmbientCancelIntent(text)) {
      this._announceAmbientFeedback("done", {
        dedupeKey: "analyze-ambient-cancel",
        kind: "info",
        message: analyzeT("page.dictation.ambientCancelMessage", {
          wakePhrase: this._primaryAmbientWakePhrase(),
        }),
        tone: "stopped",
      });
      return;
    }

    const dictationIntent = this._parseAmbientDictationIntent(text);
    if (dictationIntent.explicit) {
      this._insertAmbientDictationText(dictationIntent.text);
      return;
    }

    const consumed = await this._handleAnalyzeVoiceCommand(
      {
        ...payload,
        text,
      },
      { ambientFeedback: true, requireEnabled: false }
    );
    if (consumed === true) {
      return;
    }

    this._insertAmbientDictationText(dictationIntent.text);
  }

  _insertAmbientDictationText(text: string): void {
    if (text.trim() === "") {
      this._announceAmbientFeedback("done", {
        dedupeKey: "analyze-ambient-empty",
        kind: "warning",
        message: analyzeT("page.dictation.ambientEmptyCommandMessage"),
        tone: "failed",
      });
      return;
    }

    const textarea = document.getElementById("compose-input") as HTMLTextAreaElement | null;
    if (textarea === null) {
      return;
    }
    insertTranscriptIntoTextarea(textarea, text.trim());
    this.updateSendButtonState();
    this._announceAmbientFeedback("done", {
      dedupeKey: "analyze-ambient-inserted",
      kind: "success",
      message: analyzeT("page.dictation.ambientDictationInsertedMessage"),
      tone: "success",
    });
  }

  _stripAmbientWakePhrase(text: string): string {
    const directText = text.trim();
    for (const phrase of ambientWakePhrases()) {
      const directPattern = new RegExp(`^\\s*${escapeRegExp(phrase)}[\\s,.:;!?-]*`, "i");
      const stripped = directText.replace(directPattern, "").trim();
      if (stripped !== directText) {
        return stripped;
      }
    }

    const normalizedText = normalizeVoiceCommandText(directText);
    for (const phrase of ambientWakePhrases()) {
      const normalizedPhrase = normalizeVoiceCommandText(phrase);
      if (
        normalizedPhrase !== "" &&
        (normalizedText === normalizedPhrase || normalizedText.startsWith(`${normalizedPhrase} `))
      ) {
        return directText.split(/\s+/).slice(normalizedPhrase.split(/\s+/).length).join(" ").trim();
      }
    }

    return directText;
  }

  _parseAmbientDictationIntent(text: string): AnalyzeAmbientDictationIntent {
    const directText = text.trim();
    for (const prefix of ANALYZE_AMBIENT_DICTATION_PREFIXES) {
      const directPattern = new RegExp(`^\\s*${escapeRegExp(prefix)}[\\s,.:;!?-]*`, "i");
      const stripped = directText.replace(directPattern, "").trim();
      if (stripped !== directText) {
        return { explicit: true, text: stripped };
      }
    }

    const normalizedText = normalizeVoiceCommandText(directText);
    for (const prefix of ANALYZE_AMBIENT_DICTATION_PREFIXES) {
      const normalizedPrefix = normalizeVoiceCommandText(prefix);
      if (
        normalizedPrefix !== "" &&
        (normalizedText === normalizedPrefix || normalizedText.startsWith(`${normalizedPrefix} `))
      ) {
        return {
          explicit: true,
          text: directText
            .split(/\s+/)
            .slice(normalizedPrefix.split(/\s+/).length)
            .join(" ")
            .replace(/^[\s,.:;!?-]+/, "")
            .trim(),
        };
      }
    }

    return { explicit: false, text: directText };
  }

  _isAmbientCancelIntent(text: string): boolean {
    const normalizedText = normalizeVoiceCommandText(text);
    return ANALYZE_AMBIENT_CANCEL_PHRASES.some(
      (phrase) => normalizedText === normalizeVoiceCommandText(phrase)
    );
  }

  _ambientVoiceCommandLabel(commandId: string): string {
    switch (commandId) {
      case "openCamera":
        return analyzeT("page.dictation.ambientCommandOpenCamera");
      case "capture":
        return analyzeT("page.dictation.ambientCommandCapture");
      case "stop":
        return analyzeT("page.dictation.ambientCommandStop");
      default:
        return commandId;
    }
  }

  async _handleAnalyzeVoiceCommand(
    payload: TranscriptIngressPayload,
    options: { ambientFeedback?: boolean; requireEnabled?: boolean } = {}
  ): Promise<boolean> {
    const requireEnabled = options.requireEnabled !== false;
    if ((requireEnabled && this._voiceCommandsEnabled !== true) || payload.isFinal !== true) {
      return false;
    }

    const match = matchVoiceCommand(payload.text, this._buildAnalyzeVoiceCommandSpecs());
    if (match === null) {
      return false;
    }

    const actionByCommand: Record<string, AnalyzeVoiceAction> = {
      openCamera: "start-analyze-session",
      capture: "capture-analyze-photo",
      stop: "stop-analyze-session",
    };
    const action = actionByCommand[match.id];
    if (action === undefined) {
      return false;
    }

    if (options.ambientFeedback === true) {
      this._announceAmbientFeedback("done", {
        dedupeKey: "analyze-ambient-command",
        kind: "success",
        message: analyzeT("page.dictation.ambientCommandDetectedMessage", {
          command: this._ambientVoiceCommandLabel(match.id),
        }),
        tone: "success",
      });
    }

    await this._runCaptureAction(action);
    if (action === "stop-analyze-session" && this._cameraPanelOpen === true) {
      void this._setAndroidCameraPanelOpen(false, { notify: false });
    }
    return true;
  }

  _selectedAndroidDictationDevice(
    status: CaptureServiceStatus | null = this._captureStatus
  ): CaptureAndroidDeviceStatus | null {
    const devices = status?.android.devices ?? [];
    return devices.find((device) => device.selected && device.connectionState === "device") ?? null;
  }

  _isLocalDictationAvailable(): boolean {
    return true;
  }

  _isAndroidDictationAvailable(status: CaptureServiceStatus | null = this._captureStatus): boolean {
    const providers = this._captureProviders();
    return (
      providers?.androidCompanionEnabled !== false &&
      this._selectedAndroidDictationDevice(status) !== null
    );
  }

  _normalizeDictationMode(): void {
    const localAvailable = this._isLocalDictationAvailable();
    const androidAvailable = this._isAndroidDictationAvailable();

    if (this._dictationMode === "android" && androidAvailable !== true) {
      this._dictationMode = "local";
      return;
    }

    if (this._dictationMode === "local" && localAvailable !== true && androidAvailable === true) {
      this._dictationMode = "android";
    }
  }

  _syncDictationAvailability(): void {
    const dictationButton = document.getElementById(
      "compose-dictation-btn"
    ) as HTMLButtonElement | null;
    if (dictationButton === null) {
      return;
    }

    this._normalizeDictationMode();
    this._dictationBinding?.refresh();

    const localAvailable = this._isLocalDictationAvailable();
    const androidAvailable = this._isAndroidDictationAvailable();
    const currentMode = this._dictationMode;
    const modeAvailable = currentMode === "android" ? androidAvailable : localAvailable;
    if (modeAvailable) {
      dictationButton.disabled = false;
      return;
    }

    const disabledTitle =
      currentMode === "android"
        ? analyzeT("page.dictation.androidUnavailableTitle")
        : analyzeT("page.dictation.disabledTitle");
    dictationButton.disabled = true;
    dictationButton.setAttribute("aria-pressed", "false");
    dictationButton.title = disabledTitle;
    dictationButton.setAttribute("aria-label", disabledTitle);
  }

  async _requestAndroidDictation(request: {
    action: "start" | "stop";
    requestId: string;
    targetId: TranscriptTargetId;
  }): Promise<"starting" | "ready"> {
    try {
      this._captureStatus = await refreshCaptureStatus();
    } catch {
      // NOTE: Keep the last known capture snapshot so the dictate toggle can still evaluate fallback state.
    } finally {
      this.renderCaptureSessionState();
    }

    if (this._isAndroidDictationAvailable() !== true) {
      throw new Error(analyzeT("page.dictation.androidUnavailableTitle"));
    }

    if (request.action === "stop") {
      const outcome = await runCaptureAction("stop-analyze-dictation", {
        requestId: request.requestId,
        target: request.targetId,
      });
      this._captureStatus = outcome.status;
      this.renderCaptureSessionState();
      if (outcome.ok !== true) {
        throw new Error(outcome.message);
      }

      this._startCaptureStatusPolling();
      return "starting";
    }

    const captureState = this._captureStatus?.analyze.state ?? "idle";
    if (
      captureState === "ready" ||
      captureState === "result-ready" ||
      captureState === "capture-requested"
    ) {
      const outcome = await runCaptureAction("start-analyze-dictation", {
        requestId: request.requestId,
        target: request.targetId,
      });
      this._captureStatus = outcome.status;
      this.renderCaptureSessionState();
      if (outcome.ok !== true) {
        throw new Error(outcome.message);
      }
      this._startCaptureStatusPolling();
      return "ready";
    }

    const outcome = await runCaptureAction("start-analyze-dictation", {
      requestId: request.requestId,
      target: request.targetId,
    });
    this._captureStatus = outcome.status;
    this._applyAutoStagedCapture(outcome.status);
    this.renderCaptureSessionState();
    if (outcome.ok !== true) {
      throw new Error(outcome.message);
    }

    this._startCaptureStatusPolling();
    return outcome.status.analyze.state === "ready" ||
      outcome.status.analyze.state === "result-ready"
      ? "ready"
      : "starting";
  }

  async _cancelAndroidDictation(request: {
    requestId: string;
    targetId: TranscriptTargetId;
  }): Promise<void> {
    const outcome = await runCaptureAction("cancel-analyze-dictation", {
      requestId: request.requestId,
      target: request.targetId,
    });
    this._captureStatus = outcome.status;
    this.renderCaptureSessionState();
    this._startCaptureStatusPolling();
    if (outcome.ok !== true) {
      throw new Error(outcome.message);
    }
  }

  _notifyCaptureFeedback(
    kind: "success" | "info" | "error" | "warning",
    title: string,
    dedupeKey: string
  ): void {
    const confirmationMode = this._captureDefaults()?.commandConfirmation ?? "toast";
    if (kind !== "error" && confirmationMode === "none") {
      return;
    }

    notifyUser({
      kind,
      title,
      dedupeKey,
    });
  }

  _applyAutoStagedCapture(status: CaptureServiceStatus | null): void {
    const attachMode = this._captureDefaults()?.attachMode ?? "manual-sync";
    if (attachMode !== "auto-stage") {
      return;
    }

    const latestAsset = status?.analyze.latestAsset ?? null;
    if (latestAsset === null) {
      return;
    }

    this._stageCaptureAsset(latestAsset, "analyze-capture-auto-stage");
  }

  _handleCaptureMediaIngress(payload: CaptureMediaIngressPayload): void {
    if (payload.target !== "analyze-compose") {
      return;
    }

    this._stageCaptureAsset(payload.asset, "analyze-capture-companion-add");
    void this.refreshCaptureSessionState(true);
  }

  _stageCaptureAsset(latestAsset: CaptureMediaIngressPayload["asset"], dedupeKey: string): boolean {
    if (latestAsset.path === this._lastAutoStagedCapturePath) {
      return false;
    }

    const nextFiles = mergeUploadFiles(this.stagedFiles, [
      {
        name: latestAsset.name,
        originalName: latestAsset.originalName,
        path: latestAsset.path,
      },
    ]);
    if (nextFiles.length === this.stagedFiles.length) {
      this._lastAutoStagedCapturePath = latestAsset.path;
      return false;
    }

    this.stagedFiles = nextFiles;
    this._lastAutoStagedCapturePath = latestAsset.path;
    this._renderUploadList();
    this._notifyCaptureFeedback(
      "success",
      analyzeT("page.captureImport.success", { count: 1 }),
      dedupeKey
    );
    return true;
  }

  _startCaptureStatusPolling(): void {
    this._stopCaptureStatusPolling();
    let remainingTicks = 16;

    this._captureStatusPollTimer = window.setInterval(() => {
      remainingTicks -= 1;
      void this.refreshCaptureSessionState(true).finally(() => {
        const state = this._captureStatus?.analyze.state ?? "idle";
        const settled =
          state === "ready" || state === "result-ready" || state === "idle" || state === "error";
        if (settled || remainingTicks <= 0) {
          this._stopCaptureStatusPolling();
        }
      });
    }, 1500);
  }

  _stopCaptureStatusPolling(): void {
    if (this._captureStatusPollTimer !== null) {
      window.clearInterval(this._captureStatusPollTimer);
      this._captureStatusPollTimer = null;
    }
  }

  async _acquireAndroidCameraPanelOperations(): Promise<void> {
    if (this._cameraPanelOperationCapabilities.length > 0) {
      return;
    }

    const acquiredCapabilities: OperationCapability[] = [];
    await ANALYZE_CAMERA_OPERATION_CAPABILITIES.reduce<Promise<void>>(
      async (previous, capability) => {
        await previous;
        const outcome = await acquireOperationCapability(
          capability,
          ANALYZE_CAMERA_OPERATION_OWNER
        );
        if (outcome.success !== true) {
          await Promise.all(
            acquiredCapabilities.map(async (acquiredCapability) => {
              await releaseOperationCapability(
                acquiredCapability,
                ANALYZE_CAMERA_OPERATION_OWNER
              ).catch(() => null);
            })
          );
          throw new Error(outcome.error);
        }
        acquiredCapabilities.push(capability);
      },
      Promise.resolve()
    );

    this._cameraPanelOperationCapabilities = acquiredCapabilities;
  }

  async _releaseAndroidCameraPanelOperations(): Promise<void> {
    if (this._cameraPanelOperationCapabilities.length === 0) {
      return;
    }

    const capabilities = this._cameraPanelOperationCapabilities;
    this._cameraPanelOperationCapabilities = [];
    await Promise.all(
      capabilities.map(async (capability) => {
        await releaseOperationCapability(capability, ANALYZE_CAMERA_OPERATION_OWNER).catch(
          () => null
        );
      })
    );
  }

  async toggleAndroidCameraPanel(): Promise<void> {
    await this._setAndroidCameraPanelOpen(this._cameraPanelOpen !== true);
  }

  async openAndroidCameraManagement(): Promise<void> {
    await this.toggleAndroidCameraPanel();
  }

  async _setAndroidCameraPanelOpen(
    open: boolean,
    options: { notify?: boolean } = {}
  ): Promise<void> {
    if (open === true) {
      this._cameraPanelOpen = true;
      this._cameraPanelHasFrame = false;
      this._cameraPanelStatusMessage = analyzeT("page.cameraPanel.opening");
      this._cameraPreviewRequestId = `analyze-preview-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2)}`;
      this._renderAndroidCameraPanel();

      try {
        await this._acquireAndroidCameraPanelOperations();
        const outcome = await runCaptureAction("start-camera-feed", {
          target: "analyze-compose",
          requestId: this._cameraPreviewRequestId,
        });
        this._captureStatus = outcome.status;
        this._applyAutoStagedCapture(outcome.status);
        if (outcome.ok !== true) {
          throw new Error(outcome.message);
        }
        this._cameraPanelStatusMessage = analyzeT("page.cameraPanel.waiting");
        this._renderAndroidCameraPanel();
        const previewVideo =
          outcome.status.scrcpy.activeSession?.previewVideo ?? outcome.status.analyze.previewVideo;
        if (previewVideo === null) {
          const scrcpyMessage =
            outcome.status.operation.action === "start-camera-feed" &&
            outcome.status.operation.state === "error"
              ? outcome.status.operation.message
              : outcome.status.scrcpy.lastError;
          throw new Error(scrcpyMessage ?? "Scrcpy video device was not reported.");
        }
        await this._attachAndroidCameraFeed(previewVideo);
        this._cameraPanelHasFrame = true;
        this._cameraPanelStatusMessage = analyzeT("page.cameraPanel.live");
        this._renderAndroidCameraPanel();
        this._startCaptureStatusPolling();
      } catch (error) {
        const message = getErrorMessage(error);
        const failedRequestId = this._cameraPreviewRequestId;
        this._stopAndroidCameraFeed();
        this._cameraPanelStatusMessage = analyzeT("page.cameraPanel.error", { message });
        this._cameraPreviewRequestId = null;
        this._cameraPanelOpen = false;
        this._cameraPanelHasFrame = false;
        this._renderAndroidCameraPanel();
        await runCaptureAction("stop-camera-feed", {
          target: "analyze-compose",
          requestId: failedRequestId,
        }).catch(() => null);
        await this._releaseAndroidCameraPanelOperations();
        if (options.notify !== false) {
          this._notifyCaptureFeedback(
            "error",
            analyzeT("page.cameraPanel.error", { message }),
            "analyze-camera-preview-error"
          );
        }
      } finally {
        this.renderCaptureSessionState();
      }
      return;
    }

    const requestId = this._cameraPreviewRequestId;
    this._cameraPanelOpen = false;
    this._cameraPreviewRequestId = null;
    this._cameraPanelHasFrame = false;
    this._cameraPanelStatusMessage = analyzeT("page.cameraPanel.stopped");
    this._stopAndroidCameraFeed();
    this._renderAndroidCameraPanel();

    if (requestId === null) {
      await this._releaseAndroidCameraPanelOperations();
      this.renderCaptureSessionState();
      return;
    }

    try {
      const outcome = await runCaptureAction("stop-camera-feed", {
        target: "analyze-compose",
        requestId,
      });
      this._captureStatus = outcome.status;
      if (outcome.ok !== true && options.notify !== false) {
        this._notifyCaptureFeedback("error", outcome.message, "analyze-camera-preview-stop-error");
      }
    } catch (error) {
      if (options.notify !== false) {
        this._notifyCaptureFeedback(
          "error",
          analyzeT("page.cameraPanel.error", { message: getErrorMessage(error) }),
          "analyze-camera-preview-stop-exception"
        );
      }
    } finally {
      await this._releaseAndroidCameraPanelOperations();
      this.renderCaptureSessionState();
    }
  }

  _findAndroidCameraMediaDevice(
    devices: MediaDeviceInfo[],
    previewVideo: CaptureAnalyzePreviewVideoStatus
  ): MediaDeviceInfo | null {
    const expectedLabel = previewVideo.label.toLowerCase();
    const expectedDevicePath = previewVideo.devicePath.toLowerCase();
    const expectedDeviceNode = expectedDevicePath.match(/video\d+/)?.[0] ?? null;
    const videoInputs = devices.filter((device) => device.kind === "videoinput");

    const labelMatch =
      videoInputs.find((device) => device.label.toLowerCase().includes(expectedLabel)) ?? null;
    if (labelMatch !== null) {
      return labelMatch;
    }

    if (expectedDeviceNode !== null) {
      const devicePathMatch =
        videoInputs.find((device) => device.label.toLowerCase().includes(expectedDeviceNode)) ??
        null;
      if (devicePathMatch !== null) {
        return devicePathMatch;
      }
    }

    return (
      videoInputs.find((device) => {
        const normalizedLabel = device.label.toLowerCase();
        return normalizedLabel.includes("v4l2") && normalizedLabel.includes("loopback");
      }) ?? null
    );
  }

  async _waitForAndroidCameraMediaDevice(
    previewVideo: CaptureAnalyzePreviewVideoStatus,
    options: { maxAttempts?: number; delayMs?: number } = {}
  ): Promise<MediaDeviceInfo | null> {
    const mediaDevices = navigator.mediaDevices as Partial<MediaDevices> | undefined;
    if (mediaDevices?.enumerateDevices === undefined) {
      return null;
    }

    const maxAttempts = options.maxAttempts ?? 12;
    const delayMs = options.delayMs ?? 250;
    const enumerateDevices = mediaDevices.enumerateDevices.bind(mediaDevices);
    const attemptResolve = async (attempt: number): Promise<MediaDeviceInfo | null> => {
      const matched = this._findAndroidCameraMediaDevice(await enumerateDevices(), previewVideo);
      if (matched !== null || attempt + 1 >= maxAttempts) {
        return matched;
      }

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, delayMs);
      });
      return await attemptResolve(attempt + 1);
    };

    return await attemptResolve(0);
  }

  async _resolveAndroidCameraMediaDevice(
    previewVideo: CaptureAnalyzePreviewVideoStatus
  ): Promise<MediaDeviceInfo> {
    const mediaDevices = navigator.mediaDevices as Partial<MediaDevices> | undefined;
    if (mediaDevices?.getUserMedia === undefined || mediaDevices.enumerateDevices === undefined) {
      throw new Error("Local camera capture is not available in this browser context.");
    }

    const existingDevice = await this._waitForAndroidCameraMediaDevice(previewVideo);
    if (existingDevice !== null) {
      return existingDevice;
    }

    const permissionStream = await mediaDevices.getUserMedia({
      audio: false,
      video: true,
    });
    permissionStream.getTracks().forEach((track) => {
      track.stop();
    });

    const permittedDevice = await this._waitForAndroidCameraMediaDevice(previewVideo, {
      maxAttempts: 16,
      delayMs: 250,
    });
    if (permittedDevice !== null) {
      return permittedDevice;
    }

    throw new Error(
      `Local camera device not found: ${previewVideo.label} (${previewVideo.devicePath})`
    );
  }

  async _attachAndroidCameraFeed(
    previewVideo: CaptureAnalyzePreviewVideoStatus | null
  ): Promise<void> {
    if (previewVideo === null) {
      throw new Error("Scrcpy video device was not reported.");
    }

    const video = document.getElementById("android-camera-feed") as HTMLVideoElement | null;
    const image = document.getElementById("android-camera-frame") as HTMLImageElement | null;

    if (previewVideo.source === "mjpeg-stream") {
      const streamUrl = previewVideo.streamUrl ?? previewVideo.devicePath;
      if (streamUrl.trim() === "") {
        throw new Error("Android companion live camera stream URL was not reported.");
      }
      if (image === null) {
        throw new Error("Analyze camera image surface is missing.");
      }

      this._stopAndroidCameraFeed();
      this._cameraPreviewVideoSource = "mjpeg-stream";
      image.src = streamUrl;
      image.hidden = false;
      return;
    }

    if (video === null) {
      throw new Error("Analyze camera video surface is missing.");
    }

    const mediaDevices = navigator.mediaDevices as Partial<MediaDevices> | undefined;
    if (mediaDevices?.getUserMedia === undefined) {
      throw new Error("Local camera capture is not available in this browser context.");
    }

    this._stopAndroidCameraFeed();
    const mediaDevice = await this._resolveAndroidCameraMediaDevice(previewVideo);
    const stream = await mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId: { exact: mediaDevice.deviceId },
        width: { ideal: previewVideo.width },
        height: { ideal: previewVideo.height },
        frameRate: { ideal: previewVideo.fps },
      },
    });
    this._cameraPreviewStream = stream;
    this._cameraPreviewVideoSource = previewVideo.source;
    video.srcObject = stream;
    video.hidden = false;
    await video.play();
  }

  _stopAndroidCameraFeed(): void {
    if (this._cameraPreviewStream !== null) {
      this._cameraPreviewStream.getTracks().forEach((track) => {
        track.stop();
      });
      this._cameraPreviewStream = null;
    }
    this._cameraPreviewVideoSource = null;

    const video = document.getElementById("android-camera-feed") as HTMLVideoElement | null;
    if (video !== null) {
      video.pause();
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
      video.hidden = true;
    }
    const image = document.getElementById("android-camera-frame") as HTMLImageElement | null;
    if (image !== null) {
      image.removeAttribute("src");
      image.hidden = true;
    }
  }

  _renderAndroidCameraPanel(): void {
    const panel = document.getElementById("android-camera-panel");
    const row = panel?.closest(".compose-row");
    const placeholder = document.getElementById("android-camera-placeholder");
    const video = document.getElementById("android-camera-feed") as HTMLVideoElement | null;
    const image = document.getElementById("android-camera-frame") as HTMLImageElement | null;
    const status = document.getElementById("android-camera-status");
    if (row instanceof HTMLElement) {
      row.classList.toggle("is-camera-panel-open", this._cameraPanelOpen);
    }
    if (panel !== null) {
      panel.hidden = this._cameraPanelOpen !== true;
      panel.classList.toggle("has-frame", this._cameraPanelHasFrame);
    }
    const message =
      this._cameraPanelStatusMessage ??
      analyzeT(this._cameraPanelOpen ? "page.cameraPanel.waiting" : "page.cameraPanel.closed");
    const hasVisibleFeed =
      this._cameraPanelHasFrame === true &&
      (this._cameraPreviewStream !== null || this._cameraPreviewVideoSource === "mjpeg-stream");
    if (video !== null) {
      video.hidden = !(hasVisibleFeed === true && this._cameraPreviewStream !== null);
    }
    if (image !== null) {
      image.hidden = !(
        hasVisibleFeed === true && this._cameraPreviewVideoSource === "mjpeg-stream"
      );
    }
    if (placeholder !== null) {
      placeholder.textContent = message;
      placeholder.hidden = hasVisibleFeed;
    }
    if (status !== null) {
      status.textContent = message;
    }
  }

  renderCaptureSessionState(): void {
    const captureState = this._captureStatus?.analyze ?? null;
    const selectedDevice = this._selectedAndroidDictationDevice(this._captureStatus);
    const stateLabel = analyzeT(`page.captureSessionStates.${captureState?.state ?? "idle"}`);

    const headerStatusEl = document.getElementById("compose-android-status");
    const captureButton = document.getElementById("capture-import-btn") as HTMLButtonElement | null;
    const androidCompanionEnabled = this._captureProviders()?.androidCompanionEnabled !== false;
    const deviceLabel = selectedDevice?.label ?? analyzeT("page.captureSessionDeviceNone");
    const hasReadyDevice = selectedDevice !== null;
    const sessionActive =
      captureState?.state === "pending-launch" ||
      captureState?.state === "ready" ||
      captureState?.state === "capture-requested" ||
      captureState?.state === "result-ready";

    if (headerStatusEl) {
      headerStatusEl.textContent =
        androidCompanionEnabled === true
          ? `${stateLabel} - ${deviceLabel}`
          : analyzeT("page.captureSessionDisabled");
      headerStatusEl.classList.toggle(
        "is-ready",
        androidCompanionEnabled === true && selectedDevice !== null
      );
      headerStatusEl.classList.toggle("is-disabled", androidCompanionEnabled !== true);
    }

    if (captureButton) {
      captureButton.disabled =
        androidCompanionEnabled !== true ||
        (hasReadyDevice === false && this._cameraPanelOpen !== true);
      captureButton.classList.toggle("is-active", sessionActive || this._cameraPanelOpen);
      captureButton.setAttribute("aria-pressed", this._cameraPanelOpen ? "true" : "false");
      captureButton.setAttribute("aria-expanded", this._cameraPanelOpen ? "true" : "false");
    }

    this._syncDictationAvailability();
    this._renderAmbientToggle();
    this._renderAndroidCameraPanel();
    this._syncTtsBubbleStates();
  }

  async refreshCaptureSessionState(forceRefresh = false): Promise<void> {
    try {
      this._captureStatus = forceRefresh ? await refreshCaptureStatus() : await getCaptureStatus();
      this._applyAutoStagedCapture(this._captureStatus);
    } catch (error) {
      this._captureStatus = null;
      this._notifyCaptureFeedback(
        "error",
        analyzeT("page.captureImport.error", { message: getErrorMessage(error) }),
        "analyze-capture-status-error"
      );
    } finally {
      this.renderCaptureSessionState();
    }
  }

  async _runCaptureAction(
    action: CaptureActionOutcome["action"],
    options: CaptureRunOptions = {}
  ): Promise<void> {
    try {
      const outcome = await runCaptureAction(action);
      this._captureStatus = outcome.status;
      this._applyAutoStagedCapture(outcome.status);
      if (options.notify !== false) {
        this._notifyCaptureFeedback(
          outcome.ok ? "success" : "error",
          outcome.message,
          `analyze-${action}`
        );
      }
      if (
        options.poll !== false &&
        outcome.ok === true &&
        (action === "start-analyze-session" ||
          action === "capture-analyze-photo" ||
          action === "retake-analyze-photo" ||
          action === "stop-analyze-session")
      ) {
        this._startCaptureStatusPolling();
      }
    } catch (error) {
      this._notifyCaptureFeedback("error", getErrorMessage(error), `analyze-${action}-error`);
    } finally {
      this.renderCaptureSessionState();
    }
  }

  _handleMessageAction(
    action: "read" | "prepend" | "append" | "speak",
    payload: { provider: string; text: string; messageId: string }
  ): void {
    if (action === "speak") {
      void this._toggleMessageSpeech(payload);
      return;
    }

    applyMessageAction(action, payload, () => {
      this.updateSendButtonState();
    });
  }

  async _toggleMessageSpeech(payload: {
    provider: string;
    text: string;
    messageId: string;
  }): Promise<void> {
    const text = payload.text.trim();
    if (text === "") {
      return;
    }

    const activeRequestId = this._ttsActiveRequestId;
    if (
      activeRequestId !== null &&
      this._ttsActiveMessageId === payload.messageId &&
      this._isTtsStatusActive(this._ttsRuntimeStatus?.active) === true
    ) {
      await stopSpeech(activeRequestId);
      return;
    }

    if (activeRequestId !== null && this._isTtsStatusActive(this._ttsRuntimeStatus?.active)) {
      await stopSpeech(activeRequestId).catch(() => null);
    }

    this._ttsActiveMessageId = payload.messageId;
    this._syncTtsBubbleStates();

    const result = await speakText({
      text,
      target: "analyze-compose",
      mode: ttsMode(),
      language: ttsLanguage(),
    });
    this._ttsRuntimeStatus = result.runtime;
    this._ttsActiveRequestId = result.requestId;
    this._applyAnalyzeTtsStatus(result.status);
  }

  _handleTtsStatus(payload: TtsStatus): void {
    if (payload.target !== "analyze-compose") {
      return;
    }

    this._applyAnalyzeTtsStatus(payload);
  }

  _applyAnalyzeTtsStatus(payload: TtsStatus): void {
    this._ttsRuntimeStatus = {
      ...(this._ttsRuntimeStatus ?? {
        mode: ttsMode(),
        language: ttsLanguage(),
        active: null,
        local: {
          ready: false,
          runtimeAvailable: false,
          runtimePath: null,
          modelPath: null,
          modelId: payload.modelId,
          message: null,
        },
        android: {
          ready: false,
          deviceId: null,
          message: null,
        },
        models: [],
      }),
      active: this._isTtsStatusActive(payload) ? payload : null,
    };
    this._ttsActiveRequestId = payload.requestId;
    if (payload.status === "failed") {
      this._notifyCaptureFeedback("error", payload.message, `analyze-tts-${payload.requestId}`);
    }
    this._syncTtsBubbleStates();
    if (payload.status === "done" || payload.status === "stopped" || payload.status === "failed") {
      this._ttsActiveRequestId = null;
      this._ttsActiveMessageId = null;
    }
  }

  _syncTtsBubbleStates(): void {
    const buttons = document.querySelectorAll<HTMLButtonElement>(".msg-action-btn--speak");
    const active = this._ttsRuntimeStatus?.active ?? null;
    const activeMessageId =
      this._isTtsStatusActive(active) === true ? this._ttsActiveMessageId : null;
    const speakTitle = analyzeT("bubble.actions.speak");
    const stopTitle = analyzeT("bubble.actions.stopSpeech");
    const loadingTitle = analyzeT("bubble.actions.speechLoading");

    buttons.forEach((button) => {
      const isActiveMessage =
        activeMessageId !== null && button.dataset["messageId"] === activeMessageId;
      const isPreparing =
        isActiveMessage && (active?.status === "queued" || active?.status === "preparing");
      const isPlaying = isActiveMessage && active?.status === "playing";
      const title = isPreparing ? loadingTitle : isPlaying ? stopTitle : speakTitle;
      button.classList.toggle("is-loading", isPreparing);
      button.classList.toggle("is-playing", isPlaying);
      button.dataset["ttsState"] = isPreparing ? "loading" : isPlaying ? "playing" : "idle";
      button.textContent = isPreparing ? "..." : isPlaying ? "■" : "▶";
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-pressed", isActiveMessage ? "true" : "false");
    });
  }

  _clearSlotMessages(provider: string): void {
    if (provider === "ai1" || provider === "ai2") {
      resetMessageRenderState(provider);
    } else if (provider === "us1") {
      this.us1SessionId = null;
      AppState.setActiveConversation("us1", null);
      this._us1AwaitingReply = false;
      this._applyUs1Indicators(AppState.isUs1Connected());
    }
    const container = document.getElementById(`messages-${provider}`);
    if (container) {
      container.innerHTML = "";
    }
    if (provider === "ai1" || provider === "ai2" || provider === "us1") {
      this.lastMessages[provider] = "";
    }
    Logger.info(LogCategory.ANALYZE, analyzeT("logs.slotMessagesCleared", { provider }));
  }

  async _renderMessages(provider: "ai1" | "ai2"): Promise<void> {
    Logger.debug(LogCategory.ANALYZE, analyzeT("logs.renderMessagesStarted", { provider }));
    const callbacks: RenderCallbacks = {
      onMessageAction: (action, payload) => {
        this._handleMessageAction(action, payload);
      },
    };
    const result = await renderMessages(provider, callbacks);
    this._syncTtsBubbleStates();
    Logger.debug(LogCategory.ANALYZE, analyzeT("logs.renderMessagesCompleted", { provider }), {
      lastMessage: result.lastMessage.substring(0, 50),
    });
    this.lastMessages[provider] = result.lastMessage;
  }

  async _renderUs1Messages(): Promise<void> {
    const container = document.getElementById("messages-us1");
    if (!(container instanceof HTMLElement)) {
      return;
    }

    const electronApi = window.electronAPI;
    const accountId = AppState.getUs1ArchiveAccountId();
    const conversationId = AppState.getState().activeConversations["us1"] ?? null;
    if (
      electronApi === undefined ||
      typeof electronApi.dbGetMessages !== "function" ||
      typeof electronApi["dbGetAttachments"] !== "function" ||
      accountId === null ||
      conversationId === null
    ) {
      container.innerHTML = "";
      const placeholder = document.createElement("div");
      placeholder.className = "message-placeholder";
      placeholder.textContent = analyzeT("page.noMessages");
      container.appendChild(placeholder);
      this.lastMessages.us1 = "";
      this._us1AwaitingReply = false;
      this._applyUs1Indicators(AppState.isUs1Connected());
      return;
    }

    const rawMessages = await electronApi.dbGetMessages({ accountId, conversationId });
    const rawAttachments = await electronApi["dbGetAttachments"]({ accountId, conversationId });
    const messagesResult = isDbMessagesResult(rawMessages) ? rawMessages : {};
    const attachmentsResult = isDbAttachmentsResult(rawAttachments) ? rawAttachments : {};
    const rawMessageItems = Array.isArray(messagesResult.data)
      ? (messagesResult.data as unknown[])
      : [];
    const rawAttachmentItems = Array.isArray(attachmentsResult.data)
      ? (attachmentsResult.data as unknown[])
      : [];
    const messages = rawMessageItems.flatMap((message) => {
      const normalized = normalizeMessageItem(message);
      return normalized !== null ? [normalized] : [];
    });
    const attachments = rawAttachmentItems.flatMap((attachment) => {
      const normalized = normalizeAttachmentData(attachment);
      return normalized !== null ? [normalized] : [];
    });

    container.innerHTML = "";

    if (messages.length === 0) {
      const placeholder = document.createElement("div");
      placeholder.className = "message-placeholder";
      placeholder.textContent = analyzeT("page.noMessages");
      container.appendChild(placeholder);
      this.lastMessages.us1 = "";
      this._us1AwaitingReply = false;
      this._applyUs1Indicators(AppState.isUs1Connected());
      return;
    }

    const attachmentsByMessage = attachments.reduce<Record<string, AttachmentData[]>>(
      (acc, attachment) => {
        acc[attachment.messageId] ??= [];
        acc[attachment.messageId]?.push(attachment);
        return acc;
      },
      {}
    );
    const callbacks: RenderCallbacks = {
      onMessageAction: (action, payload) => {
        this._handleMessageAction(action, payload);
      },
    };
    const attachmentsBasePath = `data/${accountId}/attachments/${conversationId}`;

    messages.forEach((message) => {
      container.appendChild(
        createMessageBubble(
          message,
          "us1",
          attachmentsBasePath,
          attachmentsByMessage[message.id] ?? [],
          callbacks
        )
      );
    });

    const lastAssistant = [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" && (message.content ?? message.text ?? "").trim() !== ""
      );
    const lastMeaningful = [...messages].reverse().find((message) => {
      const text = (message.content ?? message.text ?? "").trim();
      return text !== "" && (message.role === "assistant" || message.role === "user");
    });
    this.lastMessages.us1 = lastAssistant?.content ?? lastAssistant?.text ?? "";
    this._syncTtsBubbleStates();
    this._us1AwaitingReply = lastMeaningful?.role === "user";
    AppState.clearUs1PendingSession(this.us1SessionId);
    AppState.clearUs1PendingSessionByConversation(conversationId);
    container.scrollTop = container.scrollHeight;
    this._applyUs1Indicators(AppState.isUs1Connected());
  }

  _applyUs1Indicators(connected: boolean): void {
    if (this._syncingUs1Indicators) {
      return;
    }

    this._syncingUs1Indicators = true;
    try {
      TrafficManager.setIndicator("us1", "loading", this._us1LoadingBusy ? "busy" : "idle");
      TrafficManager.setIndicator(
        "us1",
        "thinking",
        connected && this._us1AwaitingReply ? "busy" : "idle"
      );
      TrafficManager.setIndicator("us1", "send", this._isUs1SendReady(connected) ? "idle" : "busy");
    } finally {
      this._syncingUs1Indicators = false;
    }
  }

  _isUs1SendReady(connected: boolean): boolean {
    if (connected === false || this._us1SendBusy === true) {
      return false;
    }

    const analyzePage = document.getElementById("page-analyze");
    const analyzeVisible =
      analyzePage instanceof HTMLElement && !analyzePage.classList.contains("is-hidden");
    if (analyzeVisible === false) {
      return true;
    }

    const sendUs1 =
      (document.getElementById("send-us1") as HTMLInputElement | null)?.checked === true;
    const message = (
      (document.getElementById("compose-input") as HTMLTextAreaElement | null)?.value ?? ""
    ).trim();
    const hasContent = message !== "" || this.stagedFiles.length > 0;
    return sendUs1 && hasContent;
  }

  async _sendUs1Message(message: string, attachments: StagedFile[]): Promise<void> {
    this._syncUs1IdentityContext();
    const localSessionId = this._ensureUs1LocalSessionId();
    if (localSessionId === null) {
      throw new Error("US1 session could not be resolved.");
    }

    this._us1SendBusy = true;
    this._us1AwaitingReply = true;
    this._applyUs1Indicators(AppState.isUs1Connected());

    try {
      const result = await dispatchInternalSlotBridge(
        {
          action: "message.send",
          toSlot: "us1",
          sessionRef: {
            id: localSessionId,
          },
          payload: {
            text: message,
            page: "analyze",
          },
          attachments: attachments.map((file) => ({
            path: file.path,
            name: file.originalName ?? file.name,
            mimeType: getMimeTypeFromPath(file.path),
          })),
        },
        {
          provider: "user",
          source: "user",
          fromSlot: "user",
        }
      );

      if (result.success !== true) {
        throw new Error(result.message ?? "US1 outbound send failed.");
      }

      const sessionId =
        typeof result.session?.id === "string" && result.session.id !== ""
          ? result.session.id
          : localSessionId;
      const conversationId =
        typeof result.session?.conversationId === "string" && result.session.conversationId !== ""
          ? result.session.conversationId
          : null;

      this.us1SessionId = sessionId;
      AppState.setActiveConversation("us1", conversationId);
      await ConversationListManager.refresh({
        silent: true,
        provider: "us1",
        ...(conversationId !== null ? { forceSelectId: conversationId } : {}),
        skipNotify: true,
      });
      await SettingsManager.reload();
      this.applyAvatars();
      this.applyNames();
      await this._renderUs1Messages();
      await this._syncUs1Messages({ showRoomPackages: true });
    } catch (error) {
      this._us1AwaitingReply = false;
      throw error;
    } finally {
      this._us1SendBusy = false;
      this._applyUs1Indicators(AppState.isUs1Connected());
    }
  }

  async _syncUs1Messages(options: { showRoomPackages?: boolean } = {}): Promise<void> {
    if (this._us1SyncInFlight === true) {
      return;
    }

    if (AppState.isUs1Connected() !== true) {
      return;
    }

    this._us1SyncInFlight = true;
    this._us1LoadingBusy = true;
    this._applyUs1Indicators(true);
    const conversationSelect = document.getElementById(
      "conversation-us1"
    ) as HTMLSelectElement | null;
    const selectedConversationValue = conversationSelect?.value ?? "new";
    const isNewSelected = selectedConversationValue === "new";
    const currentConversationId = AppState.getState().activeConversations["us1"] ?? null;
    const currentSessionId = this.us1SessionId;
    const composeHasDraft =
      (
        (document.getElementById("compose-input") as HTMLTextAreaElement | null)?.value ?? ""
      ).trim() !== "" || this.stagedFiles.length > 0;

    try {
      const result = await dispatchInternalSlotBridge(
        {
          action: "session.sync",
          toSlot: "us1",
          ...(typeof this.us1SessionId === "string" && this.us1SessionId !== ""
            ? {
                sessionRef: {
                  id: this.us1SessionId,
                },
              }
            : {}),
        },
        {
          provider: "user",
          source: "user",
          fromSlot: "user",
        }
      );
      if (result.success !== true) {
        throw new Error(result.message ?? result.error ?? "US1 inbound sync failed.");
      }
      const syncData =
        result.data !== null &&
        typeof result.data === "object" &&
        Array.isArray(result.data) === false
          ? (result.data as Record<string, unknown>)
          : {};

      if (
        (typeof syncData["fetchedCount"] === "number" ? syncData["fetchedCount"] : 0) > 0 ||
        (typeof syncData["processedCount"] === "number" ? syncData["processedCount"] : 0) > 0
      ) {
        await SettingsManager.reload();
        this.applyAvatars();
        this.applyNames();
      }

      const sessionEvents: Us1SessionEvent[] = Array.isArray(syncData["sessionEvents"])
        ? syncData["sessionEvents"].filter(isUs1SessionEvent)
        : [];
      const autoOpenSession = this._chooseUs1AutoOpenSession(sessionEvents, {
        currentSessionId,
        currentConversationId,
        isNewSelected,
        composeHasDraft,
      });
      const preserveExplicitNewSelection = isNewSelected === true && currentSessionId === null;
      const nextConversationId =
        preserveExplicitNewSelection === true
          ? null
          : (autoOpenSession?.conversationId ??
            (sessionEvents.length > 0 && currentConversationId !== null
              ? currentConversationId
              : ((typeof result.session?.conversationId === "string"
                  ? result.session.conversationId
                  : null) ??
                (typeof syncData["conversationId"] === "string"
                  ? syncData["conversationId"]
                  : null) ??
                currentConversationId)));
      const nextSessionId =
        preserveExplicitNewSelection === true
          ? currentSessionId
          : (autoOpenSession?.localSessionId ??
            (nextConversationId === currentConversationId
              ? (currentSessionId ??
                (typeof result.session?.id === "string" ? result.session.id : null) ??
                (typeof syncData["localSessionId"] === "string"
                  ? syncData["localSessionId"]
                  : null))
              : ((typeof result.session?.id === "string" ? result.session.id : null) ??
                (typeof syncData["localSessionId"] === "string"
                  ? syncData["localSessionId"]
                  : null) ??
                currentSessionId)));

      this._applyUs1PendingSessions(sessionEvents, nextSessionId, nextConversationId);
      this.us1SessionId = nextSessionId;
      AppState.setActiveConversation("us1", nextConversationId ?? null);
      await ConversationListManager.refresh({
        silent: true,
        provider: "us1",
        ...(typeof nextConversationId === "string" &&
        nextConversationId !== "" &&
        autoOpenSession !== null
          ? { forceSelectId: nextConversationId }
          : {}),
        skipNotify: true,
      });
      await this._renderUs1Messages();

      if (options.showRoomPackages === true) {
        await this._handleIncomingUs1RoomPackages(
          Array.isArray(syncData["roomPackages"])
            ? syncData["roomPackages"].filter(isUs1RoomPackageCandidate)
            : []
        );
      }
    } catch (error) {
      Logger.warn(LogCategory.ANALYZE, "US1 inbound sync failed", {
        error,
      });
    } finally {
      this._us1SyncInFlight = false;
      this._us1LoadingBusy = false;
      this._applyUs1Indicators(AppState.isUs1Connected());
    }
  }

  async _handleIncomingUs1RoomPackages(roomPackages: Us1RoomPackageCandidate[]): Promise<void> {
    const electronApi = window.electronAPI;
    if (
      electronApi === undefined ||
      typeof electronApi.showMessageBox !== "function" ||
      typeof electronApi.roomsImportBundle !== "function"
    ) {
      return;
    }

    for (const roomPackage of roomPackages) {
      if (roomPackage.storedPath.trim() === "") {
        Logger.warn(LogCategory.ANALYZE, "US1 room package missing attachment path", {
          roomPackage,
        });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop -- NOTE: user confirmations must be sequential.
      const confirmation = await electronApi.showMessageBox({
        type: "question",
        title: "Import room package",
        message: `${roomPackage.originalName} was received from ${AppState.getNickname("us1")}. Import it now?`,
        buttons: ["Import", "Cancel"],
        defaultId: 0,
        cancelId: 1,
      });
      if (confirmation.response !== 0) {
        Logger.warn(LogCategory.ANALYZE, "US1 room package import rejected", {
          roomPackage,
        });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop -- NOTE: keep import order aligned with confirmations.
      const importResult = await electronApi.roomsImportBundle({
        bundleFile: roomPackage.storedPath,
        overwriteWorkspace: true,
      });
      if (importResult.success !== true) {
        Logger.warn(LogCategory.ANALYZE, "US1 room package import failed", {
          roomPackage,
          error: importResult.error,
        });
      }
    }
  }

  _startUs1Polling(): void {
    if (this._us1PollTimer !== null || AppState.isUs1Connected() !== true) {
      return;
    }

    this._us1PollTimer = window.setInterval(() => {
      void this._syncUs1Messages({ showRoomPackages: true });
    }, 30000);
  }

  _stopUs1Polling(): void {
    if (this._us1PollTimer !== null) {
      window.clearInterval(this._us1PollTimer);
      this._us1PollTimer = null;
    }
  }

  refreshUploads(): void {
    this._renderUploadList();
  }

  async handleUploadClick(): Promise<void> {
    const btn = document.getElementById("upload-add-btn") as HTMLButtonElement | null;
    if (btn?.disabled === true) return;
    if (btn) btn.disabled = true;

    try {
      this.stagedFiles = await addUploadFiles(this.stagedFiles);
      this._renderUploadList();
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async handleCaptureImportClick(): Promise<void> {
    try {
      const imported = await consumeAnalyzeCaptureAssets();
      if (imported.length === 0) {
        this._notifyCaptureFeedback(
          "info",
          analyzeT("page.captureImport.empty"),
          "analyze-capture-import-empty"
        );
        return;
      }

      this.stagedFiles = mergeUploadFiles(
        this.stagedFiles,
        imported.map((entry) => ({
          name: entry.name,
          originalName: entry.originalName,
          path: entry.path,
        }))
      );
      this._renderUploadList();
      this._captureStatus = await refreshCaptureStatus().catch(() => this._captureStatus);
      this._applyAutoStagedCapture(this._captureStatus);
      this.renderCaptureSessionState();
      this._notifyCaptureFeedback(
        "success",
        analyzeT("page.captureImport.success", { count: imported.length }),
        "analyze-capture-import-success"
      );
    } catch (error) {
      this._notifyCaptureFeedback(
        "error",
        analyzeT("page.captureImport.error", { message: getErrorMessage(error) }),
        "analyze-capture-import-error"
      );
    }
  }

  _renderUploadList(): void {
    renderUploadList(this.stagedFiles, (name) => {
      this.stagedFiles = removeUploadFile(this.stagedFiles, name);
      this._renderUploadList();
    });
    this.updateSendButtonState();
  }

  async _initDraftSystem(): Promise<void> {
    initDraft();
    this.beforeUnloadHandler = (): void => {
      this._persistDraft();
    };
    window.addEventListener("beforeunload", this.beforeUnloadHandler);

    const draftResult = await loadDraft();
    const draft = isDraftState(draftResult) ? draftResult : { message: "", files: [] };

    const textarea = document.getElementById("compose-input") as HTMLTextAreaElement | null;
    if (textarea !== null && textarea.value.trim() === "") {
      textarea.value = draft.message;
    }
    if (this.stagedFiles.length === 0) {
      this.stagedFiles = draft.files;
    }
    this._renderUploadList();
  }

  _persistDraft(): void {
    const composeInput = document.getElementById("compose-input") as HTMLTextAreaElement | null;
    const message = composeInput ? composeInput.value : "";
    void persistDraft(message, this.stagedFiles);
  }

  handleSend(): void {
    const msg = (
      (document.getElementById("compose-input") as HTMLTextAreaElement | null)?.value ?? ""
    ).trim();
    const hasFiles = this.stagedFiles.length > 0;
    const sendAi1 = (document.getElementById("send-ai1") as HTMLInputElement | null)?.checked;
    const sendAi2 = (document.getElementById("send-ai2") as HTMLInputElement | null)?.checked;
    const sendUs1 = (document.getElementById("send-us1") as HTMLInputElement | null)?.checked;
    const cross = (document.getElementById("send-cross") as HTMLInputElement | null)?.checked;
    const sendBtn = document.getElementById("compose-send-btn") as HTMLButtonElement | null;

    const shouldSendAi1 = sendAi1 === true;
    const shouldSendAi2 = sendAi2 === true;
    const shouldSendUs1 = sendUs1 === true;
    const shouldCross = cross === true;

    if ((!shouldSendAi1 && !shouldSendAi2 && !shouldSendUs1) || (msg === "" && !hasFiles)) return;

    if (sendBtn) {
      ButtonStates.setLoading(sendBtn, analyzeT("page.buttons.sending"));
    }

    Logger.debug(LogCategory.ANALYZE, analyzeT("logs.sendStarting"));

    const targets: string[] = [];
    const textByProvider: Record<string, string> = {};
    const archiveFolders: Record<string, string> = {};

    if (shouldSendAi1) {
      let text = msg;
      if (shouldCross && shouldSendAi2) {
        const otherName = AppState.getNickname("ai2");
        const otherMsg = this.lastMessages.ai2.trim();
        text = otherMsg !== "" ? `${otherName} : ${otherMsg} | ${msg}` : msg;
      }
      textByProvider["ai1"] = text;
      targets.push("ai1");
      archiveFolders["ai1"] = this._getConversationFolder("ai1");
    }

    if (shouldSendAi2) {
      let text = msg;
      if (shouldCross && shouldSendAi1) {
        const otherName = AppState.getNickname("ai1");
        const otherMsg = this.lastMessages.ai1.trim();
        text = otherMsg !== "" ? `${otherName} : ${otherMsg} | ${msg}` : msg;
      }
      textByProvider["ai2"] = text;
      targets.push("ai2");
      archiveFolders["ai2"] = this._getConversationFolder("ai2");
    }

    const texts = targets.map((p) => textByProvider[p] ?? msg);
    const allSame = texts.every((t) => t === texts[0]);
    const attachList = [...this.stagedFiles];

    const sendFlow = async (): Promise<void> => {
      try {
        if (targets.length > 0 && allSame) {
          await dispatchInternalSlotBridge(
            {
              action: "message.send",
              toSlots: targets,
              payload: {
                text: texts[0] ?? "",
                page: "analyze",
                archiveFolders,
              },
              attachments: attachList.map((file) => ({
                path: file.path,
                name: file.originalName ?? file.name,
                mimeType: getMimeTypeFromPath(file.path),
              })),
            },
            {
              provider: "user",
              source: "user",
              fromSlot: "user",
            }
          );
        } else if (targets.length > 0) {
          await targets.reduce(async (prev, provider) => {
            await prev;
            await dispatchInternalSlotBridge(
              {
                action: "message.send",
                toSlot: provider,
                payload: {
                  text: textByProvider[provider] ?? "",
                  page: "analyze",
                  archiveFolders,
                },
                attachments: attachList.map((file) => ({
                  path: file.path,
                  name: file.originalName ?? file.name,
                  mimeType: getMimeTypeFromPath(file.path),
                })),
              },
              {
                provider: "user",
                source: "user",
                fromSlot: "user",
              }
            );
          }, Promise.resolve());
        }
        if (shouldSendUs1) {
          await this._sendUs1Message(msg, attachList);
        }
        if (sendBtn) {
          ButtonStates.setSuccess(sendBtn, analyzeT("page.buttons.sent"), 1500);
        }
        Logger.success(LogCategory.ANALYZE, analyzeT("logs.sendSuccess"));
      } catch (error) {
        if (sendBtn) {
          ButtonStates.setError(sendBtn, analyzeT("page.buttons.error"), 1500);
        }
        Logger.error(
          LogCategory.ANALYZE,
          analyzeT("logs.sendError", { message: getErrorMessage(error) })
        );
      }
    };

    void sendFlow().finally(() => {
      this.stagedFiles = [];
      this._renderUploadList();
      const composeInput = document.getElementById("compose-input") as HTMLTextAreaElement | null;
      if (composeInput) composeInput.value = "";

      setTimeout(() => {
        this.updateSendButtonState();
      }, 1600);
    });
  }

  async handleAnalyzeStart(): Promise<void> {
    const targets = this._getAssignedAIs();
    if (targets.length === 0) {
      Logger.warn(LogCategory.ANALYZE, analyzeT("logs.protocolSendSkippedNoConnectedAi"));
      return;
    }
    await sendProtocolThroughSlotBridge({
      room: "analyze",
      scenario: "user-ai-ai",
      targets,
      mode: targets.length >= 2 ? "aiRelay" : "normal",
    });
  }

  async handleAnalyzeStop(): Promise<void> {
    const targets = this._getAssignedAIs();
    if (targets.length === 0) {
      Logger.warn(LogCategory.ANALYZE, analyzeT("logs.protocolStopSkippedNoConnectedAi"));
      return;
    }

    await sendProtocolThroughSlotBridge({
      room: "analyze",
      scenario: "user-ai-ai-stop",
      targets,
    });
  }

  updateSendButtonState(): void {
    const btn = document.getElementById("compose-send-btn") as HTMLButtonElement | null;
    if (!btn) return;

    const sendAi1 = (document.getElementById("send-ai1") as HTMLInputElement | null)?.checked;
    const sendAi2 = (document.getElementById("send-ai2") as HTMLInputElement | null)?.checked;
    const sendUs1 = (document.getElementById("send-us1") as HTMLInputElement | null)?.checked;
    const hasTarget = sendAi1 === true || sendAi2 === true || sendUs1 === true;
    const message = (
      (document.getElementById("compose-input") as HTMLTextAreaElement | null)?.value ?? ""
    ).trim();
    const hasContent = message !== "" || this.stagedFiles.length > 0;

    btn.disabled = !hasTarget || !hasContent;
    this._updateCrossCheckboxState();
    this._applyUs1Indicators(AppState.isUs1Connected());
  }

  _resetSendTargetsOnShow(): void {
    const sendAi1 = document.getElementById("send-ai1") as HTMLInputElement | null;
    const sendAi2 = document.getElementById("send-ai2") as HTMLInputElement | null;
    const sendUs1 = document.getElementById("send-us1") as HTMLInputElement | null;
    const cross = document.getElementById("send-cross") as HTMLInputElement | null;

    const ai1CanSend = AppState.getAccountForSlot("ai1") !== null;
    const ai2CanSend = AppState.getAccountForSlot("ai2") !== null;
    const us1CanSend = AppState.hasUs1Identity();

    if (sendAi1) {
      sendAi1.checked = ai1CanSend;
    }
    if (sendAi2) {
      sendAi2.checked = ai2CanSend;
    }
    if (sendUs1) {
      sendUs1.checked = !ai1CanSend && !ai2CanSend && us1CanSend;
    }
    if (cross) {
      cross.checked = false;
    }

    this._updateCrossCheckboxState();
  }

  _updateCrossCheckboxState(): void {
    const cross = document.getElementById("send-cross") as HTMLInputElement | null;
    const sendAi1 = document.getElementById("send-ai1") as HTMLInputElement | null;
    const sendAi2 = document.getElementById("send-ai2") as HTMLInputElement | null;

    if (cross && sendAi1 && sendAi2) {
      const bothChecked = sendAi1.checked && sendAi2.checked;
      cross.disabled = !bothChecked;
      if (!bothChecked) cross.checked = false;
    }
  }

  _getAssignedAIs(): string[] {
    const list: string[] = [];
    if (AppState.getAccountForSlot("ai1") !== null) list.push("ai1");
    if (AppState.getAccountForSlot("ai2") !== null) list.push("ai2");
    return list;
  }

  _getConversationFolder(provider: string): string {
    const select = document.getElementById(`conversation-${provider}`) as HTMLSelectElement | null;
    if (!select) {
      return "";
    }
    const opt = select.selectedOptions[0];
    if (!opt || opt.value === "new") {
      return "";
    }
    return opt.dataset["folder"] ?? "";
  }

  onShow(): void {
    this.refreshUploads();
    this.updateConnectionStates();
    this._syncAnalyzeSceneVisibility();
    this._resetSendTargetsOnShow();
    this.updateSendButtonState();
    void this._syncUs1Messages({ showRoomPackages: true });
    this._startUs1Polling();
  }

  onHide(): void {
    this._setAnalyzeSceneActiveView(null);
    this._analyzeSceneSelection = null;
    this._stopUs1Polling();
    this._stopCaptureStatusPolling();
    if (this._cameraPanelOpen === true) {
      void this._setAndroidCameraPanelOpen(false, { notify: false });
    }

    try {
      this._persistDraft();
    } catch (_) {}

    if (this.beforeUnloadHandler) {
      window.removeEventListener("beforeunload", this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
  }
}

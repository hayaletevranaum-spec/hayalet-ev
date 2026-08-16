// NOTE: Server lifecycle is delegated to provider adapters.
// NOTE: To add a provider, implement AssistantProviderAdapter and register in provider-registry.ts.
import type { TranslationParams } from "@shared/i18n.js";
import { LogCategory, LogLevel } from "@shared/logging-core";
import { ASSISTANT_TIMEOUTS } from "@timeouts";
import type { WebviewTag } from "electron";
import { formatErrorWithDetail } from "../../../../shared/i18n/error-detail.js";
import { getMimeTypeFromPath } from "../../constants/index.js";
import { Logger } from "../../modules/logger/index.js";
import { FileManager } from "../../modules/file-manager.js";
import { AppI18n } from "../../modules/i18n/index.js";
import { resolveIpcErrorMessage } from "../../modules/ipc-errors.js";
import { SettingsManager } from "../../modules/settings-manager.js";
import { AppState } from "../../modules/app-state.js";
import { dispatchInternalSlotBridge } from "../../modules/commands/slot-bridge-runtime.js";
import { SlotController, SlotState } from "../../modules/slot-controller.js";
import { TrafficManager } from "../../modules/traffic-manager.js";
import { ThemeManager, type ThemeId } from "../../ui/theme/index.js";
import { notifyUser } from "../../ui/user-notification.js";
import {
  buildInlineThemeSyncScript,
  isOpencodeUiThemeHost,
} from "../../ui/theme/theme-host-sync.js";
import {
  type InlineStatusOverlayState,
  type InlineStatusOverlayController,
  type ManagedOverlayController,
} from "../../ui/overlay-system.js";
import {
  createSharedAssistantToolOverlayController,
  createSharedWebviewStatusOverlayController,
} from "../../ui/overlay-presets.js";
import { isSceneUiMode } from "../../ui/ui-mode.js";
import { shellT } from "../../app/shell-i18n.js";
import {
  registerAssistantDeliveryHandler,
  type AssistantDeliveryRequest,
  type AssistantDeliveryResult,
} from "../../modules/assistant-delivery.js";
import { ProviderRegistry } from "../../modules/webview/provider-registry.js";
import type { Account, AppSettings } from "@shared/settings.js";
import {
  ASSISTANT_SLOT_SETTINGS_KEY,
  isAssistantAccountsSettingsPath,
  isAssistantSlotSettingsPath,
} from "@shared/settings.js";
import type {
  ConnectButtonState,
  WebviewElement,
  SlotStateInfo,
  AssistantTrafficState,
  AssistantProviderAdapter,
} from "@shared/assistant.js";
import { AssistantProviderRegistry } from "./provider-registry.js";
import type { OverlayStage } from "./overlay-stage.js";
import {
  type AssistantRuntimeMode,
  readAssistantRuntimeState,
  syncAssistantRuntimeDefaults,
  updateAssistantRuntimeState,
} from "./assistant-runtime.js";
import { detectSystemActiveServerStatus } from "./system-server-control.js";
import { toggleAssistantConnection } from "./connection-lifecycle.js";
import { updateAssistantConnectionUI } from "./connection-ui.js";
import { CharacterOverlay } from "./character-overlay.js";
import { MemoryOverlay } from "./memory-overlay.js";
import {
  handleOpencodeActionButtonClick,
  openOpencodeSettingsModal,
  refreshOpencodeDoctorStatus,
} from "./opencode-doctor.js";
import { resolveOpencodeUiDbPath } from "./opencode-preferences.js";
import { bindAssistantBasicEvents } from "./event-bindings.js";
import { populateAssistantProviderSelect } from "./provider-select.js";
import {
  buildScenarioProgressSummary,
  buildScenarioStatusCounts,
  filterScenarioDisplayRows,
  getScenarioCommandLabel,
  getScenarioTitleLabel,
  type ScenarioStatusFilter,
} from "../shared/provider-test-presentation.js";
import {
  bindAssistantPrimaryWebviewEvents,
  bindAssistantWebviewIpcEvents,
  sendTranscriptIngressToAssistantWebview,
} from "./webview-bindings.js";
import { onTranscriptIngress } from "../../modules/transcript/electron-client.js";
import type { TranscriptIngressPayload } from "../../../types/transcript.js";
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
} from "../../scene-editor/index.js";
import {
  buildSceneCharacterRoster,
  resolveSceneAvatarSource,
} from "../../scene/characters/index.js";
import type { SceneClickableThemeDefinition } from "../../scene/schema.js";
import type { SceneLayoutConfig } from "../../scene/layout/index.js";
import {
  getSceneBackNodeForView,
  getSceneObjectNodesForView,
  resolveSceneNodeLabelText,
} from "../../scene/layout/index.js";
import {
  applyConnectButtonState,
  updateServerStatusView,
  updateTrafficStatusView,
} from "./view-helpers.js";
import {
  applySceneAlphaWindowBoundsToTarget,
  clearSceneAlphaWindowFrameVariables,
} from "../../scene/alpha-window.js";
import { dispatchSceneAction } from "../../scene/action-dispatcher.js";
import { navigateToScenePage, openSceneSettingsPanel } from "../../scene/navigation.js";
import { getCoverSceneProjectionFromElement } from "../../scene/projection.js";
import { renderSceneBackLayer } from "../../scene/renderers/back-layer.js";
import { renderSceneCharacterLayer } from "../../scene/renderers/character-layer.js";
import { renderSceneObjectLayer } from "../../scene/renderers/object-layer.js";
import { syncSceneViewRuntime } from "../../scene/runtime.js";
import {
  getSceneRoomBackgroundSrc,
  getSceneRoomViewPanelArtSrc,
  getSceneRoomViewPanelTransparentWindow,
  SceneThemeManager,
} from "../../scene-system/index.js";
import type {
  ProviderScenarioCommandReport,
  ProviderScenarioProgressEvent,
  ProviderTestProgressEvent,
  ProviderTestSuite,
} from "@shared/provider.js";
interface ScenarioPanelState {
  scenarioId: string;
  providerName: string;
  phase: "launcher" | "running" | "completed";
  filter: ScenarioStatusFilter;
  runId: string | null;
  totalCommandCount: number | null;
  commands: ProviderScenarioCommandReport[];
  message: string;
  suite: ProviderTestSuite | null;
}

const ASSISTANT_CUSTOM_AVATAR_RELATIVE_PATH = "data/shared/assistant.png";
const ASSISTANT_DEFAULT_AVATAR_PATH = "src/assets/opencode.png";
function getAssistantCustomAvatarPath(): string {
  const dataDir = FileManager.getPath("data");
  if (dataDir === "") {
    return ASSISTANT_CUSTOM_AVATAR_RELATIVE_PATH;
  }
  const normalized = dataDir.replace(/[\\/]+$/g, "");
  return `${normalized}/shared/assistant.png`;
}

function getFirstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = value?.trim() ?? "";
    if (normalized !== "") {
      return normalized;
    }
  }

  return null;
}

function toHeadLabel(label: string): string {
  const compact = label.replace(/\s+/g, "").trim().toUpperCase();
  const head = compact.slice(0, 2);
  return head === "" ? "?" : head;
}

function assistantT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`shell.assistant.${key}`, params);
}

function assistantError(key: string, detail?: unknown, params?: TranslationParams): string {
  return formatErrorWithDetail(assistantT(`errors.${key}`, params), detail);
}

function formatAssistantScenarioStatusLabel(status: string): string {
  switch (status) {
    case "pass":
    case "fail":
    case "warning":
    case "skip":
    case "running":
      return assistantT(`scenarioPanel.status.${status}`);
    default:
      return status;
  }
}

function buildAssistantScenarioCompletionMessage(input: {
  passed?: number;
  totalTests?: number;
  commands?: Array<Pick<ProviderScenarioCommandReport, "status">>;
  aborted?: boolean;
  abortReason?: string;
}): string {
  if (input.aborted === true) {
    return input.abortReason?.trim() !== "" && input.abortReason !== undefined
      ? input.abortReason
      : assistantT("scenarioPanel.completedAborted");
  }

  const fallbackCommands = input.commands ?? [];
  const passed =
    typeof input.passed === "number"
      ? input.passed
      : fallbackCommands.filter((command) => command.status === "pass").length;
  const totalTests =
    typeof input.totalTests === "number" ? input.totalTests : fallbackCommands.length;

  if (totalTests <= 0) {
    return assistantT("scenarioPanel.completedGeneric");
  }

  return assistantT("scenarioPanel.completedWithCounts", {
    passed,
    total: totalTests,
  });
}

export class AssistantController {
  _unsubSettings: (() => void) | null;
  _unsubSlot: (() => void) | null;
  _unsubTraffic: (() => void) | null;
  _unsubAppState: (() => void) | null;
  _unsubI18n: (() => void) | null;
  _unsubTheme: (() => void) | null;
  _isServerRunning: boolean;
  _systemServerPort: number | null;
  _activeAdapter: AssistantProviderAdapter | null;
  _disabledMcpServers: Set<string>;
  _opencodeUrlSaveTimer: ReturnType<typeof setTimeout> | null;
  _lastSavedOpencodeUrl: string | null;
  _connectAbortController: AbortController | null;
  _connectFlowActive: boolean;
  _connectOverlayStage: OverlayStage | null;
  _providerToolsReady: boolean;
  providerSelect: HTMLSelectElement | null;
  connectBtn: HTMLButtonElement | null;
  resumeLastSessionCheckbox: HTMLInputElement | null;
  keepServersOnAppCloseCheckbox: HTMLInputElement | null;
  catchCommandsCheckbox: HTMLInputElement | null;
  devtoolsBtn: HTMLButtonElement | null;
  testBtn: HTMLButtonElement | null;
  urlDisplay: HTMLElement | null;
  statusDot: HTMLElement | null;
  statusText: HTMLElement | null;
  opencodeIndicator: HTMLElement | null;
  opencodeIndicatorDot: HTMLElement | null;
  opencodeIndicatorText: HTMLElement | null;
  opencodeActionBtn: HTMLButtonElement | null;
  opencodeSettingsBtn: HTMLButtonElement | null;
  characterOverlay: CharacterOverlay;
  memoryOverlay: MemoryOverlay;
  webviewStatusOverlayController: InlineStatusOverlayController | null;
  identityModalController: ManagedOverlayController | null;
  memoryBtn: HTMLButtonElement | null;
  testPanelOverlay: HTMLElement | null;
  testPanel: HTMLElement | null;
  testPanelController: ManagedOverlayController | null;
  scenarioPanelState: ScenarioPanelState | null;
  providerTestProgressHandler: ((event: ProviderTestProgressEvent) => void) | null;
  _assistantSceneScreenOpen: boolean;
  _assistantSceneDebugEnabled: boolean;
  private readonly _assistantSceneSession = createSceneDebugRuntimeSession("assistant");
  _assistantSceneEditor: SceneLayoutEditor | null;
  _assistantSceneSelection: SceneLayoutEditorSelection;
  _assistantSceneResizeObserver: ResizeObserver | null;
  _assistantSceneCharacterRenderToken: number;
  _assistantSceneThemeUnsub: (() => void) | null;
  _assistantSceneAssetDraftUnsub: (() => void) | null;
  _offTranscriptIngress: (() => void) | null;
  _pendingTranscriptIngress: TranscriptIngressPayload[];

  get _assistantSceneLayout(): SceneLayoutConfig {
    return this._assistantSceneSession.getSceneLayout();
  }

  set _assistantSceneLayout(sceneLayout: SceneLayoutConfig) {
    this._assistantSceneSession.setSceneLayout(sceneLayout);
  }

  get _assistantSceneClickableTheme(): SceneClickableThemeDefinition {
    return this._assistantSceneSession.getSceneClickableTheme();
  }

  set _assistantSceneClickableTheme(sceneClickableTheme: SceneClickableThemeDefinition) {
    this._assistantSceneSession.setSceneClickableTheme(sceneClickableTheme);
  }

  _isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  _isProviderOption(value: unknown): value is { id: string; name: string } {
    return (
      this._isRecord(value) && typeof value["id"] === "string" && typeof value["name"] === "string"
    );
  }

  constructor() {
    this._unsubSettings = null;
    this._unsubSlot = null;
    this._unsubTraffic = null;
    this._unsubAppState = null;
    this._unsubI18n = null;
    this._unsubTheme = null;
    this._isServerRunning = false;
    this._systemServerPort = null;
    this._activeAdapter = null;
    this._disabledMcpServers = new Set();
    this._opencodeUrlSaveTimer = null;
    this._lastSavedOpencodeUrl = null;
    this._connectAbortController = null;
    this._connectFlowActive = false;
    this._connectOverlayStage = null;
    this._providerToolsReady = true;
    AppState.setAssistantToolsReady(true);
    this.providerSelect = null;
    this.connectBtn = null;
    this.resumeLastSessionCheckbox = null;
    this.keepServersOnAppCloseCheckbox = null;
    this.catchCommandsCheckbox = null;
    this.devtoolsBtn = null;
    this.testBtn = null;
    this.urlDisplay = null;
    this.statusDot = null;
    this.statusText = null;
    this.opencodeIndicator = null;
    this.opencodeIndicatorDot = null;
    this.opencodeIndicatorText = null;
    this.opencodeActionBtn = null;
    this.opencodeSettingsBtn = null;
    this.characterOverlay = new CharacterOverlay();
    this.memoryOverlay = new MemoryOverlay();
    this.webviewStatusOverlayController = null;
    this.identityModalController = null;
    this.memoryBtn = null;
    this.testPanelOverlay = null;
    this.testPanel = null;
    this.testPanelController = null;
    this.scenarioPanelState = null;
    this.providerTestProgressHandler = null;
    this._assistantSceneScreenOpen = false;
    this._assistantSceneDebugEnabled = false;
    this._assistantSceneEditor = null;
    this._assistantSceneSelection = null;
    this._assistantSceneResizeObserver = null;
    this._assistantSceneCharacterRenderToken = 0;
    this._assistantSceneThemeUnsub = null;
    this._assistantSceneAssetDraftUnsub = null;
    this._offTranscriptIngress = null;
    this._pendingTranscriptIngress = [];
  }

  async init(): Promise<void> {
    await SettingsManager.load();

    this.providerSelect = document.getElementById(
      "assistant-provider-select"
    ) as HTMLSelectElement | null;
    this.connectBtn = document.getElementById("assistant-connect-btn") as HTMLButtonElement | null;
    this.resumeLastSessionCheckbox = document.getElementById(
      "assistant-resume-last-session"
    ) as HTMLInputElement | null;
    this.keepServersOnAppCloseCheckbox = document.getElementById(
      "assistant-keep-servers-on-close"
    ) as HTMLInputElement | null;
    this.catchCommandsCheckbox = document.getElementById(
      "assistant-catch-commands-check"
    ) as HTMLInputElement | null;
    this.devtoolsBtn = document.getElementById(
      "assistant-devtools-btn"
    ) as HTMLButtonElement | null;
    this.testBtn = document.getElementById("ai0-test-btn") as HTMLButtonElement | null;
    this.urlDisplay = document.getElementById("assistant-url-display");
    this.statusDot = document.getElementById("assistant-status-dot");
    this.statusText = document.getElementById("assistant-status-text");
    this.opencodeIndicator = document.getElementById("assistant-opencode-indicator");
    this.opencodeIndicatorDot = document.getElementById("assistant-opencode-indicator-dot");
    this.opencodeIndicatorText = document.getElementById("assistant-opencode-indicator-text");
    this.opencodeActionBtn = document.getElementById(
      "assistant-opencode-action-btn"
    ) as HTMLButtonElement | null;
    this.opencodeSettingsBtn = document.getElementById(
      "assistant-opencode-settings-btn"
    ) as HTMLButtonElement | null;
    this._assistantSceneDebugEnabled = applySceneDebugFlag();
    this._assistantSceneSession.load(this._assistantSceneDebugEnabled);

    this._populateProviderSelect();
    this._initActiveAdapter();
    this._syncTogglePreferencesFromSettings();
    await this._syncAssistantRuntimeDefaults();
    await this._syncIdentityCard();
    const runtimeState = await readAssistantRuntimeState();
    this._setupAssistantSceneDebug();
    this._syncAssistantSceneAssets();
    this._renderAssistantScene();
    this._syncAssistantSceneVisibility();
    this._observeAssistantSceneLayout();
    this._assistantSceneThemeUnsub ??= SceneThemeManager.onChange(() => {
      this._assistantSceneSession.reloadFromActiveTheme(this._assistantSceneDebugEnabled);
      this._assistantSceneSelection = null;
      this._syncAssistantSceneVisibility();
    });
    this._assistantSceneAssetDraftUnsub ??= subscribeSceneThemeAssetDraft(() => {
      this._syncAssistantSceneVisibility();
    });

    // NOTE: Attach the preload to the AI0 webview before loading the URL for the IPC bridge.
    const ai0Wv = document.getElementById("ai0-webview");
    const electronApi = window.electronAPI;
    if (ai0Wv !== null && ai0Wv.getAttribute("preload") === null) {
      try {
        if (electronApi === undefined) {
          return;
        }
        const pp = await electronApi.getPreloadPath("ai0");
        if (pp !== "") ai0Wv.setAttribute("preload", pp);
      } catch (_) {}
    }

    this.memoryBtn = document.getElementById("assistant-memory-btn") as HTMLButtonElement | null;
    this.testPanelOverlay = document.getElementById("ai0-test-side-panel");
    this.testPanel = document.getElementById("ai0-test-panel-body");
    const ai0WebviewOverlay = document.getElementById("ai0-webview-overlay");
    const ai0WebviewMount = document.getElementById("ai0-webview-mount");
    const identityOverlay = document.getElementById("assistant-identity-modal");
    if (
      ai0WebviewOverlay instanceof HTMLElement &&
      ai0WebviewMount instanceof HTMLElement &&
      this.webviewStatusOverlayController === null
    ) {
      this.webviewStatusOverlayController = createSharedWebviewStatusOverlayController({
        id: "ai0-webview-overlay",
        element: ai0WebviewOverlay,
        blockedTarget: ai0WebviewMount,
      });
    }
    if (identityOverlay instanceof HTMLElement && this.identityModalController === null) {
      this.identityModalController = createSharedAssistantToolOverlayController({
        id: "assistant-identity-modal",
        element: identityOverlay,
      });
    }
    if (this.testPanelOverlay instanceof HTMLElement && this.testPanelController === null) {
      this.testPanelController = createSharedAssistantToolOverlayController({
        id: "ai0-test-side-panel",
        element: this.testPanelOverlay,
        onAfterClose: () => {
          this.scenarioPanelState = null;
          this.testPanel?.replaceChildren();
        },
      });
    }
    if (
      this.testPanelOverlay instanceof HTMLElement &&
      this.testPanelOverlay.dataset["assistantTestOverlayBound"] !== "true"
    ) {
      this.testPanelOverlay.addEventListener("click", (event) => {
        if (event.target === this.testPanelOverlay) {
          this._closeTestPanel();
        }
      });
      this.testPanelOverlay.dataset["assistantTestOverlayBound"] = "true";
    }
    this.characterOverlay.init();
    this.memoryOverlay.init();
    this._setupEventListeners(runtimeState?.desiredMode ?? "soft");
    this._refreshOpencodeDoctorStatus();
    this._unsubSettings = SettingsManager.subscribe(
      ({ settings, changedPaths }: { settings: unknown; changedPaths: string[] }) => {
        this._onSettingsChange(settings, changedPaths);
      }
    );

    this._unsubSlot = SlotController.subscribe((payload: unknown) => {
      const p = payload as { slot?: string; event?: string };
      if (p.slot === "ai0") {
        this._updateConnectionUI();
      }
    });

    this._unsubAppState = AppState.subscribe(() => {
      void this._syncIdentityCard();
    });

    this._unsubTheme ??= ThemeManager.onChange((theme) => {
      this._syncOpencodeUiTheme(theme);
    });

    this._unsubI18n ??= AppI18n.subscribe(() => {
      this._updateConnectionUI(true);
      this._refreshOpencodeDoctorStatus();
      this.memoryOverlay.onLocaleChanged();
      this._renderAssistantScene();
      this._assistantSceneEditor?.refresh();
      if (this.scenarioPanelState !== null) {
        this._syncScenarioPanelLocale();
        this._renderTestPanel();
      }
    });

    this._unsubTraffic = TrafficManager.onUpdate(
      (snapshot: { ai0?: unknown; [key: string]: unknown }) => {
        if (snapshot.ai0 !== undefined) {
          this._updateTrafficUI(snapshot.ai0);
        }
      }
    );

    this._loadDisabledMcpServers();
    registerAssistantDeliveryHandler(this._handleDeliveryRequest.bind(this));
    this._offTranscriptIngress ??= onTranscriptIngress((payload) => {
      this._handleTranscriptIngress(payload);
    });

    this._updateConnectionUI();
    Logger.debug(LogCategory.ASSISTANT_CORE, assistantT("logs.controllerInitialized"));
  }

  _syncTogglePreferencesFromSettings(): void {
    const settings = SettingsManager.getSnapshot() as AppSettings | null;

    if (this.resumeLastSessionCheckbox) {
      const resumeValue = settings?.assistants?.resumeLastSession;
      this.resumeLastSessionCheckbox.checked =
        typeof resumeValue === "boolean" ? resumeValue : true;
    }

    if (this.keepServersOnAppCloseCheckbox) {
      const keepServersValue = settings?.assistants?.keepServersOnAppClose;
      this.keepServersOnAppCloseCheckbox.checked = keepServersValue === true;
    }

    if (this.catchCommandsCheckbox) {
      const catchCommandsValue = settings?.assistantSlot?.catchCommands;
      this.catchCommandsCheckbox.checked = catchCommandsValue === true;
    }
  }

  _refreshOpencodeDoctorStatus(): void {
    refreshOpencodeDoctorStatus({
      indicator: this.opencodeIndicator,
      indicatorDot: this.opencodeIndicatorDot,
      indicatorText: this.opencodeIndicatorText,
      actionButton: this.opencodeActionBtn,
    });
  }

  async _handleOpencodeActionClick(): Promise<void> {
    await handleOpencodeActionButtonClick({
      indicator: this.opencodeIndicator,
      indicatorDot: this.opencodeIndicatorDot,
      indicatorText: this.opencodeIndicatorText,
      actionButton: this.opencodeActionBtn,
    });
  }

  async _openOpencodeSettingsModal(): Promise<void> {
    await openOpencodeSettingsModal({
      onSaved: () => {
        this._refreshOpencodeDoctorStatus();
      },
    });
  }

  async _syncIdentityCard(): Promise<void> {
    const nicknameEl = document.getElementById("assistant-nickname");
    if (nicknameEl != null) {
      nicknameEl.textContent = AppState.getNickname("ai0");
    }

    await this._updateAvatar(AppState.getAvatar("ai0"));
    this._updateIdentityStatusDot();
    this._renderAssistantScene();
  }

  _syncAssistantSceneAssets(): void {
    const background = document.getElementById(
      "assistant-scene-background"
    ) as HTMLImageElement | null;
    const screenArt = document.getElementById(
      "assistant-scene-screen-art"
    ) as HTMLImageElement | null;

    if (background !== null) {
      background.src = getSceneRoomBackgroundSrc("assistant");
      background.alt = "";
    }

    if (screenArt !== null) {
      screenArt.src = getSceneRoomViewPanelArtSrc("assistant", "primary") ?? "";
      screenArt.alt = "";
    }
  }

  _syncAssistantSceneTransparentWindow(): void {
    const screenView = document.getElementById("assistant-scene-screen-view");
    const container = document.querySelector(".assistant-container");
    if (!(screenView instanceof HTMLElement) || !(container instanceof HTMLElement)) {
      return;
    }

    if (!isSceneUiMode() || !this._assistantSceneScreenOpen) {
      clearSceneAlphaWindowFrameVariables(container, "assistant-scene");
      return;
    }

    applySceneAlphaWindowBoundsToTarget({
      bounds: getSceneRoomViewPanelTransparentWindow("assistant", "primary"),
      container: screenView,
      target: container,
      variablePrefix: "assistant-scene",
    });
  }

  _setupAssistantSceneDebug(): void {
    const editorHost = document.getElementById("assistant-scene-editor-host");
    if (!(editorHost instanceof HTMLElement)) {
      this._assistantSceneEditor = null;
      return;
    }

    if (!this._assistantSceneDebugEnabled) {
      editorHost.replaceChildren();
      this._assistantSceneEditor = null;
      return;
    }

    const assetBindings = createSceneLayoutEditorAssetBindings({
      roomId: "assistant",
      getSceneLayout: (): SceneLayoutConfig => this._assistantSceneLayout,
      getSelection: (): SceneLayoutEditorSelection => this._assistantSceneSelection,
      onAfterChange: (): void => {
        this._syncAssistantSceneAssets();
        this._syncAssistantSceneVisibility();
      },
    });

    this._assistantSceneEditor = new SceneLayoutEditor(editorHost, {
      isActive: (): boolean => this._isAssistantSceneDebugActive(),
      getSceneLayout: (): SceneLayoutConfig => this._assistantSceneLayout,
      getSceneClickableTheme: (): SceneClickableThemeDefinition =>
        this._assistantSceneClickableTheme,
      getSelection: (): SceneLayoutEditorSelection => this._assistantSceneSelection,
      getRoomOptions: (): Array<{ id: string; label: string }> => getSceneDebugRoomOptions(shellT),
      getActiveRoomId: (): string => "assistant",
      setSelection: (selection): void => {
        this._assistantSceneSelection = selection;
        this._assistantSceneEditor?.refresh();
        this._renderAssistantScene();
      },
      navigateToRoom: (roomId: string): void => {
        this._navigateToSceneDebugRoom(roomId);
      },
      updateObject: (id, updater): void => {
        this._assistantSceneSession.updateObject(id, updater);
        this._syncAssistantSceneVisibility();
        this._renderAssistantScene();
        this._assistantSceneEditor?.refresh();
      },
      updateBack: (id, updater): void => {
        this._assistantSceneSession.updateBack(id, updater);
        this._syncAssistantSceneVisibility();
        this._assistantSceneEditor?.refresh();
      },
      updateCharacter: (id, updater): void => {
        this._assistantSceneSession.updateCharacter(id, updater);
        this._renderAssistantScene();
        this._assistantSceneEditor?.refresh();
      },
      resetDraft: (): void => {
        this._assistantSceneLayout = this._assistantSceneSession.resetSceneLayoutDraft();
        this._assistantSceneSelection = null;
        this._renderAssistantScene();
        this._assistantSceneEditor?.refresh();
      },
      copySceneLayout: async (): Promise<void> => {
        try {
          await this._assistantSceneSession.copySceneLayout();
        } catch {
          console.info("Assistant scene layout copy failed.");
        }
      },
      saveSceneLayoutToSource: async (): Promise<void> => {
        await this._assistantSceneSession.saveSceneLayoutToSource();
      },
      updateSceneClickableTheme: (updater): void => {
        this._assistantSceneClickableTheme =
          this._assistantSceneSession.updateSceneClickableTheme(updater);
        this._syncAssistantSceneVisibility();
        this._renderAssistantScene();
        this._assistantSceneEditor?.refresh();
      },
      resetSceneClickableThemeDraft: (): void => {
        this._assistantSceneClickableTheme =
          this._assistantSceneSession.resetSceneClickableThemeDraft();
        this._syncAssistantSceneVisibility();
        this._renderAssistantScene();
        this._assistantSceneEditor?.refresh();
      },
      copySceneClickableTheme: async (): Promise<void> => {
        try {
          await this._assistantSceneSession.copySceneClickableTheme();
        } catch {
          console.info("Assistant scene clickable theme copy failed.");
        }
      },
      saveSceneClickableThemeToSource: async (): Promise<void> => {
        await this._assistantSceneSession.saveSceneClickableThemeToSource();
      },
      ...assetBindings,
    });
    this._assistantSceneEditor.refresh();
  }

  _observeAssistantSceneLayout(): void {
    const sceneRoot = document.getElementById("assistant-scene-root");
    if (!(sceneRoot instanceof HTMLElement) || typeof ResizeObserver === "undefined") {
      return;
    }

    this._assistantSceneResizeObserver?.disconnect();
    this._assistantSceneResizeObserver = new ResizeObserver(() => {
      if (!isSceneUiMode()) {
        return;
      }
      this._renderAssistantScene();
      this._assistantSceneEditor?.refresh();
    });
    this._assistantSceneResizeObserver.observe(sceneRoot);
  }

  _renderAssistantScene(): void {
    this._renderAssistantSceneHotspots();
    void this._renderAssistantSceneCharacter();
  }

  _renderAssistantSceneHotspots(): void {
    const hotspotLayer = document.getElementById("assistant-scene-hotspots");
    if (!(hotspotLayer instanceof HTMLElement)) {
      return;
    }

    renderSceneObjectLayer({
      layer: hotspotLayer,
      nodes: getSceneObjectNodesForView(this._assistantSceneLayout),
      themeDefaults: this._assistantSceneClickableTheme.object,
      projection: this._getAssistantSceneProjection(),
      cssVarPrefix: "assistant-scene-hotspot",
      classNames: {
        item: "assistant-scene__hotspot-item",
        button: "assistant-scene__hotspot",
        label: "assistant-scene__hotspot-label",
      },
      selection: this._assistantSceneSelection,
      clickableLabels: true,
      resolveLabel: (node) => resolveSceneNodeLabelText(node, shellT),
      onActivate: (node) => {
        this._handleAssistantSceneObject(node.id);
      },
    });
  }

  async _renderAssistantSceneCharacter(): Promise<void> {
    const characterLayer = document.getElementById("assistant-scene-characters");
    if (!(characterLayer instanceof HTMLElement)) {
      return;
    }

    const characters = buildSceneCharacterRoster(
      this._assistantSceneLayout.characters,
      this._assistantSceneLayout.characterRosterPreset
    );
    if (characters.length === 0) {
      characterLayer.replaceChildren();
      return;
    }

    const renderToken = ++this._assistantSceneCharacterRenderToken;
    await renderSceneCharacterLayer({
      layer: characterLayer,
      characters,
      projection: this._getAssistantSceneProjection(),
      sceneDebugEnabled: this._assistantSceneDebugEnabled,
      interactive: this._assistantSceneEditor !== null,
      selectedCharacterId:
        this._assistantSceneSelection?.kind === "character"
          ? this._assistantSceneSelection.id
          : null,
      isStale: () => renderToken !== this._assistantSceneCharacterRenderToken,
      getDepthScale: (depth) => this._getAssistantSceneDepthScale(depth),
      resolveAvatarSource: async (character) => {
        const avatarInput =
          character.slot === "ai0"
            ? getFirstNonEmpty(character.avatarSource, this._getAssistantSceneAvatarSource())
            : character.avatarSource;
        return await resolveSceneAvatarSource(avatarInput);
      },
      getNodeClassName: (character) =>
        `entrance-scene__character assistant-scene__character is-${character.state}`,
      getNodeId: (character) => (character.slot === "ai0" ? "assistant-scene-ai0-character" : null),
      getFallbackHeadLabel: (character) => character.headLabel ?? toHeadLabel(character.label),
      onActivate: (character) => {
        if (this._assistantSceneEditor === null) {
          return;
        }
        this._assistantSceneSelection = { kind: "character", id: character.anchorId };
        this._assistantSceneEditor.refresh();
        this._renderAssistantScene();
      },
    });
    this._syncAssistantSceneCharacterState();
  }

  _getAssistantSceneAvatarSource(): string | null {
    const assistantPresence = AppState.getEntityPresence("ai0");
    const customAvatarPath = getAssistantCustomAvatarPath();

    return getFirstNonEmpty(
      assistantPresence.avatar,
      customAvatarPath,
      ASSISTANT_DEFAULT_AVATAR_PATH
    );
  }

  _getAssistantSceneProjection(): {
    offsetX: number;
    offsetY: number;
    scale: number;
  } {
    const sceneRoot = document.getElementById("assistant-scene-root");
    return getCoverSceneProjectionFromElement(
      sceneRoot instanceof HTMLElement ? sceneRoot : null,
      this._assistantSceneLayout.referenceSize
    );
  }

  _getAssistantSceneDepthScale(depth: number): number {
    const normalizedDepth = Math.max(1, Number.isFinite(depth) ? depth : 1);
    const scaled = 1 - (normalizedDepth - 1) * 0.02;
    return Number(Math.max(0.75, scaled).toFixed(3));
  }

  _persistAssistantSceneLayoutDraft(): void {
    this._assistantSceneSession.saveSceneLayoutDraft();
  }

  _isAssistantSceneDebugActive(): boolean {
    return isSceneDebugRoomActive("assistant");
  }

  _setAssistantSceneScreenOpen(open: boolean): void {
    this._assistantSceneScreenOpen = open;
    this._syncAssistantSceneVisibility();
  }

  _syncAssistantSceneVisibility(): void {
    const sceneRoot = document.getElementById("assistant-scene-root");
    const screenView = document.getElementById("assistant-scene-screen-view");
    const container = document.querySelector(".assistant-container");
    const sceneActive = isSceneUiMode();

    syncSceneViewRuntime({
      elements: {
        root: sceneRoot instanceof HTMLElement ? sceneRoot : null,
        view: screenView instanceof HTMLElement ? screenView : null,
        room: container instanceof HTMLElement ? container : null,
      },
      state: {
        sceneActive,
        viewOpen: this._assistantSceneScreenOpen,
        roomOpenClass: "is-scene-screen-open",
      },
    });

    if (screenView instanceof HTMLElement) {
      renderSceneBackLayer({
        host: screenView,
        node:
          sceneActive && this._assistantSceneScreenOpen
            ? getSceneBackNodeForView(this._assistantSceneLayout, "primary")
            : null,
        themeDefaults: this._assistantSceneClickableTheme.back,
        projection: this._getAssistantSceneProjection(),
        resolveLabel: (node) => resolveSceneNodeLabelText(node, shellT),
        onActivate: (node) => {
          if (this._assistantSceneEditor !== null) {
            this._assistantSceneSelection = { kind: "back", id: node.id };
            this._assistantSceneEditor.refresh();
            return;
          }

          dispatchSceneAction(node.action, {
            onNavigate: () => {},
            onSettings: () => {},
            onSettingsSceneClose: () => {},
            onScreen: () => {},
            onWhisper: () => {},
            onBack: () => {
              this._setAssistantSceneScreenOpen(false);
            },
          });
        },
      });
    }

    if (!sceneActive) {
      if (container instanceof HTMLElement) {
        clearSceneAlphaWindowFrameVariables(container, "assistant-scene");
      }
      return;
    }

    this._syncAssistantSceneAssets();
    this._syncAssistantSceneTransparentWindow();
    this._renderAssistantScene();
    this._assistantSceneEditor?.refresh();
  }

  _navigateToPage(page: string): void {
    navigateToScenePage(page);
  }

  _navigateToSceneDebugRoom(roomId: string): void {
    this._setAssistantSceneScreenOpen(false);
    openSceneDebugRoom(roomId);
  }

  _syncAssistantSceneCharacterState(): void {
    const sceneCharacter = document.getElementById("assistant-scene-ai0-character");
    if (!(sceneCharacter instanceof HTMLElement)) {
      return;
    }

    sceneCharacter.classList.remove("is-inactive", "is-loading", "is-connected", "is-thinking");

    const slotState = SlotController.getState("ai0") as SlotStateInfo | null;
    const trafficState = TrafficManager.state["ai0"] as AssistantTrafficState | null;
    const status = trafficState?.state?.status;

    if (slotState?.state === SlotState.CONNECTING || status?.loading === "busy") {
      sceneCharacter.classList.add("is-loading");
      return;
    }

    if (slotState?.state === SlotState.CONNECTED && status?.thinking === "busy") {
      sceneCharacter.classList.add("is-thinking");
      return;
    }

    if (slotState?.state === SlotState.CONNECTED || this._isServerRunning) {
      sceneCharacter.classList.add("is-connected");
      return;
    }

    sceneCharacter.classList.add("is-inactive");
  }

  _bindIdentityAction(elementId: string, onActivate: () => void | Promise<void>): void {
    const element = document.getElementById(elementId);
    if (!(element instanceof HTMLElement)) {
      return;
    }

    element.addEventListener("click", () => {
      void onActivate();
    });
    element.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      void onActivate();
    });
  }

  _getIdentityNicknameModalElements(): {
    overlay: HTMLElement | null;
    input: HTMLInputElement | null;
  } {
    return {
      overlay: document.getElementById("assistant-identity-modal"),
      input: document.getElementById(
        "assistant-identity-nickname-input"
      ) as HTMLInputElement | null,
    };
  }

  _openIdentityNicknameModal(): void {
    const { overlay, input } = this._getIdentityNicknameModalElements();
    if (!(overlay instanceof HTMLElement) || !(input instanceof HTMLInputElement)) {
      return;
    }

    input.value = AppState.getNickname("ai0");
    this.identityModalController?.open();

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  _closeIdentityNicknameModal(): void {
    this.identityModalController?.close();
  }

  _setupIdentityNicknameModalEvents(): void {
    const { overlay, input } = this._getIdentityNicknameModalElements();
    const closeBtn = document.getElementById("assistant-identity-modal-close");
    const cancelBtn = document.getElementById("assistant-identity-modal-cancel");
    const saveBtn = document.getElementById("assistant-identity-modal-save");

    closeBtn?.addEventListener("click", () => {
      this._closeIdentityNicknameModal();
    });
    cancelBtn?.addEventListener("click", () => {
      this._closeIdentityNicknameModal();
    });
    saveBtn?.addEventListener("click", () => {
      void this._saveIdentityNicknameFromModal();
    });
    overlay?.addEventListener("click", (event: MouseEvent) => {
      if (event.target === overlay) {
        this._closeIdentityNicknameModal();
      }
    });
    input?.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void this._saveIdentityNicknameFromModal();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        this._closeIdentityNicknameModal();
      }
    });
  }

  async _saveAssistantIdentityPatch(
    patch: Partial<Pick<Account, "nickname" | "avatarPath">>
  ): Promise<boolean> {
    const settings = SettingsManager.getSnapshot() as AppSettings | null;
    const assistantAccounts = Array.isArray(settings?.assistantAccounts)
      ? settings.assistantAccounts
      : [];

    if (settings === null || assistantAccounts.length === 0) {
      return false;
    }

    const nextAccounts = assistantAccounts.map((account) => {
      const nicknameChanged =
        typeof patch.nickname === "string" &&
        patch.nickname !== "" &&
        patch.nickname !== account.nickname;
      const avatarChanged =
        typeof patch.avatarPath === "string" &&
        patch.avatarPath !== "" &&
        patch.avatarPath !== account.avatarPath;

      if (!nicknameChanged && !avatarChanged) {
        return account;
      }

      return {
        ...account,
        ...(nicknameChanged ? { nickname: patch.nickname } : {}),
        ...(avatarChanged ? { avatarPath: patch.avatarPath } : {}),
      };
    });

    const hasChanges = nextAccounts.some((account, index) => {
      return account !== assistantAccounts[index];
    });

    if (!hasChanges) {
      return false;
    }

    await SettingsManager.save({
      ...(settings as Record<string, unknown>),
      assistantAccounts: nextAccounts,
    });
    return true;
  }

  _editIdentityNickname(): void {
    this._openIdentityNicknameModal();
  }

  async _saveIdentityNicknameFromModal(): Promise<void> {
    const { input } = this._getIdentityNicknameModalElements();
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    const currentNickname = AppState.getNickname("ai0");
    const nextNickname = input.value.trim().slice(0, 60);

    if (nextNickname === "") {
      input.focus();
      input.select();
      return;
    }

    if (nextNickname === currentNickname) {
      this._closeIdentityNicknameModal();
      return;
    }

    try {
      const updated = await this._saveAssistantIdentityPatch({ nickname: nextNickname });
      if (updated) {
        Logger.info(LogCategory.ASSISTANT_CORE, assistantT("logs.nicknameUpdated"), {
          nickname: nextNickname,
        });
        notifyUser({
          kind: "success",
          title: assistantT("logs.nicknameUpdated"),
          dedupeKey: "assistant:identity:nickname",
        });
      }

      this._closeIdentityNicknameModal();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.panel(
        LogCategory.ASSISTANT_CORE,
        LogLevel.ERROR,
        assistantT("logs.nicknameUpdateFailed"),
        {
          error: errorMessage,
        }
      );
      notifyUser({
        kind: "error",
        title: assistantT("logs.nicknameUpdateFailed"),
        message: errorMessage,
        dedupeKey: "assistant:identity:nickname",
      });
    }
  }

  async _convertImageToPngBase64(sourceDataUrl: string): Promise<string> {
    return await new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = (): void => {
        const width = image.naturalWidth > 0 ? image.naturalWidth : image.width;
        const height = image.naturalHeight > 0 ? image.naturalHeight : image.height;

        if (width === 0 || height === 0) {
          reject(new Error(assistantT("errors.avatarInvalidDimensions")));
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        if (context === null) {
          reject(new Error(assistantT("errors.avatarCanvasUnavailable")));
          return;
        }

        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        const pngDataUrl = canvas.toDataURL("image/png");
        const base64 = pngDataUrl.split(",")[1] ?? "";

        if (base64 === "") {
          reject(new Error(assistantT("errors.avatarPngGenerationFailed")));
          return;
        }

        resolve(base64);
      };

      image.onerror = (): void => {
        reject(new Error(assistantT("errors.avatarImageLoadFailed")));
      };

      image.src = sourceDataUrl;
    });
  }

  async _editIdentityAvatar(): Promise<void> {
    const electronApi = window.electronAPI;
    if (
      electronApi === undefined ||
      typeof electronApi.showOpenDialog !== "function" ||
      typeof electronApi.readFile !== "function"
    ) {
      return;
    }

    try {
      const selection = await electronApi.showOpenDialog({
        title: assistantT("avatarDialog.title"),
        buttonLabel: assistantT("avatarDialog.buttonLabel"),
        filters: [
          {
            name: assistantT("avatarDialog.filterName"),
            extensions: ["png", "jpg", "jpeg", "gif", "webp"],
          },
        ],
        properties: ["openFile"],
      });

      if (selection.canceled === true || selection.filePaths.length === 0) {
        return;
      }

      const selectedPath = String(selection.filePaths[0] ?? "").trim();
      if (selectedPath === "") {
        return;
      }

      const sourceBase64 = await electronApi.readFile(selectedPath);
      if (typeof sourceBase64 !== "string" || sourceBase64 === "") {
        throw new Error(assistantT("errors.avatarFileReadFailed"));
      }

      const sourceDataUrl = `data:${getMimeTypeFromPath(selectedPath)};base64,${sourceBase64}`;
      const pngBase64 = await this._convertImageToPngBase64(sourceDataUrl);
      await FileManager.ensureDirs("data");
      const customAvatarPath = getAssistantCustomAvatarPath();
      const savedPath = await FileManager.writeFileAtomic(customAvatarPath, pngBase64, "base64");

      if (savedPath === "") {
        throw new Error(assistantT("errors.avatarSaveFailed"));
      }

      const updated = await this._saveAssistantIdentityPatch({
        avatarPath: savedPath,
      });

      if (updated) {
        Logger.info(LogCategory.ASSISTANT_CORE, assistantT("logs.avatarUpdated"), {
          avatarPath: savedPath,
        });
        notifyUser({
          kind: "success",
          title: assistantT("logs.avatarUpdated"),
          dedupeKey: "assistant:identity:avatar",
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.panel(
        LogCategory.ASSISTANT_CORE,
        LogLevel.ERROR,
        assistantT("logs.avatarUpdateFailed"),
        {
          error: errorMessage,
        }
      );
      notifyUser({
        kind: "error",
        title: assistantT("logs.avatarUpdateFailed"),
        message: errorMessage,
        dedupeKey: "assistant:identity:avatar",
      });
    }
  }

  _getCurrentProviderLabel(): string {
    const selectedOption =
      this.providerSelect === null ? null : this.providerSelect.selectedOptions.item(0);
    const selectedProviderText = selectedOption === null ? null : selectedOption.textContent;
    const selectedProviderLabel =
      selectedProviderText === null ? undefined : selectedProviderText.trim();
    if (selectedProviderLabel !== undefined && selectedProviderLabel !== "") {
      return selectedProviderLabel;
    }

    const providerId = this._activeAdapter?.id ?? AppState.getProviderIdForSlot("ai0");
    if (providerId !== null && providerId !== "") {
      const provider = ProviderRegistry.getAssistant(providerId);
      if (this._isProviderOption(provider)) {
        return provider.name;
      }
      return providerId;
    }

    return AppState.getNickname("ai0");
  }

  _updateIdentityStatusDot(): void {
    const dot = document.getElementById("assistant-identity-status-dot");
    if (dot == null) {
      return;
    }

    const slotState = SlotController.getState("ai0") as SlotStateInfo | null;
    const isConnected = slotState?.state === SlotState.CONNECTED || this._isServerRunning;
    dot.classList.toggle("is-connected", isConnected);
  }

  async _updateAvatar(avatarPath: string | null): Promise<void> {
    const avatarElements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-assistant-avatar-target]")
    );
    if (avatarElements.length === 0) {
      return;
    }

    const resetAvatarTarget = (element: HTMLElement): void => {
      element.style.removeProperty("--avatar-image");
      if (element instanceof HTMLImageElement) {
        element.removeAttribute("src");
        return;
      }

      element.innerHTML = "";
    };

    const applyAvatarTarget = (element: HTMLElement, source: string): void => {
      if (element instanceof HTMLImageElement) {
        element.style.removeProperty("--avatar-image");
        element.src = source;
        return;
      }

      element.innerHTML = "";
      element.style.setProperty("--avatar-image", `url(${source})`);
    };

    const electronApi = window.electronAPI;
    if (!electronApi?.readFile) {
      avatarElements.forEach(resetAvatarTarget);
      return;
    }

    const preferredAvatarPath = avatarPath ?? "";
    const customAvatarPath = getAssistantCustomAvatarPath();
    const candidates = [
      preferredAvatarPath !== ASSISTANT_DEFAULT_AVATAR_PATH ? preferredAvatarPath : "",
      customAvatarPath,
      preferredAvatarPath,
      ASSISTANT_DEFAULT_AVATAR_PATH,
    ];
    const uniqueCandidates = candidates.filter(
      (candidate, index, arr) => candidate !== "" && arr.indexOf(candidate) === index
    );

    try {
      const tryLoadCandidate = async (index: number): Promise<boolean> => {
        const candidate = uniqueCandidates[index];
        if (candidate === undefined) {
          return false;
        }

        const imageData = await electronApi.readFile(candidate);
        if (typeof imageData !== "string" || imageData === "") {
          return await tryLoadCandidate(index + 1);
        }

        const mimeType = getMimeTypeFromPath(candidate);
        const avatarSource = `data:${mimeType};base64,${imageData}`;
        avatarElements.forEach((element) => {
          applyAvatarTarget(element, avatarSource);
        });
        return true;
      };

      const loaded = await tryLoadCandidate(0);
      if (!loaded) {
        avatarElements.forEach(resetAvatarTarget);
      }
    } catch (error) {
      Logger.error(LogCategory.ASSISTANT_CORE, assistantT("logs.avatarLoadFailed"), {
        error: error instanceof Error ? error.message : String(error),
      });
      avatarElements.forEach(resetAvatarTarget);
    }
  }

  _isResumeEnabled(options: { forceResume?: boolean } = {}): boolean {
    if (options.forceResume === true) return true;
    if (this.resumeLastSessionCheckbox !== null) {
      return this.resumeLastSessionCheckbox.checked;
    }
    const settings = SettingsManager.getSnapshot() as AppSettings | null;
    return settings?.assistants?.resumeLastSession !== false;
  }

  async _saveResumeTogglePreference(enabled: boolean): Promise<void> {
    try {
      await SettingsManager.set("assistants.resumeLastSession", enabled);
    } catch (error) {
      Logger.warn(LogCategory.ASSISTANT_CORE, assistantT("logs.resumeToggleSaveFailed"), {
        error: (error as Error).message,
      });
    }
  }

  async _saveKeepServersOnClosePreference(enabled: boolean): Promise<void> {
    try {
      await SettingsManager.set("assistants.keepServersOnAppClose", enabled);
    } catch (error) {
      Logger.warn(LogCategory.ASSISTANT_CORE, assistantT("logs.keepServersPreferenceSaveFailed"), {
        error: (error as Error).message,
      });
    }
  }

  async _saveAssistantCatchCommandsPreference(enabled: boolean): Promise<void> {
    try {
      await SettingsManager.set(`${ASSISTANT_SLOT_SETTINGS_KEY}.catchCommands`, enabled);
    } catch (error) {
      Logger.warn(
        LogCategory.ASSISTANT_CORE,
        assistantT("logs.catchCommandsPreferenceSaveFailed"),
        {
          error: (error as Error).message,
        }
      );
    }
  }

  async _saveLastOpencodeUiSessionId(sessionId: string | null): Promise<void> {
    if (sessionId === null || sessionId === "") return;
    const settings = SettingsManager.getSnapshot() as AppSettings | null;
    if (settings?.assistants?.lastOpencodeUiSessionId === sessionId) {
      return;
    }

    try {
      await SettingsManager.set("assistants.lastOpencodeUiSessionId", sessionId);
    } catch (error) {
      Logger.warn(LogCategory.ASSISTANT_CORE, assistantT("logs.opencodeUiSessionSaveFailed"), {
        error: (error as Error).message,
      });
    }
  }

  async _syncAssistantRuntimeDefaults(): Promise<void> {
    await syncAssistantRuntimeDefaults();
  }

  async _updateAssistantRuntimeState(patch: Record<string, unknown>): Promise<void> {
    await updateAssistantRuntimeState(patch);
  }

  _scheduleSaveLastOpencodeUrl(url: string): void {
    if (url === "") return;

    if (this._opencodeUrlSaveTimer) {
      clearTimeout(this._opencodeUrlSaveTimer);
    }

    this._opencodeUrlSaveTimer = setTimeout(() => {
      void this._saveLastOpencodeUrl(url);
    }, ASSISTANT_TIMEOUTS.STAGE_TRANSITION_SHORT);
  }

  async _saveLastOpencodeUrl(url: string): Promise<void> {
    if (url === "") return;
    if (this._lastSavedOpencodeUrl === url) return;

    const settings = SettingsManager.getSnapshot() as AppSettings | null;
    if (settings?.assistants?.lastOpencodeUrl === url) {
      this._lastSavedOpencodeUrl = url;
      return;
    }

    try {
      await SettingsManager.set("assistants.lastOpencodeUrl", url);
      this._lastSavedOpencodeUrl = url;
    } catch (error) {
      Logger.warn(LogCategory.ASSISTANT_CORE, assistantT("logs.opencodeUrlSaveFailed"), {
        error: (error as Error).message,
      });
    }
  }

  _initActiveAdapter(): void {
    const providerId = this.providerSelect?.value;
    if (providerId === undefined || providerId === "") {
      Logger.error(LogCategory.ASSISTANT_CORE, assistantT("logs.providerNotSelected"));
      return;
    }

    this._activeAdapter = AssistantProviderRegistry.getAdapter(providerId);

    if (!this._activeAdapter) {
      Logger.error(LogCategory.ASSISTANT_CORE, assistantT("logs.adapterNotFound"), {
        providerId,
      });
    }
  }

  _populateProviderSelect(): void {
    const assistantProviders = ProviderRegistry.getAllAssistants();
    const settings = SettingsManager.getSnapshot() as AppSettings | null;
    populateAssistantProviderSelect({
      providerSelect: this.providerSelect,
      providers: Array.isArray(assistantProviders) ? assistantProviders : [],
      settings,
      isProviderOption: (value: unknown): value is { id: string; name: string } =>
        this._isProviderOption(value),
    });
  }

  _setupEventListeners(_currentMode: AssistantRuntimeMode): void {
    bindAssistantBasicEvents({
      connectBtn: this.connectBtn,
      resumeLastSessionCheckbox: this.resumeLastSessionCheckbox,
      keepServersOnAppCloseCheckbox: this.keepServersOnAppCloseCheckbox,
      catchCommandsCheckbox: this.catchCommandsCheckbox,
      providerSelect: this.providerSelect,
      opencodeSettingsBtn: this.opencodeSettingsBtn,
      opencodeActionBtn: this.opencodeActionBtn,
      memoryBtn: this.memoryBtn,
      devtoolsBtn: this.devtoolsBtn,
      testBtn: this.testBtn,
      onConnectClick: () => {
        void this._toggleConnection();
      },
      onResumeLastSessionChange: (enabled: boolean) => {
        void this._saveResumeTogglePreference(enabled);
      },
      onKeepServersOnCloseChange: (enabled: boolean) => {
        void this._saveKeepServersOnClosePreference(enabled);
      },
      onCatchCommandsChange: (enabled: boolean) => {
        void this._saveAssistantCatchCommandsPreference(enabled);
      },
      onProviderChange: () => {
        void this._onProviderChange();
      },
      onOpencodeSettingsClick: () => {
        void this._openOpencodeSettingsModal();
      },
      onOpencodeActionClick: () => {
        void this._handleOpencodeActionClick();
      },
      onMemoryClick: () => {
        this.memoryOverlay.open();
      },
      onDevtoolsClick: () => {
        this._openDevTools();
      },
      onTestClick: () => {
        this._handleTestClick();
      },
    });

    this._bindIdentityAction("assistant-avatar-action", async () => {
      await this._editIdentityAvatar();
    });
    this._bindIdentityAction("assistant-nickname", () => {
      this._editIdentityNickname();
    });
    this._setupIdentityNicknameModalEvents();
    this._setupAssistantSceneEvents();

    const ai0Webview = document.getElementById("ai0-webview");
    bindAssistantWebviewIpcEvents({
      webviewEl: ai0Webview,
      providerSelect: this.providerSelect,
      getActiveProviderId: () => this._activeAdapter?.id ?? null,
      isConnectFlowActive: () => this._connectFlowActive,
      getProviderToolsReady: () => this._providerToolsReady,
      setProviderToolsReady: (ready: boolean) => {
        this._providerToolsReady = ready;
        AppState.setAssistantToolsReady(ready);
      },
      setConnectOverlayStage: (stage: OverlayStage | null) => {
        this._setConnectOverlayStage(stage);
      },
      updateConnectionUI: () => {
        this._updateConnectionUI();
      },
      onMcpToggleFromHealth: async (server: string, enabled: boolean) => {
        await this._onMcpToggleFromHealth(server, enabled);
      },
      onOpencodeSessionChanged: async (sessionId: string) => {
        await this._saveLastOpencodeUiSessionId(sessionId);
        await this._updateAssistantRuntimeState({
          workflowSessionId: sessionId,
          phase: "idle",
        });
      },
      onAssistantRuntimeControl: async (patch: Record<string, unknown>) => {
        await this._updateAssistantRuntimeState(patch);
      },
    });
  }

  _setupAssistantSceneEvents(): void {
    return;
  }

  _handleAssistantSceneObject(id: string): void {
    const sceneObject = this._assistantSceneLayout.objects.find((node) => node.id === id) ?? null;
    if (sceneObject === null) {
      return;
    }

    if (this._assistantSceneEditor !== null) {
      this._assistantSceneSelection = { kind: "object", id: sceneObject.id };
      this._assistantSceneEditor.refresh();
      this._renderAssistantScene();
      return;
    }

    dispatchSceneAction(sceneObject.action, {
      onNavigate: (page) => {
        this._setAssistantSceneScreenOpen(false);
        this._navigateToPage(page);
      },
      onSettings: (action) => {
        this._setAssistantSceneScreenOpen(false);
        openSceneSettingsPanel(action.panel);
      },
      onSettingsSceneClose: () => {
        this._setAssistantSceneScreenOpen(false);
      },
      onScreen: (action) => {
        this._setAssistantSceneScreenOpen(action.screen === "primary");
      },
      onWhisper: () => {},
      onBack: () => {
        this._setAssistantSceneScreenOpen(false);
      },
    });
  }

  _isConnected(): boolean {
    const slotState = SlotController.getState("ai0") as SlotStateInfo | null;
    return slotState?.state === SlotState.CONNECTED || this._isServerRunning;
  }

  _setButtonState(state: ConnectButtonState, errorMsg?: string): void {
    applyConnectButtonState(this.connectBtn, state, errorMsg);
  }

  async _onMcpToggleFromHealth(server: string, enabled: boolean): Promise<void> {
    if (enabled) {
      this._disabledMcpServers.delete(server);
    } else {
      this._disabledMcpServers.add(server);
    }

    await this._saveDisabledMcpServers();

    Logger.info(
      LogCategory.ASSISTANT_CORE,
      assistantT("logs.mcpToggleSaved", {
        server,
        state: assistantT(enabled ? "mcp.stateEnabled" : "mcp.stateDisabled"),
      }),
      {
        disabledMcpServers: Array.from(this._disabledMcpServers),
      }
    );
  }

  _getResumeSessionId(providerId: string, options: { forceResume?: boolean }): string {
    if (!this._isResumeEnabled(options)) return "";

    const settings = SettingsManager.getSnapshot() as AppSettings | null;

    if (providerId === "opencode-ui") {
      const sessionId = settings?.assistants?.lastOpencodeUiSessionId;
      return typeof sessionId === "string" ? sessionId : "";
    }

    return "";
  }

  _resolveConnectUrl(
    baseUrl: string,
    providerId: string,
    options: { forceResume?: boolean }
  ): string {
    const settings = SettingsManager.getSnapshot() as AppSettings | null;

    if (providerId === "opencode-ui" && baseUrl !== "") {
      try {
        const isPackagedFileRoute = window.location.protocol === "file:" && baseUrl.startsWith("/");
        const parsed = new URL(
          isPackagedFileRoute ? `.${baseUrl}` : baseUrl,
          isPackagedFileRoute ? new URL(".", window.location.href) : window.location.origin
        );
        parsed.searchParams.set("resumeMode", this._isResumeEnabled(options) ? "last" : "new");
        const resumeSessionId = this._getResumeSessionId(providerId, options);
        if (resumeSessionId !== "") {
          parsed.searchParams.set("resumeSessionId", resumeSessionId);
        }

        const dbPath = resolveOpencodeUiDbPath(settings);
        if (dbPath !== "") {
          parsed.searchParams.set("dbPath", dbPath);
        }

        parsed.searchParams.set("theme", ThemeManager.current);

        if (isPackagedFileRoute) {
          return parsed.toString();
        }

        return baseUrl.startsWith("/")
          ? `${parsed.pathname}${parsed.search}${parsed.hash}`
          : parsed.toString();
      } catch {
        return baseUrl;
      }
    }

    if (!this._isResumeEnabled(options)) {
      return baseUrl;
    }

    if (providerId === "opencode") {
      const savedUrl = settings?.assistants?.lastOpencodeUrl;
      if (typeof savedUrl === "string" && savedUrl !== "") {
        try {
          const savedParsed = new URL(savedUrl);
          const baseParsed = new URL(baseUrl);
          const normalizedSavedPath = savedParsed.pathname.replace(/\/+$/u, "");
          const normalizedBasePath = baseParsed.pathname.replace(/\/+$/u, "");
          const savedPath = normalizedSavedPath === "" ? "/" : normalizedSavedPath;
          const basePath = normalizedBasePath === "" ? "/" : normalizedBasePath;

          if (savedParsed.origin === baseParsed.origin && savedPath === "/" && basePath !== "/") {
            return baseUrl;
          }
        } catch {}
        return savedUrl;
      }
      return baseUrl;
    }

    return baseUrl;
  }

  _beginConnectFlow(): AbortSignal {
    this._connectAbortController?.abort();
    this._connectAbortController = new AbortController();
    this._connectFlowActive = true;
    this._connectOverlayStage = null;
    return this._connectAbortController.signal;
  }

  _finishConnectFlow(): void {
    this._connectFlowActive = false;
    this._connectAbortController = null;
    this._connectOverlayStage = null;
  }

  _isConnectFlowCancelled(signal: AbortSignal): boolean {
    return signal.aborted === true;
  }

  _cancelConnectFlow(): void {
    this._connectAbortController?.abort();
    this._connectOverlayStage = null;
  }

  _setConnectOverlayStage(stage: OverlayStage | null): void {
    this._connectOverlayStage = stage;
  }

  async _resolveSystemServerStatus(): Promise<{ running: boolean; port?: number }> {
    return await detectSystemActiveServerStatus();
  }

  async _syncSystemServerStatus(options: { refreshUi?: boolean } = {}): Promise<void> {
    const status = await this._resolveSystemServerStatus();
    const nextPort = typeof status.port === "number" ? status.port : null;
    const changed = this._isServerRunning !== status.running || this._systemServerPort !== nextPort;

    this._isServerRunning = status.running;
    this._systemServerPort = nextPort;

    if (options.refreshUi === true || changed) {
      this._updateConnectionUI(true);
    }
  }

  async _stopSystemActiveServers(): Promise<void> {
    const electronApi = window.electronAPI;
    const adapter = this._activeAdapter;

    if (electronApi !== undefined && typeof electronApi.opencodeServeStop === "function") {
      const result = await electronApi.opencodeServeStop();
      const stopErrorMessage = resolveIpcErrorMessage(result);
      if (result.success !== true && stopErrorMessage !== undefined && stopErrorMessage !== "") {
        throw new Error(assistantError("systemServerStopFailed", stopErrorMessage));
      }
    } else if (adapter !== null) {
      const result = await adapter.stopServer();
      const stopErrorMessage = resolveIpcErrorMessage(result) ?? result.error;
      if (result.success !== true && stopErrorMessage !== undefined && stopErrorMessage !== "") {
        throw new Error(assistantError("systemServerStopFailed", stopErrorMessage));
      }
    }

    this._systemServerPort = null;
    this._isServerRunning = false;
    this._updateServerStatus({ running: false });
  }

  async _toggleConnection(options: { forceResume?: boolean } = {}): Promise<void> {
    await toggleAssistantConnection(this, options);
  }

  async _handleDeliveryRequest(
    request: AssistantDeliveryRequest
  ): Promise<AssistantDeliveryResult> {
    const message = request.message.trim();
    if (message === "") {
      return {
        success: false,
        message: assistantT("runtime.deliveryEmpty"),
      };
    }

    try {
      const sendResult = await dispatchInternalSlotBridge(
        {
          action: "message.send",
          toSlot: "ai0",
          payload: {
            page: request.page ?? "assistant:delivery",
            text: message,
          },
        },
        {
          provider: "user",
          source: "user",
          fromSlot: "user",
        }
      );

      if (sendResult.success !== true) {
        return {
          success: false,
          message: sendResult.message ?? sendResult.error ?? assistantT("runtime.deliveryFailed"),
        };
      }

      Logger.info(LogCategory.ASSISTANT_CORE, assistantT("logs.deliveryCompleted"), {
        page: request.page ?? "generic",
      });

      return {
        success: true,
        message: assistantT("runtime.deliverySent"),
      };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      Logger.error(LogCategory.ASSISTANT_CORE, assistantT("logs.deliveryFailed"), {
        page: request.page ?? "generic",
        error: messageText,
      });
      return {
        success: false,
        message: messageText,
      };
    }
  }

  _updateServerStatus(status: { running: boolean; port?: number }): void {
    updateServerStatusView(status, {
      statusText: document.querySelector("#assistant-status-text"),
      statusDetails: document.querySelector("#assistant-status-details"),
      statusDot: document.querySelector("#assistant-status-dot"),
    });
  }

  async _onProviderChange(): Promise<void> {
    const providerId = this.providerSelect?.value;
    if (providerId === undefined || providerId === "") return;

    this._activeAdapter = AssistantProviderRegistry.getAdapter(providerId);

    const provider = ProviderRegistry.getAssistant(providerId);
    if (!this._isProviderOption(provider)) return;

    this._providerToolsReady = providerId !== "opencode-ui";
    AppState.setAssistantToolsReady(this._providerToolsReady);
    await SettingsManager.set("assistants.preferred", providerId);

    Logger.info(LogCategory.ASSISTANT_CORE, assistantT("logs.providerChanged"), {
      providerName: provider.name,
    });
    await this._syncIdentityCard();
    this._updateConnectionUI();
  }

  _openDevTools(): void {
    const webview = document.getElementById("ai0-webview") as WebviewTag | null;

    if (webview && typeof webview.openDevTools === "function") {
      webview.openDevTools();
      Logger.debug(LogCategory.ASSISTANT_CORE, assistantT("logs.devtoolsOpened"));
    } else {
      Logger.warn(LogCategory.ASSISTANT_CORE, assistantT("logs.webviewMissing"));
    }
  }

  _openScenarioPanel(scenarioId: string): void {
    if (this.scenarioPanelState?.phase === "running") {
      return;
    }

    this.scenarioPanelState = {
      scenarioId,
      providerName: this._getCurrentProviderLabel(),
      phase: "launcher",
      filter: "all",
      runId: null,
      totalCommandCount: null,
      commands: [],
      message: assistantT("runtime.scenarioHint"),
      suite: null,
    };
    this._renderTestPanel();
  }

  _syncScenarioPanelLocale(): void {
    const state = this.scenarioPanelState;
    if (!state) {
      return;
    }

    state.providerName = this._getCurrentProviderLabel();
    const scenarioTitle = getScenarioTitleLabel(state.scenarioId);

    if (state.phase === "launcher") {
      state.message = assistantT("runtime.scenarioHint");
    } else if (state.phase === "running" && state.commands.length === 0) {
      state.message =
        state.runId === null
          ? assistantT("runtime.scenarioStarted", {
              providerName: state.providerName,
              scenarioTitle,
            })
          : assistantT("runtime.scenarioPreparing", {
              providerName: state.providerName,
              scenarioTitle,
            });
    } else if (state.phase === "completed" && state.suite !== null) {
      state.message = buildAssistantScenarioCompletionMessage({
        passed: state.suite.passed,
        totalTests: state.suite.totalTests,
        commands: state.commands,
        ...(state.suite.aborted !== undefined ? { aborted: state.suite.aborted } : {}),
        ...(state.suite.abortReason !== undefined ? { abortReason: state.suite.abortReason } : {}),
      });
    }
  }

  _closeTestPanel(): void {
    this.testPanelController?.close();
  }

  _requestScenarioCancellation(runId: string | null): void {
    if (runId === null || runId.trim() === "") {
      return;
    }

    const electronApi = window.electronAPI;
    if (electronApi === undefined) {
      return;
    }

    void electronApi.cancelProviderScenario({ runId }).catch((error) => {
      Logger.warn(
        LogCategory.ASSISTANT_CORE,
        assistantT("logs.scenarioCancelFailed", {
          message: error instanceof Error ? error.message : String(error),
        })
      );
    });
  }

  _dismissScenarioPanelForUnavailableSlot(): void {
    const state = this.scenarioPanelState;
    if (!state) {
      return;
    }

    if (state.phase === "running") {
      this._requestScenarioCancellation(state.runId);
    }

    this._closeTestPanel();
  }

  _updateTestProgress(event: ProviderScenarioProgressEvent): void {
    const state = this.scenarioPanelState;
    if (!state || event.slot !== "ai0") return;
    if (state.runId !== null && event.runId !== state.runId) return;

    state.runId ??= event.runId;
    if (typeof event.scenarioCommandTotal === "number") {
      state.totalCommandCount = event.scenarioCommandTotal;
    }

    if (event.type === "started") {
      state.phase = "running";
      state.message = assistantT("runtime.scenarioPreparing", {
        providerName: state.providerName,
        scenarioTitle: getScenarioTitleLabel(state.scenarioId),
      });
    }

    if (
      (event.type === "command-start" || event.type === "command-complete") &&
      event.commandReport !== undefined
    ) {
      const commandReport = event.commandReport;
      const existing = state.commands.find((command) => command.id === commandReport.id);
      if (existing) {
        Object.assign(existing, commandReport);
      } else {
        state.commands.push({ ...commandReport });
      }
      state.message = event.message ?? state.message;
    }

    if (event.type === "completed") {
      state.phase = "completed";
      state.message = event.message ?? state.message;
    }

    this._renderTestPanel();
  }

  _renderTestPanel(): void {
    const state = this.scenarioPanelState;
    const panel = this.testPanel;
    if (!state || !panel) return;

    this.testPanelController?.open();

    const displayCommands =
      state.commands.length > 0 ? state.commands : (state.suite?.commands ?? []);
    const totalSteps = state.totalCommandCount ?? state.suite?.commands.length;
    const summary = buildScenarioProgressSummary({
      slot: "ai0",
      providerName: state.providerName,
      scenarioTitle: getScenarioTitleLabel(state.scenarioId),
      commands: displayCommands,
      ...(totalSteps !== undefined ? { totalSteps } : {}),
    });
    const counts = buildScenarioStatusCounts({ commands: displayCommands });
    const rows = filterScenarioDisplayRows({
      filter: state.filter,
      commands: displayCommands,
    });
    const summaryMarkup = `
      <div class="scenario-overlay__summary" role="tablist" aria-label="${assistantT("scenarioPanel.resultsFilterAria")}">
        <button class="scenario-summary-chip scenario-summary-chip--pass${state.filter === "pass" ? " is-active" : ""}" type="button" data-filter-status="pass">
          ${counts.pass} ${assistantT("scenarioPanel.status.pass")}
        </button>
        <button class="scenario-summary-chip scenario-summary-chip--fail${state.filter === "fail" ? " is-active" : ""}" type="button" data-filter-status="fail">
          ${counts.fail} ${assistantT("scenarioPanel.status.fail")}
        </button>
        <button class="scenario-summary-chip scenario-summary-chip--warning${state.filter === "warning" ? " is-active" : ""}" type="button" data-filter-status="warning">
          ${counts.warning} ${assistantT("scenarioPanel.status.warning")}
        </button>
        <button class="scenario-summary-chip scenario-summary-chip--skip${state.filter === "skip" ? " is-active" : ""}" type="button" data-filter-status="skip">
          ${counts.skip} ${assistantT("scenarioPanel.status.skip")}
        </button>
      </div>
    `;

    const stepMarkup =
      rows.length === 0
        ? `<div class="scenario-empty">${state.filter === "all" ? assistantT("scenarioPanel.emptyNotStarted") : assistantT("scenarioPanel.emptyNoResults")}</div>`
        : rows
            .map(
              (row) => `
                    <div class="scenario-step scenario-step--${row.status}">
                      <div class="scenario-step__body">
                        <span class="scenario-step__name">${getScenarioCommandLabel(row.id, row.name)}</span>
                        ${row.message !== "" ? `<span class="scenario-step__message">${row.message}</span>` : ""}
                      </div>
                      <span class="scenario-step__status">${formatAssistantScenarioStatusLabel(row.status)}</span>
                    </div>
                  `
            )
            .join("");

    panel.innerHTML = `
        <div class="assistant-test-panel__header">
          <div>
            <div class="scenario-overlay__eyebrow">AI0 ${getScenarioTitleLabel(state.scenarioId)}</div>
            <div class="assistant-test-panel__title">${assistantT("scenarioPanel.runningTitle", { providerName: state.providerName, scenarioTitle: getScenarioTitleLabel(state.scenarioId) })}</div>
            <div class="assistant-test-panel__subtitle">${state.message}</div>
          </div>
        <button class="btn btn-ghost btn-sm assistant-test-panel__close" type="button" ${state.phase === "running" ? "disabled" : ""}>${assistantT("scenarioPanel.closeButton")}</button>
      </div>
          <div class="scenario-overlay__meta">
            <span>${assistantT("scenarioPanel.stepsCompleted", { completed: summary.completedSteps, total: summary.totalSteps })}</span>
            <span>${summary.activeStepId ?? assistantT("scenarioPanel.readyState")}</span>
          </div>
          ${summaryMarkup}
          <div class="assistant-test-panel__steps">${stepMarkup}</div>
          <div class="assistant-test-panel__actions">
            <button class="btn btn-primary btn-sm assistant-test-panel__start" type="button" ${state.phase === "running" ? "disabled" : ""}>
              ${state.phase === "launcher" ? assistantT("scenarioPanel.startButton") : assistantT("scenarioPanel.rerunButton")}
            </button>
            ${
              state.phase === "running"
                ? `<button class="btn btn-secondary btn-sm assistant-test-panel__stop" type="button">${assistantT("scenarioPanel.stopButton")}</button>`
                : ""
            }
            ${state.suite ? `<button class="btn btn-secondary btn-sm assistant-test-panel__copy" type="button">${assistantT("scenarioPanel.copyJsonButton")}</button>` : ""}
          </div>
        `;

    panel.querySelector(".assistant-test-panel__close")?.addEventListener("click", () => {
      this._closeTestPanel();
    });
    panel.querySelector(".assistant-test-panel__start")?.addEventListener("click", () => {
      void this._startScenarioTest();
    });
    panel.querySelector(".assistant-test-panel__stop")?.addEventListener("click", () => {
      void this._stopScenarioTest();
    });
    panel.querySelector(".assistant-test-panel__copy")?.addEventListener("click", () => {
      if (state.suite) {
        void this._copyScenarioSuiteJson(state.suite).catch((error) => {
          state.message = error instanceof Error ? error.message : String(error);
          this._renderTestPanel();
        });
      }
    });
    panel.querySelectorAll<HTMLElement>("[data-filter-status]").forEach((button) => {
      button.addEventListener("click", () => {
        const filter = button.dataset["filterStatus"] as ScenarioStatusFilter | undefined;
        if (filter === undefined) return;
        state.filter = state.filter === filter ? "all" : filter;
        this._renderTestPanel();
      });
    });
  }

  async _copyTextToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.classList.add("clipboard-proxy");
      document.body.appendChild(textarea);

      try {
        textarea.focus();
        textarea.select();
        return document.execCommand("copy");
      } finally {
        textarea.remove();
      }
    }
  }

  async _copyScenarioSuiteJson(results: ProviderTestSuite): Promise<void> {
    const copied = await this._copyTextToClipboard(JSON.stringify(results, null, 2));
    if (!copied) {
      throw new Error(assistantT("errors.clipboardCopyFailed"));
    }

    Logger.info(LogCategory.ASSISTANT_CORE, assistantT("logs.testResultsCopied"));
  }

  async _startScenarioTest(): Promise<void> {
    const state = this.scenarioPanelState;
    if (!state || this.providerTestProgressHandler !== null) return;

    const electronApi = window.electronAPI;
    if (electronApi === undefined) {
      throw new Error(assistantT("errors.electronApiUnavailable"));
    }

    const handler = (event: ProviderScenarioProgressEvent): void => {
      this._updateTestProgress(event);
    };
    this.providerTestProgressHandler = handler;
    electronApi.onProviderScenarioProgress(handler);

    try {
      state.phase = "running";
      state.filter = "all";
      state.runId = null;
      state.totalCommandCount = null;
      state.commands = [];
      state.suite = null;
      state.message = assistantT("runtime.scenarioStarted", {
        providerName: state.providerName,
        scenarioTitle: getScenarioTitleLabel(state.scenarioId),
      });
      this._renderTestPanel();

      const results = (await electronApi.runProviderScenario({
        slot: "ai0",
        scenarioId: state.scenarioId,
      })) as ProviderTestSuite;

      if (results.refreshedConfig) {
        ProviderRegistry.update(results.refreshedConfig.id, results.refreshedConfig);
        const activeWebview = SlotController.getWebview("ai0") as
          (HTMLElement & { send?: (channel: string, ...args: unknown[]) => void }) | null;
        activeWebview?.send?.("app-set-provider", {
          providerId: results.refreshedConfig.id,
          slot: "ai0",
        });
      }

      state.phase = "completed";
      state.runId = results.runId ?? state.runId;
      state.totalCommandCount = results.commands.length;
      state.commands = results.commands;
      state.suite = results;
      const completionMessage = buildAssistantScenarioCompletionMessage({
        passed: results.passed,
        totalTests: results.totalTests,
        commands: state.commands,
        ...(results.aborted !== undefined ? { aborted: results.aborted } : {}),
        ...(results.abortReason !== undefined ? { abortReason: results.abortReason } : {}),
      });
      state.message = completionMessage;
      this._renderTestPanel();

      Logger.info(
        LogCategory.ASSISTANT_CORE,
        assistantT("logs.scenarioCompleted", {
          scenarioId: state.scenarioId,
          message: completionMessage,
        })
      );
    } catch (error) {
      state.phase = "completed";
      state.message = (error as Error).message;
      this._renderTestPanel();
      Logger.error(
        LogCategory.ASSISTANT_CORE,
        assistantT("logs.scenarioFailed", {
          scenarioId: state.scenarioId,
          message: (error as Error).message,
        })
      );
    } finally {
      const progressHandler = this.providerTestProgressHandler;
      electronApi.offProviderScenarioProgress(progressHandler);
      this.providerTestProgressHandler = null;
    }
  }

  async _stopScenarioTest(): Promise<void> {
    const state = this.scenarioPanelState;
    const electronApi = window.electronAPI;
    if (state?.phase !== "running" || electronApi === undefined) {
      return;
    }

    if (state.runId === null) {
      state.message = assistantT("runtime.scenarioStopPreparing");
      this._renderTestPanel();
      return;
    }

    state.message = assistantT("runtime.scenarioStopRequested");
    this._renderTestPanel();

    try {
      await electronApi.cancelProviderScenario({ runId: state.runId });
    } catch (error) {
      state.message = (error as Error).message;
      this._renderTestPanel();
    }
  }

  _handleTestClick(): void {
    const btn = this.testBtn;
    if (!btn || btn.disabled) return;
    if (this.scenarioPanelState?.phase === "running") return;

    this._openScenarioPanel("webview-test");
  }

  _updateConnectionUI(skipSystemServerSync = false): void {
    const hasAccount = AppState.isAssigned("ai0");
    const slotState = SlotController.getState("ai0") as SlotStateInfo | null;
    const isConnected = slotState?.state === SlotState.CONNECTED || this._isServerRunning;
    const isConnecting = slotState?.state === SlotState.CONNECTING || this._connectFlowActive;
    const shouldDismissScenarioPanel = !hasAccount || (!isConnected && !isConnecting);

    if (shouldDismissScenarioPanel) {
      this._dismissScenarioPanelForUnavailableSlot();
    }

    updateAssistantConnectionUI(this, skipSystemServerSync);
    this._updateIdentityStatusDot();
    this._syncAssistantSceneCharacterState();
  }

  setWebviewStatusOverlayState(state: InlineStatusOverlayState | null): void {
    this.webviewStatusOverlayController?.setState(state);
  }

  _updateTrafficUI(trafficState: AssistantTrafficState | null): void {
    const state = trafficState as AssistantTrafficState;
    const status = state.state?.status;
    if (status === undefined) {
      this._syncAssistantSceneCharacterState();
      return;
    }
    const slotState = SlotController.getState("ai0") as SlotStateInfo | null;
    const isConnected = slotState?.state === SlotState.CONNECTED;

    if (!isConnected) {
      this._syncAssistantSceneCharacterState();
      return;
    }

    updateTrafficStatusView(state, {
      statusDot: this.statusDot,
      statusText: this.statusText,
    });
    this._syncAssistantSceneCharacterState();
  }

  _onSettingsChange(_settings: unknown, changedPaths: string[] = []): void {
    const shouldRefreshProviderSelect =
      changedPaths.includes("*") ||
      changedPaths.some(
        (path) => isAssistantAccountsSettingsPath(path) || isAssistantSlotSettingsPath(path)
      );

    if (shouldRefreshProviderSelect) {
      this._populateProviderSelect();
      this._initActiveAdapter();
      const activeProviderId = this.providerSelect?.value ?? this._activeAdapter?.id ?? null;
      if (activeProviderId !== null) {
        this._providerToolsReady = activeProviderId !== "opencode-ui";
        AppState.setAssistantToolsReady(this._providerToolsReady);
      }
    }

    const shouldRefreshIdentity =
      changedPaths.includes("*") ||
      changedPaths.some(
        (path) =>
          isAssistantAccountsSettingsPath(path) ||
          isAssistantSlotSettingsPath(path) ||
          path === "assistants" ||
          path.startsWith("assistants.preferred")
      );

    if (shouldRefreshIdentity) {
      void this._syncIdentityCard();
    }

    const shouldRefreshToggles =
      changedPaths.includes("*") ||
      changedPaths.some(
        (path) =>
          path === "assistants" ||
          path.startsWith("assistants.resumeLastSession") ||
          path.startsWith("assistants.keepServersOnAppClose") ||
          isAssistantSlotSettingsPath(path)
      );

    if (shouldRefreshToggles) {
      this._syncTogglePreferencesFromSettings();
    }

    const shouldRefreshOpencodeIndicator =
      changedPaths.includes("*") ||
      changedPaths.some((path) => path === "assistants" || path.startsWith("assistants.opencode"));

    if (shouldRefreshOpencodeIndicator) {
      this._refreshOpencodeDoctorStatus();
    }
  }

  _setupWebviewEvents(webviewEl: WebviewElement): void {
    bindAssistantPrimaryWebviewEvents({
      webviewEl,
      providerSelect: this.providerSelect,
      urlDisplay: this.urlDisplay,
      scheduleSaveLastOpencodeUrl: (url: string) => {
        this._scheduleSaveLastOpencodeUrl(url);
      },
      syncDisabledMcpToHealth: () => {
        this._syncDisabledMcpToHealth();
      },
      syncThemeToWebview: () => {
        this._syncOpencodeUiTheme(ThemeManager.current, { assumeDomReady: true });
      },
      onTranscriptDomReady: () => {
        this._flushPendingTranscriptIngress();
      },
    });
  }

  _handleTranscriptIngress(payload: TranscriptIngressPayload): void {
    const activePage = document.documentElement.getAttribute("data-active-page");
    if (activePage !== "assistant") {
      return;
    }

    if (payload.target !== null && payload.target !== "assistant-opencode-native") {
      return;
    }

    const providerId = this.providerSelect?.value ?? this._activeAdapter?.id ?? null;
    if (providerId !== "opencode-ui") {
      return;
    }

    const ai0Webview = document.getElementById("ai0-webview");
    const delivered = sendTranscriptIngressToAssistantWebview(ai0Webview, payload);
    if (!delivered) {
      this._pendingTranscriptIngress.push(payload);
    }
  }

  _flushPendingTranscriptIngress(): void {
    if (this._pendingTranscriptIngress.length === 0) {
      return;
    }

    const ai0Webview = document.getElementById("ai0-webview");
    if (ai0Webview == null) {
      return;
    }

    const stillPending: TranscriptIngressPayload[] = [];
    for (const payload of this._pendingTranscriptIngress) {
      const delivered = sendTranscriptIngressToAssistantWebview(ai0Webview, payload);
      if (!delivered) {
        stillPending.push(payload);
      }
    }
    this._pendingTranscriptIngress = stillPending;
  }
  _loadDisabledMcpServers(): void {
    const settings = SettingsManager.getSnapshot() as AppSettings | null;
    const list = settings?.assistants?.disabledMcpServers;

    this._disabledMcpServers.clear();
    if (Array.isArray(list)) {
      for (const name of list) {
        if (typeof name === "string" && name !== "") {
          this._disabledMcpServers.add(name);
        }
      }
    }

    if (this._disabledMcpServers.size > 0) {
      Logger.info(LogCategory.ASSISTANT_CORE, assistantT("logs.disabledMcpLoaded"), {
        disabledMcpServers: Array.from(this._disabledMcpServers),
      });
    }
  }

  async _saveDisabledMcpServers(): Promise<void> {
    try {
      await SettingsManager.set(
        "assistants.disabledMcpServers",
        Array.from(this._disabledMcpServers)
      );
    } catch (e) {
      Logger.error(LogCategory.ASSISTANT_CORE, assistantT("logs.disabledMcpSaveFailed"), {
        error: (e as Error).message,
      });
    }
  }

  _syncDisabledMcpToHealth(): void {
    const ai0Webview = document.getElementById("ai0-webview");
    if (!ai0Webview) return;

    if (this._disabledMcpServers.size > 0) {
      try {
        const disabledList = Array.from(this._disabledMcpServers);
        void ai0Webview.executeJavaScript?.(
          `(function() {
            try {
              if (typeof window.__setDisabledMcpServers === "function") {
                window.__setDisabledMcpServers(${JSON.stringify(disabledList)});
              }
            } catch(e) { console.warn(${JSON.stringify(assistantT("mcpSyncFailed"))}, e); }
          })();`
        );
      } catch (_) {
        // NOTE: Ignore if the webview is not ready yet.
      }
    }
  }

  _syncOpencodeUiTheme(
    theme: ThemeId = ThemeManager.current,
    options: { assumeDomReady?: boolean } = {}
  ): void {
    const ai0Webview = document.getElementById("ai0-webview");
    if (ai0Webview == null) {
      return;
    }

    if (typeof ai0Webview.executeJavaScript !== "function") {
      return;
    }

    const slotState = SlotController.getState("ai0") as
      (SlotStateInfo & { domReady?: boolean }) | null;
    const isDomReady = options.assumeDomReady === true || slotState?.domReady === true;
    if (!isDomReady) {
      return;
    }

    const activeProviderId = this.providerSelect?.value ?? this._activeAdapter?.id ?? "";
    const currentUrl = slotState?.currentUrl ?? "";
    const shouldSyncTheme = isOpencodeUiThemeHost(activeProviderId, currentUrl);

    if (!shouldSyncTheme) {
      return;
    }

    try {
      void ai0Webview.executeJavaScript(
        buildInlineThemeSyncScript(theme, ThemeManager.getAppearance())
      );
    } catch (_) {
      // NOTE: Ignore if the webview has not finished loading yet.
    }
  }

  onShow(): void {
    this._syncAssistantSceneVisibility();
    this._updateConnectionUI();
    this._syncOpencodeUiTheme();
  }

  onHide(): void {
    this._setAssistantSceneScreenOpen(false);
  }

  async destroy(): Promise<void> {
    registerAssistantDeliveryHandler(null);

    const progressHandler = this.providerTestProgressHandler;
    if (progressHandler !== null) {
      window.electronAPI?.offProviderTestProgress(progressHandler);
      this.providerTestProgressHandler = null;
    }

    if (this._isServerRunning) {
      await this._stopSystemActiveServers();
    }

    if (this._opencodeUrlSaveTimer) {
      clearTimeout(this._opencodeUrlSaveTimer);
      this._opencodeUrlSaveTimer = null;
    }
    this._unsubSettings?.();
    this._unsubSlot?.();
    this._unsubTraffic?.();
    this._unsubAppState?.();
    this._unsubI18n?.();
    this._unsubTheme?.();
    this._assistantSceneThemeUnsub?.();
    this._assistantSceneAssetDraftUnsub?.();
    this._assistantSceneResizeObserver?.disconnect();
    this._assistantSceneResizeObserver = null;
    this._assistantSceneThemeUnsub = null;
    this._assistantSceneAssetDraftUnsub = null;
    this.webviewStatusOverlayController?.setState(null);
    this.webviewStatusOverlayController?.destroy();
    this.webviewStatusOverlayController = null;
    this.identityModalController?.destroy();
    this.identityModalController = null;
    this.testPanelController?.destroy();
    this.testPanelController = null;
    this.testPanelOverlay = null;
    this.testPanel = null;
    this.characterOverlay.destroy();
    this.memoryOverlay.destroy();
  }
}

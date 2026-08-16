import { apiCall, setApiBaseUrl } from "./api.js";
import {
  initializeSessionSelection as initializeSessionSelectionFromModule,
  type OpencodeUiBootstrapDeps,
  type OpencodeUiToolsReadyPayload,
  runOpencodeUiBootstrapPipeline as runOpencodeUiBootstrapPipelineFromModule,
  startLiveMessageRefresh as startLiveMessageRefreshFromModule,
  startPeriodicRefresh as startPeriodicRefreshFromModule,
} from "./bootstrap-actions.js";
import { checkHealth, loadStatusContext, waitForMcpServersSettled } from "./health.js";
import {
  loadActiveSessionHistory as loadActiveSessionHistoryFromModule,
  syncActiveSessionHistoryIfUpdated as syncActiveSessionHistoryIfUpdatedFromModule,
  withHistorySyncFallback as withHistorySyncFallbackFromModule,
} from "./history-actions.js";
import {
  loadProviderContextAndModels as loadProviderContextAndModelsFromModule,
  selectActiveModelKey as selectActiveModelKeyFromModule,
  updateModelPreferences as updateModelPreferencesFromModule,
} from "./provider-actions.js";
import type { ProviderContext } from "./provider-actions.js";
import {
  createHistoricAssistantToolHost as createHistoricAssistantToolHostFromModule,
  renderFilesPanel as renderFilesPanelFromModule,
  renderHistoricToolCall as renderHistoricToolCallFromModule,
  renderTodoPanel as renderTodoPanelFromModule,
  updateUsageFromSession as updateUsageFromSessionFromModule,
  updateUsagePlaceholders as updateUsagePlaceholdersFromModule,
} from "./render-actions.js";
import type { RenderContext } from "./render-actions.js";
import {
  initQuickPromptPanel,
  loadToolsFinalSnapshot,
  refreshQuickPromptPanel,
} from "./tools-prompts.js";
import { addMessage } from "./chat-utils.js";
import {
  buildMessageRequestBody,
  readClipboardAttachmentsFromEvent as readComposerClipboardAttachmentsFromEvent,
  readClipboardAttachmentsFromSystem as readComposerClipboardAttachmentsFromSystem,
  removeComposerAttachmentById,
  renderComposerAttachmentTray,
  sendComposerMessage,
  setComposerSendButtonState,
  stageComposerAttachments as stageComposerAttachmentsFromModule,
  stageComposerFileList as stageComposerFileListFromModule,
} from "./composer-actions.js";
import {
  getSessionsForTab as getSessionsForTabFromModule,
  initSessionEvents as initSessionEventsFromModule,
  loadSessionListAndRender as loadSessionListAndRenderFromModule,
} from "./session-actions.js";
import { setupCustomSelect } from "./ui-helpers.js";
import { buildSessionSnapshotKey, normalizeSessionId } from "./message-content.js";
import { normalizeAgentItems } from "./provider-catalog.js";
import { DEFAULT_OPENCODE_UI_MODEL_PREFERENCES } from "./model-preferences.js";
import { createModelSettingsOverlayController } from "./model-settings-overlay.js";
import {
  applyAssistantIdentityToChatEmpty,
  byId,
  clearChatArea,
  copyWorkspaceUrl,
  formatTimestamp,
  getLogoFallback,
  sendSessionChangedToHost,
  sendStageToHost,
  sendToolsReadyToHost,
  setWorkspaceUrlLabel,
  showToast,
  wait,
} from "./host-helpers.js";
import { createSessionStorage } from "./session-storage.js";
import { initOpencodeUiChatEvents } from "./chat-events.js";
import { bootstrapOpencodeUiApp as bootstrapOpencodeUiAppFromModule } from "./app-bootstrap.js";
import {
  initializeRovoInteractionRuntime,
  refreshRovoInteractionRuntime,
} from "./interaction-runtime.js";
import { buildInteractionModeItems } from "./interaction-mode.js";
import { buildRuntimeErrorNotice } from "./notice-utils.js";
import {
  patchOpencodeUiSharedState,
  readOpencodeUiSharedState,
} from "../../modules/opencode-ui-shared-state.js";
import {
  bindDictationTrigger,
  type DictationBinding,
} from "../../modules/transcript/dictation-ui.js";
import { onAssistantTranscriptIngress } from "../../modules/transcript/electron-client.js";
import type {
  ComposerAttachment,
  CustomSelectAPI,
  OpencodeUiMessageBlock,
  OpencodeUiMessageNotice,
  OpencodeUiSessionDetail,
  OpencodeUiSessionSummary,
  OpencodeUiTodoItem,
  OpencodeUiToolCall,
  RovoInteractionMode,
  RuntimeState,
  SessionTab,
} from "./types.js";
import { config as opencodeUiConfig } from "../../modules/webview/providers/opencode-ui/config.js";
import { bootstrapOpencodeUiI18n, t } from "./i18n.js";
import { ThemeManager } from "../../ui/theme/index.js";
import { resolveThemeFromSearchParams } from "../../ui/theme/theme-host-sync.js";
import { AppI18n } from "../../modules/i18n/index.js";
type SessionListContext = Parameters<typeof loadSessionListAndRenderFromModule>[0];
type HistoryContext = Parameters<typeof loadActiveSessionHistoryFromModule>[0];
type BootstrapContext = Parameters<typeof initializeSessionSelectionFromModule>[0];

const runtime: RuntimeState = {
  baseUrl: "http://127.0.0.1:4096",
  dbPath: "",
  activeSessionId: null,
  sessionTab: "active",
  submittingSessionId: null,
  activeModelKey: null,
  activeReasoningEffort: null,
  activeAgentId: null,
  activeInteractionMode: "off",
  modelMetaByKey: {},
  modelItems: [],
  providerItems: [],
  modelPreferences: { ...DEFAULT_OPENCODE_UI_MODEL_PREFERENCES },
  endpointDefaultModelKeys: [],
  isSubmitting: false,
  lastRenderedMessageCount: 0,
  lastRenderedSnapshotKey: "",
  stagedAttachments: [],
};

const sessionStorage = createSessionStorage(runtime);
let modeDropdown: CustomSelectAPI | null = null;
let modelDropdown: CustomSelectAPI | null = null;
let effortDropdown: CustomSelectAPI | null = null;
let interactionDropdown: CustomSelectAPI | null = null;
let modelSettingsOverlayController: ReturnType<typeof createModelSettingsOverlayController> | null =
  null;
let dictationBinding: DictationBinding | null = null;
let localeRefreshBound = false;
let localeRefreshInFlight: Promise<void> | null = null;
const CHAT_AUTO_FOLLOW_THRESHOLD_PX = 96;
let chatAutoFollow = true;
let chatScrollTrackingBound = false;
let programmaticChatScrollDepth = 0;

function getInitialUsageText(): string {
  return t("usage.diskDb");
}

function resolveHostBridgeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim() !== "") {
    return error.trim();
  }

  return String(error);
}

async function setActiveSession(sessionId: string | null): Promise<void> {
  runtime.activeSessionId = sessionId;
  chatAutoFollow = true;
  await patchOpencodeUiSharedState((current) => ({
    ...current,
    lastSessionId: sessionId != null && sessionId !== "" ? sessionId : null,
  }));
  sendSessionChangedToHost(sessionId);
  const api = window.electronAPI as
    | undefined
    | {
        opencodeUiSessionWatchStart?: (sessionId: string, dbPath?: string) => Promise<unknown>;
        opencodeUiSessionWatchStop?: () => Promise<unknown>;
      };
  if (!api) {
    return;
  }

  const normalized = typeof sessionId === "string" ? sessionId.trim() : "";
  const dbPath = runtime.dbPath.trim() !== "" ? runtime.dbPath.trim() : undefined;
  if (normalized !== "") {
    void api.opencodeUiSessionWatchStart?.(normalized, dbPath);
  } else {
    void api.opencodeUiSessionWatchStop?.();
  }
}

async function hydrateRuntimeFromSharedState(): Promise<void> {
  const sharedState = await readOpencodeUiSharedState();
  runtime.activeSessionId = sharedState.lastSessionId;
  runtime.activeAgentId = sharedState.lastAgentId;
  runtime.activeReasoningEffort = sharedState.lastReasoningEffort;
  runtime.activeInteractionMode = sharedState.interactionMode;
  runtime.modelPreferences = { ...sharedState.modelPreferences };
}

async function persistActiveAgentId(agentId: string | null): Promise<void> {
  await patchOpencodeUiSharedState((current) => ({
    ...current,
    lastAgentId: agentId,
  }));
}

async function persistReasoningEffort(reasoningEffort: string | null): Promise<void> {
  await patchOpencodeUiSharedState((current) => ({
    ...current,
    lastReasoningEffort: reasoningEffort,
  }));
}

async function persistInteractionMode(mode: RovoInteractionMode): Promise<void> {
  await patchOpencodeUiSharedState((current) => ({
    ...current,
    interactionMode: mode,
  }));
}

export { buildMessageRequestBody };

function updateUsagePlaceholders(text: string): void {
  updateUsagePlaceholdersFromModule(renderContext(), text);
}

function updateUsageFromSession(usage: Record<string, unknown> | undefined): void {
  updateUsageFromSessionFromModule(renderContext(), usage);
}

function renderTodoPanel(todos: OpencodeUiTodoItem[]): void {
  renderTodoPanelFromModule(renderContext(), todos);
}

function renderFilesPanel(files: string[], workspacePath: string): void {
  renderFilesPanelFromModule(renderContext(), files, workspacePath);
}

function createHistoricAssistantToolHost(): HTMLElement | null {
  return createHistoricAssistantToolHostFromModule(renderContext());
}

function renderHistoricToolCall(targetContainer: HTMLElement, toolCall: OpencodeUiToolCall): void {
  renderHistoricToolCallFromModule(targetContainer, toolCall);
}

async function listSessionsFromDisk(): Promise<OpencodeUiSessionSummary[]> {
  return await sessionStorage.listSessionsFromDisk();
}

async function ensureSessionInDisk(sessionId: string, title?: string): Promise<void> {
  await sessionStorage.ensureSessionInDisk(sessionId, title);
}

async function readSessionFromDisk(sessionId: string): Promise<OpencodeUiSessionDetail | null> {
  return await sessionStorage.readSessionFromDisk(sessionId);
}

async function archiveSessionInDisk(sessionId: string, archived = true): Promise<void> {
  await sessionStorage.archiveSessionInDisk(sessionId, archived);
}

function getSessionsForTab(
  sessions: OpencodeUiSessionSummary[],
  tab: SessionTab = runtime.sessionTab
): OpencodeUiSessionSummary[] {
  return getSessionsForTabFromModule(sessions, tab);
}

function appendAssistantNotice(
  error: unknown,
  options: {
    defaultTitleKey: string;
    scroll?: boolean;
  }
): void {
  addMessage("assistant", "", undefined, undefined, {
    notices: [buildRuntimeErrorNotice(error, { defaultTitleKey: options.defaultTitleKey })],
  });

  if (options.scroll !== false) {
    scrollChatToBottom(true);
  }
}

function sessionListContext(): SessionListContext {
  return {
    runtime,
    byId,
    formatTimestamp,
    listSessionsFromDisk,
    archiveSessionInDisk,
    loadActiveSessionHistory,
    loadSessionListAndRender,
    setActiveSession,
    createServerSession,
    ensureSessionInDisk,
    reportError: (error: unknown, options?: { defaultTitleKey: string }): void => {
      appendAssistantNotice(error, {
        defaultTitleKey: options?.defaultTitleKey ?? "session.actionFailedTitle",
      });
    },
  };
}

function historyContext(): HistoryContext {
  return {
    runtime,
    byId,
    initialUsageText: getInitialUsageText(),
    clearChatArea: (): void => {
      clearChatArea(runtime, byId);
    },
    renderTodoPanel,
    renderFilesPanel,
    updateUsagePlaceholders,
    updateUsageFromSession,
    addMessage,
    createHistoricAssistantToolHost,
    renderHistoricToolCall,
    readSessionFromDisk,
    scrollChatToBottom,
    buildSessionSnapshotKey,
    wait,
  };
}

function providerContext(): ProviderContext {
  return {
    runtime,
    byId,
    modelDropdown,
    effortDropdown,
    onModelStateUpdated: (): void => {
      refreshModelSettingsOverlay();
    },
  };
}

function bootstrapContext(): BootstrapContext {
  return {
    runtime,
    byId,
    getSessionsForTab,
    listSessionsFromDisk,
    createServerSession,
    setActiveSession,
    loadSessionListAndRender,
    loadActiveSessionHistory,
    checkHealth,
    loadStatusContext,
    loadToolsFinalSnapshot,
    syncActiveSessionHistoryIfUpdated,
  };
}

function renderContext(): RenderContext {
  return {
    byId,
    initialUsageText: getInitialUsageText(),
  };
}

async function loadSessionListAndRender(
  options: {
    preserveActive?: boolean;
    syncSelectionToTab?: boolean;
  } = {}
): Promise<void> {
  await loadSessionListAndRenderFromModule(sessionListContext(), options);
}

function isChatNearBottom(chatMessages: HTMLElement): boolean {
  const remaining =
    chatMessages.scrollHeight - (chatMessages.scrollTop + chatMessages.clientHeight);
  return remaining <= CHAT_AUTO_FOLLOW_THRESHOLD_PX;
}

function updateChatAutoFollow(
  chatMessages: HTMLElement | null = byId<HTMLElement>("chat-messages")
): void {
  if (chatMessages == null) {
    chatAutoFollow = true;
    return;
  }

  chatAutoFollow = isChatNearBottom(chatMessages);
}

function bindChatScrollTracking(): void {
  if (chatScrollTrackingBound) {
    return;
  }

  const chatMessages = byId<HTMLElement>("chat-messages");
  if (chatMessages == null) {
    return;
  }

  chatScrollTrackingBound = true;
  updateChatAutoFollow(chatMessages);
  chatMessages.addEventListener("scroll", () => {
    if (programmaticChatScrollDepth > 0) {
      return;
    }

    updateChatAutoFollow(chatMessages);
  });
}

function scrollChatToBottom(force = false): void {
  const chatMessages = byId<HTMLElement>("chat-messages");
  if (chatMessages == null) return;

  if (!force && !chatAutoFollow && !isChatNearBottom(chatMessages)) {
    return;
  }

  programmaticChatScrollDepth += 1;
  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
    chatAutoFollow = true;
    requestAnimationFrame(() => {
      programmaticChatScrollDepth = Math.max(0, programmaticChatScrollDepth - 1);
      updateChatAutoFollow(chatMessages);
    });
  });
}

function draftInteractionText(text: string): void {
  const chatInput = byId<HTMLTextAreaElement>("chat-input");
  if (chatInput == null) {
    return;
  }

  chatInput.value = text;
  chatInput.dispatchEvent(new Event("input", { bubbles: true }));
  chatInput.focus();
  chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
}

async function submitInteractionText(text: string): Promise<void> {
  draftInteractionText(text);
  await sendMessage();
}

function composerContext(): Parameters<typeof sendComposerMessage>[0] {
  return {
    runtime,
    byId,
    showToast,
    syncInteractionModeUi: refreshInteractionDropdown,
    persistInteractionMode,
    ensureActiveSession,
    loadSessionListAndRender,
    withHistorySyncFallback,
    scrollChatToBottom,
  };
}

async function loadActiveSessionHistory(
  options: Parameters<typeof loadActiveSessionHistoryFromModule>[1] = {}
): Promise<void> {
  await loadActiveSessionHistoryFromModule(historyContext(), options);
}

async function syncActiveSessionHistoryIfUpdated(): Promise<void> {
  await syncActiveSessionHistoryIfUpdatedFromModule(historyContext());
}

function setSendButtonState(): void {
  setComposerSendButtonState(runtime, byId);
}

function removeComposerAttachment(attachmentId: string): void {
  removeComposerAttachmentById(runtime, attachmentId, byId);
}

function renderAttachmentTray(): void {
  renderComposerAttachmentTray(runtime, byId);
}

function stageComposerAttachments(attachments: ComposerAttachment[]): void {
  stageComposerAttachmentsFromModule(runtime, attachments, composerContext());
}

async function stageFileList(
  files: FileList | File[],
  source: ComposerAttachment["source"]
): Promise<void> {
  await stageComposerFileListFromModule(runtime, files, source, composerContext());
}

async function readClipboardAttachmentsFromEvent(event: ClipboardEvent): Promise<boolean> {
  return await readComposerClipboardAttachmentsFromEvent(event, runtime, composerContext());
}

async function readClipboardAttachmentsFromSystem(): Promise<ComposerAttachment[]> {
  return await readComposerClipboardAttachmentsFromSystem();
}

async function withHistorySyncFallback(fallbackMessage: {
  text: string;
  blocks?: OpencodeUiMessageBlock[];
  notices?: OpencodeUiMessageNotice[];
}): Promise<void> {
  await withHistorySyncFallbackFromModule(historyContext(), fallbackMessage);
}

async function createServerSession(title = t("session.createDefaultTitle")): Promise<string> {
  const response = await apiCall<unknown>("POST", "/session", { title });
  const sessionId = normalizeSessionId(response);

  if (sessionId === "") {
    throw new Error(t("session.sessionIdUnavailable"));
  }

  await ensureSessionInDisk(sessionId, title);
  return sessionId;
}

async function ensureActiveSession(): Promise<string> {
  if (runtime.activeSessionId != null && runtime.activeSessionId !== "") {
    return runtime.activeSessionId;
  }

  const sessions = await listSessionsFromDisk();
  const visibleSessions = getSessionsForTab(sessions, "active");
  if (visibleSessions.length > 0) {
    const firstId = visibleSessions[0]?.id;
    if (typeof firstId === "string" && firstId !== "") {
      runtime.sessionTab = "active";
      await setActiveSession(firstId);
      return firstId;
    }
  }

  const createdId = await createServerSession();
  await setActiveSession(createdId);
  await loadSessionListAndRender({ preserveActive: true });
  return createdId;
}

async function sendMessage(): Promise<void> {
  await sendComposerMessage(composerContext());
}

function pruneLastMessages(): void {
  const chatMessages = byId<HTMLElement>("chat-messages");
  if (chatMessages == null) return;

  const all = chatMessages.querySelectorAll<HTMLElement>(".ds-message, .ds-tool-call");
  if (all.length === 0) return;

  let removed = 0;
  for (let i = all.length - 1; i >= 0 && removed < 2; i -= 1) {
    const el = all[i];
    if (el == null) continue;
    if (el.classList.contains("ds-tool-call")) {
      el.remove();
      continue;
    }
    el.remove();
    removed += 1;
  }

  const remaining = chatMessages.querySelectorAll(".ds-message");
  const chatEmpty = byId<HTMLElement>("chat-empty");
  if (remaining.length === 0 && chatEmpty != null) {
    if (!chatMessages.contains(chatEmpty)) {
      chatMessages.appendChild(chatEmpty);
    }
    chatEmpty.classList.remove("is-hidden");
  }
}

async function clearChat(): Promise<void> {
  const confirmed = window.confirm(t("session.clearConfirm"));
  if (!confirmed) return;

  try {
    const sessionId = await createServerSession();
    await setActiveSession(sessionId);
    await loadSessionListAndRender({ preserveActive: true });
    await loadActiveSessionHistory();
  } catch (error) {
    appendAssistantNotice(error, { defaultTitleKey: "session.createFailedTitle" });
  }
}

async function openSessionFromHost(
  title = t("session.createDefaultTitle")
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  try {
    const sessionId = await createServerSession(title);
    await setActiveSession(sessionId);
    await loadSessionListAndRender({ preserveActive: true });
    await loadActiveSessionHistory();
    return { success: true, sessionId };
  } catch (error) {
    return {
      success: false,
      error: resolveHostBridgeErrorMessage(error),
    };
  }
}

async function switchSessionFromHost(
  sessionId: string
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  const normalizedSessionId = sessionId.trim();
  if (normalizedSessionId === "") {
    return { success: false, error: "session id unavailable" };
  }

  try {
    await setActiveSession(normalizedSessionId);
    await loadSessionListAndRender({ preserveActive: true });
    await loadActiveSessionHistory();
    return { success: true, sessionId: normalizedSessionId };
  } catch (error) {
    return {
      success: false,
      error: resolveHostBridgeErrorMessage(error),
    };
  }
}

function registerOpencodeUiHostBridge(): void {
  window.OpencodeUiHostBridge = {
    openSession: openSessionFromHost,
    switchSession: switchSessionFromHost,
  };
}

function initSessionEvents(): void {
  initSessionEventsFromModule(sessionListContext());
}

function initChatEvents(): void {
  bindChatScrollTracking();
  initOpencodeUiChatEvents({
    byId,
    showToast,
    sendMessage,
    setSendButtonState,
    pruneLastMessages,
    clearChat,
    stageFileList,
    readClipboardAttachmentsFromEvent,
    readClipboardAttachmentsFromSystem,
    stageComposerAttachments,
    removeComposerAttachment,
    renderAttachmentTray,
  });

  dictationBinding?.dispose();
  dictationBinding = bindDictationTrigger({
    button: byId<HTMLButtonElement>("chat-dictation-btn"),
    textarea: byId<HTMLTextAreaElement>("chat-input"),
    targetId: "assistant-opencode-native",
    getLabels: () => ({
      idleTitle: t("chat.dictation.idleTitle"),
      listeningTitle: t("chat.dictation.listeningTitle"),
      transcribingTitle: t("chat.dictation.transcribingTitle"),
      listeningMessage: t("chat.dictation.listeningMessage"),
      preparingMessage: t("chat.dictation.preparingMessage"),
      emptyResultMessage: t("chat.dictation.emptyResultMessage"),
      insertedMessage: t("chat.dictation.insertedMessage"),
      transcribedMessage: (backend: string, durationMs: number): string =>
        t("chat.dictation.transcribedMessage", { backend, durationMs }),
      captureError: (message: string): string => t("chat.dictation.captureError", { message }),
      transcriptionError: (message: string): string =>
        t("chat.dictation.transcriptionError", { message }),
      androidIdleTitle: t("chat.dictation.idleTitle"),
      androidPreparingMessage: t("chat.dictation.preparingMessage"),
      androidListeningMessage: t("chat.dictation.listeningMessage"),
      androidTimeoutMessage: t("chat.dictation.androidTimeoutMessage"),
      androidError: (message: string): string =>
        t("chat.dictation.transcriptionError", { message }),
    }),
    showNotice: (message) => {
      showToast(message);
    },
    subscribeIngress: onAssistantTranscriptIngress,
  });
}

async function loadAgents(): Promise<void> {
  if (modeDropdown == null) {
    return;
  }

  try {
    const payload = await apiCall<unknown>("GET", "/agent");
    const items = normalizeAgentItems(payload);
    if (items.length === 0) {
      modeDropdown.setError(t("provider.none"));
      runtime.activeAgentId = null;
      await persistActiveAgentId(null);
      return;
    }

    const initial =
      runtime.activeAgentId != null && items.some((item) => item.value === runtime.activeAgentId)
        ? runtime.activeAgentId
        : (items[0]?.value ?? "");
    runtime.activeAgentId = initial !== "" ? initial : null;
    modeDropdown.setItems(items, runtime.activeAgentId ?? undefined);
    await persistActiveAgentId(runtime.activeAgentId);
  } catch {
    modeDropdown.setError(t("provider.error"));
  }
}

async function selectActiveModelKey(
  modelKey: string | null,
  options: { persistSelection?: boolean } = {}
): Promise<void> {
  await selectActiveModelKeyFromModule(providerContext(), modelKey, options);
}

async function updateModelPreferences(
  updater: Parameters<typeof updateModelPreferencesFromModule>[1]
): Promise<void> {
  await updateModelPreferencesFromModule(providerContext(), updater);
}

function refreshModelSettingsOverlay(): void {
  modelSettingsOverlayController?.refresh();
}

async function loadProviderContextAndModels(
  providerPayloadOverride?: unknown,
  configPayloadOverride?: unknown
): Promise<void> {
  await loadProviderContextAndModelsFromModule(
    providerContext(),
    providerPayloadOverride,
    configPayloadOverride
  );
}

function refreshInteractionDropdown(): void {
  const activeMode: RovoInteractionMode = runtime.activeInteractionMode;
  interactionDropdown?.setItems(buildInteractionModeItems(), activeMode);
}

function initSelects(): void {
  modeDropdown = setupCustomSelect("mode-dropdown", async (value: string) => {
    runtime.activeAgentId = value !== "" ? value : null;
    await persistActiveAgentId(runtime.activeAgentId);
  });

  modelDropdown = setupCustomSelect("model-dropdown", (value: string): void => {
    void selectActiveModelKey(value !== "" ? value : null, { persistSelection: true });
  });

  effortDropdown = setupCustomSelect("effort-dropdown", async (value: string) => {
    runtime.activeReasoningEffort = value !== "" ? value : null;
    await persistReasoningEffort(runtime.activeReasoningEffort);
  });

  interactionDropdown = setupCustomSelect("interaction-dropdown", async (value: string) => {
    runtime.activeInteractionMode =
      value === "plan-harder-local" || value === "change-approval" ? value : "off";
    await persistInteractionMode(runtime.activeInteractionMode);
  });
  refreshInteractionDropdown();
}

function initUtilityActions(): void {
  const copyUrlBtn = byId<HTMLButtonElement>("btn-copy-url");
  copyUrlBtn?.addEventListener("click", () => {
    void copyWorkspaceUrl();
  });

  modelSettingsOverlayController = createModelSettingsOverlayController({
    runtime,
    byId,
    showToast,
    updateModelPreferences,
    selectActiveModelKey: async (modelKey: string | null): Promise<void> => {
      await selectActiveModelKey(modelKey);
    },
  });
  modelSettingsOverlayController.init();
  initQuickPromptPanel({ showToast });
}

async function refreshLocalizedDynamicPanels(): Promise<void> {
  if (localeRefreshInFlight != null) {
    await localeRefreshInFlight;
    return;
  }

  localeRefreshInFlight = (async (): Promise<void> => {
    const refreshJobs = [
      loadSessionListAndRender({ preserveActive: true }),
      loadActiveSessionHistory({ respectViewport: true }),
      loadStatusContext(),
      loadToolsFinalSnapshot(),
      loadAgents(),
      loadProviderContextAndModels(),
      refreshQuickPromptPanel(),
    ];

    await Promise.allSettled(refreshJobs);
    refreshInteractionDropdown();
    await applyAssistantIdentityToChatEmpty(byId);
    modelSettingsOverlayController?.refresh();
  })().finally(() => {
    localeRefreshInFlight = null;
  });

  await localeRefreshInFlight;
}

function bindLocaleRefresh(): void {
  if (localeRefreshBound) {
    return;
  }

  localeRefreshBound = true;
  AppI18n.subscribe(() => {
    dictationBinding?.refresh();
    void refreshLocalizedDynamicPanels();
  });
}

async function initializeSessionSelection(
  resumeSessionId: string,
  resumeMode: string
): Promise<void> {
  await initializeSessionSelectionFromModule(bootstrapContext(), resumeSessionId, resumeMode);
}

function startPeriodicRefresh(): void {
  startPeriodicRefreshFromModule(bootstrapContext());
}

function startLiveMessageRefresh(): void {
  startLiveMessageRefreshFromModule(bootstrapContext());
}

export async function runOpencodeUiBootstrapPipeline(options: {
  deps: OpencodeUiBootstrapDeps;
  emitStage: (title: string, subtitle: string) => void;
  emitToolsReady: (payload: OpencodeUiToolsReadyPayload) => void;
}): Promise<void> {
  await runOpencodeUiBootstrapPipelineFromModule(options);
}

async function bootstrapOpencodeUiApp(): Promise<void> {
  await bootstrapOpencodeUiAppFromModule({
    runtime,
    initialUsageText: getInitialUsageText(),
    providerConfig: opencodeUiConfig,
    byId,
    setApiBaseUrl,
    setWorkspaceUrlLabel: (url: string) => {
      setWorkspaceUrlLabel(url, byId);
    },
    getLogoFallback: () => {
      getLogoFallback(byId);
    },
    updateUsagePlaceholders,
    initSelects,
    initUtilityActions,
    initSessionEvents,
    initChatEvents,
    sendStageToHost,
    sendToolsReadyToHost,
    runOpencodeUiBootstrapPipeline,
    reportBootstrapNotice: (error: unknown, defaultTitleKey: string) => {
      appendAssistantNotice(error, { defaultTitleKey });
    },
    deps: {
      checkHealth,
      loadStatusContext,
      waitForMcpServersSettled: async () => {
        return await waitForMcpServersSettled({ timeoutMs: 20000, intervalMs: 1000 });
      },
      loadToolsFinalSnapshot,
    },
    loadAgents,
    loadProviderContextAndModels,
    initializeSessionSelection,
    startPeriodicRefresh,
    startLiveMessageRefresh,
  });
}

function syncThemeFromQuery(): void {
  const theme = resolveThemeFromSearchParams(
    window.location.search,
    ThemeManager.getAvailableThemes()
  );
  if (theme == null) {
    return;
  }

  ThemeManager.set(theme, false);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("opencode-ui:mcp-changed", () => {
    void (async (): Promise<void> => {
      try {
        await waitForMcpServersSettled({ timeoutMs: 20000, intervalMs: 1000 });
        await loadToolsFinalSnapshot();
        await refreshRovoInteractionRuntime();
      } catch (_error) {}
    })();
  });

  void (async (): Promise<void> => {
    ThemeManager.init();
    syncThemeFromQuery();
    await bootstrapOpencodeUiI18n();
    await hydrateRuntimeFromSharedState();
    registerOpencodeUiHostBridge();
    await initializeRovoInteractionRuntime({
      draftText: draftInteractionText,
      submitText: submitInteractionText,
      showToast,
    });
    await applyAssistantIdentityToChatEmpty(byId);
    await bootstrapOpencodeUiApp();
    bindLocaleRefresh();
  })();
}

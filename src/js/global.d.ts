import type {
  ProviderConfig,
  ProviderScenarioProgressEvent,
  ProviderScenarioResult,
  ProviderTestProgressEvent,
  ProviderTestSuite,
} from "@shared/provider.js";
import type {
  Us1AcceptRemoteUserParams,
  Us1DeleteMailAccountParams,
  Us1DeleteMailAccountResult,
  Us1InviteRemoteUserParams,
  Us1MailAccountDraft,
  Us1MailAccountMutationResult,
  Us1RejectRemoteUserParams,
  Us1RemoteUserMutationResult,
  Us1SendMessageParams,
  Us1SendMessageResult,
  Us1SyncMessagesParams,
  Us1SyncMessagesResult,
  Us1SyncRemoteUsersParams,
} from "@shared/us1-mail.js";
import type { Us1RelayHealthCheckParams, Us1RelayHealthCheckResult } from "@shared/us1-relay.js";
import type {
  InstalledRoomRecord,
  RoomWorkspaceEntry,
  StartupRoomsSnapshot,
  StartupRoomsSyncResult,
} from "../types/rooms.js";
import type { LanguageDescriptor, LoadedLanguagePack, TranslationParams } from "../types/i18n.js";
import type {
  RoomToolCallRequest,
  RoomToolCallResult,
  RoomToolCancelRequest,
  RoomToolCancelResult,
  RoomToolProgressEvent,
} from "../types/room-tools.js";
import type {
  TranscriptIngressPayload,
  TranscriptManagedModelId,
  TranscriptManagedModelStatus,
  TranscriptRuntimeStatus,
  TranscriptSubmitIngressRequest,
  TranscriptSubmitIngressResult,
  TranscriptTranscriptionRequest,
  TranscriptTranscriptionResult,
} from "../types/transcript.js";
import type {
  TtsInstallModelResult,
  TtsManagedModelId,
  TtsManagedModelStatus,
  TtsRequest,
  TtsRuntimeStatus,
  TtsSpeakResult,
  TtsStatus,
  TtsStopResult,
} from "../types/tts.js";
import type {
  OperationAcquireResult,
  OperationCapability,
  OperationOwner,
  OperationReleaseResult,
  OperationsStatus,
} from "../types/operations.js";
import type {
  CaptureActionOutcome,
  CaptureAmbientListenerOptions,
  CaptureAmbientStatusPayload,
  CaptureDictationStatusPayload,
  CaptureImportedAsset,
  CaptureMediaIngressPayload,
  CaptureServiceStatus,
  CaptureTargetActionOptions,
  CaptureTorchOptions,
} from "../types/capture.js";
import type { SceneThemeRegistration } from "./scene-system/scene-theme-registry-contract.js";

export {};

type LooseObject = Record<string, unknown>;
type MessageRecord = LooseObject;
type MessagePart = LooseObject;
type MessageUpsertInput = LooseObject;
type PartUpdateInput = LooseObject;
type StoreEvent = LooseObject;
type PermissionEntry = LooseObject;
type QuestionEntry = LooseObject;
type OptimisticMessageResult = LooseObject;
type ToolRendererConfig = LooseObject;
type ToolCallData = LooseObject;
type HookType = string;
type HookCallback = (data: unknown) => unknown;
type RegistryListener = (...args: unknown[]) => unknown;

type AttachmentType = "file" | "image" | "text" | "agent";

type IPCResult = {
  success?: boolean;
  error?: string;
  errorKey?: string;
  errorParams?: TranslationParams;
  [key: string]: unknown;
};

type AttachmentRecord = {
  id: string;
  type: AttachmentType;
  name: string;
  path?: string | null;
  content?: string | null;
  dataUrl?: string | null;
  mimeType?: string;
  size?: number;
  createdAt: number;
};

type AttachmentInput = {
  type: AttachmentType;
  name?: string;
  path?: string;
  content?: string;
  dataUrl?: string;
  mimeType?: string;
  size?: number;
};

type SessionRecord = {
  id: string;
  title?: string;
  messageIds?: string[];
  status?: string;
  createdAt?: number;
  updatedAt?: number;
  instanceId?: string;
  [key: string]: unknown;
};

type SessionInfo = {
  agent?: string;
  providerId?: string;
  modelId?: string;
  [key: string]: unknown;
};

type SessionUsage = {
  tokens: number;
  cost: number;
};

type InstanceRecord = {
  id: string;
  folder: string;
  name?: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  url?: string;
  createdAt: number;
  updatedAt: number;
  currentSessionId?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

type InstanceStoreEvent = {
  type: string;
  instanceId?: string | null;
  [key: string]: unknown;
};

type SessionStoreEvent = {
  type: string;
  sessionId?: string | null;
  instanceId?: string | null;
  [key: string]: unknown;
};

type AttachmentStoreEvent = {
  type: string;
  sessionId?: string;
  instanceId?: string;
  attachment?: AttachmentRecord;
  attachmentId?: string;
};

type ToolRegistry = {
  register: (toolName: string, config: ToolRendererConfig) => unknown;
  registerRenderer: (toolName: string, config: ToolRendererConfig) => unknown;
  unregister: (toolName: string) => unknown;
  unregisterRenderer: (toolName: string) => unknown;
  addHook: (toolName: string, hookType: HookType, callback: HookCallback) => unknown;
  removeHook: (toolName: string, hookType: HookType, callback: HookCallback) => unknown;
  subscribe: (listener: RegistryListener) => (() => void) | undefined;
  getRegisteredTools: () => string[];
  setDefault: (config: ToolRendererConfig) => void;
  renderToolCard: (toolCall: ToolCallData) => string;
  updateStatus: (toolCall: ToolCallData, newStatus: string) => void;
  renderInput: (toolCall: ToolCallData) => string;
  renderOutput: (toolCall: ToolCallData) => string;
  shouldAutoCollapse: (toolCall: ToolCallData) => boolean;
  get: (toolName: string) => unknown;
  has: (toolName: string) => boolean;
  _copyToClipboard: (btn: HTMLElement) => void;
  _executeHooks: (toolName: string, hookType: HookType, data: unknown) => void;
};

declare global {
  interface Window {
    // NOTE: API exposed by the Electron preload layer (electron/preload.cjs).
    electronAPI?: ElectronAPI;
    roomAPI?: {
      ready: (payload?: Record<string, unknown>) => boolean;
      sendCommand: (command: string, payload?: Record<string, unknown>) => boolean;
      sendEvent: (type: string, payload?: Record<string, unknown>) => boolean;
      close?: () => boolean;
      onHostMessage: (callback: (payload: unknown) => void) => () => void;
      offHostMessage: (callback: (payload: unknown) => void) => void;
    };

    updateChatListOnNewEntry?: (
      provider: string,
      selectedId: string,
      options?: { scroll?: boolean }
    ) => Promise<void>;
    refreshAnalyzeMessages?: (provider: string) => Promise<void>;
    ConversationListManager?: {
      refresh: (options?: Record<string, unknown>) => Promise<void>;
    };
    OpencodeUiHostBridge?: {
      openSession?: (
        title?: string
      ) => Promise<{ success: boolean; sessionId?: string; error?: string }>;
      switchSession?: (
        sessionId: string
      ) => Promise<{ success: boolean; sessionId?: string; error?: string }>;
    };

    __app_settings_unsub?: () => void;
    __app_provider_config?: ProviderConfig;
    __providerScenarioLocks?: Record<
      string,
      {
        runId?: string;
        scenarioId?: string;
        updatedAt?: number;
      }
    >;

    OpenCodeConfig?: {
      serverUrl: string;
      getServerUrl: () => string;
      setServerUrl: (url: string) => void;
      get: (key: string, defaultValue?: unknown) => unknown;
      isEnabled: (feature: string) => boolean;
      getStatusText: (status: string) => string;
      getAnsiColor: (code: number) => string | null;
      maxHistoryItems: number;
      commands: Array<{ name: string; description: string }>;
      [key: string]: unknown;
    };

    listFileSystem?: (path: string, options?: Record<string, unknown>) => Promise<unknown>;

    APIClient?: {
      listAgents?: () => Promise<unknown>;
      listProviders?: () => Promise<unknown>;
      listFileSystem?: (path: string, options?: Record<string, unknown>) => Promise<unknown>;
      updateSessionAgent?: (sessionId: string, agentName: string) => Promise<unknown>;
      updateSessionModel?: (
        sessionId: string,
        providerId: string,
        modelId: string
      ) => Promise<unknown>;
      retry?: (sessionId?: string) => Promise<unknown>;
      connect?: () => Promise<{ success: boolean; sessionId?: string; error?: string }>;
      sendMessage?: (
        sessionId: string,
        message: string
      ) => Promise<{ success?: boolean; error?: string }>;
      createSession?: (title: string) => Promise<{ sessionId?: string }>;
      cancel?: () => Promise<unknown>;
      respondToPermission?: (permissionId: string, approved: boolean) => Promise<unknown>;
      respondToQuestion?: (questionId: string, answer: string) => Promise<unknown>;
      compact?: () => Promise<unknown>;
      getSessions?: () => Promise<{ sessions: unknown[] }>;
      getSessionMessages?: (sessionId: string) => Promise<{ messages: unknown[] }>;
      renameSession?: (sessionId: string, title: string) => Promise<unknown>;
      deleteSession?: (sessionId: string) => Promise<unknown>;
      revertConversation?: (messageId: string) => Promise<{ success: boolean; error?: string }>;
      forkConversation?: (messageId: string) => Promise<unknown>;
      searchFiles?: (query: string, limit: number) => Promise<{ files: unknown[] }>;
      listSessions?: () => Promise<unknown[]>;
      getMCPServers?: () => Promise<{ servers: unknown[] }>;
      getPlugins?: () => Promise<{ plugins: unknown[] }>;
      getBackgroundShells?: () => Promise<{ shells: unknown[] }>;
      status?: () => Promise<unknown>;
      setServerUrl?: (url: string) => void;
      cancelAllRequests?: () => void;
      [key: string]: unknown;
    };

    SSEClient?: {
      connect?: (serverUrl?: string, authToken?: string) => Promise<unknown>;
      disconnect?: () => void;
      on?: (event: string, handler: (data: unknown) => unknown) => void;
      [key: string]: unknown;
    };

    MessageStore?: {
      createMessage?: (data: MessageUpsertInput) => MessageRecord;
      updateMessage?: (id: string, data: Partial<MessageRecord>) => void;
      getMessage?: (id: string) => unknown;
      getSessionMessages?: (sessionId: string) => MessageRecord[];
      hasMessage?: (id: string) => boolean;
      upsertMessage?: (data: MessageUpsertInput) => MessageRecord;
      updateMessageStatus?: (id: string, status: string) => void;
      updateTextPart?: (messageId: string, content: string, append: boolean) => void;
      addOrUpdatePart?: (data: PartUpdateInput) => MessagePart;
      getMessageContent?: (id: string) => string;
      getMessageParts?: (id: string) => MessagePart[];
      removeMessage?: (id: string) => void;
      clearSession?: (sessionId: string) => void;
      markMessageSent?: (id: string) => void;
      markMessageFailed?: (id: string, error: unknown) => void;
      retryMessage?: (id: string) => boolean;
      replaceMessageId?: (data: { oldId: string; newId: string }) => void;
      createOptimisticMessage?: (data: unknown) => OptimisticMessageResult;
      upsertPermission?: (data: PermissionEntry) => unknown;
      removePermission?: (id: string) => void;
      getPermissionQueue?: () => PermissionEntry[];
      upsertQuestion?: (data: QuestionEntry) => unknown;
      removeQuestion?: (id: string) => void;
      getQuestionQueue?: () => QuestionEntry[];
      subscribe?: (callback: (event: StoreEvent) => void) => () => void;
      createId?: (prefix: string) => string;
      [key: string]: unknown;
    };

    SessionStore?: {
      getCurrentSessionId?: () => string | null;
      getActiveSession?: () => SessionRecord | null;
      addSession?: (session: SessionRecord) => void;
      setActiveSession?: (sessionId: string) => void;
      createSession?: () => SessionRecord;
      getSessionInfo?: (sessionId: string) => SessionInfo | undefined;
      getSessionUsage?: (sessionId: string) => SessionUsage | undefined;
      getTotalUsage?: () => SessionUsage;
      renameSession?: (sessionId: string, title: string) => Promise<boolean>;
      deleteSession?: (sessionId: string) => Promise<void>;
      setCurrentSession?: (sessionId: string) => void;
      upsertSession?: (sessionId: string, data: Partial<SessionRecord>) => SessionRecord;
      getAllSessions?: () => SessionRecord[];
      getSession?: (sessionId: string) => SessionRecord | undefined;
      getCurrentSession?: () => SessionRecord | null;
      removeSession?: (sessionId: string) => void;
      updateStatus?: (status: string) => void;
      updateSessionUsage?: (sessionId: string, usage: SessionUsage) => void;
      updateSessionInfo?: (sessionId: string, info: SessionInfo) => void;
      syncFromActiveInstance?: () => void;
      clearInstance?: (instanceId: string) => void;
      clear?: () => void;
      subscribe?: (callback: (event: SessionStoreEvent) => void) => () => void;
      [key: string]: unknown;
    };

    InstanceStore?: {
      getActiveInstanceId?: () => string | null;
      getActiveInstance?: () => InstanceRecord | null;
      setActiveInstance?: (id: string | null) => void;
      createInstance?: (data: { folder: string; name?: string; url?: string }) => InstanceRecord;
      removeInstance?: (id: string) => void;
      getInstance?: (id: string) => InstanceRecord | undefined;
      getInstancesArray?: () => InstanceRecord[];
      getInstanceCount?: () => number;
      setInstanceStatus?: (id: string, status: string, reason?: string | null) => void;
      findByFolder?: (folder: string) => InstanceRecord | null;
      getActiveInstancePath?: () => string | null;
      getActiveInstanceSessionId?: () => string | null;
      getActiveInstanceUrl?: () => string | null;
      getActiveInstanceName?: () => string | null;
      getAuthorizationHeader?: (instanceId: string) => Promise<string | null>;
      createWorkspace?: (data: { folder: string; name?: string }) => Promise<InstanceRecord | null>;
      clear?: () => void;
      getActiveInstanceStatus?: () => string;
      isActiveInstanceConnected?: () => boolean;
      getActiveInstanceProperty?: (property: string, defaultValue?: unknown) => unknown;
      hasInstances?: () => boolean;
      getDisconnectionReason?: (instanceId: string) => string | null;
      nextInstance?: () => string | null;
      prevInstance?: () => string | null;
      switchToIndex?: (index: number) => string | null;
      subscribe?: (callback: (event: InstanceStoreEvent) => void) => () => void;
      [key: string]: unknown;
    };

    AttachmentStore?: {
      getAttachments?: (sessionId: string, instanceId?: string) => AttachmentRecord[];
      addAttachment?: (
        sessionId: string,
        attachment: AttachmentInput,
        instanceId?: string
      ) => AttachmentRecord | null;
      addFileAttachment?: (
        sessionId: string,
        file: File,
        instanceId?: string
      ) => Promise<AttachmentRecord | null>;
      addImageAttachment?: (
        sessionId: string,
        imageData: File | Blob,
        instanceId?: string
      ) => Promise<AttachmentRecord | null>;
      addTextAttachment?: (
        sessionId: string,
        content: string,
        name?: string,
        instanceId?: string
      ) => AttachmentRecord | null;
      removeAttachment?: (sessionId: string, attachmentId: string, instanceId?: string) => boolean;
      clearAttachments?: (sessionId: string, instanceId?: string) => void;
      getAttachmentsForAPI?: (
        sessionId: string,
        instanceId?: string
      ) => Array<Record<string, unknown>>;
      handlePaste?: (
        event: ClipboardEvent,
        sessionId: string,
        instanceId?: string
      ) => Promise<AttachmentRecord[]>;
      handleDrop?: (
        event: DragEvent,
        sessionId: string,
        instanceId?: string
      ) => Promise<AttachmentRecord[]>;
      subscribe?: (callback: (event: AttachmentStoreEvent) => void) => () => void;
      [key: string]: unknown;
    };

    StoreBridge?: {
      handleEvent?: (eventType: string, data: unknown, instanceId?: string | null) => void;
      setLastUserMessage?: (message: string, instanceId?: string) => void;
      addOptimisticUserMessage?: (sessionId: string, content: string, messageId?: string) => string;
      markUserMessageSent?: (messageId: string) => void;
      markUserMessageFailed?: (messageId: string, errorInfo?: unknown) => void;
      retryMessage?: (messageId: string) => boolean;
      replaceMessageId?: (tempId: string, realId: string) => void;
      getPendingMessageContent?: (messageId: string) => string | null;
      hasPendingMessages?: () => boolean;
      getCurrentMessageId?: () => string | null;
      clear?: () => void;
      setDebug?: (enabled: boolean) => void;
      [key: string]: unknown;
    };

    PartNormalizer?: {
      normalize?: (part: unknown) => unknown;
      normalizeAll?: (parts: unknown[]) => unknown[];
      decodeHtml?: (text: string) => string;
      needsNormalization?: (part: unknown) => boolean;
      [key: string]: unknown;
    };

    PermissionModal?: {
      show?: (data: unknown) => void;
      hide?: () => void;
      [key: string]: unknown;
    };

    QuestionModal?: {
      show?: (data: unknown) => void;
      hide?: () => void;
      [key: string]: unknown;
    };

    MessageRenderer?: {
      render?: (message: unknown) => HTMLElement;
      [key: string]: unknown;
    };

    PromptHandler?: {
      setProcessing?: (processing: boolean) => void;
      clearValue?: () => void;
      focus?: () => void;
      getValue?: () => string;
      [key: string]: unknown;
    };

    ToolRenderer?: {
      createToolCard?: (toolCall: unknown) => HTMLElement;
      updateToolCard?: (toolId: string, update: unknown) => void;
      appendOutput?: (toolId: string, delta: string) => void;
      toggleCollapse?: (toolId: string) => void;
      clear?: () => void;
      addDiffViewer?: (toolId: string, diff: unknown) => void;
      _parseAnsi?: (text: string) => string;
      _copySection?: (btn: HTMLElement) => void;
      [key: string]: unknown;
    };

    AgentModelSelector?: {
      show?: () => void;
      hide?: () => void;
      update?: () => void;
      initialize?: () => Promise<void>;
      getCurrentAgent?: () => unknown;
      getCurrentModel?: () => unknown;
      getAvailableAgents?: () => unknown[];
      getFlatModels?: () => unknown[];
      selectAgent?: (agentName: string) => Promise<void>;
      selectModel?: (providerId: string, modelId: string) => Promise<void>;
      setFromSession?: (info: unknown) => void;
      setFolderPath?: (folderPath: string) => void;
      _loadSavedPreference?: () => Promise<unknown>;
      subscribe?: (callback: (event: unknown) => void) => () => void;
      _currentAgent?: string;
      _currentModel?: unknown;
      _providers?: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>;
      [key: string]: unknown;
    };

    InstanceTabs?: {
      init?: (
        container: HTMLElement,
        callbacks?: {
          onSelect?: (id: string) => void;
          onClose?: (id: string) => void;
          onNew?: () => void;
        }
      ) => void;
      render?: () => void;
      destroy?: () => void;
      [key: string]: unknown;
    };

    ToolRendererRegistry?: ToolRegistry;

    BashRenderer?: {
      render?: (data: unknown) => HTMLElement;
      [key: string]: unknown;
    };

    ReadRenderer?: {
      render?: (data: unknown) => HTMLElement;
      [key: string]: unknown;
    };

    WriteRenderer?: {
      render?: (data: unknown) => HTMLElement;
      [key: string]: unknown;
    };

    OpenCodeApp?: {
      init: () => Promise<void>;
      destroy: () => void;
      _showToast?: (message: string, type: "success" | "error" | "info" | "warning") => void;
      _createInstance?: (data: { folder: string; name?: string }) => Promise<void>;
      _closeInstance?: (instanceId: string) => Promise<void>;
    };

    __ThemeManager?: unknown;

    __setDisabledMcpServers?: (list: string[]) => void;
    __lastMcpServers?: Record<string, string>;

    copyCodeBlock?: (btn: HTMLElement) => void;
  }

  interface ElectronAPI {
    getStartupFlags: () => {
      startPage: string | null;
      autoConnect: boolean;
      uiMode: "classic" | "scene";
      sceneEditor: boolean;
      sceneDebug: boolean;
      roomsSnapshot: StartupRoomsSnapshot | null;
    };
    loadSettings: () => Promise<Record<string, unknown>>;
    saveSettings: (settings: Record<string, unknown>) => Promise<boolean>;
    us1UpsertMailAccount: (
      draft: Us1MailAccountDraft,
      options?: { verifyAfterSave?: boolean }
    ) => Promise<Us1MailAccountMutationResult>;
    us1VerifyMailAccount: (params: {
      mailAccountId: string;
    }) => Promise<Us1MailAccountMutationResult>;
    us1DeleteMailAccount: (
      params: Us1DeleteMailAccountParams
    ) => Promise<Us1DeleteMailAccountResult>;
    us1InviteRemoteUser: (
      params: Us1InviteRemoteUserParams
    ) => Promise<Us1RemoteUserMutationResult>;
    us1AcceptRemoteUser: (
      params: Us1AcceptRemoteUserParams
    ) => Promise<Us1RemoteUserMutationResult>;
    us1RejectRemoteUser: (
      params: Us1RejectRemoteUserParams
    ) => Promise<Us1RemoteUserMutationResult>;
    us1SyncRemoteUsers: (params?: Us1SyncRemoteUsersParams) => Promise<Us1RemoteUserMutationResult>;
    us1SendMessage: (params: Us1SendMessageParams) => Promise<Us1SendMessageResult>;
    us1SyncMessages: (params?: Us1SyncMessagesParams) => Promise<Us1SyncMessagesResult>;
    us1RelayHealthCheck: (params?: Us1RelayHealthCheckParams) => Promise<Us1RelayHealthCheckResult>;
    i18nListLanguages: () => Promise<LanguageDescriptor[]>;
    i18nLoadLanguage: (locale: string) => Promise<LoadedLanguagePack | null>;

    readFile: (path: string) => Promise<string | null>;
    loadProtocols: () => Promise<{
      success: boolean;
      protocols?: Record<string, string>;
      message?: string;
    }>;
    saveProtocol: (key: string, content: string) => Promise<{ success: boolean; message?: string }>;
    roomsListWorkspace: () => Promise<{
      success: boolean;
      rooms?: RoomWorkspaceEntry[];
      error?: string;
    }>;
    roomsListInstalled: () => Promise<{
      success: boolean;
      rooms?: InstalledRoomRecord[];
      error?: string;
    }>;
    roomsSyncLinkedStartup: () => Promise<StartupRoomsSyncResult>;
    roomsInstallFromWorkspace: (roomId: string) => Promise<{
      success: boolean;
      room?: InstalledRoomRecord;
      error?: string;
      restartRequired?: boolean;
    }>;
    roomsRemoveInstalled: (payload: { roomId: string; deleteData?: boolean }) => Promise<{
      success: boolean;
      room?: InstalledRoomRecord;
      error?: string;
      restartRequired?: boolean;
    }>;
    roomsDeleteWorkspace: (payload: { roomId: string; deleteData?: boolean }) => Promise<{
      success: boolean;
      path?: string;
      error?: string;
      restartRequired?: boolean;
    }>;
    roomsExportToWorkspace: (payload: { roomId: string; overwrite?: boolean }) => Promise<{
      success: boolean;
      room?: InstalledRoomRecord;
      path?: string;
      error?: string;
    }>;
    roomsPackageFromWorkspace: (payload: { roomId: string; outputFile?: string }) => Promise<{
      success: boolean;
      path?: string;
      error?: string;
    }>;
    roomsImportBundle: (payload: { bundleFile: string; overwriteWorkspace?: boolean }) => Promise<{
      success: boolean;
      room?: InstalledRoomRecord;
      path?: string;
      error?: string;
      restartRequired?: boolean;
    }>;
    sceneThemesListInstalled: () => Promise<{
      success: boolean;
      themes?: SceneThemeRegistration[];
      error?: string;
    }>;
    sceneThemesPackageInstalled: (payload: { themeId: string; outputFile?: string }) => Promise<{
      success: boolean;
      path?: string;
      themeId?: string;
      theme?: SceneThemeRegistration;
      error?: string;
    }>;
    sceneThemesImportBundle: (payload: {
      bundleFile: string;
      onConflict?: "reject" | "replace" | "rename";
    }) => Promise<{
      success: boolean;
      path?: string;
      themeId?: string;
      theme?: SceneThemeRegistration;
      error?: string;
    }>;
    readDirectoryFiles: (
      dirPath: string
    ) => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>;
    showOpenDialog: (
      options: Record<string, unknown>
    ) => Promise<{ canceled: boolean; filePaths: string[] }>;
    backupCreate: (payload: {
      scopeIds?: string[];
      presetId?: string;
      outputPath?: string;
      label?: string;
      note?: string;
      createdBy?: string;
    }) => Promise<{
      success: boolean;
      bundlePath: string;
      bundle: Record<string, unknown>;
      selectedScopes: string[];
      totalBytes: number;
    }>;
    backupList: (payload?: { limit?: number }) => Promise<
      Array<{
        filePath: string;
        createdAt: string | null;
        label: string | null;
        selectedScopes: string[];
        totalBytes: number | null;
        restoreMode: string | null;
        invalid?: boolean;
      }>
    >;
    backupDelete: (payload: { filePath: string }) => Promise<{
      success: boolean;
      filePath: string;
    }>;
    backupScopes: () => Promise<
      Array<{
        id: string;
        label: string;
        category: string;
        enabledByDefault: boolean;
        riskLevel: string;
        requiresColdRestore: boolean;
        restartTargets: string[];
        include: string[];
        exclude: string[];
      }>
    >;
    backupPresets: () => Promise<Array<{ id: string; label: string; scopeIds: string[] }>>;
    backupInspect: (payload: { filePath: string }) => Promise<{
      filePath: string;
      manifest: Record<string, unknown>;
      files: Array<Record<string, unknown>>;
      checksums: Record<string, unknown>;
    }>;
    backupPreview: (payload: { filePath: string; scopeIds?: string[] }) => Promise<{
      success: boolean;
      filePath: string;
      selectedScopes: string[];
      availableScopes: string[];
      requiresColdRestore: boolean;
      restartTargets: string[];
      riskLevel: string;
      warningCount: number;
      warnings: string[];
      fileCount: number;
      overwrittenFilesCount: number;
    }>;
    backupRestore: (payload: {
      filePath: string;
      scopeIds?: string[];
      createdBy?: string;
      safetyBackup?: boolean;
    }) => Promise<{
      success: boolean;
      restoredScopes: string[];
      restoredFiles: number;
      bundlePath: string;
    }>;
    openTerminal: (path: string) => Promise<{ success: boolean; error?: string }>;
    assistantRuntimeRead: () => Promise<{
      success: boolean;
      state?: {
        workflowSessionId: string;
        desiredMode: "terminal" | "soft" | "ghost-agent";
        phase: "idle" | "preparing-handoff" | "in-ghost" | "returning";
        updatedAt: string;
      };
    }>;
    assistantRuntimeWrite: (payload: Record<string, unknown>) => Promise<{
      success: boolean;
      state?: {
        workflowSessionId: string;
        desiredMode: "terminal" | "soft" | "ghost-agent";
        phase: "idle" | "preparing-handoff" | "in-ghost" | "returning";
        updatedAt: string;
      };
    }>;
    rovoInteractionContextRead: () => Promise<{
      success: boolean;
      appMode?: "terminal" | "app" | "ghost-agent" | "transitioning" | "conflict";
      effectiveMode?:
        | "terminal"
        | "app"
        | "ghost-agent"
        | "transitioning"
        | "conflict"
        | "opencode-terminal-mode"
        | "other-provider-cli";
      opencodeServerRunning?: boolean;
      terminalOwner?: "none" | "opencode" | "other-provider" | "opencode-server";
      cliProvider?: string | null;
    }>;
    memorySearch: (params: Record<string, unknown>) => Promise<
      IPCResult & {
        data?: {
          items?: Array<Record<string, unknown>>;
        };
      }
    >;
    memoryStats: (params?: Record<string, unknown>) => Promise<IPCResult>;
    memoryDelete: (params: Record<string, unknown>) => Promise<IPCResult>;
    memoryUpdate: (params: Record<string, unknown>) => Promise<IPCResult>;
    memoryWrite: (params: Record<string, unknown>) => Promise<IPCResult>;
    memoryPrune: (params?: Record<string, unknown>) => Promise<IPCResult>;
    memoryDeleteAll: (params?: Record<string, unknown>) => Promise<IPCResult>;
    shellOpenPath: (path: string) => Promise<string>;
    showMessageBox: (
      options: Record<string, unknown>
    ) => Promise<{ response: number; checkboxChecked: boolean }>;
    copyToAssets: (
      srcPath: string,
      role: string,
      accountInfo?: Record<string, unknown> | null
    ) => Promise<{ path: string } | null>;
    deleteAsset: (assetPath: string) => Promise<IPCResult>;
    copyFileTo: (srcPath: string, destDir: string) => Promise<IPCResult & { path?: string }>;
    openPath: (path: string) => Promise<IPCResult>;

    fmEnsureDirs: (scope: string) => Promise<IPCResult & { paths: Record<string, string> }>;
    fmTempPath: (prefix: string, ext: string) => Promise<{ path: string }>;
    fmWriteFileAtomic: (payload: Record<string, unknown>) => Promise<IPCResult & { path?: string }>;
    roomToolsCall: (request: RoomToolCallRequest) => Promise<RoomToolCallResult>;
    roomToolsCancel: (request: RoomToolCancelRequest) => Promise<RoomToolCancelResult>;
    onRoomToolsProgress: (callback: (event: RoomToolProgressEvent) => void) => void;
    offRoomToolsProgress: (callback: (event: RoomToolProgressEvent) => void) => void;
    fmArchiveWrite: (
      meta: Record<string, unknown>,
      files: Array<Record<string, unknown>>
    ) => Promise<IPCResult | undefined>;

    runProviderScenario: (params: {
      slot: "ai0" | "ai1" | "ai2";
      scenarioId: string;
      syncMode?: "soft" | "full" | "clean";
    }) => Promise<ProviderScenarioResult>;
    cancelProviderScenario: (params: { runId: string }) => Promise<{
      success: boolean;
      runId: string;
      cancelled: boolean;
    }>;
    testProvider: (params: { slot: "ai0" | "ai1" | "ai2" }) => Promise<ProviderTestSuite>;
    onProviderScenarioProgress: (callback: (event: ProviderScenarioProgressEvent) => void) => void;
    offProviderScenarioProgress: (callback: (event: ProviderScenarioProgressEvent) => void) => void;
    onProviderTestProgress: (callback: (event: ProviderTestProgressEvent) => void) => void;
    offProviderTestProgress: (callback: (event: ProviderTestProgressEvent) => void) => void;

    commandInit: () => Promise<{ jobs: Array<Record<string, unknown>> }>;
    commandWrite: (item: Record<string, unknown>) => Promise<IPCResult>;
    commandMove: (id: string, status: string, reason?: string) => Promise<IPCResult>;
    commandPaths: () => Promise<Record<string, string>>;
    commandStageAttachments: (
      payload: Record<string, unknown>
    ) => Promise<
      IPCResult & { staged: Array<Record<string, unknown>>; temp: string[]; commandDir: string }
    >;
    commandStageTemp: (
      payload: Record<string, unknown>
    ) => Promise<IPCResult & { staged: string[] }>;
    commandCleanupTemp: (payload: Record<string, unknown>) => Promise<IPCResult>;
    commandMoveFailed: (payload: Record<string, unknown>) => Promise<IPCResult>;
    commandArchiveCopy: (
      payload: Record<string, unknown>
    ) => Promise<IPCResult & { path?: string }>;
    commandCleanupJob: (payload: Record<string, unknown>) => Promise<IPCResult>;

    dbGetConversations: (
      payload: Record<string, unknown>
    ) => Promise<IPCResult & { data?: Array<Record<string, unknown>> }>;
    dbUpdateConversation: (conversation: Record<string, unknown>) => Promise<IPCResult>;
    dbDeleteConversation: (payload: Record<string, unknown>) => Promise<IPCResult>;
    dbGetMessages: (
      payload: Record<string, unknown>
    ) => Promise<IPCResult & { data?: Array<Record<string, unknown>> }>;
    dbSyncMessages: (
      payload: Record<string, unknown>
    ) => Promise<
      IPCResult & { count?: number; added?: number; total?: number; conversationId?: string }
    >;
    dbSearchMessages: (
      payload: Record<string, unknown>
    ) => Promise<IPCResult & { data?: Array<Record<string, unknown>> }>;
    dbSaveAttachment: (payload: Record<string, unknown>) => Promise<IPCResult>;
    dbSaveAttachmentContent: (payload: Record<string, unknown>) => Promise<IPCResult>;

    archiveSync: (payload: Record<string, unknown>) => Promise<IPCResult>;
    readArchivesIndex: () => Promise<Array<Record<string, unknown>>>;
    writeArchivesIndex: (index: Array<Record<string, unknown>>) => Promise<IPCResult>;
    removeArchive: (folderName: string) => Promise<void>;

    screenshot: (
      options?: Record<string, unknown>
    ) => Promise<IPCResult & { path?: string; base64?: string }>;
    screenshotCapture: (
      options?: Record<string, unknown> | string
    ) => Promise<IPCResult & { path?: string; base64?: string; data?: string }>;
    capturePage: (type?: string, region?: unknown) => Promise<IPCResult & { data?: string }>;
    captureWebContentsPage: (
      targetContentsId: number,
      region?: unknown
    ) => Promise<IPCResult & { data?: string }>;

    deviceAction: (action: string, payload?: unknown) => Promise<IPCResult>;

    whisperLoad: (
      params?: Record<string, unknown>,
      extra?: unknown
    ) => Promise<IPCResult & { text?: string }>;
    whisperSave: (
      params: { accountId: string; payload?: unknown } | string,
      data?: unknown
    ) => Promise<IPCResult>;

    googledriveStartAuth: () => Promise<IPCResult & { authUrl?: string }>;
    googledriveExchangeCode: (code: string) => Promise<IPCResult>;
    googledriveUpload: (
      payload: Record<string, unknown>
    ) => Promise<
      IPCResult & { url?: string; uploadedLinks?: string[]; uploaded?: number; errors?: string[] }
    >;
    googledriveDisconnect: () => Promise<IPCResult>;

    catboxUpload: (payload: Record<string, unknown>) => Promise<IPCResult & { url?: string }>;
    uguuUpload: (payload: Record<string, unknown>) => Promise<IPCResult & { url?: string }>;

    windowMinimize: () => void;
    windowToggleFullscreen: () => void;
    windowClose: () => void;
    windowMinimizeToTray: () => void;
    appRestart: (options?: {
      forceFullRestart?: boolean;
      uiMode?: "classic" | "scene";
      sceneEditor?: boolean;
      sceneDebug?: boolean;
    }) => Promise<{ success: boolean; message?: string }>;

    logger: {
      appendBatch: (entries: unknown[]) => Promise<{ success: boolean; error?: string }>;
      getSessionId: () => Promise<string>;
      getEarlyLogs: () => Promise<
        Array<{
          level: string;
          source: string;
          message: string;
          timestamp: string;
          visibility: 1 | 2 | 3;
        }>
      >;
      readAllLogs: (sessionId?: string | null) => Promise<unknown>;
      queryLogs: (query: Record<string, unknown>) => Promise<unknown>;
      listSessions: () => Promise<unknown>;
      deleteInactiveSessions: () => Promise<{
        deletedCount: number;
        preservedCount: number;
        apps: Array<{
          app: "app" | "mcp-server" | "ghost-agent" | "android-companion";
          latestSessionId: string | null;
          activeSessionId: string | null;
          deletedSessionIds: string[];
          preservedSessionIds: string[];
        }>;
      }>;
      getAppState: () => Promise<unknown>;
      writeStateSnapshot: () => Promise<{ success: boolean }>;
      setupWebviewLogger: (
        webviewId: number,
        slot: string,
        provider: string
      ) => Promise<{ success: boolean; error?: string }>;
      generateCorrelationId: (prefix: string) => Promise<string>;
      readConsoleLogs: (tail: number) => Promise<unknown>;
      readErrorLogs: (tail: number) => Promise<unknown>;
      getLogPaths: () => Promise<{
        console: string;
        error: string;
        sessionDir: string;
        logDir: string;
      }>;
      onConsoleLogForward: (
        callback: (data: {
          level: string;
          source?: string;
          message?: string;
          context?: unknown;
          args?: unknown[];
          visibility?: 1 | 2 | 3;
        }) => void
      ) => () => void;
    };

    logWrite: (payload: Record<string, unknown>) => Promise<IPCResult>;
    getSessionId: () => Promise<string>;
    getEarlyLogs: () => Promise<
      Array<{
        level: string;
        source: string;
        message: string;
        timestamp: string;
        visibility: 1 | 2 | 3;
      }>
    >;
    onConsoleLogForward: (
      callback: (data: {
        level: string;
        source?: string;
        message?: string;
        context?: unknown;
        args?: unknown[];
        visibility?: 1 | 2 | 3;
      }) => void
    ) => () => void;

    ipcRenderer: {
      on: (channel: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (channel: string, callback: (...args: unknown[]) => void) => void;
    };

    setupWebviewLogger: (webContentsId: number, ...args: unknown[]) => Promise<IPCResult>;
    getPreloadPath: (type: string) => Promise<string>;
    getProviderConfig: (providerId: string) => Promise<Record<string, unknown>>;
    sendToHost?: (channel: string, data?: unknown) => void;

    generateTree: (
      basePath: string,
      options?: Record<string, unknown>
    ) => Promise<IPCResult & { path?: string; fileName?: string; lines?: number }>;

    opencodeStart: (options?: Record<string, unknown>) => Promise<IPCResult>;
    opencodeStop: () => Promise<IPCResult>;
    opencodeStatus: () => Promise<{ running: boolean; port?: number }>;

    assistantConnect: (provider: string, options?: Record<string, unknown>) => Promise<IPCResult>;
    assistantDisconnect: () => Promise<IPCResult>;
    assistantStatus: () => Promise<{ connected: boolean }>;
    assistantGetConfig: (providerId: string) => Promise<Record<string, unknown>>;
    onAssistantDisconnected: (callback: () => void) => () => void;

    opencodeServeStart: (options?: { port?: number; cors?: string[] }) => Promise<{
      success: boolean;
      port?: number;
      url?: string;
      workspacePath?: string;
      pid?: number;
      startTime?: number;
      alreadyRunning?: boolean;
      error?: string;
    }>;
    opencodeServeStop: () => Promise<{
      success: boolean;
      error?: string;
    }>;
    opencodeServeStatus: () => Promise<{
      running: boolean;
      port?: number;
      url?: string;
      pid?: number;
      startTime?: number;
    }>;
    llmServeStart: (payload?: { slot?: string; port?: number }) => Promise<{
      running: boolean;
      port?: number;
      url?: string;
      activeSlots?: string[];
      source?: "managed" | "external";
      error?: string;
    }>;
    llmServeStop: (payload?: { slot?: string; force?: boolean }) => Promise<{
      running: boolean;
      port?: number;
      url?: string;
      activeSlots?: string[];
      source?: "managed" | "external";
      error?: string;
    }>;
    llmServeStatus: () => Promise<{
      running: boolean;
      port?: number;
      url?: string;
      activeSlots?: string[];
      source?: "managed" | "external";
    }>;
    opencodeServeFindPort: (
      start?: number,
      end?: number
    ) => Promise<{
      port?: number;
      error?: string;
    }>;
    opencodeServeFindRunning: (
      start?: number,
      end?: number
    ) => Promise<{
      running: boolean;
      port?: number;
      url?: string;
      workspacePath?: string;
      error?: string;
    }>;
    opencodeServeDoctor: () => Promise<{
      success: boolean;
      available: boolean;
      command: string;
      version?: string;
      resolvedPath?: string;
      error?: string;
    }>;
    opencodeCheckUpdates: (installedVersion: string) => Promise<{
      success: boolean;
      installedVersion: string;
      latestVersion?: string;
      updateAvailable?: boolean;
      releaseUrl?: string;
      error?: string;
    }>;
    opencodeLaunchInstall: () => Promise<{
      success: boolean;
      command: string;
      installUrl: string;
      fallbackToBrowser?: boolean;
      error?: string;
    }>;

    opencodeUiApiProxy: (options: { url: string; method: string; body?: string }) => Promise<{
      success: boolean;
      data?: Record<string, unknown>;
      error?: string;
      status?: number;
    }>;

    opencodeUiFsEnsureSession: (
      sessionId: string,
      title?: string,
      dbPath?: string
    ) => Promise<{
      success: boolean;
      created?: boolean;
      error?: string;
    }>;
    opencodeUiFsListSessions: (dbPath?: string) => Promise<{
      success: boolean;
      sessions?: Array<{
        id: string;
        title: string;
        workspace_path: string;
        updated_at: number;
        created_at: number;
        archived_at: number | null;
      }>;
      error?: string;
    }>;
    opencodeUiFsArchiveSession: (
      sessionId: string,
      archived?: boolean,
      dbPath?: string
    ) => Promise<{
      success: boolean;
      archived?: boolean;
      error?: string;
    }>;
    opencodeUiFsReadSession: (
      sessionId: string,
      dbPath?: string
    ) => Promise<{
      success: boolean;
      session?: {
        id: string;
        title: string;
        workspace_path: string;
        usage: Record<string, unknown>;
        messages: Array<{
          role: "user" | "assistant";
          text: string;
          files?: Array<{ name: string; media_type: string }>;
          toolCalls?: Array<{ name: string; args?: string; result?: string }>;
        }>;
      };
      error?: string;
    }>;

    opencodeUiSessionWatchStart: (
      sessionId: string,
      dbPath?: string
    ) => Promise<{ success: boolean }>;
    opencodeUiSessionWatchStop: () => Promise<{ success: boolean }>;
    opencodeUiOnSessionUpdated: (callback: (payload: { sessionId: string }) => void) => void;
    opencodeUiOffSessionUpdated: (callback: (payload: { sessionId: string }) => void) => void;
    captureStatus?: () => Promise<CaptureServiceStatus>;
    captureRefreshStatus?: () => Promise<CaptureServiceStatus>;
    captureConsumeAnalyzeAssets?: () => Promise<CaptureImportedAsset[]>;
    capturePrepareHostDependencies?: () => Promise<CaptureActionOutcome>;
    captureInstallCompanion?: (options?: {
      allowBootstrap?: boolean;
    }) => Promise<CaptureActionOutcome>;
    captureDismissOperation?: () => Promise<CaptureServiceStatus>;
    captureConnectDevice?: (address: string) => Promise<CaptureActionOutcome>;
    captureDisconnectDevice?: (deviceId: string) => Promise<CaptureActionOutcome>;
    captureLaunchCompanion?: (
      options?: CaptureTargetActionOptions
    ) => Promise<CaptureActionOutcome>;
    captureStartAnalyzeSession?: (
      options?: CaptureTargetActionOptions
    ) => Promise<CaptureActionOutcome>;
    captureStopAnalyzeSession?: (
      options?: CaptureTargetActionOptions
    ) => Promise<CaptureActionOutcome>;
    captureStartAnalyzePreview?: (
      options?: CaptureTargetActionOptions
    ) => Promise<CaptureActionOutcome>;
    captureStopAnalyzePreview?: (
      options?: CaptureTargetActionOptions
    ) => Promise<CaptureActionOutcome>;
    captureStartCameraFeed?: (
      options?: CaptureTargetActionOptions
    ) => Promise<CaptureActionOutcome>;
    captureStopCameraFeed?: (options?: CaptureTargetActionOptions) => Promise<CaptureActionOutcome>;
    captureStartInteractiveMirror?: (
      options?: CaptureTargetActionOptions
    ) => Promise<CaptureActionOutcome>;
    captureStopInteractiveMirror?: (
      options?: CaptureTargetActionOptions
    ) => Promise<CaptureActionOutcome>;
    captureStartAnalyzeDictation?: (
      options?: CaptureTargetActionOptions
    ) => Promise<CaptureActionOutcome>;
    captureStopAnalyzeDictation?: (
      options?: CaptureTargetActionOptions
    ) => Promise<CaptureActionOutcome>;
    captureCancelAnalyzeDictation?: (
      options?: CaptureTargetActionOptions
    ) => Promise<CaptureActionOutcome>;
    captureStartAmbientListener?: (
      options?: CaptureAmbientListenerOptions
    ) => Promise<CaptureActionOutcome>;
    captureStopAmbientListener?: (
      options?: CaptureAmbientListenerOptions
    ) => Promise<CaptureActionOutcome>;
    captureSetTorch?: (options?: CaptureTorchOptions) => Promise<CaptureActionOutcome>;
    captureRequestAnalyzePhoto?: (
      options?: CaptureTargetActionOptions
    ) => Promise<CaptureActionOutcome>;
    captureRetakeAnalyzePhoto?: (
      options?: CaptureTargetActionOptions
    ) => Promise<CaptureActionOutcome>;
    captureOnMediaIngress?: (callback: (payload: CaptureMediaIngressPayload) => void) => void;
    captureOffMediaIngress?: (callback: (payload: CaptureMediaIngressPayload) => void) => void;
    captureOnDictationStatus?: (callback: (payload: CaptureDictationStatusPayload) => void) => void;
    captureOffDictationStatus?: (
      callback: (payload: CaptureDictationStatusPayload) => void
    ) => void;
    captureOnAmbientStatus?: (callback: (payload: CaptureAmbientStatusPayload) => void) => void;
    captureOffAmbientStatus?: (callback: (payload: CaptureAmbientStatusPayload) => void) => void;
    transcriptStatus: () => Promise<TranscriptRuntimeStatus>;
    transcriptEnsureRuntime: () => Promise<TranscriptRuntimeStatus>;
    transcriptListModels?: () => Promise<TranscriptManagedModelStatus[]>;
    transcriptInstallModel?: (
      modelId: TranscriptManagedModelId
    ) => Promise<TranscriptManagedModelStatus>;
    transcriptRemoveModel?: (
      modelId: TranscriptManagedModelId
    ) => Promise<TranscriptManagedModelStatus>;
    transcriptTranscribeLocal: (
      request: TranscriptTranscriptionRequest
    ) => Promise<TranscriptTranscriptionResult>;
    transcriptSubmitIngress: (
      request: TranscriptSubmitIngressRequest
    ) => Promise<TranscriptSubmitIngressResult>;
    ttsStatus?: () => Promise<TtsRuntimeStatus>;
    ttsSpeak?: (request: TtsRequest) => Promise<TtsSpeakResult>;
    ttsStop?: (requestId: string) => Promise<TtsStopResult>;
    ttsListModels?: () => Promise<TtsManagedModelStatus[]>;
    ttsInstallModel?: (modelId: TtsManagedModelId) => Promise<TtsInstallModelResult>;
    operationsStatus?: () => Promise<OperationsStatus>;
    operationsAcquire?: (
      capability: OperationCapability,
      owner: OperationOwner
    ) => Promise<OperationAcquireResult>;
    operationsRelease?: (
      capability: OperationCapability,
      owner: OperationOwner
    ) => Promise<OperationReleaseResult>;
    operationsOnStatus?: (callback: (payload: OperationsStatus) => void) => void;
    operationsOffStatus?: (callback: (payload: OperationsStatus) => void) => void;
    ttsOnStatus?: (callback: (payload: TtsStatus) => void) => void;
    ttsOffStatus?: (callback: (payload: TtsStatus) => void) => void;
    transcriptOnIngress?: (callback: (payload: TranscriptIngressPayload) => void) => void;
    transcriptOffIngress?: (callback: (payload: TranscriptIngressPayload) => void) => void;
    assistantOnTranscriptIngress?: (callback: (payload: TranscriptIngressPayload) => void) => void;
    assistantOffTranscriptIngress?: (callback: (payload: TranscriptIngressPayload) => void) => void;

    opencodeUiQuickPromptsRead: () => Promise<{
      success: boolean;
      prompts: Array<{
        id: string;
        name: string;
        content: string;
        createdAt: number;
      }>;
      path: string;
      error?: string;
    }>;
    opencodeUiQuickPromptsWrite: (
      prompts: Array<{
        id: string;
        name: string;
        content: string;
        createdAt: number;
      }>
    ) => Promise<{
      success: boolean;
      prompts: Array<{
        id: string;
        name: string;
        content: string;
        createdAt: number;
      }>;
      path: string;
      error?: string;
    }>;
    opencodeUiSharedStateRead: () => Promise<{
      success: boolean;
      state: {
        version: 1;
        lastSessionId: string | null;
        lastAgentId: string | null;
        lastReasoningEffort: string | null;
        interactionMode: "off" | "plan-harder-local" | "change-approval";
        modelPreferences: {
          hiddenProviders: string[];
          hiddenModels: string[];
          disabledProviders: string[];
          disabledModels: string[];
          favoriteModels: string[];
          defaultModelKey: string | null;
          lastSelectedModelKey: string | null;
        };
        quickPrompts: Array<{
          id: string;
          name: string;
          content: string;
          createdAt: number;
        }>;
        modelSettingsOverlay: {
          favoritesOnly: boolean;
          showHidden: boolean;
        };
        characterProfiles: {
          activeProfileId: string | null;
          profiles: Array<{
            id: string;
            name: string;
            description: string;
            selectedFeatureIds: string[];
            createdAt: number;
            updatedAt: number;
          }>;
        };
      };
      path: string;
      error?: string;
    }>;
    opencodeUiSharedStateWrite: (state: Record<string, unknown>) => Promise<{
      success: boolean;
      state: {
        version: 1;
        lastSessionId: string | null;
        lastAgentId: string | null;
        lastReasoningEffort: string | null;
        interactionMode: "off" | "plan-harder-local" | "change-approval";
        modelPreferences: {
          hiddenProviders: string[];
          hiddenModels: string[];
          disabledProviders: string[];
          disabledModels: string[];
          favoriteModels: string[];
          defaultModelKey: string | null;
          lastSelectedModelKey: string | null;
        };
        quickPrompts: Array<{
          id: string;
          name: string;
          content: string;
          createdAt: number;
        }>;
        modelSettingsOverlay: {
          favoritesOnly: boolean;
          showHidden: boolean;
        };
        characterProfiles: {
          activeProfileId: string | null;
          profiles: Array<{
            id: string;
            name: string;
            description: string;
            selectedFeatureIds: string[];
            createdAt: number;
            updatedAt: number;
          }>;
        };
      };
      path: string;
      error?: string;
    }>;

    toggleCodeBlock?: (btn: HTMLElement) => void;
    runCodeBlock?: (btn: HTMLElement) => void;
    [key: string]: ((...args: unknown[]) => unknown) | undefined;
  }

  interface HTMLElement {
    getWebContentsId?(): number;
    send?(channel: string, ...args: unknown[]): void;
    executeJavaScript?(code: string): Promise<unknown>;
  }
}

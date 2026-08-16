import { getFilename } from "../constants/index.js";
import { Logger, LogCategory, LogLevel } from "./logger/index.js";
import { AppState } from "./app-state.js";
import { CommandManager } from "./command-manager.js";
import { TrafficManager } from "./traffic-manager.js";
import { WebviewManager } from "./webview-manager.js";
import { AppI18n } from "./i18n/index.js";
import {
  dispatchInternalSlotBridge,
  registerSlotBridgeCoreEngine,
  sendProtocolThroughSlotBridge,
  type SlotBridgeProtocolRequest,
} from "./commands/slot-bridge-runtime.js";
import {
  replaceProtocolTags,
  sendBatchWithContext,
  sendMessageWithContext,
  type SendBatchParams,
} from "./core/send-actions.js";
import {
  handleRelayDisconnectAutoStop as handleCoreRelayDisconnectAutoStop,
  initializeCoreRuntime,
  type RelayManagerRef,
} from "./core/runtime-actions.js";
import {
  destroyWhisperActions,
  enqueueWhisperJobWithContext,
  handleCaughtCommandWithContext,
  pauseWhispers,
  resolveSlotForAccount,
  resumeWhispers,
  runWhisperOperation,
  type CaughtCommandPayload,
  type ServerCommandsRef,
  type WhisperRecord,
} from "./core/whisper-actions.js";
// NOTE: ServerCommands injected from app bootstrap to break circular dependency.
let _serverCommands: ServerCommandsRef | null = null;
function registerServerCommands(sc: ServerCommandsRef): void {
  _serverCommands = sc;
}
function getServerCommands(): ServerCommandsRef {
  if (_serverCommands === null)
    throw new Error(AppI18n.t("app.logs.coreEngine.serverCommandsNotRegistered"));
  return _serverCommands;
}
import { SlotController } from "./slot-controller.js";
import { ConversationSyncer } from "./webview/conversation-syncer.js";
import type { AppSettings } from "@shared/settings.js";
import type { Attachment } from "@shared/index.js";

function coreEngineT(key: string): string {
  return AppI18n.t(`app.logs.coreEngine.${key}`);
}

interface ConnectionResult {
  success: boolean;
  message?: string;
  correlationId?: string;
}

type SendProtocolParams = SlotBridgeProtocolRequest;

class CoreEngineClass {
  settings: AppSettings | null;
  initialized: boolean;
  relay: RelayManagerRef | null;
  _settingsSub: (() => void) | null;
  _previousSettings: AppSettings | null;
  _cleanupInterval: ReturnType<typeof setInterval> | null;
  _commandSentUnsub: (() => void) | null;
  _commandFailedUnsub: (() => void) | null;
  _slotTrafficStartedUnsub: (() => void) | null;
  _slotTrafficStoppedUnsub: (() => void) | null;
  _slotDisconnectCompleteUnsub: (() => void) | null;

  constructor() {
    this.settings = null;
    this.initialized = false;
    this.relay = null;
    this._settingsSub = null;
    this._previousSettings = null;
    this._cleanupInterval = null;
    this._commandSentUnsub = null;
    this._commandFailedUnsub = null;
    this._slotTrafficStartedUnsub = null;
    this._slotTrafficStoppedUnsub = null;
    this._slotDisconnectCompleteUnsub = null;
  }

  async init(): Promise<AppSettings | null> {
    if (this.initialized) {
      return this.settings;
    }

    const runtimeState = await initializeCoreRuntime({
      coreEngine: this,
      applySettingsUpdate: (settings) => {
        this.useSettings(settings);
        this._previousSettings = JSON.parse(JSON.stringify(settings)) as AppSettings;
      },
      handleRelayDisconnectAutoStop: async (slot) => {
        await this._handleRelayDisconnectAutoStop(slot);
      },
    });

    this.settings = runtimeState.settings;
    this.relay = runtimeState.relay;
    this._cleanupInterval = runtimeState.cleanupInterval;
    this._settingsSub = runtimeState.settingsSub;
    this._commandSentUnsub = runtimeState.commandSentUnsub;
    this._commandFailedUnsub = runtimeState.commandFailedUnsub;
    this._slotTrafficStartedUnsub = runtimeState.slotTrafficStartedUnsub;
    this._slotTrafficStoppedUnsub = runtimeState.slotTrafficStoppedUnsub;
    this._slotDisconnectCompleteUnsub = runtimeState.slotDisconnectCompleteUnsub;
    this._previousSettings =
      this.settings !== null ? (JSON.parse(JSON.stringify(this.settings)) as AppSettings) : null;
    this.initialized = true;

    return this.settings;
  }

  async setConnection(
    provider: string,
    connected: boolean,
    opts: { force?: boolean; url?: string } = {}
  ): Promise<ConnectionResult> {
    if (provider === "") return { success: false, message: coreEngineT("noProvider") };

    if (provider !== "ai0" && provider !== "ai1" && provider !== "ai2") {
      return { success: false, message: coreEngineT("invalidProvider") };
    }

    const prev = AppState.isConnected(provider);
    const now = connected === true;
    const force = opts.force === true;
    const url = opts.url;

    Logger.debugT(
      LogCategory.SYSTEM,
      "app.logs.coreEngine.setConnection",
      {
        provider,
        now: String(now),
        force: String(force),
        prev: String(prev),
      },
      {
        context: { provider, now, force, prev, ...(url !== undefined ? { url } : {}) },
      }
    );

    if (!force && prev === now) {
      return { success: true, message: coreEngineT("noChange") };
    }

    let result;
    if (now) {
      result = await SlotController.connect(provider, {
        force,
        ...(url !== undefined ? { url } : {}),
      });
    } else {
      result = await SlotController.disconnect(provider, { force });
    }

    return result;
  }

  async ensureReady(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  useSettings(settings: AppSettings | null): AppSettings | null {
    if (settings) {
      this.settings = settings;
      WebviewManager.setSettings(this.settings);
    }
    return this.settings;
  }

  async sendBatchInternal({
    targets = [],
    text = "",
    page = "generic",
    archiveFolders = {},
    attachments = [],
    jobIds = {},
    waitForCompletion = false,
    clientRequestId,
    brokerMessageId,
  }: SendBatchParams = {}): Promise<{ success: boolean; message?: string }> {
    return await sendBatchWithContext(
      {
        targets,
        text,
        page,
        archiveFolders,
        attachments,
        jobIds,
        waitForCompletion,
        ...(typeof clientRequestId === "string" ? { clientRequestId } : {}),
        ...(typeof brokerMessageId === "string" ? { brokerMessageId } : {}),
      },
      {
        ensureReady: this.ensureReady.bind(this),
        setActiveTargets: this.setActiveTargets.bind(this),
      }
    );
  }

  async sendMessageInternal(
    p: {
      provider?: string;
      text?: string;
      page?: string;
      waitForCompletion?: boolean;
      clientRequestId?: string;
      brokerMessageId?: string;
    } | null
  ): Promise<{ success: boolean; message?: string }> {
    return await sendMessageWithContext(p, {
      ensureReady: this.ensureReady.bind(this),
      setActiveTargets: this.setActiveTargets.bind(this),
    });
  }

  private async dispatchProtocolThroughSlotBridge({
    room = "",
    scenario = "",
    targets = [],
    context = {},
    mode = null,
    preface = null,
  }: SendProtocolParams = {}): Promise<{ success: boolean; message?: string }> {
    try {
      return await sendProtocolThroughSlotBridge(
        {
          room,
          scenario,
          targets,
          context,
          mode,
          preface,
        },
        {
          ensureReady: this.ensureReady.bind(this),
          relay: this.relay,
        }
      );
    } catch (error) {
      Logger.warn(
        LogCategory.RELAY,
        AppI18n.t("app.commands.executor.protocolRelayActionFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
        {
          error: error instanceof Error ? error : new Error(String(error)),
          context: { room, scenario },
        }
      );
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async sendViaSlotBridge({
    targets = [],
    text = "",
    page = "generic",
    attachments = [],
  }: SendBatchParams = {}): Promise<{ success: boolean; message?: string }> {
    const normalizedTargets = (Array.isArray(targets) ? targets : [targets]).filter(
      (target): target is string => typeof target === "string" && target.trim() !== ""
    );
    if (normalizedTargets.length === 0) {
      return { success: false, message: AppI18n.t("app.commands.executor.targetRequired") };
    }

    const bridgeAttachments: Attachment[] = (Array.isArray(attachments) ? attachments : []).flatMap(
      (attachment) => {
        if (typeof attachment === "string") {
          const path = attachment.trim();
          if (path === "") {
            return [];
          }
          return [{ name: getFilename(path), path }];
        }

        const pathCandidate =
          typeof attachment.path === "string"
            ? attachment.path.trim()
            : typeof attachment.commandPath === "string"
              ? attachment.commandPath.trim()
              : "";
        const nameCandidate =
          typeof attachment.name === "string" && attachment.name.trim() !== ""
            ? attachment.name.trim()
            : pathCandidate !== ""
              ? getFilename(pathCandidate)
              : "";
        if (nameCandidate === "" && pathCandidate === "") {
          return [];
        }
        return [
          {
            name: nameCandidate !== "" ? nameCandidate : getFilename(pathCandidate),
            ...(pathCandidate !== "" ? { path: pathCandidate } : {}),
          },
        ];
      }
    );

    const result = await dispatchInternalSlotBridge(
      {
        action: "message.send",
        ...(normalizedTargets.length === 1
          ? { toSlot: normalizedTargets[0] }
          : { toSlots: normalizedTargets }),
        payload: {
          ...(text !== "" ? { text } : {}),
          ...(page !== "" ? { page } : {}),
        },
        ...(bridgeAttachments.length > 0 ? { attachments: bridgeAttachments } : {}),
      },
      {
        provider: "user",
        source: "user",
        fromSlot: "user",
      }
    );

    if (result.success === true) {
      this.setActiveTargets(normalizedTargets);
    }

    return {
      success: result.success,
      ...(result.message !== undefined ? { message: result.message } : {}),
    };
  }

  async _handleRelayDisconnectAutoStop(slot: string): Promise<void> {
    await handleCoreRelayDisconnectAutoStop(slot, {
      relay: this.relay,
      dispatchProtocol: async (payload) => await this.dispatchProtocolThroughSlotBridge(payload),
    });
  }

  async whisper(
    op: string,
    args?: {
      accountId?: string;
      text?: string;
      when?: unknown;
      id?: string;
      patch?: { text?: string; when?: unknown };
    }
  ): Promise<unknown> {
    return await runWhisperOperation(op, args);
  }

  pauseWhispers(): void {
    pauseWhispers();
  }

  resumeWhispers(runCheck = false): void {
    resumeWhispers(runCheck);
  }

  resolveSlotForAccount(accountId: string): "ai1" | "ai2" | null {
    return resolveSlotForAccount(accountId);
  }

  async enqueueWhisperJob(
    accountId: string,
    record: WhisperRecord = {},
    messageOverride = ""
  ): Promise<{ success: boolean; jobId?: string; message?: string }> {
    return await enqueueWhisperJobWithContext(accountId, record, messageOverride, {
      ensureReady: this.ensureReady.bind(this),
      dispatchMessage: async (payload) =>
        await this.sendViaSlotBridge({
          targets:
            typeof payload.provider === "string" && payload.provider.trim() !== ""
              ? [payload.provider]
              : [],
          text: typeof payload.text === "string" ? payload.text : "",
          page: typeof payload.page === "string" ? payload.page : "generic",
        }),
      getServerCommands,
    });
  }

  async handleCaughtCommand(
    commandName: string,
    payload: CaughtCommandPayload = {}
  ): Promise<{ success: boolean; message?: string; jobId?: string; priority?: string }> {
    return await handleCaughtCommandWithContext(commandName, payload, {
      ensureReady: this.ensureReady.bind(this),
      dispatchMessage: async (messagePayload) =>
        await this.sendViaSlotBridge({
          targets:
            typeof messagePayload.provider === "string" && messagePayload.provider.trim() !== ""
              ? [messagePayload.provider]
              : [],
          text: typeof messagePayload.text === "string" ? messagePayload.text : "",
          page: typeof messagePayload.page === "string" ? messagePayload.page : "generic",
        }),
      getServerCommands,
    });
  }

  replaceProtocolTags(text: string): string {
    return replaceProtocolTags(text);
  }

  setActiveTargets(targets: string[] = []): void {
    AppState.setChatTargets(targets);
  }

  listCommands(): unknown[] {
    return CommandManager.list();
  }

  destroy(): void {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    if (this._settingsSub) {
      this._settingsSub();
      this._settingsSub = null;
    }
    if (this._commandSentUnsub) {
      this._commandSentUnsub();
      this._commandSentUnsub = null;
    }
    if (this._commandFailedUnsub) {
      this._commandFailedUnsub();
      this._commandFailedUnsub = null;
    }
    if (this._slotTrafficStartedUnsub) {
      this._slotTrafficStartedUnsub();
      this._slotTrafficStartedUnsub = null;
    }
    if (this._slotTrafficStoppedUnsub) {
      this._slotTrafficStoppedUnsub();
      this._slotTrafficStoppedUnsub = null;
    }
    if (this._slotDisconnectCompleteUnsub) {
      this._slotDisconnectCompleteUnsub();
      this._slotDisconnectCompleteUnsub = null;
    }
    destroyWhisperActions();
    TrafficManager.destroy();
    ConversationSyncer.destroy();
    Logger.shutdown();
    import("../ui/toast-manager.js")
      .then(({ ToastManager }) => {
        ToastManager.destroy();
      })
      .catch(() => {});
    this.initialized = false;
    Logger.panelT(LogCategory.SYSTEM, LogLevel.INFO, "app.logs.coreEngine.destroyed");
  }
}

const coreEngine = new CoreEngineClass();
registerSlotBridgeCoreEngine(coreEngine);
export { coreEngine as CoreEngine, registerServerCommands };
export type { ServerCommandsRef };
export type CoreEngine = CoreEngineClass;

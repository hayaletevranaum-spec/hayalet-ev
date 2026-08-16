import { getErrorMessage } from "@shared/index.js";
import { formatErrorWithDetail } from "../../../../shared/i18n/error-detail.js";
import { TIMEOUTS } from "@timeouts";
import type { AppSettings } from "@shared/settings.js";
import { AppState } from "../app-state.js";
import { CommandExecutor } from "../command-executor.js";
import { CommandManager } from "../command-manager.js";
import type { CommandJob } from "../command-manager.js";
import { ErrorBoundary } from "../error-boundary.js";
import { FileManager } from "../file-manager.js";
import { AppI18n } from "../i18n/index.js";
import { SplashScreen } from "../../ui/splash-screen.js";
import { Logger, LogCategory } from "../logger/index.js";
import { RelayManager } from "../relay-manager.js";
import { SettingsManager } from "../settings-manager.js";
import { SlotController, SlotEvent } from "../slot-controller.js";
import { TrafficManager } from "../traffic-manager.js";
import { WebviewManager } from "../webview-manager.js";
import { WhisperManager } from "../whisper-manager.js";

interface RelayRef {
  isAIAIActive(): boolean;
  isAIAssistantActive(): boolean;
  isUs1AssistantActive(): boolean;
  stopProtocolSession(): Promise<void>;
  stopSession(): Promise<void>;
  stopAIAssistantSession(): Promise<void>;
  stopUs1AssistantSession(): Promise<void>;
  getAIAssistantSourceSlot(): string | null;
}

export type RelayManagerRef = typeof RelayManager;

export interface CoreRuntimeHandles {
  settings: AppSettings | null;
  relay: RelayManagerRef | null;
  cleanupInterval: ReturnType<typeof setInterval> | null;
  settingsSub: (() => void) | null;
  commandSentUnsub: (() => void) | null;
  commandFailedUnsub: (() => void) | null;
  slotTrafficStartedUnsub: (() => void) | null;
  slotTrafficStoppedUnsub: (() => void) | null;
  slotDisconnectCompleteUnsub: (() => void) | null;
}

const STARTUP_STEP_TIMEOUT_MS = 8000;

const STARTUP_SPLASH_STEPS: Record<string, { percent: number; messageKey: string }> = {
  "file-manager.ensureDirs": {
    percent: 22,
    messageKey: "app.startup.preparingFiles",
  },
  "command-manager.init": {
    percent: 28,
    messageKey: "app.startup.loadingCommands",
  },
  "whisper-manager.init": {
    percent: 36,
    messageKey: "app.startup.loadingWhispers",
  },
  "slot-controller.init": {
    percent: 50,
    messageKey: "app.startup.startingSlots",
  },
};

function updateStartupSplash(step: string): void {
  const entry = STARTUP_SPLASH_STEPS[step];
  if (!entry) {
    return;
  }
  SplashScreen.update(entry.percent, AppI18n.t(entry.messageKey));
}
const SLOT_CONTROLLER_STARTUP_TIMEOUT_MS = 12000;

async function runStartupStep<T>(
  step: string,
  task: () => Promise<T>,
  options: { timeoutMs?: number; critical?: boolean } = {}
): Promise<T | null> {
  const timeoutMs = options.timeoutMs ?? STARTUP_STEP_TIMEOUT_MS;
  const critical = options.critical === true;
  const startedAt = performance.now();
  let timeoutHandle!: ReturnType<typeof setTimeout>;

  updateStartupSplash(step);

  Logger.info(LogCategory.SYSTEM, `[startup] ${step}:start`, {
    step,
    timeoutMs,
    critical,
  });

  try {
    const result = await Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${step} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);

    Logger.info(LogCategory.SYSTEM, `[startup] ${step}:complete`, {
      step,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return result;
  } catch (error) {
    Logger.warn(LogCategory.SYSTEM, `[startup] ${step}:failed`, {
      step,
      durationMs: Math.round(performance.now() - startedAt),
      message: getErrorMessage(error),
      critical,
    });
    if (critical) {
      throw error;
    }
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function whisperT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.whisper.runtime.${key}`, params);
}

function whisperError(
  key: string,
  detail?: unknown,
  params?: Record<string, string | number>
): string {
  return formatErrorWithDetail(whisperT(key, params), detail);
}

interface CoreRuntimeEngineRef {
  enqueueWhisperJob: (
    accountId: string,
    record?: { id?: string; text?: string; when?: unknown },
    messageOverride?: string
  ) => Promise<{ success: boolean; message?: string }>;
}

interface InitializeCoreRuntimeParams {
  coreEngine: CoreRuntimeEngineRef;
  applySettingsUpdate: (settings: AppSettings) => void;
  handleRelayDisconnectAutoStop: (slot: string) => Promise<void>;
}

export async function initializeCoreRuntime(
  params: InitializeCoreRuntimeParams
): Promise<CoreRuntimeHandles> {
  ErrorBoundary.init();

  Logger.info(LogCategory.SYSTEM, "[startup] core-runtime:start");
  const settings = await SettingsManager.load();
  Logger.info(LogCategory.SYSTEM, "[startup] settings-manager.load:complete");
  WebviewManager.setSettings(settings);
  await runStartupStep("file-manager.ensureDirs", async () => {
    await FileManager.ensureDirs("all");
  });
  AppState.init("ai1");
  Logger.info(LogCategory.SYSTEM, "[startup] app-state.init:complete");
  await runStartupStep("command-manager.init", async () => {
    await CommandManager.init();
  });

  const cleanupInterval = setInterval(() => {
    try {
      WebviewManager.cleanupInactiveWebviews();
    } catch (error) {
      Logger.warnT(
        LogCategory.SYSTEM,
        "app.logs.runtimeActions.cleanupError",
        { message: getErrorMessage(error) },
        { error: error instanceof Error ? error : new Error(String(error)) }
      );
    }
  }, TIMEOUTS.CLEANUP_INTERVAL);

  CommandExecutor.init(params.coreEngine as never);
  CommandManager.setExecutor(async (job) => await CommandExecutor.executeJob(job));

  const commandSentUnsub = CommandManager.on("sent", (payload: unknown) => {
    const normalized = payload as { job?: CommandJob };
    if (normalized.job !== undefined) {
      CommandExecutor.handleJobSuccess(normalized.job);
    }
  });

  const commandFailedUnsub = CommandManager.on("failed", (payload: unknown) => {
    const normalized = payload as { job?: CommandJob; error: unknown };
    if (normalized.job !== undefined) {
      CommandExecutor.handleJobFailure(normalized.job, normalized.error);
    }
  });

  let relay: typeof RelayManager | null = null;
  try {
    RelayManager.init(params.coreEngine as never);
    relay = RelayManager;
  } catch (error) {
    Logger.warnT(
      LogCategory.SYSTEM,
      "app.logs.runtimeActions.relayInitFailed",
      { message: error instanceof Error ? error.message : String(error) },
      { error: error instanceof Error ? error : new Error(String(error)) }
    );
  }

  // NOTE: WhisperManager is a deferred-message queue feature, not the whisper.cpp speech runtime.
  const whisperInitOptions = { settings: settings as unknown as Record<string, unknown> };
  await runStartupStep("whisper-manager.init", async () => {
    await WhisperManager.init(whisperInitOptions);
  });
  WhisperManager.setSender(async (accountId: string, text: string, whisperId: string) => {
    const result = await params.coreEngine.enqueueWhisperJob(
      accountId,
      { id: whisperId, text },
      text
    );
    if (!result.success) {
      throw new Error(whisperError("sendFailed", result.message));
    }
  });

  SplashScreen.update(42, AppI18n.t("app.startup.startingWebviews"));
  WebviewManager.initSyncer(params.coreEngine as never);
  Logger.info(LogCategory.SYSTEM, "[startup] webview-manager.initSyncer:complete");
  await runStartupStep(
    "slot-controller.init",
    async () => {
      await SlotController.init();
    },
    {
      timeoutMs: SLOT_CONTROLLER_STARTUP_TIMEOUT_MS,
    }
  );

  const slotTrafficStartedUnsub = SlotController.on(
    SlotEvent.TRAFFIC_STARTED,
    ({ slot }: { slot?: string }) => {
      if (slot === undefined || slot === "") {
        return;
      }

      const webview = SlotController.getWebview(slot);
      if (webview !== null) {
        TrafficManager.attachWebview(slot, webview);
        TrafficManager.start(slot);
      }
    }
  );

  const slotTrafficStoppedUnsub = SlotController.on(
    SlotEvent.TRAFFIC_STOPPED,
    ({ slot }: { slot?: string }) => {
      if (slot === undefined || slot === "") {
        return;
      }
      TrafficManager.stop(slot);
    }
  );

  const slotDisconnectCompleteUnsub = SlotController.on(
    SlotEvent.DISCONNECT_COMPLETE,
    ({ slot }: { slot?: string }) => {
      if (slot !== "ai0" && slot !== "ai1" && slot !== "ai2") {
        return;
      }
      void params.handleRelayDisconnectAutoStop(slot);
    }
  );

  const settingsSub = SettingsManager.subscribe((payload) => {
    const { settings: nextSettings } = payload as { settings: AppSettings | null };
    if (nextSettings == null) {
      return;
    }
    params.applySettingsUpdate(nextSettings);
  });

  Logger.info(LogCategory.SYSTEM, "[startup] core-runtime:complete");

  return {
    settings,
    relay,
    cleanupInterval,
    settingsSub,
    commandSentUnsub,
    commandFailedUnsub,
    slotTrafficStartedUnsub,
    slotTrafficStoppedUnsub,
    slotDisconnectCompleteUnsub,
  };
}

export async function handleRelayDisconnectAutoStop(
  slot: string,
  context: {
    relay: RelayRef | null;
    dispatchProtocol: (payload: {
      room: string;
      scenario: string;
      targets: string[];
    }) => Promise<{ success: boolean; message?: string }>;
  }
): Promise<void> {
  if (slot !== "ai0" && slot !== "ai1" && slot !== "ai2") {
    return;
  }
  if (context.relay === null) {
    return;
  }

  try {
    if (context.relay.isAIAIActive() === true && (slot === "ai1" || slot === "ai2")) {
      const remainingTarget = slot === "ai1" ? "ai2" : "ai1";

      if (AppState.isConnected(remainingTarget) === true) {
        const stopResult = await context.dispatchProtocol({
          room: "analyze",
          scenario: "ai-ai-stop",
          targets: [remainingTarget],
        });

        if (stopResult.success === true) {
          return;
        }
      }

      await context.relay.stopProtocolSession();
      await context.relay.stopSession();
      return;
    }

    if (context.relay.isAIAssistantActive() !== true) {
      if (context.relay.isUs1AssistantActive() !== true) {
        return;
      }

      if (slot !== "ai0") {
        return;
      }

      if (AppState.isUs1Connected() === true) {
        const stopResult = await context.dispatchProtocol({
          room: "analyze",
          scenario: "ai-assistant-stop",
          targets: ["us1"],
        });

        if (stopResult.success === true) {
          return;
        }
      }

      await context.relay.stopUs1AssistantSession();
      return;
    }

    const sourceSlot = context.relay.getAIAssistantSourceSlot();
    if (sourceSlot !== "ai1" && sourceSlot !== "ai2") {
      await context.relay.stopAIAssistantSession();
      return;
    }

    if (slot === sourceSlot) {
      await context.relay.stopAIAssistantSession();
      return;
    }

    if (slot === "ai0") {
      if (AppState.isConnected(sourceSlot) === true) {
        const stopResult = await context.dispatchProtocol({
          room: "analyze",
          scenario: "ai-assistant-stop",
          targets: [sourceSlot],
        });

        if (stopResult.success === true) {
          return;
        }
      }

      await context.relay.stopAIAssistantSession();
    }
  } catch (error) {
    Logger.warnT(
      LogCategory.RELAY,
      "app.logs.runtimeActions.relayAutoStopFailed",
      { message: error instanceof Error ? error.message : String(error) },
      {
        error: error instanceof Error ? error : new Error(String(error)),
        context: { slot },
      }
    );
  }
}

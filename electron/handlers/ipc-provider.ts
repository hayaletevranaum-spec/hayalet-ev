import { join } from "path";
import { existsSync } from "fs";
import { pathToFileURL } from "url";
import { webContents } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { registerHandler } from "./ipc-helpers.ts";
import { getLoggerCore } from "../logger/index.js";
import { LogCategory, LogLevel } from "@shared/index.js";
import { Paths } from "../paths.ts";
import { loadSettings } from "../settings-manager.ts";
import { DatabaseManager } from "../database/index.ts";
import { resolvePromotionLocaleFromSettings } from "../provider-tester/selector-evidence.ts";
import type { ProviderScenarioId, ProviderWebviewSyncMode } from "../../src/types/provider.ts";
import { translateElectronMessage } from "../i18n/language-service.ts";

const logger = getLoggerCore();
const PROVIDER_SCENARIO_PROGRESS_CHANNEL = "provider-scenario:progress";
const activeScenarioRuns = new Map<string, AbortController>();

import type { ProviderTester as ProviderTesterType } from "../provider-tester/index.ts";
let providerTesterCtor: typeof ProviderTesterType | null = null;
type ProviderTesterConfig = ConstructorParameters<typeof ProviderTesterType>[1];
type ProviderTesterOptions = NonNullable<ConstructorParameters<typeof ProviderTesterType>[4]>;
type ProviderScenarioRequest = {
  slot: "ai0" | "ai1" | "ai2";
  scenarioId?: ProviderScenarioId;
  syncMode?: ProviderWebviewSyncMode;
};
type ProviderScenarioCancelRequest = {
  runId: string;
};

function generateProviderScenarioRunId(
  slot: ProviderScenarioRequest["slot"],
  providerId: string,
  scenarioId: ProviderScenarioId
): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `provider-scenario-${scenarioId}-${slot}-${providerId}-${Date.now()}-${suffix}`;
}

async function setProviderScenarioLock(
  sender: IpcMainInvokeEvent["sender"],
  slot: ProviderScenarioRequest["slot"],
  value: { runId: string; scenarioId: ProviderScenarioId } | null
): Promise<void> {
  try {
    await sender.executeJavaScript(`
      (function() {
        const slot = ${JSON.stringify(slot)};
        const next = ${JSON.stringify(value)};
        const root = window;
        const locks = root.__providerScenarioLocks ?? (root.__providerScenarioLocks = {});

        if (next !== null) {
          locks[slot] = {
            runId: next.runId,
            scenarioId: next.scenarioId,
            updatedAt: Date.now(),
          };
          return true;
        }

        if (locks !== null && typeof locks === "object") {
          delete locks[slot];
          if (Object.keys(locks).length === 0) {
            delete root.__providerScenarioLocks;
          }
        }

        return true;
      })()
    `);
  } catch {
    // NOTE: Scenario lock is best-effort; failed cleanup should not abort the test run.
  }
}

async function importModuleByPath(modulePath: string, fresh = false): Promise<unknown> {
  const moduleUrl = pathToFileURL(modulePath);
  if (fresh) {
    moduleUrl.searchParams.set("t", `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  }
  return await import(moduleUrl.href);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function resolveConfigRecord(moduleValue: unknown): Record<string, unknown> | null {
  if (!isRecord(moduleValue)) return null;

  const configCandidate = moduleValue["config"] ?? moduleValue["default"] ?? moduleValue;

  if (!isRecord(configCandidate)) return null;

  if (
    typeof configCandidate["id"] !== "string" ||
    typeof configCandidate["name"] !== "string" ||
    typeof configCandidate["baseUrl"] !== "string" ||
    !isRecord(configCandidate["selectors"])
  ) {
    return null;
  }

  return configCandidate;
}

function resolveConfigExport(moduleValue: unknown): ProviderTesterConfig | null {
  const configRecord = resolveConfigRecord(moduleValue);
  return configRecord !== null ? (configRecord as unknown as ProviderTesterConfig) : null;
}

function resolveProviderTesterExport(moduleValue: unknown): typeof ProviderTesterType | null {
  if (!isRecord(moduleValue)) return null;
  const tester = moduleValue["ProviderTester"];
  return typeof tester === "function" ? (tester as typeof ProviderTesterType) : null;
}

async function loadProviderConfigRecord(
  cfgPath: string,
  options: { fresh?: boolean } = {}
): Promise<Record<string, unknown> | null> {
  const mod: unknown = await importModuleByPath(cfgPath, options.fresh === true);
  return resolveConfigRecord(mod);
}

async function loadProviderConfigExport(
  cfgPath: string,
  options: { fresh?: boolean } = {}
): Promise<ProviderTesterConfig | null> {
  const mod: unknown = await importModuleByPath(cfgPath, options.fresh === true);
  return resolveConfigExport(mod);
}

async function ensureProviderTesterCtor(): Promise<typeof ProviderTesterType> {
  if (providerTesterCtor !== null) {
    return providerTesterCtor;
  }

  const testerPathTs = join(Paths.getProjectRoot(), "electron", "provider-tester", "index.ts");
  const testerPathJs = join(
    Paths.getProjectRoot(),
    "dist",
    "electron",
    "provider-tester",
    "index.js"
  );
  const testerPath = existsSync(testerPathJs) ? testerPathJs : testerPathTs;

  if (!existsSync(testerPath)) {
    throw new Error(
      await translateElectronMessage("electron.ipcProvider.providerTesterNotFound", {
        path: testerPath,
      })
    );
  }

  const testerModule: unknown = await importModuleByPath(testerPath);
  providerTesterCtor = resolveProviderTesterExport(testerModule);
  if (providerTesterCtor === null) {
    throw new Error(
      await translateElectronMessage("electron.ipcProvider.providerTesterExportNotFound", {
        path: testerPath,
      })
    );
  }

  return providerTesterCtor;
}

async function runProviderScenario(
  event: IpcMainInvokeEvent,
  request: ProviderScenarioRequest
): Promise<Record<string, unknown>> {
  const { slot } = request;
  const scenarioId = request.scenarioId ?? "webview-test";

  try {
    const providerTesterCtor = await ensureProviderTesterCtor();

    const webviewIdRaw: unknown = await event.sender.executeJavaScript(`
      (function() {
        const slotState = window.SlotController?.getSlotState?.('${slot}');
        if (slotState?.webview?.getWebContentsId) {
          return slotState.webview.getWebContentsId();
        }

        const webview = window.WebviewManager?.webviews?.['${slot}'];
        if (webview?.getWebContentsId) {
          return webview.getWebContentsId();
        }

        const el = document.getElementById('${slot}-webview');
        if (el?.getWebContentsId) {
          return el.getWebContentsId();
        }

        return null;
      })()
    `);

    const webviewId = typeof webviewIdRaw === "number" ? webviewIdRaw : null;

    if (webviewId === null) {
      throw new Error(
        await translateElectronMessage("electron.ipcProvider.webviewNotAccessible", { slot })
      );
    }

    const webviewContents = webContents.fromId(webviewId);
    if (webviewContents === undefined) {
      throw new Error(
        await translateElectronMessage("electron.ipcProvider.webContentsNotFound", { slot })
      );
    }

    const providerIdRaw: unknown = await event.sender.executeJavaScript(`
      window.AppState?.getProviderIdForSlot?.('${slot}') || null
    `);
    const providerId = typeof providerIdRaw === "string" ? providerIdRaw : null;
    if (providerId === null || providerId.length === 0) {
      throw new Error(
        await translateElectronMessage("electron.ipcProvider.providerNotAssigned", { slot })
      );
    }

    const cfgPath = Paths.getProviderConfigPath(providerId);
    if (cfgPath.length === 0) {
      throw new Error(
        await translateElectronMessage("electron.ipcProvider.providerConfigNotFound", {
          providerId,
        })
      );
    }

    const config = await loadProviderConfigExport(cfgPath);
    if (config === null) {
      throw new Error(
        await translateElectronMessage("electron.ipcProvider.invalidProviderConfig", {
          providerId,
        })
      );
    }

    const webviewWrapper = {
      getURL: (): string => webviewContents.getURL(),
      getWebContentsId: (): number => webviewContents.id,
      loadURL: async (url: string): Promise<void> => {
        await webviewContents.loadURL(url);
      },
      executeJavaScript: async (script: string): Promise<unknown> =>
        await webviewContents.executeJavaScript(script),
      capturePageRegion: async (rect: {
        x: number;
        y: number;
        width: number;
        height: number;
      }): Promise<{ success?: boolean; dataUrl?: string } | null> => {
        const image = await webviewContents.capturePage(rect);
        return { success: true, dataUrl: image.toDataURL() };
      },
      addEventListener: (
        listenerEvent: "did-finish-load",
        listener: () => void,
        options?: { once?: boolean }
      ): void => {
        if (options?.once === true) {
          webviewContents.once(listenerEvent, listener);
        } else {
          webviewContents.on(listenerEvent, listener);
        }
      },
    };

    const shellWrapper = {
      executeJavaScript: async (script: string): Promise<unknown> =>
        await event.sender.executeJavaScript(script),
    };

    const runId = generateProviderScenarioRunId(slot, providerId, scenarioId);
    const abortController = new AbortController();
    activeScenarioRuns.set(runId, abortController);

    await logger.logInternalT(
      LogCategory.IPC,
      LogLevel.INFO,
      "electron.ipcProvider.logs.scenarioStarted",
      { scenarioId, providerId, slot },
      { slot, providerId, scenarioId, runId }
    );

    const locale = resolvePromotionLocaleFromSettings(await loadSettings());
    const defaultUrlOverride =
      scenarioId === "webview-test" && slot === "ai0" && providerId === "opencode-ui"
        ? webviewContents.getURL()
        : undefined;

    try {
      await setProviderScenarioLock(event.sender, slot, { runId, scenarioId });
      const testerOptions: ProviderTesterOptions = {
        emitProgress: (
          progressEvent: Parameters<NonNullable<ProviderTesterOptions["emitProgress"]>>[0]
        ): void => {
          event.sender.send(PROVIDER_SCENARIO_PROGRESS_CHANNEL, progressEvent);
        },
        appLanguage: locale,
        runId,
        syncMode: request.syncMode ?? "full",
        databaseManager: DatabaseManager,
        abortSignal: abortController.signal,
      };
      if (defaultUrlOverride !== undefined) {
        testerOptions.defaultUrlOverride = defaultUrlOverride;
      }

      const tester = new providerTesterCtor(
        webviewWrapper,
        config,
        slot,
        shellWrapper,
        testerOptions
      );

      const results = await tester.runScenario(scenarioId);

      await logger.logInternalT(
        LogCategory.IPC,
        LogLevel.INFO,
        "electron.ipcProvider.logs.scenarioCompleted",
        { scenarioId, providerId, slot },
        {
          slot,
          providerId,
          scenarioId,
          runId,
          passed: results.passed,
          failed: results.failed,
          skipped: results.skipped,
          warnings: results.warnings,
          aborted: results.aborted === true,
        }
      );

      return results as unknown as Record<string, unknown>;
    } finally {
      await setProviderScenarioLock(event.sender, slot, null);
      activeScenarioRuns.delete(runId);
    }
  } catch (err) {
    await logger.logInternalT(
      LogCategory.IPC,
      LogLevel.ERROR,
      "electron.ipcProvider.logs.scenarioFailed",
      { slot, scenarioId, message: (err as Error).message },
      {
        slot,
        scenarioId,
        error: {
          name: (err as Error).name,
          message: (err as Error).message,
          stack: (err as Error).stack,
        },
      }
    );
    throw err;
  }
}

async function cancelProviderScenario(
  _event: IpcMainInvokeEvent,
  request: ProviderScenarioCancelRequest
): Promise<{ success: boolean; runId: string; cancelled: boolean }> {
  const runId = request.runId.trim();
  const controller = runId === "" ? undefined : activeScenarioRuns.get(runId);

  if (controller === undefined) {
    return {
      success: false,
      runId,
      cancelled: false,
    };
  }

  controller.abort();
  activeScenarioRuns.delete(runId);

  await logger.logInternalT(
    LogCategory.IPC,
    LogLevel.INFO,
    "electron.ipcProvider.logs.scenarioCancelRequested",
    { runId },
    { runId }
  );

  return {
    success: true,
    runId,
    cancelled: true,
  };
}

export function setupProviderHandlers(): void {
  registerHandler("get-preload-path", (_event, type?: string) => {
    if (type === "room") {
      return Paths.getPreloadFileUrl("room-webview-preload.cjs");
    }
    return Paths.getPreloadFileUrl("webview-preload.cjs");
  });

  registerHandler("get-provider-config", async (_event, providerId: string) => {
    if (providerId.length === 0) return null;

    const cfgPath = Paths.getProviderConfigPath(providerId);

    if (cfgPath.length === 0) return null;

    try {
      const cfg = await loadProviderConfigRecord(cfgPath, { fresh: true });
      if (cfg === null) return null;
      return {
        id: asString(cfg["id"]),
        name: asString(cfg["name"]),
        baseUrl: asString(cfg["baseUrl"]),
        loginUrl: asString(cfg["loginUrl"]),
        selectors: cfg["selectors"],
        scrollerSelectors: cfg["scrollerSelectors"],
        filters: cfg["filters"] ?? null,
        telemetry: cfg["telemetry"] ?? null,
      };
    } catch (err) {
      await logger.logInternalT(
        LogCategory.IPC,
        LogLevel.ERROR,
        "electron.ipcProvider.logs.configLoadFailed",
        { providerId, message: (err as Error).message },
        {
          providerId,
          error: {
            name: (err as Error).name,
            message: (err as Error).message,
            stack: (err as Error).stack,
          },
        }
      );
      return null;
    }
  });

  registerHandler("run-provider-scenario", async (event, request: ProviderScenarioRequest) => {
    return await runProviderScenario(event, request);
  });
  registerHandler(
    "cancel-provider-scenario",
    async (event, request: ProviderScenarioCancelRequest) => {
      return await cancelProviderScenario(event, request);
    }
  );

  registerHandler("test-provider", async (event, { slot }: { slot: "ai0" | "ai1" | "ai2" }) => {
    return await runProviderScenario(event, { slot, scenarioId: "webview-test" });
  });
}

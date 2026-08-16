import type { OpencodeUiBootstrapDeps, OpencodeUiToolsReadyPayload } from "./bootstrap-actions.js";
import { initUIHelpers } from "./ui-helpers.js";
import type { ByIdFn } from "./host-helpers.js";
import { t } from "./i18n.js";
import type { RuntimeState } from "./types.js";

interface BootstrapOpencodeUiAppOptions {
  runtime: RuntimeState;
  initialUsageText: string;
  providerConfig: unknown;
  byId: ByIdFn;
  setApiBaseUrl: (url: string) => void;
  setWorkspaceUrlLabel: (url: string) => void;
  getLogoFallback: () => void;
  updateUsagePlaceholders: (text: string) => void;
  initSelects: () => void;
  initUtilityActions: () => void;
  initSessionEvents: () => void;
  initChatEvents: () => void;
  sendStageToHost: (title: string, subtitle: string) => void;
  sendToolsReadyToHost: (payload: OpencodeUiToolsReadyPayload) => void;
  reportBootstrapNotice: (error: unknown, defaultTitleKey: string) => void;
  runOpencodeUiBootstrapPipeline: (options: {
    deps: OpencodeUiBootstrapDeps;
    emitStage: (title: string, subtitle: string) => void;
    emitToolsReady: (payload: OpencodeUiToolsReadyPayload) => void;
  }) => Promise<void>;
  deps: OpencodeUiBootstrapDeps;
  loadAgents: () => Promise<void>;
  loadProviderContextAndModels: () => Promise<void>;
  initializeSessionSelection: (resumeSessionId: string, resumeMode: string) => Promise<void>;
  startPeriodicRefresh: () => void;
  startLiveMessageRefresh: () => void;
}

export async function bootstrapOpencodeUiApp(
  options: BootstrapOpencodeUiAppOptions
): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const port = params.get("port") ?? "4096";
  const resumeSessionId = params.get("resumeSessionId") ?? "";
  const resumeMode = params.get("resumeMode") ?? "";
  const dbPath = params.get("dbPath") ?? "";
  const baseUrl = `http://127.0.0.1:${port}`;

  options.runtime.baseUrl = baseUrl;
  options.runtime.dbPath = dbPath;

  options.setApiBaseUrl(baseUrl);
  options.setWorkspaceUrlLabel(window.location.href);
  options.getLogoFallback();
  options.updateUsagePlaceholders(options.initialUsageText);

  window.__app_provider_config = options.providerConfig as ProviderConfig;

  initUIHelpers();
  options.initSelects();
  options.initUtilityActions();
  options.initSessionEvents();
  options.initChatEvents();

  options.sendStageToHost(t("bootstrap.startedTitle"), t("bootstrap.startedSubtitle"));

  try {
    await options.runOpencodeUiBootstrapPipeline({
      deps: options.deps,
      emitStage: options.sendStageToHost,
      emitToolsReady: options.sendToolsReadyToHost,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.sendStageToHost(
      t("bootstrap.connectionPhaseTitle"),
      t("bootstrap.bootstrapError", { message })
    );
    options.reportBootstrapNotice(error, "bootstrap.bootstrapErrorTitle");
    options.sendToolsReadyToHost({
      ready: true,
      unresolvedServers: [],
      mcpChecks: 0,
      toolCount: 0,
    });
  }

  try {
    await Promise.all([options.loadAgents(), options.loadProviderContextAndModels()]);
    await options.initializeSessionSelection(resumeSessionId, resumeMode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorArea = options.byId<HTMLElement>("error-area");
    if (errorArea != null) {
      errorArea.textContent = t("bootstrap.errorPrefix", { message });
    }
    options.reportBootstrapNotice(error, "bootstrap.sessionLoadErrorTitle");
    options.sendStageToHost(
      t("bootstrap.connectionPhaseTitle"),
      t("bootstrap.sessionLoadError", { message })
    );
  }

  options.startPeriodicRefresh();
  options.startLiveMessageRefresh();
}
import type { ProviderConfig } from "@shared/provider.js";

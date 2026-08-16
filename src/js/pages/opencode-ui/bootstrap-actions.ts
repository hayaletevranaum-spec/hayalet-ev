import type { OpencodeUiSessionSummary, RuntimeState } from "./types.js";
import { formatTime, t } from "./i18n.js";

type ByIdFn = <T extends HTMLElement>(id: string, guard?: (element: T) => boolean) => T | null;

export interface OpencodeUiToolsReadyPayload {
  ready: boolean;
  unresolvedServers: string[];
  mcpChecks: number;
  toolCount: number;
}

export interface OpencodeUiBootstrapDeps {
  checkHealth: () => Promise<{ mcpServers: Record<string, unknown> }>;
  loadStatusContext: () => Promise<void>;
  waitForMcpServersSettled: () => Promise<{
    ready: boolean;
    checks: number;
    unresolvedServers: string[];
  }>;
  loadToolsFinalSnapshot: () => Promise<{
    status: "loaded" | "empty" | "error";
    toolIds: string[];
  }>;
}

export interface BootstrapContext {
  runtime: RuntimeState;
  byId: ByIdFn;
  getSessionsForTab: (
    sessions: OpencodeUiSessionSummary[],
    tab?: "active" | "archived"
  ) => OpencodeUiSessionSummary[];
  listSessionsFromDisk: () => Promise<OpencodeUiSessionSummary[]>;
  createServerSession: (title?: string) => Promise<string>;
  setActiveSession: (sessionId: string | null) => Promise<void>;
  loadSessionListAndRender: (options?: {
    preserveActive?: boolean;
    syncSelectionToTab?: boolean;
  }) => Promise<void>;
  loadActiveSessionHistory: () => Promise<void>;
  checkHealth: () => Promise<{ mcpServers: Record<string, unknown> }>;
  loadStatusContext: () => Promise<void>;
  loadToolsFinalSnapshot: () => Promise<{
    status: "loaded" | "empty" | "error";
    toolIds: string[];
  }>;
  syncActiveSessionHistoryIfUpdated: () => Promise<void>;
}

function normalizeResumeMode(value: string): "last" | "new" {
  return value.trim() === "new" ? "new" : "last";
}

function findVisibleSessionId(
  sessionIds: string[],
  sessions: OpencodeUiSessionSummary[]
): string | null {
  for (const sessionId of sessionIds) {
    if (sessionId !== "" && sessions.some((session) => session.id === sessionId)) {
      return sessionId;
    }
  }

  return null;
}

export async function initializeSessionSelection(
  context: BootstrapContext,
  resumeSessionId: string,
  resumeModeRaw = ""
): Promise<void> {
  context.runtime.sessionTab = "active";
  const sessions = await context.listSessionsFromDisk();
  const visibleSessions = context.getSessionsForTab(sessions, "active");

  if (visibleSessions.length === 0) {
    const createdId = await context.createServerSession(t("session.createDefaultTitle"));
    await context.setActiveSession(createdId);
    await context.loadSessionListAndRender({ preserveActive: true });
    await context.loadActiveSessionHistory();
    return;
  }

  const resumeMode = normalizeResumeMode(resumeModeRaw);
  if (resumeMode === "new") {
    const createdId = await context.createServerSession(t("session.createDefaultTitle"));
    await context.setActiveSession(createdId);
    await context.loadSessionListAndRender({ preserveActive: true });
    await context.loadActiveSessionHistory();
    return;
  }

  const explicitResumeId = resumeSessionId.trim();
  const fallbackResumeId = context.runtime.activeSessionId?.trim() ?? "";
  const nextSessionId =
    findVisibleSessionId(
      Array.from(new Set([explicitResumeId, fallbackResumeId])),
      visibleSessions
    ) ??
    visibleSessions[0]?.id ??
    null;

  await context.setActiveSession(nextSessionId);

  await context.loadSessionListAndRender({ preserveActive: true });
  await context.loadActiveSessionHistory();
}

export function startPeriodicRefresh(context: BootstrapContext): void {
  const lastCheckEl = context.byId<HTMLElement>("last-check");
  if (lastCheckEl != null) {
    lastCheckEl.textContent = t("bootstrap.lastCheck", { time: formatTime(new Date()) });
  }

  setInterval(() => {
    void (async (): Promise<void> => {
      try {
        await context.checkHealth();
      } catch (_error) {}

      if (lastCheckEl != null) {
        lastCheckEl.textContent = t("bootstrap.lastCheck", { time: formatTime(new Date()) });
      }
    })();
  }, 120000);
}

let sessionUpdatedListenerBound = false;

export function startLiveMessageRefresh(context: BootstrapContext): void {
  const api = window.electronAPI as
    | undefined
    | {
        opencodeUiOnSessionUpdated?: (callback: (payload: { sessionId: string }) => void) => void;
      };

  if (sessionUpdatedListenerBound) {
    return;
  }

  if (!api?.opencodeUiOnSessionUpdated) {
    setInterval(() => {
      void context.syncActiveSessionHistoryIfUpdated();
    }, 1200);
    return;
  }

  sessionUpdatedListenerBound = true;
  api.opencodeUiOnSessionUpdated((payload) => {
    if (payload.sessionId !== context.runtime.activeSessionId) {
      return;
    }
    void context.syncActiveSessionHistoryIfUpdated();
  });
}

export async function runOpencodeUiBootstrapPipeline(options: {
  deps: OpencodeUiBootstrapDeps;
  emitStage: (title: string, subtitle: string) => void;
  emitToolsReady: (payload: OpencodeUiToolsReadyPayload) => void;
}): Promise<void> {
  const { deps, emitStage, emitToolsReady } = options;

  emitStage(t("bootstrap.healthCheckTitle"), t("bootstrap.healthCheckSubtitle"));
  await deps.checkHealth();

  emitStage(t("bootstrap.statusContextTitle"), t("bootstrap.statusContextSubtitle"));
  await deps.loadStatusContext();

  emitStage(t("bootstrap.mcpWaitTitle"), t("bootstrap.mcpWaitSubtitle"));
  const mcpResult = await deps.waitForMcpServersSettled();

  emitStage(t("bootstrap.toolSnapshotTitle"), t("bootstrap.toolSnapshotSubtitle"));
  const toolsResult = await deps.loadToolsFinalSnapshot();

  emitToolsReady({
    ready: true,
    unresolvedServers: mcpResult.ready ? [] : mcpResult.unresolvedServers,
    mcpChecks: mcpResult.checks,
    toolCount: toolsResult.toolIds.length,
  });

  if (mcpResult.ready) {
    emitStage(t("bootstrap.connectionReadyTitle"), t("bootstrap.connectionReadySubtitle"));
  } else {
    emitStage(t("bootstrap.connectionPartialTitle"), t("bootstrap.connectionPartialSubtitle"));
  }
}

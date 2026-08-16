import { apiCall } from "./api.js";
import { escapeHtml } from "./chat-utils.js";
import { t } from "./i18n.js";
import { normalizeSessionId } from "./message-content.js";
import type { OpencodeUiSessionSummary, RuntimeState, SessionTab } from "./types.js";

type ByIdFn = <T extends HTMLElement>(id: string, guard?: (element: T) => boolean) => T | null;

interface SessionListContext {
  runtime: RuntimeState;
  byId: ByIdFn;
  formatTimestamp: (value: number) => string;
  listSessionsFromDisk: () => Promise<OpencodeUiSessionSummary[]>;
  archiveSessionInDisk: (sessionId: string, archived?: boolean) => Promise<void>;
  loadActiveSessionHistory: () => Promise<void>;
  loadSessionListAndRender: (options?: {
    preserveActive?: boolean;
    syncSelectionToTab?: boolean;
  }) => Promise<void>;
  setActiveSession: (sessionId: string | null) => Promise<void>;
  createServerSession: (title?: string) => Promise<string>;
  ensureSessionInDisk: (sessionId: string, title?: string) => Promise<void>;
  reportError: (error: unknown, options?: { defaultTitleKey: string }) => void;
}

export function isSessionArchived(session: OpencodeUiSessionSummary): boolean {
  return Number.isFinite(session.archived_at) && Number(session.archived_at) > 0;
}

export function getSessionsForTab(
  sessions: OpencodeUiSessionSummary[],
  tab: SessionTab
): OpencodeUiSessionSummary[] {
  return sessions.filter((session) =>
    tab === "archived" ? isSessionArchived(session) : !isSessionArchived(session)
  );
}

function renderSessionTabs(
  sessions: OpencodeUiSessionSummary[],
  context: Pick<SessionListContext, "runtime" | "byId">
): void {
  const activeBtn = context.byId<HTMLButtonElement>("session-tab-active");
  const archivedBtn = context.byId<HTMLButtonElement>("session-tab-archived");
  const activeCount = getSessionsForTab(sessions, "active").length;
  const archivedCount = getSessionsForTab(sessions, "archived").length;

  if (activeBtn != null) {
    activeBtn.textContent = t("session.tabActive") + ` (${String(activeCount)})`;
    activeBtn.classList.toggle("is-active", context.runtime.sessionTab === "active");
  }

  if (archivedBtn != null) {
    archivedBtn.textContent = t("session.tabArchived") + ` (${String(archivedCount)})`;
    archivedBtn.classList.toggle("is-active", context.runtime.sessionTab === "archived");
  }
}

function getSessionStateLabel(state: "idle" | "active" | "working" | "archived"): string {
  switch (state) {
    case "idle":
      return t("session.stateIdle");
    case "active":
      return t("session.stateActive");
    case "working":
      return t("session.stateWorking");
    case "archived":
      return t("session.stateArchived");
    default:
      return t("session.stateIdle");
  }
}

function getSessionVisualState(
  session: OpencodeUiSessionSummary,
  runtime: RuntimeState
): "idle" | "active" | "working" | "archived" {
  if (runtime.isSubmitting && session.id === runtime.submittingSessionId) {
    return "working";
  }

  if (session.id === runtime.activeSessionId) {
    return "active";
  }

  return isSessionArchived(session) ? "archived" : "idle";
}

function renderSessionList(
  sessions: OpencodeUiSessionSummary[],
  context: Pick<SessionListContext, "runtime" | "byId" | "formatTimestamp">
): void {
  const listEl = context.byId<HTMLElement>("session-list");
  const countEl = context.byId<HTMLElement>("session-count-label");
  const visibleSessions = getSessionsForTab(sessions, context.runtime.sessionTab);

  renderSessionTabs(sessions, context);

  if (countEl != null) {
    countEl.textContent =
      context.runtime.sessionTab === "archived"
        ? t("session.countArchived", { count: visibleSessions.length })
        : t("session.countActive", { count: visibleSessions.length });
  }

  if (listEl == null) {
    return;
  }

  if (visibleSessions.length === 0) {
    listEl.innerHTML =
      context.runtime.sessionTab === "archived"
        ? `<div class="ds-empty-state">${escapeHtml(t("session.emptyArchived"))}</div>`
        : `<div class="ds-empty-state">${escapeHtml(t("session.emptyActive"))}</div>`;
    return;
  }

  listEl.innerHTML = visibleSessions
    .map((session) => {
      const isActive = session.id === context.runtime.activeSessionId;
      const archived = isSessionArchived(session);
      const visualState = getSessionVisualState(session, context.runtime);
      const title = session.title !== "" ? session.title : t("session.untitled");
      const shortId = session.id.slice(0, 8);
      const updatedAt = context.formatTimestamp(Number(session.updated_at));
      const archiveAction = archived
        ? ""
        : '<button class="ds-session__action ds-session__action--archive" data-action="archive" title="' +
          escapeHtml(t("session.actionArchive")) +
          `">${escapeHtml(t("session.actionArchiveShort"))}</button>`;
      const forkAction = archived
        ? ""
        : '<button class="ds-session__action" data-action="fork" title="' +
          escapeHtml(t("session.actionFork")) +
          `">${escapeHtml(t("session.actionForkShort"))}</button>`;
      const renameAction = archived
        ? ""
        : '<button class="ds-session__action" data-action="rename" title="' +
          escapeHtml(t("session.actionRename")) +
          `">${escapeHtml(t("session.actionRenameShort"))}</button>`;
      const stateLabel = getSessionStateLabel(visualState);

      return (
        '<div class="ds-session' +
        (isActive ? " ds-session--active" : "") +
        (visualState === "working" ? " ds-session--working" : "") +
        '" data-session-id="' +
        escapeHtml(session.id) +
        '">' +
        '<div class="ds-session__header">' +
        '<span class="ds-session__indicator ds-session__indicator--' +
        visualState +
        '"></span>' +
        '<span class="ds-session__title" title="' +
        escapeHtml(title) +
        '">' +
        escapeHtml(title) +
        "</span>" +
        '<span class="ds-session__badge ds-session__badge--' +
        visualState +
        '">* ' +
        escapeHtml(stateLabel) +
        "</span>" +
        "</div>" +
        '<span class="ds-session__meta">' +
        escapeHtml(shortId) +
        "... * " +
        escapeHtml(updatedAt) +
        "</span>" +
        '<div class="ds-session__actions">' +
        forkAction +
        renameAction +
        archiveAction +
        '<button class="ds-session__action ds-session__action--delete" data-action="delete" title="' +
        escapeHtml(t("session.actionDelete")) +
        `">${escapeHtml(t("session.actionDeleteShort"))}</button>` +
        "</div>" +
        "</div>"
      );
    })
    .join("");
}

export async function syncActiveSessionToCurrentTab(
  context: SessionListContext,
  sessions?: OpencodeUiSessionSummary[]
): Promise<void> {
  const availableSessions = sessions ?? (await context.listSessionsFromDisk());
  const visibleSessions = getSessionsForTab(availableSessions, context.runtime.sessionTab);
  const activeSessionVisible =
    context.runtime.activeSessionId != null &&
    visibleSessions.some((session) => session.id === context.runtime.activeSessionId);

  if (activeSessionVisible) {
    return;
  }

  await context.setActiveSession(visibleSessions[0]?.id ?? null);
  await context.loadActiveSessionHistory();
}

export async function loadSessionListAndRender(
  context: SessionListContext,
  options: {
    preserveActive?: boolean;
    syncSelectionToTab?: boolean;
  } = {}
): Promise<void> {
  try {
    const sessions = await context.listSessionsFromDisk();
    const visibleSessions = getSessionsForTab(sessions, context.runtime.sessionTab);

    if (options.syncSelectionToTab === true) {
      const activeSessionVisible =
        context.runtime.activeSessionId != null &&
        visibleSessions.some((session) => session.id === context.runtime.activeSessionId);

      if (!activeSessionVisible) {
        await context.setActiveSession(visibleSessions[0]?.id ?? null);
        await context.loadActiveSessionHistory();
      }
    }

    if (
      options.preserveActive !== true &&
      (context.runtime.activeSessionId == null || context.runtime.activeSessionId === "") &&
      visibleSessions.length > 0
    ) {
      await context.setActiveSession(visibleSessions[0]?.id ?? null);
    }

    renderSessionList(sessions, context);
  } catch (error) {
    const listEl = context.byId<HTMLElement>("session-list");
    if (listEl != null) {
      listEl.innerHTML =
        '<div class="ds-empty-state">' +
        escapeHtml(
          t("session.listReadError", {
            message: error instanceof Error ? error.message : String(error),
          })
        ) +
        "</div>";
    }
  }
}

export async function activateSession(
  context: SessionListContext,
  sessionId: string
): Promise<void> {
  if (sessionId === "" || context.runtime.activeSessionId === sessionId) {
    return;
  }

  await context.setActiveSession(sessionId);
  await context.loadSessionListAndRender({ preserveActive: true });
  await context.loadActiveSessionHistory();
}

export async function handleSessionAction(
  context: SessionListContext,
  sessionId: string,
  action: string
): Promise<void> {
  if (action === "archive") {
    const confirmed = window.confirm(t("session.confirmArchive"));
    if (!confirmed) {
      return;
    }

    await context.archiveSessionInDisk(sessionId, true);
    await syncActiveSessionToCurrentTab(context);
    const sessions = await context.listSessionsFromDisk();
    renderSessionList(sessions, context);
    return;
  }

  if (action === "delete") {
    const confirmed = window.confirm(t("session.confirmDelete"));
    if (!confirmed) {
      return;
    }

    await apiCall("DELETE", `/session/${encodeURIComponent(sessionId)}`);
    await syncActiveSessionToCurrentTab(context);
    const sessions = await context.listSessionsFromDisk();
    renderSessionList(sessions, context);
    return;
  }

  if (action === "rename") {
    const row = document.querySelector<HTMLElement>(
      `.ds-session[data-session-id="${CSS.escape(sessionId)}"]`
    );
    const titleSpan = row?.querySelector<HTMLElement>(".ds-session__title");
    if (titleSpan == null) {
      return;
    }

    const current = titleSpan.textContent;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "ds-session__title-input";
    input.value = current;

    const commitRename = async (): Promise<void> => {
      const title = input.value.trim();
      if (title !== "" && title !== current) {
        try {
          await apiCall("PATCH", `/session/${encodeURIComponent(sessionId)}`, { title });
        } catch (_error) {}
      }
      await context.loadSessionListAndRender({ preserveActive: true });
    };

    let committed = false;
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        committed = true;
        void commitRename();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        committed = true;
        void context.loadSessionListAndRender({ preserveActive: true });
      }
    });

    input.addEventListener("blur", () => {
      if (!committed) {
        committed = true;
        void commitRename();
      }
    });

    titleSpan.textContent = "";
    titleSpan.appendChild(input);
    input.focus();
    input.select();
    return;
  }

  if (action === "fork") {
    const response = await apiCall<unknown>(
      "POST",
      `/session/${encodeURIComponent(sessionId)}/fork`,
      {}
    );
    const forkId = normalizeSessionId(response);
    if (forkId !== "") {
      await context.ensureSessionInDisk(forkId, t("session.actionFork"));
      await activateSession(context, forkId);
    } else {
      await context.loadSessionListAndRender({ preserveActive: true });
    }
  }
}

export async function switchSessionTab(
  context: SessionListContext,
  tab: SessionTab
): Promise<void> {
  if (context.runtime.sessionTab === tab) {
    return;
  }

  context.runtime.sessionTab = tab;
  await context.loadSessionListAndRender({
    preserveActive: true,
    syncSelectionToTab: true,
  });
}

export function initSessionEvents(context: SessionListContext): void {
  const newSessionBtn = context.byId<HTMLButtonElement>("new-session-btn");
  if (newSessionBtn != null) {
    newSessionBtn.addEventListener("click", () => {
      void (async (): Promise<void> => {
        try {
          context.runtime.sessionTab = "active";
          const sessionId = await context.createServerSession(t("session.createDefaultTitle"));
          await context.setActiveSession(sessionId);
          await context.loadSessionListAndRender({ preserveActive: true });
          await context.loadActiveSessionHistory();
        } catch (error) {
          context.reportError(error, { defaultTitleKey: "session.createFailedTitle" });
        }
      })();
    });
  }

  const refreshBtn = context.byId<HTMLButtonElement>("session-refresh-btn");
  if (refreshBtn != null) {
    refreshBtn.addEventListener("click", () => {
      refreshBtn.classList.add("is-spinning");
      refreshBtn.addEventListener(
        "animationend",
        () => {
          refreshBtn.classList.remove("is-spinning");
        },
        { once: true }
      );
      void context.loadSessionListAndRender({ preserveActive: true });
    });
  }

  const activeTabBtn = context.byId<HTMLButtonElement>("session-tab-active");
  activeTabBtn?.addEventListener("click", () => {
    void switchSessionTab(context, "active");
  });

  const archivedTabBtn = context.byId<HTMLButtonElement>("session-tab-archived");
  archivedTabBtn?.addEventListener("click", () => {
    void switchSessionTab(context, "archived");
  });

  const listEl = context.byId<HTMLElement>("session-list");
  if (listEl != null) {
    listEl.addEventListener("click", (event) => {
      void (async (): Promise<void> => {
        const target = event.target as HTMLElement;
        const row = target.closest<HTMLElement>(".ds-session");
        if (row == null) {
          return;
        }

        const sessionId = row.dataset["sessionId"] ?? "";
        if (sessionId === "") {
          return;
        }

        const actionButton = target.closest<HTMLElement>(".ds-session__action");
        const action = actionButton?.dataset["action"];
        if (action != null && action !== "") {
          try {
            await handleSessionAction(context, sessionId, action);
          } catch (error) {
            context.reportError(error, { defaultTitleKey: "session.actionFailedTitle" });
          }
          return;
        }

        await activateSession(context, sessionId);
      })();
    });
  }
}

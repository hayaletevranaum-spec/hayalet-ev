import { type OverlayLogEntry, type OverlayState } from "./overlay-model.js";
import { formatDateTime, formatTime, t as entranceT } from "../panel-i18n.js";

interface OverlayRenderParams {
  state: OverlayState;
  overlayContent: HTMLElement;
  levelSelect: HTMLSelectElement;
  searchInput: HTMLInputElement;
  metrics: HTMLElement;
  detailMessage: HTMLElement;
  detailMeta: HTMLElement;
  detailContext: HTMLElement;
  formatLogCategory: (category: string) => string;
  escapeHtml: (text: string) => string;
  maxLogs: number;
}

export function setActiveTabUI(state: OverlayState, appButtons: HTMLButtonElement[]): void {
  appButtons.forEach((button) => {
    const isActive = button.dataset["app"] === state.activeApp;
    button.classList.toggle("is-active", isActive);
  });
}

export function setPauseButtonUI(state: OverlayState, pauseBtn: HTMLButtonElement): void {
  pauseBtn.textContent = state.paused ? entranceT("liveLog.resume") : entranceT("liveLog.pause");
  pauseBtn.title = state.paused
    ? entranceT("liveLog.resumeTitle")
    : entranceT("liveLog.pauseTitle");
  pauseBtn.classList.toggle("is-active", state.paused);
}

function formatLevelLabel(level: string): string {
  switch (level.toLowerCase()) {
    case "error":
      return entranceT("liveLog.levels.error");
    case "warn":
    case "warning":
      return entranceT("liveLog.levels.warning");
    case "info":
      return entranceT("liveLog.levels.info");
    case "success":
      return entranceT("liveLog.levels.success");
    case "debug":
      return entranceT("liveLog.levels.debug");
    default:
      return level.toUpperCase();
  }
}

export function renderDetail(
  detailMessage: HTMLElement,
  detailMeta: HTMLElement,
  detailContext: HTMLElement,
  entry: OverlayLogEntry | null
): void {
  if (entry === null) {
    detailMessage.textContent = "";
    delete detailMessage.dataset["level"];
    detailMeta.textContent = entranceT("liveLog.noEntrySelected");
    detailContext.textContent = "";
    return;
  }

  const when = formatDateTime(new Date(entry.timestamp));
  const correlation = entry.correlationId ?? "-";
  detailMessage.textContent = entry.message;
  detailMessage.dataset["level"] = entry.level;
  detailMeta.textContent = entranceT("liveLog.detailMeta", {
    app: entry.app,
    sessionId: entry.sessionId,
    level: formatLevelLabel(entry.level),
    source: entry.source,
    category: entry.category,
    timestamp: when,
    correlationId: correlation,
  });
  detailContext.textContent =
    entry.context !== undefined
      ? JSON.stringify(entry.context, null, 2)
      : entranceT("liveLog.noContext");
}

export function syncSessionSelect(state: OverlayState, sessionSelect: HTMLSelectElement): void {
  const sessions = state.sessionsByApp[state.activeApp];
  sessionSelect.innerHTML = "";

  if (sessions.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = entranceT("liveLog.noSessions");
    sessionSelect.appendChild(option);
    sessionSelect.value = "";
    return;
  }

  sessions.forEach((sessionId) => {
    const option = document.createElement("option");
    option.value = sessionId;
    option.textContent = sessionId;
    sessionSelect.appendChild(option);
  });

  const selected = state.selectedSessionByApp[state.activeApp];
  if (selected !== "" && sessions.includes(selected)) {
    sessionSelect.value = selected;
  } else {
    const fallback = sessions[0] ?? "";
    state.selectedSessionByApp[state.activeApp] = fallback;
    sessionSelect.value = fallback;
  }
}

export function renderEntries(params: OverlayRenderParams): void {
  const {
    state,
    overlayContent,
    levelSelect,
    searchInput,
    metrics,
    detailMessage,
    detailMeta,
    detailContext,
    formatLogCategory,
    escapeHtml,
    maxLogs,
  } = params;

  const allEntries = state.entriesByApp[state.activeApp];
  const levelFilter = levelSelect.value;
  const searchFilter = searchInput.value.trim().toLowerCase();

  const filtered = allEntries.filter((entry) => {
    if (levelFilter !== "all" && entry.level !== levelFilter) {
      return false;
    }

    if (searchFilter === "") {
      return true;
    }

    const haystack =
      `${entry.message} ${entry.category} ${entry.source} ${entry.sessionId}`.toLowerCase();
    return haystack.includes(searchFilter);
  });

  metrics.textContent = entranceT("liveLog.metrics", {
    visible: filtered.length,
    total: allEntries.length,
  });
  overlayContent.innerHTML = "";

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ds-log-empty";
    empty.textContent = entranceT("liveLog.empty");
    overlayContent.appendChild(empty);
    renderDetail(detailMessage, detailMeta, detailContext, null);
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.slice(0, maxLogs).forEach((entry) => {
    const row = document.createElement("div");
    row.className =
      `ds-log-entry ds-log-level-${entry.level}` +
      (entry.id === state.selectedEntryId ? " is-selected" : "");
    row.dataset["entryId"] = entry.id;

    const time = formatTime(new Date(entry.timestamp));
    const category = formatLogCategory(entry.category);
    const safeLevel = escapeHtml(formatLevelLabel(entry.level));
    const displayMessage = escapeHtml(entry.message);

    row.innerHTML = `
      <div class="ds-log-entry__header">
        <span class="ds-log-time">${escapeHtml(time)}</span>
        <span class="ds-log-level-badge ds-log-level-badge-${entry.level}">${safeLevel}</span>
        <span class="ds-log-app">${escapeHtml(entry.app)}</span>
        <span class="ds-log-category">${escapeHtml(category)}</span>
      </div>
      <div class="ds-log-message">${displayMessage}</div>
    `;

    row.addEventListener("click", () => {
      state.selectedEntryId = entry.id;
      renderEntries(params);
      renderDetail(detailMessage, detailMeta, detailContext, entry);
    });

    fragment.appendChild(row);
  });

  overlayContent.appendChild(fragment);

  const selected = filtered.find((entry) => entry.id === state.selectedEntryId) ?? null;
  renderDetail(detailMessage, detailMeta, detailContext, selected);
}

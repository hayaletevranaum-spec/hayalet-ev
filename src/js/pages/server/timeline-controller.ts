import { LogCategory, Logger } from "../../modules/logger/index.js";
import type { LogEntry } from "../../modules/logger/index.js";
import { AppI18n } from "../../modules/i18n/index.js";
import { buildInlineCommandSnippet } from "../server-command-utils.js";
import {
  buildTimelineThreads,
  getStructuredEntries,
  getTimelineSessionIds,
  normalizeTimelineEvent,
  registerTimelineEvent,
  sortTimelineEvents,
  timelineToText,
} from "../server-timeline.js";
import type { TimelineEvent, TimelineThread } from "../server-timeline.js";

function timelineT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.server.timeline.${key}`, params);
}

export interface TimelineState {
  timelineEvents: Map<string, TimelineEvent>;
  timelineSessionIds: string[];
  timelineSessionCursor: number;
  timelineLoadedSessionIds: Set<string>;
  timelineLoading: boolean;
  timelineInitialized: boolean;
  timelineLog: HTMLElement | null;
}

export function hasMoreTimelineSessions(state: TimelineState): boolean {
  return state.timelineSessionCursor < state.timelineSessionIds.length;
}

export function isTimelineNearBottom(timelineLog: HTMLElement | null): boolean {
  if (timelineLog === null) return false;
  const distance = timelineLog.scrollHeight - timelineLog.scrollTop - timelineLog.clientHeight;
  return distance <= 72;
}

export function scrollTimelineToBottom(timelineLog: HTMLElement | null): void {
  if (timelineLog === null) return;
  timelineLog.scrollTop = timelineLog.scrollHeight;
}

export function createTimelineThreadElement(
  thread: TimelineThread,
  getProviderLabel: (provider: string | null) => string
): HTMLElement {
  const root = document.createElement("div");
  root.className = `timeline-thread${thread.resultDetail === "" ? " is-pending" : ""}`;

  const header = document.createElement("div");
  header.className = "timeline-thread-header";
  const commandFallback = timelineT("commandFallback");

  const actor = document.createElement("span");
  const target = thread.provider !== "" ? getProviderLabel(thread.provider) : "AI";
  actor.textContent = `${thread.sender} -> ${target}`;

  const stamp = document.createElement("span");
  stamp.textContent = thread.commandTimestamp;

  header.appendChild(actor);
  header.appendChild(stamp);

  const commandLine = document.createElement("div");
  commandLine.className = "timeline-thread-command";
  if (thread.command !== "" && thread.command !== commandFallback) {
    commandLine.textContent = `${timelineT("commandLabel")}: ${buildInlineCommandSnippet(thread.command, thread.args)}`;
  } else {
    commandLine.textContent = `${timelineT("commandLabel")}: ${thread.command}`;
  }

  const resultLine = document.createElement("div");
  resultLine.className = `timeline-thread-result${thread.resultSuccess === false ? " is-error" : ""}`;
  if (thread.resultDetail !== "") {
    resultLine.textContent = `${timelineT("resultLabel")}: ${thread.resultDetail}`;
  } else {
    resultLine.textContent = timelineT("pendingResult");
  }

  const meta = document.createElement("div");
  meta.className = "timeline-thread-meta";
  const metaParts: string[] = [];
  if (thread.transportDetail !== "") {
    metaParts.push(`${timelineT("transportLabel")}: ${thread.transportDetail}`);
  }
  metaParts.push(`${timelineT("sessionLabel")}: ${thread.sessionId}`);
  if (thread.resultTimestamp !== "") {
    metaParts.push(`${timelineT("resultTimestampLabel")}: ${thread.resultTimestamp}`);
  }
  meta.textContent = metaParts.join(" | ");

  root.appendChild(header);
  root.appendChild(commandLine);
  root.appendChild(resultLine);
  root.appendChild(meta);

  return root;
}

export function rebuildTimelineView(args: {
  state: TimelineState;
  getProviderLabel: (provider: string | null) => string;
  stickToBottom?: boolean;
}): void {
  const { state, getProviderLabel, stickToBottom = false } = args;
  if (state.timelineLog === null) {
    return;
  }

  const events = sortTimelineEvents(Array.from(state.timelineEvents.values()));
  const threads = buildTimelineThreads(events, getProviderLabel);

  state.timelineLog.innerHTML = "";
  if (threads.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ds-log-empty";
    empty.textContent = AppI18n.t("app.server.page.timelineEmpty");
    state.timelineLog.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  threads.forEach((thread) => {
    fragment.appendChild(createTimelineThreadElement(thread, getProviderLabel));
  });
  state.timelineLog.appendChild(fragment);

  if (stickToBottom) {
    scrollTimelineToBottom(state.timelineLog);
  }
}

export function seedTimelineFromMemoryLogs(
  state: TimelineState,
  getProviderLabel: (provider: string | null) => string
): void {
  const recent = Logger.getRecentLogs(500);
  recent.forEach((entry) => {
    const normalized = normalizeTimelineEvent(entry, {
      fallbackSessionId: timelineToText(entry.sessionId),
      getProviderLabel,
    });
    if (normalized === null) {
      return;
    }
    registerTimelineEvent(state.timelineEvents, normalized);
  });
}

export async function readSessionTimelineEvents(args: {
  sessionId: string;
  getProviderLabel: (provider: string | null) => string;
}): Promise<TimelineEvent[]> {
  const { sessionId, getProviderLabel } = args;
  const loggerApi = window.electronAPI?.logger;
  if (loggerApi === undefined) {
    return [];
  }

  try {
    const payload = await loggerApi.readAllLogs(sessionId);
    const entries = getStructuredEntries(payload);
    const events = entries
      .map((entry) =>
        normalizeTimelineEvent(entry, {
          fallbackSessionId: sessionId,
          getProviderLabel,
        })
      )
      .filter((entry): entry is TimelineEvent => entry !== null);
    return sortTimelineEvents(events);
  } catch (error) {
    Logger.warn(
      LogCategory.SERVER_COMMANDS,
      timelineT("sessionLogReadFailed", {
        sessionId,
        message: error instanceof Error ? error.message : String(error),
      })
    );
    return [];
  }
}

export async function loadMoreTimelineSessions(args: {
  state: TimelineState;
  preserveScroll: boolean;
  batchSize: number;
  updateTimelineMeta: (text: string) => void;
  getProviderLabel: (provider: string | null) => string;
}): Promise<void> {
  const { state, preserveScroll, batchSize, updateTimelineMeta, getProviderLabel } = args;
  if (state.timelineLoading) {
    return;
  }

  if (!hasMoreTimelineSessions(state)) {
    return;
  }

  const timeline = state.timelineLog;
  const prevHeight = preserveScroll && timeline !== null ? timeline.scrollHeight : 0;
  const prevTop = preserveScroll && timeline !== null ? timeline.scrollTop : 0;

  state.timelineLoading = true;
  updateTimelineMeta(timelineT("loadingHistory"));

  try {
    const start = state.timelineSessionCursor;
    const end = Math.min(state.timelineSessionIds.length, start + batchSize);
    const batchSessionIds = state.timelineSessionIds.slice(start, end);
    state.timelineSessionCursor = end;

    await batchSessionIds.reduce<Promise<void>>(async (prev, sessionId) => {
      await prev;
      if (state.timelineLoadedSessionIds.has(sessionId)) {
        return;
      }
      const events = await readSessionTimelineEvents({ sessionId, getProviderLabel });
      events.forEach((event) => {
        registerTimelineEvent(state.timelineEvents, event);
      });
      state.timelineLoadedSessionIds.add(sessionId);
    }, Promise.resolve());

    rebuildTimelineView({ state, getProviderLabel, stickToBottom: false });

    if (preserveScroll && timeline !== null) {
      const delta = timeline.scrollHeight - prevHeight;
      timeline.scrollTop = prevTop + delta;
    }
  } finally {
    state.timelineLoading = false;
    const remaining = Math.max(0, state.timelineSessionIds.length - state.timelineSessionCursor);
    if (remaining > 0) {
      updateTimelineMeta(timelineT("scrollForMore", { batchSize, remaining }));
    } else {
      updateTimelineMeta(
        timelineT("historyLoaded", { count: state.timelineLoadedSessionIds.size })
      );
    }
  }
}

export async function initializeTimeline(args: {
  state: TimelineState;
  batchSize: number;
  updateTimelineMeta: (text: string) => void;
  getProviderLabel: (provider: string | null) => string;
}): Promise<void> {
  const { state, batchSize, updateTimelineMeta, getProviderLabel } = args;
  if (state.timelineInitialized) {
    return;
  }

  state.timelineInitialized = true;
  state.timelineEvents.clear();
  state.timelineSessionIds = [];
  state.timelineSessionCursor = 0;
  state.timelineLoadedSessionIds.clear();

  const loggerApi = window.electronAPI?.logger;
  if (loggerApi !== undefined) {
    try {
      const sessionsPayload = await loggerApi.listSessions();
      state.timelineSessionIds = getTimelineSessionIds(sessionsPayload);
    } catch (error) {
      Logger.warn(
        LogCategory.SERVER_COMMANDS,
        timelineT("sessionListReadFailed", {
          message: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  if (state.timelineSessionIds.length > 0) {
    await loadMoreTimelineSessions({
      state,
      preserveScroll: false,
      batchSize,
      updateTimelineMeta,
      getProviderLabel,
    });
  }

  seedTimelineFromMemoryLogs(state, getProviderLabel);
  rebuildTimelineView({ state, getProviderLabel, stickToBottom: true });

  if (!state.timelineLoading && !hasMoreTimelineSessions(state)) {
    const total = state.timelineLoadedSessionIds.size;
    updateTimelineMeta(
      total > 0 ? timelineT("historyLoaded", { count: total }) : timelineT("liveConnected")
    );
  }
}

export async function handleTimelineScroll(args: {
  state: TimelineState;
  topThreshold: number;
  batchSize: number;
  updateTimelineMeta: (text: string) => void;
  getProviderLabel: (provider: string | null) => string;
}): Promise<void> {
  const { state, topThreshold, batchSize, updateTimelineMeta, getProviderLabel } = args;
  if (state.timelineLog === null || state.timelineLoading) {
    return;
  }
  if (state.timelineLog.scrollTop > topThreshold) {
    return;
  }
  if (!hasMoreTimelineSessions(state)) {
    return;
  }
  await loadMoreTimelineSessions({
    state,
    preserveScroll: true,
    batchSize,
    updateTimelineMeta,
    getProviderLabel,
  });
}

export function handleTimelineLogEntry(args: {
  state: TimelineState;
  entry: LogEntry;
  getProviderLabel: (provider: string | null) => string;
}): void {
  const { state, entry, getProviderLabel } = args;
  const normalized = normalizeTimelineEvent(entry, {
    fallbackSessionId: timelineToText(entry.sessionId),
    getProviderLabel,
  });
  if (normalized === null) {
    return;
  }

  const stickToBottom = isTimelineNearBottom(state.timelineLog);
  const didAdd = registerTimelineEvent(state.timelineEvents, normalized);
  if (!didAdd) {
    return;
  }

  rebuildTimelineView({ state, getProviderLabel, stickToBottom });
}

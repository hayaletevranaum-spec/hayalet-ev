import { LogCategory, LogLevel } from "@shared/logging-core";
import type { LogEntry } from "../modules/logger/index.js";
import { AppI18n } from "../modules/i18n/index.js";
import { resolveIntlLocale } from "../../../shared/i18n/locale.js";

export type TimelineEventType = "command-catch" | "command-result" | "coreengine-ai-send";

export interface TimelineEvent {
  eventKey: string;
  eventType: TimelineEventType;
  sessionId: string;
  isoTimestamp: string;
  displayTimestamp: string;
  provider: string;
  sender: string;
  command: string;
  args: string;
  detail: string;
  success: boolean | null;
  triggerSource: string;
  triggerCommand: string;
}

export interface TimelineThread {
  threadId: string;
  sessionId: string;
  provider: string;
  sender: string;
  command: string;
  args: string;
  commandTimestamp: string;
  commandIsoTimestamp: string;
  resultTimestamp: string;
  resultIsoTimestamp: string;
  resultDetail: string;
  resultSuccess: boolean | null;
  transportDetail: string;
}

interface TimelineEventOptions {
  fallbackSessionId?: string;
  getProviderLabel: (provider: string | null) => string;
}

export function timelineToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value instanceof Error) return value.message;
  if (value !== null && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toLogLevel(value: string): LogLevel {
  const level = value.toLowerCase();
  if (level === LogLevel.DEBUG) return LogLevel.DEBUG;
  if (level === LogLevel.INFO) return LogLevel.INFO;
  if (level === LogLevel.SUCCESS) return LogLevel.SUCCESS;
  if (level === LogLevel.WARNING) return LogLevel.WARNING;
  if (level === LogLevel.ERROR) return LogLevel.ERROR;
  return LogLevel.INFO;
}

function normalizeIsoTimestamp(raw: string): string {
  if (raw === "") return "";
  const stamp = new Date(raw);
  if (Number.isNaN(stamp.getTime())) return "";
  return stamp.toISOString();
}

function isTimelineEventType(value: string): value is TimelineEventType {
  return value === "command-catch" || value === "command-result" || value === "coreengine-ai-send";
}

function buildTimelineEventKey(event: Omit<TimelineEvent, "eventKey">): string {
  return [
    event.sessionId,
    event.isoTimestamp,
    event.eventType,
    event.provider,
    event.sender,
    event.command,
    event.args,
    event.detail,
    event.triggerSource,
    event.triggerCommand,
  ].join("|");
}

function buildPairKey(event: TimelineEvent): string {
  return [
    event.provider.toLowerCase(),
    event.sender.toLowerCase(),
    event.command.toLowerCase(),
    event.args.toLowerCase(),
  ].join("|");
}

function toLogEntry(value: unknown): LogEntry | null {
  if (!isRecord(value)) return null;

  const timestamp = timelineToText(value["timestamp"]);
  const message = timelineToText(value["message"]);
  if (timestamp === "" || message === "") {
    return null;
  }

  const levelText = timelineToText(value["level"]);
  const categoryText = timelineToText(value["category"]);
  const sourceText = timelineToText(value["source"]);
  const sessionId = timelineToText(value["sessionId"]);
  const contextValue = value["context"];
  const metaValue = value["meta"];

  const entry: LogEntry = {
    timestamp,
    level: toLogLevel(levelText),
    category: categoryText !== "" ? categoryText : LogCategory.COMMAND,
    message,
    source: sourceText !== "" ? sourceText : "renderer",
    ...(sessionId !== "" ? { sessionId } : {}),
    ...(isRecord(contextValue) ? { context: contextValue } : {}),
    ...(isRecord(metaValue) ? { meta: metaValue } : {}),
  };

  return entry;
}

function getMetaText(entry: LogEntry, key: string): string {
  return timelineToText(entry.meta?.[key]);
}

function getEntryText(entry: LogEntry, key: string): string {
  const ctxValue = entry.context?.[key];
  if (ctxValue !== undefined && ctxValue !== null) {
    const text = timelineToText(ctxValue);
    if (text !== "") return text;
  }
  return getMetaText(entry, key);
}

function getEventType(entry: LogEntry): string {
  const eventType = getEntryText(entry, "eventType");
  if (eventType !== "") return eventType;
  return timelineToText(entry.source);
}

export function getTimelineSessionIds(payload: unknown): string[] {
  if (!Array.isArray(payload)) return [];

  const entries = payload
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => {
      const sessionId = timelineToText(item["sessionId"]);
      const startTime = timelineToText(item["startTime"]);
      return { sessionId, startTime };
    })
    .filter((item) => item.sessionId !== "");

  entries.sort((a, b) => {
    const aTime = a.startTime !== "" ? new Date(a.startTime).getTime() : 0;
    const bTime = b.startTime !== "" ? new Date(b.startTime).getTime() : 0;
    return bTime - aTime;
  });

  return Array.from(new Set(entries.map((item) => item.sessionId)));
}

export function getStructuredEntries(payload: unknown): LogEntry[] {
  if (!isRecord(payload)) return [];
  const structured = payload["structured"];
  if (!Array.isArray(structured)) return [];

  return structured
    .map((item) => toLogEntry(item))
    .filter((entry): entry is LogEntry => entry !== null);
}

export function normalizeTimelineEvent(
  entry: LogEntry,
  { fallbackSessionId = "", getProviderLabel }: TimelineEventOptions
): TimelineEvent | null {
  const eventTypeRaw = getEventType(entry);
  if (!isTimelineEventType(eventTypeRaw)) {
    return null;
  }

  const isoTimestamp = normalizeIsoTimestamp(timelineToText(entry.timestamp));
  if (isoTimestamp === "") {
    return null;
  }

  const provider = getEntryText(entry, "provider");
  const sender =
    getEntryText(entry, "sender") !== ""
      ? getEntryText(entry, "sender")
      : getProviderLabel(provider);
  const commandText = getEntryText(entry, "command");
  const args = getEntryText(entry, "args");
  const triggerSource = getEntryText(entry, "triggerSource");
  const triggerCommand = getEntryText(entry, "triggerCommand");
  const sessionId =
    timelineToText(entry.sessionId) !== "" ? timelineToText(entry.sessionId) : fallbackSessionId;
  const displayTimestamp =
    getEntryText(entry, "timestamp") !== ""
      ? getEntryText(entry, "timestamp")
      : new Date(isoTimestamp).toLocaleString(resolveIntlLocale(AppI18n.getLocale()));
  const detail =
    getEntryText(entry, "detail") !== ""
      ? getEntryText(entry, "detail")
      : timelineToText(entry.message);
  const command = commandText !== "" ? commandText : triggerCommand;
  const success =
    eventTypeRaw === "command-result"
      ? entry.level === LogLevel.ERROR
        ? false
        : entry.level === LogLevel.SUCCESS
          ? true
          : null
      : null;

  const baseEvent: Omit<TimelineEvent, "eventKey"> = {
    eventType: eventTypeRaw,
    sessionId,
    isoTimestamp,
    displayTimestamp,
    provider,
    sender,
    command,
    args,
    detail,
    success,
    triggerSource,
    triggerCommand,
  };

  return {
    ...baseEvent,
    eventKey: buildTimelineEventKey(baseEvent),
  };
}

export function registerTimelineEvent(
  eventMap: Map<string, TimelineEvent>,
  event: TimelineEvent
): boolean {
  if (eventMap.has(event.eventKey)) {
    return false;
  }
  eventMap.set(event.eventKey, event);
  return true;
}

function findPendingThreadIndex(threads: TimelineThread[], event: TimelineEvent): number {
  const eventCommand = event.command.toLowerCase();
  const eventArgs = event.args.toLowerCase();
  const eventSender = event.sender.toLowerCase();

  for (let i = threads.length - 1; i >= 0; i -= 1) {
    const thread = threads[i];
    if (thread === undefined) continue;
    if (thread.resultDetail !== "") continue;
    if (event.provider !== "" && thread.provider !== event.provider) continue;
    if (eventCommand !== "" && thread.command.toLowerCase() !== eventCommand) continue;
    if (eventArgs !== "" && thread.args.toLowerCase() !== eventArgs) continue;
    if (eventSender !== "" && thread.sender.toLowerCase() !== eventSender) continue;
    return i;
  }

  return -1;
}

function findTransportThreadIndex(threads: TimelineThread[], event: TimelineEvent): number {
  const triggerCommand = event.triggerCommand.toLowerCase();
  const eventTime = new Date(event.isoTimestamp).getTime();

  for (let i = threads.length - 1; i >= 0; i -= 1) {
    const thread = threads[i];
    if (thread === undefined) continue;
    if (event.provider !== "" && thread.provider !== event.provider) continue;

    if (triggerCommand !== "" && thread.command.toLowerCase() !== triggerCommand) {
      continue;
    }

    const threadTime = new Date(thread.commandIsoTimestamp).getTime();
    const withinWindow = Number.isFinite(threadTime)
      ? Math.abs(eventTime - threadTime) <= 3 * 60 * 1000
      : true;

    if (triggerCommand !== "" || withinWindow) {
      return i;
    }
  }

  return -1;
}

function createThreadFromCatchEvent(
  event: TimelineEvent,
  getProviderLabel: (provider: string | null) => string
): TimelineThread {
  const resolvedCommand =
    event.command !== ""
      ? event.command
      : event.triggerCommand !== ""
        ? event.triggerCommand
        : AppI18n.t("app.server.timeline.commandFallback");
  const sender = event.sender !== "" ? event.sender : getProviderLabel(event.provider);

  return {
    threadId: `${event.sessionId}|${event.isoTimestamp}|${resolvedCommand}|${event.args}`,
    sessionId: event.sessionId,
    provider: event.provider,
    sender,
    command: resolvedCommand,
    args: event.args,
    commandTimestamp: event.displayTimestamp,
    commandIsoTimestamp: event.isoTimestamp,
    resultTimestamp: "",
    resultIsoTimestamp: "",
    resultDetail: "",
    resultSuccess: null,
    transportDetail: "",
  };
}

function createThreadFromResultEvent(
  event: TimelineEvent,
  getProviderLabel: (provider: string | null) => string
): TimelineThread {
  const thread = createThreadFromCatchEvent(event, getProviderLabel);
  thread.resultDetail = event.detail;
  thread.resultSuccess = event.success;
  thread.resultTimestamp = event.displayTimestamp;
  thread.resultIsoTimestamp = event.isoTimestamp;
  return thread;
}

export function buildTimelineThreads(
  events: TimelineEvent[],
  getProviderLabel: (provider: string | null) => string
): TimelineThread[] {
  const threads: TimelineThread[] = [];
  const pendingByKey = new Map<string, number[]>();

  events.forEach((event) => {
    if (event.eventType === "command-catch") {
      const thread = createThreadFromCatchEvent(event, getProviderLabel);
      threads.push(thread);

      const pairKey = buildPairKey(event);
      const pending = pendingByKey.get(pairKey) ?? [];
      pending.push(threads.length - 1);
      pendingByKey.set(pairKey, pending);
      return;
    }

    if (event.eventType === "command-result") {
      const pairKey = buildPairKey(event);
      const pending = pendingByKey.get(pairKey);
      let targetIndex = pending !== undefined && pending.length > 0 ? (pending.pop() ?? -1) : -1;

      if (targetIndex < 0) {
        targetIndex = findPendingThreadIndex(threads, event);
      }

      if (targetIndex >= 0) {
        const target = threads[targetIndex];
        if (target !== undefined) {
          target.resultDetail = event.detail;
          target.resultSuccess = event.success;
          target.resultTimestamp = event.displayTimestamp;
          target.resultIsoTimestamp = event.isoTimestamp;
        }
      } else {
        threads.push(createThreadFromResultEvent(event, getProviderLabel));
      }
      return;
    }

    const transportIndex = findTransportThreadIndex(threads, event);
    if (transportIndex >= 0) {
      const target = threads[transportIndex];
      if (target !== undefined) {
        target.transportDetail = event.detail;
      }
      return;
    }

    if (event.triggerCommand !== "" || event.command !== "") {
      const thread = createThreadFromCatchEvent(event, getProviderLabel);
      thread.transportDetail = event.detail;
      threads.push(thread);
    }
  });

  return threads;
}

export function sortTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
  const order: Record<TimelineEventType, number> = {
    "command-catch": 0,
    "coreengine-ai-send": 1,
    "command-result": 2,
  };

  return events.slice().sort((a, b) => {
    if (a.isoTimestamp === b.isoTimestamp) {
      return order[a.eventType] - order[b.eventType];
    }
    return a.isoTimestamp.localeCompare(b.isoTimestamp);
  });
}

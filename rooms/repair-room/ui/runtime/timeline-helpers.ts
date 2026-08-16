import type { RepairEvent } from "../../shared/types/index.js";

export const REPAIR_TIMELINE_PAGE_SIZE = 12;
export const REPAIR_TIMELINE_MIN_PAGE_SIZE = 4;
export const REPAIR_TIMELINE_MAX_PAGE_SIZE = 48;

export type RepairTimelineTextFn = (
  path: string[],
  fallback: string,
  params?: Record<string, string | number>
) => string;

export function formatOffset(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `+${minutes}:${seconds}`;
}

export function formatTimelineText(value: string): string {
  return value
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ")
    .trim();
}

export function formatRepairMomentDateTime(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso;
  return new Date(time).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

const EVENT_KIND_LABELS: Partial<Record<RepairEvent["kind"], [string[], string]>> = {
  annotation: [["timeline", "kinds", "annotation"], "Anotasyon"],
  "ai-mark": [["timeline", "kinds", "aiMark"], "AI İşareti"],
  "ai-mark-lifecycle": [["timeline", "kinds", "aiMarkLifecycle"], "Asistan Durumu"],
  "freeze-frame": [["timeline", "kinds", "freezeFrame"], "Donuk Kare"],
  "investigation-region-created": [["timeline", "kinds", "area"], "Alan"],
  "investigation-region-updated": [["timeline", "kinds", "area"], "Alan"],
  measurement: [["timeline", "kinds", "measurement"], "Ölçüm"],
  note: [["timeline", "kinds", "note"], "Not"],
  "risk-flag": [["timeline", "kinds", "risk"], "Risk Bayrağı"],
  "session-start": [["timeline", "kinds", "sessionStart"], "Oturum Başlangıcı"],
  snapshot: [["timeline", "kinds", "snapshot"], "Kare"],
};

function readText(
  text: RepairTimelineTextFn | undefined,
  path: string[],
  fallback: string
): string {
  return text === undefined ? fallback : text(path, fallback);
}

export function getEventKindLabel(event: RepairEvent, text?: RepairTimelineTextFn): string {
  const entry = EVENT_KIND_LABELS[event.kind] ?? [["timeline", "kinds", "event"], "Event"];
  return readText(text, entry[0], entry[1]);
}

function formatEventToolLabel(tool: string, text?: RepairTimelineTextFn): string {
  switch (tool) {
    case "rect":
      return readText(text, ["workbench", "tools", "rect", "label"], "Kutu");
    case "freehand":
      return readText(text, ["workbench", "tools", "freehand", "label"], "Çiz");
    case "measurement-pin":
      return readText(text, ["workbench", "tools", "measurement-pin", "label"], "Prob");
    case "freeze-frame":
      return readText(text, ["workbench", "tools", "freeze-frame", "label"], "Dondur");
    case "text":
      return readText(text, ["workbench", "tools", "text", "label"], "Metin");
    case "arrow":
      return readText(text, ["workbench", "tools", "arrow", "label"], "Ok");
    case "ruler":
      return readText(text, ["workbench", "tools", "ruler", "label"], "Cetvel");
    default:
      return formatTimelineText(tool);
  }
}

export function getEventLabel(event: RepairEvent, text?: RepairTimelineTextFn): string {
  switch (event.kind) {
    case "ai-mark":
      return readText(
        text,
        ["feed", "severity", event.severity],
        formatTimelineText(event.severity)
      );
    case "measurement":
      return event.reference ?? event.channel;
    case "risk-flag":
      return readText(text, ["timeline", "labels", "risk"], "Risk");
    case "snapshot":
      return readText(text, ["timeline", "labels", "snapshot"], "Kare");
    case "annotation":
      return formatEventToolLabel(event.tool, text);
    case "freeze-frame":
      return readText(text, ["timeline", "labels", "freezeFrame"], "Dondur");
    case "note":
      return readText(text, ["timeline", "labels", "note"], "Not");
    case "session-start":
      return readText(text, ["timeline", "labels", "sessionStart"], "Başlangıç");
    case "ai-mark-lifecycle":
      return readText(text, ["timeline", "labels", "assistantState"], "Asistan durumu");
    case "investigation-region-created":
      return readText(text, ["timeline", "labels", "area"], "Alan");
    case "investigation-region-updated":
      return readText(text, ["timeline", "labels", "area"], "Alan");
    default:
      return readText(text, ["timeline", "labels", "event"], "Olay");
  }
}

export function getRepairMomentOrderedEvents(events: RepairEvent[]): RepairEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      const delta = Date.parse(left.event.occurredAt) - Date.parse(right.event.occurredAt);
      return delta === 0 ? left.index - right.index : delta;
    })
    .map((entry) => entry.event);
}

export function normalizeRepairMomentPageSize(pageSize = REPAIR_TIMELINE_PAGE_SIZE): number {
  if (!Number.isFinite(pageSize)) return REPAIR_TIMELINE_PAGE_SIZE;
  return Math.min(
    REPAIR_TIMELINE_MAX_PAGE_SIZE,
    Math.max(REPAIR_TIMELINE_MIN_PAGE_SIZE, Math.floor(pageSize))
  );
}

export function getRepairMomentLastPageIndex(
  eventCount: number,
  pageSize = REPAIR_TIMELINE_PAGE_SIZE
): number {
  const normalizedPageSize = normalizeRepairMomentPageSize(pageSize);
  return Math.max(0, Math.ceil(eventCount / normalizedPageSize) - 1);
}

export function getRepairMomentPageEvents(
  events: RepairEvent[],
  pageIndex: number,
  pageSize = REPAIR_TIMELINE_PAGE_SIZE
): RepairEvent[] {
  const normalizedPageSize = normalizeRepairMomentPageSize(pageSize);
  const start = Math.max(0, pageIndex) * normalizedPageSize;
  return events.slice(start, start + normalizedPageSize);
}

export function getRepairMomentPageLabel(
  pageIndex: number,
  eventCount: number,
  text?: RepairTimelineTextFn,
  pageSize = REPAIR_TIMELINE_PAGE_SIZE
): string {
  if (eventCount === 0) {
    return readText(text, ["timeline", "empty"], "Kayıt yok");
  }
  const normalizedPageSize = normalizeRepairMomentPageSize(pageSize);
  const start = pageIndex * normalizedPageSize + 1;
  const end = Math.min(eventCount, start + normalizedPageSize - 1);
  const page = pageIndex + 1;
  const pageCount = getRepairMomentLastPageIndex(eventCount, normalizedPageSize) + 1;
  return readText(text, ["timeline", "pageReadout"], "{start}-{end} / {total}")
    .replace("{start}", String(start))
    .replace("{end}", String(end))
    .replace("{total}", String(eventCount))
    .replace("{page}", String(page))
    .replace("{pageCount}", String(pageCount));
}

export function getRepairMomentValue(event: RepairEvent): string | null {
  switch (event.kind) {
    case "measurement":
      return event.unit.trim() === "" ? event.rawDisplay : `${event.rawDisplay} ${event.unit}`;
    case "ai-mark":
    case "risk-flag":
      return formatTimelineText(event.severity);
    case "freeze-frame":
      return `${Math.round(event.durationMs / 1000)}s`;
    case "ai-mark-lifecycle":
      return formatTimelineText(event.state);
    case "investigation-region-created":
    case "investigation-region-updated":
      return event.label ?? event.regionId;
    case "session-start":
    case "snapshot":
    case "annotation":
    case "note":
      return null;
    default:
      return null;
  }
}

export function getRepairMomentSummary(event: RepairEvent, text?: RepairTimelineTextFn): string {
  switch (event.kind) {
    case "snapshot":
      return event.caption;
    case "ai-mark":
      return event.rationale;
    case "measurement":
      return `${event.reference ?? event.channel}: ${getRepairMomentValue(event) ?? event.rawDisplay}`;
    case "annotation":
      return event.label;
    case "note":
      return event.text;
    case "freeze-frame":
      return event.reason;
    case "risk-flag":
      return event.message;
    case "ai-mark-lifecycle":
      return event.reason;
    case "investigation-region-created":
      return event.label;
    case "investigation-region-updated":
      return event.label ?? readText(text, ["timeline", "labels", "area"], "Alan");
    case "session-start":
      return event.title;
    default:
      return getEventLabel(event, text);
  }
}

export function getRepairMomentImageSrc(
  event: RepairEvent,
  orderedEvents: RepairEvent[],
  fallbackSrc: string | null
): string | null {
  if (event.kind === "snapshot" && event.thumbnailSrc !== null) {
    return event.thumbnailSrc;
  }

  const linkedSnapshot = event.linkedEventIds
    .map((id) =>
      orderedEvents.find((candidate) => candidate.id === id && candidate.kind === "snapshot")
    )
    .find(
      (candidate): candidate is Extract<RepairEvent, { kind: "snapshot" }> =>
        candidate?.kind === "snapshot" && candidate.thumbnailSrc !== null
    );
  if (linkedSnapshot !== undefined) return linkedSnapshot.thumbnailSrc;

  const eventTime = Date.parse(event.occurredAt);
  const previousSnapshot = orderedEvents
    .filter((candidate): candidate is Extract<RepairEvent, { kind: "snapshot" }> => {
      if (candidate.kind !== "snapshot" || candidate.thumbnailSrc === null) return false;
      const candidateTime = Date.parse(candidate.occurredAt);
      return Number.isFinite(candidateTime) && candidateTime <= eventTime;
    })
    .at(-1);
  return previousSnapshot?.thumbnailSrc ?? fallbackSrc;
}

export function getRepairMomentIconSvg(kind: RepairEvent["kind"]): string {
  switch (kind) {
    case "measurement":
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 14h14v5H5z"/><path d="M8 14V7l4-3 4 3v7"/><path d="M9 17h1M12 17h3"/></svg>';
    case "snapshot":
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h4l2-2h4l2 2h4v12H4z"/><circle cx="12" cy="13" r="3"/></svg>';
    case "ai-mark":
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';
    case "risk-flag":
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 22 20H2z"/><path d="M12 9v5M12 17h.01"/></svg>';
    case "note":
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M8 11h8M8 15h6"/></svg>';
    case "freeze-frame":
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="5" height="16"/><rect x="14" y="4" width="5" height="16"/><path d="M4 21h16"/></svg>';
    case "annotation":
    case "investigation-region-created":
    case "investigation-region-updated":
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17 15 6l3 3L7 20H4z"/><path d="M13 8l3 3"/></svg>';
    case "session-start":
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>';
    case "ai-mark-lifecycle":
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h8l3 3-3 3H5z"/><path d="M5 17h10M17 17h2"/></svg>';
    default:
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>';
  }
}

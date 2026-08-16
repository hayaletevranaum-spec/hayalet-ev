import { repairEventToTacticalFeedItem } from "../../../shared/data/index.js";
import type { RepairEvent, RepairSession } from "../../../shared/types/index.js";
import type { RepairTacticalFeedItem } from "../../../shared/ui/state.js";
import type { RepairRuntimeState } from "../repair-runtime-state.js";

export function getEventOffsetMs(session: RepairSession, event: RepairEvent): number {
  return Math.max(0, Date.parse(event.occurredAt) - Date.parse(session.startedAt));
}

export function getEventOrder(events: RepairEvent[], eventId: string): number {
  const index = events.findIndex((event) => event.id === eventId);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

export function sortRepairEventsForReplay(events: RepairEvent[]): RepairEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      const timeDelta = Date.parse(left.event.occurredAt) - Date.parse(right.event.occurredAt);
      return timeDelta === 0 ? left.index - right.index : timeDelta;
    })
    .map((entry) => entry.event);
}

export function getLiveEdgeMs(session: RepairSession | null): number {
  if (session === null || session.events.length === 0) return 0;
  return Math.max(...session.events.map((event) => getEventOffsetMs(session, event)));
}

export function getProjectionPlayheadMs(
  state: RepairRuntimeState,
  session: RepairSession | null
): number {
  if (session === null) return 0;
  if (state.workbench.timeline.autoFollowLive) {
    return Math.max(state.workbench.timeline.playheadMs, getLiveEdgeMs(session));
  }
  return Math.max(0, state.workbench.timeline.playheadMs);
}

export function isVisibleAtPlayhead(
  session: RepairSession,
  playheadMs: number,
  event: RepairEvent
): boolean {
  return getEventOffsetMs(session, event) <= playheadMs;
}

export function buildTacticalFeed(
  session: RepairSession,
  visibleEvents: RepairEvent[]
): RepairTacticalFeedItem[] {
  return visibleEvents
    .map((event) => repairEventToTacticalFeedItem(event, session.startedAt))
    .filter((item): item is RepairTacticalFeedItem => item !== null);
}

import type {
  RepairEvent,
  RepairImageRect,
  RepairInvestigationRegion,
  RepairInvestigationRegionCreatedEvent,
  RepairInvestigationRegionLinkage,
  RepairInvestigationRegionUpdatedEvent,
  RepairKnowledgeSpatialRef,
  RepairSession,
} from "../../../shared/types/index.js";
import type {
  RepairKnowledgeRegionProjection,
  RepairTemporarySpatialRegion,
} from "../../../shared/ui/state.js";
import type { RepairRuntimeState } from "../repair-runtime-state.js";

export function eventEntityRef(eventId: string) {
  return { kind: "event" as const, id: eventId };
}

export function regionEntityRef(regionId: string) {
  return { kind: "investigation-region" as const, id: regionId };
}

export function getPointRegion(
  point: { xPx: number; yPx: number },
  widthPx = 48,
  heightPx = widthPx
): RepairImageRect {
  return {
    xPx: Math.max(0, point.xPx - widthPx / 2),
    yPx: Math.max(0, point.yPx - heightPx / 2),
    widthPx,
    heightPx,
  };
}

function getSpatialRefRegion(spatialRef: RepairKnowledgeSpatialRef): RepairImageRect | null {
  if (spatialRef.region !== null && spatialRef.region !== undefined) return spatialRef.region;
  if (spatialRef.point !== null && spatialRef.point !== undefined) {
    return getPointRegion(spatialRef.point);
  }
  return null;
}

export function getEventSpatialRect(event: RepairEvent): RepairImageRect | null {
  if ((event.kind === "ai-mark" || event.kind === "risk-flag") && event.region !== null) {
    return event.region;
  }
  if (event.kind === "annotation") {
    if (event.region !== null) return event.region;
    if (event.point !== null) return getPointRegion(event.point, 42);
  }
  if (event.kind === "measurement" && event.pinAt !== null) return getPointRegion(event.pinAt, 36);
  if (
    event.kind === "investigation-region-created" ||
    event.kind === "investigation-region-updated"
  ) {
    return event.region ?? null;
  }
  return null;
}

export function getRectCenter(rect: RepairImageRect): { xPx: number; yPx: number } {
  return {
    xPx: rect.xPx + rect.widthPx / 2,
    yPx: rect.yPx + rect.heightPx / 2,
  };
}

export function getPointBounds(
  points: Array<{ xPx: number; yPx: number }>,
  paddingPx: number
): RepairImageRect {
  const left = Math.min(...points.map((point) => point.xPx));
  const top = Math.min(...points.map((point) => point.yPx));
  const right = Math.max(...points.map((point) => point.xPx));
  const bottom = Math.max(...points.map((point) => point.yPx));
  return {
    xPx: Math.max(0, left - paddingPx),
    yPx: Math.max(0, top - paddingPx),
    widthPx: Math.max(1, right - left + paddingPx * 2),
    heightPx: Math.max(1, bottom - top + paddingPx * 2),
  };
}

function rectsIntersect(left: RepairImageRect, right: RepairImageRect): boolean {
  return (
    right.xPx <= left.xPx + left.widthPx &&
    right.xPx + right.widthPx >= left.xPx &&
    right.yPx <= left.yPx + left.heightPx &&
    right.yPx + right.heightPx >= left.yPx
  );
}

function rectContainsPoint(rect: RepairImageRect, point: { xPx: number; yPx: number }): boolean {
  return (
    point.xPx >= rect.xPx &&
    point.xPx <= rect.xPx + rect.widthPx &&
    point.yPx >= rect.yPx &&
    point.yPx <= rect.yPx + rect.heightPx
  );
}

function inflateRect(rect: RepairImageRect, paddingPx: number): RepairImageRect {
  return {
    xPx: Math.max(0, rect.xPx - paddingPx),
    yPx: Math.max(0, rect.yPx - paddingPx),
    widthPx: rect.widthPx + paddingPx * 2,
    heightPx: rect.heightPx + paddingPx * 2,
  };
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function getKnowledgeRegionRelatedEvents(
  region: RepairImageRect,
  spatialRef: RepairKnowledgeSpatialRef,
  events: RepairEvent[]
): {
  linkedEventIds: string[];
  relatedMeasurementIds: string[];
  relatedAiMarkIds: string[];
} {
  const paddedRegion = inflateRect(region, 36);
  const linkedEventIds =
    spatialRef.linkedSnapshotId === undefined || spatialRef.linkedSnapshotId === null
      ? []
      : [spatialRef.linkedSnapshotId];
  const relatedMeasurementIds: string[] = [];
  const relatedAiMarkIds: string[] = [];

  events.forEach((event) => {
    if (event.kind === "measurement") {
      const railMatches =
        spatialRef.rail !== null && spatialRef.rail !== undefined
          ? event.group?.rail === spatialRef.rail
          : false;
      const componentMatches =
        spatialRef.componentId !== null &&
        spatialRef.componentId !== undefined &&
        (event.group?.component === spatialRef.componentId ||
          event.reference?.includes(spatialRef.componentId) === true);
      const pointMatches = event.pinAt !== null && rectContainsPoint(paddedRegion, event.pinAt);
      if (railMatches || componentMatches || pointMatches) {
        relatedMeasurementIds.push(event.id);
      }
    }
    if (event.kind === "ai-mark" || event.kind === "risk-flag") {
      const eventRegion = getEventSpatialRect(event);
      const regionMatches = eventRegion !== null && rectsIntersect(paddedRegion, eventRegion);
      const linkMatches =
        event.linkedEventIds.includes(spatialRef.linkedSnapshotId ?? "") ||
        (event.kind === "ai-mark" &&
          event.linkedReplayEventIds?.includes(spatialRef.linkedSnapshotId ?? "") === true);
      if (regionMatches || linkMatches) {
        relatedAiMarkIds.push(event.id);
      }
    }
  });

  return {
    linkedEventIds: uniqueStrings([
      ...linkedEventIds,
      ...relatedMeasurementIds,
      ...relatedAiMarkIds,
    ]),
    relatedMeasurementIds: uniqueStrings(relatedMeasurementIds),
    relatedAiMarkIds: uniqueStrings(relatedAiMarkIds),
  };
}

export function buildKnowledgeRegions(
  session: RepairSession | null,
  events: RepairEvent[]
): RepairKnowledgeRegionProjection[] {
  const pack = session?.knowledgePack ?? null;
  if (pack === null) return [];
  const regions: RepairKnowledgeRegionProjection[] = [];

  pack.commonFailures.forEach((failure) => {
    const spatialRef = failure.spatialRef ?? null;
    const region = spatialRef === null ? null : getSpatialRefRegion(spatialRef);
    if (region !== null && spatialRef !== null) {
      const related = getKnowledgeRegionRelatedEvents(region, spatialRef, events);
      regions.push({
        id: failure.id,
        label: failure.label,
        region,
        source: "common-failure",
        ...related,
      });
    }
  });

  pack.testPoints.forEach((point) => {
    const spatialRef = point.spatialRef ?? null;
    const region =
      spatialRef === null
        ? point.pinAt === null
          ? null
          : getPointRegion(point.pinAt)
        : getSpatialRefRegion(spatialRef);
    if (region === null) return;
    const related =
      spatialRef === null
        ? {
            linkedEventIds: [],
            relatedMeasurementIds: [],
            relatedAiMarkIds: [],
          }
        : getKnowledgeRegionRelatedEvents(region, spatialRef, events);
    regions.push({
      id: point.id,
      label: point.label,
      region,
      source: "test-point",
      ...related,
    });
  });

  pack.resources.forEach((resource) => {
    resource.spatialRefs?.forEach((spatialRef, index) => {
      const region = getSpatialRefRegion(spatialRef);
      if (region === null) return;
      const related = getKnowledgeRegionRelatedEvents(region, spatialRef, events);
      regions.push({
        id: `${resource.id}:spatial-${index}`,
        label: spatialRef.label,
        region,
        source: "resource",
        ...related,
      });
    });
  });

  return regions;
}

function emptyRegionLinkage(): RepairInvestigationRegionLinkage {
  return {
    eventIds: [],
    measurementEventIds: [],
    annotationEventIds: [],
    aiMarkEventIds: [],
  };
}

function normalizeRegionLinkage(
  event: RepairInvestigationRegionCreatedEvent | RepairInvestigationRegionUpdatedEvent,
  previous: RepairInvestigationRegionLinkage | null
): RepairInvestigationRegionLinkage {
  return {
    eventIds: uniqueStrings([...(previous?.eventIds ?? []), ...event.linkedEventIds]),
    measurementEventIds:
      event.measurementEventIds === undefined
        ? (previous?.measurementEventIds ?? [])
        : uniqueStrings(event.measurementEventIds),
    annotationEventIds:
      event.annotationEventIds === undefined
        ? (previous?.annotationEventIds ?? [])
        : uniqueStrings(event.annotationEventIds),
    aiMarkEventIds:
      event.aiMarkEventIds === undefined
        ? (previous?.aiMarkEventIds ?? [])
        : uniqueStrings(event.aiMarkEventIds),
  };
}

export function buildInvestigationRegions(events: RepairEvent[]): RepairInvestigationRegion[] {
  const regions = new Map<string, RepairInvestigationRegion>();

  events.forEach((event) => {
    if (event.kind === "investigation-region-created") {
      regions.set(event.regionId, {
        regionId: event.regionId,
        label: event.label,
        region: event.region,
        status: event.status,
        color: event.color,
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
        createdEventId: event.id,
        updatedEventId: null,
        source: event.source,
        sourceRef: event.sourceRef,
        knowledgeSpatialRefId: event.knowledgeSpatialRefId ?? null,
        promotedFromTemporaryRegionId: event.promotedFromTemporaryRegionId ?? null,
        linkage: normalizeRegionLinkage(event, emptyRegionLinkage()),
      });
      return;
    }

    if (event.kind !== "investigation-region-updated") return;
    const previous = regions.get(event.regionId);
    if (previous === undefined) return;
    regions.set(event.regionId, {
      ...previous,
      label: event.label ?? previous.label,
      region: event.region ?? previous.region,
      status: event.status ?? previous.status,
      color: event.color ?? previous.color,
      updatedAt: event.occurredAt,
      updatedEventId: event.id,
      sourceRef: "sourceRef" in event ? (event.sourceRef ?? null) : previous.sourceRef,
      knowledgeSpatialRefId:
        "knowledgeSpatialRefId" in event
          ? (event.knowledgeSpatialRefId ?? null)
          : previous.knowledgeSpatialRefId,
      promotedFromTemporaryRegionId:
        "promotedFromTemporaryRegionId" in event
          ? (event.promotedFromTemporaryRegionId ?? null)
          : previous.promotedFromTemporaryRegionId,
      linkage: normalizeRegionLinkage(event, previous.linkage),
    });
  });

  return [...regions.values()].filter((region) => region.status !== "dismissed");
}

export function buildTemporarySpatialRegions(
  state: RepairRuntimeState,
  knowledgeRegions: RepairKnowledgeRegionProjection[]
): RepairTemporarySpatialRegion[] {
  const spatialRefId = state.knowledgePack.focusedSpatialRefId;
  if (spatialRefId === null) return [];
  const knowledge = knowledgeRegions.find((entry) => entry.id === spatialRefId);
  if (knowledge === undefined) return [];
  return [
    {
      id: `tmp-knowledge-${knowledge.id}`,
      label: knowledge.label,
      region: knowledge.region,
      source: "knowledge-spatial-ref",
      sourceRef: { kind: "knowledge-region", id: knowledge.id },
      knowledgeSpatialRefId: knowledge.id,
      linkedEventIds: knowledge.linkedEventIds,
      relatedMeasurementIds: knowledge.relatedMeasurementIds,
      relatedAiMarkIds: knowledge.relatedAiMarkIds,
    },
  ];
}

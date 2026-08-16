import type {
  RepairEvent,
  RepairInvestigationRegion,
  RepairMeasurementEvent,
  RepairSession,
} from "../../../shared/types/index.js";
import type {
  RepairMeasurementRelationship,
  RepairTimelineDensityBucket,
} from "../../../shared/ui/state.js";
import { getEventOffsetMs, getLiveEdgeMs } from "./replay-events.js";
import { eventEntityRef, getEventSpatialRect, regionEntityRef } from "./spatial-projection.js";

function getRelationshipKey(kind: string, fromId: string, toId: string): string {
  return `${kind}:${fromId}->${toId}`;
}

function addRelationship(
  relationships: Map<string, RepairMeasurementRelationship>,
  relationship: RepairMeasurementRelationship
): void {
  if (
    relationship.from.kind === relationship.to.kind &&
    relationship.from.id === relationship.to.id
  ) {
    return;
  }
  relationships.set(relationship.id, relationship);
}

export function buildMeasurementRelationships(
  events: RepairEvent[],
  investigationRegions: RepairInvestigationRegion[]
): RepairMeasurementRelationship[] {
  const relationships = new Map<string, RepairMeasurementRelationship>();
  const measurements = events.filter(
    (event): event is RepairMeasurementEvent => event.kind === "measurement"
  );
  const eventIds = new Set(events.map((event) => event.id));
  const measurementsById = new Map(measurements.map((event) => [event.id, event]));
  const previousByRail = new Map<string, RepairMeasurementEvent>();
  const previousByGroup = new Map<string, RepairMeasurementEvent>();

  measurements.forEach((measurement) => {
    if (measurement.previousEventId !== null && measurement.previousEventId !== undefined) {
      const previous = measurementsById.get(measurement.previousEventId);
      if (previous !== undefined) {
        addRelationship(relationships, {
          id: getRelationshipKey("previous-event", previous.id, measurement.id),
          kind: "previous-event",
          from: eventEntityRef(previous.id),
          to: eventEntityRef(measurement.id),
          label: "previous reading",
          strength: 0.92,
          eventIds: [previous.id, measurement.id],
        });
      }
    }

    const rail = measurement.group?.rail ?? null;
    if (rail !== null) {
      const previous = previousByRail.get(rail);
      if (previous !== undefined) {
        addRelationship(relationships, {
          id: getRelationshipKey("rail", previous.id, measurement.id),
          kind: "rail",
          from: eventEntityRef(previous.id),
          to: eventEntityRef(measurement.id),
          label: rail,
          strength: 0.68,
          eventIds: [previous.id, measurement.id],
        });
      }
      previousByRail.set(rail, measurement);
    }

    const investigationGroup = measurement.group?.investigationGroup ?? null;
    if (investigationGroup !== null) {
      const previous = previousByGroup.get(investigationGroup);
      if (previous !== undefined) {
        addRelationship(relationships, {
          id: getRelationshipKey("investigation-group", previous.id, measurement.id),
          kind: "investigation-group",
          from: eventEntityRef(previous.id),
          to: eventEntityRef(measurement.id),
          label: investigationGroup,
          strength: 0.78,
          eventIds: [previous.id, measurement.id],
        });
      }
      previousByGroup.set(investigationGroup, measurement);
    }

    (measurement.linkedAnnotationIds ?? []).forEach((annotationId) => {
      if (!eventIds.has(annotationId)) return;
      addRelationship(relationships, {
        id: getRelationshipKey("linked-annotation", measurement.id, annotationId),
        kind: "linked-annotation",
        from: eventEntityRef(measurement.id),
        to: eventEntityRef(annotationId),
        label: "annotation",
        strength: 0.72,
        eventIds: [measurement.id, annotationId],
      });
    });

    (measurement.linkedAiMarkIds ?? []).forEach((aiMarkId) => {
      if (!eventIds.has(aiMarkId)) return;
      addRelationship(relationships, {
        id: getRelationshipKey("linked-ai-mark", measurement.id, aiMarkId),
        kind: "linked-ai-mark",
        from: eventEntityRef(measurement.id),
        to: eventEntityRef(aiMarkId),
        label: "AI mark",
        strength: 0.82,
        eventIds: [measurement.id, aiMarkId],
      });
    });
  });

  investigationRegions.forEach((region) => {
    region.linkage.measurementEventIds.forEach((measurementId) => {
      if (!eventIds.has(measurementId)) return;
      addRelationship(relationships, {
        id: getRelationshipKey("investigation-group", measurementId, region.regionId),
        kind: "investigation-group",
        from: eventEntityRef(measurementId),
        to: regionEntityRef(region.regionId),
        label: region.label,
        strength: 0.88,
        eventIds: [measurementId, ...region.linkage.eventIds],
      });
    });
  });

  return [...relationships.values()];
}

function getTimelineDensitySignal(bucket: RepairTimelineDensityBucket): number {
  return (
    bucket.eventCount +
    bucket.spatialEventCount +
    bucket.measurementCount +
    bucket.aiMarkCount +
    bucket.regionCount
  );
}

export function buildTimelineDensity(
  session: RepairSession,
  events: RepairEvent[],
  investigationRegions: RepairInvestigationRegion[]
): RepairTimelineDensityBucket[] {
  const liveEdgeMs = getLiveEdgeMs(session);
  const bucketSizeMs = 30000;
  const bucketCount = Math.max(1, Math.ceil(Math.max(bucketSizeMs, liveEdgeMs + 1) / bucketSizeMs));
  const buckets: RepairTimelineDensityBucket[] = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStartMs = index * bucketSizeMs;
    return {
      bucketStartMs,
      bucketEndMs: bucketStartMs + bucketSizeMs,
      eventCount: 0,
      spatialEventCount: 0,
      measurementCount: 0,
      aiMarkCount: 0,
      regionCount: 0,
      density: 0,
    };
  });

  events.forEach((event) => {
    const offsetMs = getEventOffsetMs(session, event);
    const index = Math.min(buckets.length - 1, Math.floor(offsetMs / bucketSizeMs));
    const bucket = buckets[index];
    if (bucket === undefined) return;
    bucket.eventCount += 1;
    if (getEventSpatialRect(event) !== null) bucket.spatialEventCount += 1;
    if (event.kind === "measurement") bucket.measurementCount += 1;
    if (event.kind === "ai-mark" || event.kind === "risk-flag") bucket.aiMarkCount += 1;
  });

  investigationRegions.forEach((region) => {
    const offsetMs = Math.max(0, Date.parse(region.updatedAt) - Date.parse(session.startedAt));
    const index = Math.min(buckets.length - 1, Math.floor(offsetMs / bucketSizeMs));
    const bucket = buckets[index];
    if (bucket !== undefined) bucket.regionCount += 1;
  });

  let maxSignal = 1;
  buckets.forEach((bucket) => {
    maxSignal = Math.max(maxSignal, getTimelineDensitySignal(bucket));
  });

  return buckets.map((bucket) => ({
    ...bucket,
    density: getTimelineDensitySignal(bucket) / maxSignal,
  }));
}

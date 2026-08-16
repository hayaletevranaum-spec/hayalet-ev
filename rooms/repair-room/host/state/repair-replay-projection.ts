import {
  REPAIR_INVESTIGATION_LIFECYCLE,
  createRepairDefaultContinuityProjection,
  createRepairDefaultGuidanceProjection,
  createRepairDefaultOperationsProjection,
  createRepairDefaultVoiceReadinessProjection,
} from "../../shared/ui/state.js";
import type {
  RepairAiMarkEvent,
  RepairAiMarkLifecycleState,
  RepairEvent,
  RepairInvestigationRegion,
  RepairMeasurementEvidenceState,
  RepairMeasurementEvent,
  RepairMeasurementState,
  RepairOperationalProfile,
  RepairOperationalMode,
  RepairOverlayEntityRef,
  RepairSession,
} from "../../shared/types/index.js";
import type {
  RepairAiConfidence,
  RepairAiUrgency,
  RepairEvidenceDepth,
  RepairGuidanceProjection,
  RepairGuidanceSurface,
  RepairInvestigationPhase,
  RepairKnowledgeRegionProjection,
  RepairMeasurementRelationship,
  RepairOperationsProjection,
  RepairReplayProjection,
  RepairSpatialFocusState,
  RepairTacticalFeedItem,
  RepairTemporarySpatialRegion,
} from "../../shared/ui/state.js";
import type { RepairRuntimeState } from "./repair-runtime-state.js";
export { sortRepairEventsForReplay } from "./projections/replay-events.js";
import {
  buildTacticalFeed,
  getEventOffsetMs,
  getEventOrder,
  getProjectionPlayheadMs,
  isVisibleAtPlayhead,
  sortRepairEventsForReplay,
} from "./projections/replay-events.js";
import { buildMeasurementEvidence } from "./projections/measurement-projection.js";
import {
  buildInvestigationRegions,
  buildKnowledgeRegions,
  buildTemporarySpatialRegions,
  eventEntityRef,
  regionEntityRef,
  getEventSpatialRect,
  getPointBounds,
  getRectCenter,
  uniqueStrings,
} from "./projections/spatial-projection.js";
import {
  buildMeasurementRelationships,
  buildTimelineDensity,
} from "./projections/relationship-projection.js";

function buildAiLifecycleMap(events: RepairEvent[]): Map<string, RepairAiMarkLifecycleState> {
  const states = new Map<string, RepairAiMarkLifecycleState>();
  events.forEach((event) => {
    if (event.kind === "ai-mark") {
      states.set(event.id, event.lifecycleState ?? (event.dismissed ? "dismissed" : "detected"));
    }
    if (event.kind === "ai-mark-lifecycle") {
      states.set(event.targetEventId, event.state);
    }
  });
  return states;
}

function isAiMarkVisible(
  session: RepairSession,
  playheadMs: number,
  event: RepairAiMarkEvent,
  lifecycle: RepairAiMarkLifecycleState
): boolean {
  if (event.dismissed || lifecycle === "dismissed" || lifecycle === "expired") return false;
  if (event.expiresAt !== null && event.expiresAt !== undefined) {
    return Date.parse(event.expiresAt) >= Date.parse(session.startedAt) + playheadMs;
  }
  return true;
}

function getAiPriority(event: RepairAiMarkEvent, events: RepairEvent[]): number {
  const severityWeight =
    event.severity === "risk"
      ? 4
      : event.severity === "action"
        ? 3
        : event.severity === "suggestion"
          ? 2
          : 1;
  return severityWeight * 1000 - getEventOrder(events, event.id);
}

function getEventFocusLabel(event: RepairEvent): string {
  if (event.kind === "measurement") return event.reference ?? event.channel;
  if (event.kind === "annotation") return event.label;
  if (event.kind === "ai-mark") return event.rationale;
  if (event.kind === "risk-flag") return event.message;
  if (event.kind === "snapshot") return event.caption;
  if (event.kind === "freeze-frame") return event.reason;
  if (event.kind === "note") return event.text;
  if (event.kind === "ai-mark-lifecycle") return event.reason;
  if (event.kind === "investigation-region-created") return event.label;
  if (event.kind === "investigation-region-updated") return event.label ?? event.regionId;
  return event.title;
}

function getSpatialFocusPoint(params: {
  ref: RepairOverlayEntityRef;
  events: RepairEvent[];
  knowledgeRegions: RepairKnowledgeRegionProjection[];
  investigationRegions: RepairInvestigationRegion[];
  temporarySpatialRegions: RepairTemporarySpatialRegion[];
}): { xPx: number; yPx: number } | null {
  const { ref, events, knowledgeRegions, investigationRegions, temporarySpatialRegions } = params;
  if (ref.kind === "event") {
    const event = events.find((candidate) => candidate.id === ref.id);
    const rect = event === undefined ? null : getEventSpatialRect(event);
    return rect === null ? null : getRectCenter(rect);
  }
  if (ref.kind === "investigation-region") {
    const region = investigationRegions.find((candidate) => candidate.regionId === ref.id);
    return region === undefined ? null : getRectCenter(region.region);
  }
  if (ref.kind === "knowledge-region") {
    const region = knowledgeRegions.find((candidate) => candidate.id === ref.id);
    return region === undefined ? null : getRectCenter(region.region);
  }
  if (ref.kind === "temporary-spatial-region") {
    const region = temporarySpatialRegions.find((candidate) => candidate.id === ref.id);
    return region === undefined ? null : getRectCenter(region.region);
  }
  return null;
}

function buildActiveSpatialFocus(params: {
  state: RepairRuntimeState;
  events: RepairEvent[];
  knowledgeRegions: RepairKnowledgeRegionProjection[];
  investigationRegions: RepairInvestigationRegion[];
  temporarySpatialRegions: RepairTemporarySpatialRegion[];
  measurementRelationships: RepairMeasurementRelationship[];
}): RepairSpatialFocusState | null {
  const {
    state,
    events,
    knowledgeRegions,
    investigationRegions,
    temporarySpatialRegions,
    measurementRelationships,
  } = params;
  const ref =
    state.workbench.selection.inspectorEntityRef ??
    (state.workbench.focusedEventId === null
      ? null
      : eventEntityRef(state.workbench.focusedEventId)) ??
    (state.knowledgePack.focusedSpatialRefId === null
      ? null
      : { kind: "knowledge-region" as const, id: state.knowledgePack.focusedSpatialRefId });
  if (ref === null) return null;

  if (ref.kind === "event") {
    const event = events.find((candidate) => candidate.id === ref.id);
    if (event === undefined) return null;
    const eventRegion = getEventSpatialRect(event);
    const measurementIds =
      event.kind === "measurement"
        ? [event.id]
        : event.kind === "ai-mark" || event.kind === "risk-flag"
          ? (event.linkedMeasurementIds ?? [])
          : event.kind === "annotation"
            ? (event.meta?.linkedMeasurementIds ?? [])
            : [];
    const aiMarkIds =
      event.kind === "ai-mark" || event.kind === "risk-flag"
        ? [event.id]
        : event.kind === "measurement"
          ? (event.linkedAiMarkIds ?? [])
          : event.linkedEventIds.filter((eventId) => {
              const linked = events.find((candidate) => candidate.id === eventId);
              return linked?.kind === "ai-mark" || linked?.kind === "risk-flag";
            });
    return {
      ref,
      label: getEventFocusLabel(event),
      region: eventRegion,
      linkedEventIds: uniqueStrings([event.id, ...event.linkedEventIds]),
      relatedMeasurementIds: uniqueStrings(measurementIds),
      relatedAiMarkIds: uniqueStrings(aiMarkIds),
    };
  }

  if (ref.kind === "investigation-region") {
    const region = investigationRegions.find((candidate) => candidate.regionId === ref.id);
    if (region === undefined) return null;
    return {
      ref,
      label: region.label,
      region: region.region,
      linkedEventIds: region.linkage.eventIds,
      relatedMeasurementIds: region.linkage.measurementEventIds,
      relatedAiMarkIds: region.linkage.aiMarkEventIds,
    };
  }

  if (ref.kind === "knowledge-region") {
    const region = knowledgeRegions.find((candidate) => candidate.id === ref.id);
    if (region === undefined) return null;
    return {
      ref,
      label: region.label,
      region: region.region,
      linkedEventIds: region.linkedEventIds,
      relatedMeasurementIds: region.relatedMeasurementIds,
      relatedAiMarkIds: region.relatedAiMarkIds,
    };
  }

  if (ref.kind === "temporary-spatial-region") {
    const region = temporarySpatialRegions.find((candidate) => candidate.id === ref.id);
    if (region === undefined) return null;
    return {
      ref,
      label: region.label,
      region: region.region,
      linkedEventIds: region.linkedEventIds,
      relatedMeasurementIds: region.relatedMeasurementIds,
      relatedAiMarkIds: region.relatedAiMarkIds,
    };
  }

  if (ref.kind === "measurement-relationship") {
    const relationship = measurementRelationships.find((candidate) => candidate.id === ref.id);
    if (relationship === undefined) return null;
    const points = [relationship.from, relationship.to]
      .map((candidate) =>
        getSpatialFocusPoint({
          ref: candidate,
          events,
          knowledgeRegions,
          investigationRegions,
          temporarySpatialRegions,
        })
      )
      .filter((point): point is { xPx: number; yPx: number } => point !== null);
    const relationshipEvents = relationship.eventIds
      .map((eventId) => events.find((event) => event.id === eventId))
      .filter((event): event is RepairEvent => event !== undefined);
    return {
      ref,
      label: relationship.label,
      region: points.length === 0 ? null : getPointBounds(points, 32),
      linkedEventIds: uniqueStrings(relationship.eventIds),
      relatedMeasurementIds: uniqueStrings(
        relationshipEvents
          .filter((event): event is RepairMeasurementEvent => event.kind === "measurement")
          .map((event) => event.id)
      ),
      relatedAiMarkIds: uniqueStrings(
        relationshipEvents
          .filter((event) => event.kind === "ai-mark" || event.kind === "risk-flag")
          .map((event) => event.id)
      ),
    };
  }

  return {
    ref,
    label: "Live edge",
    region: null,
    linkedEventIds: [],
    relatedMeasurementIds: [],
    relatedAiMarkIds: [],
  };
}

function getOperationalMode(
  state: RepairRuntimeState,
  activeFreezeFrameEventId: string | null
): RepairOperationalMode {
  if (activeFreezeFrameEventId !== null || state.workbench.isFrozen) return "freeze";
  if (
    state.workbench.investigationModeEnabled ||
    state.layout.focusMode ||
    state.workbench.selection.selectedEntityRefs.length > 0 ||
    state.workbench.selection.selectedEventIds.length > 0
  ) {
    return "investigation";
  }
  return state.workbench.timeline.autoFollowLive ? "live" : "replay";
}

function getLatestEvent(events: RepairEvent[]): RepairEvent | null {
  return events.at(-1) ?? null;
}

function getEvidenceDepth(score: number): RepairEvidenceDepth {
  if (score >= 4) return "strong";
  if (score >= 2) return "supported";
  return "thin";
}

function getConfidence(depth: RepairEvidenceDepth, hasRisk: boolean): RepairAiConfidence {
  if (hasRisk || depth === "strong") return "high";
  if (depth === "supported") return "medium";
  return "low";
}

function getUrgency(events: RepairEvent[], pendingMeasurements: string[]): RepairAiUrgency {
  if (
    events.some(
      (event) =>
        (event.kind === "ai-mark" && event.severity === "risk") ||
        (event.kind === "risk-flag" && event.acknowledged === false)
    )
  ) {
    return "high";
  }
  if (
    pendingMeasurements.length > 0 ||
    events.some((event) => event.kind === "ai-mark" && event.severity === "action")
  ) {
    return "medium";
  }
  return "low";
}

function getPendingMeasurements(params: {
  activeSpatialFocus: RepairSpatialFocusState | null;
  events: RepairEvent[];
  measurementEvidence: RepairMeasurementEvidenceState[];
}): string[] {
  const measurements = params.events.filter(
    (event): event is RepairMeasurementEvent => event.kind === "measurement"
  );
  const latestMeasurement = measurements.at(-1) ?? null;
  if (measurements.length === 0) return ["Primary rail"];
  if (
    params.activeSpatialFocus !== null &&
    params.activeSpatialFocus.relatedMeasurementIds.length === 0
  ) {
    return ["Focused region"];
  }
  if (latestMeasurement?.rawDisplay === "OL") return ["Continuity confirmation"];
  if (latestMeasurement?.value === 0) return ["Primary rail confirmation"];
  if (params.measurementEvidence.some((entry) => entry.history.length === 1)) {
    return ["Comparison reading"];
  }
  return [];
}

function getInvestigationPhase(params: {
  activeSpatialFocus: RepairSpatialFocusState | null;
  events: RepairEvent[];
  measurementRelationships: RepairMeasurementRelationship[];
  pendingMeasurements: string[];
  state: RepairRuntimeState;
}): RepairInvestigationPhase {
  if (params.state.phase === "wizard-active" || params.state.phase === "idle") return "observe";
  const latest = getLatestEvent(params.events);
  if (
    latest?.kind === "investigation-region-updated" &&
    latest.status === "resolved" &&
    params.pendingMeasurements.length === 0
  ) {
    return "conclude";
  }
  if (latest?.kind === "measurement") return "verify";
  if (params.pendingMeasurements.length > 0) return "measure";
  if (params.measurementRelationships.length > 0) return "compare";
  if (params.activeSpatialFocus !== null || params.state.workbench.investigationModeEnabled) {
    return "inspect";
  }
  return "observe";
}

function getFocusLabel(activeSpatialFocus: RepairSpatialFocusState | null): string {
  return activeSpatialFocus?.label ?? "Live workbench";
}

function buildNextBestAction(params: {
  activeSpatialFocus: RepairSpatialFocusState | null;
  confidence: RepairAiConfidence;
  depth: RepairEvidenceDepth;
  pendingMeasurements: string[];
  phase: RepairInvestigationPhase;
  state: RepairRuntimeState;
  urgency: RepairAiUrgency;
}): RepairGuidanceProjection["nextBestAction"] {
  if (params.state.phase === "idle") {
    return {
      text: "Open a repair session.",
      confidence: "medium",
      urgency: "low",
      evidenceDepth: "thin",
      source: "system",
    };
  }
  if (params.state.phase === "wizard-active") {
    return {
      text: "Add the symptoms, then start research.",
      confidence: "medium",
      urgency: "low",
      evidenceDepth: "thin",
      source: "operator",
    };
  }
  const pending = params.pendingMeasurements[0] ?? null;
  if (pending !== null) {
    return {
      text: pending.toLowerCase().includes("confirmation")
        ? `${pending} is waiting.`
        : `${pending} measurement is suggested.`,
      confidence: params.confidence,
      urgency: params.urgency,
      evidenceDepth: params.depth,
      source: "measurement",
    };
  }
  if (params.phase === "verify") {
    return {
      text: "Measurement verification is waiting.",
      confidence: params.confidence,
      urgency: params.urgency,
      evidenceDepth: params.depth,
      source: "measurement",
    };
  }
  if (params.activeSpatialFocus !== null) {
    return {
      text:
        params.confidence === "high"
          ? "Focused behavior matches a failure pattern."
          : "This region may match an earlier pattern.",
      confidence: params.confidence,
      urgency: params.urgency,
      evidenceDepth: params.depth,
      source: "ai",
    };
  }
  return {
    text: "Observe the board and keep the next check narrow.",
    confidence: params.confidence,
    urgency: params.urgency,
    evidenceDepth: params.depth,
    source: "system",
  };
}

function countDuplicateFeedItems(items: RepairTacticalFeedItem[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  items.forEach((item) => {
    const key = item.body.toLowerCase().replace(/\s+/g, " ").slice(0, 72);
    if (seen.has(key)) {
      duplicates += 1;
      return;
    }
    seen.add(key);
  });
  return duplicates;
}

function isAiBudgetInterruptionEvent(
  event: RepairEvent,
  evidenceDepth: RepairEvidenceDepth
): boolean {
  if (event.kind === "risk-flag") return event.acknowledged === false;
  if (event.kind !== "ai-mark") return false;
  if (event.severity === "risk") return true;
  return event.severity === "action" && evidenceDepth !== "thin";
}

function buildAttentionBudget(params: {
  duplicateInsightsMerged: number;
  evidenceDepth: RepairEvidenceDepth;
  events: RepairEvent[];
  state: RepairRuntimeState;
  suppressedObservationCount: number;
}): RepairGuidanceProjection["aiInterruption"]["attentionBudget"] {
  const windowMs = Math.max(30000, params.state.layout.attentionBudget.windowMs);
  const maxAiInterruptions = Math.max(1, params.state.layout.attentionBudget.maxAiInterruptions);
  const ambientMs = Date.parse(params.state.ambientNowIso);
  const eventTimes = params.events
    .map((event) => Date.parse(event.occurredAt))
    .filter(Number.isFinite);
  const latestMs =
    eventTimes.length > 0 ? Math.max(...eventTimes) : Number.isFinite(ambientMs) ? ambientMs : 0;
  const windowStartMs = latestMs - windowMs;
  const budgetRelevantInterruptions = params.events.filter((event) => {
    if (!isAiBudgetInterruptionEvent(event, params.evidenceDepth)) return false;
    const eventMs = Date.parse(event.occurredAt);
    return Number.isFinite(eventMs) && eventMs >= windowStartMs;
  }).length;
  const usedAiInterruptions = Math.min(maxAiInterruptions, budgetRelevantInterruptions);
  const overBudgetCount = Math.max(0, budgetRelevantInterruptions - maxAiInterruptions);
  return {
    windowMs,
    maxAiInterruptions,
    usedAiInterruptions,
    remainingAiInterruptions: Math.max(0, maxAiInterruptions - usedAiInterruptions),
    collapsedByBudgetCount:
      overBudgetCount +
      params.duplicateInsightsMerged +
      Math.floor(params.suppressedObservationCount / 2),
  };
}

function getPrimaryGuidanceSurface(params: {
  phase: RepairInvestigationPhase;
  state: RepairRuntimeState;
  unresolvedCriticalItems: number;
  activeSpatialFocus: RepairSpatialFocusState | null;
}): RepairGuidanceSurface {
  if (params.state.phase === "wizard-active") return "session-wizard";
  if (params.phase === "measure" || params.phase === "verify") return "measurement";
  if (params.unresolvedCriticalItems > 0 && params.activeSpatialFocus === null) {
    return "tactical-feed";
  }
  return "workbench";
}

function buildOperationalRhythm(params: {
  phase: RepairInvestigationPhase;
  pendingMeasurements: string[];
  unresolvedCriticalItems: number;
}): RepairGuidanceProjection["rhythm"] {
  const lifecycle = [...REPAIR_INVESTIGATION_LIFECYCLE];
  const currentIndex = Math.max(0, lifecycle.indexOf(params.phase));
  return {
    lifecycle,
    currentIndex,
    previousPhase: lifecycle[currentIndex - 1] ?? null,
    nextPhase: lifecycle[currentIndex + 1] ?? null,
    progressLabel: `${params.phase} ${currentIndex + 1}/${lifecycle.length}`,
    steady: params.unresolvedCriticalItems <= 1 && params.pendingMeasurements.length <= 1,
  };
}

function buildStaticPanelVisibility(
  primarySurface: RepairGuidanceSurface
): RepairGuidanceProjection["panelVisibility"] {
  return {
    primarySurface,
    panels: {
      "session-rail": "compact",
      "workbench-stage": "expanded",
      "tactical-feed": "compact",
      "session-wizard": "compact",
      "knowledge-pack": "compact",
      "visual-timeline": "compact",
      "operator-profile": "compact",
    },
    tacticalFeedDensity: "compact",
    subduedPanelIds: [],
    dimSecondaryControls: false,
  };
}

function refKey(ref: RepairOverlayEntityRef): string {
  return `${ref.kind}:${ref.id}`;
}

function getOverlayRefForEvent(event: RepairEvent): RepairOverlayEntityRef {
  return { kind: "event", id: event.id };
}

function buildOverlaySaturation(params: {
  activeSpatialFocus: RepairSpatialFocusState | null;
  events: RepairEvent[];
  focusSuggestionEventId: string | null;
  investigationRegions: RepairInvestigationRegion[];
  knowledgeRegions: RepairKnowledgeRegionProjection[];
  measurementRelationships: RepairMeasurementRelationship[];
  operationalProfile: RepairOperationalProfile;
  temporarySpatialRegions: RepairTemporarySpatialRegion[];
}): RepairGuidanceProjection["overlaySaturation"] {
  const maxVisibleRelationships = params.operationalProfile === "advanced" ? 12 : 4;
  const maxVisibleRegions = params.operationalProfile === "advanced" ? 12 : 5;
  const maxSimultaneousHighlights = params.operationalProfile === "advanced" ? 10 : 5;
  const maxActiveAiMarks = params.operationalProfile === "advanced" ? 6 : 2;
  const activeRefs: RepairOverlayEntityRef[] = [];
  if (params.activeSpatialFocus !== null) {
    activeRefs.push(params.activeSpatialFocus.ref);
    params.activeSpatialFocus.linkedEventIds.forEach((id) => activeRefs.push(eventEntityRef(id)));
    params.activeSpatialFocus.relatedMeasurementIds.forEach((id) =>
      activeRefs.push(eventEntityRef(id))
    );
    params.activeSpatialFocus.relatedAiMarkIds.forEach((id) => activeRefs.push(eventEntityRef(id)));
  }
  if (params.focusSuggestionEventId !== null)
    activeRefs.push(eventEntityRef(params.focusSuggestionEventId));

  const activeAttentionRefs = uniqueRefs(activeRefs).slice(0, maxSimultaneousHighlights);
  const activeKeys = new Set(activeAttentionRefs.map(refKey));
  const scoredEvents = params.events
    .map((event) => {
      const ref = getOverlayRefForEvent(event);
      const active = activeKeys.has(refKey(ref));
      const score =
        (active ? 100 : 0) +
        (event.kind === "risk-flag" ? 30 : 0) +
        (event.kind === "ai-mark" && event.severity === "risk" ? 28 : 0) +
        (event.kind === "ai-mark" && event.severity === "action" ? 22 : 0) +
        (event.kind === "measurement" ? 18 : 0) +
        (event.kind === "annotation" ? 12 : 0);
      return { event, score };
    })
    .sort((left, right) => right.score - left.score);
  const aiEventIds = scoredEvents
    .filter(({ event }) => event.kind === "ai-mark" || event.kind === "risk-flag")
    .slice(0, maxActiveAiMarks)
    .map(({ event }) => event.id);
  const visibleEventIds = uniqueStrings([
    ...activeAttentionRefs.filter((ref) => ref.kind === "event").map((ref) => ref.id),
    ...aiEventIds,
    ...scoredEvents.map(({ event }) => event.id),
  ]).slice(0, maxSimultaneousHighlights);
  const relationshipScores = params.measurementRelationships
    .map((relationship) => ({
      relationship,
      score:
        (activeKeys.has(refKey(relationship.from)) ? 50 : 0) +
        (activeKeys.has(refKey(relationship.to)) ? 50 : 0) +
        relationship.strength * 20,
    }))
    .sort((left, right) => right.score - left.score);
  const visibleRelationshipIds = relationshipScores
    .slice(0, maxVisibleRelationships)
    .map(({ relationship }) => relationship.id);
  const regionScores = [
    ...params.investigationRegions.map((region) => {
      const ref = regionEntityRef(region.regionId);
      return {
        ref,
        score:
          (activeKeys.has(refKey(ref)) ? 100 : 0) +
          (region.status === "active" ? 35 : region.status === "watching" ? 20 : 0) +
          region.linkage.aiMarkEventIds.length * 12 +
          region.linkage.measurementEventIds.length * 10,
      };
    }),
    ...params.knowledgeRegions.map((region) => {
      const ref: RepairOverlayEntityRef = { kind: "knowledge-region", id: region.id };
      return {
        ref,
        score:
          (activeKeys.has(refKey(ref)) ? 100 : 0) +
          region.relatedAiMarkIds.length * 12 +
          region.relatedMeasurementIds.length * 10 +
          region.linkedEventIds.length * 6,
      };
    }),
    ...params.temporarySpatialRegions.map((region) => {
      const ref: RepairOverlayEntityRef = { kind: "temporary-spatial-region", id: region.id };
      return {
        ref,
        score:
          (activeKeys.has(refKey(ref)) ? 100 : 0) +
          region.relatedAiMarkIds.length * 12 +
          region.relatedMeasurementIds.length * 10 +
          region.linkedEventIds.length * 6,
      };
    }),
  ].sort((left, right) => right.score - left.score);
  const visibleRegionRefs = uniqueRefs([
    ...activeAttentionRefs.filter(
      (ref) =>
        ref.kind === "investigation-region" ||
        ref.kind === "knowledge-region" ||
        ref.kind === "temporary-spatial-region"
    ),
    ...regionScores.map(({ ref }) => ref),
  ]).slice(0, maxVisibleRegions);
  const visibleKeys = new Set([
    ...visibleEventIds.map((id) => refKey(eventEntityRef(id))),
    ...visibleRelationshipIds.map((id) => refKey({ kind: "measurement-relationship", id })),
    ...visibleRegionRefs.map(refKey),
    ...activeAttentionRefs.map(refKey),
  ]);
  const allRefs: RepairOverlayEntityRef[] = [
    ...params.events.map(getOverlayRefForEvent),
    ...params.investigationRegions.map((region) => regionEntityRef(region.regionId)),
    ...params.knowledgeRegions.map((region) => ({
      kind: "knowledge-region" as const,
      id: region.id,
    })),
    ...params.temporarySpatialRegions.map((region) => ({
      kind: "temporary-spatial-region" as const,
      id: region.id,
    })),
    ...params.measurementRelationships.map((relationship) => ({
      kind: "measurement-relationship" as const,
      id: relationship.id,
    })),
  ];
  const clutterSignal =
    params.events.length +
    params.investigationRegions.length * 1.4 +
    params.knowledgeRegions.length * 1.1 +
    params.temporarySpatialRegions.length * 1.1 +
    params.measurementRelationships.length * 1.6;
  return {
    maxVisibleRelationships,
    maxVisibleRegions,
    maxSimultaneousHighlights,
    maxActiveAiMarks,
    clutterScore: Math.min(1, clutterSignal / (params.operationalProfile === "advanced" ? 28 : 14)),
    visibleEventIds,
    visibleRelationshipIds,
    visibleRegionRefs,
    activeAttentionRefs,
    fadedSecondaryRefs: uniqueRefs(allRefs.filter((ref) => !visibleKeys.has(refKey(ref)))),
    labelMode:
      params.operationalProfile === "advanced" || clutterSignal < 8 ? "full" : "simplified",
  };
}

function buildFocusCorridor(params: {
  activeSpatialFocus: RepairSpatialFocusState | null;
  overlaySaturation: RepairGuidanceProjection["overlaySaturation"];
  primarySurface: RepairGuidanceSurface;
}): RepairGuidanceProjection["focusCorridor"] {
  if (params.activeSpatialFocus === null) {
    return {
      active: false,
      targetRef: null,
      allowedSurfaces: ["workbench"],
      activeRegionLabel: "Live workbench",
      entryReason: "No focused investigation region.",
      exitHint: "Select a region to narrow the repair context.",
      dimmedRefCount: params.overlaySaturation.fadedSecondaryRefs.length,
    };
  }
  const allowedSurfaces = uniqueStrings([
    "workbench",
    "measurement",
    "knowledge-pack",
    params.primarySurface,
  ]).filter((surface): surface is RepairGuidanceSurface => surface !== "none");
  return {
    active: true,
    targetRef: params.activeSpatialFocus.ref,
    allowedSurfaces,
    activeRegionLabel: params.activeSpatialFocus.label,
    entryReason: "Current repair context is narrowed to the focused region.",
    exitHint: "Clear focus to return to the full board.",
    dimmedRefCount: params.overlaySaturation.fadedSecondaryRefs.length,
  };
}

function uniqueRefs(refs: RepairOverlayEntityRef[]): RepairOverlayEntityRef[] {
  const seen = new Set<string>();
  const unique: RepairOverlayEntityRef[] = [];
  refs.forEach((ref) => {
    const key = refKey(ref);
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(ref);
  });
  return unique;
}

function buildRepairGuidanceProjection(params: {
  activeSpatialFocus: RepairSpatialFocusState | null;
  focusSuggestionEventId: string | null;
  investigationRegions: RepairInvestigationRegion[];
  knowledgeRegions: RepairKnowledgeRegionProjection[];
  measurementEvidence: RepairMeasurementEvidenceState[];
  measurementRelationships: RepairMeasurementRelationship[];
  overlayEvents: RepairEvent[];
  preliminaryFeed: RepairTacticalFeedItem[];
  session: RepairSession;
  state: RepairRuntimeState;
  temporarySpatialRegions: RepairTemporarySpatialRegion[];
  visibleEvents: RepairEvent[];
}): RepairGuidanceProjection {
  const operationalProfile = params.state.layout.operationalProfile;
  const pendingMeasurements = getPendingMeasurements({
    activeSpatialFocus: params.activeSpatialFocus,
    events: params.visibleEvents,
    measurementEvidence: params.measurementEvidence,
  });
  const unresolvedCriticalItems = params.visibleEvents.filter((event) => {
    if (event.kind === "risk-flag") return event.acknowledged === false;
    return event.kind === "ai-mark" && (event.severity === "risk" || event.severity === "action");
  }).length;
  const evidenceScore =
    (params.activeSpatialFocus?.linkedEventIds.length ?? 0) +
    (params.activeSpatialFocus?.relatedMeasurementIds.length ?? 0) +
    (params.activeSpatialFocus?.relatedAiMarkIds.length ?? 0) +
    Math.min(2, params.measurementEvidence.length);
  const evidenceDepth = getEvidenceDepth(evidenceScore);
  const confidence = getConfidence(evidenceDepth, unresolvedCriticalItems > 0);
  const urgency = getUrgency(params.visibleEvents, pendingMeasurements);
  const investigationPhase = getInvestigationPhase({
    activeSpatialFocus: params.activeSpatialFocus,
    events: params.visibleEvents,
    measurementRelationships: params.measurementRelationships,
    pendingMeasurements,
    state: params.state,
  });
  const nextBestAction = buildNextBestAction({
    activeSpatialFocus: params.activeSpatialFocus,
    confidence,
    depth: evidenceDepth,
    pendingMeasurements,
    phase: investigationPhase,
    state: params.state,
    urgency,
  });
  const primarySurface = getPrimaryGuidanceSurface({
    phase: investigationPhase,
    state: params.state,
    unresolvedCriticalItems,
    activeSpatialFocus: params.activeSpatialFocus,
  });
  const duplicateInsightsMerged = countDuplicateFeedItems(params.preliminaryFeed);
  const suppressedObservationCount = params.preliminaryFeed.filter(
    (item) => item.severity === "info" || (item.severity === "suggestion" && confidence === "low")
  ).length;
  const attentionBudget = buildAttentionBudget({
    duplicateInsightsMerged,
    evidenceDepth,
    events: params.visibleEvents,
    state: params.state,
    suppressedObservationCount,
  });
  const budgetAllowsSpeech =
    attentionBudget.remainingAiInterruptions > 0 ||
    (urgency === "high" && evidenceDepth === "strong");
  const shouldSpeak =
    budgetAllowsSpeech &&
    (urgency === "high" ||
      (urgency === "medium" && evidenceDepth !== "thin" && duplicateInsightsMerged === 0));
  const toneLine =
    confidence === "high"
      ? "Primary rail behavior matches the failure pattern."
      : confidence === "medium"
        ? "This region has enough evidence to inspect calmly."
        : "This region may match an earlier pattern.";
  const overlaySaturation = buildOverlaySaturation({
    activeSpatialFocus: params.activeSpatialFocus,
    events: params.overlayEvents,
    focusSuggestionEventId: params.focusSuggestionEventId,
    investigationRegions: params.investigationRegions,
    knowledgeRegions: params.knowledgeRegions,
    measurementRelationships: params.measurementRelationships,
    operationalProfile,
    temporarySpatialRegions: params.temporarySpatialRegions,
  });
  const focusCorridor = buildFocusCorridor({
    activeSpatialFocus: params.activeSpatialFocus,
    overlaySaturation,
    primarySurface,
  });
  const rhythm = buildOperationalRhythm({
    phase: investigationPhase,
    pendingMeasurements,
    unresolvedCriticalItems,
  });
  const voiceSettings = params.state.layout.voiceGuidance;
  const voiceAllowed = shouldSpeak && voiceSettings.ambientListeningState !== "muted";
  const spokenGuidanceMode =
    voiceAllowed === false
      ? "silent"
      : voiceSettings.handsBusyMode
        ? "step-by-step"
        : voiceSettings.spokenGuidanceMode === "silent"
          ? "brief"
          : voiceSettings.spokenGuidanceMode;

  return {
    operationalProfile,
    investigationPhase,
    nextBestAction,
    unresolvedCriticalItems,
    pendingMeasurements,
    suspiciousRegions: params.investigationRegions.slice(0, 3).map((region) => ({
      ref: regionEntityRef(region.regionId),
      label: region.label,
      confidence,
      urgency,
    })),
    panelVisibility: buildStaticPanelVisibility(primarySurface),
    aiInterruption: {
      confidence,
      urgency,
      evidenceDepth,
      shouldSpeak,
      silenceReason: shouldSpeak ? null : "Silence is preserving the current work focus.",
      duplicateInsightsMerged,
      suppressedObservationCount,
      toneLine,
      attentionBudget,
    },
    recovery: {
      currentFocus: getFocusLabel(params.activeSpatialFocus),
      lastVerifiedStep:
        params.measurementEvidence.at(-1)?.reference ??
        params.visibleEvents
          .filter((event): event is RepairMeasurementEvent => event.kind === "measurement")
          .at(-1)?.reference ??
        "No verified step yet",
      pendingAction: nextBestAction.text,
      whyThisRegionMatters:
        params.activeSpatialFocus === null
          ? "No region is selected."
          : params.activeSpatialFocus.relatedAiMarkIds.length > 0
            ? "Linked to an AI observation and measurement evidence."
            : "This is the current inspection area.",
    },
    overlaySaturation,
    focusCorridor,
    rhythm,
    voice: {
      ambientListeningState: voiceSettings.ambientListeningState,
      voiceFocusTarget: params.activeSpatialFocus?.ref ?? null,
      spokenGuidanceMode,
      handsBusyMode: voiceSettings.handsBusyMode,
      spokenLine: voiceAllowed ? nextBestAction.text : null,
    },
  };
}

export function projectRepairTacticalFeedItems(
  items: RepairTacticalFeedItem[],
  guidance: RepairGuidanceProjection
): RepairTacticalFeedItem[] {
  if (guidance.operationalProfile === "advanced") return items;
  const maxItems =
    guidance.panelVisibility.tacticalFeedDensity === "expanded"
      ? 5
      : guidance.panelVisibility.tacticalFeedDensity === "compact"
        ? 3
        : 2;
  const activeEventIds = new Set(
    guidance.overlaySaturation.activeAttentionRefs
      .filter((ref) => ref.kind === "event")
      .map((ref) => ref.id)
  );
  const seenBodies = new Set<string>();
  const prioritized = items.filter((item) => {
    const key = item.body.toLowerCase().replace(/\s+/g, " ").slice(0, 72);
    if (seenBodies.has(key)) return false;
    seenBodies.add(key);
    if (activeEventIds.has(item.eventId)) return true;
    if (item.severity === "risk" || item.severity === "action") return true;
    if (guidance.panelVisibility.tacticalFeedDensity === "expanded")
      return item.severity !== "info";
    return false;
  });
  const fallback = items.filter(
    (item) => !prioritized.some((entry) => entry.eventId === item.eventId)
  );
  return [...prioritized, ...fallback].slice(0, maxItems);
}

function hasOperationCapability(capabilities: string[], capability: string): boolean {
  return capabilities.includes(capability);
}

function isCameraCapability(capability: string): boolean {
  return capability === "android-camera" || capability.endsWith("-camera");
}

function buildOperationsProjection(state: RepairRuntimeState): {
  operationsAvailable: boolean;
  operations: RepairOperationsProjection;
} {
  const status = state.operationsStatus;
  if (status === null || status.updatedAt <= 0) {
    if (state.livePreview !== null) {
      return {
        operationsAvailable: true,
        operations: {
          ...createRepairDefaultOperationsProjection(),
          cameraActive: true,
          liveFeedActive: true,
          activeCapabilities: ["android-camera", "live-feed"],
        },
      };
    }

    return {
      operationsAvailable: false,
      operations: createRepairDefaultOperationsProjection(),
    };
  }

  const activeCapabilities = uniqueStrings([
    ...status.records.map((record) => record.capability),
    ...(state.livePreview === null ? [] : ["android-camera", "live-feed"]),
  ]);
  const firstOwner = status.records[0]?.owner ?? null;
  const operations: RepairOperationsProjection = {
    localMicActive: hasOperationCapability(activeCapabilities, "local-microphone"),
    androidMicActive: hasOperationCapability(activeCapabilities, "android-microphone"),
    cameraActive: activeCapabilities.some(isCameraCapability),
    liveFeedActive: hasOperationCapability(activeCapabilities, "live-feed"),
    ambientActive: hasOperationCapability(activeCapabilities, "ambient-listening"),
    ttsActive:
      hasOperationCapability(activeCapabilities, "local-tts") ||
      hasOperationCapability(activeCapabilities, "android-tts"),
    activeCapabilities,
  };
  if (firstOwner !== null) {
    operations.activeOwner = firstOwner.label.trim() === "" ? firstOwner.id : firstOwner.label;
  }
  return { operationsAvailable: true, operations };
}

function buildVoiceReadinessProjection(
  state: RepairRuntimeState,
  operationsAvailable: boolean,
  operations: RepairOperationsProjection
): RepairReplayProjection["voiceReadiness"] {
  const micActive = operations.localMicActive || operations.androidMicActive;
  const ambientMode = operationsAvailable && operations.ambientActive;
  return {
    available: operationsAvailable && (micActive || ambientMode),
    listening:
      operationsAvailable &&
      (micActive || ambientMode) &&
      state.layout.voiceGuidance.ambientListeningState === "listening",
    handsBusyMode: state.layout.voiceGuidance.handsBusyMode,
    ambientMode,
  };
}

function buildLiveSourceProjection(params: {
  activeFreezeFrameEventId: string | null;
  activeSnapshotEventId: string | null;
  operations: RepairOperationsProjection;
  session: RepairSession | null;
  state: RepairRuntimeState;
}): RepairReplayProjection["liveSource"] {
  if (
    params.activeFreezeFrameEventId !== null ||
    (params.state.workbench.timeline.autoFollowLive === false &&
      params.activeSnapshotEventId !== null)
  ) {
    return { available: true, connected: false, sourceType: "snapshot" };
  }

  if (params.operations.liveFeedActive && params.operations.cameraActive) {
    const sourceType =
      params.operations.activeCapabilities.find(isCameraCapability) ?? "android-camera";
    return {
      available: true,
      connected: true,
      sourceType,
      preview: params.state.livePreview,
    };
  }

  if (params.session?.pcbImage !== null && params.session?.pcbImage !== undefined) {
    return { available: true, connected: false, sourceType: "image" };
  }

  return { available: false, connected: false };
}

function buildContinuityProjection(params: {
  activeSpatialFocus: RepairSpatialFocusState | null;
  guidance: RepairGuidanceProjection;
  investigationRegions: RepairInvestigationRegion[];
  visibleEvents: RepairEvent[];
}): RepairReplayProjection["continuity"] {
  const continuity: RepairReplayProjection["continuity"] = {
    currentInvestigationPhase: params.guidance.investigationPhase,
  };

  if (params.activeSpatialFocus !== null) {
    continuity.lastFocusTarget = {
      ref: params.activeSpatialFocus.ref,
      label: params.activeSpatialFocus.label,
    };
  }

  const lastMeasurement = params.visibleEvents
    .filter((event): event is RepairMeasurementEvent => event.kind === "measurement")
    .at(-1);
  if (lastMeasurement !== undefined) {
    continuity.lastMeasurement = {
      eventId: lastMeasurement.id,
      reference: lastMeasurement.reference ?? lastMeasurement.channel,
      display: `${lastMeasurement.rawDisplay}${lastMeasurement.unit}`,
    };
  }

  const lastVerifiedRegion = [...params.investigationRegions]
    .filter((region) => region.status === "resolved")
    .sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt))
    .at(-1);
  if (lastVerifiedRegion !== undefined) {
    continuity.lastVerifiedRegion = {
      ref: regionEntityRef(lastVerifiedRegion.regionId),
      label: lastVerifiedRegion.label,
    };
  }

  return continuity;
}

export function createEmptyRepairReplayProjection(): RepairReplayProjection {
  const guidance = createRepairDefaultGuidanceProjection();
  return {
    playheadMs: 0,
    replayMode: "live",
    operationsAvailable: false,
    operations: createRepairDefaultOperationsProjection(),
    voiceReadiness: createRepairDefaultVoiceReadinessProjection(),
    continuity: createRepairDefaultContinuityProjection(),
    liveSource: { available: false, connected: false },
    visibleEvents: [],
    overlayEvents: [],
    tacticalFeed: [],
    measurementEvidence: [],
    aiMarkEventIds: [],
    activeSnapshotEventId: null,
    activeFreezeFrameEventId: null,
    focusSuggestionEventId: null,
    knowledgeRegions: [],
    investigationRegions: [],
    temporarySpatialRegions: [],
    measurementRelationships: [],
    timelineDensity: [],
    activeSpatialFocus: null,
    operationalMode: "live",
    guidance,
  };
}

export function createRepairReplayProjection(
  state: RepairRuntimeState,
  session: RepairSession | null
): RepairReplayProjection {
  if (session === null) return createEmptyRepairReplayProjection();

  const { operationsAvailable, operations } = buildOperationsProjection(state);
  const voiceReadiness = buildVoiceReadinessProjection(state, operationsAvailable, operations);
  const orderedEvents = sortRepairEventsForReplay(session.events);
  const playheadMs = getProjectionPlayheadMs(state, session);
  const visibleEvents = orderedEvents.filter((event) =>
    isVisibleAtPlayhead(session, playheadMs, event)
  );
  const activeFreeze = visibleEvents.find((event) => {
    if (event.kind !== "freeze-frame") return false;
    const startMs = getEventOffsetMs(session, event);
    return playheadMs >= startMs && playheadMs <= startMs + event.durationMs;
  });
  const forensicPlayheadMs =
    activeFreeze === undefined ? playheadMs : getEventOffsetMs(session, activeFreeze);
  const forensicEvents = orderedEvents.filter((event) =>
    isVisibleAtPlayhead(session, forensicPlayheadMs, event)
  );
  const lifecycleMap = buildAiLifecycleMap(forensicEvents);
  const measurementEvidence = buildMeasurementEvidence(forensicEvents).evidence;
  const activeSnapshot = forensicEvents.filter((event) => event.kind === "snapshot").at(-1);
  const visibleAiMarks = forensicEvents.filter((event): event is RepairAiMarkEvent => {
    if (event.kind !== "ai-mark") return false;
    return isAiMarkVisible(
      session,
      forensicPlayheadMs,
      event,
      lifecycleMap.get(event.id) ?? "detected"
    );
  });
  const focusSuggestion = [...visibleAiMarks].sort(
    (left, right) => getAiPriority(right, orderedEvents) - getAiPriority(left, orderedEvents)
  )[0];
  const visibleAiMarkIds = new Set(visibleAiMarks.map((event) => event.id));
  const investigationRegions = buildInvestigationRegions(forensicEvents);
  const knowledgeRegions = buildKnowledgeRegions(session, forensicEvents);
  const temporarySpatialRegions = buildTemporarySpatialRegions(state, knowledgeRegions);
  const measurementRelationships = buildMeasurementRelationships(
    forensicEvents,
    investigationRegions
  );
  const activeSpatialFocus = buildActiveSpatialFocus({
    state,
    events: forensicEvents,
    knowledgeRegions,
    investigationRegions,
    temporarySpatialRegions,
    measurementRelationships,
  });
  const overlayEvents = forensicEvents.filter((event) => {
    if (event.kind === "ai-mark") return visibleAiMarkIds.has(event.id);
    return (
      event.kind === "risk-flag" || event.kind === "annotation" || event.kind === "measurement"
    );
  });
  const preliminaryFeed = buildTacticalFeed(session, visibleEvents);
  const guidance = buildRepairGuidanceProjection({
    activeSpatialFocus,
    focusSuggestionEventId: focusSuggestion?.id ?? null,
    investigationRegions,
    knowledgeRegions,
    measurementEvidence,
    measurementRelationships,
    overlayEvents,
    preliminaryFeed,
    session,
    state,
    temporarySpatialRegions,
    visibleEvents,
  });
  const liveSource = buildLiveSourceProjection({
    activeFreezeFrameEventId: activeFreeze?.id ?? null,
    activeSnapshotEventId: activeSnapshot?.id ?? null,
    operations,
    session,
    state,
  });
  const continuity = buildContinuityProjection({
    activeSpatialFocus,
    guidance,
    investigationRegions,
    visibleEvents,
  });

  return {
    playheadMs,
    replayMode: state.workbench.timeline.replayMode,
    operationsAvailable,
    operations,
    voiceReadiness,
    continuity,
    liveSource,
    visibleEvents,
    overlayEvents,
    tacticalFeed: projectRepairTacticalFeedItems(preliminaryFeed, guidance),
    measurementEvidence,
    aiMarkEventIds: visibleAiMarks.map((event) => event.id),
    activeSnapshotEventId: activeSnapshot?.id ?? null,
    activeFreezeFrameEventId: activeFreeze?.id ?? null,
    focusSuggestionEventId: focusSuggestion?.id ?? null,
    knowledgeRegions,
    investigationRegions,
    temporarySpatialRegions,
    measurementRelationships,
    timelineDensity: buildTimelineDensity(session, forensicEvents, investigationRegions),
    activeSpatialFocus,
    operationalMode: getOperationalMode(state, activeFreeze?.id ?? null),
    guidance,
  };
}

export function projectRepairMeasurementState(
  measurement: RepairMeasurementState,
  visibleEvents: RepairEvent[]
): RepairMeasurementState {
  const projected = buildMeasurementEvidence(visibleEvents);
  const currentReading = projected.recent[0] ?? null;
  return {
    ...measurement,
    current:
      currentReading === null
        ? measurement.current
        : {
            ...measurement.current,
            display: currentReading.rawDisplay,
            value: currentReading.value,
            unit: currentReading.unit,
            range: currentReading.range,
            mode: currentReading.mode,
            hold: false,
          },
    recent: projected.recent.length === 0 ? measurement.recent : projected.recent,
    evidence: projected.measurementStateEvidence,
  };
}

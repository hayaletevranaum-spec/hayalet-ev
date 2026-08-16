import {
  REPAIR_OPERATOR_PROFILE_SCHEMA_VERSION,
  REPAIR_UI_COLORS,
} from "../repair-constants.js";
import type {
  RepairAiAdaptationHints,
  RepairMeasurementSnapshot,
  RepairMeasurementState,
  RepairOperatorProfile,
  RepairWizardDraft,
  RepairWizardManualEvidenceDraft,
  RepairWizardState,
} from "../types/index.js";
import type {
  RepairAiMarkEvent,
  RepairAiMarkLifecycleEvent,
  RepairEvent,
  RepairInvestigationRegionCreatedEvent,
  RepairInvestigationRegionUpdatedEvent,
  RepairNoteEvent,
  RepairRiskFlagEvent,
  RepairSnapshotEvent,
} from "../types/repair-event.js";
import type { RepairTacticalFeedItem } from "../ui/state.js";

function formatRelative(originIso: string, occurredIso: string): string {
  const origin = Date.parse(originIso);
  const occurred = Date.parse(occurredIso);
  if (Number.isNaN(origin) || Number.isNaN(occurred)) {
    return "+00:00";
  }
  const deltaSeconds = Math.max(0, Math.floor((occurred - origin) / 1000));
  const minutes = Math.floor(deltaSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (deltaSeconds % 60).toString().padStart(2, "0");
  return `+${minutes}:${seconds}`;
}

export function repairEventToTacticalFeedItem(
  event: RepairEvent,
  sessionStartIso: string
): RepairTacticalFeedItem | null {
  const relative = formatRelative(sessionStartIso, event.occurredAt);
  switch (event.kind) {
    case "ai-mark": {
      const mark = event as RepairAiMarkEvent;
      const severity = mark.severity;
      const badge =
        severity === "risk"
          ? "RISK"
          : severity === "action"
            ? "ACTION"
            : severity === "suggestion"
              ? "SUGGESTION"
              : "INFO";
      return {
        eventId: mark.id,
        occurredAt: mark.occurredAt,
        relativeLabel: relative,
        severity,
        badge,
        body: mark.rationale,
      };
    }
    case "risk-flag": {
      const risk = event as RepairRiskFlagEvent;
      return {
        eventId: risk.id,
        occurredAt: risk.occurredAt,
        relativeLabel: relative,
        severity: "risk",
        badge: "RISK",
        body: risk.message,
      };
    }
    case "snapshot": {
      const snap = event as RepairSnapshotEvent;
      return {
        eventId: snap.id,
        occurredAt: snap.occurredAt,
        relativeLabel: relative,
        severity: "info",
        badge: "INFO",
        body: snap.caption,
      };
    }
    case "note": {
      const note = event as RepairNoteEvent;
      return {
        eventId: note.id,
        occurredAt: note.occurredAt,
        relativeLabel: relative,
        severity: "info",
        badge: "INFO",
        body: note.text,
      };
    }
    case "ai-mark-lifecycle": {
      const lifecycle = event as RepairAiMarkLifecycleEvent;
      return {
        eventId: lifecycle.id,
        occurredAt: lifecycle.occurredAt,
        relativeLabel: relative,
        severity: "info",
        badge: "AI STATE",
        body: lifecycle.reason,
      };
    }
    case "investigation-region-created": {
      const region = event as RepairInvestigationRegionCreatedEvent;
      return {
        eventId: region.id,
        occurredAt: region.occurredAt,
        relativeLabel: relative,
        severity: "action",
        badge: "REGION",
        body: `Investigation region created: ${region.label}`,
      };
    }
    case "investigation-region-updated": {
      const region = event as RepairInvestigationRegionUpdatedEvent;
      return {
        eventId: region.id,
        occurredAt: region.occurredAt,
        relativeLabel: relative,
        severity: region.status === "resolved" ? "info" : "action",
        badge: "REGION",
        body: `Investigation region updated: ${region.label ?? region.regionId}`,
      };
    }
    default:
      return null;
  }
}

export function buildTacticalFeedItems(
  events: RepairEvent[],
  sessionStartIso: string
): RepairTacticalFeedItem[] {
  return events
    .map((event) => repairEventToTacticalFeedItem(event, sessionStartIso))
    .filter((item): item is RepairTacticalFeedItem => item !== null);
}

export function buildRepairAiAdaptation(
  profile: RepairOperatorProfile
): RepairAiAdaptationHints {
  const has = (id: string): boolean =>
    profile.bench.tools.some((tool) => tool.id === id && tool.available);
  return {
    hasOscilloscope: has("oscilloscope"),
    hasBenchPsu: has("bench-psu"),
    hasThermalCamera: has("thermal-camera"),
    hasHotAirStation: has("hot-air-quick861d"),
    hasMicroscope: has("microscope-relife-rl-m3t"),
    preferMultimeterFallbacks: has("oscilloscope") === false,
  };
}

function createEmptyManualEvidenceDraft(): RepairWizardManualEvidenceDraft {
  return {
    resources: [],
    failures: [],
    testPoints: [],
    notes: [],
    removedResourceIds: [],
    removedFailureIds: [],
    removedTestPointIds: [],
    removedNoteIds: [],
  };
}

function createEmptyWizardDraft(): RepairWizardDraft {
  return {
    deviceType: "",
    manufacturer: "",
    model: "",
    boardCode: "",
    serialNumber: "",
    intakeNotes: "",
    primarySymptoms: [],
    customSymptoms: [],
    symptomFreeText: "",
    selectedEvidenceResourceIds: [],
    selectedFailureIds: [],
    selectedTestPointIds: [],
    manualEvidence: createEmptyManualEvidenceDraft(),
    researchSkipped: false,
    researchStatus: "idle",
    researchMessage: null,
  };
}

export function createDefaultWizardState(): RepairWizardState {
  return {
    currentStep: "device-info",
    draft: createEmptyWizardDraft(),
    researchProgress: [],
    foundResources: [],
    generatedKnowledgePackId: null,
    evidenceReviewed: false,
  };
}

export function createDefaultMeasurementState(): RepairMeasurementState {
  const emptySnapshot: RepairMeasurementSnapshot = {
    instrumentId: "manual-entry",
    kind: "multimeter",
    label: "Manual entry",
    mode: "dc-voltage",
    range: "-",
    display: "-",
    value: null,
    unit: "",
    hold: false,
    driftAmplitude: 0,
  };
  return {
    activeInstrumentKind: "multimeter",
    current: emptySnapshot,
    recent: [],
    evidence: [],
    comparisonEventId: null,
  };
}

export function createDefaultOperatorProfile(): RepairOperatorProfile {
  return {
    schemaVersion: REPAIR_OPERATOR_PROFILE_SCHEMA_VERSION,
    profileId: "operator-default",
    displayName: "Bench Operator",
    bench: {
      tools: [],
      consumables: [],
      safety: [],
    },
    skills: [],
    preferences: {
      measurementSystem: "metric",
      annotationDefaultColor: REPAIR_UI_COLORS.cyan,
      annotationDefaultStrokeWidth: 2,
      riskTolerance: "medium",
      aiVerbosity: "standard",
    },
    updatedAt: new Date(0).toISOString(),
  };
}

import {
  REPAIR_LOCAL_OWNER_SCOPE_ID,
  REPAIR_ROOM_ID,
  REPAIR_SESSION_SCHEMA_VERSION,
} from "../../shared/repair-constants.js";

import type {
  RepairEvidenceSelection,
  RepairSession,
  RepairSessionListItem,
  RepairWizardDraft,
} from "../../shared/types/index.js";
import type { RepairRuntimeState } from "../state/repair-runtime-state.js";
import { createEventId } from "./event-factory.js";
import { safeString } from "./guards.js";

const REQUIRED_DEVICE_FIELDS: Array<
  keyof Pick<RepairWizardDraft, "deviceType" | "manufacturer" | "model" | "boardCode">
> = ["deviceType", "manufacturer", "model", "boardCode"];

export function buildSessionList(sessions: Record<string, RepairSession>): RepairSessionListItem[] {
  return Object.values(sessions)
    .map((session) => ({
      id: session.id,
      title: session.title,
      deviceLabel: session.deviceInfo.deviceLabel,
      boardCode: session.deviceInfo.boardCode,
      serialNumber: session.deviceInfo.serialNumber,
      status: session.status,
      riskLevel: session.riskLevel,
      updatedAt: session.updatedAt,
      isArchived: session.status === "archived",
    }))
    .sort(
      (a, b) =>
        Number(a.isArchived) - Number(b.isArchived) || b.updatedAt.localeCompare(a.updatedAt)
    );
}

export function getActiveSession(state: RepairRuntimeState): RepairSession | null {
  return state.activeSessionId === null ? null : (state.sessions[state.activeSessionId] ?? null);
}

export function phaseForSession(session: RepairSession | null): RepairRuntimeState["phase"] {
  if (session === null) return "idle";
  if (session.status === "paused") return "session-paused";
  if (session.status === "draft" || session.status === "research" || session.status === "ready") {
    return "wizard-active";
  }
  return "session-active";
}

export function getSessionTimelineMs(session: RepairSession | null): number {
  if (session === null) return 0;
  const lastEventMs =
    session.events.length === 0
      ? 0
      : Math.max(
          ...session.events.map((event) =>
            Math.max(0, Date.parse(event.occurredAt) - Date.parse(session.startedAt))
          )
        );
  return Math.max(0, lastEventMs);
}

export function hasRequiredWizardDeviceInfo(draft: RepairWizardDraft): boolean {
  return REQUIRED_DEVICE_FIELDS.every((field) => draft[field].trim() !== "");
}

export function hasWizardSymptoms(draft: RepairWizardDraft): boolean {
  return uniqueStringList([...draft.primarySymptoms, ...draft.customSymptoms]).length > 0;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function uniqueStringList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const trimmed = value.trim();
    if (trimmed === "" || seen.has(trimmed)) return;
    seen.add(trimmed);
    result.push(trimmed);
  });
  return result;
}

export function patchWizardDraftFromPayload(
  payload: Record<string, unknown>
): Partial<RepairWizardDraft> | null {
  const draftPayload = payload["wizardDraft"];
  if (typeof draftPayload === "object" && draftPayload !== null) {
    const raw = draftPayload as Record<string, unknown>;
    const patch: Partial<RepairWizardDraft> = {};
    const stringFields: Array<
      keyof Pick<
        RepairWizardDraft,
        | "deviceType"
        | "manufacturer"
        | "model"
        | "boardCode"
        | "serialNumber"
        | "intakeNotes"
        | "symptomFreeText"
      >
    > = [
      "deviceType",
      "manufacturer",
      "model",
      "boardCode",
      "serialNumber",
      "intakeNotes",
      "symptomFreeText",
    ];
    stringFields.forEach((field) => {
      const value = raw[field];
      if (typeof value === "string") {
        patch[field] = value;
      }
    });
    const arrayFields: Array<
      keyof Pick<
        RepairWizardDraft,
        | "primarySymptoms"
        | "customSymptoms"
        | "selectedEvidenceResourceIds"
        | "selectedFailureIds"
        | "selectedTestPointIds"
      >
    > = [
      "primarySymptoms",
      "customSymptoms",
      "selectedEvidenceResourceIds",
      "selectedFailureIds",
      "selectedTestPointIds",
    ];
    arrayFields.forEach((field) => {
      const value = raw[field];
      if (Array.isArray(value)) {
        patch[field] = asStringArray(value);
      }
    });
    if (typeof raw["researchSkipped"] === "boolean") {
      patch.researchSkipped = raw["researchSkipped"];
    }
    if (
      raw["researchStatus"] === "idle" ||
      raw["researchStatus"] === "running" ||
      raw["researchStatus"] === "succeeded" ||
      raw["researchStatus"] === "failed" ||
      raw["researchStatus"] === "skipped"
    ) {
      patch.researchStatus = raw["researchStatus"];
    }
    if (typeof raw["researchMessage"] === "string" || raw["researchMessage"] === null) {
      patch.researchMessage = raw["researchMessage"];
    }
    return Object.keys(patch).length === 0 ? null : patch;
  }

  const field = safeString(payload["wizardField"]);
  const value = payload["value"];
  if (
    field === "deviceType" ||
    field === "manufacturer" ||
    field === "model" ||
    field === "boardCode" ||
    field === "serialNumber" ||
    field === "intakeNotes" ||
    field === "symptomFreeText"
  ) {
    return typeof value === "string" ? { [field]: value } : null;
  }
  if (
    field === "primarySymptoms" ||
    field === "customSymptoms" ||
    field === "selectedEvidenceResourceIds" ||
    field === "selectedFailureIds" ||
    field === "selectedTestPointIds"
  ) {
    return Array.isArray(value) ? { [field]: asStringArray(value) } : null;
  }
  if (field === "researchSkipped" && typeof value === "boolean") {
    return { researchSkipped: value };
  }
  return null;
}

export function createEvidenceSelectionFromDraft(
  sessionId: string,
  draft: RepairWizardDraft,
  iso: string
): RepairEvidenceSelection {
  return {
    sessionId,
    selectedEvidenceResourceIds: [...draft.selectedEvidenceResourceIds],
    selectedFailureIds: [...draft.selectedFailureIds],
    selectedTestPointIds: [...draft.selectedTestPointIds],
    updatedAt: iso,
  };
}

export function createDraftSession(state: RepairRuntimeState, iso: string): RepairSession {
  const draft = state.wizard.draft;
  const id = createEventId("repair-draft", iso);
  const boardCode = draft.boardCode.trim() || "BOARD-PENDING";
  const primarySymptoms = uniqueStringList([...draft.primarySymptoms, ...draft.customSymptoms]);
  return {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    id,
    roomId: REPAIR_ROOM_ID,
    ownerScopeId: REPAIR_LOCAL_OWNER_SCOPE_ID,
    title: `RR-${iso.slice(5, 10).replace("-", "")}-${iso.slice(11, 16).replace(":", "")}`,
    status: "draft",
    riskLevel: "medium",
    deviceInfo: {
      deviceType: draft.deviceType.trim() || "Bilinmiyor",
      deviceLabel: draft.model.trim() || draft.deviceType.trim() || "Bench intake draft",
      manufacturer: draft.manufacturer.trim() || "Unknown",
      model: draft.model.trim() || "Model pending",
      boardCode,
      serialNumber: draft.serialNumber.trim() || "S/N pending",
      intakeNotes: draft.intakeNotes.trim() || "Awaiting intake notes.",
    },
    symptoms: {
      primarySymptoms,
      freeText: draft.symptomFreeText.trim() || "Symptoms pending.",
      reportedAt: iso,
    },
    pcbImage: null,
    knowledgePackId: null,
    knowledgePack: null,
    events: [
      {
        kind: "session-start",
        id: createEventId("evt-draft-start", iso),
        sessionId: id,
        occurredAt: iso,
        source: "system",
        linkedEventIds: [],
        title: "Draft repair session opened",
      },
    ],
    sessionNotes: "Draft session created from Repair Room wizard.",
    startedAt: iso,
    updatedAt: iso,
    archivedAt: null,
  };
}

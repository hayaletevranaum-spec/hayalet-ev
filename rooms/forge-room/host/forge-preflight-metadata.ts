import {
  FORGE_PREFLIGHT_SCHEMA_VERSION,
  FORGE_ROOM_ID,
  FORGE_WORKBENCH_FEATURE_ID,
} from "../shared/forge-constants.js";
import type {
  ForgeAppArchitectureSummary,
  ForgeCapabilityDescriptor,
  ForgeCoreSystemMetadata,
  ForgeGoal,
  ForgeOperatorEquipmentRecord,
  ForgeOperatorProfile,
  ForgeOperatorSkillRecord,
  ForgeRunOverride,
  ForgeSelectedOperatorProfile,
  ForgeSessionContextSelection,
  ForgeTargetRoomContext,
} from "../shared/types/index.js";
import {
  isForgeSelectedOperatorProfileEmpty,
  isForgeSessionContextSelectionEmpty,
  resolveForgeArchitectSeatId,
} from "../shared/types/index.js";
import { nowIso, uniqueStrings } from "./forge-runtime-support.js";

const FORGE_CAPABILITY_DESCRIPTORS: ForgeCapabilityDescriptor[] = [
  {
    id: "forge-guided-ui",
    title: "Guided workbench UI",
    summary:
      "Forge keeps planning, response review, and export review in three guided rails so the operator can move without managing cross-agent chatter.",
    tags: ["ui", "relay"],
    relevantModules: [
      "rooms/forge-room/ui/forge-room-ui-runtime.ts",
      "rooms/forge-room/ui/panels/workbench-stage-panel.ts",
      "rooms/forge-room/ui/panels/responses-panel.ts",
      "rooms/forge-room/ui/panels/synthesis-panel.ts",
    ],
    roomIds: [FORGE_ROOM_ID],
  },
  {
    id: "forge-session-storage",
    title: "Room-local session storage",
    summary:
      "Forge persists sessions, exports, and operator context under room-local storage so runs can reopen without touching workspace source files.",
    tags: ["storage", "archive"],
    relevantModules: [
      "rooms/forge-room/host/forge-session-storage.ts",
      "rooms/forge-room/shared/host/forge-paths.ts",
      "rooms/forge-room/host/forge-operator-profile-storage.ts",
    ],
    roomIds: [FORGE_ROOM_ID],
  },
  {
    id: "forge-protocol-bridge",
    title: "Prompt protocol bridge",
    summary:
      "Forge AI calls stay behind the dispatch bridge and protocol registry so prompts can be enriched without changing the room command surface.",
    tags: ["protocol", "relay"],
    relevantModules: [
      "rooms/forge-room/host/runtime.ts",
      "rooms/forge-room/main-functions/forge-workbench/protocols/forge-room-breakdown-architect.md",
      "rooms/forge-room/main-functions/forge-workbench/protocols/forge-room-task-response.md",
      "rooms/forge-room/main-functions/forge-workbench/protocols/forge-room-synthesis.md",
    ],
    roomIds: [FORGE_ROOM_ID],
  },
  {
    id: "forge-target-handoff",
    title: "Target room handoff contract",
    summary:
      "Forge ends in a compact JSON handoff that stays explicit about the downstream target instead of assuming one canonical room.",
    tags: ["archive", "protocol", "target-room"],
    relevantModules: [
      "rooms/forge-room/host/forge-handoff-export.ts",
      "rooms/forge-room/shared/types/forge-handoff.ts",
      "rooms/forge-room/host/forge-task-runtime.ts",
    ],
    roomIds: [FORGE_ROOM_ID],
  },
  {
    id: "forge-response-synthesis",
    title: "Response review and synthesis",
    summary:
      "Forge captures seat-specific answers, groups compare conflicts, then synthesizes one export-ready direction while keeping the conflict trail visible.",
    tags: ["relay", "archive", "ui"],
    relevantModules: [
      "rooms/forge-room/host/forge-task-runtime.ts",
      "rooms/forge-room/host/forge-synthesis-runtime.ts",
      "rooms/forge-room/ui/panels/responses-panel.ts",
    ],
    roomIds: [FORGE_ROOM_ID],
  },
  {
    id: "laboratory-image-analysis",
    title: "Laboratory visual analysis lanes",
    summary:
      "The Laboratory room can analyze visual inputs and derived artifacts, but those image-heavy lanes stay outside the core Forge planning loop unless the goal explicitly needs them.",
    tags: ["camera", "image", "archive"],
    relevantModules: [
      "rooms/laboratory/features/media-analysis/host/profile-preflight.ts",
      "rooms/laboratory/services/preflight-service.ts",
    ],
    roomIds: ["laboratory"],
  },
];

function titleCaseRoomId(roomId: string): string {
  return roomId
    .split(/[^a-z0-9]+/i)
    .filter((segment) => segment !== "")
    .map((segment) => `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`)
    .join("");
}

function humanizeValue(value: string): string {
  return value.replace(/_/g, " ");
}

function labelSkill(record: ForgeOperatorSkillRecord): string {
  return (
    (typeof record.label === "string" ? record.label.trim() : "") ||
    titleCaseRoomId(record.skillKey)
  );
}

function labelEquipment(
  record: ForgeOperatorEquipmentRecord,
  options: { includeBrandModel?: boolean } = {}
): string {
  const base =
    (typeof record.label === "string" ? record.label.trim() : "") ||
    titleCaseRoomId(record.equipmentKey);
  return options.includeBrandModel === true && record.brandModel
    ? `${base} (${record.brandModel})`
    : base;
}

function listEquipmentByStatus(
  records: ForgeOperatorEquipmentRecord[],
  status: ForgeOperatorEquipmentRecord["status"],
  options: { includeBrandModel?: boolean } = {}
): string[] {
  return records
    .filter((record) => record.status === status)
    .map((record) => labelEquipment(record, options));
}

export function listForgeCapabilityDescriptors(): ForgeCapabilityDescriptor[] {
  return FORGE_CAPABILITY_DESCRIPTORS.map((entry) => ({
    ...entry,
    relevantModules: [...entry.relevantModules],
    roomIds: [...entry.roomIds],
    tags: [...entry.tags],
  }));
}

export function buildForgeCoreSystemMetadata(sessionId: string | null): ForgeCoreSystemMetadata {
  return {
    featureId: FORGE_WORKBENCH_FEATURE_ID,
    mode: "guided",
    roomId: FORGE_ROOM_ID,
    schemaVersion: Number.parseInt(FORGE_PREFLIGHT_SCHEMA_VERSION.slice(1), 10) || 3,
    sessionId,
  };
}

export function buildForgeAppArchitectureSummary(): ForgeAppArchitectureSummary {
  return {
    exportBoundary:
      "Forge ends in a target-room JSON handoff and does not dispatch implementation work itself.",
    relevantModules: [
      "rooms/forge-room/host/runtime.ts",
      "rooms/forge-room/host/forge-task-runtime.ts",
      "rooms/forge-room/host/forge-synthesis-runtime.ts",
      "rooms/forge-room/host/forge-handoff-export.ts",
    ],
    storageBoundary:
      "Persistent operator profile lives beside room storage, while run-specific overrides, preflight state, syntheses, and exports stay session-local.",
    summary:
      "Forge is a guided orchestration room: it drafts tasks, captures lane responses, resolves conflicts, then exports a narrow handoff package.",
  };
}

export function buildForgeTargetRoomContext(targetRoomId: string): ForgeTargetRoomContext | null {
  if (targetRoomId.trim() === "") {
    return null;
  }

  return {
    targetRoomId,
    constraints: [
      "Forge only guarantees a guided planning handoff.",
      "Export should stay handoff-oriented and JSON-based.",
      "Downstream target-specific contracts should stay explicit and compact.",
      "Open questions belong in the handoff instead of hidden assumptions.",
    ],
    relevantModules: [
      "rooms/forge-room/host/runtime.ts",
      "rooms/forge-room/host/forge-handoff-export.ts",
      "rooms/forge-room/shared/types/forge-handoff.ts",
    ],
    summary: `Target room ${titleCaseRoomId(
      targetRoomId
    )} should receive a narrow, explicit handoff with no hidden room-specific assumptions.`,
  };
}

export function buildForgeSelectedOperatorProfile(params: {
  operatorProfile: ForgeOperatorProfile;
  sessionContextSelection: ForgeSessionContextSelection;
}): ForgeSelectedOperatorProfile {
  const { operatorProfile, sessionContextSelection } = params;
  const selectedSkillKeys = new Set(sessionContextSelection.skillKeys);
  const selectedEquipmentKeys = new Set(sessionContextSelection.equipmentKeys);
  const selectedPreferenceKeys = new Set(sessionContextSelection.preferenceKeys);

  return {
    skills: operatorProfile.skills.filter((entry) => selectedSkillKeys.has(entry.skillKey)),
    equipment: operatorProfile.equipment.filter((entry) =>
      selectedEquipmentKeys.has(entry.equipmentKey)
    ),
    preferences: {
      ...(selectedPreferenceKeys.has("mode") && operatorProfile.preferences.mode
        ? { mode: operatorProfile.preferences.mode }
        : {}),
      ...(selectedPreferenceKeys.has("riskTolerance") && operatorProfile.preferences.riskTolerance
        ? { riskTolerance: operatorProfile.preferences.riskTolerance }
        : {}),
    },
  };
}

export function summarizeForgeSelectedOperatorContext(params: {
  includeSensitiveFields?: boolean;
  runOverride: ForgeRunOverride | null;
  selectedOperatorProfile: ForgeSelectedOperatorProfile;
  sessionContextSelection: ForgeSessionContextSelection;
}): string[] {
  const { runOverride, selectedOperatorProfile, sessionContextSelection } = params;
  const availableEquipment = listEquipmentByStatus(selectedOperatorProfile.equipment, "available");
  const plannedEquipment = listEquipmentByStatus(selectedOperatorProfile.equipment, "planned");
  const unavailableEquipment = listEquipmentByStatus(
    selectedOperatorProfile.equipment,
    "unavailable"
  );
  const skillSummary = selectedOperatorProfile.skills
    .map((record) => `${labelSkill(record)} (${humanizeValue(record.level)})`)
    .sort((left, right) => left.localeCompare(right));
  const preferenceSummary = [
    selectedOperatorProfile.preferences.mode
      ? `Mode ${humanizeValue(selectedOperatorProfile.preferences.mode)}`
      : null,
    selectedOperatorProfile.preferences.riskTolerance
      ? `Risk tolerance ${humanizeValue(selectedOperatorProfile.preferences.riskTolerance)}`
      : null,
  ].filter((entry): entry is string => typeof entry === "string");
  const sessionSpecificSummary = [
    runOverride?.architectSeatId === "ai2"
      ? `Draft architect ${resolveForgeArchitectSeatId(runOverride).toUpperCase()}`
      : null,
    runOverride?.mode ? `Mode ${humanizeValue(runOverride.mode)}` : null,
    runOverride?.riskTolerance
      ? `Risk tolerance ${humanizeValue(runOverride.riskTolerance)}`
      : null,
  ].filter((entry): entry is string => typeof entry === "string");

  if (
    isForgeSessionContextSelectionEmpty(sessionContextSelection) &&
    (runOverride?.temporaryConditions.length ?? 0) === 0 &&
    (runOverride?.notes.trim() ?? "") === "" &&
    sessionSpecificSummary.length === 0
  ) {
    return [
      "No operator context was selected for this run; do not assume skills, equipment, or preferences beyond the goal itself.",
    ];
  }

  if (
    isForgeSelectedOperatorProfileEmpty(selectedOperatorProfile) &&
    (runOverride?.temporaryConditions.length ?? 0) === 0 &&
    (runOverride?.notes.trim() ?? "") === "" &&
    sessionSpecificSummary.length === 0
  ) {
    return [
      "Selected operator context has no persisted records yet; do not assume skills, equipment, or preferences beyond the goal itself.",
    ];
  }

  return uniqueStrings(
    [
      skillSummary.length > 0 ? `Selected skills: ${skillSummary.join(", ")}.` : null,
      availableEquipment.length > 0
        ? `Available equipment: ${availableEquipment.join(", ")}.`
        : null,
      plannedEquipment.length > 0 ? `Planned equipment: ${plannedEquipment.join(", ")}.` : null,
      unavailableEquipment.length > 0
        ? `Unavailable equipment: ${unavailableEquipment.join(", ")}.`
        : null,
      preferenceSummary.length > 0 ? `Preferences: ${preferenceSummary.join("; ")}.` : null,
      sessionSpecificSummary.length > 0
        ? `Session-specific: ${sessionSpecificSummary.join("; ")}.`
        : null,
      (runOverride?.temporaryConditions.length ?? 0) > 0
        ? `Temporary conditions: ${runOverride?.temporaryConditions.join("; ")}.`
        : null,
      params.includeSensitiveFields === true && runOverride?.notes.trim()
        ? `Run override note: ${runOverride.notes.trim().slice(0, 180)}.`
        : null,
    ].filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
  );
}

export function buildForgeDerivedConstraints(params: {
  goal: ForgeGoal;
  includeSensitiveFields?: boolean;
  runOverride: ForgeRunOverride | null;
  selectedOperatorProfile: ForgeSelectedOperatorProfile;
}): string[] {
  const { goal, runOverride, selectedOperatorProfile } = params;
  const derived: string[] = [...goal.constraints];
  const effectiveMode = runOverride?.mode ?? selectedOperatorProfile.preferences.mode;
  const effectiveRiskTolerance =
    runOverride?.riskTolerance ?? selectedOperatorProfile.preferences.riskTolerance;
  const architectSeatId = resolveForgeArchitectSeatId(runOverride);
  const unavailableEquipment = selectedOperatorProfile.equipment.filter(
    (entry) => entry.status === "unavailable"
  );
  if (architectSeatId === "ai2") {
    derived.push(
      "Route the first draft breakdown through AI2 instead of the default architect lane."
    );
  }
  if (unavailableEquipment.length > 0) {
    derived.push("Do not assume unavailable equipment is usable for this run.");
  }
  if (
    selectedOperatorProfile.skills.length > 0 &&
    selectedOperatorProfile.skills.every(
      (entry) => entry.level === "none" || entry.level === "basic"
    )
  ) {
    derived.push(
      "Keep steps low-risk, explicit, and approachable for the current operator profile."
    );
  }
  if (effectiveMode === "learn_first") {
    derived.push("Leave enough rationale for the operator to learn from the run.");
  }
  if (effectiveRiskTolerance === "low") {
    derived.push("Prefer reversible and lower-risk paths over speed.");
  }
  for (const condition of runOverride?.temporaryConditions ?? []) {
    derived.push(`Temporary run condition: ${condition}`);
  }
  if (params.includeSensitiveFields === true && runOverride?.notes.trim()) {
    derived.push(`Run note: ${runOverride.notes.trim()}`);
  }

  return uniqueStrings(derived);
}

export function createForgePreflightCreatedAt(): string {
  return nowIso();
}

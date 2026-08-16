import type {
  RepairAiMarkLifecycleState,
  RepairAmbientListeningState,
  RepairConsumable,
  RepairImagePoint,
  RepairImageRect,
  RepairInteractionSettingsState,
  RepairInvestigationRegionStatus,
  RepairInstrumentKind,
  RepairLivePreviewState,
  RepairOperationalProfile,
  RepairOperatorPreferences,
  RepairOperatorProfileTabId,
  RepairOverlayEntityRef,
  RepairPanelId,
  RepairSafetyItem,
  RepairSettingsOverlayTabId,
  RepairSkillRecord,
  RepairSpokenGuidanceMode,
  RepairTool,
  RepairToolCategory,
  RepairWorkbenchDrawTool,
  RepairWorkbenchTool,
} from "../../shared/types/index.js";
import type { RepairOperationsSnapshot } from "../../shared/ui/state.js";

const REPAIR_TOOLS: ReadonlySet<string> = new Set([
  "select",
  "pan",
  "zoom-in",
  "zoom-out",
  "rect",
  "circle",
  "freehand",
  "arrow",
  "text",
  "measurement-pin",
  "freeze-frame",
  "snapshot",
  "ruler",
]);
const ANNOTATION_TOOLS: ReadonlySet<string> = new Set([
  "rect",
  "circle",
  "freehand",
  "arrow",
  "text",
  "measurement-pin",
  "measurement-link",
]);
const AI_MARK_LIFECYCLE_STATES: ReadonlySet<string> = new Set([
  "detected",
  "acknowledged",
  "investigating",
  "resolved",
  "dismissed",
  "expired",
]);
const INVESTIGATION_REGION_STATUSES: ReadonlySet<string> = new Set([
  "draft",
  "active",
  "watching",
  "resolved",
  "dismissed",
]);
const OVERLAY_ENTITY_KINDS: ReadonlySet<string> = new Set([
  "event",
  "investigation-region",
  "temporary-spatial-region",
  "knowledge-region",
  "measurement-relationship",
  "live-edge",
]);
const PANEL_IDS: ReadonlySet<string> = new Set([
  "session-rail",
  "workbench-stage",
  "tactical-feed",
  "session-wizard",
  "knowledge-pack",
  "visual-timeline",
  "operator-profile",
]);
const INSTRUMENT_KINDS: ReadonlySet<string> = new Set(["multimeter", "power-supply", "signal-gen"]);
const OPERATOR_PROFILE_TABS: ReadonlySet<string> = new Set([
  "tools",
  "skills",
  "preferences",
  "controls",
]);
const TOOL_CATEGORIES: ReadonlySet<string> = new Set([
  "soldering",
  "measurement",
  "vision",
  "power",
  "other",
]);
const OPERATIONAL_PROFILES: ReadonlySet<string> = new Set(["novice", "advanced"]);
const AMBIENT_LISTENING_STATES: ReadonlySet<string> = new Set(["idle", "listening", "muted"]);
const SPOKEN_GUIDANCE_MODES: ReadonlySet<string> = new Set(["silent", "brief", "step-by-step"]);
const DICTATION_ROUTES: ReadonlySet<string> = new Set(["local", "android"]);
const TTS_ROUTES: ReadonlySet<string> = new Set(["local", "android"]);
const CAMERA_FEED_PREFERENCES: ReadonlySet<string> = new Set(["manual", "android-feed"]);
const DICTATION_SUBMIT_MODES: ReadonlySet<string> = new Set(["composer", "send"]);
const SETTINGS_OVERLAY_TABS: ReadonlySet<string> = new Set(["repair-controls", "bench-operator"]);

export function safeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function safeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((item) => safeString(item)).filter((item): item is string => item !== null);
}

export function uniqueStringList(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function normalizeRepairOperationsSnapshot(value: unknown): RepairOperationsSnapshot | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const records = record["records"];
  const updatedAt = safeNumber(record["updatedAt"]);
  if (!Array.isArray(records) || updatedAt === null) {
    return null;
  }

  return {
    updatedAt,
    records: records.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
      const source = entry as Record<string, unknown>;
      const capability = safeString(source["capability"]);
      const startedAt = safeNumber(source["startedAt"]);
      const ownerSource = source["owner"];
      if (
        capability === null ||
        startedAt === null ||
        typeof ownerSource !== "object" ||
        ownerSource === null ||
        Array.isArray(ownerSource)
      ) {
        return [];
      }
      const ownerRecord = ownerSource as Record<string, unknown>;
      const ownerId = safeString(ownerRecord["id"]);
      if (ownerId === null) return [];
      const owner = {
        id: ownerId,
        label: safeString(ownerRecord["label"]) ?? ownerId,
      };
      const roomId = safeString(ownerRecord["roomId"]);
      return [
        {
          capability,
          owner: roomId === null ? owner : { ...owner, roomId },
          startedAt,
        },
      ];
    }),
  };
}

export function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function safeRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeRepairToolPatch(
  value: unknown,
  existing: RepairTool[]
): RepairTool[] | null {
  if (!Array.isArray(value)) return null;
  const byId = new Map(existing.map((tool) => [tool.id, tool]));
  value.forEach((entry) => {
    const record = safeRecord(entry);
    const id = safeString(record?.["id"]);
    if (record === null || id === null) return;
    if (record["remove"] === true) {
      byId.delete(id);
      return;
    }
    const current = byId.get(id);
    const label = safeString(record["label"]);
    const category = isToolCategory(record["category"]) ? record["category"] : null;
    const model = safeNullableString(record["model"]);
    const notes = safeNullableString(record["notes"]);
    if (current === undefined) {
      if (label === null || category === null) return;
      byId.set(id, {
        id,
        category,
        label,
        capabilities: safeStringArray(record["capabilities"]) ?? [],
        available: typeof record["available"] === "boolean" ? record["available"] : true,
        model: model ?? null,
        notes: notes ?? null,
      });
      return;
    }
    byId.set(id, {
      ...current,
      ...(category !== null ? { category } : {}),
      ...(label !== null ? { label } : {}),
      ...(typeof record["available"] === "boolean" ? { available: record["available"] } : {}),
      ...(model !== undefined ? { model } : {}),
      ...(notes !== undefined ? { notes } : {}),
    });
  });
  return Array.from(byId.values());
}

export function normalizeRepairConsumablePatch(
  value: unknown,
  existing: RepairConsumable[]
): RepairConsumable[] | null {
  if (!Array.isArray(value)) return null;
  const byId = new Map(existing.map((item) => [item.id, item]));
  value.forEach((entry) => {
    const record = safeRecord(entry);
    const id = safeString(record?.["id"]);
    if (record === null || id === null) return;
    const current = byId.get(id);
    if (current === undefined) return;
    byId.set(id, {
      ...current,
      ...(typeof record["available"] === "boolean" ? { available: record["available"] } : {}),
      ...(typeof record["notes"] === "string" || record["notes"] === null
        ? { notes: record["notes"] }
        : {}),
    });
  });
  return existing.map((item) => byId.get(item.id) ?? item);
}

export function normalizeRepairSafetyPatch(
  value: unknown,
  existing: RepairSafetyItem[]
): RepairSafetyItem[] | null {
  if (!Array.isArray(value)) return null;
  const byId = new Map(existing.map((item) => [item.id, item]));
  value.forEach((entry) => {
    const record = safeRecord(entry);
    const id = safeString(record?.["id"]);
    if (record === null || id === null) return;
    const current = byId.get(id);
    if (current === undefined) return;
    byId.set(id, {
      ...current,
      ...(typeof record["available"] === "boolean" ? { available: record["available"] } : {}),
    });
  });
  return existing.map((item) => byId.get(item.id) ?? item);
}

export function normalizeRepairSkillsPatch(
  value: unknown,
  existing: RepairSkillRecord[]
): RepairSkillRecord[] | null {
  if (!Array.isArray(value)) return null;
  const byId = new Map(existing.map((skill) => [skill.id, skill]));
  value.forEach((entry) => {
    const record = safeRecord(entry);
    const id = safeString(record?.["id"]);
    const proficiency = safeNumber(record?.["proficiency"]);
    if (record === null || id === null) return;
    if (record["remove"] === true) {
      byId.delete(id);
      return;
    }
    const current = byId.get(id);
    const label = safeString(record["label"]);
    if (current === undefined) {
      if (label === null) return;
      byId.set(id, {
        id,
        label,
        proficiency: clampSkillLevel(proficiency ?? 3),
      });
      return;
    }
    byId.set(id, {
      ...current,
      ...(label !== null ? { label } : {}),
      ...(proficiency !== null ? { proficiency: clampSkillLevel(proficiency) } : {}),
    });
  });
  return Array.from(byId.values());
}

export function normalizeRepairPreferencesPatch(
  value: unknown,
  existing: RepairOperatorPreferences
): Partial<RepairOperatorPreferences> | null {
  const record = safeRecord(value);
  if (record === null) return null;
  const patch: Partial<RepairOperatorPreferences> = {};
  if (record["measurementSystem"] === "metric" || record["measurementSystem"] === "imperial") {
    patch.measurementSystem = record["measurementSystem"];
  }
  if (typeof record["annotationDefaultColor"] === "string") {
    patch.annotationDefaultColor = record["annotationDefaultColor"];
  }
  const strokeWidth = safeNumber(record["annotationDefaultStrokeWidth"]);
  if (strokeWidth !== null) {
    patch.annotationDefaultStrokeWidth = Math.max(1, Math.min(8, Math.round(strokeWidth)));
  }
  if (
    record["riskTolerance"] === "low" ||
    record["riskTolerance"] === "medium" ||
    record["riskTolerance"] === "high"
  ) {
    patch.riskTolerance = record["riskTolerance"];
  }
  if (
    record["aiVerbosity"] === "terse" ||
    record["aiVerbosity"] === "standard" ||
    record["aiVerbosity"] === "detailed"
  ) {
    patch.aiVerbosity = record["aiVerbosity"];
  }
  void existing;
  return Object.keys(patch).length === 0 ? null : patch;
}

function safeNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function isToolCategory(value: unknown): value is RepairToolCategory {
  return typeof value === "string" && TOOL_CATEGORIES.has(value);
}

function clampSkillLevel(value: number): RepairSkillRecord["proficiency"] {
  return Math.max(1, Math.min(5, Math.round(value))) as RepairSkillRecord["proficiency"];
}

export function normalizeRepairLivePreview(value: unknown): RepairLivePreviewState | null {
  const record = safeRecord(value);
  if (record === null) return null;
  const source = record["source"];
  if (source !== "v4l2" && source !== "mjpeg-stream") return null;
  const devicePath = safeString(record["devicePath"]);
  const label = safeString(record["label"]);
  const width = safeNumber(record["width"]);
  const height = safeNumber(record["height"]);
  const fps = safeNumber(record["fps"]);
  if (devicePath === null || label === null || width === null || height === null || fps === null) {
    return null;
  }
  return {
    source,
    devicePath,
    streamUrl: safeString(record["streamUrl"]),
    contentType: safeString(record["contentType"]),
    label,
    width,
    height,
    fps,
  };
}

export function safeImagePoint(value: unknown): RepairImagePoint | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const xPx = safeNumber(record["xPx"]);
  const yPx = safeNumber(record["yPx"]);
  if (xPx === null || yPx === null) return null;
  return { xPx, yPx };
}

export function safeImageRect(value: unknown): RepairImageRect | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const xPx = safeNumber(record["xPx"]);
  const yPx = safeNumber(record["yPx"]);
  const widthPx = safeNumber(record["widthPx"]);
  const heightPx = safeNumber(record["heightPx"]);
  if (xPx === null || yPx === null || widthPx === null || heightPx === null) return null;
  return {
    xPx,
    yPx,
    widthPx: Math.max(1, widthPx),
    heightPx: Math.max(1, heightPx),
  };
}

export function safeOverlayEntityRef(value: unknown): RepairOverlayEntityRef | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const kind = safeString(record["kind"]);
  const id = safeString(record["id"]);
  if (kind === null || id === null || !OVERLAY_ENTITY_KINDS.has(kind)) return null;
  return { kind: kind as RepairOverlayEntityRef["kind"], id };
}

export function safeOverlayEntityRefs(value: unknown): RepairOverlayEntityRef[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .map(safeOverlayEntityRef)
    .filter((ref): ref is RepairOverlayEntityRef => ref !== null);
}

export function isInvestigationRegionStatus(
  value: unknown
): value is RepairInvestigationRegionStatus {
  return typeof value === "string" && INVESTIGATION_REGION_STATUSES.has(value);
}

export function isWorkbenchTool(value: unknown): value is RepairWorkbenchTool {
  return typeof value === "string" && REPAIR_TOOLS.has(value);
}

export function isAnnotationTool(value: unknown): value is RepairWorkbenchDrawTool {
  return typeof value === "string" && ANNOTATION_TOOLS.has(value);
}

export function isAiMarkLifecycleState(value: unknown): value is RepairAiMarkLifecycleState {
  return typeof value === "string" && AI_MARK_LIFECYCLE_STATES.has(value);
}

export function isPanelId(value: unknown): value is RepairPanelId {
  return typeof value === "string" && PANEL_IDS.has(value);
}

export function isInstrumentKind(value: unknown): value is RepairInstrumentKind {
  return typeof value === "string" && INSTRUMENT_KINDS.has(value);
}

export function isOperatorProfileTab(value: unknown): value is RepairOperatorProfileTabId {
  return typeof value === "string" && OPERATOR_PROFILE_TABS.has(value);
}

export function isOperationalProfile(value: unknown): value is RepairOperationalProfile {
  return typeof value === "string" && OPERATIONAL_PROFILES.has(value);
}

export function isAmbientListeningState(value: unknown): value is RepairAmbientListeningState {
  return typeof value === "string" && AMBIENT_LISTENING_STATES.has(value);
}

export function isSpokenGuidanceMode(value: unknown): value is RepairSpokenGuidanceMode {
  return typeof value === "string" && SPOKEN_GUIDANCE_MODES.has(value);
}

export function isDictationRoute(
  value: unknown
): value is RepairInteractionSettingsState["dictationRoute"] {
  return typeof value === "string" && DICTATION_ROUTES.has(value);
}

export function isTtsRoute(value: unknown): value is RepairInteractionSettingsState["ttsRoute"] {
  return typeof value === "string" && TTS_ROUTES.has(value);
}

export function isCameraFeedPreference(
  value: unknown
): value is RepairInteractionSettingsState["cameraFeedPreference"] {
  return typeof value === "string" && CAMERA_FEED_PREFERENCES.has(value);
}

export function isDictationSubmitMode(
  value: unknown
): value is RepairInteractionSettingsState["dictationSubmitMode"] {
  return typeof value === "string" && DICTATION_SUBMIT_MODES.has(value);
}

export function isSettingsOverlayTab(value: unknown): value is RepairSettingsOverlayTabId {
  return typeof value === "string" && SETTINGS_OVERLAY_TABS.has(value);
}

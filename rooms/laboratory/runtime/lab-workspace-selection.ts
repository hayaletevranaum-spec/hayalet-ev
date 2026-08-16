import { asLabRecord, asNonEmptyString, asNumber, createLabEventId } from "../domain/lab-types.js";
import type {
  LabSelection,
  LabSelectionROI,
  LabSelectionType,
  LabWorkspaceUiState,
} from "../domain/lab-types.js";

const DEFAULT_IMAGE_SELECTION_ROI: LabSelectionROI = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

export function normalizeWorkspaceTimelineRange(
  startMs: number | null | undefined,
  endMs: number | null | undefined
) {
  const nextStart =
    typeof startMs === "number" && Number.isFinite(startMs)
      ? Math.max(0, Math.round(startMs))
      : null;
  const nextEnd =
    typeof endMs === "number" && Number.isFinite(endMs) ? Math.max(0, Math.round(endMs)) : null;
  if (nextStart !== null && nextEnd !== null && nextEnd <= nextStart) {
    return {
      endMs: null,
      startMs: nextStart,
    };
  }
  return {
    endMs: nextEnd,
    startMs: nextStart,
  };
}

function normalizeLabSelectionType(value: unknown): LabSelectionType {
  switch (value) {
    case "clip":
    case "focus":
    case "inspect":
      return value;
    default:
      return "unknown";
  }
}

export function normalizeLabSelectionRoi(value: unknown): LabSelectionROI | undefined {
  const record = asLabRecord(value);
  const x = asNumber(record["x"]);
  const y = asNumber(record["y"]);
  const width = asNumber(record["width"]);
  const height = asNumber(record["height"]);
  if (
    x === null ||
    y === null ||
    width === null ||
    height === null ||
    x < 0 ||
    y < 0 ||
    x >= 1 ||
    y >= 1 ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  const clampedWidth = Math.min(1 - x, width);
  const clampedHeight = Math.min(1 - y, height);
  if (clampedWidth <= 0 || clampedHeight <= 0) {
    return undefined;
  }
  return {
    x,
    y,
    width: clampedWidth,
    height: clampedHeight,
  };
}

function getSelectionSeedForRange(
  value: unknown,
  startMs: number,
  endMs: number
): Partial<LabSelection> | null {
  const record = asLabRecord(value);
  const seedRange = normalizeWorkspaceTimelineRange(
    asNumber(record["startMs"]),
    asNumber(record["endMs"])
  );
  if (seedRange.startMs !== startMs || seedRange.endMs !== endMs) {
    return null;
  }

  const id = asNonEmptyString(record["id"]);
  const label = asNonEmptyString(record["label"]) || undefined;
  const roi = normalizeLabSelectionRoi(record["roi"]);
  const createdAt = asNumber(record["createdAt"]);

  return {
    ...(id === null ? {} : { id }),
    type: normalizeLabSelectionType(record["type"]),
    ...(label === undefined ? {} : { label }),
    ...(roi === undefined ? {} : { roi }),
    ...(createdAt === null ? {} : { createdAt: Math.max(0, Math.round(createdAt)) }),
  };
}

function createActiveSelectionFromRange(
  startMs: number | null,
  endMs: number | null,
  previousSelection: LabSelection | null,
  options: {
    persistedSelection?: unknown;
  } = {}
): LabSelection | null {
  if (startMs === null || endMs === null || endMs <= startMs) {
    return null;
  }

  const selectionSeed = getSelectionSeedForRange(options.persistedSelection, startMs, endMs);
  const reusablePreviousSelection = isFullSourceWorkspaceSelection(previousSelection)
    ? null
    : previousSelection;
  const nextType = reusablePreviousSelection?.type || selectionSeed?.type || "clip";
  const nextLabel = reusablePreviousSelection?.label ?? selectionSeed?.label;
  const previousSelectionMatchesRange =
    reusablePreviousSelection?.startMs === startMs && reusablePreviousSelection?.endMs === endMs;
  const nextRoi = previousSelectionMatchesRange
    ? reusablePreviousSelection?.roi
    : selectionSeed?.roi;

  return {
    id: reusablePreviousSelection?.id || selectionSeed?.id || createLabEventId("selection"),
    startMs,
    endMs,
    type: nextType === "unknown" ? "clip" : nextType,
    ...(nextLabel === undefined ? {} : { label: nextLabel }),
    ...(nextRoi === undefined ? {} : { roi: nextRoi }),
    createdAt:
      reusablePreviousSelection?.createdAt || selectionSeed?.createdAt || Math.max(0, Date.now()),
  };
}

export function syncWorkspaceSelectionWithRange(
  workspace: LabWorkspaceUiState,
  range: { startMs: number | null; endMs: number | null },
  options: {
    persistedSelection?: unknown;
  } = {}
): LabWorkspaceUiState {
  const activeSelection = createActiveSelectionFromRange(
    range.startMs,
    range.endMs,
    workspace.activeSelection,
    options
  );
  return {
    ...workspace,
    timelineStartMs: range.startMs,
    timelineEndMs: range.endMs,
    activeSelection,
    selectionLoopEnabled: activeSelection === null ? false : workspace.selectionLoopEnabled,
    selectionMicroZoomOpen: activeSelection === null ? false : workspace.selectionMicroZoomOpen,
  };
}

function createDefaultWorkspaceSelectionForSource(options: {
  durationMs: number;
  sourceKind: string;
}): LabSelection | null {
  if (options.sourceKind === "image") {
    return {
      id: "selection-default:full-image",
      startMs: 0,
      endMs: 1,
      type: "inspect",
      roi: { ...DEFAULT_IMAGE_SELECTION_ROI },
      createdAt: 0,
    };
  }

  if (options.sourceKind !== "audio" && options.sourceKind !== "video") {
    return null;
  }

  const durationMs = Math.max(0, Math.round(options.durationMs));
  if (durationMs <= 0) {
    return null;
  }

  return {
    id: `selection-default:full-${options.sourceKind}`,
    startMs: 0,
    endMs: durationMs,
    type: "clip",
    createdAt: 0,
  };
}

export function isFullSourceWorkspaceSelection(selection: LabSelection | null | undefined) {
  return (
    selection !== null &&
    selection !== undefined &&
    typeof selection.id === "string" &&
    selection.id.startsWith("selection-default:full-")
  );
}

export function createFullSourceWorkspaceSelectionForRoi(
  roi: LabSelectionROI,
  options: {
    durationMs: number;
    sourceKind: string;
  }
): LabSelection | null {
  if (options.sourceKind !== "video") {
    return null;
  }
  const durationMs =
    typeof options.durationMs === "number" && Number.isFinite(options.durationMs)
      ? Math.max(1, Math.round(options.durationMs))
      : 1;
  return {
    id: "selection-default:full-video",
    startMs: 0,
    endMs: durationMs,
    type: "inspect",
    roi,
    createdAt: Math.max(0, Date.now()),
  };
}

export function resolveEffectiveWorkspaceSelection(
  activeSelection: LabSelection | null,
  options: {
    durationMs: number;
    sourceKind: string;
  }
): LabSelection | null {
  if (activeSelection !== null && activeSelection.endMs > activeSelection.startMs) {
    return activeSelection;
  }
  return createDefaultWorkspaceSelectionForSource(options);
}

export function getWorkspaceSourceSelectionResetKey(source: Record<string, unknown> | null) {
  const sourceRecord = asLabRecord(source);
  return JSON.stringify({
    kind: asNonEmptyString(sourceRecord["kind"]),
    mode: asNonEmptyString(sourceRecord["mode"]),
    storedPath: asNonEmptyString(sourceRecord["storedPath"]),
    sourceAssetId: asNonEmptyString(sourceRecord["sourceAssetId"]),
    sourceUrl: asNonEmptyString(sourceRecord["sourceUrl"]),
    storedFileName: asNonEmptyString(sourceRecord["storedFileName"]),
  });
}

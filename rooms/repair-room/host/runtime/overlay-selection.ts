import type {
  RepairEvent,
  RepairImagePoint,
  RepairImageRect,
  RepairKnowledgeSpatialRef,
  RepairOverlayEntityRef,
  RepairSession,
} from "../../shared/types/index.js";
import type { RepairRuntimeState } from "../state/repair-runtime-state.js";
import { createRepairUiSnapshotMeta } from "../state/repair-selectors.js";
import { uniqueStringList } from "./guards.js";

export function clampWorkbenchPan(
  panXPx: number,
  panYPx: number,
  zoom: number,
  session: RepairSession | null
): { panXPx: number; panYPx: number } {
  const image = session?.pcbImage ?? null;
  const maxX = image === null ? 2000 : Math.max(0, image.widthPx * Math.max(0, zoom - 1));
  const maxY = image === null ? 1200 : Math.max(0, image.heightPx * Math.max(0, zoom - 1));
  return {
    panXPx: Math.max(-maxX, Math.min(maxX, panXPx)),
    panYPx: Math.max(-maxY, Math.min(maxY, panYPx)),
  };
}

function getRegionFromKnowledgeSpatialRef(
  spatialRef: RepairKnowledgeSpatialRef
): RepairImageRect | null {
  if (spatialRef.region !== null && spatialRef.region !== undefined) return spatialRef.region;
  if (spatialRef.point !== null && spatialRef.point !== undefined) {
    return {
      xPx: Math.max(0, spatialRef.point.xPx - 24),
      yPx: Math.max(0, spatialRef.point.yPx - 24),
      widthPx: 48,
      heightPx: 48,
    };
  }
  return null;
}

export function findKnowledgeSpatialRegion(
  session: RepairSession,
  spatialRefId: string
): { id: string; label: string; region: RepairImageRect; linkedEventIds: string[] } | null {
  const pack = session.knowledgePack;
  if (pack === null) return null;

  for (const failure of pack.commonFailures) {
    if (
      failure.id !== spatialRefId ||
      failure.spatialRef === null ||
      failure.spatialRef === undefined
    ) {
      continue;
    }
    const region = getRegionFromKnowledgeSpatialRef(failure.spatialRef);
    if (region !== null) {
      return {
        id: failure.id,
        label: failure.label,
        region,
        linkedEventIds:
          failure.spatialRef.linkedSnapshotId === null ||
          failure.spatialRef.linkedSnapshotId === undefined
            ? []
            : [failure.spatialRef.linkedSnapshotId],
      };
    }
  }

  for (const point of pack.testPoints) {
    if (point.id !== spatialRefId) continue;
    const region =
      point.spatialRef === null || point.spatialRef === undefined
        ? point.pinAt === null
          ? null
          : {
              xPx: Math.max(0, point.pinAt.xPx - 24),
              yPx: Math.max(0, point.pinAt.yPx - 24),
              widthPx: 48,
              heightPx: 48,
            }
        : getRegionFromKnowledgeSpatialRef(point.spatialRef);
    if (region !== null) {
      return {
        id: point.id,
        label: point.label,
        region,
        linkedEventIds:
          point.spatialRef?.linkedSnapshotId === null ||
          point.spatialRef?.linkedSnapshotId === undefined
            ? []
            : [point.spatialRef.linkedSnapshotId],
      };
    }
  }

  for (const resource of pack.resources) {
    const spatialRefs = resource.spatialRefs ?? [];
    for (let index = 0; index < spatialRefs.length; index += 1) {
      const spatialRef = spatialRefs[index];
      const id = `${resource.id}:spatial-${index}`;
      if (spatialRef === undefined || id !== spatialRefId) continue;
      const region = getRegionFromKnowledgeSpatialRef(spatialRef);
      if (region !== null) {
        return {
          id,
          label: spatialRef.label,
          region,
          linkedEventIds:
            spatialRef.linkedSnapshotId === null || spatialRef.linkedSnapshotId === undefined
              ? []
              : [spatialRef.linkedSnapshotId],
        };
      }
    }
  }

  return null;
}

export function collectKnowledgePromotionLinkage(
  state: RepairRuntimeState,
  session: RepairSession,
  spatialRefId: string,
  fallbackLinkedEventIds: string[]
): {
  linkedEventIds: string[];
  measurementEventIds: string[];
  annotationEventIds: string[];
  aiMarkEventIds: string[];
} {
  const projectedKnowledge = createRepairUiSnapshotMeta(state).replay.knowledgeRegions.find(
    (entry) => entry.id === spatialRefId
  );
  const measurementEventIds = uniqueStringList(projectedKnowledge?.relatedMeasurementIds ?? []);
  const aiMarkEventIds = uniqueStringList(projectedKnowledge?.relatedAiMarkIds ?? []);
  const linkedEventIds = uniqueStringList([
    ...fallbackLinkedEventIds,
    ...(projectedKnowledge?.linkedEventIds ?? []),
    ...measurementEventIds,
    ...aiMarkEventIds,
  ]);
  const relatedEventIds = new Set([...linkedEventIds, ...measurementEventIds, ...aiMarkEventIds]);
  const annotationEventIds = new Set<string>();

  session.events.forEach((event) => {
    if (event.kind === "measurement" && measurementEventIds.includes(event.id)) {
      event.linkedAnnotationIds?.forEach((id) => annotationEventIds.add(id));
      return;
    }

    if (
      (event.kind === "ai-mark" || event.kind === "risk-flag") &&
      aiMarkEventIds.includes(event.id)
    ) {
      event.linkedAnnotationIds?.forEach((id) => annotationEventIds.add(id));
      return;
    }

    if (event.kind !== "annotation") return;
    const metaLinkedMeasurementIds = event.meta?.linkedMeasurementIds ?? [];
    const metaLinkedEventIds = event.meta?.linkedEventIds ?? [];
    if (
      event.linkedEventIds.some((id) => relatedEventIds.has(id)) ||
      metaLinkedMeasurementIds.some((id) => measurementEventIds.includes(id)) ||
      metaLinkedEventIds.some((id) => relatedEventIds.has(id))
    ) {
      annotationEventIds.add(event.id);
    }
  });

  const normalizedAnnotationEventIds = uniqueStringList(
    [...annotationEventIds].filter((id) =>
      session.events.some((event) => event.id === id && event.kind === "annotation")
    )
  );

  return {
    linkedEventIds: uniqueStringList([...linkedEventIds, ...normalizedAnnotationEventIds]),
    measurementEventIds,
    annotationEventIds: normalizedAnnotationEventIds,
    aiMarkEventIds,
  };
}

export function getEventIdFromOverlayRef(ref: RepairOverlayEntityRef | null): string | null {
  return ref?.kind === "event" ? ref.id : null;
}

export function refsEqual(left: RepairOverlayEntityRef, right: RepairOverlayEntityRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

export function dedupeOverlayRefs(refs: RepairOverlayEntityRef[]): RepairOverlayEntityRef[] {
  const seen = new Set<string>();
  const next: RepairOverlayEntityRef[] = [];
  refs.forEach((ref) => {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    next.push(ref);
  });
  return next;
}

export function clampSessionPoint(
  session: RepairSession,
  point: RepairImagePoint
): RepairImagePoint {
  const image = session.pcbImage;
  return {
    xPx: Math.max(0, Math.min(image?.widthPx ?? 1600, point.xPx)),
    yPx: Math.max(0, Math.min(image?.heightPx ?? 900, point.yPx)),
  };
}

export function moveSessionRect(
  session: RepairSession,
  rect: RepairImageRect,
  delta: RepairImagePoint
): RepairImageRect {
  const image = session.pcbImage;
  const maxX = Math.max(0, (image?.widthPx ?? 1600) - rect.widthPx);
  const maxY = Math.max(0, (image?.heightPx ?? 900) - rect.heightPx);
  return {
    ...rect,
    xPx: Math.max(0, Math.min(maxX, rect.xPx + delta.xPx)),
    yPx: Math.max(0, Math.min(maxY, rect.yPx + delta.yPx)),
  };
}

export function getEventNudgeCenter(event: RepairEvent): RepairImagePoint | null {
  if (event.kind === "measurement" && event.pinAt !== null) return event.pinAt;
  if (event.kind === "annotation") {
    if (event.point !== null) return event.point;
    if (event.region !== null) {
      return {
        xPx: event.region.xPx + event.region.widthPx / 2,
        yPx: event.region.yPx + event.region.heightPx / 2,
      };
    }
  }
  if ((event.kind === "ai-mark" || event.kind === "risk-flag") && event.region !== null) {
    return {
      xPx: event.region.xPx + event.region.widthPx / 2,
      yPx: event.region.yPx + event.region.heightPx / 2,
    };
  }
  return null;
}

export function getNudgeTargetDelta(params: {
  center: RepairImagePoint;
  requestedDelta: RepairImagePoint;
  hardSnap: boolean;
  selectedKeys: Set<string>;
  snapTargets: Array<{ key: string; point: RepairImagePoint }>;
}): RepairImagePoint {
  if (!params.hardSnap) return params.requestedDelta;
  const moved = {
    xPx: params.center.xPx + params.requestedDelta.xPx,
    yPx: params.center.yPx + params.requestedDelta.yPx,
  };
  const snap = params.snapTargets.reduce<{
    point: RepairImagePoint;
    distancePx: number;
  } | null>((best, target) => {
    if (params.selectedKeys.has(target.key)) return best;
    const distancePx = Math.hypot(moved.xPx - target.point.xPx, moved.yPx - target.point.yPx);
    if (distancePx > 14 || (best !== null && best.distancePx <= distancePx)) return best;
    return { point: target.point, distancePx };
  }, null);
  if (snap === null) return params.requestedDelta;
  return {
    xPx: params.requestedDelta.xPx + snap.point.xPx - moved.xPx,
    yPx: params.requestedDelta.yPx + snap.point.yPx - moved.yPx,
  };
}

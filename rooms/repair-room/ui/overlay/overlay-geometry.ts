import type {
  RepairImagePoint,
  RepairImageRect,
  RepairOverlayEntityRef,
} from "../../shared/types/index.js";

export interface RepairSelectableOverlayEntity {
  ref: RepairOverlayEntityRef;
  rect: RepairImageRect;
}

export interface RepairSnapAssistResult {
  target: RepairImagePoint;
  distancePx: number;
  softGuide: boolean;
  hardSnap: boolean;
}

export function normalizeRepairImageRect(rect: RepairImageRect): RepairImageRect {
  const x2 = rect.xPx + rect.widthPx;
  const y2 = rect.yPx + rect.heightPx;
  const xPx = Math.min(rect.xPx, x2);
  const yPx = Math.min(rect.yPx, y2);
  return {
    xPx,
    yPx,
    widthPx: Math.abs(rect.widthPx),
    heightPx: Math.abs(rect.heightPx),
  };
}

export function repairImageRectsIntersect(left: RepairImageRect, right: RepairImageRect): boolean {
  const a = normalizeRepairImageRect(left);
  const b = normalizeRepairImageRect(right);
  return (
    b.xPx <= a.xPx + a.widthPx &&
    b.xPx + b.widthPx >= a.xPx &&
    b.yPx <= a.yPx + a.heightPx &&
    b.yPx + b.heightPx >= a.yPx
  );
}

export function getRepairMarqueeSelection(
  marquee: RepairImageRect,
  entities: RepairSelectableOverlayEntity[]
): RepairOverlayEntityRef[] {
  const normalized = normalizeRepairImageRect(marquee);
  return entities
    .filter((entity) => repairImageRectsIntersect(normalized, entity.rect))
    .map((entity) => entity.ref);
}

export function repairOverlayRefsEqual(
  left: RepairOverlayEntityRef,
  right: RepairOverlayEntityRef
): boolean {
  return left.kind === right.kind && left.id === right.id;
}

export function applyRepairOverlaySelectionMode(
  current: RepairOverlayEntityRef[],
  incoming: RepairOverlayEntityRef[],
  mode: "replace" | "add" | "toggle"
): RepairOverlayEntityRef[] {
  const next =
    mode === "add"
      ? [...current, ...incoming]
      : mode === "toggle"
        ? incoming.reduce<RepairOverlayEntityRef[]>((selection, ref) => {
            return selection.some((candidate) => repairOverlayRefsEqual(candidate, ref))
              ? selection.filter((candidate) => !repairOverlayRefsEqual(candidate, ref))
              : [...selection, ref];
          }, current)
        : incoming;
  const seen = new Set<string>();
  return next.filter((ref) => {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getRepairSnapAssist(
  point: RepairImagePoint,
  targets: RepairImagePoint[],
  softThresholdPx: number,
  hardThresholdPx: number,
  hardSnapRequested: boolean
): RepairSnapAssistResult | null {
  const closest = targets.reduce<RepairSnapAssistResult | null>((best, target) => {
    const distancePx = Math.hypot(point.xPx - target.xPx, point.yPx - target.yPx);
    if (best !== null && best.distancePx <= distancePx) return best;
    return {
      target,
      distancePx,
      softGuide: distancePx <= softThresholdPx,
      hardSnap: hardSnapRequested && distancePx <= hardThresholdPx,
    };
  }, null);
  return closest !== null && closest.softGuide ? closest : null;
}

export function getRepairFocusFrame(
  region: RepairImageRect,
  imageWidthPx: number,
  imageHeightPx: number,
  paddingPx: number
): RepairImageRect {
  const normalized = normalizeRepairImageRect(region);
  const xPx = Math.max(0, normalized.xPx - paddingPx);
  const yPx = Math.max(0, normalized.yPx - paddingPx);
  const rightPx = Math.min(imageWidthPx, normalized.xPx + normalized.widthPx + paddingPx);
  const bottomPx = Math.min(imageHeightPx, normalized.yPx + normalized.heightPx + paddingPx);
  return {
    xPx,
    yPx,
    widthPx: Math.max(1, rightPx - xPx),
    heightPx: Math.max(1, bottomPx - yPx),
  };
}

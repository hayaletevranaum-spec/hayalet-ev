import type { RepairWorkbenchViewport } from "../../shared/types/index.js";

export interface RepairSpatialFocusTween {
  cancel: () => void;
}

function easeOutPower2(progress: number): number {
  const remaining = 1 - progress;
  return 1 - remaining * remaining;
}

function interpolateWorkbenchViewport(
  from: RepairWorkbenchViewport,
  to: RepairWorkbenchViewport,
  progress: number
): RepairWorkbenchViewport {
  return {
    zoom: from.zoom + (to.zoom - from.zoom) * progress,
    panXPx: from.panXPx + (to.panXPx - from.panXPx) * progress,
    panYPx: from.panYPx + (to.panYPx - from.panYPx) * progress,
  };
}

export function createSpatialFocusTween({
  durationMs,
  from,
  onComplete,
  onUpdate,
  to,
}: {
  durationMs: number;
  from: RepairWorkbenchViewport;
  onComplete: () => void;
  onUpdate: (viewport: RepairWorkbenchViewport) => void;
  to: RepairWorkbenchViewport;
}): RepairSpatialFocusTween {
  let frameId: number | null = null;
  let startedAt: number | null = null;
  let cancelled = false;

  function tick(now: number): void {
    if (cancelled) return;
    startedAt ??= now;
    const elapsedMs = now - startedAt;
    const progress = Math.min(1, elapsedMs / durationMs);
    onUpdate(interpolateWorkbenchViewport(from, to, easeOutPower2(progress)));

    if (progress < 1) {
      frameId = window.requestAnimationFrame(tick);
      return;
    }

    frameId = null;
    onComplete();
  }

  frameId = window.requestAnimationFrame(tick);

  return {
    cancel() {
      cancelled = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
    },
  };
}

import type {
  RepairImagePoint,
  RepairImageRect,
  RepairWorkbenchViewport,
} from "../../shared/types/index.js";

export interface RepairImageFrame {
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
  scale: number;
}

export interface RepairStagePoint {
  xPx: number;
  yPx: number;
}

export interface RepairStageRect extends RepairStagePoint {
  widthPx: number;
  heightPx: number;
}

export function getContainedImageFrame(
  containerWidthPx: number,
  containerHeightPx: number,
  imageWidthPx: number,
  imageHeightPx: number
): RepairImageFrame {
  const safeImageWidth = Math.max(1, imageWidthPx);
  const safeImageHeight = Math.max(1, imageHeightPx);
  const safeContainerWidth = Math.max(1, containerWidthPx);
  const safeContainerHeight = Math.max(1, containerHeightPx);
  const scale = Math.min(
    safeContainerWidth / safeImageWidth,
    safeContainerHeight / safeImageHeight
  );
  const widthPx = safeImageWidth * scale;
  const heightPx = safeImageHeight * scale;
  return {
    leftPx: (safeContainerWidth - widthPx) / 2,
    topPx: (safeContainerHeight - heightPx) / 2,
    widthPx,
    heightPx,
    scale,
  };
}

export function imagePointToStagePoint(
  point: RepairImagePoint,
  frame: RepairImageFrame,
  viewport: RepairWorkbenchViewport
): RepairStagePoint {
  return {
    xPx: frame.leftPx + point.xPx * frame.scale * viewport.zoom + viewport.panXPx,
    yPx: frame.topPx + point.yPx * frame.scale * viewport.zoom + viewport.panYPx,
  };
}

export function stagePointToImagePoint(
  point: RepairStagePoint,
  frame: RepairImageFrame,
  viewport: RepairWorkbenchViewport
): RepairImagePoint {
  const safeZoom = Math.max(0.01, viewport.zoom);
  return {
    xPx: (point.xPx - frame.leftPx - viewport.panXPx) / (frame.scale * safeZoom),
    yPx: (point.yPx - frame.topPx - viewport.panYPx) / (frame.scale * safeZoom),
  };
}

export function imageRectToStageRect(
  rect: RepairImageRect,
  frame: RepairImageFrame,
  viewport: RepairWorkbenchViewport
): RepairStageRect {
  const point = imagePointToStagePoint({ xPx: rect.xPx, yPx: rect.yPx }, frame, viewport);
  return {
    ...point,
    widthPx: rect.widthPx * frame.scale * viewport.zoom,
    heightPx: rect.heightPx * frame.scale * viewport.zoom,
  };
}

export function clampImagePoint(
  point: RepairImagePoint,
  imageWidthPx: number,
  imageHeightPx: number
): RepairImagePoint {
  return {
    xPx: Math.min(Math.max(0, point.xPx), imageWidthPx),
    yPx: Math.min(Math.max(0, point.yPx), imageHeightPx),
  };
}

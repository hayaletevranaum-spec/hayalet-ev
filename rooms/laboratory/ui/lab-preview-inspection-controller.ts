import { asNonEmptyString, createLabEventId } from "../domain/lab-types.js";
import type {
  LabInspectionSnapshot,
  LabSelection,
  LabSelectionROI,
  LabStoreEvent,
} from "../domain/lab-types.js";

const MIN_SELECTION_ROI_SIZE_PX = 8;
const FALLBACK_FRAME_DURATION_SECONDS = 1 / 30;

type QueryCapableElement = Element & {
  getAttribute: (name: string) => string | null;
  getBoundingClientRect: () =>
    DOMRect | { height: number; left: number; top: number; width: number };
  querySelector: (selector: string) => Element | null;
  setAttribute: (name: string, value: string) => void;
  style?: CSSStyleDeclaration;
};

type PreviewInspectionControllerDeps = {
  documentRef: Pick<Document, "createElement" | "querySelector">;
  emit: (event: LabStoreEvent) => void;
  getActiveSelection: () => LabSelection | null;
  getActiveSnapshot: () => LabInspectionSnapshot | null;
  getRoiFocusActive: () => boolean;
  windowRef: Window & {
    URL?: {
      createObjectURL?: (blob: Blob) => string;
      revokeObjectURL?: (url: string) => void;
    };
  };
};

type FocusTransform = {
  scale: number;
  translateX: number;
  translateY: number;
};

type CropRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type VideoSnapshotSource = HTMLVideoElement & {
  currentTime: number;
  duration: number;
  pause: () => void;
  paused: boolean;
  videoHeight: number;
  videoWidth: number;
};

type ImageSnapshotSource = HTMLImageElement & {
  naturalHeight: number;
  naturalWidth: number;
};

type MediaSnapshotSource = VideoSnapshotSource | ImageSnapshotSource;

function isQueryCapableElement(value: unknown): value is QueryCapableElement {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as QueryCapableElement).querySelector === "function" &&
    typeof (value as QueryCapableElement).getAttribute === "function" &&
    typeof (value as QueryCapableElement).getBoundingClientRect === "function"
  );
}

function isVideoSnapshotSource(value: unknown): value is VideoSnapshotSource {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { pause?: unknown }).pause === "function" &&
    typeof (value as { currentTime?: unknown }).currentTime === "number" &&
    typeof (value as { videoWidth?: unknown }).videoWidth === "number"
  );
}

function isImageSnapshotSource(value: unknown): value is ImageSnapshotSource {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { naturalWidth?: unknown }).naturalWidth === "number" &&
    typeof (value as { naturalHeight?: unknown }).naturalHeight === "number"
  );
}

function isCanvasLike(value: unknown): value is HTMLCanvasElement {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { getContext?: unknown }).getContext === "function"
  );
}

function getStageRect(stage: QueryCapableElement) {
  const rect = stage.getBoundingClientRect();
  return {
    height: Math.max(0, rect.height),
    left: rect.left,
    top: rect.top,
    width: Math.max(0, rect.width),
  };
}

function meetsSelectionRoiSizeGuard(
  stageRect: { height: number; width: number },
  roi: LabSelectionROI
) {
  return (
    roi.width * stageRect.width >= MIN_SELECTION_ROI_SIZE_PX &&
    roi.height * stageRect.height >= MIN_SELECTION_ROI_SIZE_PX
  );
}

function computeFocusTransform(
  stageRect: { height: number; width: number },
  roi: LabSelectionROI
): FocusTransform | null {
  if (stageRect.width <= 0 || stageRect.height <= 0) {
    return null;
  }
  if (!meetsSelectionRoiSizeGuard(stageRect, roi)) {
    return null;
  }
  const roiWidthPx = roi.width * stageRect.width;
  const roiHeightPx = roi.height * stageRect.height;
  const scale = Math.min(stageRect.width / roiWidthPx, stageRect.height / roiHeightPx);
  const roiCenterX = (roi.x + roi.width / 2) * stageRect.width;
  const roiCenterY = (roi.y + roi.height / 2) * stageRect.height;
  return {
    scale,
    translateX: stageRect.width / 2 - roiCenterX * scale,
    translateY: stageRect.height / 2 - roiCenterY * scale,
  };
}

function computeSnapshotCropRect(
  roi: LabSelectionROI,
  sourceWidth: number,
  sourceHeight: number
): CropRect | null {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return null;
  }
  const left = Math.max(0, Math.min(sourceWidth - 1, Math.round(roi.x * sourceWidth)));
  const top = Math.max(0, Math.min(sourceHeight - 1, Math.round(roi.y * sourceHeight)));
  const width = Math.max(1, Math.round(roi.width * sourceWidth));
  const height = Math.max(1, Math.round(roi.height * sourceHeight));
  const clampedWidth = Math.min(sourceWidth - left, width);
  const clampedHeight = Math.min(sourceHeight - top, height);
  if (clampedWidth <= 0 || clampedHeight <= 0) {
    return null;
  }
  return {
    height: clampedHeight,
    left,
    top,
    width: clampedWidth,
  };
}

function getFocusableSelectionRoi(selection: LabSelection | null) {
  if (selection === null || selection.endMs <= selection.startMs || selection.roi === undefined) {
    return null;
  }
  return selection.roi;
}

async function canvasToPreviewUrl(
  canvas: HTMLCanvasElement,
  windowRef: PreviewInspectionControllerDeps["windowRef"]
) {
  const createObjectUrl =
    typeof windowRef.URL?.createObjectURL === "function"
      ? windowRef.URL.createObjectURL.bind(windowRef.URL)
      : null;
  if (createObjectUrl !== null && typeof canvas.toBlob === "function") {
    const blob = await new Promise<Blob | null>(function (resolve) {
      canvas.toBlob(function (value) {
        resolve(value);
      }, "image/png");
    });
    if (blob !== null) {
      return createObjectUrl(blob);
    }
  }
  if (typeof canvas.toDataURL === "function") {
    return canvas.toDataURL("image/png");
  }
  return null;
}

function inferFrameDurationSeconds(videoElement: HTMLVideoElement) {
  const withPlaybackQuality = videoElement as HTMLVideoElement & {
    getVideoPlaybackQuality?: () => { totalVideoFrames?: number };
  };
  const getPlaybackQuality = withPlaybackQuality.getVideoPlaybackQuality;
  const totalFrames =
    typeof getPlaybackQuality === "function"
      ? (getPlaybackQuality.call(withPlaybackQuality).totalVideoFrames ?? 0)
      : 0;
  if (totalFrames > 1 && videoElement.currentTime > 0) {
    const inferredFps = totalFrames / videoElement.currentTime;
    if (Number.isFinite(inferredFps) && inferredFps >= 12 && inferredFps <= 240) {
      return 1 / inferredFps;
    }
  }
  return FALLBACK_FRAME_DURATION_SECONDS;
}

export const __testOnlyLabPreviewInspectionController = {
  computeFocusTransform,
  computeSnapshotCropRect,
};

export function createLabPreviewInspectionController(deps: PreviewInspectionControllerDeps) {
  let lastInspectionTopologyKey: string | null = null;
  let lastSnapshotUrl: string | null = null;
  let lastFocusedContent: QueryCapableElement | null = null;
  let lastFocusedStage: QueryCapableElement | null = null;

  function getInspectionStage() {
    const stage = deps.documentRef.querySelector("[data-lab-preview-inspection-stage='true']");
    return isQueryCapableElement(stage) ? stage : null;
  }

  function getInspectionContent(stage: QueryCapableElement | null) {
    if (stage === null) {
      return null;
    }
    const content = stage.querySelector("[data-lab-preview-inspection-content='true']");
    return isQueryCapableElement(content) ? content : null;
  }

  function getInspectionMedia(stage: QueryCapableElement | null): MediaSnapshotSource | null {
    if (stage === null) {
      return null;
    }
    const media = stage.querySelector(
      "video[data-lab-preserve-media], img[data-lab-preserve-media]"
    );
    if (isVideoSnapshotSource(media) || isImageSnapshotSource(media)) {
      return media;
    }
    return null;
  }

  function readInspectionTopologyKey(
    stage: QueryCapableElement | null,
    media: MediaSnapshotSource | null
  ) {
    if (stage === null) {
      return "none";
    }
    const stageKey =
      asNonEmptyString(stage.getAttribute("data-lab-preview-inspection-topology")) || "visual";
    const mediaSource =
      isVideoSnapshotSource(media) || isImageSnapshotSource(media)
        ? asNonEmptyString((media as HTMLMediaElement & { currentSrc?: string }).currentSrc) ||
          asNonEmptyString((media as HTMLMediaElement).getAttribute("src")) ||
          "local"
        : "no-media";
    return `${stageKey}:${mediaSource}`;
  }

  function clearFocusTransform() {
    if (lastFocusedContent?.style) {
      lastFocusedContent.style.transform = "";
      lastFocusedContent.style.transformOrigin = "";
    }
    if (lastFocusedStage) {
      lastFocusedStage.setAttribute("data-lab-roi-focus-active", "false");
    }
    lastFocusedContent = null;
    lastFocusedStage = null;
  }

  function syncSnapshotUrl(snapshot: LabInspectionSnapshot | null) {
    const nextUrl = snapshot?.objectUrl ?? null;
    if (
      lastSnapshotUrl !== null &&
      lastSnapshotUrl !== nextUrl &&
      lastSnapshotUrl.startsWith("blob:")
    ) {
      try {
        deps.windowRef.URL?.revokeObjectURL?.(lastSnapshotUrl);
      } catch {
        // Blob URLs can already be revoked during fast UI churn.
      }
    }
    lastSnapshotUrl = nextUrl;
  }

  function setFocusActive(active: boolean) {
    const selectionRoi = getFocusableSelectionRoi(deps.getActiveSelection());
    if (active !== true || selectionRoi === null) {
      deps.emit({
        type: "selection-roi-focus-cleared",
      });
      return false;
    }
    const stage = getInspectionStage();
    const content = getInspectionContent(stage);
    const transform =
      stage !== null && content !== null
        ? computeFocusTransform(getStageRect(stage), selectionRoi)
        : null;
    if (stage === null || content === null || transform === null) {
      return false;
    }
    deps.emit({
      type: "selection-roi-focus-set",
      active: true,
    });
    return true;
  }

  function clearFocus() {
    if (deps.getRoiFocusActive() !== true) {
      return false;
    }
    deps.emit({
      type: "selection-roi-focus-cleared",
    });
    return true;
  }

  function clearSnapshot() {
    if (deps.getActiveSnapshot() === null) {
      return false;
    }
    deps.emit({
      type: "selection-roi-snapshot-cleared",
    });
    return true;
  }

  async function captureSnapshot() {
    const selectionRoi = getFocusableSelectionRoi(deps.getActiveSelection());
    const stage = getInspectionStage();
    const media = getInspectionMedia(stage);
    if (selectionRoi === null || media === null) {
      return false;
    }
    if (stage === null || !meetsSelectionRoiSizeGuard(getStageRect(stage), selectionRoi)) {
      return false;
    }
    let sourceWidth: number;
    let sourceHeight: number;
    let snapshotSourceKind: "image" | "video" = "image";
    let snapshotTimeMs: number | null = null;
    if (isVideoSnapshotSource(media)) {
      sourceWidth = media.videoWidth;
      sourceHeight = media.videoHeight;
      snapshotSourceKind = "video";
      snapshotTimeMs = Math.max(0, Math.round(media.currentTime * 1000));
    } else {
      sourceWidth = media.naturalWidth;
      sourceHeight = media.naturalHeight;
    }
    const crop = computeSnapshotCropRect(selectionRoi, sourceWidth, sourceHeight);
    if (crop === null) {
      return false;
    }
    const canvas = deps.documentRef.createElement("canvas");
    if (!isCanvasLike(canvas)) {
      return false;
    }
    canvas.width = crop.width;
    canvas.height = crop.height;
    const context = canvas.getContext("2d");
    if (context === null) {
      return false;
    }
    context.drawImage(
      media,
      crop.left,
      crop.top,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height
    );
    const previewUrl = await canvasToPreviewUrl(canvas, deps.windowRef);
    if (previewUrl === null) {
      return false;
    }
    deps.emit({
      type: "selection-roi-snapshot-set",
      snapshot: {
        id: createLabEventId("roi-snapshot"),
        objectUrl: previewUrl,
        width: crop.width,
        height: crop.height,
        sourceKind: snapshotSourceKind,
        roi: selectionRoi,
        createdAt: Date.now(),
        timeMs: snapshotTimeMs,
      },
    });
    return true;
  }

  function stepFrame(direction: -1 | 1) {
    const stage = getInspectionStage();
    const media = getInspectionMedia(stage);
    if (!isVideoSnapshotSource(media)) {
      return false;
    }
    const videoElement = media;
    if (videoElement.paused !== true) {
      videoElement.pause();
    }
    const delta = inferFrameDurationSeconds(videoElement) * direction;
    const duration =
      Number.isFinite(videoElement.duration) && videoElement.duration > 0
        ? videoElement.duration
        : null;
    const nextTime = Math.max(
      0,
      duration === null
        ? videoElement.currentTime + delta
        : Math.min(duration, videoElement.currentTime + delta)
    );
    videoElement.currentTime = nextTime;
    return true;
  }

  function sync() {
    const stage = getInspectionStage();
    const content = getInspectionContent(stage);
    const media = getInspectionMedia(stage);
    const topologyKey = readInspectionTopologyKey(stage, media);
    const focusActive = deps.getRoiFocusActive();
    const snapshot = deps.getActiveSnapshot();
    const selectionRoi = getFocusableSelectionRoi(deps.getActiveSelection());

    if (lastInspectionTopologyKey !== null && lastInspectionTopologyKey !== topologyKey) {
      if (focusActive === true) {
        deps.emit({
          type: "selection-roi-focus-cleared",
        });
      }
      if (snapshot !== null) {
        deps.emit({
          type: "selection-roi-snapshot-cleared",
        });
      }
    }
    lastInspectionTopologyKey = topologyKey;
    syncSnapshotUrl(snapshot);

    if (stage === null || content === null || selectionRoi === null) {
      clearFocusTransform();
      if (focusActive === true) {
        deps.emit({
          type: "selection-roi-focus-cleared",
        });
      }
      return;
    }

    const transform = computeFocusTransform(getStageRect(stage), selectionRoi);
    if (focusActive !== true || transform === null) {
      clearFocusTransform();
      if (focusActive === true && transform === null) {
        deps.emit({
          type: "selection-roi-focus-cleared",
        });
      }
      return;
    }

    if (lastFocusedContent !== null && lastFocusedContent !== content) {
      clearFocusTransform();
    }
    if (content.style) {
      content.style.transformOrigin = "0 0";
      content.style.transform = `translate(${transform.translateX}px, ${transform.translateY}px) scale(${transform.scale})`;
    }
    stage.setAttribute("data-lab-roi-focus-active", "true");
    lastFocusedContent = content;
    lastFocusedStage = stage;
  }

  function dispose() {
    clearFocusTransform();
    syncSnapshotUrl(null);
  }

  return {
    captureSnapshot,
    clearFocus,
    clearSnapshot,
    dispose,
    setFocusActive,
    stepFrame,
    sync,
    toggleFocus() {
      return setFocusActive(deps.getRoiFocusActive() !== true);
    },
  };
}

import type {
  LabComparisonSide,
  LabInspectionMode,
  LabSelection,
  LabSelectionROI,
  LabStoreEvent,
} from "../domain/lab-types.js";
import { bindLabDocumentEvents, isClosestCapableTarget } from "./lab-dom-events.js";

const MIN_SELECTION_ROI_SIZE_PX = 8;
const SELECTION_ROI_RESIZE_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type SelectionRoiResizeHandle = (typeof SELECTION_ROI_RESIZE_HANDLES)[number];

type RectLike = {
  bottom: number;
  height: number;
  left: number;
  top: number;
  width: number;
};

type StageElement = {
  closest: (selector: string) => StageElement | null;
  getAttribute: (name: string) => string | null;
  getBoundingClientRect: () => RectLike;
  querySelector?: (selector: string) => StageElement | null;
};

type SelectionRoiBinderDeps = {
  documentRef: Pick<Document, "addEventListener" | "removeEventListener">;
  emit: (event: LabStoreEvent) => void;
  getActiveSelection: () => LabSelection | null;
  getComparisonRoi?: (side: LabComparisonSide) => LabSelectionROI | null;
  getSourceKind: () => string;
  isMutationLocked?: () => boolean;
};

type DrawDragState = {
  lastSignature: string | null;
  mode: "draw";
  stage: StageElement;
  startX: number;
  startY: number;
};

type ResizeDragState = {
  handle: SelectionRoiResizeHandle;
  initialRoi: LabSelectionROI;
  lastSignature: string | null;
  mode: "resize";
  stage: StageElement;
  startX: number;
  startY: number;
};

type DragState = DrawDragState | ResizeDragState;

type MouseLikeEvent = Event & {
  button?: number;
  clientX?: number;
  clientY?: number;
  key?: string;
  preventDefault: () => void;
  target?: EventTarget | null;
};

function getClosestTarget(target: EventTarget | null, selector: string): StageElement | null {
  if (!isClosestCapableTarget<StageElement>(target)) {
    return null;
  }
  return target.closest(selector);
}

function getReserveBottom(stage: StageElement) {
  const rawValue = Number(stage.getAttribute("data-lab-selection-roi-controls-reserve") || "0");
  return Number.isFinite(rawValue) ? Math.max(0, rawValue) : 0;
}

function clampPointToRect(event: MouseLikeEvent, rect: RectLike) {
  const rawX = typeof event.clientX === "number" ? event.clientX : rect.left;
  const rawY = typeof event.clientY === "number" ? event.clientY : rect.top;
  return {
    x: Math.max(rect.left, Math.min(rect.left + rect.width, rawX)),
    y: Math.max(rect.top, Math.min(rect.top + rect.height, rawY)),
  };
}

function clampUnit(value: number) {
  if (Number.isFinite(value) !== true) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function isSelectionRoiResizeHandle(value: string | null): value is SelectionRoiResizeHandle {
  return SELECTION_ROI_RESIZE_HANDLES.some(function (handle) {
    return handle === value;
  });
}

function getComparisonSideFromStage(stage: StageElement): LabComparisonSide | null {
  const side = stage.getAttribute("data-lab-comparison-roi-side");
  return side === "primary" || side === "reference" ? side : null;
}

function getSelectionRoiRect(stage: StageElement) {
  const mediaFrame =
    typeof stage.querySelector === "function"
      ? stage.querySelector("[data-lab-selection-roi-frame='true']")
      : null;
  return mediaFrame?.getBoundingClientRect() || stage.getBoundingClientRect();
}

function activateComparisonSide(deps: SelectionRoiBinderDeps, stage: StageElement | null) {
  if (stage === null) {
    return;
  }
  const comparisonSide = getComparisonSideFromStage(stage);
  if (comparisonSide === null) {
    return;
  }
  deps.emit({
    type: "workspace-comparison-side-activated",
    side: comparisonSide,
  });
}

function createSelectionRoiResult(roi: LabSelectionROI, rect: RectLike) {
  const x = clampUnit(roi.x);
  const y = clampUnit(roi.y);
  const width = Math.max(0, Math.min(1 - x, roi.width));
  const height = Math.max(0, Math.min(1 - y, roi.height));
  const widthPx = width * rect.width;
  const heightPx = height * rect.height;

  if (widthPx < MIN_SELECTION_ROI_SIZE_PX || heightPx < MIN_SELECTION_ROI_SIZE_PX) {
    return null;
  }

  return {
    roi: {
      x,
      y,
      width,
      height,
    } satisfies LabSelectionROI,
    signature: `${Math.round(x * 10000)}:${Math.round(y * 10000)}:${Math.round(width * 10000)}:${Math.round(height * 10000)}`,
  };
}

function createSelectionRoiFromDrag(
  stage: StageElement,
  dragState: DrawDragState,
  event: MouseLikeEvent
) {
  const rect = getSelectionRoiRect(stage);
  const currentPoint = clampPointToRect(event, rect);
  const left = Math.min(dragState.startX, currentPoint.x);
  const top = Math.min(dragState.startY, currentPoint.y);
  const widthPx = Math.abs(currentPoint.x - dragState.startX);
  const heightPx = Math.abs(currentPoint.y - dragState.startY);

  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    widthPx < MIN_SELECTION_ROI_SIZE_PX ||
    heightPx < MIN_SELECTION_ROI_SIZE_PX
  ) {
    return null;
  }

  return createSelectionRoiResult(
    {
      x: (left - rect.left) / rect.width,
      y: (top - rect.top) / rect.height,
      width: widthPx / rect.width,
      height: heightPx / rect.height,
    },
    rect
  );
}

function createSelectionRoiFromResize(
  stage: StageElement,
  dragState: ResizeDragState,
  event: MouseLikeEvent
) {
  const rect = getSelectionRoiRect(stage);
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const currentPoint = clampPointToRect(event, rect);
  const nextX = clampUnit((currentPoint.x - rect.left) / rect.width);
  const nextY = clampUnit((currentPoint.y - rect.top) / rect.height);
  const handle = dragState.handle;
  let left = clampUnit(dragState.initialRoi.x);
  let top = clampUnit(dragState.initialRoi.y);
  let right = clampUnit(dragState.initialRoi.x + dragState.initialRoi.width);
  let bottom = clampUnit(dragState.initialRoi.y + dragState.initialRoi.height);
  const minWidth = MIN_SELECTION_ROI_SIZE_PX / rect.width;
  const minHeight = MIN_SELECTION_ROI_SIZE_PX / rect.height;

  if (handle.indexOf("w") >= 0) {
    left = nextX;
  }
  if (handle.indexOf("e") >= 0) {
    right = nextX;
  }
  if (handle.indexOf("n") >= 0) {
    top = nextY;
  }
  if (handle.indexOf("s") >= 0) {
    bottom = nextY;
  }

  if (right - left < minWidth) {
    if (handle.indexOf("w") >= 0) {
      left = Math.max(0, right - minWidth);
    } else {
      right = Math.min(1, left + minWidth);
    }
  }
  if (bottom - top < minHeight) {
    if (handle.indexOf("n") >= 0) {
      top = Math.max(0, bottom - minHeight);
    } else {
      bottom = Math.min(1, top + minHeight);
    }
  }

  return createSelectionRoiResult(
    {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    },
    rect
  );
}

function canDrawSelectionRoi(activeSelection: LabSelection | null, sourceKind: string) {
  if (sourceKind === "image" || sourceKind === "video") {
    return true;
  }
  return activeSelection !== null && activeSelection.endMs > activeSelection.startMs;
}

export function bindLabSelectionRoiInteractions(deps: SelectionRoiBinderDeps) {
  let dragState: DragState | null = null;

  function isMutationLocked() {
    return deps.isMutationLocked?.() === true;
  }

  function handleClick(event: Event) {
    const target = event.target;
    const clearTrigger = getClosestTarget(target, "[data-lab-selection-roi-clear]");
    if (clearTrigger) {
      if (isMutationLocked()) {
        return;
      }
      event.preventDefault();
      const stage = getClosestTarget(target, "[data-lab-selection-roi-stage='true']");
      const comparisonSide = stage === null ? null : getComparisonSideFromStage(stage);
      deps.emit({
        type: "selection-roi-cleared",
        ...(comparisonSide === null ? {} : { comparisonSide }),
      });
      return;
    }

    const inspectionTrigger = getClosestTarget(target, "[data-lab-selection-inspection-mode]");
    if (inspectionTrigger) {
      const nextMode = inspectionTrigger.getAttribute("data-lab-selection-inspection-mode");
      if (typeof nextMode !== "string" || nextMode.trim() === "") {
        return;
      }
      event.preventDefault();
      deps.emit({
        type: "selection-inspection-mode-updated",
        mode: nextMode.trim() as LabInspectionMode,
      });
    }
  }

  function handleMouseDown(rawEvent: Event) {
    const event = rawEvent as MouseLikeEvent;
    if (typeof event.button === "number" && event.button !== 0) {
      return;
    }

    const target = event.target ?? null;
    const resizeTrigger = getClosestTarget(target, "[data-lab-selection-roi-resize]");
    if (resizeTrigger) {
      if (isMutationLocked()) {
        return;
      }
      const handle = resizeTrigger.getAttribute("data-lab-selection-roi-resize");
      const stage = getClosestTarget(target, "[data-lab-selection-roi-stage='true']");
      activateComparisonSide(deps, stage);
      const activeSelection = deps.getActiveSelection();
      const comparisonSide = stage === null ? null : getComparisonSideFromStage(stage);
      const initialRoi =
        comparisonSide === null
          ? (activeSelection?.roi ?? null)
          : (deps.getComparisonRoi?.(comparisonSide) ?? activeSelection?.roi ?? null);
      if (
        !isSelectionRoiResizeHandle(handle) ||
        !stage ||
        initialRoi === null ||
        !canDrawSelectionRoi(activeSelection, deps.getSourceKind())
      ) {
        return;
      }
      const startPoint = clampPointToRect(event, getSelectionRoiRect(stage));
      event.preventDefault();
      dragState = {
        handle,
        initialRoi,
        lastSignature: null,
        mode: "resize",
        stage,
        startX: startPoint.x,
        startY: startPoint.y,
      };
      return;
    }

    if (getClosestTarget(target, "[data-lab-selection-roi-ignore='true']")) {
      return;
    }

    const stage = getClosestTarget(target, "[data-lab-selection-roi-stage='true']");
    if (!stage) {
      return;
    }
    if (isMutationLocked()) {
      return;
    }
    activateComparisonSide(deps, stage);

    const sourceKind = deps.getSourceKind();
    if (!canDrawSelectionRoi(deps.getActiveSelection(), sourceKind)) {
      return;
    }

    const rect = getSelectionRoiRect(stage);
    const reserveBottom = getReserveBottom(stage);
    const startPoint = clampPointToRect(event, rect);
    if (startPoint.y > rect.bottom - reserveBottom) {
      return;
    }

    event.preventDefault();
    dragState = {
      lastSignature: null,
      mode: "draw",
      stage,
      startX: startPoint.x,
      startY: startPoint.y,
    };
  }

  function handleMouseMove(rawEvent: Event) {
    if (dragState === null) {
      return;
    }
    if (isMutationLocked()) {
      dragState = null;
      return;
    }
    const event = rawEvent as MouseLikeEvent;
    const nextSelectionRoi =
      dragState.mode === "resize"
        ? createSelectionRoiFromResize(dragState.stage, dragState, event)
        : createSelectionRoiFromDrag(dragState.stage, dragState, event);
    if (nextSelectionRoi === null || dragState.lastSignature === nextSelectionRoi.signature) {
      return;
    }

    dragState.lastSignature = nextSelectionRoi.signature;
    event.preventDefault();
    const comparisonSide = getComparisonSideFromStage(dragState.stage);
    deps.emit({
      type: "selection-roi-updated",
      roi: nextSelectionRoi.roi,
      ...(comparisonSide === null ? {} : { comparisonSide }),
    });
  }

  function handleMouseUp() {
    dragState = null;
  }

  function handleKeyDown(rawEvent: Event) {
    const event = rawEvent as MouseLikeEvent;
    if (dragState === null || event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    dragState = null;
  }

  return bindLabDocumentEvents(deps.documentRef, [
    { type: "click", listener: handleClick },
    { type: "mousedown", listener: handleMouseDown },
    { type: "mousemove", listener: handleMouseMove },
    { type: "mouseup", listener: handleMouseUp },
    { type: "keydown", listener: handleKeyDown },
  ]);
}

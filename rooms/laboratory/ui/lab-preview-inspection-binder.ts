import {
  bindLabDocumentEvents,
  consumeLabEvent,
  isClosestCapableTarget,
} from "./lab-dom-events.js";

type PreviewInspectionBinderDeps = {
  controller: {
    captureSnapshot: () => Promise<boolean> | boolean;
    clearFocus: () => boolean;
    clearSnapshot: () => boolean;
    stepFrame: (direction: -1 | 1) => boolean;
    toggleFocus: () => boolean;
  };
  documentRef: Pick<Document, "addEventListener" | "removeEventListener">;
};

function isEditableTarget(target: EventTarget | null) {
  if (!isClosestCapableTarget<Element>(target)) {
    return false;
  }
  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

export function bindLabPreviewInspectionInteractions(deps: PreviewInspectionBinderDeps) {
  let interactionArmed = false;

  function setArmedFromTarget(target: EventTarget | null) {
    if (!isClosestCapableTarget<Element>(target)) {
      interactionArmed = false;
      return;
    }
    interactionArmed =
      target.closest("[data-lab-preview-inspection-stage='true']") !== null ||
      target.closest("[data-lab-selection-panel='true']") !== null;
  }

  function handleClick(event: Event) {
    const target = event.target;
    if (!isClosestCapableTarget<Element>(target)) {
      interactionArmed = false;
      return;
    }

    const focusToggle = target.closest("[data-lab-selection-roi-focus-toggle]");
    if (focusToggle !== null) {
      interactionArmed = true;
      consumeLabEvent(event);
      void deps.controller.toggleFocus();
      return;
    }

    const focusReset = target.closest("[data-lab-selection-roi-focus-reset]");
    if (focusReset !== null) {
      interactionArmed = true;
      if (deps.controller.clearFocus()) {
        consumeLabEvent(event);
      }
      return;
    }

    const captureRegion = target.closest("[data-lab-selection-roi-capture]");
    if (captureRegion !== null) {
      interactionArmed = true;
      consumeLabEvent(event);
      void deps.controller.captureSnapshot();
      return;
    }

    const clearSnapshot = target.closest("[data-lab-selection-roi-snapshot-clear]");
    if (clearSnapshot !== null) {
      interactionArmed = true;
      if (deps.controller.clearSnapshot()) {
        consumeLabEvent(event);
      }
      return;
    }

    const frameStep = target.closest("[data-lab-selection-roi-frame-step]");
    if (frameStep !== null) {
      const directionValue = frameStep.getAttribute("data-lab-selection-roi-frame-step");
      const direction = directionValue === "-1" ? -1 : directionValue === "1" ? 1 : null;
      if (direction !== null && deps.controller.stepFrame(direction)) {
        interactionArmed = true;
        consumeLabEvent(event);
      }
      return;
    }

    setArmedFromTarget(target);
  }

  function handleDoubleClick(event: Event) {
    const target = event.target;
    if (!isClosestCapableTarget<Element>(target)) {
      return;
    }
    if (target.closest("[data-lab-selection-roi='true']") === null) {
      return;
    }
    interactionArmed = true;
    consumeLabEvent(event);
    void deps.controller.toggleFocus();
  }

  function handleKeyDown(event: Event) {
    const keyboardEvent = event as Event & { key?: string; target?: EventTarget | null };
    if (interactionArmed !== true || isEditableTarget(keyboardEvent.target ?? null)) {
      return;
    }
    if (keyboardEvent.key === "Escape") {
      if (deps.controller.clearFocus()) {
        consumeLabEvent(event);
      }
      return;
    }
    if (keyboardEvent.key === "ArrowLeft" && deps.controller.stepFrame(-1)) {
      consumeLabEvent(event);
      return;
    }
    if (keyboardEvent.key === "ArrowRight" && deps.controller.stepFrame(1)) {
      consumeLabEvent(event);
    }
  }

  return bindLabDocumentEvents(deps.documentRef, [
    { type: "click", listener: handleClick },
    { type: "dblclick", listener: handleDoubleClick },
    { type: "keydown", listener: handleKeyDown },
  ]);
}

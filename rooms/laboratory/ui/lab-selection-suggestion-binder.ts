import type { LabStoreEvent } from "../domain/lab-types.js";
import { bindLabDocumentEvents, isClosestCapableTarget } from "./lab-dom-events.js";

type SelectionSuggestionBinderDeps = {
  canPreviewSuggestion: (suggestionId: string) => boolean;
  documentRef: Pick<Document, "addEventListener" | "removeEventListener">;
  emit: (event: LabStoreEvent) => void;
  getActivePreviewSuggestionId: () => string | null;
};

function isTargetInsideSelectionPanel(target: EventTarget | null) {
  if (!isClosestCapableTarget<{ getAttribute: (name: string) => string | null }>(target)) {
    return false;
  }
  const panel = target.closest("[data-lab-selection-panel]");
  return panel !== null;
}

export function bindLabSelectionSuggestionClicks(deps: SelectionSuggestionBinderDeps) {
  function handleClick(event: Event) {
    const target = event.target;
    if (isClosestCapableTarget<{ getAttribute: (name: string) => string | null }>(target)) {
      const executionIntentAcceptTrigger = target.closest("[data-lab-execution-intent-accept]");
      if (
        executionIntentAcceptTrigger &&
        typeof executionIntentAcceptTrigger.getAttribute === "function"
      ) {
        const suggestionId = executionIntentAcceptTrigger.getAttribute(
          "data-lab-execution-intent-accept"
        );
        if (typeof suggestionId !== "string" || suggestionId.trim() === "") {
          return;
        }
        const normalizedSuggestionId = suggestionId.trim();
        if (deps.getActivePreviewSuggestionId() !== normalizedSuggestionId) {
          return;
        }
        event.preventDefault();
        deps.emit({
          type: "workspace-selection-suggestion-accepted",
          suggestionId: normalizedSuggestionId,
        });
        return;
      }

      const executionIntentDismissTrigger = target.closest("[data-lab-execution-intent-dismiss]");
      if (
        executionIntentDismissTrigger &&
        typeof executionIntentDismissTrigger.getAttribute === "function"
      ) {
        const suggestionId = executionIntentDismissTrigger.getAttribute(
          "data-lab-execution-intent-dismiss"
        );
        if (typeof suggestionId !== "string" || suggestionId.trim() === "") {
          return;
        }
        const normalizedSuggestionId = suggestionId.trim();
        if (deps.getActivePreviewSuggestionId() !== normalizedSuggestionId) {
          return;
        }
        event.preventDefault();
        deps.emit({
          type: "workspace-selection-suggestion-dismissed",
          suggestionId: normalizedSuggestionId,
        });
        return;
      }

      const executionIntentQueueTrigger = target.closest("[data-lab-execution-intent-queue]");
      if (
        executionIntentQueueTrigger &&
        typeof executionIntentQueueTrigger.getAttribute === "function"
      ) {
        const suggestionId = executionIntentQueueTrigger.getAttribute(
          "data-lab-execution-intent-queue"
        );
        if (typeof suggestionId !== "string" || suggestionId.trim() === "") {
          return;
        }
        const normalizedSuggestionId = suggestionId.trim();
        if (deps.getActivePreviewSuggestionId() !== normalizedSuggestionId) {
          return;
        }
        event.preventDefault();
        deps.emit({
          type: "workspace-selection-suggestion-queued",
          suggestionId: normalizedSuggestionId,
        });
        return;
      }

      const executionIntentClearTrigger = target.closest("[data-lab-execution-intent-clear]");
      if (executionIntentClearTrigger !== null) {
        event.preventDefault();
        deps.emit({
          type: "workspace-execution-intent-cleared",
        });
        return;
      }

      const trigger = target.closest("[data-lab-selection-suggestion]");
      if (trigger && typeof trigger.getAttribute === "function") {
        const suggestionId = trigger.getAttribute("data-lab-selection-suggestion");
        if (typeof suggestionId !== "string" || suggestionId.trim() === "") {
          return;
        }
        const normalizedSuggestionId = suggestionId.trim();
        event.preventDefault();
        deps.emit({
          type: "workspace-selection-suggestion-clicked",
          suggestionId: normalizedSuggestionId,
        });
        if (!deps.canPreviewSuggestion(normalizedSuggestionId)) {
          return;
        }
        deps.emit({
          type: "workspace-selection-suggestion-preview-set",
          suggestionId: normalizedSuggestionId,
        });
        return;
      }
    }

    if (deps.getActivePreviewSuggestionId() === null || isTargetInsideSelectionPanel(target)) {
      return;
    }
    deps.emit({
      type: "workspace-selection-suggestion-preview-cleared",
    });
  }

  function handleKeydown(event: Event) {
    if (deps.getActivePreviewSuggestionId() === null) {
      return;
    }
    const keyboardEvent = event as Event & { key?: string };
    if (keyboardEvent.key !== "Escape") {
      return;
    }
    event.preventDefault();
    deps.emit({
      type: "workspace-selection-suggestion-preview-cleared",
    });
  }

  return bindLabDocumentEvents(deps.documentRef, [
    { type: "click", listener: handleClick },
    { type: "keydown", listener: handleKeydown },
  ]);
}

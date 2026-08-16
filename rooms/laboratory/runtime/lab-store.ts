import type { LabStoreEvent, LabStoreState } from "../domain/lab-types.js";
import {
  normalizeWorkspaceTimelineRange,
  syncWorkspaceSelectionWithRange,
} from "./lab-workspace-selection.js";
import { createLabStore as createCoreLabStore } from "./lab-store-core.js";
import { clearExecutionIntent, clearSuggestionPreview } from "./store/lab-store-execution-state.js";
import { isRunMutationLocked } from "./store/lab-store-run-sync.js";
import { clearInspectionDepth } from "./store/lab-store-workspace-state.js";

type LabTimelineUpdatedEvent = Extract<LabStoreEvent, { type: "workspace-timeline-updated" }>;

function reduceTimelineUpdateWithStructuralSharing(
  state: LabStoreState,
  event: LabTimelineUpdatedEvent
): LabStoreState | null {
  if (isRunMutationLocked(state)) {
    return null;
  }

  const nextState: LabStoreState = {
    ...state,
    ui: {
      ...state.ui,
    },
  };
  const nextTimelineRange = normalizeWorkspaceTimelineRange(event.startMs, event.endMs);
  if (
    nextTimelineRange.startMs !== state.ui.workspace.timelineStartMs ||
    nextTimelineRange.endMs !== state.ui.workspace.timelineEndMs
  ) {
    clearExecutionIntent(nextState);
    clearSuggestionPreview(nextState);
    clearInspectionDepth(nextState);
  }
  nextState.ui.workspace = syncWorkspaceSelectionWithRange(state.ui.workspace, nextTimelineRange);
  return nextState;
}

export function createLabStore() {
  const coreStore = createCoreLabStore();
  let state: LabStoreState = {
    ...coreStore.getState(),
  };
  const listeners = new Set<(nextState: LabStoreState) => void>();

  function getState() {
    return state;
  }

  function subscribe(listener: (nextState: LabStoreState) => void) {
    listeners.add(listener);
    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  function syncCoreState() {
    Object.assign(coreStore.getState(), state);
  }

  function dispatch(event: LabStoreEvent) {
    if (event.type === "workspace-timeline-updated") {
      const nextState = reduceTimelineUpdateWithStructuralSharing(state, event);
      if (nextState !== null) {
        state = nextState;
      } else {
        syncCoreState();
        coreStore.dispatch(event);
        state = {
          ...coreStore.getState(),
        };
      }
    } else {
      syncCoreState();
      coreStore.dispatch(event);
      state = {
        ...coreStore.getState(),
      };
    }

    listeners.forEach(function (listener) {
      listener(state);
    });
  }

  return {
    dispatch,
    getState,
    subscribe,
  };
}

import type { RepairRuntimeAction } from "./repair-runtime-actions.js";
import { reduceRepairRuntimeState } from "./repair-runtime-reducer.js";
import type { RepairRuntimeState } from "./repair-runtime-state.js";

export interface RepairRuntimeStore {
  batch: (callback: () => void) => RepairRuntimeState;
  dispatch: (action: RepairRuntimeAction) => RepairRuntimeState;
  dispatchMany: (actions: RepairRuntimeAction[]) => RepairRuntimeState;
  getState: () => RepairRuntimeState;
  subscribe: (listener: (state: RepairRuntimeState) => void) => () => void;
}

export function createRepairRuntimeStore(initialState: RepairRuntimeState): RepairRuntimeStore {
  let state = initialState;
  let batchDepth = 0;
  let hasBatchedUpdate = false;
  const listeners = new Set<(state: RepairRuntimeState) => void>();

  function getState(): RepairRuntimeState {
    return state;
  }

  function notify(): void {
    listeners.forEach((listener) => {
      listener(state);
    });
  }

  function publish(): void {
    if (batchDepth > 0) {
      hasBatchedUpdate = true;
      return;
    }
    notify();
  }

  function dispatch(action: RepairRuntimeAction): RepairRuntimeState {
    const nextState = reduceRepairRuntimeState(state, action);
    if (nextState === state) {
      return state;
    }
    state = nextState;
    publish();
    return state;
  }

  function batch(callback: () => void): RepairRuntimeState {
    batchDepth += 1;
    try {
      callback();
    } finally {
      batchDepth -= 1;
      if (batchDepth === 0 && hasBatchedUpdate) {
        hasBatchedUpdate = false;
        notify();
      }
    }
    return state;
  }

  function dispatchMany(actions: RepairRuntimeAction[]): RepairRuntimeState {
    return batch(() => {
      actions.forEach((action) => {
        dispatch(action);
      });
    });
  }

  function subscribe(listener: (state: RepairRuntimeState) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { batch, dispatch, dispatchMany, getState, subscribe };
}

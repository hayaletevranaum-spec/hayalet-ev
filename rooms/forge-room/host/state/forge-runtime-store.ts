import type { ForgeRuntimeAction } from "./forge-runtime-actions.js";
import { reduceForgeRuntimeState } from "./forge-runtime-reducer.js";
import type { ForgeRuntimeState } from "./forge-runtime-state.js";

export function createForgeRuntimeStore(initialState: ForgeRuntimeState) {
  let state = initialState;
  const listeners = new Set<(state: ForgeRuntimeState) => void>();

  function getState(): ForgeRuntimeState {
    return state;
  }

  function dispatch(action: ForgeRuntimeAction): ForgeRuntimeState {
    state = reduceForgeRuntimeState(state, action);
    listeners.forEach((listener) => {
      listener(state);
    });
    return state;
  }

  function subscribe(listener: (state: ForgeRuntimeState) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    dispatch,
    getState,
    subscribe,
  };
}

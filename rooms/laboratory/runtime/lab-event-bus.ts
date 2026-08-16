import type { LabStoreEvent } from "../domain/lab-types.js";

export function createLabEventBus() {
  const listeners = new Set<(event: LabStoreEvent) => void>();
  const history: LabStoreEvent[] = [];

  function emit(event: LabStoreEvent) {
    history.push(event);
    if (history.length > 400) {
      history.shift();
    }
    listeners.forEach(function (listener) {
      listener(event);
    });
  }

  function subscribe(listener: (event: LabStoreEvent) => void) {
    listeners.add(listener);
    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  function getHistory() {
    return history.slice();
  }

  return {
    emit,
    getHistory,
    subscribe,
  };
}

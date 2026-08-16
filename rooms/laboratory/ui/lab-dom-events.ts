export type ClosestCapableTarget<TClosest> = EventTarget & {
  closest: (selector: string) => TClosest | null;
};

export type LabDocumentEventRef = Pick<Document, "addEventListener" | "removeEventListener">;

export type LabDocumentEventBinding = {
  listener: EventListenerOrEventListenerObject;
  type: string;
};

export function isClosestCapableTarget<TClosest>(
  value: EventTarget | null
): value is ClosestCapableTarget<TClosest> {
  return typeof value === "object" && value !== null && "closest" in value;
}

export function consumeLabEvent(event: Event) {
  if (typeof event.preventDefault === "function") {
    event.preventDefault();
  }
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
    return;
  }
  if (typeof event.stopPropagation === "function") {
    event.stopPropagation();
  }
}

export function bindLabDocumentEvents(
  documentRef: LabDocumentEventRef,
  bindings: LabDocumentEventBinding[]
) {
  bindings.forEach(function (binding) {
    documentRef.addEventListener(binding.type, binding.listener);
  });

  return function unbind() {
    bindings.forEach(function (binding) {
      documentRef.removeEventListener(binding.type, binding.listener);
    });
  };
}

export function getRoomPageElement(
  pageName: string,
  documentRef: Document = document
): HTMLElement | null {
  return documentRef.getElementById(`page-${pageName}`);
}

export function getRoomPageClassicShell(page: HTMLElement | null): HTMLElement | null {
  return page?.querySelector<HTMLElement>("[data-room-role='classic-shell']") ?? null;
}

export function getRoomPageSceneRoot(page: HTMLElement | null): HTMLElement | null {
  return page?.querySelector<HTMLElement>("[data-room-role='scene-root']") ?? null;
}

export function getRoomPageSceneRoom(page: HTMLElement | null): HTMLElement | null {
  return page?.querySelector<HTMLElement>("[data-room-role='scene-room']") ?? null;
}

export function getRoomPageSceneView(page: HTMLElement | null): HTMLElement | null {
  return page?.querySelector<HTMLElement>("[data-room-role='scene-view']") ?? null;
}

export function getRoomPageRuntimeMount(page: HTMLElement | null): HTMLElement | null {
  return page?.querySelector<HTMLElement>("[data-room-role='runtime-mount']") ?? null;
}

export function getRoomPageSceneRuntimeSlot(page: HTMLElement | null): HTMLElement | null {
  return page?.querySelector<HTMLElement>("[data-room-role='scene-runtime-slot']") ?? null;
}

export function getRoomPageSceneEditorHost(page: HTMLElement | null): HTMLElement | null {
  return page?.querySelector<HTMLElement>("[data-room-role='scene-editor-host']") ?? null;
}

interface SceneViewRuntimeElements {
  root: HTMLElement | null;
  view: HTMLElement | null;
  room?: HTMLElement | null;
  roomView?: HTMLElement | null;
  overlay?: HTMLElement | null;
  classicLayout?: HTMLElement | null;
  viewSlot?: HTMLElement | null;
}

interface SceneViewRuntimeState {
  sceneActive: boolean;
  viewOpen: boolean;
  roomOpenClass?: string;
  viewActiveClass?: string;
  overlayActiveClass?: string;
  classicLayoutHiddenClass?: string;
}

interface SceneViewRuntimeOptions {
  elements: SceneViewRuntimeElements;
  state: SceneViewRuntimeState;
}

export function syncSceneViewRuntime(options: SceneViewRuntimeOptions): void {
  const { elements, state } = options;
  const viewActive = state.sceneActive && state.viewOpen;

  if (elements.root !== null) {
    elements.root.hidden = !state.sceneActive;
    elements.root.setAttribute("aria-hidden", String(!state.sceneActive));
  }

  if (elements.room !== null && elements.room !== undefined && state.roomOpenClass !== undefined) {
    elements.room.classList.toggle(state.roomOpenClass, viewActive);
  }

  if (elements.roomView !== null && elements.roomView !== undefined) {
    elements.roomView.hidden = !state.sceneActive || state.viewOpen;
    elements.roomView.setAttribute("aria-hidden", String(!state.sceneActive || state.viewOpen));
  }

  if (elements.view !== null) {
    elements.view.classList.toggle(state.viewActiveClass ?? "is-active", viewActive);
    elements.view.setAttribute("aria-hidden", String(!viewActive));
  }

  if (elements.overlay !== null && elements.overlay !== undefined) {
    elements.overlay.classList.toggle(
      state.overlayActiveClass ?? "is-scene-mode",
      state.sceneActive
    );
  }

  if (elements.classicLayout !== null && elements.classicLayout !== undefined) {
    elements.classicLayout.classList.toggle(
      state.classicLayoutHiddenClass ?? "is-hidden",
      state.sceneActive
    );
  }

  if (elements.viewSlot !== null && elements.viewSlot !== undefined) {
    elements.viewSlot.toggleAttribute("hidden", !viewActive);
  }
}

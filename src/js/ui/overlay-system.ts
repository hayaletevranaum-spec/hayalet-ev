export const OVERLAY_KINDS = {
  workspace: "workspace",
  scenario: "scenario",
  assistant: "assistant",
  loading: "loading",
  status: "status",
  modal: "modal",
} as const;

// NOTE: These families define the shell-owned overlay lanes that Sprint 1 centralizes.
// Page-specific controllers may still own their DOM for now, but new overlay work should
// attach to one of these families instead of inventing new page-level overlay semantics.
export const OVERLAY_SURFACE_FAMILIES = {
  workspaceTool: "workspace-tool",
  assistantTool: "assistant-tool",
  modal: "modal",
  status: "status",
  scenario: "scenario",
  loading: "loading",
} as const;

export const OVERLAY_GROUPS = {
  workspace: "workspace-overlays",
  assistantTools: "assistant-tool-overlays",
  entranceScenario: "entrance-scenario-overlays",
  assistantScenario: "assistant-scenario-overlays",
  opencodeUi: "opencode-ui-overlays",
  loading: "loading-overlays",
} as const;

export type OverlayKind = (typeof OVERLAY_KINDS)[keyof typeof OVERLAY_KINDS];
export type OverlaySurfaceFamily =
  (typeof OVERLAY_SURFACE_FAMILIES)[keyof typeof OVERLAY_SURFACE_FAMILIES];
type OverlayGroup = string;

export const APP_OVERLAY_HOST_ID = "app-overlay-host";

const OVERLAY_SURFACE_FAMILY_VALUES = Object.values(
  OVERLAY_SURFACE_FAMILIES
) as OverlaySurfaceFamily[];

const OVERLAY_KIND_TO_SURFACE_FAMILY: Record<OverlayKind, OverlaySurfaceFamily> = {
  [OVERLAY_KINDS.workspace]: OVERLAY_SURFACE_FAMILIES.workspaceTool,
  [OVERLAY_KINDS.assistant]: OVERLAY_SURFACE_FAMILIES.assistantTool,
  [OVERLAY_KINDS.modal]: OVERLAY_SURFACE_FAMILIES.modal,
  [OVERLAY_KINDS.status]: OVERLAY_SURFACE_FAMILIES.status,
  [OVERLAY_KINDS.scenario]: OVERLAY_SURFACE_FAMILIES.scenario,
  [OVERLAY_KINDS.loading]: OVERLAY_SURFACE_FAMILIES.loading,
};

interface ManagedOverlayDefinition {
  id: string;
  element: HTMLElement;
  kind: OverlayKind;
  surfaceFamily?: OverlaySurfaceFamily | undefined;
  isOpen: () => boolean;
  setOpen: (open: boolean) => void;
  exclusiveGroup?: OverlayGroup | undefined;
  lockScroll?: boolean | undefined;
  closeOnEscape?: boolean | undefined;
  onAfterOpen?: (() => void) | undefined;
  onAfterClose?: (() => void) | undefined;
}

interface ManagedOverlay {
  id: string;
  element: HTMLElement;
  kind: OverlayKind;
  surfaceFamily: OverlaySurfaceFamily;
  isOpen: () => boolean;
  setOpen: (open: boolean) => void;
  exclusiveGroup: OverlayGroup | null;
  lockScroll: boolean;
  closeOnEscape: boolean;
  onAfterOpen?: (() => void) | undefined;
  onAfterClose?: (() => void) | undefined;
}

export interface ManagedOverlayController {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
  sync: () => void;
  destroy: () => void;
}

export interface InlineStatusOverlayState {
  stateClass: string;
  title: string;
  subtitle: string;
  icon?: string;
}

export interface InlineStatusOverlayController extends ManagedOverlayController {
  setState: (state: InlineStatusOverlayState | null) => void;
}

interface CreateHiddenClassOverlayControllerOptions {
  id: string;
  element: HTMLElement;
  kind: OverlayKind;
  surfaceFamily?: OverlaySurfaceFamily;
  hiddenClass?: string;
  syncAriaHidden?: boolean;
  exclusiveGroup?: OverlayGroup;
  lockScroll?: boolean;
  closeOnEscape?: boolean;
  onAfterOpen?: () => void;
  onAfterClose?: () => void;
}

interface CreateInlineStatusOverlayControllerOptions {
  id: string;
  element: HTMLElement;
  kind?: OverlayKind;
  surfaceFamily?: OverlaySurfaceFamily;
  hiddenClass?: string;
  syncAriaHidden?: boolean;
  baseClasses?: string[];
  stateClasses?: string[];
  iconSelector?: string;
  titleSelector?: string;
  subtitleSelector?: string;
  blockedTarget?: HTMLElement | null;
  blockedClass?: string;
  exclusiveGroup?: OverlayGroup;
  lockScroll?: boolean;
  closeOnEscape?: boolean;
  onAfterOpen?: () => void;
  onAfterClose?: () => void;
}

const overlays = new Map<string, ManagedOverlay>();
const overlayStack: string[] = [];

let escapeHandlerBound = false;

interface OverlayHostState {
  root: HTMLElement | null;
  layers: Map<OverlaySurfaceFamily, HTMLElement>;
}

const overlayHostState: OverlayHostState = {
  root: null,
  layers: new Map(),
};

export function getDefaultOverlaySurfaceFamily(kind: OverlayKind): OverlaySurfaceFamily {
  return OVERLAY_KIND_TO_SURFACE_FAMILY[kind];
}

export function initAppOverlayHost(root?: HTMLElement | null): void {
  if (typeof document === "undefined") {
    overlayHostState.root = null;
    overlayHostState.layers.clear();
    return;
  }

  const resolvedRoot = root ?? document.getElementById(APP_OVERLAY_HOST_ID) ?? null;

  overlayHostState.root = resolvedRoot instanceof HTMLElement ? resolvedRoot : null;
  overlayHostState.layers.clear();

  if (overlayHostState.root === null) {
    return;
  }

  OVERLAY_SURFACE_FAMILY_VALUES.forEach((family) => {
    const layer = overlayHostState.root?.querySelector<HTMLElement>(
      `[data-overlay-layer="${family}"]`
    );
    if (layer instanceof HTMLElement) {
      overlayHostState.layers.set(family, layer);
    }
  });

  syncManagedOverlayHostState();
}

export function resolveOverlayHostLayer(surfaceFamily: OverlaySurfaceFamily): HTMLElement | null {
  return overlayHostState.layers.get(surfaceFamily) ?? null;
}

export function mountElementInOverlayHostLayer(
  element: HTMLElement,
  surfaceFamily: OverlaySurfaceFamily
): boolean {
  const layer = resolveOverlayHostLayer(surfaceFamily);
  if (!(layer instanceof HTMLElement)) {
    delete element.dataset["overlayHostMounted"];
    delete element.dataset["overlayHostFamily"];
    return false;
  }

  if (element.parentElement !== layer) {
    layer.appendChild(element);
  }

  element.dataset["overlayHostMounted"] = "true";
  element.dataset["overlayHostFamily"] = surfaceFamily;
  return true;
}

function markOverlayElementState(overlay: ManagedOverlay): void {
  overlay.element.dataset["overlayKind"] = overlay.kind;
  overlay.element.dataset["overlaySurfaceFamily"] = overlay.surfaceFamily;
  overlay.element.dataset["overlayOpen"] = String(overlay.isOpen());

  if (overlay.exclusiveGroup === null) {
    delete overlay.element.dataset["overlayGroup"];
    return;
  }

  overlay.element.dataset["overlayGroup"] = overlay.exclusiveGroup;
}

function removeOverlayElementState(overlay: ManagedOverlay): void {
  delete overlay.element.dataset["overlayKind"];
  delete overlay.element.dataset["overlaySurfaceFamily"];
  delete overlay.element.dataset["overlayOpen"];
  delete overlay.element.dataset["overlayGroup"];
}

function syncManagedOverlayScrollLock(): void {
  if (typeof document === "undefined") {
    return;
  }

  const shouldLock = Array.from(overlays.values()).some(
    (overlay) => overlay.lockScroll && overlay.isOpen()
  );

  document.body.classList.toggle("is-scroll-locked", shouldLock);
}

function syncManagedOverlayHostState(): void {
  const hostRoot = overlayHostState.root;
  if (!(hostRoot instanceof HTMLElement)) {
    return;
  }

  const openCounts = new Map<OverlaySurfaceFamily, number>();
  OVERLAY_SURFACE_FAMILY_VALUES.forEach((family) => {
    openCounts.set(family, 0);
  });

  overlays.forEach((overlay) => {
    if (!overlay.isOpen()) {
      return;
    }

    const nextCount = (openCounts.get(overlay.surfaceFamily) ?? 0) + 1;
    openCounts.set(overlay.surfaceFamily, nextCount);
  });

  const activeFamilies: OverlaySurfaceFamily[] = [];
  let openCount = 0;

  OVERLAY_SURFACE_FAMILY_VALUES.forEach((family) => {
    const isOpen = (openCounts.get(family) ?? 0) > 0;
    const layer = overlayHostState.layers.get(family);
    layer?.classList.toggle("is-active", isOpen);
    if (layer instanceof HTMLElement) {
      layer.dataset["overlayLayerOpen"] = String(isOpen);
      layer.setAttribute("aria-hidden", String(!isOpen));
    }

    if (isOpen) {
      activeFamilies.push(family);
      openCount += openCounts.get(family) ?? 0;
    }
  });

  hostRoot.classList.toggle("is-active", openCount > 0);
  hostRoot.setAttribute("aria-hidden", String(openCount === 0));
  hostRoot.dataset["overlayOpenCount"] = String(openCount);

  if (activeFamilies.length === 0) {
    delete hostRoot.dataset["overlayActiveFamilies"];
    return;
  }

  hostRoot.dataset["overlayActiveFamilies"] = activeFamilies.join(" ");
}

function syncManagedOverlayRuntimeState(): void {
  syncManagedOverlayScrollLock();
  syncManagedOverlayHostState();
}

function removeFromStack(id: string): void {
  const index = overlayStack.indexOf(id);
  if (index >= 0) {
    overlayStack.splice(index, 1);
  }
}

function pushToStack(id: string): void {
  removeFromStack(id);
  overlayStack.push(id);
}

function closeManagedOverlay(overlay: ManagedOverlay): void {
  if (!overlay.isOpen()) {
    removeFromStack(overlay.id);
    markOverlayElementState(overlay);
    syncManagedOverlayRuntimeState();
    return;
  }

  overlay.setOpen(false);
  removeFromStack(overlay.id);
  markOverlayElementState(overlay);
  syncManagedOverlayRuntimeState();
  overlay.onAfterClose?.();
}

function closeOverlayGroup(group: OverlayGroup, exceptId?: string): void {
  overlays.forEach((overlay) => {
    if (overlay.exclusiveGroup !== group || overlay.id === exceptId || !overlay.isOpen()) {
      return;
    }

    closeManagedOverlay(overlay);
  });
}

function openManagedOverlay(overlay: ManagedOverlay): void {
  if (overlay.exclusiveGroup !== null) {
    closeOverlayGroup(overlay.exclusiveGroup, overlay.id);
  }

  if (overlay.isOpen()) {
    pushToStack(overlay.id);
    markOverlayElementState(overlay);
    syncManagedOverlayRuntimeState();
    return;
  }

  overlay.setOpen(true);
  pushToStack(overlay.id);
  markOverlayElementState(overlay);
  syncManagedOverlayRuntimeState();
  overlay.onAfterOpen?.();
}

function getTopmostEscapeOverlay(): ManagedOverlay | null {
  for (let index = overlayStack.length - 1; index >= 0; index -= 1) {
    const overlayId = overlayStack[index];
    if (overlayId == null) {
      continue;
    }

    const overlay = overlays.get(overlayId);
    if (overlay == null || !overlay.isOpen() || overlay.closeOnEscape === false) {
      continue;
    }

    return overlay;
  }

  return null;
}

function handleManagedOverlayEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape") {
    return;
  }

  const overlay = getTopmostEscapeOverlay();
  if (overlay == null) {
    return;
  }

  closeManagedOverlay(overlay);
}

function ensureEscapeHandler(): void {
  if (escapeHandlerBound) {
    return;
  }

  document.addEventListener("keydown", handleManagedOverlayEscape);
  escapeHandlerBound = true;
}

function maybeRemoveEscapeHandler(): void {
  if (!escapeHandlerBound || overlays.size > 0) {
    return;
  }

  document.removeEventListener("keydown", handleManagedOverlayEscape);
  escapeHandlerBound = false;
}

export function createManagedOverlayController(
  definition: ManagedOverlayDefinition
): ManagedOverlayController {
  const managedOverlay: ManagedOverlay = {
    ...definition,
    surfaceFamily: definition.surfaceFamily ?? getDefaultOverlaySurfaceFamily(definition.kind),
    exclusiveGroup: definition.exclusiveGroup ?? null,
    lockScroll: definition.lockScroll !== false,
    closeOnEscape: definition.closeOnEscape !== false,
  };

  overlays.set(managedOverlay.id, managedOverlay);
  markOverlayElementState(managedOverlay);
  ensureEscapeHandler();
  syncManagedOverlayRuntimeState();

  return {
    open(): void {
      openManagedOverlay(managedOverlay);
    },
    close(): void {
      closeManagedOverlay(managedOverlay);
    },
    toggle(): void {
      if (managedOverlay.isOpen()) {
        closeManagedOverlay(managedOverlay);
        return;
      }

      openManagedOverlay(managedOverlay);
    },
    isOpen(): boolean {
      return managedOverlay.isOpen();
    },
    sync(): void {
      if (managedOverlay.isOpen()) {
        pushToStack(managedOverlay.id);
      } else {
        removeFromStack(managedOverlay.id);
      }

      markOverlayElementState(managedOverlay);
      syncManagedOverlayRuntimeState();
    },
    destroy(): void {
      removeFromStack(managedOverlay.id);
      overlays.delete(managedOverlay.id);
      removeOverlayElementState(managedOverlay);
      syncManagedOverlayRuntimeState();
      maybeRemoveEscapeHandler();
    },
  };
}

export function createHiddenClassOverlayController(
  options: CreateHiddenClassOverlayControllerOptions
): ManagedOverlayController {
  const hiddenClass = options.hiddenClass ?? "is-hidden";
  const syncAriaHidden = options.syncAriaHidden === true;

  return createManagedOverlayController({
    id: options.id,
    element: options.element,
    kind: options.kind,
    surfaceFamily: options.surfaceFamily,
    exclusiveGroup: options.exclusiveGroup,
    lockScroll: options.lockScroll,
    closeOnEscape: options.closeOnEscape,
    onAfterOpen: options.onAfterOpen,
    onAfterClose: options.onAfterClose,
    isOpen: () =>
      !options.element.classList.contains(hiddenClass) &&
      (!syncAriaHidden || options.element.getAttribute("aria-hidden") !== "true"),
    setOpen: (open: boolean) => {
      options.element.classList.toggle(hiddenClass, !open);
      if (syncAriaHidden) {
        options.element.setAttribute("aria-hidden", String(!open));
      }
    },
  });
}

export function createInlineStatusOverlayController(
  options: CreateInlineStatusOverlayControllerOptions
): InlineStatusOverlayController {
  const hiddenClass = options.hiddenClass ?? "is-hidden";
  const syncAriaHidden = options.syncAriaHidden === true;
  const stateClasses = options.stateClasses ?? [];
  const blockedClass = options.blockedClass ?? "webview-content-blocked";
  const baseClasses =
    options.baseClasses ??
    Array.from(options.element.classList).filter(
      (className) => className !== hiddenClass && !stateClasses.includes(className)
    );
  const iconEl = options.element.querySelector(options.iconSelector ?? ".overlay-icon");
  const titleEl = options.element.querySelector(options.titleSelector ?? ".overlay-title");
  const subtitleEl = options.element.querySelector(options.subtitleSelector ?? ".overlay-subtitle");

  const applyState = (state: InlineStatusOverlayState): void => {
    baseClasses.forEach((className) => {
      options.element.classList.add(className);
    });
    stateClasses.forEach((className) => {
      options.element.classList.remove(className);
    });
    if (state.stateClass !== "") {
      options.element.classList.add(state.stateClass);
    }

    if (iconEl instanceof HTMLElement) {
      iconEl.textContent = state.icon ?? "";
    }
    if (titleEl instanceof HTMLElement) {
      titleEl.textContent = state.title;
    }
    if (subtitleEl instanceof HTMLElement) {
      subtitleEl.textContent = state.subtitle;
    }
  };

  const overlayController = createManagedOverlayController({
    id: options.id,
    element: options.element,
    kind: options.kind ?? OVERLAY_KINDS.status,
    surfaceFamily: options.surfaceFamily,
    exclusiveGroup: options.exclusiveGroup,
    lockScroll: options.lockScroll ?? false,
    closeOnEscape: options.closeOnEscape ?? false,
    onAfterOpen: options.onAfterOpen,
    onAfterClose: options.onAfterClose,
    isOpen: () =>
      !options.element.classList.contains(hiddenClass) &&
      (!syncAriaHidden || options.element.getAttribute("aria-hidden") !== "true"),
    setOpen: (open: boolean) => {
      options.element.classList.toggle(hiddenClass, !open);
      options.blockedTarget?.classList.toggle(blockedClass, open);
      if (syncAriaHidden) {
        options.element.setAttribute("aria-hidden", String(!open));
      }
    },
  });

  return {
    ...overlayController,
    setState(state: InlineStatusOverlayState | null): void {
      if (state === null) {
        overlayController.close();
        return;
      }

      applyState(state);
      overlayController.open();
    },
  };
}

export { syncManagedOverlayScrollLock };

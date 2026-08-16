import {
  createHiddenClassOverlayController,
  createInlineStatusOverlayController,
  createManagedOverlayController,
  OVERLAY_GROUPS,
  OVERLAY_KINDS,
  OVERLAY_SURFACE_FAMILIES,
  mountElementInOverlayHostLayer,
  type InlineStatusOverlayController,
  type ManagedOverlayController,
  type OverlayKind,
} from "./overlay-system.js";

export const STANDARD_WEBVIEW_STATUS_STATE_CLASSES = [
  "is-empty",
  "is-disconnected",
  "is-connecting",
  "is-error",
];

interface SharedWebviewStatusOverlayOptions {
  id: string;
  element: HTMLElement;
  blockedTarget: HTMLElement;
  kind?: OverlayKind;
  stateClasses?: string[];
}

interface SharedGroupOverlayOptions {
  id: string;
  element: HTMLElement;
  hiddenClass?: string;
  lockScroll?: boolean;
  closeOnEscape?: boolean;
  onAfterOpen?: () => void;
  onAfterClose?: () => void;
}

interface SharedActiveClassOverlayOptions {
  id: string;
  element: HTMLElement;
  kind: OverlayKind;
  group: string;
  activeClass?: string;
  lockScroll?: boolean;
  closeOnEscape?: boolean;
}

interface SharedModalButton {
  label?: string;
  text?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  class?: string;
  onClick?: () => void | Promise<void>;
  closeOnClick?: boolean;
}

interface SharedAssistantToolModalOptions {
  title?: string;
  content: string | HTMLElement;
  size?: "sm" | "small" | "md" | "medium" | "lg" | "large" | "xl" | "xlarge";
  containerClassName?: string;
  closable?: boolean;
  closeOnOverlay?: boolean;
  closeOnEscape?: boolean;
  lockScroll?: boolean;
  buttons?: SharedModalButton[];
  onClose?: () => void;
}

export function createSharedWebviewStatusOverlayController(
  options: SharedWebviewStatusOverlayOptions
): InlineStatusOverlayController {
  return createInlineStatusOverlayController({
    id: options.id,
    element: options.element,
    kind: options.kind ?? OVERLAY_KINDS.status,
    blockedTarget: options.blockedTarget,
    stateClasses: options.stateClasses ?? STANDARD_WEBVIEW_STATUS_STATE_CLASSES,
  });
}

export function createSharedScenarioOverlayController(
  options: SharedGroupOverlayOptions & { group?: string; kind?: OverlayKind }
): ManagedOverlayController {
  return createHiddenClassOverlayController({
    id: options.id,
    element: options.element,
    kind: options.kind ?? OVERLAY_KINDS.scenario,
    exclusiveGroup: options.group ?? OVERLAY_GROUPS.entranceScenario,
    ...(options.hiddenClass !== undefined ? { hiddenClass: options.hiddenClass } : {}),
    lockScroll: options.lockScroll ?? false,
    closeOnEscape: options.closeOnEscape ?? true,
    ...(options.onAfterOpen !== undefined ? { onAfterOpen: options.onAfterOpen } : {}),
    ...(options.onAfterClose !== undefined ? { onAfterClose: options.onAfterClose } : {}),
  });
}

export function createSharedAssistantToolOverlayController(
  options: SharedGroupOverlayOptions
): ManagedOverlayController {
  mountElementInOverlayHostLayer(options.element, OVERLAY_SURFACE_FAMILIES.assistantTool);

  return createHiddenClassOverlayController({
    id: options.id,
    element: options.element,
    kind: OVERLAY_KINDS.assistant,
    exclusiveGroup: OVERLAY_GROUPS.assistantTools,
    ...(options.hiddenClass !== undefined ? { hiddenClass: options.hiddenClass } : {}),
    ...(options.lockScroll !== undefined ? { lockScroll: options.lockScroll } : {}),
    ...(options.closeOnEscape !== undefined ? { closeOnEscape: options.closeOnEscape } : {}),
    ...(options.onAfterOpen !== undefined ? { onAfterOpen: options.onAfterOpen } : {}),
    ...(options.onAfterClose !== undefined ? { onAfterClose: options.onAfterClose } : {}),
  });
}

export async function openSharedAssistantToolModal(
  options: SharedAssistantToolModalOptions
): Promise<{
  close: () => void;
}> {
  const modalModule = await import("./modal-manager.js");
  return modalModule.ModalManager.open({
    ...options,
    overlayKind: OVERLAY_KINDS.assistant,
    overlayGroup: OVERLAY_GROUPS.assistantTools,
    surfaceFamily: OVERLAY_SURFACE_FAMILIES.assistantTool,
  });
}

export function createSharedActiveClassOverlayController(
  options: SharedActiveClassOverlayOptions
): ManagedOverlayController {
  const activeClass = options.activeClass ?? "is-active";

  options.element.setAttribute(
    "aria-hidden",
    String(!options.element.classList.contains(activeClass))
  );

  return createManagedOverlayController({
    id: options.id,
    element: options.element,
    kind: options.kind,
    exclusiveGroup: options.group,
    lockScroll: options.lockScroll,
    closeOnEscape: options.closeOnEscape,
    isOpen: () => options.element.classList.contains(activeClass),
    setOpen: (open: boolean) => {
      options.element.classList.toggle(activeClass, open);
      options.element.setAttribute("aria-hidden", String(!open));
    },
  });
}

import { Logger } from "../modules/logger/index.js";
import { LogCategory } from "@shared/logging-core";
import { AppI18n } from "../modules/i18n/index.js";
import {
  createManagedOverlayController,
  getDefaultOverlaySurfaceFamily,
  OVERLAY_KINDS,
  resolveOverlayHostLayer,
  type ManagedOverlayController,
  type OverlayKind,
  type OverlaySurfaceFamily,
} from "./overlay-system.js";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ModalButton {
  label?: string; // NOTE: New API preferred; keep for backward compatibility with legacy text.
  text?: string; // NOTE: Legacy API; keep for backward compatibility.
  variant?: ButtonVariant; // NOTE: New API preferred; keep for backward compatibility with class.
  class?: string; // NOTE: Legacy API; kept for backward compatibility (e.g., 'btn-primary').
  onClick?: () => void | Promise<void>;
  closeOnClick?: boolean;
}

interface ModalOptions {
  title?: string;
  content: string | HTMLElement;
  size?: "sm" | "small" | "md" | "medium" | "lg" | "large" | "xl" | "xlarge";
  containerClassName?: string;
  closable?: boolean;
  closeOnOverlay?: boolean;
  closeOnEscape?: boolean;
  overlayKind?: OverlayKind;
  overlayGroup?: string;
  surfaceFamily?: OverlaySurfaceFamily;
  mountTarget?: HTMLElement;
  lockScroll?: boolean;
  buttons?: ModalButton[];
  onClose?: () => void;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: ButtonVariant;
  icon?: string;
}

interface ModalInstance {
  id: string;
  element: HTMLDivElement;
  overlayController: ManagedOverlayController;
  options: ModalOptions;
  close: () => void;
}

let idCounter = 0;
const modals: Map<string, ModalInstance> = new Map();
let activeModal: ModalInstance | null = null;

function generateId(): string {
  return `modal-${++idCounter}-${Date.now()}`;
}

function createModalElement(id: string, options: ModalOptions): HTMLDivElement {
  const modalContainer = document.createElement("div");
  modalContainer.className = ["modal", options.containerClassName]
    .filter(
      (className): className is string => typeof className === "string" && className.trim() !== ""
    )
    .join(" ");
  modalContainer.setAttribute("data-modal-id", id);
  modalContainer.setAttribute("role", "dialog");
  modalContainer.setAttribute("aria-modal", "true");

  const modal = document.createElement("div");
  const sizeClass = options.size ?? "medium";
  modal.className = `modal-content modal-${sizeClass}`;

  const titleId = `modal-title-${id}`;
  const descId = `modal-desc-${id}`;
  modalContainer.setAttribute("aria-labelledby", titleId);
  modalContainer.setAttribute("aria-describedby", descId);

  if ((options.title != null && options.title !== "") || options.closable !== false) {
    const header = document.createElement("div");
    header.className = "modal-header";

    if (options.title != null && options.title !== "") {
      const title = document.createElement("h2");
      title.className = "modal-title";
      title.id = titleId;
      title.textContent = options.title;
      header.appendChild(title);
    }

    if (options.closable !== false) {
      const closeBtn = document.createElement("button");
      closeBtn.className = "modal-close";
      closeBtn.setAttribute("aria-label", AppI18n.t("shell.common.closeAriaLabel"));
      closeBtn.innerHTML = "×";
      closeBtn.addEventListener("click", () => {
        modalApi.close(id);
      });
      header.appendChild(closeBtn);
    }

    modal.appendChild(header);
  }

  const body = document.createElement("div");
  body.className = "modal-body";
  body.id = descId;

  if (typeof options.content === "string") {
    body.innerHTML = options.content;
  } else {
    body.appendChild(options.content);
  }

  modal.appendChild(body);

  if (options.buttons && options.buttons.length > 0) {
    const footer = document.createElement("div");
    footer.className = "modal-footer";

    options.buttons.forEach((btnConfig) => {
      const btn = document.createElement("button");

      const buttonText = btnConfig.label ?? btnConfig.text ?? "";
      const buttonClass = btnConfig.class ?? `btn-${btnConfig.variant ?? "secondary"}`;

      btn.className = `btn ${buttonClass}`;
      btn.textContent = buttonText;

      btn.addEventListener("click", () => {
        void (async (): Promise<void> => {
          if (btnConfig.onClick) {
            await btnConfig.onClick();
          }
          if (btnConfig.closeOnClick !== false) {
            modalApi.close(id);
          }
        })();
      });

      footer.appendChild(btn);
    });

    modal.appendChild(footer);
  }

  modalContainer.appendChild(modal);

  if (options.closeOnOverlay !== false) {
    modalContainer.addEventListener("click", (e) => {
      if (e.target === modalContainer) {
        modalApi.close(id);
      }
    });
  }

  return modalContainer;
}

function resolveModalSurfaceFamily(options: ModalOptions): OverlaySurfaceFamily {
  return (
    options.surfaceFamily ??
    getDefaultOverlaySurfaceFamily(options.overlayKind ?? OVERLAY_KINDS.modal)
  );
}

function resolveModalMountTarget(options: ModalOptions): HTMLElement {
  if (options.mountTarget instanceof HTMLElement) {
    return options.mountTarget;
  }

  return resolveOverlayHostLayer(resolveModalSurfaceFamily(options)) ?? document.body;
}

const modalApi = {
  open(options: ModalOptions): ModalInstance {
    const id = generateId();
    const element = createModalElement(id, options);
    const surfaceFamily = resolveModalSurfaceFamily(options);
    resolveModalMountTarget(options).appendChild(element);
    const overlayController = createManagedOverlayController({
      id,
      element,
      kind: options.overlayKind ?? OVERLAY_KINDS.modal,
      surfaceFamily,
      exclusiveGroup: options.overlayGroup,
      lockScroll: options.lockScroll,
      closeOnEscape: options.closeOnEscape !== false && options.closable !== false,
      isOpen: () => element.isConnected && !element.classList.contains("modal-closing"),
      setOpen: (open: boolean) => {
        if (!open) {
          modalApi.close(id);
        }
      },
    });

    const focusableElements = element.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    if (firstElement) {
      firstElement.focus();
    }

    const instance: ModalInstance = {
      id,
      element,
      overlayController,
      options,
      close: () => {
        modalApi.close(id);
      },
    };

    modals.set(id, instance);
    activeModal = instance;

    Logger.infoT(LogCategory.UI_MODAL, "app.logs.uiModal.opened", undefined, {
      id,
      title: options.title,
    });

    return instance;
  },

  close(id?: string): void {
    const modalId = id ?? activeModal?.id;
    if (modalId == null || modalId === "") return;

    const instance = modals.get(modalId);
    if (!instance) return;

    instance.element.classList.add("modal-closing");

    setTimeout(() => {
      instance.element.remove();
      modals.delete(modalId);

      if (activeModal?.id === modalId) {
        activeModal = modals.size > 0 ? (Array.from(modals.values()).pop() ?? null) : null;
      }

      instance.overlayController.destroy();
      instance.options.onClose?.();

      Logger.debugT(LogCategory.UI_MODAL, "app.logs.uiModal.closed", undefined, {
        id: modalId,
      });
    }, 200);
  },

  closeAll(): void {
    modals.forEach((_, id) => {
      modalApi.close(id);
    });
  },

  async confirm(options: ConfirmOptions): Promise<boolean> {
    return await new Promise((resolve) => {
      const content = document.createElement("div");
      content.className = "modal-confirm";

      if (options.icon != null && options.icon !== "") {
        const iconDiv = document.createElement("div");
        iconDiv.className = "modal-confirm-icon";
        iconDiv.textContent = options.icon;
        content.appendChild(iconDiv);
      }

      const titleEl = document.createElement("div");
      titleEl.className = "modal-confirm-title";
      titleEl.textContent = options.title;
      content.appendChild(titleEl);

      const messageEl = document.createElement("div");
      messageEl.className = "modal-confirm-message";
      messageEl.textContent = options.message;
      content.appendChild(messageEl);

      modalApi.open({
        content,
        size: "sm",
        closable: false,
        closeOnOverlay: false,
        buttons: [
          {
            label: options.cancelText ?? AppI18n.t("shell.common.cancel"),
            variant: "secondary",
            onClick: (): void => {
              resolve(false);
            },
          },
          {
            label: options.confirmText ?? AppI18n.t("shell.common.confirm"),
            variant: options.confirmVariant ?? "primary",
            onClick: (): void => {
              resolve(true);
            },
          },
        ],
      });
    });
  },

  async alert(title: string, message: string): Promise<void> {
    await new Promise((resolve) => {
      modalApi.open({
        title,
        content: `<p>${message}</p>`,
        size: "sm",
        buttons: [
          {
            label: AppI18n.t("shell.common.ok"),
            variant: "primary",
            onClick: (): void => {
              resolve(undefined);
            },
          },
        ],
      });
    });
  },

  async prompt(title: string, message: string, defaultValue: string = ""): Promise<string | null> {
    return await new Promise((resolve) => {
      const content = document.createElement("div");

      const messageEl = document.createElement("p");
      messageEl.textContent = message;
      messageEl.className = "modal-prompt-message";
      content.appendChild(messageEl);

      const input = document.createElement("input");
      input.type = "text";
      input.className = "input";
      input.value = defaultValue;
      content.appendChild(input);

      const instance = modalApi.open({
        title,
        content,
        size: "sm",
        buttons: [
          {
            label: AppI18n.t("shell.common.cancel"),
            variant: "secondary",
            onClick: (): void => {
              resolve(null);
            },
          },
          {
            label: AppI18n.t("shell.common.ok"),
            variant: "primary",
            onClick: (): void => {
              resolve(input.value);
            },
          },
        ],
      });

      setTimeout(() => {
        input.focus();
      }, 100);

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          resolve(input.value);
          instance.close();
        }
      });
    });
  },

  get isOpen(): boolean {
    return modals.size > 0;
  },

  get active(): ModalInstance | null {
    return activeModal;
  },
};

const modalManager = modalApi;

export { modalApi as Modal, modalManager as ModalManager };

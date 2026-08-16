import { AppI18n } from "../modules/i18n/index.js";

export type ToastType = "success" | "error" | "warning" | "info" | "loading";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  closable?: boolean;
  action?: ToastAction;
  progress?: boolean;
}

interface ToastInstance {
  id: string;
  element: HTMLDivElement;
  options: ToastOptions;
  timeoutId?: ReturnType<typeof setTimeout>;
}

const ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ℹ",
  loading: "",
};

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 4000,
  loading: 0,
};

let container: HTMLDivElement | null = null;
const toasts: Map<string, ToastInstance> = new Map();
let idCounter = 0;

function generateId(): string {
  return `toast-${++idCounter}-${Date.now()}`;
}

function ensureContainer(): HTMLDivElement {
  if (!container || !document.body.contains(container)) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    container.setAttribute("role", "alert");
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }
  return container;
}

function createToastElement(id: string, options: ToastOptions): HTMLDivElement {
  const toastEl = document.createElement("div");
  toastEl.className = `toast toast-${options.type}`;
  toastEl.setAttribute("data-toast-id", id);
  toastEl.setAttribute("role", "alert");

  const iconDiv = document.createElement("div");
  iconDiv.className = "toast-icon";
  if (options.type !== "loading") {
    iconDiv.textContent = ICONS[options.type];
  }
  toastEl.appendChild(iconDiv);

  const contentDiv = document.createElement("div");
  contentDiv.className = "toast-content";

  const titleDiv = document.createElement("div");
  titleDiv.className = "toast-title";
  titleDiv.textContent = options.title;
  contentDiv.appendChild(titleDiv);

  if (options.message != null && options.message !== "") {
    const messageDiv = document.createElement("div");
    messageDiv.className = "toast-message";
    messageDiv.textContent = options.message;
    contentDiv.appendChild(messageDiv);
  }

  if (options.action) {
    const actionDiv = document.createElement("div");
    actionDiv.className = "toast-action";

    const actionBtn = document.createElement("button");
    actionBtn.className = "toast-action-btn btn btn-xs btn-secondary";
    actionBtn.textContent = options.action.label;
    actionBtn.addEventListener("click", (): void => {
      options.action?.onClick();
      toast.dismiss(id);
    });

    actionDiv.appendChild(actionBtn);
    contentDiv.appendChild(actionDiv);
  }

  toastEl.appendChild(contentDiv);

  if (options.closable !== false) {
    const closeBtn = document.createElement("button");
    closeBtn.className = "toast-close";
    closeBtn.setAttribute("aria-label", AppI18n.t("shell.common.closeAriaLabel"));
    closeBtn.innerHTML = "×";
    closeBtn.addEventListener("click", (): void => {
      toast.dismiss(id);
    });
    toastEl.appendChild(closeBtn);
  }

  if (options.progress === true && options.duration != null && options.duration > 0) {
    const progressDiv = document.createElement("div");
    progressDiv.className = "toast-progress";
    // NOTE: Duration is runtime-defined; keep via CSS var.
    progressDiv.style.setProperty("--toast-duration", `${options.duration}ms`);
    toastEl.appendChild(progressDiv);
  }

  return toastEl;
}

function scheduleRemoval(instance: ToastInstance): void {
  const duration = instance.options.duration ?? DEFAULT_DURATIONS[instance.options.type];

  if (duration > 0) {
    instance.timeoutId = setTimeout(() => {
      toast.dismiss(instance.id);
    }, duration);
  }
}

const toast = {
  show(options: ToastOptions): string {
    const id = generateId();
    const containerEl = ensureContainer();

    const finalOptions: ToastOptions = {
      ...options,
      duration: options.duration ?? DEFAULT_DURATIONS[options.type],
      closable: options.closable ?? true,
      progress: options.progress ?? options.type !== "loading",
    };

    const element = createToastElement(id, finalOptions);
    containerEl.appendChild(element);

    const instance: ToastInstance = {
      id,
      element,
      options: finalOptions,
    };

    toasts.set(id, instance);
    scheduleRemoval(instance);

    // eslint-disable-next-line no-console
    console.debug(`[Toast] Shown: ${options.type}`, { id, title: options.title });
    return id;
  },

  update(id: string, options: Partial<ToastOptions>): void {
    const instance = toasts.get(id);
    if (!instance) {
      // eslint-disable-next-line no-console
      console.debug("[Toast] Update failed: toast not found", { id });
      return;
    }

    if (instance.timeoutId) {
      clearTimeout(instance.timeoutId);
    }

    const newOptions: ToastOptions = { ...instance.options, ...options };
    instance.options = newOptions;

    const parent = instance.element.parentNode;
    const newElement = createToastElement(id, newOptions);

    if (parent) {
      parent.replaceChild(newElement, instance.element);
    }

    instance.element = newElement;

    scheduleRemoval(instance);

    // eslint-disable-next-line no-console
    console.debug("[Toast] Updated", { id, type: newOptions.type });
  },

  dismiss(id: string): void {
    const instance = toasts.get(id);
    if (!instance) return;

    if (instance.timeoutId) {
      clearTimeout(instance.timeoutId);
    }

    instance.element.classList.add("toast-out");

    setTimeout(() => {
      instance.element.remove();
      toasts.delete(id);
    }, 150);
  },

  dismissAll(): void {
    toasts.forEach((_, id) => {
      toast.dismiss(id);
    });
  },

  destroy(): void {
    toasts.forEach((instance) => {
      if (instance.timeoutId) {
        clearTimeout(instance.timeoutId);
      }
    });
    toasts.clear();
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
  },

  success(title: string, message?: string): string {
    return toast.show({
      type: "success",
      title,
      ...(message != null && message !== "" ? { message } : {}),
    });
  },

  error(title: string, message?: string): string {
    return toast.show({
      type: "error",
      title,
      ...(message != null && message !== "" ? { message } : {}),
    });
  },

  warning(title: string, message?: string): string {
    return toast.show({
      type: "warning",
      title,
      ...(message != null && message !== "" ? { message } : {}),
    });
  },

  info(title: string, message?: string): string {
    return toast.show({
      type: "info",
      title,
      ...(message != null && message !== "" ? { message } : {}),
    });
  },

  loading(title: string, message?: string): string {
    return toast.show({
      type: "loading",
      title,
      ...(message != null && message !== "" ? { message } : {}),
      closable: false,
    });
  },

  async promise<T>(
    promise: Promise<T>,
    options: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: unknown) => string);
    }
  ): Promise<T> {
    const id = toast.loading(options.loading);

    try {
      const result = await promise;
      const successMsg =
        typeof options.success === "function" ? options.success(result) : options.success;
      toast.update(id, { type: "success", title: successMsg, closable: true });
      return result;
    } catch (err) {
      const errorMsg = typeof options.error === "function" ? options.error(err) : options.error;
      toast.update(id, { type: "error", title: errorMsg, closable: true });
      throw err;
    }
  },
};

// NOTE: Deprecated alias retained for backward compatibility.
export { toast as Toast, toast as ToastManager };

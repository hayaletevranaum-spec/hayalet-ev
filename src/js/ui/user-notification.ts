import { Toast } from "./toast-manager.js";

export type UserNotificationKind = "success" | "error" | "warning" | "info";

export interface UserNotificationOptions {
  kind?: UserNotificationKind;
  title: string;
  message?: string;
  dedupeKey?: string;
  showToast?: boolean;
  showInline?: boolean;
  inlineTarget?: HTMLElement | null;
  inlineTargetId?: string;
  inlineDurationMs?: number;
  toastDurationMs?: number;
}

const DEFAULT_TOAST_DURATIONS: Record<UserNotificationKind, number> = {
  success: 3200,
  error: 5200,
  warning: 4200,
  info: 4000,
};

const activeToastKeys = new Map<string, { id: string; expiresAt: number }>();
const inlineTimers = new WeakMap<HTMLElement, number>();

function resolveInlineTarget(options: UserNotificationOptions): HTMLElement | null {
  if (options.inlineTarget instanceof HTMLElement) {
    return options.inlineTarget;
  }
  if (typeof options.inlineTargetId === "string" && options.inlineTargetId.trim() !== "") {
    const element = document.getElementById(options.inlineTargetId);
    return element instanceof HTMLElement ? element : null;
  }
  return null;
}

function renderInlineFeedback(
  target: HTMLElement,
  title: string,
  kind: UserNotificationKind,
  duration: number
): void {
  const previousTimer = inlineTimers.get(target);
  if (previousTimer !== undefined) {
    window.clearTimeout(previousTimer);
  }

  target.textContent = title;
  target.className = `ds-status-msg is-visible is-${kind}`;

  const timerId = window.setTimeout(() => {
    target.classList.remove("is-visible");
    inlineTimers.delete(target);
  }, duration);

  inlineTimers.set(target, timerId);
}

function renderToast(options: UserNotificationOptions, kind: UserNotificationKind): void {
  const duration = options.toastDurationMs ?? DEFAULT_TOAST_DURATIONS[kind];
  const toastOptions = {
    type: kind,
    title: options.title,
    ...(options.message != null && options.message !== "" ? { message: options.message } : {}),
    duration,
  } as const;

  if (options.dedupeKey != null && options.dedupeKey !== "") {
    const now = Date.now();
    const active = activeToastKeys.get(options.dedupeKey);
    if (active != null && active.expiresAt > now) {
      Toast.update(active.id, toastOptions);
      activeToastKeys.set(options.dedupeKey, {
        id: active.id,
        expiresAt: now + duration,
      });
      return;
    }
  }

  const id = Toast.show(toastOptions);
  if (options.dedupeKey != null && options.dedupeKey !== "") {
    activeToastKeys.set(options.dedupeKey, {
      id,
      expiresAt: Date.now() + duration,
    });
  }
}

export function notifyUser(options: UserNotificationOptions): void {
  const title = options.title.trim();
  if (title === "") {
    return;
  }

  const kind = options.kind ?? "info";
  const shouldShowInline =
    options.showInline ??
    (options.inlineTarget instanceof HTMLElement || options.inlineTargetId != null);
  if (shouldShowInline) {
    const target = resolveInlineTarget(options);
    if (target != null) {
      renderInlineFeedback(target, title, kind, options.inlineDurationMs ?? 3200);
    }
  }

  if (options.showToast !== false) {
    renderToast(options, kind);
  }
}

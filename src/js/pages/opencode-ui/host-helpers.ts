import type { OpencodeUiToolsReadyPayload } from "./bootstrap-actions.js";
import { getMimeTypeFromPath } from "../../constants/index.js";
import { AppState } from "../../modules/app-state.js";
import { formatDateTime, t } from "./i18n.js";
import type { RuntimeState } from "./types.js";

export type ByIdFn = <T extends HTMLElement>(
  id: string,
  guard?: (element: T) => boolean
) => T | null;

export function byId<T extends HTMLElement>(id: string, guard?: (element: T) => boolean): T | null {
  const element = document.getElementById(id) as T | null;
  if (element == null) {
    return null;
  }

  if (guard != null && !guard(element)) {
    return null;
  }

  return element;
}

export function sendStageToHost(title: string, subtitle: string): void {
  try {
    window.electronAPI?.sendToHost?.("opencode-ui-connect-stage", { title, subtitle });
  } catch (_error) {}
}

export function sendToolsReadyToHost(payload: OpencodeUiToolsReadyPayload): void {
  try {
    window.electronAPI?.sendToHost?.("opencode-ui-tools-ready", payload);
  } catch (_error) {}
}

export function sendSessionChangedToHost(sessionId: string | null): void {
  try {
    window.electronAPI?.sendToHost?.("opencode-ui-session-changed", { sessionId });
  } catch (_error) {}
}

export function setWorkspaceUrlLabel(url: string, getById: ByIdFn = byId): void {
  const workspaceUrlEl = getById<HTMLElement>("workspace-url-display");
  if (workspaceUrlEl != null) {
    workspaceUrlEl.textContent = url;
    workspaceUrlEl.setAttribute("title", url);
  }
}

export function showToast(message: string): void {
  const existing = document.querySelector(".ds-toast");
  if (existing != null) {
    existing.remove();
  }

  const toast = document.createElement("div");
  toast.className = "ds-toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("ds-toast--fade");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 2500);
}

export async function copyWorkspaceUrl(getById: ByIdFn = byId): Promise<void> {
  const workspaceUrlEl = getById<HTMLElement>("workspace-url-display");
  const url = workspaceUrlEl?.textContent.trim() ?? "";
  if (url === "" || url === "-") {
    showToast(t("chat.copyUrlMissing"));
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    showToast(t("chat.copyUrlSuccess"));
  } catch {
    showToast(t("chat.copyUrlError"));
  }
}

export function getLogoFallback(getById: ByIdFn = byId): void {
  const logoEl = getById<HTMLImageElement>("logo");
  if (logoEl == null) return;

  logoEl.onerror = function (): void {
    logoEl.classList.remove("is-avatar");
    logoEl.classList.add("is-fallback");
    logoEl.removeAttribute("src");
  };
}

function getAssistantEmptyStateNickname(): string {
  const nickname = AppState.getNickname("ai0").trim();
  if (nickname !== "" && nickname !== "AI0") {
    return nickname;
  }

  return "Rovo";
}

export async function applyAssistantIdentityToChatEmpty(getById: ByIdFn = byId): Promise<void> {
  const logoEl = getById<HTMLImageElement>("logo");
  const titleEl = getById<HTMLElement>("chat-empty-title");
  const subtitleEl = getById<HTMLElement>("chat-empty-subtitle");
  const nickname = getAssistantEmptyStateNickname();

  if (titleEl != null) {
    titleEl.textContent = nickname;
  }

  if (subtitleEl != null) {
    subtitleEl.textContent = t("chat.emptySubtitle");
  }

  if (logoEl == null) {
    return;
  }

  getLogoFallback(getById);
  logoEl.alt = t("documentTitle");
  logoEl.classList.remove("is-avatar");
  logoEl.classList.remove("is-fallback");
  logoEl.src = "/assets/opencode.png";

  const avatarPath = AppState.getAvatar("ai0").trim();
  const readFile = window.electronAPI?.readFile;
  if (avatarPath === "" || typeof readFile !== "function") {
    return;
  }

  try {
    const imageData = await readFile(avatarPath);
    if (typeof imageData !== "string" || imageData.trim() === "") {
      return;
    }

    logoEl.src = `data:${getMimeTypeFromPath(avatarPath)};base64,${imageData}`;
    logoEl.alt = nickname;
    logoEl.classList.remove("is-fallback");
    logoEl.classList.add("is-avatar");
  } catch (_error) {}
}

export function formatTimestamp(value: number): string {
  return formatDateTime(value);
}

export function clearChatArea(runtime: RuntimeState, getById: ByIdFn = byId): void {
  const chatMessages = getById<HTMLElement>("chat-messages");
  const chatEmpty = getById<HTMLElement>("chat-empty");
  if (chatMessages == null) {
    return;
  }

  chatMessages.innerHTML = "";
  if (chatEmpty != null) {
    chatMessages.appendChild(chatEmpty);
    chatEmpty.classList.remove("is-hidden");
  }

  runtime.lastRenderedMessageCount = 0;
  runtime.lastRenderedSnapshotKey = "";
}

export async function wait(delayMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

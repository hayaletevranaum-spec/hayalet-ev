import { LogCategory } from "@shared/logging-core";
import { getErrorMessage } from "@shared/index.js";
import { formatErrorWithDetail } from "../../../../shared/i18n/error-detail.js";
import { Logger } from "../../modules/logger/index.js";
import { AppI18n } from "../../modules/i18n/index.js";
import { resolveIntlLocale } from "../../../../shared/i18n/locale.js";
import {
  isOpenPathResult,
  type AttachmentData,
  type MessageItem,
} from "./message-renderer-types.js";

interface BubbleCallbacks {
  onMessageAction?: (
    action: "read" | "prepend" | "append" | "speak",
    data: { provider: string; text: string; messageId: string }
  ) => void;
}

function analyzeBubbleT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.analyze.bubble.${key}`, params);
}

function formatTimestamp(timestamp: number | undefined): string {
  if (timestamp === undefined || Number.isNaN(timestamp)) return "";
  const d = new Date(timestamp);
  return d.toLocaleString(resolveIntlLocale(AppI18n.getLocale()), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveAttachmentPath(att: AttachmentData, attachmentsBasePath: string): string {
  return att.storedPath ?? `${attachmentsBasePath}/${att.messageId}/${att.storedName ?? "unknown"}`;
}

function isImageAttachment(att: AttachmentData): boolean {
  const mimeType = att.mimeType?.toLowerCase() ?? "";
  if (mimeType.startsWith("image/")) {
    return true;
  }

  const name =
    `${att.storedName ?? ""} ${att.originalName ?? ""} ${att.storedPath ?? ""}`.toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}

function toImageMimeType(att: AttachmentData): string {
  const mimeType = att.mimeType?.trim();
  if (mimeType !== undefined && mimeType !== "") {
    return mimeType;
  }

  const name =
    `${att.storedName ?? ""} ${att.originalName ?? ""} ${att.storedPath ?? ""}`.toLowerCase();
  if (name.includes(".webp")) return "image/webp";
  if (name.includes(".gif")) return "image/gif";
  if (name.includes(".bmp")) return "image/bmp";
  if (name.includes(".svg")) return "image/svg+xml";
  if (name.includes(".jpg") || name.includes(".jpeg")) return "image/jpeg";
  return "image/png";
}

async function hydrateImageAttachmentPreview(
  img: HTMLImageElement,
  badge: HTMLElement,
  filePath: string,
  mimeType: string
): Promise<void> {
  if (filePath === "") {
    badge.textContent = analyzeBubbleT("attachmentFallback");
    return;
  }

  try {
    const electronApi = window.electronAPI;
    if (electronApi === undefined || typeof electronApi.readFile !== "function") {
      throw new Error(analyzeBubbleT("errors.electronApiUnavailable"));
    }

    const rawContent = await electronApi.readFile(filePath);
    const base64 = typeof rawContent === "string" ? rawContent.trim() : "";
    if (base64 === "") {
      throw new Error(analyzeBubbleT("errors.openFailed"));
    }

    img.src = `data:${mimeType};base64,${base64}`;
    badge.textContent = "";
    badge.hidden = true;
  } catch (err) {
    badge.textContent = analyzeBubbleT("attachmentFallback");
    Logger.warn(
      LogCategory.ANALYZE,
      analyzeBubbleT("logs.openFailed", { message: getErrorMessage(err) })
    );
  }
}

export function createMessageBubble(
  msg: MessageItem,
  provider: string,
  attachmentsBasePath: string,
  msgAttachments: AttachmentData[],
  callbacks: BubbleCallbacks
): HTMLElement {
  const bubble = document.createElement("div");
  bubble.className = `msg-bubble ${msg.role === "assistant" ? "msg-ai" : "msg-user"}`;
  bubble.dataset["messageId"] = msg.id;

  const messageText = msg.content ?? msg.text ?? "";

  const header = document.createElement("div");
  header.className = "msg-header";

  const meta = document.createElement("div");
  meta.className = "msg-meta";
  meta.textContent = msg.author ?? msg.role;
  header.appendChild(meta);

  const headerRight = document.createElement("div");
  headerRight.className = "msg-header__right";

  if (callbacks.onMessageAction && messageText.trim() !== "") {
    const actions = document.createElement("div");
    actions.className = "msg-actions";

    const actionConfigs: Array<{
      action: "read" | "prepend" | "append" | "speak";
      icon: string;
      title: string;
    }> = [
      { action: "read", icon: "👁", title: analyzeBubbleT("actions.read") },
      { action: "speak", icon: "▶", title: analyzeBubbleT("actions.speak") },
      { action: "prepend", icon: "↥", title: analyzeBubbleT("actions.prepend") },
      { action: "append", icon: "↧", title: analyzeBubbleT("actions.append") },
    ];

    actionConfigs.forEach(({ action, icon, title }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "msg-action-btn btn btn-xs btn-secondary btn-icon";
      if (action === "speak") {
        button.classList.add("msg-action-btn--speak");
        button.dataset["ttsState"] = "idle";
        button.dataset["messageId"] = msg.id;
      }
      button.dataset["messageAction"] = action;
      button.textContent = icon;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        callbacks.onMessageAction?.(action, { provider, text: messageText, messageId: msg.id });
      });
      actions.appendChild(button);
    });

    headerRight.appendChild(actions);
  }

  if (msg.createdAt !== undefined) {
    const time = document.createElement("div");
    time.className = "msg-time";
    time.textContent = formatTimestamp(msg.createdAt);
    headerRight.appendChild(time);
  }

  if (headerRight.childElementCount > 0) {
    header.appendChild(headerRight);
  }

  bubble.appendChild(header);

  const text = document.createElement("div");
  text.className = "msg-text";
  text.textContent = messageText;
  bubble.appendChild(text);

  if (msgAttachments.length > 0) {
    const attWrap = document.createElement("div");
    attWrap.className = "msg-attachments";

    msgAttachments.forEach((att: AttachmentData) => {
      const filePath = resolveAttachmentPath(att, attachmentsBasePath);
      if (!isImageAttachment(att)) {
        const link = document.createElement("button");
        link.className = "attachment-link";
        link.textContent = `📎 ${att.originalName ?? att.storedName ?? analyzeBubbleT("attachmentFallback")}`;
        link.addEventListener("click", () => {
          void openAttachmentByPath(filePath);
        });
        attWrap.appendChild(link);
        return;
      }

      const imageButton = document.createElement("button");
      imageButton.type = "button";
      imageButton.className = "attachment-link attachment-link-image";
      imageButton.title =
        att.originalName ?? att.storedName ?? analyzeBubbleT("attachmentFallback");
      imageButton.setAttribute(
        "aria-label",
        att.originalName ?? att.storedName ?? analyzeBubbleT("attachmentFallback")
      );
      imageButton.addEventListener("click", () => {
        void openAttachmentByPath(filePath);
      });

      const media = document.createElement("span");
      media.className = "attachment-link-image__media";

      const img = document.createElement("img");
      img.className = "attachment-link-image__preview";
      img.alt = att.originalName ?? att.storedName ?? analyzeBubbleT("attachmentFallback");
      img.loading = "lazy";

      const badge = document.createElement("span");
      badge.className = "attachment-link-image__badge";
      badge.textContent = analyzeBubbleT("attachmentFallback");
      media.append(img, badge);
      imageButton.append(media);
      attWrap.appendChild(imageButton);
      void hydrateImageAttachmentPreview(img, badge, filePath, toImageMimeType(att));
    });

    bubble.appendChild(attWrap);
  }

  return bubble;
}

async function openAttachmentByPath(filePath: string): Promise<void> {
  if (filePath === "") return;

  try {
    const electronApi = window.electronAPI;
    if (electronApi === undefined) {
      throw new Error(analyzeBubbleT("errors.electronApiUnavailable"));
    }
    const openPath = electronApi.openPath;
    const rawRes: unknown =
      typeof openPath === "function"
        ? await openPath(filePath)
        : { success: false, message: analyzeBubbleT("errors.openFailed") };
    const res = isOpenPathResult(rawRes) ? rawRes : null;
    if (res?.success !== true) {
      throw new Error(formatErrorWithDetail(analyzeBubbleT("errors.openFailed"), res?.message));
    }
  } catch (err) {
    Logger.warn(
      LogCategory.ANALYZE,
      analyzeBubbleT("logs.openFailed", { message: getErrorMessage(err) })
    );
  }
}

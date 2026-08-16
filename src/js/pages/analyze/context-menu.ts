import { AppState } from "../../modules/app-state.js";
import { ModalManager } from "../../ui/modal-manager.js";

export interface MessageActionPayload {
  provider: string;
  text?: string;
}

export type MessageAction = "read" | "prepend" | "append";
type ActionCallback = () => void;

let readModalController: { close: () => void } | null = null;

export function applyMessageAction(
  action: MessageAction,
  payload: MessageActionPayload,
  onAction?: ActionCallback
): void {
  if (action === "read") {
    showReadModal(payload);
    return;
  }

  const textarea = document.getElementById("compose-input") as HTMLTextAreaElement | null;
  if (!textarea) return;

  const nickname = AppState.getNickname(payload.provider);
  const prefix = `${nickname} : `;
  const current = textarea.value;

  const newVal =
    action === "prepend"
      ? `${prefix}${payload.text ?? ""}\n${current}`.trim()
      : `${current}\n${prefix}${payload.text ?? ""}`.trim();

  textarea.value = newVal;

  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  onAction?.();
}

export function showReadModal(payload: MessageActionPayload): void {
  readModalController?.close();

  const content = document.createElement("div");
  content.textContent = payload.text ?? "";

  readModalController = ModalManager.open({
    content,
    size: "large",
    containerClassName: "modal-document modal-read",
    onClose: () => {
      readModalController = null;
    },
  });

  queueMicrotask(() => {
    content.scrollTop = 0;
  });
}

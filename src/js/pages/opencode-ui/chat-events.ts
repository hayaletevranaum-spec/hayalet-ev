import type { ComposerAttachment } from "./types.js";
import type { ByIdFn } from "./host-helpers.js";
import { t } from "./i18n.js";

interface InitOpencodeUiChatEventsOptions {
  byId: ByIdFn;
  showToast: (message: string) => void;
  sendMessage: () => Promise<void>;
  setSendButtonState: () => void;
  pruneLastMessages: () => void;
  clearChat: () => Promise<void>;
  stageFileList: (files: FileList | File[], source: ComposerAttachment["source"]) => Promise<void>;
  readClipboardAttachmentsFromEvent: (event: ClipboardEvent) => Promise<boolean>;
  readClipboardAttachmentsFromSystem: () => Promise<ComposerAttachment[]>;
  stageComposerAttachments: (attachments: ComposerAttachment[]) => void;
  removeComposerAttachment: (attachmentId: string) => void;
  renderAttachmentTray: () => void;
}

export function initOpencodeUiChatEvents(options: InitOpencodeUiChatEventsOptions): void {
  const chatInput = options.byId<HTMLTextAreaElement>("chat-input");
  const sendBtn = options.byId<HTMLButtonElement>("send-btn");
  const pruneBtn = options.byId<HTMLButtonElement>("prune-btn");
  const clearBtn = options.byId<HTMLButtonElement>("clear-btn");
  const attachInput = options.byId<HTMLInputElement>("attach-file-input");
  const attachmentTray = options.byId<HTMLElement>("clipboard-preview-area");

  if (chatInput == null || sendBtn == null) {
    return;
  }

  const updateInputState = (): void => {
    // NOTE: Auto-resize relies on runtime scrollHeight; CSS max-height clamps the result.
    chatInput.style.height = "";
    chatInput.style.height = `${String(chatInput.scrollHeight)}px`;
    options.setSendButtonState();
  };

  sendBtn.addEventListener("click", () => {
    void options.sendMessage();
  });

  chatInput.addEventListener("input", updateInputState);
  chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.ctrlKey) {
      event.preventDefault();
      void options.sendMessage();
    }
  });
  chatInput.addEventListener("paste", (event) => {
    void options.readClipboardAttachmentsFromEvent(event);
  });

  pruneBtn?.addEventListener("click", () => {
    options.pruneLastMessages();
  });

  clearBtn?.addEventListener("click", () => {
    void options.clearChat();
  });

  const attachFileBtn = options.byId<HTMLButtonElement>("attach-file-btn");
  attachFileBtn?.addEventListener("click", () => {
    attachInput?.click();
  });
  attachInput?.addEventListener("change", () => {
    const files = attachInput.files;
    if (files == null || files.length === 0) {
      return;
    }
    void options.stageFileList(files, "file-picker");
    attachInput.value = "";
  });

  const attachImageBtn = options.byId<HTMLButtonElement>("attach-image-btn");
  attachImageBtn?.addEventListener("click", () => {
    void (async (): Promise<void> => {
      try {
        const attachments = await options.readClipboardAttachmentsFromSystem();
        if (attachments.length === 0) {
          options.showToast(t("chat.clipboardEmpty"));
          return;
        }
        options.stageComposerAttachments(attachments);
      } catch (error) {
        options.showToast(
          t("chat.clipboardReadError", {
            message: error instanceof Error && error.message !== "" ? error.message : String(error),
          })
        );
      }
    })();
  });
  attachmentTray?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const attachmentId = target.getAttribute("data-attachment-remove");
    if (attachmentId == null || attachmentId === "") {
      return;
    }

    options.removeComposerAttachment(attachmentId);
  });

  options.renderAttachmentTray();
  updateInputState();
}

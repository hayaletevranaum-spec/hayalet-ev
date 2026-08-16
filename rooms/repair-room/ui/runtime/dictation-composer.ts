import type { RepairUiState } from "../../shared/ui/state.js";
import type { createRepairUiRequestRuntime } from "../../shared/ui/request-runtime.js";

type RepairUiRequestRuntime = ReturnType<typeof createRepairUiRequestRuntime>;

export function createRepairDictationComposer(params: {
  documentRef: Document;
  requestRuntime: RepairUiRequestRuntime;
  state: RepairUiState;
}) {
  const { documentRef, requestRuntime, state } = params;

  function getChatComposerInput(): HTMLInputElement | null {
    return documentRef.querySelector<HTMLInputElement>("[data-repair-input='feed-composer']");
  }

  function mergeComposerDraft(currentDraft: string, transcriptText: string): string {
    const current = currentDraft.trim();
    const transcript = transcriptText.trim();
    if (current === "") return transcript;
    if (transcript === "") return current;
    return `${current} ${transcript}`;
  }

  function setChatComposerDraft(draft: string): void {
    state.chat.composerDraft = draft;
    const input = getChatComposerInput();
    if (input !== null) {
      input.value = draft;
    }
    requestRuntime.setChatComposer({ draft });
  }

  function shouldStageDictationForConfirmation(): boolean {
    return (
      state.layout.voiceGuidance.handsBusyMode &&
      state.layout.interactionSettings.dictationSubmitMode === "send"
    );
  }

  function normalizeDictationCommand(textValue: string): string {
    return textValue
      .trim()
      .toLocaleLowerCase("en-US")
      .replace(/[.!?]+$/g, "")
      .trim();
  }

  function handleStagedDictationCommand(commandText: string, stagedDraft: string): boolean {
    const command = normalizeDictationCommand(commandText);
    if (["send", "send it", "send message", "gönder", "mesajı gönder"].includes(command)) {
      requestRuntime.sendChatTurn({ text: stagedDraft });
      setChatComposerDraft("");
      return true;
    }
    if (["clear", "discard", "cancel", "temizle", "iptal"].includes(command)) {
      setChatComposerDraft("");
      return true;
    }
    return false;
  }

  function handleTranscriptIngress(msg: { isFinal: boolean; text: string }): void {
    if (msg.isFinal !== true) return;
    const transcriptText = msg.text.trim();
    if (transcriptText === "") return;

    const input = getChatComposerInput();
    const currentDraft = input?.value ?? state.chat.composerDraft;
    const trimmedCurrentDraft = currentDraft.trim();
    if (
      shouldStageDictationForConfirmation() &&
      trimmedCurrentDraft !== "" &&
      handleStagedDictationCommand(transcriptText, trimmedCurrentDraft)
    ) {
      return;
    }

    const nextDraft = mergeComposerDraft(currentDraft, transcriptText);
    const shouldSend =
      state.layout.interactionSettings.dictationSubmitMode === "send" &&
      state.chat.pendingReplyId === null &&
      !shouldStageDictationForConfirmation();

    if (shouldSend) {
      state.chat.composerDraft = "";
      if (input !== null) {
        input.value = "";
      }
      requestRuntime.setChatComposer({ draft: "" });
      requestRuntime.sendChatTurn({ text: nextDraft });
      return;
    }

    setChatComposerDraft(nextDraft);
  }

  return {
    handleTranscriptIngress,
    setChatComposerDraft,
  };
}

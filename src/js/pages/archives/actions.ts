import type { TranslationParams } from "@shared/i18n.js";
import { LogCategory } from "@shared/logging-core";
import { AppState } from "../../modules/app-state.js";
import { ConversationListManager } from "../../modules/conversation-list-manager.js";
import { AppI18n } from "../../modules/i18n/index.js";
import { resolveIpcErrorMessage } from "../../modules/ipc-errors.js";
import { Logger } from "../../modules/logger/index.js";
import { ButtonStates } from "../../ui/button-states.js";
import { formatErrorWithDetail } from "../../../../shared/i18n/error-detail.js";
import {
  mapFileResult,
  mapMessageResult,
  toRecord,
  toRecordArray,
  unwrapIpcData,
} from "./ipc-mappers.js";
import type { ArchiveEntry, FileResult, MessageResult } from "./types.js";

function archivesT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`app.archives.${key}`, params);
}

type ArchivesIpcResult = {
  success?: boolean;
  error?: string;
  errorKey?: string;
  errorParams?: TranslationParams;
};

function resolveArchiveActionError(
  result: ArchivesIpcResult | undefined,
  fallbackKey: string
): string {
  return resolveIpcErrorMessage(result) ?? archivesT(fallbackKey);
}

export interface ArchivesActionsContext {
  selectedId: string | null;
  entries: ArchiveEntry[];
  activeProvider: string;
  searchQuery: string;
  searchScope: string;
  searchResults: { messages: MessageResult[]; attachments: FileResult[] };
  listEl: HTMLElement | null;
  titleEl: HTMLInputElement | null;
  summaryEl: HTMLTextAreaElement | null;
  setStatus: (text: string, type?: string) => void;
  fillForm: (entry: ArchiveEntry | null) => void;
  loadIndex: () => Promise<void>;
  renderList: () => void;
  renderSearchResults: () => void;
  clearSearchResults: () => void;
}

export async function deleteArchiveEntry(
  ctx: ArchivesActionsContext,
  entry: ArchiveEntry | null
): Promise<void> {
  if (!entry) return;
  if (
    !confirm(
      archivesT("actions.deleteConfirm", {
        title: entry.title ?? entry.id,
      })
    )
  ) {
    return;
  }

  const deleteBtn = document.getElementById("btn-delete") as HTMLButtonElement | null;

  try {
    if (deleteBtn) {
      ButtonStates.setLoading(deleteBtn, archivesT("actions.buttons.deleteLoading"));
    }

    const accountId =
      entry.accountId ?? AppState.getArchiveAccountIdForProvider(entry.provider ?? "");
    if (accountId === null || accountId === "") {
      if (deleteBtn) {
        ButtonStates.setError(deleteBtn, archivesT("actions.buttons.error"), 1500);
      }
      ctx.setStatus(archivesT("actions.status.accountInfoMissing"), "error");
      return;
    }

    const electronApi = window.electronAPI;
    if (electronApi === undefined) {
      if (deleteBtn) {
        ButtonStates.setError(deleteBtn, archivesT("actions.buttons.error"), 1500);
      }
      ctx.setStatus(archivesT("actions.status.electronApiUnavailable"), "error");
      return;
    }

    const resultRaw: unknown = await electronApi.dbDeleteConversation({
      accountId,
      conversationId: entry.id,
    });
    const result = resultRaw as ArchivesIpcResult | undefined;

    if (result?.success !== true) {
      if (deleteBtn) {
        ButtonStates.setError(deleteBtn, archivesT("actions.buttons.error"), 1500);
      }
      ctx.setStatus(resolveArchiveActionError(result, "actions.status.deleteFailed"), "error");
      return;
    }

    if (deleteBtn) {
      ButtonStates.setSuccess(deleteBtn, archivesT("actions.buttons.deleteSuccess"), 1500);
    }

    Logger.info(LogCategory.ARCHIVES, archivesT("actions.logs.deleted", { id: entry.id }));

    const isActive = ctx.selectedId === entry.id;
    if (isActive) {
      ctx.selectedId = null;
    }

    await ctx.loadIndex();
    await ConversationListManager.refresh({ silent: true });

    if (isActive) {
      ctx.fillForm(null);
    }
    ctx.setStatus(archivesT("actions.status.deleted"), "success");
  } catch (error) {
    const err = error as Error;
    if (deleteBtn) {
      ButtonStates.setError(deleteBtn, archivesT("actions.buttons.error"), 1500);
    }
    Logger.error(
      LogCategory.ARCHIVES,
      archivesT("actions.logs.deleteError", { message: err.message })
    );
    ctx.setStatus(formatErrorWithDetail(archivesT("actions.status.deleteError"), err), "error");
  }
}

export async function performArchiveSearch(ctx: ArchivesActionsContext): Promise<void> {
  if (ctx.searchQuery === "" || ctx.searchQuery.length < 2) {
    ctx.clearSearchResults();
    return;
  }

  try {
    let messages: MessageResult[] = [];
    let attachments: FileResult[] = [];

    if (ctx.searchScope === "all") {
      const resultsRaw = await window.electronAPI?.["dbSearchAllAccounts"]?.({
        query: ctx.searchQuery,
        limit: 50,
      });

      const allData = toRecord(unwrapIpcData(resultsRaw));
      const messageRows = toRecordArray(allData?.["messages"]);
      const attachmentRows = toRecordArray(allData?.["attachments"]);

      messages = messageRows.map((row) => mapMessageResult(row));
      attachments = attachmentRows.map((row) => mapFileResult(row));
    } else {
      const accountId = AppState.getArchiveAccountIdForProvider(ctx.activeProvider);
      if (accountId === null || accountId === "") {
        ctx.searchResults = { messages: [], attachments: [] };
        ctx.renderSearchResults();
        return;
      }

      const dbSearchMessages = window.electronAPI?.dbSearchMessages;
      const dbSearchAttachments = window.electronAPI?.["dbSearchAttachments"];
      let messagesRaw: unknown;
      let attachmentsRaw: unknown;
      if (typeof dbSearchMessages === "function") {
        messagesRaw = await dbSearchMessages({
          accountId,
          query: ctx.searchQuery,
          limit: 50,
        });
      }
      if (typeof dbSearchAttachments === "function") {
        attachmentsRaw = await dbSearchAttachments({
          accountId,
          query: ctx.searchQuery,
          limit: 50,
        });
      }

      const messageRows = toRecordArray(unwrapIpcData(messagesRaw));
      const attachmentRows = toRecordArray(unwrapIpcData(attachmentsRaw));

      messages = messageRows.map((row) => {
        const mapped = mapMessageResult(row);
        return {
          ...mapped,
          accountId: mapped.accountId ?? accountId,
        };
      });
      attachments = attachmentRows.map((row) => {
        const mapped = mapFileResult(row);
        return {
          ...mapped,
          accountId: mapped.accountId ?? accountId,
        };
      });
    }

    ctx.searchResults = { messages, attachments };
    ctx.renderSearchResults();
  } catch (error) {
    const err = error as Error;
    Logger.error(
      LogCategory.ARCHIVES,
      archivesT("actions.logs.searchError", { message: err.message })
    );
    ctx.searchResults = { messages: [], attachments: [] };
    ctx.renderSearchResults();
  }
}

export async function navigateArchiveResult(
  ctx: ArchivesActionsContext,
  result: MessageResult | FileResult,
  type: string
): Promise<void> {
  if (type === "file") {
    const fileResult = result as FileResult;
    if (fileResult.storedPath !== undefined && fileResult.storedPath !== "") {
      try {
        const electronApi = window.electronAPI;
        if (electronApi === undefined) {
          ctx.setStatus(archivesT("actions.status.electronApiUnavailable"), "error");
          return;
        }
        await electronApi.openPath(fileResult.storedPath);
      } catch {
        ctx.setStatus(archivesT("actions.status.fileOpenFailed"), "error");
      }
    }
    return;
  }

  const { accountId, conversationId } = result;
  if (
    accountId === undefined ||
    accountId === "" ||
    conversationId === undefined ||
    conversationId === ""
  ) {
    return;
  }

  const targetProvider = AppState.resolveArchiveProviderByAccountId(accountId);

  if (targetProvider === null) {
    ctx.setStatus(archivesT("actions.status.accountMissing"), "error");
    return;
  }

  if (ctx.activeProvider !== targetProvider) {
    ctx.activeProvider = targetProvider;
    const radio = document.querySelector<HTMLInputElement>(
      `input[name="archives-provider"][value="${targetProvider}"]`
    );
    if (radio !== null) radio.checked = true;
    await ctx.loadIndex();
  }

  ctx.selectedId = conversationId;
  ctx.renderList();

  const entry = ctx.entries.find(
    (item) => item.id === conversationId && item.provider === targetProvider
  );
  if (entry) {
    ctx.fillForm(entry);

    const item = ctx.listEl?.querySelector(`.archive-item.selected`);
    item?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

export async function saveArchiveSelection(ctx: ArchivesActionsContext): Promise<void> {
  const saveBtn = document.getElementById("archive-save") as HTMLButtonElement | null;

  if (ctx.selectedId === null || ctx.selectedId === "") {
    ctx.setStatus(archivesT("actions.status.conversationNotSelected"), "warning");
    return;
  }
  const entry = ctx.entries.find(
    (item) => item.id === ctx.selectedId && item.provider === ctx.activeProvider
  );
  if (entry === undefined) {
    ctx.setStatus(archivesT("actions.status.entryNotFound"), "error");
    return;
  }

  const accountId =
    entry.accountId ?? AppState.getArchiveAccountIdForProvider(entry.provider ?? "");
  if (accountId === null || accountId === "") {
    ctx.setStatus(archivesT("actions.status.accountInfoMissing"), "error");
    return;
  }

  const electronApi = window.electronAPI;
  if (electronApi === undefined) {
    ctx.setStatus(archivesT("actions.status.electronApiUnavailable"), "error");
    return;
  }

  if (saveBtn) {
    ButtonStates.setLoading(saveBtn, archivesT("actions.buttons.saveLoading"));
  }

  const newTitle = ctx.titleEl?.value ?? entry.title;
  const newSummary = ctx.summaryEl?.value ?? entry.summary;

  try {
    const resultRaw: unknown = await electronApi.dbUpdateConversation({
      accountId,
      conversationId: entry.id,
      title: newTitle,
      summary: newSummary,
    });
    const result = resultRaw as ArchivesIpcResult | undefined;

    if (result?.success === true) {
      if (saveBtn) {
        ButtonStates.setSuccess(saveBtn, archivesT("actions.buttons.saveSuccess"), 1500);
      }
      ctx.setStatus(archivesT("actions.status.saved"), "success");
      Logger.info(LogCategory.ARCHIVES, archivesT("actions.logs.archiveUpdated"));
      await ConversationListManager.refresh({ silent: true });
      await ctx.loadIndex();
    } else {
      if (saveBtn) {
        ButtonStates.setError(saveBtn, archivesT("actions.buttons.error"), 1500);
      }
      ctx.setStatus(resolveArchiveActionError(result, "actions.status.saveFailed"), "error");
    }
  } catch (error) {
    const err = error as Error;
    if (saveBtn) {
      ButtonStates.setError(saveBtn, archivesT("actions.buttons.error"), 1500);
    }
    Logger.error(
      LogCategory.ARCHIVES,
      archivesT("actions.logs.saveError", { message: err.message })
    );
    ctx.setStatus(formatErrorWithDetail(archivesT("actions.status.saveFailed"), err), "error");
  }
}

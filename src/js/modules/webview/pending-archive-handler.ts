import { LogCategory } from "@shared/logging-core";
import { Logger } from "../logger/index.js";
import { getErrorMessage } from "@shared/index.js";
import { FileManager } from "../file-manager.js";
import { AppState } from "../app-state.js";

interface StagedFile {
  name: string;
  path: string;
  commandPath?: string;
  originalName?: string;
}

interface PendingEntry {
  jobId: string;
  folder?: string;
  temp?: string[];
  stagedFiles?: StagedFile[];
}

interface SyncMessage {
  id?: string;
  role: string;
  attachments?: string[];
}

interface SyncResult {
  messages?: SyncMessage[] | undefined;
  conversationId?: string | undefined;
  [key: string]: unknown;
}

interface DbSaveAttachmentResult {
  success?: boolean;
  error?: string;
}

function isDbSaveAttachmentResult(value: unknown): value is DbSaveAttachmentResult {
  if (value === null || value === undefined || typeof value !== "object") {
    return false;
  }

  const maybe = value as Record<string, unknown>;
  const successValue = maybe["success"];
  const errorValue = maybe["error"];
  const successIsValid = successValue === undefined || typeof successValue === "boolean";
  const errorIsValid = errorValue === undefined || typeof errorValue === "string";

  return successIsValid && errorIsValid;
}

class PendingArchiveHandlerClass {
  _pendingArchives: Record<string, PendingEntry[]>;

  constructor() {
    this._pendingArchives = {};
  }

  addPending(provider: string, entry: PendingEntry): void {
    if (provider === "") return;

    this._pendingArchives[provider] = this._pendingArchives[provider] ?? [];
    this._pendingArchives[provider].push(entry);
  }

  processPending(provider: string, syncResult: SyncResult): void {
    try {
      const list = this._pendingArchives[provider] ?? [];
      if (list.length === 0) return;

      delete this._pendingArchives[provider];

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const history = syncResult?.messages ?? [];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const conversationId = syncResult?.conversationId;

      const lastUserIdx = [...history].reverse().findIndex((m) => m.role === "user");

      const messageIndex = lastUserIdx === -1 ? history.length : history.length - 1 - lastUserIdx;

      const message = history[messageIndex];

      for (const entry of list) {
        void this._processEntry(entry, provider, message, conversationId);
      }
    } catch (e) {
      Logger.warnT(
        LogCategory.WEBVIEW,
        "app.logs.pendingArchive.processPendingError",
        { message: getErrorMessage(e) },
        { error: getErrorMessage(e) }
      );
    }
  }

  async _processEntry(
    entry: PendingEntry,
    provider: string,
    message: SyncMessage | undefined,
    conversationId: string | undefined
  ): Promise<void> {
    try {
      const accountInfo = AppState.getAccountForSlot(provider);
      if (
        accountInfo?.id === undefined ||
        accountInfo.id === "" ||
        message?.id === undefined ||
        message.id === "" ||
        conversationId === undefined ||
        conversationId === ""
      ) {
        Logger.warnT(
          LogCategory.WEBVIEW,
          "app.logs.pendingArchive.missingInfo",
          { jobId: entry.jobId },
          {
            jobId: entry.jobId,
            accountId: accountInfo?.id,
            messageId: message?.id,
            conversationId,
          }
        );
        return;
      }

      const stagedFiles = entry.stagedFiles ?? [];

      Logger.infoT(
        LogCategory.WEBVIEW,
        "app.logs.pendingArchive.processingAttachments",
        { count: stagedFiles.length, messageId: message.id },
        {
          attachmentCount: stagedFiles.length,
          messageId: message.id,
          jobId: entry.jobId,
        }
      );

      await stagedFiles.reduce(async (prev, file) => {
        await prev;
        const filePath = file.commandPath ?? file.path;
        if (filePath === "") return;

        const saveAttachment = window.electronAPI?.["dbSaveAttachment"] as
          ((payload: Record<string, unknown>) => Promise<unknown>) | undefined;
        if (typeof saveAttachment !== "function") {
          Logger.errorT(
            LogCategory.WEBVIEW,
            "app.logs.pendingArchive.attachmentSaveBridgeUnavailable",
            { file: file.name },
            {
              file: file.name,
              error: "dbSaveAttachment-not-available",
            }
          );
          return;
        }

        const rawRes: unknown = await saveAttachment({
          accountId: accountInfo.id,
          conversationId,
          messageId: message.id,
          filePath,
          originalName: file.originalName ?? file.name,
          mimeType: null,
        });
        const res = isDbSaveAttachmentResult(rawRes) ? rawRes : null;

        if (res?.success !== true) {
          Logger.errorT(
            LogCategory.WEBVIEW,
            "app.logs.pendingArchive.attachmentSaveFailed",
            { file: file.name, message: res?.error ?? "unknown" },
            {
              file: file.name,
              error: res?.error ?? "unknown",
            }
          );
        }
      }, Promise.resolve());

      Logger.infoT(
        LogCategory.WEBVIEW,
        "app.logs.pendingArchive.attachmentsProcessed",
        { jobId: entry.jobId },
        {
          jobId: entry.jobId,
        }
      );

      this._cleanup(entry);
    } catch (e) {
      Logger.warnT(
        LogCategory.WEBVIEW,
        "app.logs.pendingArchive.processingFailed",
        { jobId: entry.jobId, message: getErrorMessage(e) },
        {
          jobId: entry.jobId,
          error: getErrorMessage(e),
        }
      );
    }
  }

  _cleanup(entry: { jobId: string; temp?: string[] }): void {
    try {
      FileManager.commandCleanup(
        entry.jobId,
        (entry.temp ?? []).map((t: string) => ({ tempPath: t }))
      );
    } catch (e) {
      Logger.warnT(
        LogCategory.WEBVIEW,
        "app.logs.pendingArchive.cleanupFailed",
        { jobId: entry.jobId, message: getErrorMessage(e) },
        {
          jobId: entry.jobId,
          error: getErrorMessage(e),
        }
      );
    }
  }

  clearPending(provider: string): void {
    if (provider !== "") {
      delete this._pendingArchives[provider];
    }
  }

  clearAll(): void {
    this._pendingArchives = {};
  }

  hasPending(provider: string): boolean {
    return (this._pendingArchives[provider]?.length ?? 0) > 0;
  }

  getPendingCount(provider?: string): number {
    if (provider !== undefined && provider !== "") {
      return this._pendingArchives[provider]?.length ?? 0;
    }

    return Object.values(this._pendingArchives).reduce((sum, list) => sum + list.length, 0);
  }
}

const pendingArchiveHandler = new PendingArchiveHandlerClass();
export { pendingArchiveHandler as PendingArchiveHandler };

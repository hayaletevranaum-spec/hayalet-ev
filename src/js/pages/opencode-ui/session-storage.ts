import type {
  OpencodeUiFsReadResult,
  OpencodeUiSessionDetail,
  OpencodeUiSessionSummary,
  RuntimeState,
} from "./types.js";
import { formatDetailedErrorMessage, t } from "./i18n.js";
import { resolveIpcErrorMessage } from "../../modules/ipc-errors.js";

export interface OpencodeUiSessionStorage {
  listSessionsFromDisk(): Promise<OpencodeUiSessionSummary[]>;
  ensureSessionInDisk(sessionId: string, title?: string): Promise<void>;
  readSessionFromDisk(sessionId: string): Promise<OpencodeUiSessionDetail | null>;
  archiveSessionInDisk(sessionId: string, archived?: boolean): Promise<void>;
}

export function createSessionStorage(runtime: RuntimeState): OpencodeUiSessionStorage {
  const dbPathArg = (): string | undefined => {
    const path = runtime.dbPath.trim();
    return path !== "" ? path : undefined;
  };

  return {
    async listSessionsFromDisk(): Promise<OpencodeUiSessionSummary[]> {
      const electronApi = window.electronAPI;
      if (electronApi === undefined) {
        throw new Error(t("storage.electronUnavailable"));
      }

      const result = await electronApi.opencodeUiFsListSessions(dbPathArg());
      if (result.success !== true) {
        throw new Error(
          formatDetailedErrorMessage("storage.listFailed", resolveIpcErrorMessage(result))
        );
      }

      const sessions = Array.isArray(result.sessions) ? result.sessions : [];
      return sessions.slice().sort((a, b) => {
        const bUpdated = Number(b.updated_at);
        const aUpdated = Number(a.updated_at);
        const safeBUpdated = Number.isFinite(bUpdated) ? bUpdated : 0;
        const safeAUpdated = Number.isFinite(aUpdated) ? aUpdated : 0;
        return safeBUpdated - safeAUpdated;
      });
    },

    async ensureSessionInDisk(sessionId: string, title?: string): Promise<void> {
      const electronApi = window.electronAPI;
      if (electronApi === undefined) {
        throw new Error(t("storage.electronUnavailable"));
      }

      const result = await electronApi.opencodeUiFsEnsureSession(sessionId, title, dbPathArg());

      if (result.success !== true) {
        throw new Error(
          formatDetailedErrorMessage("storage.ensureFailed", resolveIpcErrorMessage(result))
        );
      }
    },

    async readSessionFromDisk(sessionId: string): Promise<OpencodeUiSessionDetail | null> {
      const electronApi = window.electronAPI;
      if (electronApi === undefined) {
        throw new Error(t("storage.electronUnavailable"));
      }

      const result = (await electronApi.opencodeUiFsReadSession(
        sessionId,
        dbPathArg()
      )) as OpencodeUiFsReadResult;
      if (result.success !== true) {
        return null;
      }

      return result.session ?? null;
    },

    async archiveSessionInDisk(sessionId: string, archived = true): Promise<void> {
      const electronApi = window.electronAPI;
      if (electronApi === undefined) {
        throw new Error(t("storage.electronUnavailable"));
      }

      const result = await electronApi.opencodeUiFsArchiveSession(sessionId, archived, dbPathArg());

      if (result.success !== true) {
        throw new Error(
          formatDetailedErrorMessage("storage.archiveFailed", resolveIpcErrorMessage(result))
        );
      }
    },
  };
}

import { LogCategory, LogLevel } from "@shared/index.js";
import type { TranslationParams } from "../../src/types/i18n.js";
import { getLoggerCore } from "../logger/index.js";
import { translateElectronMessage } from "../i18n/language-service.ts";
import { registerHandler } from "./ipc-helpers.ts";
import {
  createBackup,
  deleteBackup,
  inspectBackup,
  listBackups,
  listPresets,
  listScopes,
  previewBackupRestore,
  restoreBackup,
} from "../../scripts/backup-runtime/index.mjs";

const logger = getLoggerCore();

async function backupT(key: string, params?: TranslationParams): Promise<string> {
  return await translateElectronMessage(`electron.backup.${key}`, params);
}

export function setupBackupHandlers(): void {
  registerHandler(
    "backup-create",
    async (
      _event,
      payload: {
        scopeIds?: string[];
        presetId?: string;
        outputPath?: string;
        label?: string;
        note?: string;
        createdBy?: string;
      }
    ) => {
      const result = await createBackup({
        scopeIds: Array.isArray(payload.scopeIds) ? payload.scopeIds : [],
        presetId: payload.presetId,
        outputPath: payload.outputPath,
        label: payload.label,
        note: payload.note,
        createdBy: payload.createdBy ?? "ui",
      });

      await logger.logInternalT(
        LogCategory.IPC,
        LogLevel.SUCCESS,
        "electron.backup.logs.createCompleted",
        { path: result.bundlePath }
      );

      return result;
    }
  );

  registerHandler(
    "backup-list",
    async (_event, payload?: { limit?: number }) => await listBackups({ limit: payload?.limit })
  );

  registerHandler("backup-delete", async (_event, payload: { filePath: string }) => {
    if (typeof payload.filePath !== "string" || payload.filePath.trim() === "") {
      throw new Error(await backupT("fileRequired"));
    }

    const result = await deleteBackup(payload.filePath);
    await logger.logInternalT(
      LogCategory.IPC,
      LogLevel.SUCCESS,
      "electron.backup.logs.deleteCompleted",
      { path: result.filePath }
    );

    return result;
  });

  registerHandler("backup-scopes", async () => {
    const result = (await listScopes()) as unknown;
    return Array.isArray(result) ? (result as unknown[]) : [];
  });
  registerHandler("backup-presets", async () => {
    const result = (await listPresets()) as unknown;
    return Array.isArray(result) ? (result as unknown[]) : [];
  });

  registerHandler("backup-inspect", async (_event, payload: { filePath: string }) => {
    if (typeof payload.filePath !== "string" || payload.filePath.trim() === "") {
      throw new Error(await backupT("fileRequired"));
    }
    return await inspectBackup(payload.filePath);
  });

  registerHandler(
    "backup-preview",
    async (_event, payload: { filePath: string; scopeIds?: string[] }) => {
      if (typeof payload.filePath !== "string" || payload.filePath.trim() === "") {
        throw new Error(await backupT("fileRequired"));
      }
      return await previewBackupRestore({
        filePath: payload.filePath,
        scopeIds: Array.isArray(payload.scopeIds) ? payload.scopeIds : [],
      });
    }
  );

  registerHandler(
    "backup-restore",
    async (
      _event,
      payload: {
        filePath: string;
        scopeIds?: string[];
        createdBy?: string;
        safetyBackup?: boolean;
      }
    ) => {
      if (typeof payload.filePath !== "string" || payload.filePath.trim() === "") {
        throw new Error(await backupT("fileRequired"));
      }

      const result = (await restoreBackup({
        filePath: payload.filePath,
        scopeIds: Array.isArray(payload.scopeIds) ? payload.scopeIds : [],
        createdBy: payload.createdBy ?? "ui",
        safetyBackup: payload.safetyBackup !== false,
      })) as unknown;
      const restoreResult = result as {
        bundlePath?: unknown;
        restoredFiles?: unknown;
      };
      const restoredFilesCount: number = Array.isArray(restoreResult.restoredFiles)
        ? restoreResult.restoredFiles.length
        : 0;

      await logger.logInternalT(
        LogCategory.IPC,
        LogLevel.SUCCESS,
        "electron.backup.logs.restoreCompleted",
        {
          path: typeof restoreResult.bundlePath === "string" ? restoreResult.bundlePath : "",
          restoredFiles: restoredFilesCount,
        }
      );

      return restoreResult;
    }
  );
}

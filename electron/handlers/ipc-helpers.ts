import type { IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import type { IpcHandler, IpcResult } from "@electron/types";
import { LoggerCore } from "../logger/core/LoggerCore.js";
import { getLoggerCore } from "../logger/index.js";
import { LogCategory, LogLevel } from "@shared/index.js";
import type { LogEntry } from "@shared/index.js";

const logger = getLoggerCore();

export const handleIPC =
  <Args extends unknown[], R>(handlerFn: IpcHandler<Args, R>) =>
  async (event: IpcMainInvokeEvent, ...args: Args): Promise<R | IpcResult> => {
    try {
      return await handlerFn(event, ...args);
    } catch (err) {
      const error = err instanceof Error ? err : null;
      const message = error?.message ?? String(err);
      await logger.logInternalT(
        LogCategory.IPC,
        LogLevel.ERROR,
        "electron.ipc.logs.handlerError",
        { message },
        {
          error: {
            name: error?.name ?? "Error",
            message,
            stack: error?.stack,
          },
        }
      );
      return {
        success: false,
        error: message,
        errorKey: "electron.ipc.errors.handlerError",
        errorParams: { message },
        code: "IPC_ERROR",
      };
    }
  };

export const registerHandler = <Args extends unknown[], R>(
  channel: string,
  handler: IpcHandler<Args, R>
): void => {
  ipcMain.handle(channel, handleIPC(handler));
};

export const handleLoggerAppendBatch = async (
  _event: IpcMainInvokeEvent,
  entries: unknown[]
): Promise<IpcResult> => {
  try {
    const logger = LoggerCore.getInstance();
    await logger.handleBatch(_event, {
      entries: entries as LogEntry[],
      sessionId: "",
      batchTimestamp: new Date().toISOString(),
      processSource: "renderer",
    });
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err : null;
    const message = error?.message ?? String(err);
    await logger.logInternalT(
      LogCategory.IPC,
      LogLevel.ERROR,
      "electron.ipc.logs.loggerBatchAppendFailed",
      { message },
      {
        entriesCount: Array.isArray(entries) ? entries.length : 0,
        error: {
          name: error?.name ?? "Error",
          message,
          stack: error?.stack,
        },
      }
    );
    return {
      success: false,
      error: message,
      errorKey: "electron.ipc.errors.loggerBatchAppendFailed",
      errorParams: { message },
    };
  }
};

import type { BrowserWindow } from "electron";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { fmTempPath, fmEnsureDirs, openPath } from "../file-manager.ts";
import { registerHandler } from "./ipc-helpers.ts";
import { getLoggerCore } from "../logger/index.js";
import { LogCategory, LogLevel } from "@shared/index.js";

const logger = getLoggerCore();

export function setupFsHandlers(_mainWindow: BrowserWindow | null): void {
  registerHandler(
    "fm-temp-path",
    async (event, prefix, ext) => await fmTempPath(event, prefix as string, ext as string)
  );
  registerHandler("fm-ensure-dirs", fmEnsureDirs);
  registerHandler("open-path", async (_event, path) => await openPath(path as string));

  registerHandler("read-directory-files", async (_event, dirPath: string) => {
    try {
      const entries = await readdir(dirPath);
      const results = await Promise.all(
        entries.map(async (name) => {
          const fullPath = join(dirPath, name);
          try {
            const stats = await stat(fullPath);
            return {
              name,
              path: fullPath,
              isDirectory: stats.isDirectory(),
            };
          } catch {
            return { name, path: fullPath, isDirectory: false };
          }
        })
      );
      return results;
    } catch (err) {
      await logger.logInternal(
        LogCategory.FILE_MANAGER,
        LogLevel.ERROR,
        `read-directory-files error: ${(err as Error).message}`,
        {
          dirPath,
          error: {
            name: (err as Error).name,
            message: (err as Error).message,
            stack: (err as Error).stack,
          },
        }
      );
      return [];
    }
  });
}

import { Logger } from "./logger/index.js";
import { LogCategory } from "@shared/logging-core";
import { getErrorMessage } from "@shared/index.js";
import { formatErrorWithDetail } from "../../../shared/i18n/error-detail.js";
import { getMimeType, getFilename, generateUniqueId } from "../constants/index.js";
import { AppI18n } from "./i18n/index.js";

interface FileEntry {
  name?: string;
  originalName?: string;
  path?: string;
  tempPath?: string;
  commandPath?: string;
}

interface ReadResult {
  name: string;
  base64: string;
  mimeType: string;
}

interface StageResult {
  staged: unknown[];
  temp: string[];
  commandDir: string;
}

function fileManagerT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.fileManager.${key}`, params);
}

function fileManagerError(key: string, detail?: unknown): string {
  return formatErrorWithDetail(fileManagerT(key), detail);
}

class FileManagerClass {
  paths: Record<string, string>;

  constructor() {
    this.paths = {};
  }

  async ensureDirs(scope = "all"): Promise<Record<string, string>> {
    try {
      const electronApi = window.electronAPI;
      if (electronApi === undefined) {
        return {};
      }

      const fmEnsureDirs = electronApi["fmEnsureDirs"] as (
        scope: string
      ) => Promise<{ success: boolean; message?: string; paths?: Record<string, string> }>;
      if (typeof fmEnsureDirs !== "function") return {};
      const res = await fmEnsureDirs(scope);
      if (res.success === false) {
        throw new Error(fileManagerError("ensureDirsOperationFailed", res.message));
      }
      if (res.paths !== undefined && typeof res.paths === "object") {
        this.paths = { ...this.paths, ...res.paths };
      }
      return res.paths ?? {};
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      Logger.error(
        LogCategory.FILE_MANAGER,
        fileManagerT("ensureDirsFailed", { message: getErrorMessage(error) })
      );
      return {};
    }
  }

  getPath(scope: string): string {
    return this.paths[scope] ?? "";
  }

  async readUploadFiles(filterNames: (FileEntry | string)[] = []): Promise<ReadResult[]> {
    const electronApi = window.electronAPI;
    if (electronApi === undefined) {
      return [];
    }

    const results = await Promise.all(
      filterNames.map(async (entry) => {
        const entryObj = typeof entry === "string" ? { path: entry } : entry;
        const base = entryObj.name ?? getFilename(entryObj.path ?? "");
        const path = entryObj.path ?? entryObj.tempPath ?? entryObj.commandPath;
        if (base === "" || path === undefined || path === "") return null;
        try {
          const fmReadFile = electronApi["readFile"] as (path: string) => Promise<string>;
          if (typeof fmReadFile !== "function") return null;
          const data = (await fmReadFile(path)) as string | undefined;
          if (data === undefined || data === "") return null;
          const ext = getFilename(base).split(".").pop() ?? "";
          const mimeType = getMimeType(ext);
          return { name: base, base64: data, mimeType };
        } catch (err) {
          const error = err as Error;
          Logger.warn(LogCategory.FILE_MANAGER, fileManagerT("readFailed", { path }), {
            error: error.message,
          });
          return null;
        }
      })
    );
    return results.filter((entry): entry is ReadResult => entry !== null);
  }

  async stageCommandFiles(jobId: string, names: (FileEntry | string)[] = []): Promise<StageResult> {
    if (jobId === "") return { staged: [], temp: [], commandDir: "" };
    const electronApi = window.electronAPI;
    if (electronApi === undefined) {
      return { staged: [], temp: [], commandDir: "" };
    }
    const payload = {
      jobId,
      files: names
        .map((n) => (typeof n === "string" ? n : (n.path ?? n.commandPath ?? n.name)))
        .filter((f): f is string => f !== undefined && f !== ""),
    };
    const cmdStageAttachments = electronApi["commandStageAttachments"] as (payload: {
      jobId: string;
      files: string[];
    }) => Promise<{
      success?: boolean;
      message?: string;
      staged?: unknown[];
      temp?: string[];
      commandDir?: string;
    }>;
    if (typeof cmdStageAttachments !== "function") {
      Logger.error(
        LogCategory.FILE_MANAGER,
        fileManagerT("stageAttachmentsFailed", {
          message: fileManagerT("apiUnavailable"),
        }),
        { jobId }
      );
      return { staged: [], temp: [], commandDir: "" };
    }
    const stagedRes = await cmdStageAttachments(payload);
    if (stagedRes.success !== true) {
      Logger.error(
        LogCategory.FILE_MANAGER,
        fileManagerT("stageAttachmentsFailed", {
          message: stagedRes.message ?? fileManagerT("unknown"),
        }),
        { jobId }
      );
      return { staged: [], temp: [], commandDir: "" };
    }
    return {
      staged: stagedRes.staged ?? [],
      temp: [],
      commandDir: stagedRes.commandDir ?? "",
    };
  }

  async commandArchiveCopy(
    jobId: string,
    targetDir: string
  ): Promise<{ success?: boolean; message?: string }> {
    if (jobId === "" || targetDir === "") {
      return { success: false, message: fileManagerT("missingParameters") };
    }
    const electronApi = window.electronAPI;
    if (electronApi === undefined) {
      return { success: false, message: fileManagerT("apiUnavailable") };
    }
    const cmdArchiveCopy = electronApi["commandArchiveCopy"] as (payload: {
      jobId: string;
      targetDir: string;
    }) => Promise<{ success?: boolean; message?: string }>;
    if (typeof cmdArchiveCopy !== "function") {
      return { success: false, message: fileManagerT("apiUnavailable") };
    }
    const res = await cmdArchiveCopy({ jobId, targetDir });
    if (res.success !== true) {
      Logger.warn(
        LogCategory.FILE_MANAGER,
        fileManagerT("archiveCopyFailed", {
          message: res.message ?? fileManagerT("unknown"),
        }),
        { jobId, targetDir }
      );
    }
    return res;
  }

  commandCleanup(jobId: string, tempEntries: { tempPath?: string }[] = []): void {
    const electronApi = window.electronAPI;
    if (electronApi === undefined) {
      return;
    }
    const tempPaths = tempEntries.map((t) => t.tempPath).filter((p): p is string => Boolean(p));
    const cmdCleanupJob = electronApi["commandCleanupJob"] as
      ((payload: Record<string, unknown>) => Promise<unknown>) | undefined;
    if (typeof cmdCleanupJob !== "function") return;
    void cmdCleanupJob({ jobId, tempPaths });
  }

  async commandFail(
    jobId: string,
    tempEntries: { tempPath?: string }[] = []
  ): Promise<{ success?: boolean; message?: string } | undefined> {
    const electronApi = window.electronAPI;
    if (electronApi === undefined) {
      return { success: false, message: fileManagerT("apiUnavailable") };
    }
    const tempPaths = tempEntries.map((t) => t.tempPath).filter((p): p is string => Boolean(p));
    const cmdMoveFailed = electronApi["commandMoveFailed"] as (payload: {
      jobId: string;
      tempPaths: string[];
    }) => Promise<{ success?: boolean; message?: string }>;
    if (typeof cmdMoveFailed !== "function") {
      return { success: false, message: fileManagerT("apiUnavailable") };
    }
    const res = await cmdMoveFailed({ jobId, tempPaths });
    if (res.success !== true) {
      Logger.warn(
        LogCategory.FILE_MANAGER,
        fileManagerT("moveFailed", {
          message: res.message ?? fileManagerT("unknown"),
        }),
        { jobId }
      );
    }
    return res;
  }

  async writeFileAtomic(
    path: string,
    data: string | Uint8Array | Record<string, unknown> | null | undefined,
    encoding = "utf-8"
  ): Promise<string> {
    try {
      const electronApi = window.electronAPI;
      if (electronApi === undefined) {
        return "";
      }

      let payload;
      if (typeof data === "string") {
        payload = { path, data, encoding };
      } else if (data instanceof Uint8Array) {
        const base64 = btoa(
          Array.from(data)
            .map((b) => String.fromCharCode(b))
            .join("")
        );
        payload = { path, data: base64, encoding: "base64" };
      } else {
        const textEncoder = new TextEncoder();
        let serialized = "";
        if (data === null || data === undefined) {
          serialized = "";
        } else {
          try {
            serialized = JSON.stringify(data);
          } catch {
            serialized = "";
          }
        }
        const bytes = textEncoder.encode(serialized);
        const base64 = btoa(
          Array.from(bytes)
            .map((b) => String.fromCharCode(b))
            .join("")
        );
        payload = { path, data: base64, encoding: "base64" };
      }
      const fmWriteFileAtomic = electronApi["fmWriteFileAtomic"] as (payload: {
        path: string;
        data: string;
        encoding: string;
      }) => Promise<{ success: boolean; path?: string; message?: string }>;
      if (typeof fmWriteFileAtomic !== "function") {
        throw new Error(fileManagerError("writeAtomicOperationFailed"));
      }
      const res = await fmWriteFileAtomic(payload);
      if (res.success === false) {
        throw new Error(fileManagerError("writeAtomicOperationFailed", res.message));
      }
      return res.path ?? "";
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      Logger.error(
        LogCategory.FILE_MANAGER,
        fileManagerT("writeAtomicFailed", { message: getErrorMessage(error) })
      );
      return "";
    }
  }

  async tempPath(prefix = "tmp", ext = "tmp"): Promise<string> {
    try {
      const electronApi = window.electronAPI;
      if (electronApi === undefined) {
        return "";
      }

      const fmTempPath = electronApi["fmTempPath"];
      if (typeof fmTempPath !== "function") return "";
      const res = await fmTempPath(prefix, ext);
      return res.path;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      Logger.error(
        LogCategory.FILE_MANAGER,
        fileManagerT("tempPathFailed", { message: getErrorMessage(error) })
      );
      return "";
    }
  }

  async screenshotPath(tag = "shot", ext = "png"): Promise<string> {
    const dirs = await this.ensureDirs("commands");
    const baseDir = dirs["commands"] ?? this.getPath("commands");
    if (baseDir === "") {
      return "";
    }
    const cleanTag = tag.replace(/[^\w.-]+/g, "_");
    const filename = generateUniqueId(cleanTag) + "." + ext;
    return `${baseDir}/screenshots/${filename}`;
  }
}

const fileManager = new FileManagerClass();
export { fileManager as FileManager };

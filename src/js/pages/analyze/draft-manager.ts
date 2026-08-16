import { LogCategory } from "@shared/logging-core";
import { Logger } from "../../modules/logger/index.js";
import { getErrorMessage } from "@shared/index.js";
import { FileManager } from "../../modules/file-manager.js";
import { AppI18n } from "../../modules/i18n/index.js";
import type { StagedFile } from "./upload-handler.js";

let draftPath = "";

function draftT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.analyze.draft.${key}`, params);
}

interface DraftPayload {
  message?: string;
  files?: unknown[];
}

function isDraftPayload(value: unknown): value is DraftPayload {
  if (value === null || value === undefined || typeof value !== "object") {
    return false;
  }

  const maybe = value as Record<string, unknown>;
  const messageValid = maybe["message"] === undefined || typeof maybe["message"] === "string";
  const filesValid = maybe["files"] === undefined || Array.isArray(maybe["files"]);
  return messageValid && filesValid;
}

function isStagedFile(value: unknown): value is StagedFile {
  if (value === null || value === undefined || typeof value !== "object") {
    return false;
  }

  const maybe = value as Record<string, unknown>;
  const nameValid = typeof maybe["name"] === "string";
  const pathValid = typeof maybe["path"] === "string";
  const commandPathValid =
    maybe["commandPath"] === undefined || typeof maybe["commandPath"] === "string";
  const originalNameValid =
    maybe["originalName"] === undefined || typeof maybe["originalName"] === "string";

  return nameValid && pathValid && commandPathValid && originalNameValid;
}

function decodeBase64(data: string): string {
  try {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(bytes);
  } catch (_err) {
    return "";
  }
}

export function initDraft(): void {
  try {
    draftPath = "data/analyze-draft.json";
  } catch (err) {
    Logger.warn(
      LogCategory.ANALYZE,
      draftT("logs.pathPrepareFailed", { message: getErrorMessage(err) })
    );
  }
}

export async function loadDraft(): Promise<{ message: string; files: StagedFile[] }> {
  if (draftPath === "" || window.electronAPI === undefined) {
    return { message: "", files: [] };
  }

  try {
    const base64 = await window.electronAPI.readFile(draftPath);

    if (base64 === null || base64 === "") {
      return { message: "", files: [] };
    }

    const text = decodeBase64(base64);
    const parsedUnknown: unknown = JSON.parse(text !== "" ? text : "{}");
    const parsed = isDraftPayload(parsedUnknown) ? parsedUnknown : {};
    const files = Array.isArray(parsed.files)
      ? parsed.files.filter((file): file is StagedFile => isStagedFile(file))
      : [];

    return {
      message: parsed.message ?? "",
      files,
    };
  } catch (err) {
    Logger.warn(LogCategory.ANALYZE, draftT("logs.readFailed", { message: getErrorMessage(err) }));
    return { message: "", files: [] };
  }
}

export async function persistDraft(message: string, files: unknown[]): Promise<void> {
  if (draftPath === "") return;

  try {
    const payload = { message: message, files: files };
    const json = JSON.stringify(payload, null, 2);
    await FileManager.writeFileAtomic(draftPath, json, "utf-8");
  } catch (err) {
    Logger.warn(LogCategory.ANALYZE, draftT("logs.writeFailed", { message: getErrorMessage(err) }));
  }
}

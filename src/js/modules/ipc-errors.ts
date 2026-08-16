import type { TranslationParams } from "@shared/i18n.js";
import { AppI18n } from "./i18n/index.js";

export type IpcErrorPayload = {
  error?: string;
  errorKey?: string;
  errorParams?: TranslationParams;
};

export function resolveIpcErrorMessage(payload?: IpcErrorPayload | null): string | undefined {
  if (!payload) {
    return undefined;
  }

  const key = typeof payload.errorKey === "string" ? payload.errorKey.trim() : "";
  if (key !== "") {
    return AppI18n.t(key, payload.errorParams);
  }

  if (typeof payload.error === "string") {
    const trimmed = payload.error.trim();
    return trimmed === ""
      ? undefined
      : AppI18n.t("electron.ipc.errors.operationFailed", { message: trimmed });
  }

  return undefined;
}

import { LogCategory, LogLevel } from "@shared/logging-core";
import { Logger } from "../logger/index.js";
import { AppState } from "../app-state.js";
import { WhisperManager } from "../whisper-manager.js";
import type { CommandPayload } from "./utils.js";
import { parseArgs, resolveProvider, logCommandResult } from "./utils.js";
import { getErrorMessage } from "@shared/index.js";

type CommandHandlerResult = { success: boolean; message?: string; [key: string]: unknown };

// NOTE: This command schedules deferred whisper messages and is intentionally separate from speech transcription.

function resolveSourceAccountId(payload: CommandPayload = {}): string {
  const providerRaw = typeof payload.provider === "string" ? payload.provider.toLowerCase() : "";
  if (providerRaw !== "ai1" && providerRaw !== "ai2" && providerRaw !== "ai0") {
    return "";
  }

  const account = AppState.getAccountForSlot(providerRaw);
  return account?.id ?? "";
}

function parseWhisperArgs(
  rawArgs = "",
  fallbackAccountId = ""
): { accountId: string; text: string; when: string } {
  const parts = parseArgs(rawArgs);

  if (parts.length >= 3) {
    const [accountId, text, when] = parts;
    return {
      accountId: accountId ?? fallbackAccountId,
      text: text ?? "",
      when: when ?? "",
    };
  }

  if (parts.length === 2) {
    const [first, second] = parts;
    if (fallbackAccountId !== "") {
      return {
        accountId: fallbackAccountId,
        text: first ?? "",
        when: second ?? "",
      };
    }
    return {
      accountId: first ?? "",
      text: second ?? "",
      when: "",
    };
  }

  if (parts.length === 1) {
    const [first] = parts;
    if (fallbackAccountId !== "") {
      return {
        accountId: fallbackAccountId,
        text: first ?? "",
        when: "",
      };
    }
    return {
      accountId: first ?? "",
      text: "",
      when: "",
    };
  }

  return {
    accountId: fallbackAccountId,
    text: "",
    when: "",
  };
}

export async function whisperManagerHandler(
  payload: CommandPayload = {}
): Promise<CommandHandlerResult> {
  const { providerRaw, providerName } = await resolveProvider(payload);
  const sourceAccountId = resolveSourceAccountId(payload);
  const { accountId, text, when } = parseWhisperArgs(payload.args, sourceAccountId);
  const argsLabel = payload.args ?? `"${accountId}","${text}","${when}"`;

  if (accountId === "" || text === "") {
    return {
      success: false,
      message:
        'Kullanım: ++cmd:WhisperManager(<accountId>, "<mesaj>", "<zaman>") veya ++cmd:WhisperManager("<mesaj>", "<zaman>")',
    };
  }

  try {
    const rec = WhisperManager.WhisperManagerAdd(accountId, text, when);

    Logger.panel(LogCategory.COMMAND, LogLevel.INFO, `WhisperManager çalıştı | args: ${argsLabel}`);

    logCommandResult("WhisperManager", {
      providerRaw,
      sender: providerName,
      args: argsLabel,
      success: true,
      detail: "Başarılı",
    });

    return {
      success: true,
      command: "WhisperManager",
      args: argsLabel,
      record: rec,
    };
  } catch (err) {
    const errMsg = getErrorMessage(err);
    Logger.panel(LogCategory.COMMAND, LogLevel.ERROR, `WhisperManager hata: ${errMsg}`);

    logCommandResult("WhisperManager", {
      providerRaw,
      sender: providerName,
      args: argsLabel,
      success: false,
      detail: errMsg,
    });

    return { success: false, message: errMsg };
  }
}

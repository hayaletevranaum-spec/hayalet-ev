import type { TranslationParams } from "@shared/i18n.js";
import { LogCategory, LogLevel } from "@shared/logging-core";
import { Logger } from "../logger/index.js";
import { AppI18n } from "../i18n/index.js";
import { SettingsManager } from "../settings-manager.js";
import type { CommandPayload } from "@shared/commands.js";
import { resolveIntlLocale } from "../../../../shared/i18n/locale.js";

export type { CommandPayload };

interface SettingsWithNicknames {
  ai1?: { nickname?: string; [key: string]: unknown };
  ai2?: { nickname?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export function parseArgs(rawArgs = ""): string[] {
  const args = typeof rawArgs === "string" ? rawArgs : "";
  const parts: string[] = [];
  const regex = /"([^"]*)"|'([^']*)'|([^,\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(args)) !== null) {
    const val = match[1] ?? match[2] ?? match[3] ?? "";
    if (val.trim() !== "") {
      parts.push(val.trim());
    }
  }
  return parts;
}

function getTimestamp(): string {
  return formatCommandTimestamp();
}

export function commandRuntimeT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`app.commands.runtime.${key}`, params);
}

export function formatCommandTimestamp(): string {
  return new Date().toLocaleString(resolveIntlLocale(AppI18n.getLocale()));
}

export async function resolveProvider(
  payload: CommandPayload = {}
): Promise<{ providerRaw: string; providerName: string; sender: string }> {
  const settings = await Promise.resolve(SettingsManager.getSnapshot());
  const nickname = settings.user?.nickname;
  const humanName = nickname !== undefined && nickname !== "" ? nickname.trim() : "user";
  const providerRaw = payload.provider ?? "AI";

  let providerName;
  if (payload.source === "manual") {
    providerName = humanName;
  } else if (providerRaw === "ai1") {
    providerName = (settings as SettingsWithNicknames).ai1?.nickname ?? "AI1";
  } else if (providerRaw === "ai2") {
    providerName = (settings as SettingsWithNicknames).ai2?.nickname ?? "AI2";
  } else {
    providerName = providerRaw;
  }

  const sender = payload.sender ?? providerName;

  return { providerRaw, providerName, sender };
}

interface LogCommandOpts {
  providerRaw?: string;
  sender?: string;
  args?: string;
  success?: boolean;
  detail?: string;
}

export function logCommandResult(command: string, opts: LogCommandOpts = {}): void {
  const { providerRaw, sender, args = "", success = true, detail = "" } = opts;
  const stamp = getTimestamp();
  const senderStr = sender !== undefined && sender !== "" ? sender : "AI";
  const outcome =
    detail !== ""
      ? detail
      : success === true
        ? commandRuntimeT("logSuccess")
        : commandRuntimeT("logError");
  const message = `${senderStr} - ${command}(${args}) - ${stamp} - ${outcome}`;

  const context = {
    eventType: "command-result",
    provider: providerRaw,
    sender: senderStr,
    command,
    args,
    timestamp: stamp,
    detail,
  };

  if (success === true) {
    Logger.panel(LogCategory.COMMAND, LogLevel.SUCCESS, message, context);
  } else {
    Logger.panel(LogCategory.COMMAND, LogLevel.ERROR, message, context);
  }
}

export function createDefaultHandler(
  name: string
): (
  payload?: CommandPayload
) => Promise<{ success: boolean; command: string; args: string | undefined; detail: string }> {
  return async (payload: CommandPayload = {}) => {
    const argsValue = payload.args ?? "";
    const info = argsValue !== "" ? commandRuntimeT("logArgsInfo", { args: argsValue }) : "";
    Logger.panel(
      LogCategory.COMMAND,
      LogLevel.INFO,
      commandRuntimeT("logRan", { command: name, info })
    );

    const { providerRaw, sender } = await resolveProvider(payload);
    const argsLabel = payload.args ?? "";
    const detail = payload.detail ?? commandRuntimeT("logSuccess");

    logCommandResult(name, {
      providerRaw,
      sender,
      args: argsLabel,
      success: true,
      detail,
    });

    return { success: true, command: name, args: payload.args, detail };
  };
}

import { getErrorMessage } from "@shared/index.js";
import { formatErrorWithDetail } from "../../../../shared/i18n/error-detail.js";
import { AppI18n } from "../i18n/index.js";
import { AppState } from "../app-state.js";
import { CommandManager } from "../command-manager.js";
import type { CommandResult } from "../command-manager.js";
import { Logger, LogCategory, LogLevel } from "../logger/index.js";
import { WhisperManager } from "../whisper-manager.js";
import { resolveIntlLocale } from "../../../../shared/i18n/locale.js";

export interface WhisperRecord {
  text?: string;
  id?: string;
  when?: unknown;
}

export interface CaughtCommandPayload {
  provider?: string;
  args?: string;
  source?: string;
  webUrl?: string;
  target?: string;
  text?: string;
}

export interface ServerCommandsRef {
  list(): string[];
  run(name: string, payload: Record<string, unknown>): Promise<unknown>;
}

interface WhisperCommandContext {
  ensureReady: () => Promise<void>;
  dispatchMessage: (payload: {
    provider?: string;
    text?: string;
    page?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  getServerCommands: () => ServerCommandsRef;
}

function whisperRuntimeT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.whisper.runtime.${key}`, params);
}

function whisperRuntimeError(
  key: string,
  detail?: unknown,
  params?: Record<string, string | number>
): string {
  return formatErrorWithDetail(whisperRuntimeT(key, params), detail);
}

function formatWhisperRuntimeTimestamp(value: Date = new Date()): string {
  return value.toLocaleString(resolveIntlLocale(AppI18n.getLocale()));
}

export async function runWhisperOperation(
  op: string,
  args?: {
    accountId?: string;
    text?: string;
    when?: unknown;
    id?: string;
    patch?: { text?: string; when?: unknown };
  }
): Promise<unknown> {
  switch (op) {
    case "add":
      return await Promise.resolve(
        WhisperManager.WhisperManagerAdd(args?.accountId, args?.text ?? "", args?.when)
      );
    case "remove":
      return await Promise.resolve(
        WhisperManager.WhisperManagerDelete(args?.accountId, args?.id ?? "")
      );
    case "update": {
      const patch: { text?: string; when?: unknown } = {};
      const nextText = args?.patch?.text ?? args?.text;
      const nextWhen = args?.patch?.when ?? args?.when;
      if (nextText !== undefined) {
        patch.text = nextText;
      }
      if (nextWhen !== undefined) {
        patch.when = nextWhen;
      }
      return await Promise.resolve(
        WhisperManager.WhisperManagerUpdate(args?.accountId, args?.id, patch)
      );
    }
    case "list":
      return await Promise.resolve(WhisperManager.getRecords(args?.accountId));
    case "done":
      return await Promise.resolve(WhisperManager.getDoneRecords(args?.accountId));
    case "accounts":
      return await Promise.resolve(WhisperManager.getAllByAccount());
    case "catch":
      return await Promise.resolve(WhisperManager.catch());
    default:
      return await Promise.resolve(null);
  }
}

export function pauseWhispers(): void {
  WhisperManager.pause();
}

export function resumeWhispers(runCheck = false): void {
  WhisperManager.resume(runCheck);
}

export function resolveSlotForAccount(accountId: string): "ai1" | "ai2" | null {
  const assignedSlot = AppState.getAssignedSlotForAccount(accountId);
  return assignedSlot === "ai1" || assignedSlot === "ai2" ? assignedSlot : null;
}

export async function enqueueWhisperJobWithContext(
  accountId: string,
  record: WhisperRecord = {},
  messageOverride = "",
  context: WhisperCommandContext
): Promise<{ success: boolean; jobId?: string; message?: string }> {
  const slot = resolveSlotForAccount(accountId);
  if (slot === null) {
    return await Promise.resolve({
      success: false,
      message: whisperRuntimeT("accountSlotMissing"),
    });
  }

  const text = messageOverride !== "" ? messageOverride : (record.text ?? "");
  const whisperId = record.id ?? "";
  const payload = {
    provider: slot,
    accountId,
    whisperId,
    message: text,
    when: record.when,
  };

  Logger.info(LogCategory.WHISPER, whisperRuntimeT("queuedForAccount", { accountId, slot }), {
    context: { accountId, slot, whisperId },
  });

  const exec = async (): Promise<CommandResult> => {
    const result = await context.dispatchMessage({ provider: slot, text });
    if (!result.success) {
      if (whisperId !== "") {
        WhisperManager.markReady(accountId, whisperId);
      }
      throw new Error(whisperRuntimeError("sendFailed", result.message));
    }
    if (whisperId !== "") {
      WhisperManager.WhisperManagerDone(accountId, whisperId);
    }
    return { success: true };
  };

  const job = CommandManager.CommandManagerEnqueue(
    slot,
    "WhisperSend",
    "whisper",
    payload,
    exec,
    "normal"
  );

  if (job?.id !== undefined && job.id !== "") {
    return await Promise.resolve({ success: true, jobId: job.id });
  }
  return await Promise.resolve({ success: true });
}

export async function handleCaughtCommandWithContext(
  commandName: string,
  payload: CaughtCommandPayload = {},
  context: WhisperCommandContext
): Promise<{ success: boolean; message?: string; jobId?: string; priority?: string }> {
  if (commandName === "") {
    return { success: false, message: AppI18n.t("app.commands.runtime.commandNameRequired") };
  }

  const serverCommands = context.getServerCommands();
  const known = serverCommands.list().some((command) => {
    return command.toLowerCase() === String(commandName).toLowerCase();
  });
  if (!known) {
    Logger.error(
      LogCategory.COMMAND,
      AppI18n.t("app.commands.runtime.undefinedCommandLog", { command: commandName }),
      {
        context: { commandName },
      }
    );
    return { success: false, message: AppI18n.t("app.commands.runtime.undefinedCommand") };
  }

  await context.ensureReady();

  const priority = "normal";
  const stamp = formatWhisperRuntimeTimestamp();
  const provider = payload.provider ?? "AI";
  const nickAi1 = AppState.getNickname("ai1");
  const nickAi2 = AppState.getNickname("ai2");
  const humanName = AppState.getNickname("user");
  const who = provider === "ai1" ? nickAi1 : provider === "ai2" ? nickAi2 : provider;
  const argLabel =
    typeof payload.args === "string" && payload.args.length !== 0 ? payload.args : "";
  const cmdText = `++cmd:${commandName}${argLabel !== "" ? `(${argLabel})` : "()"}`;
  const sender = payload.source === "manual" ? humanName : who;
  const queuePayload = {
    provider,
    command: commandName,
    args: argLabel,
    source: payload.source ?? provider,
    sender,
    webUrl: payload.webUrl ?? "",
    text: typeof payload.text === "string" ? payload.text : "",
    message: cmdText,
  };

  Logger.panel(
    LogCategory.COMMAND,
    LogLevel.INFO,
    `${sender} - ${commandName}${argLabel !== "" ? ` (${argLabel})` : ""} - ${stamp}`,
    {
      eventType: "command-catch",
      provider,
      sender,
      command: commandName,
      args: argLabel,
      timestamp: stamp,
      webUrl: payload.webUrl ?? "",
      triggerSource: payload.source ?? provider,
    }
  );

  const execFn = async (): Promise<CommandResult> => {
    await context.getServerCommands().run(commandName, queuePayload);
    return { success: true };
  };
  const job = CommandManager.CommandManagerEnqueue(
    payload.target ?? "core",
    commandName,
    "catch",
    queuePayload,
    execFn,
    priority
  );

  Logger.debug(
    LogCategory.SYSTEM,
    whisperRuntimeT("queuedCommandLog", { timestamp: stamp, sender: who, commandText: cmdText }),
    {
      context: {
        provider,
        command: commandName,
        args: argLabel,
        jobId: job?.id,
      },
    }
  );

  if (job?.id !== undefined && job.id !== "") {
    return { success: true, jobId: job.id, priority };
  }
  return { success: true, priority };
}

export function destroyWhisperActions(): void {
  try {
    WhisperManager.destroy();
  } catch (error) {
    Logger.warn(
      LogCategory.WHISPER,
      whisperRuntimeT("destroyWarning", { message: getErrorMessage(error) }),
      {
        error: error instanceof Error ? error : new Error(String(error)),
      }
    );
  }
}

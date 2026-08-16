import { getFilename, generateUniqueId } from "../../constants/index.js";
import { AppState } from "../app-state.js";
import { CommandManager } from "../command-manager.js";
import type { CommandJob } from "../command-manager.js";
import { FileManager } from "../file-manager.js";
import { AppI18n } from "../i18n/index.js";
import { Logger, LogCategory } from "../logger/index.js";
import { replaceProtocolTagsWithResolver } from "../../../../shared/protocol-tags.js";

export interface AttachmentInput {
  name?: string;
  path?: string;
  commandPath?: string;
}

export interface SendBatchParams {
  targets?: string[];
  text?: string;
  page?: string;
  archiveFolders?: Record<string, string>;
  attachments?: Array<string | AttachmentInput>;
  jobIds?: Record<string, string>;
  waitForCompletion?: boolean;
  clientRequestId?: string;
  brokerMessageId?: string;
}

interface SendBatchContext {
  ensureReady: () => Promise<void>;
  setActiveTargets: (targets: string[]) => void;
}

function commandT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.commands.${key}`, params);
}

export function replaceProtocolTags(text: string): string {
  return replaceProtocolTagsWithResolver(text, (provider) => AppState.getNickname(provider));
}

export async function sendBatchWithContext(
  {
    targets = [],
    text = "",
    page = "generic",
    archiveFolders = {},
    attachments = [],
    jobIds = {},
    waitForCompletion = false,
    clientRequestId,
    brokerMessageId,
  }: SendBatchParams = {},
  context: SendBatchContext
): Promise<{ success: boolean; message?: string }> {
  await context.ensureReady();

  const list = (Array.isArray(targets) ? targets : [targets]).filter(
    (target): target is string => typeof target === "string" && target !== ""
  );
  if (list.length === 0) {
    return { success: false, message: commandT("executor.targetRequired") };
  }

  const attachmentItems = attachments.map((attachment: string | AttachmentInput) => {
    const name =
      typeof attachment === "string"
        ? getFilename(attachment)
        : (attachment.name ?? getFilename(attachment.path ?? attachment.commandPath ?? ""));
    const path =
      typeof attachment === "string"
        ? attachment
        : (attachment.path ?? attachment.commandPath ?? attachment.name);
    return { name, path: path ?? "" };
  });
  const attachmentPaths = attachmentItems
    .map((attachment) => attachment.path)
    .filter((path): path is string => typeof path === "string" && path !== "");
  const hasAttachments = attachmentPaths.length > 0;

  const jobs: Partial<CommandJob>[] = await Promise.all(
    list.map(async (provider) => {
      const jobId = jobIds[provider] ?? generateUniqueId("cmd");
      let staged: { staged: unknown[]; temp: string[]; commandDir: string } = {
        staged: [],
        temp: [],
        commandDir: "",
      };

      if (hasAttachments) {
        const stageResult = await FileManager.stageCommandFiles(jobId, attachmentPaths);
        staged = stageResult;
        Logger.info(
          LogCategory.COMMAND,
          commandT("executor.attachmentsStagedLog", { jobId, count: staged.staged.length }),
          {
            context: {
              jobId,
              count: staged.staged.length,
            },
          }
        );
      }

      const stagedEntries = staged.staged.map((entry) => {
        const item = entry as {
          name?: string;
          renamedName?: string;
          originalName?: string;
          commandPath?: string;
        };
        return {
          ...item,
          path: item.commandPath ?? "",
          name:
            item.name ??
            item.renamedName ??
            item.originalName ??
            getFilename(item.commandPath ?? ""),
        };
      });

      return {
        id: jobId,
        provider,
        message: text,
        attachments: stagedEntries,
        attachmentsMeta: {
          ...staged,
          staged: stagedEntries,
          stagedFiles: stagedEntries,
          temp: [] as string[],
        },
        meta: {
          targets: list,
          page,
          attachments: stagedEntries,
          archiveFolders,
          ...(typeof clientRequestId === "string" && clientRequestId.trim() !== ""
            ? { clientRequestId: clientRequestId.trim() }
            : {}),
          ...(typeof brokerMessageId === "string" && brokerMessageId.trim() !== ""
            ? { brokerMessageId: brokerMessageId.trim() }
            : {}),
        },
      };
    })
  );

  const queuedJobs = CommandManager.enqueue(jobs);
  Logger.info(LogCategory.COMMAND, commandT("executor.queuedLog", { count: jobs.length }), {
    context: {
      targets: list,
      page,
    },
  });
  context.setActiveTargets(list);

  if (waitForCompletion !== true) {
    return { success: true };
  }

  try {
    const results = await Promise.all(
      queuedJobs.map(async (job) => {
        if (job.done !== null) {
          return await job.done;
        }

        const message = job.result?.message;
        return {
          success: job.status !== "failed",
          ...(typeof message === "string" ? { message } : {}),
        };
      })
    );
    const failedResult = results.find((result) => result.success !== true);
    return failedResult ?? { success: true };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendMessageWithContext(
  payload: {
    provider?: string;
    text?: string;
    page?: string;
    waitForCompletion?: boolean;
    clientRequestId?: string;
    brokerMessageId?: string;
  } | null,
  context: SendBatchContext
): Promise<{ success: boolean; message?: string }> {
  const {
    provider = "ai1",
    text = "",
    page = "generic",
    waitForCompletion = false,
    clientRequestId,
    brokerMessageId,
  } = payload ?? {};
  return await sendBatchWithContext(
    {
      targets: [provider],
      text,
      page,
      waitForCompletion,
      ...(typeof clientRequestId === "string" ? { clientRequestId } : {}),
      ...(typeof brokerMessageId === "string" ? { brokerMessageId } : {}),
    },
    context
  );
}

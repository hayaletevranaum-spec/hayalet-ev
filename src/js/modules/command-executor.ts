import type { CoreEngine } from "./core-engine.js";
import type { CommandJob } from "./command-manager.js";
import type { TranslationParams } from "@shared/i18n.js";
import { LogCategory } from "@shared/logging-core";
import { FileManager } from "./file-manager.js";
import { Logger } from "./logger/index.js";

import { TrafficManager } from "./traffic-manager.js";
import { WebviewManager } from "./webview-manager.js";
import { rememberOutboundBridgeMessage } from "./webview/outbound-bridge-metadata.js";
import { AppI18n } from "./i18n/index.js";
import { getErrorMessage } from "@shared/index.js";
import { resolveIntlLocale } from "../../../shared/i18n/locale.js";

interface WebviewSendResult {
  success: boolean;
  message?: string;
  code?: string;
}

function commandExecutorT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`app.commands.executor.${key}`, params);
}

function formatCommandExecutorTimestamp(value: Date = new Date()): string {
  return value.toLocaleString(resolveIntlLocale(AppI18n.getLocale()));
}

class CommandExecutorClass {
  coreEngine: typeof CoreEngine | null;

  constructor() {
    this.coreEngine = null;
  }

  init(coreEngineInstance: typeof CoreEngine): void {
    this.coreEngine = coreEngineInstance;
  }

  async executeJob(job: CommandJob): Promise<WebviewSendResult> {
    const startTime = Date.now();
    const hasAttachments = job.attachments.length > 0;
    const pageMeta = job.meta["page"];
    const page = typeof pageMeta === "string" ? pageMeta : "";

    Logger.info(LogCategory.COMMAND, commandExecutorT("jobStarting", { provider: job.provider }), {
      eventType: "coreengine-ai-send",
      detail: commandExecutorT("queuedDetail"),
      provider: job.provider,
      category: "command",
      hasAttachments,
      attachmentCount: job.attachments.length,
      messageLength: job.message.length,
      jobId: job.id,
      page,
      timestamp: formatCommandExecutorTimestamp(),
    });

    const result = (await WebviewManager.send({
      provider: job.provider,
      text: job.message,
      attachments: job.attachments,
    })) as WebviewSendResult | undefined;

    const duration = Date.now() - startTime;

    if (result === undefined || result.success === false) {
      Logger.error(
        LogCategory.COMMAND,
        commandExecutorT("jobFailed", {
          provider: job.provider,
          message: result?.message ?? "E_WEBVIEW_SEND",
        }),
        {
          category: "command",
          provider: job.provider,
          duration,
          errorCode: result?.code ?? "E_WEBVIEW_SEND",
          jobId: job.id,
        }
      );
      const err = new Error(result?.message ?? "E_WEBVIEW_SEND") as Error & { code?: string };
      err.code = result?.code ?? "E_WEBVIEW_SEND";
      throw err;
    }

    Logger.info(
      LogCategory.COMMAND,
      commandExecutorT("jobCompleted", { provider: job.provider, duration }),
      {
        eventType: "coreengine-ai-send",
        detail: commandExecutorT("completedDetail", { duration }),
        provider: job.provider,
        category: "command",
        duration,
        jobId: job.id,
        page,
        timestamp: formatCommandExecutorTimestamp(),
      }
    );

    return result;
  }

  handleJobSuccess(job: CommandJob): void {
    const clientRequestMeta = job.meta["clientRequestId"];
    const brokerMessageMeta = job.meta["brokerMessageId"];
    const clientRequestId = typeof clientRequestMeta === "string" ? clientRequestMeta.trim() : "";
    const brokerMessageId = typeof brokerMessageMeta === "string" ? brokerMessageMeta.trim() : "";

    if (clientRequestId !== "") {
      rememberOutboundBridgeMessage(job.provider, {
        messageText: job.message,
        clientRequestId,
        ...(brokerMessageId !== "" ? { brokerMessageId } : {}),
      });
    }

    TrafficManager.signal(job.provider, "sent", job.message);
    try {
      const folder = job.meta.archiveFolders?.[job.provider];
      const stagedFiles = job.attachmentsMeta?.staged ?? job.meta.attachments ?? [];
      if (stagedFiles.length > 0) {
        WebviewManager.addPendingArchive(job.provider, {
          jobId: job.id,
          folder: folder ?? "",
          temp: job.attachmentsMeta?.temp ?? [],
          stagedFiles: stagedFiles,
        } as { jobId: string; folder: string; temp?: string[]; stagedFiles?: unknown[] });
        Logger.info(LogCategory.COMMAND, commandExecutorT("archiveCopyDeferred"), {
          category: "archive",
          jobId: job.id,
          provider: job.provider,
          folder: folder ?? "(new conversation)",
          fileCount: stagedFiles.length,
        });
      } else {
        FileManager.commandCleanup(
          job.id,
          (job.attachmentsMeta?.temp ?? []).map((t: string) => ({ tempPath: t }))
        );
      }
    } catch (err) {
      Logger.warn(
        LogCategory.COMMAND,
        commandExecutorT("syncCleanupError", { message: getErrorMessage(err) }),
        {
          category: "core",
          jobId: job.id,
        }
      );
    }
  }

  handleJobFailure(job: CommandJob, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    TrafficManager.signal(job.provider, "error", errorMessage);
    void FileManager.commandFail(
      job.id,
      (job.attachmentsMeta?.temp ?? []).map((t: string) => ({ tempPath: t }))
    ).catch((err) => {
      Logger.error(LogCategory.COMMAND, commandExecutorT("commandFailError"), { error: err });
    });
    Logger.error(
      LogCategory.COMMAND,
      commandExecutorT("commandError", { provider: job.provider, message: errorMessage }),
      {
        category: "command",
        jobId: job.id,
      }
    );
  }
}

const commandExecutor = new CommandExecutorClass();
export { commandExecutor as CommandExecutor };

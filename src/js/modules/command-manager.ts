import { generateUniqueId } from "../constants/index.js";
import { LogCategory, LogLevel } from "@shared/logging-core";
import { Logger } from "./logger/index.js";
import { AppI18n } from "./i18n/index.js";

import { getErrorMessage } from "@shared/index.js";

interface CommandAttachment {
  path: string;
  name?: string;
  type?: string;
  size?: number;
}

interface CommandMeta {
  source?: string;
  priority?: number;
  retryCount?: number;
  archiveFolders?: Record<string, string>;
  attachments?: unknown[];
  [key: string]: unknown;
}

interface CommandAttachmentsMeta {
  staged?: unknown[];
  stagedFiles?: unknown[];
  temp?: string[];
  commandDir?: string;
  [key: string]: unknown;
}

interface DeferredPromise<T = unknown> {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  promise: Promise<T>;
}

export interface CommandResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

export interface CommandJob {
  id: string;
  provider: string;
  target?: string;
  command: string;
  message: string;
  attachments: CommandAttachment[];
  attachmentsMeta?: CommandAttachmentsMeta;
  sessionId: string | null;
  meta: CommandMeta;
  payload: Record<string, unknown>;
  createdAt: number;
  status: "queued" | "processing" | "sent" | "failed";
  run: (() => Promise<CommandResult>) | null;
  _deferred: DeferredPromise<CommandResult> | null;
  done: Promise<CommandResult> | null;
  result?: CommandResult;
}

type CommandEventListener = (payload: unknown) => void;

function toSafeString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value instanceof Error) return value.message;
  return "";
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function commandQueueT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.commandQueue.${key}`, params);
}
class CommandManagerClass {
  queue: CommandJob[];
  processing: boolean;
  executor: ((job: CommandJob) => Promise<CommandResult>) | null;
  listeners: Record<string, CommandEventListener[]>;

  constructor() {
    this.queue = [];
    this.processing = false;
    this.executor = null;
    this.listeners = { queued: [], sent: [], failed: [], status: [] };
  }

  async init(): Promise<void> {
    try {
      const commandInit = window.electronAPI?.["commandInit"] as (() => Promise<void>) | undefined;
      if (typeof commandInit !== "function") {
        Logger.warn(LogCategory.COMMAND, commandQueueT("initSkipped"), {
          category: "command",
        });
        return;
      }
      await commandInit();
      this.queue = [];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Logger.error(LogCategory.COMMAND, commandQueueT("initFailed", { message }), {
        category: "command",
      });
    }
  }

  setExecutor(fn: ((job: CommandJob) => Promise<CommandResult>) | null): void {
    this.executor = typeof fn === "function" ? fn : null;
  }

  on(event: string, listener: CommandEventListener): () => void {
    this.listeners[event] ??= [];
    if (typeof listener === "function") {
      this.listeners[event].push(listener);
    }
    return () => {
      this.listeners[event] = (this.listeners[event] ?? []).filter((l) => l !== listener);
    };
  }

  emit(event: string, payload: unknown): void {
    (this.listeners[event] ?? []).forEach((l) => {
      try {
        l(payload);
      } catch (err) {
        Logger.warn(
          LogCategory.COMMAND,
          commandQueueT("listenerError", {
            message: getErrorMessage(err),
          }),
          {
            category: "command",
          }
        );
      }
    });
  }

  defer(): DeferredPromise<CommandResult> {
    let resolve: ((value: CommandResult) => void) | undefined;
    let reject: ((reason?: unknown) => void) | undefined;
    const promise = new Promise<CommandResult>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return {
      promise,
      resolve: resolve as (value: CommandResult) => void,
      reject: reject as (reason?: unknown) => void,
    };
  }

  sanitizePayload(payload: unknown = {}): Record<string, unknown> {
    const rest = toRecord(payload);
    try {
      return JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
    } catch {
      const cleaned: Record<string, unknown> = {};
      Object.entries(rest).forEach(([key, value]) => {
        if (typeof value === "function") return;
        try {
          cleaned[key] = JSON.parse(JSON.stringify(value)) as unknown;
        } catch (e) {
          Logger.debug(
            LogCategory.COMMAND,
            commandQueueT("sanitizePayloadFailed", {
              key,
              message: getErrorMessage(e),
            }),
            {
              key,
              error: getErrorMessage(e),
            }
          );
        }
      });
      return cleaned;
    }
  }

  enqueue(items: Partial<CommandJob>[] = []): CommandJob[] {
    const list = Array.isArray(items) ? items : [items];
    const jobs = list.map((item) => this.addJob(item));
    void this.processNext();
    return jobs;
  }

  addJob(item: Partial<CommandJob> & { target?: string } = {}): CommandJob {
    const deferred = this.defer();
    // NOTE: Fire-and-forget sends still report failures through command logs.
    void deferred.promise.catch(() => {});
    const payloadObj = toRecord(item.payload);
    const metaObj = item.meta ?? {};
    const job: CommandJob = {
      id: item.id ?? generateUniqueId("cmd"),
      provider: item.provider ?? item.target ?? "default",
      command: toSafeString(item.command ?? payloadObj["command"] ?? metaObj["command"]),
      message: toSafeString(item.message ?? payloadObj["message"] ?? item.command),
      attachments: item.attachments ?? [],
      sessionId: item.sessionId ?? null,
      meta: metaObj,
      payload: this.sanitizePayload(payloadObj),
      createdAt: Date.now(),
      status: "queued" as const,
      run: item.run ?? null,
      _deferred: deferred,
      done: deferred.promise,
    };
    this.queue.push(job);
    this.persist(job);
    this.emit("queued", job);
    return job;
  }

  getNextJob(): CommandJob | undefined {
    if (this.queue.length === 0) return undefined;
    return this.queue.shift();
  }

  async processNext(): Promise<void> {
    if (this.processing) return;
    const job = this.getNextJob();
    if (job === undefined) return;
    this.processing = true;
    job.status = "processing";
    this.emit("status", { job, status: "processing" });
    try {
      const runner = job.run ?? this.executor;
      if (runner !== null) {
        const res = await runner(job);
        job.result = res;
        job.status = "sent";
        this.emit("sent", { job, result: res });
      } else {
        job.result = { success: true, message: "No executor" };
        job.status = "sent";
        this.emit("sent", { job, result: job.result });
      }
      this.markDone(job.id);
      const finalResult = job.result ?? { success: true, message: "No result" };
      job._deferred?.resolve(finalResult);
    } catch (err) {
      job.status = "failed";
      this.emit("failed", { job, error: err });
      const message = err instanceof Error ? err.message : "unknown error";
      this.markFailed(job.id, message);
      job._deferred?.reject(err);
    } finally {
      this._cleanupJobReferences(job);

      this.processing = false;
      if (this.queue.length > 0) {
        void this.processNext();
      }
    }
  }

  _cleanupJobReferences(job: CommandJob | null): void {
    if (job === null) return;
    job._deferred = null;
    job.done = null;
    job.run = null;
  }

  markDone(id: string): boolean {
    const mover = window.electronAPI?.["commandMove"] as
      ((id: string, status: string) => Promise<void>) | undefined;
    if (typeof mover === "function") {
      mover(id, "done").catch(() => {});
    }
    Logger.info(LogCategory.COMMAND, commandQueueT("completed", { id }), { category: "command" });
    return true;
  }

  markFailed(id: string, reason = ""): boolean {
    const mover = window.electronAPI?.["commandMove"] as
      ((id: string, status: string) => Promise<void>) | undefined;
    if (typeof mover === "function") {
      mover(id, "failed").catch(() => {});
    }
    Logger.panel(LogCategory.COMMAND, LogLevel.ERROR, commandQueueT("failed", { id, reason }), {
      category: "command",
    });
    return false;
  }

  persist(job: CommandJob): void {
    const writer = window.electronAPI?.["commandWrite"] as
      ((job: Record<string, unknown>) => Promise<void>) | undefined;
    if (typeof writer === "function") {
      const safeJob = {
        ...job,
        command: job.command,
        payload: this.sanitizePayload(job.payload),
        run: undefined,
        _deferred: undefined,
        done: undefined,
      };
      void writer(safeJob).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        Logger.error(LogCategory.COMMAND, commandQueueT("writeFailed", { message }), {
          category: "command",
        });
      });
    }
  }

  list(): CommandJob[] {
    return [...this.queue];
  }

  clearQueue(): void {
    this.queue = [];
    this.processing = false;
    Logger.info(LogCategory.COMMAND, commandQueueT("cleared"), {
      category: "command",
      visibility: 2,
    });
  }

  CommandManagerEnqueue(
    target: string,
    command: string,
    _mode = "default",
    payload: Record<string, unknown> = {},
    executor: (() => Promise<CommandResult>) | null = null,
    _priority = "normal"
  ): CommandJob | undefined {
    const [job] = this.enqueue([
      {
        provider: target,
        command,
        message: typeof payload["message"] === "string" ? payload["message"] : "",
        payload,
        run: executor,
      },
    ]);
    return job;
  }
}

const commandManager = new CommandManagerClass();
export { commandManager as CommandManager };

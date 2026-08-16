import { generateUniqueId } from "../constants/index.js";
import { WHISPER_TIMEOUTS } from "@timeouts";
import { LogCategory, LogLevel } from "@shared/logging-core";
import { Logger } from "./logger/index.js";
import { AppI18n } from "./i18n/index.js";
import { AppState } from "./app-state.js";
import { SettingsManager } from "./settings-manager.js";
import { getAiProviderAccounts } from "@shared/settings.js";
import type { Account } from "@shared/settings.js";

interface WhisperRecord {
  id: string;
  accountId: string;
  text: string;
  when: number;
  createdAt: number;
  done: boolean;
  queued: boolean;
  queuedAt?: number;
  doneAt?: number;
}

interface WhisperData {
  pending: WhisperRecord[];
  done: WhisperRecord[];
}

type SenderFn = (accountId: string, text: string, whisperId: string) => void | Promise<void>;

function whisperT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.whisper.runtime.${key}`, params);
}

function getRegisteredAccounts(): Account[] {
  const settings = SettingsManager.getSnapshot();
  return getAiProviderAccounts(settings.accounts).filter(
    (account): account is Account => typeof account.id === "string" && account.id.trim() !== ""
  );
}

function resolveAccountId(name = ""): string {
  const target = name.trim();
  if (target === "") {
    return "";
  }

  const matched = getRegisteredAccounts().find((account) => account.id === target);
  return matched?.id ?? "";
}

function resolveDeliverySlot(accountId: string): "ai1" | "ai2" | null {
  const assignedSlot = AppState.getAssignedSlotForAccount(accountId);
  return assignedSlot === "ai1" || assignedSlot === "ai2" ? assignedSlot : null;
}

class WhisperManagerClass {
  data: Record<string, WhisperData>;
  timer: ReturnType<typeof setInterval> | null;
  sender: SenderFn | null;
  settings: Record<string, unknown>;
  paused: boolean;
  _unsubSettings: (() => void) | null;

  constructor() {
    this.data = {};
    this.timer = null;
    this.sender = null;
    this.settings = {};
    this.paused = false;
    this._unsubSettings = null;
  }

  async init(
    options: { settings?: Record<string, unknown>; sender?: SenderFn } = {}
  ): Promise<void> {
    this.settings = options.settings ?? {};
    if (typeof options.sender === "function") {
      this.sender = options.sender;
    }

    await this.loadAll();

    this._unsubSettings?.();
    this._unsubSettings = SettingsManager.subscribe((event) => {
      if (!event.changedPaths.some((path) => path.startsWith("accounts"))) {
        return;
      }
      void this.loadAll();
    });

    this.timer ??= setInterval(() => this.WhisperManagerCheck(), WHISPER_TIMEOUTS.CHECK_INTERVAL);
  }

  setSender(fn: SenderFn): void {
    this.sender = fn;
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._unsubSettings?.();
    this._unsubSettings = null;
    this.sender = null;
  }

  async loadAll(): Promise<void> {
    const accountIds = getRegisteredAccounts().map((account) => account.id);
    const loaded = await Promise.all(
      accountIds.map(async (accountId) => [accountId, await this.loadAccount(accountId)] as const)
    );

    const next: Record<string, WhisperData> = {};
    loaded.forEach(([accountId, data]) => {
      next[accountId] = data;
    });
    this.data = next;
    this.notify();
  }

  async loadAccount(accountId: string): Promise<WhisperData> {
    try {
      if (accountId === "") {
        return { pending: [], done: [] };
      }

      const whisperLoad = window.electronAPI?.["whisperLoad"] as
        ((params?: Record<string, unknown>) => Promise<unknown>) | undefined;
      if (typeof whisperLoad !== "function") {
        return { pending: [], done: [] };
      }

      const resRaw: unknown = await whisperLoad({ accountId });
      const res = resRaw as { pending?: unknown; done?: unknown } | undefined;
      if (res !== undefined && typeof res === "object") {
        return {
          pending: Array.isArray(res.pending)
            ? (res.pending as WhisperRecord[]).map((record) => ({
                ...record,
                accountId,
                done: false,
                queued: false,
              }))
            : [],
          done: Array.isArray(res.done)
            ? (res.done as WhisperRecord[]).map((record) => ({
                ...record,
                accountId,
                done: true,
                queued: false,
              }))
            : [],
        };
      }
    } catch (e) {
      const err = e as Error;
      Logger.warn(LogCategory.WHISPER, whisperT("loadFailed", { accountId, message: err.message }));
    }

    return { pending: [], done: [] };
  }

  async saveAccount(accountId: string): Promise<void> {
    try {
      if (accountId === "") {
        return;
      }

      const electronApi = window.electronAPI;
      if (electronApi === undefined) {
        return;
      }

      const accountData = this.data[accountId] ?? { pending: [], done: [] };
      const whisperSave = electronApi["whisperSave"] as
        | ((
            params: { accountId: string; payload?: unknown } | string,
            data?: unknown
          ) => Promise<unknown>)
        | undefined;
      if (typeof whisperSave !== "function") return;
      await whisperSave({
        accountId,
        payload: accountData,
      });
    } catch (e) {
      const err = e as Error;
      Logger.error(
        LogCategory.WHISPER,
        whisperT("saveFailed", { accountId, message: err.message })
      );
    }
  }

  WhisperManagerAdd(accountIdRaw: string | undefined, text: string, when: unknown): WhisperRecord {
    const accountId = resolveAccountId(accountIdRaw ?? "");
    if (accountId === "") {
      throw new Error(whisperT("invalidAccountId"));
    }

    const rec: WhisperRecord = {
      id: generateUniqueId(LogCategory.WHISPER),
      accountId,
      text,
      when: this.parseWhen(when),
      createdAt: Date.now(),
      done: false,
      queued: false,
    };

    this.data[accountId] ??= { pending: [], done: [] };
    this.data[accountId].pending.push(rec);
    this.sortPending(accountId);
    void this.saveAccount(accountId);
    Logger.panel(LogCategory.WHISPER, LogLevel.INFO, whisperT("added", { accountId }));
    this.notify();

    return rec;
  }

  WhisperManagerDone(accountIdRaw: string | undefined, whisperId: string): boolean {
    const accountId = resolveAccountId(accountIdRaw ?? "");
    const data = this.data[accountId];
    if (!data) {
      return false;
    }

    const idx = data.pending.findIndex((record) => record.id === whisperId);
    if (idx === -1) {
      return false;
    }

    const rec = data.pending.splice(idx, 1)[0];
    if (!rec) {
      return false;
    }

    data.done.push({ ...rec, done: true, doneAt: Date.now(), queued: false });
    void this.saveAccount(accountId);
    Logger.success(LogCategory.WHISPER, whisperT("completed", { accountId }));
    this.notify();
    return true;
  }

  WhisperManagerDelete(accountIdRaw: string | undefined, whisperId: string | undefined): boolean {
    const accountId = resolveAccountId(accountIdRaw ?? "");
    const data = this.data[accountId];
    if (!data) {
      return false;
    }

    const beforePending = data.pending.length;
    const beforeDone = data.done.length;

    data.pending = data.pending.filter((record) => record.id !== whisperId);
    data.done = data.done.filter((record) => record.id !== whisperId);

    if (beforePending === data.pending.length && beforeDone === data.done.length) {
      return false;
    }

    void this.saveAccount(accountId);
    Logger.info(LogCategory.WHISPER, whisperT("deleted", { accountId }));
    this.notify();
    return true;
  }

  WhisperManagerUpdate(
    accountIdRaw: string | undefined,
    whisperId: string | undefined,
    patch: { text?: string; when?: unknown }
  ): boolean {
    const accountId = resolveAccountId(accountIdRaw ?? "");
    const data = this.data[accountId];
    if (!data || whisperId === undefined || whisperId === "") {
      return false;
    }

    const pendingRecord = data.pending.find((record) => record.id === whisperId);
    if (pendingRecord) {
      if (typeof patch.text === "string") {
        pendingRecord.text = patch.text;
      }
      if (patch.when !== undefined) {
        pendingRecord.when = this.parseWhen(patch.when);
      }
      this.sortPending(accountId);
      void this.saveAccount(accountId);
      this.notify();
      return true;
    }

    const doneRecord = data.done.find((record) => record.id === whisperId);
    if (doneRecord) {
      if (typeof patch.text === "string") {
        doneRecord.text = patch.text;
      }
      if (patch.when !== undefined) {
        doneRecord.when = this.parseWhen(patch.when);
      }
      void this.saveAccount(accountId);
      this.notify();
      return true;
    }

    return false;
  }

  WhisperManagerCheck(): boolean {
    if (this.paused) {
      return false;
    }

    const now = Date.now();
    Object.entries(this.data).forEach(([accountId, accountData]) => {
      const due = accountData.pending.filter((record) => record.when <= now && !record.queued);
      if (due.length === 0) {
        return;
      }

      due.forEach((record) => {
        void (async (): Promise<void> => {
          const slot = resolveDeliverySlot(accountId);
          if (slot === null) {
            Logger.warn(LogCategory.WHISPER, whisperT("accountSlotMissing", { accountId }));
            return;
          }

          const msg = whisperT("scheduledMessage", { text: record.text });
          this.markQueued(accountId, record.id);

          if (typeof this.sender !== "function") {
            this.markReady(accountId, record.id);
            return;
          }

          try {
            await this.sender(accountId, msg, record.id);
          } catch (e) {
            const err = e as Error;
            Logger.panel(
              LogCategory.WHISPER,
              LogLevel.ERROR,
              whisperT("deliveryFailed", {
                accountId,
                slot,
                message: err.message,
              })
            );
            this.markReady(accountId, record.id);
          }
        })();
      });
    });

    return true;
  }

  getRecords(accountIdRaw: string | undefined): WhisperRecord[] {
    const accountId = resolveAccountId(accountIdRaw ?? "");
    return [...(this.data[accountId]?.pending ?? [])];
  }

  getDoneRecords(accountIdRaw: string | undefined): WhisperRecord[] {
    const accountId = resolveAccountId(accountIdRaw ?? "");
    return [...(this.data[accountId]?.done ?? [])];
  }

  getAllByAccount(): Array<{ accountId: string; pending: WhisperRecord[]; done: WhisperRecord[] }> {
    const accountIds = getRegisteredAccounts().map((account) => account.id);
    return accountIds.map((accountId) => ({
      accountId,
      pending: [...(this.data[accountId]?.pending ?? [])],
      done: [...(this.data[accountId]?.done ?? [])],
    }));
  }

  parseWhen(raw: unknown): number {
    if (raw === undefined || raw === null || raw === "") {
      return Date.now();
    }
    if (raw instanceof Date) {
      return raw.getTime();
    }
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }
    if (typeof raw !== "string") {
      return Date.now();
    }

    const str = raw.trim();
    let parsed = Date.parse(str);
    if (!Number.isFinite(parsed)) {
      const match = str.match(
        /^([0-9]{1,2})[./]([0-9]{1,2})[./]([0-9]{4})[:\s]([0-9]{1,2})[.:]([0-9]{2})$/
      );
      if (match) {
        const [, day, month, year, hour, minute] = match;
        parsed = new Date(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute)
        ).getTime();
      }
    }

    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  sortPending(accountId: string): void {
    const data = this.data[accountId];
    if (data) {
      data.pending.sort((left, right) => left.when - right.when);
    }
  }

  markQueued(accountId: string, whisperId: string): void {
    const record = (this.data[accountId]?.pending ?? []).find((item) => item.id === whisperId);
    if (record) {
      record.queued = true;
      record.queuedAt = Date.now();
      void this.saveAccount(accountId);
    }
  }

  markReady(accountId: string, whisperId: string): void {
    const record = (this.data[accountId]?.pending ?? []).find((item) => item.id === whisperId);
    if (record) {
      record.queued = false;
      void this.saveAccount(accountId);
    }
  }

  catch(): (WhisperRecord & { accountId: string })[] {
    const now = Date.now();
    const due: (WhisperRecord & { accountId: string })[] = [];

    Object.entries(this.data).forEach(([accountId, accountData]) => {
      const list = accountData.pending.filter((record) => !record.queued && record.when <= now);
      due.push(...list.map((record) => ({ ...record, accountId })));
    });

    return due;
  }

  pause(): void {
    this.paused = true;
  }

  resume(runCheck = false): void {
    this.paused = false;
    if (runCheck) {
      this.WhisperManagerCheck();
    }
  }

  notify(): void {
    try {
      window.dispatchEvent(new CustomEvent("whisper-updated"));
    } catch (_e) {}
  }
}

const whisperManager = new WhisperManagerClass();
export { whisperManager as WhisperManager };

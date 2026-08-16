import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { Paths } from "./paths.ts";
import type { IpcMainInvokeEvent } from "electron";

interface WhisperData {
  pending: unknown[];
  done: unknown[];
}

interface WhisperStore {
  accounts: Record<string, WhisperData>;
}

function normalizeWhisperData(input: unknown): WhisperData {
  if (typeof input !== "object" || input === null) {
    return { pending: [], done: [] };
  }

  const candidate = input as { pending?: unknown; done?: unknown };
  return {
    pending: Array.isArray(candidate.pending) ? candidate.pending : [],
    done: Array.isArray(candidate.done) ? candidate.done : [],
  };
}

function parseWhisperStore(raw: string): WhisperStore {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    return { accounts: {} };
  }

  const record = parsed as { accounts?: unknown };
  if (typeof record.accounts !== "object" || record.accounts === null) {
    return { accounts: {} };
  }

  const normalized: Record<string, WhisperData> = {};
  Object.entries(record.accounts as Record<string, unknown>).forEach(([accountId, data]) => {
    normalized[accountId] = normalizeWhisperData(data);
  });

  return { accounts: normalized };
}

async function readStore(): Promise<WhisperStore> {
  const filePath = Paths.getWhispersPath();
  if (!existsSync(filePath)) {
    return { accounts: {} };
  }

  const raw = await readFile(filePath, "utf-8");
  return parseWhisperStore(raw);
}

async function writeStore(store: WhisperStore): Promise<void> {
  const dataDir = Paths.getDataDir();
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true });
  }

  const filePath = Paths.getWhispersPath();
  await writeFile(filePath, JSON.stringify(store, null, 2), "utf-8");
}

export async function whisperLoad(
  _event: IpcMainInvokeEvent | null,
  { accountId }: { accountId: string }
): Promise<WhisperData> {
  try {
    if (accountId.length === 0) {
      return { pending: [], done: [] };
    }

    const store = await readStore();
    return normalizeWhisperData(store.accounts[accountId]);
  } catch (_error: unknown) {
    return { pending: [], done: [] };
  }
}

export async function whisperSave(
  _event: IpcMainInvokeEvent | null,
  { accountId, payload }: { accountId: string; payload?: WhisperData }
): Promise<{ success: boolean; message?: string }> {
  try {
    if (accountId.length === 0) {
      return { success: false, message: "Account ID gerekli" };
    }

    const store = await readStore();
    store.accounts[accountId] = normalizeWhisperData(payload);
    await writeStore(store);

    return { success: true };
  } catch (error: unknown) {
    return { success: false, message: (error as Error).message };
  }
}

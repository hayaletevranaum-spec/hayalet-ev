// NOTE: Stores OpenCode UI page-local state in the Electron data directory.

import { join } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { registerHandler } from "./ipc-helpers.ts";
import { Paths } from "../paths.ts";
import type { OpencodeUiSharedState } from "../../shared/opencode-ui-state.js";
import {
  DEFAULT_OPENCODE_UI_SHARED_STATE,
  normalizeOpencodeUiQuickPromptRecords,
  normalizeOpencodeUiSharedState,
} from "../../shared/opencode-ui-state.js";

interface QuickPromptRecord {
  id: string;
  name: string;
  content: string;
  createdAt: number;
}

interface OpencodeUiQuickPromptStoreResult {
  success: boolean;
  prompts: QuickPromptRecord[];
  path: string;
  error?: string;
  errorKey?: string;
  errorParams?: { message: string };
}

interface OpencodeUiSharedStateResult {
  success: boolean;
  state: OpencodeUiSharedState;
  path: string;
  error?: string;
  errorKey?: string;
  errorParams?: { message: string };
}

function getQuickPromptsPath(): string {
  return join(Paths.getDataDir(), "opencode-ui-quick-prompts.json");
}

function getSharedStateDirPath(): string {
  return join(Paths.getDataDir(), "shared");
}

function getSharedStatePath(): string {
  return join(getSharedStateDirPath(), "opencode-ui-state.json");
}

function normalizeQuickPromptRecords(value: unknown): QuickPromptRecord[] {
  return normalizeOpencodeUiQuickPromptRecords(value);
}

async function readLegacyQuickPrompts(): Promise<QuickPromptRecord[]> {
  const filePath = getQuickPromptsPath();

  try {
    const content = await readFile(filePath, "utf-8");
    return normalizeQuickPromptRecords(JSON.parse(content) as unknown);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      return [];
    }

    throw err;
  }
}

function cloneDefaultSharedState(): OpencodeUiSharedState {
  return normalizeOpencodeUiSharedState(DEFAULT_OPENCODE_UI_SHARED_STATE);
}

async function readSharedStateFile(): Promise<OpencodeUiSharedState> {
  const filePath = getSharedStatePath();

  try {
    const content = await readFile(filePath, "utf-8");
    return normalizeOpencodeUiSharedState(JSON.parse(content) as unknown);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code !== "ENOENT") {
      throw err;
    }
  }

  const legacyQuickPrompts = await readLegacyQuickPrompts();
  return normalizeOpencodeUiSharedState({
    ...cloneDefaultSharedState(),
    ...(legacyQuickPrompts.length > 0 ? { quickPrompts: legacyQuickPrompts } : {}),
  });
}

async function writeSharedStateFile(state: unknown): Promise<OpencodeUiSharedState> {
  const filePath = getSharedStatePath();
  const normalized = normalizeOpencodeUiSharedState(state);
  await mkdir(getSharedStateDirPath(), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  return normalized;
}

export function setupOpencodeUiToolsHandlers(): void {
  registerHandler("opencode-ui-quick-prompts-read", async () => {
    const filePath = getSharedStatePath();

    try {
      const state = await readSharedStateFile();
      return {
        success: true,
        prompts: state.quickPrompts,
        path: filePath,
      } satisfies OpencodeUiQuickPromptStoreResult;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ENOENT") {
        return {
          success: true,
          prompts: [],
          path: filePath,
        } satisfies OpencodeUiQuickPromptStoreResult;
      }

      return {
        success: false,
        prompts: [],
        path: filePath,
        error: error.message,
        errorKey: "electron.ipc.errors.operationFailed",
        errorParams: { message: error.message },
      } satisfies OpencodeUiQuickPromptStoreResult;
    }
  });

  registerHandler("opencode-ui-quick-prompts-write", async (promptsPayload: unknown) => {
    const filePath = getSharedStatePath();

    try {
      const prompts = normalizeQuickPromptRecords(promptsPayload);
      const current = await readSharedStateFile();
      await writeSharedStateFile({
        ...current,
        quickPrompts: prompts,
      });
      return {
        success: true,
        prompts,
        path: filePath,
      } satisfies OpencodeUiQuickPromptStoreResult;
    } catch (err) {
      const message = (err as Error).message;
      return {
        success: false,
        prompts: [],
        path: filePath,
        error: message,
        errorKey: "electron.ipc.errors.operationFailed",
        errorParams: { message },
      } satisfies OpencodeUiQuickPromptStoreResult;
    }
  });

  registerHandler("opencode-ui-shared-state-read", async () => {
    const filePath = getSharedStatePath();

    try {
      const state = await readSharedStateFile();
      return {
        success: true,
        state,
        path: filePath,
      } satisfies OpencodeUiSharedStateResult;
    } catch (err) {
      const message = (err as Error).message;
      return {
        success: false,
        state: cloneDefaultSharedState(),
        path: filePath,
        error: message,
        errorKey: "electron.ipc.errors.operationFailed",
        errorParams: { message },
      } satisfies OpencodeUiSharedStateResult;
    }
  });

  registerHandler("opencode-ui-shared-state-write", async (payload: unknown) => {
    const filePath = getSharedStatePath();

    try {
      const state = await writeSharedStateFile(payload);
      return {
        success: true,
        state,
        path: filePath,
      } satisfies OpencodeUiSharedStateResult;
    } catch (err) {
      const message = (err as Error).message;
      return {
        success: false,
        state: cloneDefaultSharedState(),
        path: filePath,
        error: message,
        errorKey: "electron.ipc.errors.operationFailed",
        errorParams: { message },
      } satisfies OpencodeUiSharedStateResult;
    }
  });
}

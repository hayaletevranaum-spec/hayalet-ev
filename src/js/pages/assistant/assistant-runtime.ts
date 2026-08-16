import { LogCategory } from "@shared/logging-core";

import { AppI18n } from "../../modules/i18n/index.js";
import { Logger } from "../../modules/logger/index.js";

function assistantT(key: string): string {
  return AppI18n.t(`shell.assistant.${key}`);
}

export type AssistantRuntimeMode = "terminal" | "soft" | "ghost-agent";
export type AssistantRuntimePhase = "idle" | "preparing-handoff" | "in-ghost" | "returning";

export interface AssistantRuntimeState {
  workflowSessionId: string;
  desiredMode: AssistantRuntimeMode;
  phase: AssistantRuntimePhase;
  updatedAt: string;
}

type AssistantRuntimeReadResponse = { success: boolean; state?: AssistantRuntimeState };
type AssistantRuntimeReadFn = () => Promise<AssistantRuntimeReadResponse>;
type AssistantRuntimeWriteFn = (
  payload: Record<string, unknown>
) => Promise<AssistantRuntimeReadResponse>;

export function generateWorkflowSessionId(): string {
  return `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function readAssistantRuntimeState(): Promise<AssistantRuntimeState | null> {
  const api = window.electronAPI;
  const read = api?.["assistantRuntimeRead"] as AssistantRuntimeReadFn | undefined;
  if (typeof read !== "function") return null;

  try {
    const response = await read();
    if (response.success !== true || response.state === undefined) return null;
    return response.state;
  } catch {
    return null;
  }
}

export async function syncAssistantRuntimeDefaults(): Promise<void> {
  const api = window.electronAPI;
  const read = api?.["assistantRuntimeRead"] as AssistantRuntimeReadFn | undefined;
  if (typeof read !== "function") return;

  try {
    const response = await read();
    const state = response.state;
    if (!response.success || state === undefined) {
      const write = api?.["assistantRuntimeWrite"] as AssistantRuntimeWriteFn | undefined;
      if (typeof write === "function") {
        await write({
          workflowSessionId: generateWorkflowSessionId(),
          desiredMode: "soft",
          phase: "idle",
        });
      }
      return;
    }

    if (state.workflowSessionId === "") {
      const write = api?.["assistantRuntimeWrite"] as AssistantRuntimeWriteFn | undefined;
      if (typeof write === "function") {
        await write({
          workflowSessionId: generateWorkflowSessionId(),
        });
      }
    }
  } catch (error) {
    Logger.warn(LogCategory.ASSISTANT_CORE, assistantT("logs.runtimeDefaultsWriteFailed"), {
      error: (error as Error).message,
    });
  }
}

export async function updateAssistantRuntimeState(patch: Record<string, unknown>): Promise<void> {
  const api = window.electronAPI;
  const write = api?.["assistantRuntimeWrite"] as AssistantRuntimeWriteFn | undefined;
  if (typeof write !== "function") return;

  try {
    const payload = { ...patch };
    if (
      (payload["workflowSessionId"] === undefined || payload["workflowSessionId"] === "") &&
      (payload["phase"] === "preparing-handoff" || payload["phase"] === "in-ghost")
    ) {
      payload["workflowSessionId"] = generateWorkflowSessionId();
    }

    await write(payload);
  } catch (error) {
    Logger.warn(LogCategory.ASSISTANT_CORE, assistantT("logs.runtimeStateUpdateFailed"), {
      error: (error as Error).message,
    });
  }
}

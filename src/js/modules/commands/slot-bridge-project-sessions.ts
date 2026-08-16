import { LogCategory, LogLevel } from "@shared/logging-core";
import type { SlotId } from "@shared/common.js";
import type { AppSettings, ProjectAiSessionBinding } from "@shared/settings.js";
import type {
  CommandProvider,
  SlotBridgeEnvelope,
  SlotBridgeProjectRef,
  SlotBridgeResult,
  SlotBridgeSessionRef,
} from "@shared/index.js";
import { AppState } from "../app-state.js";
import { Logger } from "../logger/index.js";
import { SettingsManager } from "../settings-manager.js";

export interface SlotBridgeProjectSessionWarning {
  code: "PROJECT_SLOT_MISMATCH" | "PROJECT_ACCOUNT_MISMATCH" | "PROJECT_SLOT_UNASSIGNED";
  message: string;
  expectedAccountId: string;
  expectedSlot: SlotId;
  actualAccountId: string | null;
  actualSlot: SlotId;
}

export interface SlotBridgeProjectSessionContext {
  binding: ProjectAiSessionBinding | null;
  projectRef: {
    projectId: string;
    roomId: string | null;
    title?: string | null;
  };
  restored: boolean;
  targetSlot: SlotId | null;
  warning: SlotBridgeProjectSessionWarning | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

function readString(value: unknown): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : "";
}

function normalizeSlot(value: unknown): SlotId | null {
  return value === "ai0" || value === "ai1" || value === "ai2" ? value : null;
}

function normalizeTargetSlot(value: CommandProvider | null | undefined): SlotId | null {
  return normalizeSlot(value);
}

function normalizeSessionRef(value: unknown): SlotBridgeSessionRef | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value["id"]);
  const conversationId = readString(value["conversationId"]);
  const threadId = readString(value["threadId"]);
  const openHint = readString(value["openHint"]);
  if (id === "" && conversationId === "" && threadId === "" && openHint === "") {
    return null;
  }

  return {
    ...(id !== "" ? { id } : {}),
    ...(conversationId !== "" ? { conversationId } : {}),
    ...(threadId !== "" ? { threadId } : {}),
    ...(openHint !== "" ? { openHint } : {}),
  };
}

function hasSessionRefValue(sessionRef: SlotBridgeSessionRef | null | undefined): boolean {
  return (
    readString(sessionRef?.id) !== "" ||
    readString(sessionRef?.conversationId) !== "" ||
    readString(sessionRef?.threadId) !== "" ||
    readString(sessionRef?.openHint) !== ""
  );
}

export function readSlotBridgeProjectRef(value: unknown): SlotBridgeProjectRef | null {
  if (typeof value === "string") {
    const projectId = readString(value);
    return projectId !== "" ? { projectId } : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const explicitProjectId = readString(value["projectId"]);
  const projectId = explicitProjectId !== "" ? explicitProjectId : readString(value["id"]);
  if (projectId === "") {
    return null;
  }

  const roomId = readString(value["roomId"]);
  const title = readString(value["title"]);
  return {
    projectId,
    ...(roomId !== "" ? { roomId } : {}),
    ...(title !== "" ? { title } : {}),
  };
}

function readProjectRefAliases(value: unknown): SlotBridgeProjectRef[] {
  if (!isRecord(value)) {
    return [];
  }

  const aliases: SlotBridgeProjectRef[] = [];
  const aliasRefs = value["aliases"] ?? value["aliasRefs"] ?? value["projectAliases"];
  if (Array.isArray(aliasRefs)) {
    aliasRefs.forEach((item) => {
      const alias = readSlotBridgeProjectRef(item);
      if (alias !== null) {
        aliases.push(alias);
      }
    });
  }

  const aliasProjectIds = value["aliasProjectIds"];
  if (Array.isArray(aliasProjectIds)) {
    aliasProjectIds.forEach((item) => {
      const projectId = readString(item);
      if (projectId !== "") {
        aliases.push({ projectId });
      }
    });
  }

  return aliases;
}

function normalizeProjectRef(
  projectRef: SlotBridgeProjectRef | null | undefined
): SlotBridgeProjectSessionContext["projectRef"] | null {
  const normalized = readSlotBridgeProjectRef(projectRef);
  const explicitProjectId = readString(normalized?.projectId);
  const projectId = explicitProjectId !== "" ? explicitProjectId : readString(normalized?.id);
  if (projectId === "") {
    return null;
  }

  const roomId = readString(normalized?.roomId);
  const title = readString(normalized?.title);
  return {
    projectId,
    roomId: roomId !== "" ? roomId : null,
    ...(title !== "" ? { title } : {}),
  };
}

function normalizeBinding(value: unknown): ProjectAiSessionBinding | null {
  if (!isRecord(value)) {
    return null;
  }

  const explicitProjectId = readString(value["projectId"]);
  const projectId = explicitProjectId !== "" ? explicitProjectId : readString(value["id"]);
  const slot = normalizeSlot(value["slot"]);
  const accountId = readString(value["accountId"]);
  if (projectId === "" || slot === null || accountId === "") {
    return null;
  }

  const roomId = readString(value["roomId"]);
  const providerId = readString(value["providerId"]);
  const webUrl = readString(value["webUrl"]);
  const createdAt =
    typeof value["createdAt"] === "number" && Number.isFinite(value["createdAt"])
      ? Math.max(0, Math.trunc(value["createdAt"]))
      : undefined;
  const updatedAt =
    typeof value["updatedAt"] === "number" && Number.isFinite(value["updatedAt"])
      ? Math.max(0, Math.trunc(value["updatedAt"]))
      : undefined;

  return {
    projectId,
    roomId: roomId !== "" ? roomId : null,
    slot,
    accountId,
    providerId: providerId !== "" ? providerId : null,
    sessionRef: normalizeSessionRef(value["sessionRef"]),
    webUrl: webUrl !== "" ? webUrl : null,
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

export function normalizeProjectAiSessionBindings(value: unknown): ProjectAiSessionBinding[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const byKey = new Map<string, ProjectAiSessionBinding>();
  value.forEach((item) => {
    const binding = normalizeBinding(item);
    if (binding !== null) {
      byKey.set(`${binding.roomId ?? ""}\u0000${binding.projectId}`, binding);
    }
  });
  return Array.from(byKey.values());
}

function getBindingKey(projectRef: SlotBridgeProjectSessionContext["projectRef"]): string {
  return `${projectRef.roomId ?? ""}\u0000${projectRef.projectId}`;
}

export function findProjectAiSessionBinding(
  projectRef: SlotBridgeProjectRef | null | undefined,
  settings: AppSettings | null = SettingsManager.getSnapshot()
): ProjectAiSessionBinding | null {
  const normalizedRef = normalizeProjectRef(projectRef);
  if (normalizedRef === null) {
    return null;
  }

  const key = getBindingKey(normalizedRef);
  return (
    normalizeProjectAiSessionBindings(settings?.projectAiSessions).find(
      (binding) => `${binding.roomId ?? ""}\u0000${binding.projectId}` === key
    ) ?? null
  );
}

function findProjectAiSessionAliasBinding(
  projectRef: SlotBridgeProjectRef | null | undefined,
  settings: AppSettings | null
): ProjectAiSessionBinding | null {
  for (const alias of readProjectRefAliases(projectRef)) {
    const binding = findProjectAiSessionBinding(alias, settings);
    if (binding !== null) {
      return binding;
    }
  }
  return null;
}

function getAssignedAccount(slot: SlotId): {
  accountId: string;
  providerId: string | null;
} | null {
  const account = AppState.getAccountForSlot(slot);
  const accountId = readString(account?.id);
  if (accountId === "") {
    return null;
  }

  const assignedProviderId = readString(AppState.getProviderIdForSlot(slot));
  const providerId = assignedProviderId !== "" ? assignedProviderId : readString(account?.provider);
  return {
    accountId,
    providerId: providerId !== "" ? providerId : null,
  };
}

function buildProjectSessionWarning(
  binding: ProjectAiSessionBinding,
  targetSlot: SlotId
): SlotBridgeProjectSessionWarning | null {
  const assigned = getAssignedAccount(targetSlot);
  if (binding.slot !== targetSlot) {
    return {
      code: "PROJECT_SLOT_MISMATCH",
      message: `Project ${binding.projectId} was started on ${binding.slot.toUpperCase()}, but ${targetSlot.toUpperCase()} is selected.`,
      expectedAccountId: binding.accountId,
      expectedSlot: binding.slot,
      actualAccountId: assigned?.accountId ?? null,
      actualSlot: targetSlot,
    };
  }

  if (assigned === null) {
    return {
      code: "PROJECT_SLOT_UNASSIGNED",
      message: `Project ${binding.projectId} expects ${binding.accountId} on ${binding.slot.toUpperCase()}, but the slot has no assigned account.`,
      expectedAccountId: binding.accountId,
      expectedSlot: binding.slot,
      actualAccountId: null,
      actualSlot: targetSlot,
    };
  }

  if (assigned.accountId !== binding.accountId) {
    return {
      code: "PROJECT_ACCOUNT_MISMATCH",
      message: `Project ${binding.projectId} expects account ${binding.accountId} on ${binding.slot.toUpperCase()}, but ${assigned.accountId} is assigned.`,
      expectedAccountId: binding.accountId,
      expectedSlot: binding.slot,
      actualAccountId: assigned.accountId,
      actualSlot: targetSlot,
    };
  }

  return null;
}

function toastProjectSessionWarning(warning: SlotBridgeProjectSessionWarning | null): void {
  if (warning === null) {
    return;
  }

  try {
    Logger.toast(LogCategory.SYSTEM, LogLevel.WARNING, warning.message, {
      code: warning.code,
      expectedAccountId: warning.expectedAccountId,
      expectedSlot: warning.expectedSlot,
      actualAccountId: warning.actualAccountId,
      actualSlot: warning.actualSlot,
    });
  } catch {}
}

export function prepareSlotBridgeProjectSessionEnvelope(envelope: SlotBridgeEnvelope): {
  context: SlotBridgeProjectSessionContext | null;
  envelope: SlotBridgeEnvelope;
} {
  const projectRef = normalizeProjectRef(envelope.projectRef);
  const targetSlot = normalizeTargetSlot(envelope.toSlot);
  if (projectRef === null) {
    return { context: null, envelope };
  }

  const settings = SettingsManager.getSnapshot();
  const binding =
    findProjectAiSessionBinding(projectRef, settings) ??
    findProjectAiSessionAliasBinding(envelope.projectRef, settings);
  const warning =
    binding !== null && targetSlot !== null
      ? buildProjectSessionWarning(binding, targetSlot)
      : null;
  toastProjectSessionWarning(warning);

  const shouldRestore =
    binding !== null &&
    warning === null &&
    hasSessionRefValue(envelope.sessionRef) !== true &&
    hasSessionRefValue(binding.sessionRef) === true &&
    envelope.action !== "session.open";
  const nextEnvelope = shouldRestore
    ? {
        ...envelope,
        sessionRef: binding.sessionRef ?? null,
      }
    : envelope;

  return {
    context: {
      binding,
      projectRef,
      restored: shouldRestore,
      targetSlot,
      warning,
    },
    envelope: nextEnvelope,
  };
}

function readResultWebUrl(result: SlotBridgeResult): string | null {
  const data = isRecord(result.data) ? result.data : {};
  const webUrl = readString(data["webUrl"]);
  return webUrl !== "" ? webUrl : null;
}

async function upsertProjectAiSessionBinding(params: {
  projectRef: SlotBridgeProjectSessionContext["projectRef"];
  sessionRef: SlotBridgeSessionRef | null;
  slot: SlotId;
  webUrl: string | null;
}): Promise<ProjectAiSessionBinding | null> {
  const assigned = getAssignedAccount(params.slot);
  if (assigned === null) {
    return null;
  }

  const existing = findProjectAiSessionBinding(params.projectRef);
  const now = Date.now();
  const nextBinding: ProjectAiSessionBinding = {
    projectId: params.projectRef.projectId,
    roomId: params.projectRef.roomId,
    slot: params.slot,
    accountId: assigned.accountId,
    providerId: assigned.providerId,
    sessionRef: params.sessionRef ?? existing?.sessionRef ?? null,
    webUrl: params.webUrl ?? existing?.webUrl ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const key = getBindingKey(params.projectRef);

  await SettingsManager.patch((settings) => {
    const current = normalizeProjectAiSessionBindings(settings["projectAiSessions"]);
    const index = current.findIndex(
      (binding) => `${binding.roomId ?? ""}\u0000${binding.projectId}` === key
    );
    if (index >= 0) {
      current[index] = nextBinding;
    } else {
      current.push(nextBinding);
    }
    settings["projectAiSessions"] = current;
  });

  return nextBinding;
}

function mergeProjectSessionData(
  result: SlotBridgeResult,
  context: SlotBridgeProjectSessionContext,
  persisted: ProjectAiSessionBinding | null
): SlotBridgeResult {
  const data = isRecord(result.data) ? result.data : {};
  return {
    ...result,
    data: {
      ...data,
      projectSession: {
        projectId: context.projectRef.projectId,
        roomId: context.projectRef.roomId,
        restored: context.restored,
        targetSlot: context.targetSlot,
        warning: context.warning,
        binding: persisted ?? context.binding,
      },
    },
  };
}

export async function finalizeSlotBridgeProjectSessionResult(
  _envelope: SlotBridgeEnvelope,
  result: SlotBridgeResult,
  context: SlotBridgeProjectSessionContext | null
): Promise<SlotBridgeResult> {
  if (context === null) {
    return result;
  }

  const sessionRef = normalizeSessionRef(result.session);
  const webUrl = readResultWebUrl(result);
  const targetSlot = context.targetSlot;
  const shouldPersist =
    result.success === true &&
    targetSlot !== null &&
    (hasSessionRefValue(sessionRef) === true || webUrl !== null);
  let persisted: ProjectAiSessionBinding | null = null;
  if (shouldPersist) {
    try {
      persisted = await upsertProjectAiSessionBinding({
        projectRef: context.projectRef,
        sessionRef,
        slot: targetSlot,
        webUrl,
      });
    } catch (error) {
      Logger.warn(LogCategory.SYSTEM, "Project AI session binding could not be saved.", {
        error: error instanceof Error ? error.message : String(error),
        projectId: context.projectRef.projectId,
        roomId: context.projectRef.roomId,
      });
    }
  }

  return mergeProjectSessionData(result, context, persisted);
}

export function shouldReturnProjectSessionWarningOnly(
  envelope: SlotBridgeEnvelope,
  context: SlotBridgeProjectSessionContext | null
): boolean {
  return (
    context?.warning != null &&
    context.binding !== null &&
    hasSessionRefValue(envelope.sessionRef) !== true &&
    (envelope.action === "session.switch" ||
      envelope.action === "message.send" ||
      envelope.action === "message.sendWait")
  );
}

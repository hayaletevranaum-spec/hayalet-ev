import { ProviderRegistry } from "../webview/provider-registry.js";
import type { SlotId } from "@shared/index.js";
import { LogLevel } from "@shared/index.js";
import type { BaseProviderConfig } from "@shared/provider.js";
import {
  getAiProviderAccounts,
  isAssistantAccountsSettingsPath,
  isAssistantSlotSettingsPath,
} from "@shared/settings.js";
import type { Account as SharedAccount } from "@shared/settings.js";

interface SlotState {
  accountId: string | null;
  providerId: string | null;
  providerConfig: BaseProviderConfig | null;
  state: string;
}

interface SlotSettings {
  accountId?: string;
}

export interface Settings {
  slots?: Record<string, SlotSettings>;
  accounts?: SharedAccount[];
  assistantSlot?: SlotSettings;
  assistantAccounts?: SharedAccount[];
}

interface SlotStates {
  EMPTY: string;
  ASSIGNED: string;
  CONNECTED: string;
  CONNECTING: string;
}

interface SlotEvents {
  ACCOUNT_ASSIGNED: string;
  ACCOUNT_REMOVED: string;
}

type LogFn = (slot: SlotId, level: LogLevel, message: string) => void;
type TransitionFn = (slot: string, state: string) => void;
type EmitFn = (slot: string, event: string, data: Record<string, unknown>) => void;
type DisconnectFn = (slot: string, opts?: { force?: boolean }) => unknown;
type NavigateFn = (slot: string) => void;
type SyncSlotFn = (slot: string, settings: Settings) => void;

export function handleSettingsChange(
  _slots: Record<string, SlotState>,
  settings: Settings | null,
  changedPaths: string[],
  syncSlotFn: SyncSlotFn
): void {
  if (!settings) return;

  ["ai1", "ai2"].forEach((slot) => {
    const slotPath = `slots.${slot}.accountId`;
    const accountChanged =
      changedPaths.includes("*") ||
      changedPaths.some((p) => p === slotPath || p.startsWith("accounts"));

    if (accountChanged) {
      syncSlotFn(slot, settings);
    }
  });

  const assistantChanged =
    changedPaths.includes("*") ||
    changedPaths.some(
      (path) => isAssistantSlotSettingsPath(path) || isAssistantAccountsSettingsPath(path)
    );
  if (assistantChanged) {
    syncSlotFn("ai0", settings);
  }
}

export function syncWithSettings(
  _slots: Record<string, SlotState>,
  settings: Settings | null,
  syncSlotFn: SyncSlotFn
): void {
  if (!settings) return;
  ["ai0", "ai1", "ai2"].forEach((slot) => {
    syncSlotFn(slot, settings);
  });
}

export function syncSlotWithSettings(
  slotState: SlotState,
  slot: string,
  settings: Settings | null,
  states: SlotStates,
  events: SlotEvents,
  logFn: LogFn,
  transitionFn: TransitionFn,
  emitFn: EmitFn,
  disconnectFn: DisconnectFn,
  navigateFn: NavigateFn
): void {
  if (!settings) return;

  const isAssistantSlot = slot === "ai0";
  const slotSettings = isAssistantSlot ? settings.assistantSlot : settings.slots?.[slot];
  const newAccountId = slotSettings?.accountId ?? null;
  const oldAccountId = slotState.accountId;

  if (newAccountId === oldAccountId) return;

  logFn(
    slot as SlotId,
    LogLevel.INFO,
    `Account changed: ${oldAccountId ?? ""} -> ${newAccountId ?? ""}`
  );

  if (newAccountId === null || newAccountId === "") {
    if (slotState.state === states.CONNECTED || slotState.state === states.CONNECTING) {
      void disconnectFn(slot, { force: true });
    }

    if (slotState.state === states.EMPTY) {
      slotState.accountId = null;
      slotState.providerId = null;
      slotState.providerConfig = null;
      return;
    }

    slotState.accountId = null;
    slotState.providerId = null;
    slotState.providerConfig = null;
    transitionFn(slot, states.EMPTY);
    emitFn(slot, events.ACCOUNT_REMOVED, { oldAccountId });
    return;
  }

  const accountList = isAssistantSlot
    ? settings.assistantAccounts
    : getAiProviderAccounts(settings.accounts);
  const account = accountList?.find((a) => a.id === newAccountId);
  const providerId = account?.provider ?? null;
  const providerConfig =
    providerId !== null ? (ProviderRegistry.get(providerId) as BaseProviderConfig | null) : null;

  slotState.accountId = newAccountId;
  slotState.providerId = providerId;
  slotState.providerConfig = providerConfig;

  if (slotState.state === states.CONNECTED) {
    logFn(
      slot as SlotId,
      LogLevel.INFO,
      "Account changed while connected - will navigate to new provider"
    );
    navigateFn(slot);
  } else if (slotState.state === states.EMPTY) {
    transitionFn(slot, states.ASSIGNED);
  }

  emitFn(slot, events.ACCOUNT_ASSIGNED, { accountId: newAccountId, providerId });
}

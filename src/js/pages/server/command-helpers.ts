import type { AppSettings } from "@shared/settings.js";
import type {
  CommandCatalogItem,
  CommandCategory,
  CommandSlot,
  ServerCommandsApi,
} from "./types.js";

export function normalizeSlot(value: string): CommandSlot {
  if (value === "ai0" || value === "ai1" || value === "ai2" || value === "us1") {
    return value;
  }
  return "ai1";
}

export function resolveCategoryForSlot(slot: CommandSlot): CommandCategory {
  if (slot === "ai0") {
    return "ai0";
  }
  if (slot === "us1") {
    return "us1";
  }
  return "ai1-ai2";
}

export function getCommandCatalog(
  commandApi: ServerCommandsApi,
  category: CommandCategory
): CommandCatalogItem[] {
  if (typeof commandApi.getCatalog === "function") {
    return commandApi.getCatalog(category);
  }

  if (typeof commandApi.listByCategory === "function") {
    return commandApi.listByCategory(category).map((name) => ({
      name,
      category,
      isCustom: false,
      supportsTestMode: false,
    }));
  }

  return commandApi.list().map((name) => ({
    name,
    category,
    isCustom: false,
    supportsTestMode: false,
  }));
}

export function getDisabledCommandsForSlot(settings: AppSettings, slot: CommandSlot): string[] {
  if (slot === "ai1" || slot === "ai2") {
    const disabled = settings.slots[slot].disabledCommands;
    return Array.isArray(disabled)
      ? disabled.filter((item): item is string => typeof item === "string")
      : [];
  }

  if (slot === "us1") {
    const disabled = settings.us1Slot?.disabledCommands;
    return Array.isArray(disabled)
      ? disabled.filter((item): item is string => typeof item === "string")
      : [];
  }

  const assistantDisabled = settings.assistantSlot?.disabledCommands;
  return Array.isArray(assistantDisabled)
    ? assistantDisabled.filter((item): item is string => typeof item === "string")
    : [];
}

export function splitCommandCatalogBySource(items: CommandCatalogItem[]): {
  systemCommands: CommandCatalogItem[];
  roomCommands: CommandCatalogItem[];
} {
  return {
    systemCommands: items.filter((item) => item.isCustom !== true),
    roomCommands: items.filter((item) => item.isCustom === true),
  };
}

export function isCommandEnabled(disabledCommands: string[], commandName: string): boolean {
  return disabledCommands.every((item) => item.toLowerCase() !== commandName.toLowerCase());
}

export function buildSettingsWithDisabledCommands(
  settings: AppSettings,
  slot: CommandSlot,
  disabledCommands: string[]
): AppSettings {
  const unique = Array.from(
    new Set(disabledCommands.map((item) => item.trim()).filter((item) => item !== ""))
  );

  if (slot === "ai1" || slot === "ai2") {
    const slotSettings = settings.slots[slot];
    return {
      ...settings,
      slots: {
        ...settings.slots,
        [slot]: {
          ...slotSettings,
          disabledCommands: unique,
        },
      },
    };
  }

  if (slot === "us1") {
    const us1Slot = settings.us1Slot ?? {
      communicationSystem: "mail",
      selectedIdentityId: null,
      selectedRemoteUserId: null,
      selectedAccountId: null,
      connectionState: "disconnected",
      relayConnectionState: "disconnected",
      catchCommands: false,
      disabledCommands: [],
      resumeLastSession: true,
      rememberConnectionStatus: false,
      lastConnectionState: "disconnected",
    };

    return {
      ...settings,
      us1Slot: {
        ...us1Slot,
        disabledCommands: unique,
      },
    };
  }

  const assistantSlot = settings.assistantSlot ?? {
    accountId: null,
    catchCommands: false,
    disabledCommands: [],
    messageMethod: "injection",
    fileMethod: "injection",
  };

  return {
    ...settings,
    assistantSlot: {
      ...assistantSlot,
      disabledCommands: unique,
    },
  };
}

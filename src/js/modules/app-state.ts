import { SettingsManager } from "./settings-manager.js";
import { Logger, LogCategory } from "./logger/index.js";
import type {
  Account,
  AppSettings,
  RemoteUserIdentity,
  Us1SlotSettings,
} from "@shared/settings.js";
import { SlotPresenceStore } from "./slot-presence-store.js";

interface AppStateSnapshot {
  activeProvider: string | null;
  activeConversations: Record<string, string | null>;
  assistantToolsReady: boolean;
  us1PendingSessions: Record<
    string,
    {
      conversationId: string | null;
      unreadCount: number;
      updatedAt: number;
    }
  >;
  chat: {
    activeTargets: string[];
    titleByProvider: Record<string, string>;
  };
  assistantRelay: {
    active: boolean;
    sourceSlot: string | null;
  };
}

class AppStateClass {
  activeProvider: string | null;
  activeConversations: Record<string, string | null>;
  us1PendingSessions: Record<
    string,
    {
      conversationId: string | null;
      unreadCount: number;
      updatedAt: number;
    }
  >;
  listeners: ((state: AppStateSnapshot) => void)[];
  chat: {
    activeTargets: string[];
    titleByProvider: Record<string, string>;
  };
  assistantToolsReady: boolean;
  assistantRelay: {
    active: boolean;
    sourceSlot: string | null;
  };

  constructor() {
    this.activeProvider = null;
    this.activeConversations = {};
    this.us1PendingSessions = {};
    this.listeners = [];
    this.chat = {
      activeTargets: ["ai1"],
      titleByProvider: { ai0: "", ai1: "", ai2: "", us1: "" },
    };
    this.assistantToolsReady = true;
    this.assistantRelay = {
      active: false,
      sourceSlot: null,
    };

    SlotPresenceStore.subscribe(() => {
      this.notify();
    });
  }

  init(defaultProvider = "ai1"): void {
    this.activeProvider = defaultProvider;
    this.activeConversations = { ai0: null, ai1: null, ai2: null, us1: null };
    this.us1PendingSessions = {};
    this.chat = {
      activeTargets: ["ai1"],
      titleByProvider: { ai0: "", ai1: "", ai2: "", us1: "" },
    };
    this.assistantToolsReady = true;
    this.assistantRelay = {
      active: false,
      sourceSlot: null,
    };
    this.notify();
  }

  setActiveProvider(provider: string): void {
    this.activeProvider = provider;
    this.notify();
  }

  setActiveConversation(provider: string, conversationId: string | null): void {
    this.activeConversations[provider] = conversationId;
    this.notify();
  }

  markUs1PendingSession(
    localSessionId: string,
    options: {
      conversationId?: string | null;
      unreadDelta?: number;
      updatedAt?: number;
    } = {}
  ): void {
    const normalizedSessionId = localSessionId.trim();
    if (normalizedSessionId === "") {
      return;
    }

    const current = this.us1PendingSessions[normalizedSessionId];
    this.us1PendingSessions = {
      ...this.us1PendingSessions,
      [normalizedSessionId]: {
        conversationId:
          options.conversationId !== undefined
            ? (options.conversationId ?? null)
            : (current?.conversationId ?? null),
        unreadCount: Math.max(1, (current?.unreadCount ?? 0) + (options.unreadDelta ?? 1)),
        updatedAt:
          typeof options.updatedAt === "number" && Number.isFinite(options.updatedAt)
            ? Math.trunc(options.updatedAt)
            : Date.now(),
      },
    };
    this.notify();
  }

  clearUs1PendingSession(localSessionId: string | null | undefined): void {
    const normalizedSessionId = typeof localSessionId === "string" ? localSessionId.trim() : "";
    if (normalizedSessionId === "" || this.us1PendingSessions[normalizedSessionId] === undefined) {
      return;
    }

    const nextPendingSessions = { ...this.us1PendingSessions };
    delete nextPendingSessions[normalizedSessionId];
    this.us1PendingSessions = nextPendingSessions;
    this.notify();
  }

  clearUs1PendingSessionByConversation(conversationId: string | null | undefined): void {
    const normalizedConversationId =
      typeof conversationId === "string" ? conversationId.trim() : "";
    if (normalizedConversationId === "") {
      return;
    }

    let changed = false;
    const nextPendingSessions = { ...this.us1PendingSessions };
    for (const [localSessionId, pending] of Object.entries(this.us1PendingSessions)) {
      if (pending.conversationId !== normalizedConversationId) {
        continue;
      }
      delete nextPendingSessions[localSessionId];
      changed = true;
    }

    if (!changed) {
      return;
    }

    this.us1PendingSessions = nextPendingSessions;
    this.notify();
  }

  getUs1PendingSessions(): Record<
    string,
    {
      conversationId: string | null;
      unreadCount: number;
      updatedAt: number;
    }
  > {
    return Object.fromEntries(
      Object.entries(this.us1PendingSessions).map(([localSessionId, pending]) => [
        localSessionId,
        { ...pending },
      ])
    );
  }

  getSettings(): AppSettings | null {
    return SettingsManager.getSnapshot();
  }

  getAccountForSlot(slot: string): Account | null {
    return SlotPresenceStore.getAccountForSlot(slot);
  }

  getRemoteUsers(): RemoteUserIdentity[] {
    const settings = this.getSettings();
    if (settings === null || !Array.isArray(settings.remoteUsers)) {
      return [];
    }
    return settings.remoteUsers;
  }

  getUs1SlotSettings(): Us1SlotSettings {
    const settings = this.getSettings();
    return (
      settings?.us1Slot ?? {
        communicationSystem: "mail",
        selectedIdentityId: null,
        selectedRemoteUserId: null,
        selectedAccountId: null,
        connectionState: "disconnected",
        relayConnectionState: "disconnected",
        catchCommands: false,
        resumeLastSession: true,
        rememberConnectionStatus: false,
        lastConnectionState: "disconnected",
      }
    );
  }

  getUs1Identity(): RemoteUserIdentity | null {
    return SlotPresenceStore.getUs1Identity();
  }

  hasUs1Identity(): boolean {
    return SlotPresenceStore.hasUs1Identity();
  }

  isUs1Connected(): boolean {
    return SlotPresenceStore.isUs1Connected();
  }

  getUs1ArchiveAccountId(): string | null {
    return SlotPresenceStore.getUs1ArchiveAccountId();
  }

  getArchiveAccountIdForProvider(provider: string): string | null {
    if (provider === "us1") {
      return this.getUs1ArchiveAccountId();
    }

    const account = this.getAccountForSlot(provider);
    return account?.id ?? null;
  }

  resolveArchiveProviderByAccountId(
    accountId: string
  ): ReturnType<typeof SlotPresenceStore.resolveArchiveProviderByAccountId> {
    return SlotPresenceStore.resolveArchiveProviderByAccountId(accountId);
  }

  getProviderIdForSlot(slot: string): string | null {
    return SlotPresenceStore.getProviderIdForSlot(slot);
  }

  getAvatar(provider: string): string {
    if (
      provider !== "user" &&
      provider !== "ai0" &&
      provider !== "ai1" &&
      provider !== "ai2" &&
      provider !== "us1"
    ) {
      return "";
    }

    return SlotPresenceStore.getAvatar(provider);
  }

  getNickname(provider: string): string {
    if (
      provider !== "user" &&
      provider !== "ai0" &&
      provider !== "ai1" &&
      provider !== "ai2" &&
      provider !== "us1"
    ) {
      return provider.toUpperCase();
    }

    return SlotPresenceStore.getNickname(provider);
  }

  getPresence(
    provider: "user" | "ai0" | "ai1" | "ai2" | "us1"
  ): ReturnType<typeof SlotPresenceStore.getParticipant> {
    return SlotPresenceStore.getParticipant(provider);
  }

  getEntityPresence(
    provider: "ai0" | "ai1" | "ai2" | "us1"
  ): ReturnType<typeof SlotPresenceStore.getEntity> {
    return SlotPresenceStore.getEntity(provider);
  }

  isAssigned(provider: string): boolean {
    if (provider !== "ai0" && provider !== "ai1" && provider !== "ai2" && provider !== "us1") {
      return false;
    }

    return SlotPresenceStore.isAssigned(provider);
  }

  isConnected(provider: string): boolean {
    if (provider !== "ai0" && provider !== "ai1" && provider !== "ai2" && provider !== "us1") {
      return false;
    }

    return SlotPresenceStore.isConnected(provider);
  }

  getAssignedSlotForAccount(accountId: string): "ai0" | "ai1" | "ai2" | null {
    return SlotPresenceStore.getAssignedSlotForAccount(accountId);
  }

  setChatTargets(targets: string[] = []): void {
    const uniq = Array.from(new Set(targets.filter((target) => target !== "")));
    this.chat.activeTargets = uniq.length > 0 ? uniq : ["ai1"];
    this.notify();
  }

  setChatTitle(provider: string, title: string): void {
    this.chat.titleByProvider = {
      ...this.chat.titleByProvider,
      [provider]: title,
    };
    this.notify();
  }

  setAssistantToolsReady(ready: boolean): void {
    const nextReady = ready === true;
    if (this.assistantToolsReady === nextReady) {
      return;
    }
    this.assistantToolsReady = nextReady;
    this.notify();
  }

  isAssistantToolsReady(): boolean {
    return this.assistantToolsReady === true;
  }

  setAssistantRelay(active: boolean, sourceSlot: string | null = null): void {
    this.assistantRelay = {
      active: !!active,
      sourceSlot: active ? sourceSlot : null,
    };
    this.notify();
  }

  getAssistantRelay(): { active: boolean; sourceSlot: string | null } {
    return { ...this.assistantRelay };
  }

  getState(): AppStateSnapshot {
    return {
      activeProvider: this.activeProvider,
      activeConversations: { ...this.activeConversations },
      assistantToolsReady: this.assistantToolsReady,
      us1PendingSessions: this.getUs1PendingSessions(),
      chat: { ...this.chat, titleByProvider: { ...this.chat.titleByProvider } },
      assistantRelay: { ...this.assistantRelay },
    };
  }

  subscribe(listener: (state: ReturnType<AppStateClass["getState"]>) => void): () => void {
    if (typeof listener === "function") {
      this.listeners.push(listener);
    }
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  notify(): void {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        Logger.errorT(
          LogCategory.SYSTEM,
          "app.logs.appState.listenerError",
          {
            message: err instanceof Error ? err.message : String(err),
          },
          {
            error: err,
          }
        );
      }
    });
  }
}

const appState = new AppStateClass();
export { appState as AppState };

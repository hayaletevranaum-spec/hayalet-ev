import { Logger } from "./logger/index.js";
import { ASSISTANT_TIMEOUTS } from "@timeouts";
import { LogCategory } from "@shared/logging-core";
import { getErrorMessage } from "@shared/index.js";
import type { SlotId } from "@shared/index.js";
import type { Us1SessionEvent } from "@shared/us1-mail.js";
import { AppI18n } from "./i18n/index.js";
import { SettingsManager } from "./settings-manager.js";
import { SlotController, SlotEvent } from "./slot-controller.js";
import { AppState } from "./app-state.js";
import { parseUs1SyntheticSessionUri } from "@shared/archive.js";
import { dispatchInternalSlotBridge } from "./commands/slot-bridge-runtime.js";
import { resolveUs1ForceSelectConversationId } from "./us1-session-selection.js";
import { ProviderRegistry } from "./webview/provider-registry.js";

interface RawConversationEntry {
  id?: string;
  webUrl?: string;
  title?: string;
  updatedAt?: number;
  createdAt?: number;
}

interface RawOpencodeUiSessionEntry {
  id?: string;
  title?: string;
  updated_at?: number;
  created_at?: number;
  archived_at?: number | null;
}

interface ConversationEntry {
  conversationId: string;
  id: string;
  webUrl: string;
  provider: string;
  mtime: number;
  folder: string;
  title: string;
  lastMessageTime?: number;
  localSessionId?: string | null;
  pendingUnreadCount?: number;
}

function conversationListT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.analyze.conversationList.${key}`, params);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Array.isArray(value) === false;
}

function isUs1SessionEvent(value: unknown): value is Us1SessionEvent {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value["remoteUserId"] === "string" &&
    typeof value["localSessionId"] === "string" &&
    typeof value["conversationId"] === "string" &&
    typeof value["isNewSession"] === "boolean"
  );
}

function getProviderConfigForSlot(provider: string): Record<string, unknown> | null {
  const providerId = AppState.getProviderIdForSlot(provider);
  return providerId !== null && providerId !== "" ? ProviderRegistry.get(providerId) : null;
}

function isLocalSessionProvider(provider: string): boolean {
  const config = getProviderConfigForSlot(provider);
  return config?.["syncOnDefaultPage"] === true && config["preserveSyncUrlQuery"] === true;
}

function createLocalSessionId(provider: string): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const randomId =
    typeof cryptoApi?.randomUUID === "function"
      ? cryptoApi.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${provider}-${randomId}`;
}

function buildLocalSessionUrl(
  provider: string,
  sessionId = createLocalSessionId(provider)
): string | null {
  const config = getProviderConfigForSlot(provider);
  const baseUrl = typeof config?.["baseUrl"] === "string" ? config["baseUrl"] : "";
  if (baseUrl === "") {
    return null;
  }

  try {
    const url = new URL(baseUrl);
    url.searchParams.set("session", sessionId);
    return url.toString();
  } catch {
    return null;
  }
}

class ConversationListManagerClass {
  selects: Record<string, HTMLSelectElement | null>;
  entries: ConversationEntry[];
  currentSelections: Record<string, string>;
  _settingsSub: (() => void) | null;
  _slotControllerSub: (() => void) | null;
  _appStateSub: (() => void) | null;
  _i18nSub: (() => void) | null;

  constructor() {
    this.selects = { ai0: null, ai1: null, ai2: null, us1: null };
    this.entries = [];
    this.currentSelections = { ai0: "new", ai1: "new", ai2: "new", us1: "new" };
    this._settingsSub = null;
    this._slotControllerSub = null;
    this._appStateSub = null;
    this._i18nSub = null;
  }

  async init(): Promise<void> {
    this.selects = {
      ai0: document.getElementById("conversation-ai0") as HTMLSelectElement | null,
      ai1: document.getElementById("conversation-ai1") as HTMLSelectElement | null,
      ai2: document.getElementById("conversation-ai2") as HTMLSelectElement | null,
      us1: document.getElementById("conversation-us1") as HTMLSelectElement | null,
    };
    this._syncAi0SelectionFromSettings();

    await this.refresh({ silent: true });
    this.bindEvents();
    this.subscribeToSettings();
  }

  _readAi0StoredSessionId(): string {
    const settings = SettingsManager.getSnapshot() as {
      assistants?: { lastOpencodeUiSessionId?: string | null };
    } | null;
    const sessionId = settings?.assistants?.lastOpencodeUiSessionId;
    return typeof sessionId === "string" ? sessionId.trim() : "";
  }

  _syncAi0SelectionFromSettings(): void {
    const sessionId = this._readAi0StoredSessionId();
    const nextSelection = sessionId !== "" ? sessionId : "new";
    this.currentSelections["ai0"] = nextSelection;

    const activeConversationId = sessionId !== "" ? sessionId : null;
    if (AppState.getState().activeConversations["ai0"] !== activeConversationId) {
      AppState.setActiveConversation("ai0", activeConversationId);
    }
  }

  subscribeToSettings(): void {
    this._settingsSub = SettingsManager.subscribe(
      ({ changedPaths }: { changedPaths: string[] }) => {
        const slotAccountPaths = [
          "assistantSlot.accountId",
          "slots.ai1.accountId",
          "slots.ai2.accountId",
          "us1Slot.selectedAccountId",
          "us1Slot.selectedRemoteUserId",
          "us1Slot.connectionState",
        ];
        const ai0SessionChanged =
          changedPaths.includes("*") ||
          changedPaths.some((path) => path === "assistants.lastOpencodeUiSessionId");
        const slotChanged =
          changedPaths.includes("*") ||
          changedPaths.some(
            (p: string) =>
              slotAccountPaths.some((path) => p === path) ||
              p.startsWith("remoteUsers") ||
              p.startsWith("accounts") ||
              p.startsWith("integrations.mailTransport")
          );

        if (ai0SessionChanged) {
          this._syncAi0SelectionFromSettings();
        }

        if (slotChanged || ai0SessionChanged) {
          void this.refresh({
            silent: ai0SessionChanged ? false : true,
            skipNotify: true,
            ...(ai0SessionChanged ? { provider: "ai0" } : {}),
          });
        }
      }
    );

    this._slotControllerSub ??= SlotController.on(SlotEvent.STATE_CHANGED, () => {
      this.renderAll({ silent: true });
    });

    this._appStateSub ??= AppState.subscribe(() => {
      this.renderAll({ silent: true });
    });

    this._i18nSub ??= AppI18n.subscribe(() => {
      this.renderAll({ silent: true });
    });

    SlotController.on(
      SlotEvent.URL_CHANGED,
      (payload: { event?: string; slot?: string; data?: { isDefaultPage?: boolean } }) => {
        const slot = payload.slot;
        const isDefaultPage = (payload as { data?: { isDefaultPage?: boolean } }).data
          ?.isDefaultPage;
        if (
          slot !== undefined &&
          slot !== "" &&
          isDefaultPage === true &&
          !isLocalSessionProvider(slot)
        ) {
          const select = this.selects[slot];
          if (select !== undefined && select !== null && select.value !== "new") {
            select.value = "new";
            this.currentSelections[slot] = "new";
            if (slot === "ai0") {
              AppState.setActiveConversation("ai0", null);
            }
            Logger.info(
              LogCategory.WEBVIEW,
              conversationListT("logs.resetToNewConversation", { slot })
            );
          }
        }
      }
    );
  }

  bindEvents(): void {
    for (const provider in this.selects) {
      this.selects[provider]?.addEventListener("change", () => {
        void this.handleConversationChange(provider);
      });
    }

    const us1RefreshBtn = document.getElementById("conversation-refresh-us1");
    us1RefreshBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      void this.handleUs1Refresh();
    });
  }

  async handleConversationChange(provider: string, options = { isInitial: false }): Promise<void> {
    const select = this.selects[provider];
    if (!select) return;

    const previousSelection = this.currentSelections[provider] ?? "new";
    const conversationId = select.value;
    this.currentSelections[provider] = conversationId;

    this._clearMessagesArea(provider);

    const entry = this.entries.find((e) => e.id === conversationId && e.provider === provider);
    let dispatchedConversationId = conversationId;

    try {
      if (provider === "us1") {
        AppState.setActiveConversation("us1", conversationId === "new" ? null : conversationId);
        AppState.clearUs1PendingSession(entry?.localSessionId ?? null);
        if (conversationId !== "new") {
          AppState.clearUs1PendingSessionByConversation(conversationId);
        }
      } else if (provider === "ai0") {
        if (conversationId === "new") {
          const result = await dispatchInternalSlotBridge(
            {
              action: "session.open",
              toSlot: "ai0",
            },
            {
              provider: "user",
              source: "user",
              fromSlot: "user",
            }
          );
          if (result.success !== true) {
            throw new Error(result.message ?? result.error ?? "AI0 session open failed.");
          }

          const openedSessionId =
            typeof result.session?.id === "string" ? result.session.id.trim() : "";
          if (openedSessionId === "") {
            throw new Error("AI0 session id is unavailable.");
          }

          dispatchedConversationId = openedSessionId;
          this.currentSelections["ai0"] = openedSessionId;
          AppState.setActiveConversation("ai0", openedSessionId);
          await this.refresh({
            silent: true,
            provider: "ai0",
            forceSelectId: openedSessionId,
            skipNotify: true,
          });
        } else {
          const result = await dispatchInternalSlotBridge(
            {
              action: "session.switch",
              toSlot: "ai0",
              sessionRef: { id: conversationId },
            },
            {
              provider: "user",
              source: "user",
              fromSlot: "user",
            }
          );
          if (result.success !== true) {
            throw new Error(result.message ?? result.error ?? "AI0 session switch failed.");
          }

          AppState.setActiveConversation("ai0", conversationId);
        }
      } else {
        const targetUrl =
          conversationId === "new" && isLocalSessionProvider(provider)
            ? buildLocalSessionUrl(provider)
            : (entry?.webUrl ?? null);
        SlotController.navigate(provider as SlotId, targetUrl);
      }
    } catch (error) {
      this.currentSelections[provider] = previousSelection;
      if (provider === "ai0") {
        AppState.setActiveConversation(
          "ai0",
          previousSelection !== "new" && previousSelection !== "empty" ? previousSelection : null
        );
      }
      await this.refresh({ silent: true, provider, skipNotify: true });
      Logger.error(
        LogCategory.WEBVIEW,
        conversationListT("logs.refreshError", { message: getErrorMessage(error) })
      );
      return;
    }

    if (!options.isInitial) {
      Logger.info(
        LogCategory.WEBVIEW,
        conversationListT("logs.userSelected", {
          provider,
          conversationId: dispatchedConversationId,
        })
      );
    }

    window.dispatchEvent(
      new CustomEvent("conversation-selected", {
        detail: {
          provider,
          isNew: dispatchedConversationId === "new",
          ...(provider === "us1" ? { localSessionId: entry?.localSessionId ?? null } : {}),
        },
      })
    );
  }
  _clearMessagesArea(provider: string): void {
    const container = document.getElementById(`messages-${provider}`);
    if (container) {
      container.innerHTML = `<div class="message-placeholder">${conversationListT("loadingMessages")}</div>`;
    }
  }

  async refresh(
    options: {
      silent?: boolean;
      forceSelectId?: string;
      skipNotify?: boolean;
      provider?: string;
    } = {}
  ): Promise<void> {
    const { silent = false, forceSelectId = null, skipNotify = false, provider = null } = options;
    try {
      const electronApi = window.electronAPI;
      if (electronApi === undefined) {
        this.entries = [];
        this.renderAll({ silent: true });
        return;
      }

      const ai0Account = AppState.getAccountForSlot("ai0");
      const ai1Account = AppState.getAccountForSlot("ai1");
      const ai2Account = AppState.getAccountForSlot("ai2");
      const us1AccountId = AppState.getUs1ArchiveAccountId();

      const listSessionsFn = electronApi["opencodeUiFsListSessions"] as
        ((dbPath?: string) => Promise<{ success?: boolean; sessions?: unknown[] }>) | undefined;
      const getConversationsFn = electronApi["dbGetConversations"] as
        ((payload: Record<string, unknown>) => Promise<{ data?: unknown[] }>) | undefined;

      const ai0Result =
        ai0Account?.id !== undefined && ai0Account.id !== "" && typeof listSessionsFn === "function"
          ? await listSessionsFn()
          : undefined;
      const ai1Result =
        ai1Account?.id !== undefined &&
        ai1Account.id !== "" &&
        typeof getConversationsFn === "function"
          ? await getConversationsFn({ accountId: ai1Account.id })
          : { data: [] };
      const ai2Result =
        ai2Account?.id !== undefined &&
        ai2Account.id !== "" &&
        typeof getConversationsFn === "function"
          ? await getConversationsFn({ accountId: ai2Account.id })
          : { data: [] };
      const us1Result =
        us1AccountId !== null && us1AccountId !== "" && typeof getConversationsFn === "function"
          ? await getConversationsFn({ accountId: us1AccountId })
          : { data: [] };

      const ai0Entries =
        ai0Result?.success === true && Array.isArray(ai0Result.sessions) ? ai0Result.sessions : [];
      const ai1Entries = Array.isArray(ai1Result.data) ? ai1Result.data : [];
      const ai2Entries = Array.isArray(ai2Result.data) ? ai2Result.data : [];
      const us1Entries = Array.isArray(us1Result.data) ? us1Result.data : [];
      const us1PendingSessions = AppState.getUs1PendingSessions();

      this.entries = [
        ...ai0Entries.flatMap((e: unknown) => {
          const entry = e as RawOpencodeUiSessionEntry;
          const archivedAt = Number(entry.archived_at ?? 0);
          if (Number.isFinite(archivedAt) && archivedAt > 0) {
            return [];
          }

          return [
            {
              conversationId: String(entry.id ?? ""),
              id: String(entry.id ?? ""),
              webUrl: "",
              provider: "ai0" as const,
              mtime:
                Number(entry.updated_at ?? entry.created_at ?? 0) !== 0
                  ? Number(entry.updated_at ?? entry.created_at ?? 0)
                  : 0,
              folder: "",
              title: String(entry.title ?? ""),
            },
          ];
        }),
        ...ai1Entries.map((e: unknown) => {
          const entry = e as RawConversationEntry;
          return {
            conversationId: String(entry.id ?? ""),
            id: String(entry.id ?? ""),
            webUrl: String(entry.webUrl ?? ""),
            provider: "ai1" as const,
            mtime:
              Number(entry.updatedAt ?? entry.createdAt ?? 0) !== 0
                ? Number(entry.updatedAt ?? entry.createdAt ?? 0)
                : 0,
            folder: "",
            title: String(entry.title ?? ""),
          };
        }),
        ...ai2Entries.map((e: unknown) => {
          const entry = e as RawConversationEntry;
          return {
            conversationId: String(entry.id ?? ""),
            id: String(entry.id ?? ""),
            webUrl: String(entry.webUrl ?? ""),
            provider: "ai2" as const,
            mtime:
              Number(entry.updatedAt ?? entry.createdAt ?? 0) !== 0
                ? Number(entry.updatedAt ?? entry.createdAt ?? 0)
                : 0,
            folder: "",
            title: String(entry.title ?? ""),
          };
        }),
        ...us1Entries.map((e: unknown) => {
          const entry = e as RawConversationEntry;
          const localSessionId = parseUs1SyntheticSessionUri(entry.webUrl)?.localSessionId ?? null;
          return {
            conversationId: String(entry.id ?? ""),
            id: String(entry.id ?? ""),
            webUrl: String(entry.webUrl ?? ""),
            provider: "us1" as const,
            mtime:
              Number(entry.updatedAt ?? entry.createdAt ?? 0) !== 0
                ? Number(entry.updatedAt ?? entry.createdAt ?? 0)
                : 0,
            folder: "",
            title: String(entry.title ?? ""),
            localSessionId,
            pendingUnreadCount:
              localSessionId !== null ? (us1PendingSessions[localSessionId]?.unreadCount ?? 0) : 0,
          };
        }),
      ];

      this.renderAll({ silent });

      if (forceSelectId !== null && forceSelectId !== "") {
        await new Promise((resolve) =>
          setTimeout(resolve, ASSISTANT_TIMEOUTS.CONVERSATION_LIST_MICRO)
        );
        this.updateSelection(forceSelectId, { silent: true, provider });
      }

      if (skipNotify === false) {
        const targetProvider =
          provider ??
          (forceSelectId !== null && forceSelectId !== ""
            ? this.entries.find((e) => e.id === forceSelectId)?.provider
            : null);
        const providers =
          targetProvider !== null && targetProvider !== ""
            ? [targetProvider]
            : ["ai0", "ai1", "ai2", "us1"];

        await new Promise((resolve) =>
          setTimeout(resolve, ASSISTANT_TIMEOUTS.CONVERSATION_LIST_MICRO)
        );

        for (const p of providers) {
          const providerStr = p as string;
          const selections = this.currentSelections;
          const isNew = (selections[providerStr] ?? "new") === "new";
          window.dispatchEvent(
            new CustomEvent("conversation-selected", {
              detail: {
                provider: providerStr,
                isNew,
                ...(providerStr === "us1"
                  ? {
                      localSessionId:
                        this.entries.find(
                          (entry) =>
                            entry.provider === "us1" && entry.id === (selections[providerStr] ?? "")
                        )?.localSessionId ?? null,
                    }
                  : {}),
              },
            })
          );
        }
      }
    } catch (error) {
      const err = /** @type {Error} */ error;
      Logger.error(
        LogCategory.WEBVIEW,
        conversationListT("logs.refreshError", { message: getErrorMessage(err) })
      );
    }
  }

  renderAll(options: { silent?: boolean } = {}): void {
    for (const provider in this.selects) {
      this.render(provider, options);
    }
  }

  render(provider: string, options: { silent?: boolean } = {}): void {
    const select = this.selects[provider];
    if (!select) return;

    const hasAccount =
      provider === "us1" ? AppState.hasUs1Identity() === true : AppState.isAssigned(provider);
    select.disabled = !hasAccount;
    const refreshBtn = document.getElementById(
      `conversation-refresh-${provider}`
    ) as HTMLButtonElement | null;
    if (refreshBtn) {
      refreshBtn.disabled = !hasAccount;
    }

    const currentVal =
      options.silent === true ? select.value : (this.currentSelections[provider] ?? "new");

    select.innerHTML = "";

    if (hasAccount === false) {
      const emptyOpt = new Option(conversationListT("emptySlot"), "empty");
      emptyOpt.disabled = true;
      emptyOpt.selected = true;
      select.appendChild(emptyOpt);
      this.currentSelections[provider] = "empty";
      return;
    }

    const newOption = new Option(conversationListT("newConversation"), "new");
    newOption.dataset["url"] = "";
    newOption.dataset["folder"] = "";
    select.appendChild(newOption);

    const providerEntries = this.entries.filter((e) => e.provider === provider);
    providerEntries.sort((a, b) => b.mtime - a.mtime);

    for (const entry of providerEntries) {
      const pendingUnreadCount = entry.pendingUnreadCount ?? 0;
      const optionLabel =
        provider === "us1" && pendingUnreadCount > 0
          ? `${entry.title} [new${pendingUnreadCount > 1 ? ` x${pendingUnreadCount}` : ""}]`
          : entry.title;
      const option = new Option(optionLabel, entry.id);
      option.dataset["folder"] = entry.folder;
      option.dataset["url"] = entry.webUrl;
      if (provider === "us1") {
        option.dataset["us1SessionId"] = entry.localSessionId ?? "";
        option.dataset["pendingUnreadCount"] = String(entry.pendingUnreadCount ?? 0);
      }
      select.appendChild(option);
    }

    select.value = currentVal;
    if (select.selectedIndex === -1) {
      select.value = "new";
    }
    this.currentSelections[provider] = select.value;
    if (provider === "ai0") {
      const activeConversationId =
        select.value !== "new" && select.value !== "empty" ? select.value : null;
      if (AppState.getState().activeConversations["ai0"] !== activeConversationId) {
        AppState.setActiveConversation("ai0", activeConversationId);
      }
    }
  }

  updateSelection(
    conversationId: string,
    options: { silent?: boolean; provider?: string | null } = {}
  ): boolean {
    const { silent = false, provider: targetProvider = null } = options;
    const entry =
      targetProvider !== null && targetProvider !== ""
        ? this.entries.find((e) => e.id === conversationId && e.provider === targetProvider)
        : this.entries.find((e) => e.id === conversationId);
    if (entry === undefined) return false;

    const { provider } = entry;
    const select = this.selects[provider];
    if (select !== undefined && select !== null && select.value !== conversationId) {
      select.value = conversationId;
      this.currentSelections[provider] = conversationId;
      if (silent === false) {
        void this.handleConversationChange(provider);
      }
    }
    return true;
  }

  destroy(): void {
    this._settingsSub?.();
    this._slotControllerSub?.();
    this._appStateSub?.();
    this._i18nSub?.();
    this._settingsSub = null;
    this._slotControllerSub = null;
    this._appStateSub = null;
    this._i18nSub = null;
  }

  async handleUs1Refresh(): Promise<void> {
    const electronApi = window.electronAPI;
    if (electronApi === undefined) {
      return;
    }
    const syncMessagesFn = electronApi["us1SyncMessages"] as
      ((params?: Record<string, unknown>) => Promise<unknown>) | undefined;
    if (typeof syncMessagesFn !== "function") {
      return;
    }

    const selectedConversationId = this.currentSelections["us1"] ?? "new";
    const selectedEntry =
      selectedConversationId !== "new"
        ? this.entries.find(
            (entry) => entry.provider === "us1" && entry.id === selectedConversationId
          )
        : null;

    try {
      const ensureResult = await dispatchInternalSlotBridge(
        {
          action: "connection.ensure",
          toSlot: "us1",
        },
        {
          provider: "user",
          source: "user",
          fromSlot: "user",
        }
      );
      if (ensureResult.success !== true) {
        throw new Error(ensureResult.message ?? ensureResult.error ?? "US1 connection failed.");
      }

      const result = await dispatchInternalSlotBridge(
        {
          action: "session.sync",
          toSlot: "us1",
          ...(typeof selectedEntry?.localSessionId === "string" &&
          selectedEntry.localSessionId.trim() !== ""
            ? {
                sessionRef: {
                  id: selectedEntry.localSessionId.trim(),
                },
              }
            : {}),
        },
        {
          provider: "user",
          source: "user",
          fromSlot: "user",
        }
      );
      if (result.success !== true) {
        throw new Error(result.error ?? "US1 conversation refresh failed.");
      }

      const data = isRecord(result.data) ? result.data : {};
      const sessionEvents: Us1SessionEvent[] = Array.isArray(data["sessionEvents"])
        ? data["sessionEvents"].filter(isUs1SessionEvent)
        : [];
      for (const sessionEvent of sessionEvents) {
        if (
          sessionEvent.localSessionId === (selectedEntry?.localSessionId ?? null) ||
          sessionEvent.conversationId === selectedConversationId
        ) {
          AppState.clearUs1PendingSession(sessionEvent.localSessionId);
          AppState.clearUs1PendingSessionByConversation(sessionEvent.conversationId);
          continue;
        }

        const updatedAt = sessionEvent.sentAt ?? sessionEvent.createdAt;
        AppState.markUs1PendingSession(sessionEvent.localSessionId, {
          conversationId: sessionEvent.conversationId,
          unreadDelta: 1,
          ...(updatedAt !== undefined ? { updatedAt } : {}),
        });
      }

      await SettingsManager.reload();

      const forceSelectId = resolveUs1ForceSelectConversationId({
        selectedConversationId,
        resultConversationId:
          typeof result.session?.conversationId === "string"
            ? result.session.conversationId
            : typeof data["conversationId"] === "string"
              ? data["conversationId"]
              : null,
        sessionEvents,
        targetRemoteUserId:
          typeof data["remoteUserId"] === "string"
            ? data["remoteUserId"]
            : (AppState.getUs1Identity()?.remoteUserId ?? null),
        preserveExplicitNewSelection: true,
      });

      await this.refresh({
        silent: true,
        provider: "us1",
        ...(forceSelectId !== undefined ? { forceSelectId } : {}),
      });
    } catch (error) {
      Logger.error(
        LogCategory.WEBVIEW,
        conversationListT("logs.refreshError", { message: getErrorMessage(error) })
      );
    }
  }
}

const conversationListManager = new ConversationListManagerClass();

export { conversationListManager, conversationListManager as ConversationListManager };

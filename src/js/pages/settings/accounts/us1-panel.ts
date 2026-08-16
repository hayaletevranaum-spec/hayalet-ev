import type {
  AppSettings,
  MailTransportAccountConfig,
  Us1CommunicationSystem,
} from "@shared/settings.js";
import { getRemoteEmailAccounts } from "@shared/settings.js";
import type { Us1MailAccountDraft, Us1SessionEvent } from "@shared/us1-mail.js";
import { buildRemoteEmailAccountId } from "@shared/archive.js";

import { AppState } from "../../../modules/app-state.js";
import { dispatchInternalSlotBridge } from "../../../modules/commands/slot-bridge-runtime.js";
import { ConversationListManager } from "../../../modules/conversation-list-manager.js";
import { TrafficManager } from "../../../modules/traffic-manager.js";
import { resolveUs1ForceSelectConversationId } from "../../../modules/us1-session-selection.js";
import { notifyUser } from "../../../ui/user-notification.js";
import { getErrorMessage } from "@shared/index.js";
import { formatTime, t as entranceT } from "../panel-i18n.js";

interface SettingsManagerLike {
  getSnapshot(): AppSettings;
  save(settings: Record<string, unknown>): Promise<boolean>;
  reload?(): Promise<AppSettings>;
  load?(options?: { force?: boolean }): Promise<AppSettings>;
}

type FeedbackKind = "success" | "error" | "info" | "warning";

interface ActiveRemoteBinding {
  accountId: string;
  remoteUserId: string;
  email: string;
  nickname: string;
  relayCapable: boolean;
}

interface ReportEntry {
  id: string;
  at: number;
  kind: FeedbackKind;
  message: string;
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

function normalizeUs1SessionSyncResult(
  result: Awaited<ReturnType<typeof dispatchInternalSlotBridge>>
): {
  success: boolean;
  error?: string;
  fetchedCount: number;
  processedCount: number;
  conversationId: string | null;
  remoteUserId: string | null;
  sessionEvents: Us1SessionEvent[];
} {
  const data = isRecord(result.data) ? result.data : {};
  const fetchedCount = typeof data["fetchedCount"] === "number" ? data["fetchedCount"] : 0;
  const processedCount =
    typeof data["processedCount"] === "number" ? data["processedCount"] : fetchedCount;

  return {
    success: result.success === true,
    ...(typeof result.error === "string"
      ? { error: result.error }
      : typeof result.message === "string"
        ? { error: result.message }
        : {}),
    fetchedCount,
    processedCount,
    conversationId:
      typeof result.session?.conversationId === "string"
        ? result.session.conversationId
        : typeof data["conversationId"] === "string"
          ? data["conversationId"]
          : null,
    remoteUserId: typeof data["remoteUserId"] === "string" ? data["remoteUserId"] : null,
    sessionEvents: Array.isArray(data["sessionEvents"])
      ? data["sessionEvents"].filter(isUs1SessionEvent)
      : [],
  };
}

export interface Us1SceneState {
  connected: boolean;
  canConnect: boolean;
  connectDisabledReason: string | null;
  communicationSystem: Us1CommunicationSystem;
  catchCommands: boolean;
  resumeLastSession: boolean;
  rememberConnectionStatus: boolean;
}

export class Us1Panel {
  settingsManager: SettingsManagerLike;
  reportEntries: ReportEntry[] = [];
  loadingBusy = false;
  mailVerifyBusy = false;
  relayHealthBusy = false;

  constructor(settingsManager: SettingsManagerLike) {
    this.settingsManager = settingsManager;
  }

  init(): void {
    this.setupListeners();
    this.render();
  }

  setupListeners(): void {
    const providerSelect = document.getElementById(
      "us1-mail-provider-select"
    ) as HTMLSelectElement | null;
    if (providerSelect !== null) {
      providerSelect.onchange = (): void => {
        this.renderMailAccountFormState();
      };
    }

    const authTypeSelect = document.getElementById(
      "us1-mail-auth-type-select"
    ) as HTMLSelectElement | null;
    if (authTypeSelect !== null) {
      authTypeSelect.onchange = (): void => {
        this.renderMailAccountFormState();
      };
    }

    const verifyBtn = document.getElementById("us1-mail-verify-btn");
    if (verifyBtn instanceof HTMLElement) {
      verifyBtn.onclick = (event): void => {
        event.preventDefault();
        void this.handleSaveMailAccount(true);
      };
    }

    const deleteBtn = document.getElementById("us1-mail-delete-btn");
    if (deleteBtn instanceof HTMLElement) {
      deleteBtn.onclick = (): void => {
        void this.handleDeleteMailAccount();
      };
    }

    const gmailSecurityBtn = document.getElementById("us1-mail-gmail-open-security");
    if (gmailSecurityBtn instanceof HTMLElement) {
      gmailSecurityBtn.onclick = (event): void => {
        event.preventDefault();
        const electronApi = window.electronAPI;
        if (electronApi) {
          const openPath = electronApi["openPath"];
          if (typeof openPath !== "function") return;
          void openPath("https://myaccount.google.com/apppasswords");
        }
      };
    }

    const slotUserSelect = document.getElementById(
      "us1-identity-select"
    ) as HTMLSelectElement | null;
    if (slotUserSelect !== null) {
      slotUserSelect.onchange = (event): void => {
        const selectedAccountId = this.readSelectValue(event.target as HTMLSelectElement);
        void this.handleSlotSelectionChange(selectedAccountId);
      };
    }

    const communicationSystemSelect = document.getElementById(
      "us1-communication-system-select"
    ) as HTMLSelectElement | null;
    if (communicationSystemSelect !== null) {
      communicationSystemSelect.onchange = (event): void => {
        const value = (event.target as HTMLSelectElement).value;
        void this.updateCommunicationSystem(value === "relay-e2ee" ? "relay-e2ee" : "mail");
      };
    }

    const relayEnabledCheck = document.getElementById(
      "us1-relay-enabled-check"
    ) as HTMLInputElement | null;
    if (relayEnabledCheck !== null) {
      relayEnabledCheck.onchange = async (event): Promise<void> => {
        const settings = this.settingsManager.getSnapshot();
        await this.settingsManager.save({
          ...settings,
          integrations: {
            ...(settings.integrations ?? {}),
            us1Relay: {
              ...(settings.integrations?.us1Relay ?? {}),
              enabled: (event.target as HTMLInputElement).checked,
              connectionState: "disconnected",
              lastError: null,
            },
          },
        });
        await this.reloadSettings();
        this.render();
      };
    }

    const relayBaseUrlInput = document.getElementById(
      "us1-relay-base-url-input"
    ) as HTMLInputElement | null;
    if (relayBaseUrlInput !== null) {
      relayBaseUrlInput.onchange = async (event): Promise<void> => {
        const settings = this.settingsManager.getSnapshot();
        const value = this.normalizeText((event.target as HTMLInputElement).value);
        await this.settingsManager.save({
          ...settings,
          integrations: {
            ...(settings.integrations ?? {}),
            us1Relay: {
              ...(settings.integrations?.us1Relay ?? {}),
              baseUrl: value,
              trustedServerFingerprint: null,
              trustState: "unknown",
              connectionState: "disconnected",
              lastError: null,
            },
          },
        });
        await this.reloadSettings();
        this.render();
      };
    }

    const relayTestBtn = document.getElementById("us1-relay-test-btn");
    if (relayTestBtn instanceof HTMLElement) {
      relayTestBtn.onclick = (event): void => {
        event.preventDefault();
        void this.handleRelayHealthCheck();
      };
    }

    const relayResetTrustBtn = document.getElementById("us1-relay-reset-trust-btn");
    if (relayResetTrustBtn instanceof HTMLElement) {
      relayResetTrustBtn.onclick = (event): void => {
        event.preventDefault();
        void this.handleRelayTrustReset();
      };
    }

    const catchCheck = document.getElementById("us1-catch-check") as HTMLInputElement | null;
    if (catchCheck !== null) {
      catchCheck.onchange = (event): void => {
        void this.updateUs1Slot({
          catchCommands: (event.target as HTMLInputElement).checked,
        });
      };
    }

    const resumeCheck = document.getElementById(
      "us1-resume-last-session-check"
    ) as HTMLInputElement | null;
    if (resumeCheck !== null) {
      resumeCheck.onchange = (event): void => {
        void this.updateUs1Slot({
          resumeLastSession: (event.target as HTMLInputElement).checked,
        });
      };
    }

    const rememberConnectionCheck = document.getElementById(
      "us1-remember-connection-check"
    ) as HTMLInputElement | null;
    if (rememberConnectionCheck !== null) {
      rememberConnectionCheck.onchange = (event): void => {
        const checked = (event.target as HTMLInputElement).checked;
        void this.updateUs1Slot({
          rememberConnectionStatus: checked,
          lastConnectionState: AppState.isUs1Connected() === true ? "connected" : "disconnected",
        });
      };
    }

    const toggleBtn = document.getElementById("us1-toggle-btn");
    if (toggleBtn instanceof HTMLElement) {
      toggleBtn.onclick = (): void => {
        if (AppState.isUs1Connected() === true) {
          void this.handleDisconnect();
        } else {
          void this.handleConnect();
        }
      };
    }

    const syncMessagesBtn = document.getElementById("us1-sync-messages-btn");
    if (syncMessagesBtn instanceof HTMLElement) {
      syncMessagesBtn.onclick = (): void => {
        void this.handleManualMailCheck();
      };
    }
  }

  private getMailAccounts(settings: AppSettings): MailTransportAccountConfig[] {
    return settings.integrations?.mailTransport?.accounts ?? [];
  }

  private getEditableMailAccount(settings: AppSettings): MailTransportAccountConfig | null {
    return (
      settings.integrations?.mailTransport?.localAccount ??
      this.getMailAccounts(settings)[0] ??
      null
    );
  }

  private getVerifiedLocalMailAccount(settings: AppSettings): MailTransportAccountConfig | null {
    const localAccount = settings.integrations?.mailTransport?.localAccount ?? null;
    if (localAccount?.connectionState === "connected") {
      return localAccount;
    }
    return null;
  }

  private getCommunicationSystem(settings: AppSettings): Us1CommunicationSystem {
    return settings.us1Slot?.communicationSystem === "relay-e2ee" ? "relay-e2ee" : "mail";
  }

  private isRelayConfigured(settings: AppSettings): boolean {
    const relaySettings = settings.integrations?.us1Relay ?? null;
    return relaySettings?.enabled === true && this.normalizeText(relaySettings.baseUrl) !== null;
  }

  private getRelayStatusText(
    settings: AppSettings,
    selectedBinding: ActiveRemoteBinding | null
  ): string {
    const relayState = settings.integrations?.us1Relay?.connectionState;
    if (this.relayHealthBusy || relayState === "connecting") {
      return entranceT("us1.relay.status.testing");
    }
    if (this.isRelayConfigured(settings) !== true) {
      return entranceT("us1.relay.status.notConfigured");
    }
    if (relayState === "error") {
      return (
        this.normalizeText(settings.integrations?.us1Relay?.lastError) ??
        entranceT("us1.relay.status.error")
      );
    }
    if (selectedBinding === null) {
      return relayState === "connected"
        ? entranceT("us1.relay.status.reachable")
        : entranceT("us1.relay.status.noPeer");
    }
    if (selectedBinding.relayCapable !== true) {
      return entranceT("us1.relay.status.peerUnsupported");
    }
    if (settings.us1Slot?.relayConnectionState === "connected") {
      return entranceT("us1.relay.status.connected");
    }
    return entranceT("us1.relay.status.ready");
  }

  private getActiveRemoteBindings(settings: AppSettings): ActiveRemoteBinding[] {
    const remoteUsersById = new Map(
      (settings.remoteUsers ?? []).map(
        (remoteUser) => [remoteUser.remoteUserId, remoteUser] as const
      )
    );

    return getRemoteEmailAccounts(settings.accounts)
      .map((account) => {
        const remoteUserId = this.normalizeText(account.remoteEmail?.remoteUserId);
        if (remoteUserId === null || account.remoteEmail?.handshakeState !== "active") {
          return null;
        }

        const derivedAccountId = buildRemoteEmailAccountId(remoteUserId);
        const accountId = derivedAccountId !== "" ? derivedAccountId : account.id;
        const email = `${account.email}`.trim();
        const fallbackNickname = email.split("@")[0] ?? email;
        const nicknameCandidate = `${account.nickname ?? fallbackNickname}`.trim();
        const nickname = nicknameCandidate !== "" ? nicknameCandidate : fallbackNickname;
        return {
          accountId,
          remoteUserId,
          email,
          nickname,
          relayCapable: remoteUsersById.get(remoteUserId)?.relayCapability?.supported === true,
        };
      })
      .filter((binding): binding is ActiveRemoteBinding => binding !== null)
      .sort((left, right) => {
        const leftLabel = `${left.nickname} ${left.email}`.toLowerCase();
        const rightLabel = `${right.nickname} ${right.email}`.toLowerCase();
        return leftLabel.localeCompare(rightLabel, "tr");
      });
  }

  private resolveSelectedBinding(
    settings: AppSettings,
    bindings: ActiveRemoteBinding[]
  ): ActiveRemoteBinding | null {
    const selectedAccountId = this.normalizeText(settings.us1Slot?.selectedAccountId);
    const selectedRemoteUserId = this.normalizeText(settings.us1Slot?.selectedRemoteUserId);

    return (
      bindings.find((binding) => binding.accountId === selectedAccountId) ??
      bindings.find((binding) => binding.remoteUserId === selectedRemoteUserId) ??
      null
    );
  }

  private readSelectValue(select: HTMLSelectElement | null): string | null {
    if (select === null || select.value.trim() === "") {
      return null;
    }
    return select.value.trim();
  }

  private normalizeText(value: string | null | undefined): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }

  private getSelectedConversationId(): string {
    const conversationSelect = document.getElementById(
      "conversation-us1"
    ) as HTMLSelectElement | null;
    return this.readSelectValue(conversationSelect) ?? "new";
  }

  private async reloadSettings(): Promise<void> {
    if (typeof this.settingsManager.reload === "function") {
      await this.settingsManager.reload();
      return;
    }
    if (typeof this.settingsManager.load === "function") {
      await this.settingsManager.load({ force: true });
    }
  }

  private async handleSaveMailAccount(verifyAfterSave: boolean): Promise<void> {
    if (this.mailVerifyBusy) {
      return;
    }

    const electronApi = window.electronAPI;
    if (electronApi === undefined) {
      this.showFeedback(entranceT("us1.feedback.electronUnavailable"), "error");
      return;
    }

    const settings = this.settingsManager.getSnapshot();
    const selectedMailAccount = this.getEditableMailAccount(settings);
    const draft = this.collectMailAccountDraft(selectedMailAccount?.id ?? null);
    if (draft.email === "") {
      this.showFeedback(entranceT("us1.feedback.mailEmailRequired"), "error");
      return;
    }

    this.mailVerifyBusy = verifyAfterSave;
    this.renderMailVerifyButton();

    try {
      const us1UpsertMailAccount = electronApi["us1UpsertMailAccount"];
      if (typeof us1UpsertMailAccount !== "function") return;
      const result = await us1UpsertMailAccount(draft, { verifyAfterSave });
      await this.reloadSettings();
      this.render();

      if (result.success) {
        if (verifyAfterSave) {
          const gmailEmailInput = document.getElementById(
            "us1-mail-gmail-email-easy"
          ) as HTMLInputElement | null;
          if (gmailEmailInput !== null) {
            gmailEmailInput.value = "";
          }
        }

        const message = verifyAfterSave
          ? entranceT("us1.feedback.mailVerifySuccess")
          : entranceT("us1.feedback.mailSaveSuccess");
        this.addReport(message, "success");
        this.notifyFeedback(message, "success", draft.email, "us1:mail-account");
        return;
      }

      const errorMessage = result.error ?? entranceT("us1.feedback.operationFailed");
      this.addReport(errorMessage, "error");
      this.notifyFeedback(errorMessage, "error", undefined, "us1:mail-account");
    } finally {
      this.mailVerifyBusy = false;
      this.renderMailVerifyButton();
    }
  }

  private async handleDeleteMailAccount(): Promise<void> {
    const electronApi = window.electronAPI;
    const settings = this.settingsManager.getSnapshot();
    const selectedMailAccount = this.getEditableMailAccount(settings);
    if (electronApi === undefined || selectedMailAccount === null) {
      this.showFeedback(entranceT("us1.feedback.mailAccountRequired"), "error");
      return;
    }

    const us1DeleteMailAccount = electronApi["us1DeleteMailAccount"];
    if (typeof us1DeleteMailAccount !== "function") return;
    const result = await us1DeleteMailAccount({
      mailAccountId: selectedMailAccount.id,
    });
    await this.reloadSettings();
    this.render();

    if (result.success) {
      const message = entranceT("us1.feedback.mailDeleteSuccess");
      this.addReport(message, "success");
      this.notifyFeedback(message, "success", selectedMailAccount.email, "us1:mail-account");
      return;
    }

    const errorMessage = result.error ?? entranceT("us1.feedback.operationFailed");
    this.addReport(errorMessage, "error");
    this.notifyFeedback(errorMessage, "error", undefined, "us1:mail-account");
  }

  private async handleSlotSelectionChange(selectedAccountId: string | null): Promise<void> {
    const settings = this.settingsManager.getSnapshot();
    const previousBinding = this.resolveSelectedBinding(
      settings,
      this.getActiveRemoteBindings(settings)
    );
    const binding = this.getActiveRemoteBindings(settings).find(
      (candidate) => candidate.accountId === selectedAccountId
    );

    await this.updateUs1Slot({
      selectedAccountId: binding?.accountId ?? null,
      selectedIdentityId: binding?.remoteUserId ?? null,
      selectedRemoteUserId: binding?.remoteUserId ?? null,
      ...this.buildUs1ConnectionStatePatch("disconnected", settings),
    });

    if ((previousBinding?.accountId ?? null) !== (binding?.accountId ?? null)) {
      const title =
        binding == null
          ? entranceT("slot.toasts.accountCleared", { slot: "US1" })
          : entranceT("slot.toasts.accountAssigned", {
              slot: "US1",
              account: this.describeBinding(binding),
            });
      notifyUser({
        kind: binding == null ? "info" : "success",
        title,
        dedupeKey: "us1:slot-binding",
      });
    }
  }

  private buildUs1ConnectionStatePatch(
    state: "connected" | "disconnected",
    settings: AppSettings = this.settingsManager.getSnapshot()
  ): Partial<NonNullable<AppSettings["us1Slot"]>> {
    const relayConnectionState =
      this.getCommunicationSystem(settings) === "relay-e2ee" ? state : "disconnected";
    return settings.us1Slot?.rememberConnectionStatus === true
      ? {
          connectionState: state,
          relayConnectionState,
          lastConnectionState: state,
        }
      : {
          connectionState: state,
          relayConnectionState,
        };
  }

  private async handleConnect(): Promise<void> {
    const settings = this.settingsManager.getSnapshot();
    const verifiedLocalMailAccount = this.getVerifiedLocalMailAccount(settings);
    const activeBindings = this.getActiveRemoteBindings(settings);
    const selectedBinding = this.resolveSelectedBinding(settings, activeBindings);
    const communicationSystem = this.getCommunicationSystem(settings);

    if (window.electronAPI === undefined) {
      this.showFeedback(entranceT("us1.feedback.electronUnavailable"), "error");
      return;
    }
    if (verifiedLocalMailAccount === null) {
      this.showFeedback(entranceT("us1.status.noConnectedMailAccount"), "warning");
      return;
    }
    if (selectedBinding === null) {
      this.showFeedback(entranceT("us1.status.empty"), "warning");
      return;
    }
    if (communicationSystem === "relay-e2ee" && this.isRelayConfigured(settings) !== true) {
      this.showFeedback(entranceT("us1.relay.status.notConfigured"), "warning");
      return;
    }
    if (communicationSystem === "relay-e2ee" && selectedBinding.relayCapable !== true) {
      this.showFeedback(entranceT("us1.relay.status.peerUnsupported"), "warning");
      return;
    }
    if (AppState.isUs1Connected() === true) {
      return;
    }

    this.loadingBusy = true;
    this.syncIndicators(AppState.isUs1Connected());

    try {
      await this.updateUs1Slot({
        communicationSystem,
        selectedAccountId: selectedBinding.accountId,
        selectedIdentityId: selectedBinding.remoteUserId,
        selectedRemoteUserId: selectedBinding.remoteUserId,
        ...this.buildUs1ConnectionStatePatch("connected", settings),
      });

      const result = normalizeUs1SessionSyncResult(
        await dispatchInternalSlotBridge(
          {
            action: "session.sync",
            toSlot: "us1",
          },
          {
            provider: "user",
            source: "user",
            fromSlot: "user",
          }
        )
      );
      await this.reloadSettings();
      this.render();

      if (result.success !== true) {
        throw new Error(result.error ?? entranceT("us1.feedback.operationFailed"));
      }

      const processedCount = result.processedCount;
      const forceSelectId = resolveUs1ForceSelectConversationId({
        selectedConversationId: this.getSelectedConversationId(),
        resultConversationId:
          typeof result.conversationId === "string" ? result.conversationId : null,
        sessionEvents: Array.isArray(result.sessionEvents) ? result.sessionEvents : [],
        targetRemoteUserId: selectedBinding.remoteUserId,
        preserveExplicitNewSelection: true,
      });
      await ConversationListManager.refresh({
        silent: true,
        provider: "us1",
        ...(forceSelectId !== undefined ? { forceSelectId } : {}),
      });
      const message = entranceT("us1.feedback.connectSuccess", {
        count: String(processedCount),
      });
      this.addReport(message, "success");
      this.notifyFeedback(message, "success", undefined, "us1:connection");
    } catch (error) {
      await this.updateUs1Slot(this.buildUs1ConnectionStatePatch("disconnected"));
      const errorMessage = getErrorMessage(error);
      this.addReport(errorMessage, "error");
      this.notifyFeedback(errorMessage, "error", undefined, "us1:connection");
    } finally {
      this.loadingBusy = false;
      this.render();
    }
  }

  private async handleDisconnect(): Promise<void> {
    if (AppState.isUs1Connected() === false) {
      return;
    }

    await this.updateUs1Slot(this.buildUs1ConnectionStatePatch("disconnected"));
    const message = entranceT("us1.feedback.disconnectSuccess");
    this.addReport(message, "info");
    this.notifyFeedback(message, "info", undefined, "us1:connection");
  }

  private async handleManualMailCheck(): Promise<void> {
    if (window.electronAPI === undefined) {
      this.showFeedback(entranceT("us1.feedback.electronUnavailable"), "error");
      return;
    }
    if (AppState.isUs1Connected() !== true) {
      this.showFeedback(entranceT("us1.feedback.syncRequiresConnection"), "warning");
      return;
    }

    this.loadingBusy = true;
    this.syncIndicators(true);

    try {
      const result = normalizeUs1SessionSyncResult(
        await dispatchInternalSlotBridge(
          {
            action: "session.sync",
            toSlot: "us1",
          },
          {
            provider: "user",
            source: "user",
            fromSlot: "user",
          }
        )
      );
      await this.reloadSettings();
      this.render();

      if (result.success !== true) {
        throw new Error(result.error ?? entranceT("us1.feedback.operationFailed"));
      }

      const processedCount = result.processedCount;
      const forceSelectId = resolveUs1ForceSelectConversationId({
        selectedConversationId: this.getSelectedConversationId(),
        resultConversationId:
          typeof result.conversationId === "string" ? result.conversationId : null,
        sessionEvents: Array.isArray(result.sessionEvents) ? result.sessionEvents : [],
        targetRemoteUserId:
          AppState.getUs1Identity()?.remoteUserId ??
          (typeof result.remoteUserId === "string" ? result.remoteUserId : null),
        preserveExplicitNewSelection: true,
      });
      await ConversationListManager.refresh({
        silent: true,
        provider: "us1",
        ...(forceSelectId !== undefined ? { forceSelectId } : {}),
      });
      const message = entranceT("us1.feedback.syncSuccess", {
        count: String(processedCount),
      });
      this.addReport(message, processedCount > 0 ? "success" : "info");
      this.notifyFeedback(message, processedCount > 0 ? "success" : "info", undefined, "us1:sync");
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.addReport(errorMessage, "error");
      this.notifyFeedback(errorMessage, "error", undefined, "us1:sync");
    } finally {
      this.loadingBusy = false;
      this.render();
    }
  }

  private async handleRelayHealthCheck(): Promise<void> {
    const electronApi = window.electronAPI;
    const settings = this.settingsManager.getSnapshot();
    if (electronApi === undefined) {
      this.showFeedback(entranceT("us1.feedback.electronUnavailable"), "error");
      return;
    }
    const us1RelayHealthCheck = electronApi["us1RelayHealthCheck"];
    if (typeof us1RelayHealthCheck !== "function") {
      this.showFeedback(entranceT("us1.feedback.electronUnavailable"), "error");
      return;
    }
    if (this.isRelayConfigured(settings) !== true) {
      this.showFeedback(entranceT("us1.relay.status.notConfigured"), "warning");
      return;
    }
    if (this.relayHealthBusy) {
      return;
    }

    this.relayHealthBusy = true;
    this.renderRelayHealthButton();
    this.render();

    try {
      const result = await us1RelayHealthCheck({
        baseUrl: this.normalizeText(settings.integrations?.us1Relay?.baseUrl),
      });
      await this.reloadSettings();
      this.render();

      if (result.success !== true || result.reachable !== true) {
        throw new Error(result.error ?? entranceT("us1.relay.feedback.checkFailed"));
      }

      const message = entranceT("us1.relay.feedback.checkSuccess");
      this.addReport(message, "success");
      this.notifyFeedback(message, "success", undefined, "us1:relay-health");
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.addReport(errorMessage, "error");
      this.notifyFeedback(errorMessage, "error", undefined, "us1:relay-health");
    } finally {
      this.relayHealthBusy = false;
      this.render();
    }
  }

  private async handleRelayTrustReset(): Promise<void> {
    const settings = this.settingsManager.getSnapshot();
    if (this.normalizeText(settings.integrations?.us1Relay?.trustedServerFingerprint) === null) {
      this.showFeedback(entranceT("us1.relay.status.noServerFingerprint"), "warning");
      return;
    }

    await this.settingsManager.save({
      ...settings,
      integrations: {
        ...(settings.integrations ?? {}),
        us1Relay: {
          ...(settings.integrations?.us1Relay ?? {}),
          trustedServerFingerprint: null,
          trustState: "unknown",
          connectionState: "disconnected",
          lastConnectedAt: null,
          lastError: null,
        },
      },
    });
    await this.reloadSettings();
    this.render();

    const message = entranceT("us1.relay.feedback.trustReset");
    this.addReport(message, "info");
    this.notifyFeedback(message, "info", undefined, "us1:relay-trust");
  }

  private collectMailAccountDraft(mailAccountId: string | null): Us1MailAccountDraft {
    const providerType =
      (document.getElementById("us1-mail-provider-select") as HTMLSelectElement | null)?.value ===
      "custom-imap-smtp"
        ? "custom-imap-smtp"
        : "gmail";
    const authType =
      providerType === "gmail"
        ? "password"
        : (document.getElementById("us1-mail-auth-type-select") as HTMLSelectElement | null)
              ?.value === "oauth2"
          ? "oauth2"
          : "password";

    const gmailEmailInput = document.getElementById(
      "us1-mail-gmail-email-easy"
    ) as HTMLInputElement | null;
    const gmailPasswordInput = document.getElementById(
      "us1-mail-gmail-password-easy"
    ) as HTMLInputElement | null;
    const emailInput = document.getElementById("us1-mail-email-input") as HTMLInputElement | null;
    const email =
      providerType === "gmail"
        ? (gmailEmailInput?.value.trim().toLowerCase() ?? "")
        : (emailInput?.value.trim().toLowerCase() ?? "");

    const imapPort = this.readNumberInput("us1-mail-imap-port-input");
    const smtpPort = this.readNumberInput("us1-mail-smtp-port-input");

    return {
      ...(mailAccountId !== null ? { mailAccountId } : {}),
      providerType,
      email,
      enabled: true,
      authType,
      imap:
        providerType === "gmail"
          ? { host: "imap.gmail.com", port: 993, secure: true }
          : {
              host:
                (
                  document.getElementById("us1-mail-imap-host-input") as HTMLInputElement | null
                )?.value.trim() ?? "",
              secure:
                (document.getElementById("us1-mail-imap-secure-check") as HTMLInputElement | null)
                  ?.checked ?? false,
              ...(imapPort !== undefined ? { port: imapPort } : {}),
            },
      smtp:
        providerType === "gmail"
          ? { host: "smtp.gmail.com", port: 465, secure: true }
          : {
              host:
                (
                  document.getElementById("us1-mail-smtp-host-input") as HTMLInputElement | null
                )?.value.trim() ?? "",
              secure:
                (document.getElementById("us1-mail-smtp-secure-check") as HTMLInputElement | null)
                  ?.checked ?? false,
              ...(smtpPort !== undefined ? { port: smtpPort } : {}),
            },
      auth: {
        user: email,
        password:
          providerType === "gmail"
            ? (gmailPasswordInput?.value.trim().replace(/\s/g, "") ?? "")
            : ((document.getElementById("us1-mail-password-input") as HTMLInputElement | null)
                ?.value ?? ""),
        accessToken:
          (document.getElementById("us1-mail-access-token-input") as HTMLInputElement | null)
            ?.value ?? "",
        refreshToken:
          (document.getElementById("us1-mail-refresh-token-input") as HTMLInputElement | null)
            ?.value ?? "",
        clientId:
          (document.getElementById("us1-mail-client-id-input") as HTMLInputElement | null)?.value ??
          "",
        clientSecret:
          (document.getElementById("us1-mail-client-secret-input") as HTMLInputElement | null)
            ?.value ?? "",
      },
    };
  }

  private readNumberInput(elementId: string): number | undefined {
    const value =
      (document.getElementById(elementId) as HTMLInputElement | null)?.value.trim() ?? "";
    if (value === "") {
      return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private async updateUs1Slot(patch: Partial<NonNullable<AppSettings["us1Slot"]>>): Promise<void> {
    const settings = this.settingsManager.getSnapshot();
    await this.settingsManager.save({
      ...settings,
      us1Slot: {
        ...settings.us1Slot,
        ...patch,
      },
    });
    await this.reloadSettings();
    this.render();
  }

  getSceneState(): Us1SceneState {
    const settings = this.settingsManager.getSnapshot();
    const verifiedLocalMailAccount = this.getVerifiedLocalMailAccount(settings);
    const activeBindings = this.getActiveRemoteBindings(settings);
    const selectedBinding = this.resolveSelectedBinding(settings, activeBindings);
    const communicationSystem = this.getCommunicationSystem(settings);
    const connected = AppState.isUs1Connected();

    let connectDisabledReason: string | null = null;
    if (verifiedLocalMailAccount === null) {
      connectDisabledReason = entranceT("us1.status.noConnectedMailAccount");
    } else if (activeBindings.length === 0) {
      connectDisabledReason = entranceT("us1.status.noUsers");
    } else if (selectedBinding === null) {
      connectDisabledReason = entranceT("us1.status.empty");
    } else if (communicationSystem === "relay-e2ee" && this.isRelayConfigured(settings) !== true) {
      connectDisabledReason = entranceT("us1.relay.status.notConfigured");
    } else if (communicationSystem === "relay-e2ee" && selectedBinding.relayCapable !== true) {
      connectDisabledReason = entranceT("us1.relay.status.peerUnsupported");
    }

    return {
      connected,
      canConnect: connected || connectDisabledReason === null,
      connectDisabledReason,
      communicationSystem,
      catchCommands: settings.us1Slot?.catchCommands === true,
      resumeLastSession: settings.us1Slot?.resumeLastSession ?? true,
      rememberConnectionStatus: settings.us1Slot?.rememberConnectionStatus === true,
    };
  }

  async selectSceneBinding(accountId: string | null): Promise<void> {
    await this.handleSlotSelectionChange(accountId);
  }

  async toggleSceneConnection(): Promise<void> {
    if (AppState.isUs1Connected() === true) {
      await this.handleDisconnect();
      return;
    }

    await this.handleConnect();
  }

  async updateCommunicationSystem(value: Us1CommunicationSystem): Promise<void> {
    await this.updateUs1Slot({
      communicationSystem: value,
      ...this.buildUs1ConnectionStatePatch("disconnected"),
    });
  }

  async updateScenePreferences(
    patch: Partial<
      Pick<
        NonNullable<AppSettings["us1Slot"]>,
        "catchCommands" | "resumeLastSession" | "rememberConnectionStatus"
      >
    >
  ): Promise<void> {
    const nextPatch: Partial<NonNullable<AppSettings["us1Slot"]>> = { ...patch };
    if (Object.prototype.hasOwnProperty.call(nextPatch, "rememberConnectionStatus")) {
      nextPatch.lastConnectionState =
        AppState.isUs1Connected() === true ? "connected" : "disconnected";
    }

    await this.updateUs1Slot(nextPatch);
  }

  render(): void {
    const settings = this.settingsManager.getSnapshot();
    const editableMailAccount = this.getEditableMailAccount(settings);
    const verifiedLocalMailAccount = this.getVerifiedLocalMailAccount(settings);
    const activeBindings = this.getActiveRemoteBindings(settings);
    const selectedBinding = this.resolveSelectedBinding(settings, activeBindings);
    const connected = AppState.isUs1Connected();

    this.renderMailAccountIdentity(editableMailAccount, verifiedLocalMailAccount);
    this.renderMailAccountForm(editableMailAccount);
    this.renderMailAccountFormState();
    this.renderSlotSelect(activeBindings, selectedBinding);
    this.renderCommunicationSystem(settings);
    this.renderRelaySettings(settings, selectedBinding);
    this.renderReportLog();

    const catchCheck = document.getElementById("us1-catch-check") as HTMLInputElement | null;
    if (catchCheck) {
      catchCheck.checked = settings.us1Slot?.catchCommands === true;
    }

    const resumeCheck = document.getElementById(
      "us1-resume-last-session-check"
    ) as HTMLInputElement | null;
    if (resumeCheck) {
      resumeCheck.checked = settings.us1Slot?.resumeLastSession ?? true;
    }

    const rememberConnectionCheck = document.getElementById(
      "us1-remember-connection-check"
    ) as HTMLInputElement | null;
    if (rememberConnectionCheck) {
      rememberConnectionCheck.checked = settings.us1Slot?.rememberConnectionStatus === true;
    }

    const toggleBtn = document.getElementById("us1-toggle-btn") as HTMLButtonElement | null;
    if (toggleBtn) {
      if (selectedBinding === null) {
        toggleBtn.textContent = entranceT("slot.selectAccount");
        toggleBtn.disabled = true;
        toggleBtn.classList.remove("btn-secondary");
        toggleBtn.classList.add("btn-primary");
      } else if (connected) {
        toggleBtn.textContent = entranceT("slot.disconnect");
        toggleBtn.disabled = false;
        toggleBtn.classList.remove("btn-primary");
        toggleBtn.classList.add("btn-secondary");
      } else {
        toggleBtn.textContent = entranceT("slot.connect");
        toggleBtn.disabled =
          this.getCommunicationSystem(settings) === "relay-e2ee"
            ? this.isRelayConfigured(settings) !== true || selectedBinding.relayCapable !== true
            : false;
        toggleBtn.classList.remove("btn-secondary");
        toggleBtn.classList.add("btn-primary");
      }
    }

    const statusText = document.getElementById("us1-status-text");
    if (statusText) {
      statusText.textContent = this.getSlotStatusText(
        editableMailAccount,
        verifiedLocalMailAccount,
        activeBindings.length,
        selectedBinding,
        connected
      );
    }

    const hintText = document.getElementById("us1-phase-hint");
    if (hintText) {
      hintText.textContent = this.getPhaseHint(
        editableMailAccount,
        verifiedLocalMailAccount,
        activeBindings.length
      );
    }

    this.syncIndicators(connected);
  }

  private renderMailAccountIdentity(
    editableMailAccount: MailTransportAccountConfig | null,
    verifiedLocalMailAccount: MailTransportAccountConfig | null
  ): void {
    const accountState = this.getMailAccountStatusText(editableMailAccount);
    const verifiedEmailEl = document.getElementById("us1-mail-verified-email");
    if (verifiedEmailEl) {
      verifiedEmailEl.textContent = verifiedLocalMailAccount
        ? `${entranceT("us1.mailAccount.verifiedLabel")}: ${verifiedLocalMailAccount.email}`
        : entranceT("us1.mailAccount.verifiedEmpty");
    }

    const statusEl = document.getElementById("us1-mail-account-status");
    if (statusEl) {
      statusEl.textContent = accountState;
      statusEl.toggleAttribute("hidden", true);
    }
  }

  private renderMailAccountForm(selectedMailAccount: MailTransportAccountConfig | null): void {
    const providerSelect = document.getElementById(
      "us1-mail-provider-select"
    ) as HTMLSelectElement | null;
    const gmailEmailInput = document.getElementById(
      "us1-mail-gmail-email-easy"
    ) as HTMLInputElement | null;
    const gmailPasswordInput = document.getElementById(
      "us1-mail-gmail-password-easy"
    ) as HTMLInputElement | null;
    const emailInput = document.getElementById("us1-mail-email-input") as HTMLInputElement | null;
    const authTypeSelect = document.getElementById(
      "us1-mail-auth-type-select"
    ) as HTMLSelectElement | null;
    const passwordInput = document.getElementById(
      "us1-mail-password-input"
    ) as HTMLInputElement | null;
    const accessTokenInput = document.getElementById(
      "us1-mail-access-token-input"
    ) as HTMLInputElement | null;
    const refreshTokenInput = document.getElementById(
      "us1-mail-refresh-token-input"
    ) as HTMLInputElement | null;
    const clientIdInput = document.getElementById(
      "us1-mail-client-id-input"
    ) as HTMLInputElement | null;
    const clientSecretInput = document.getElementById(
      "us1-mail-client-secret-input"
    ) as HTMLInputElement | null;
    const imapHostInput = document.getElementById(
      "us1-mail-imap-host-input"
    ) as HTMLInputElement | null;
    const imapPortInput = document.getElementById(
      "us1-mail-imap-port-input"
    ) as HTMLInputElement | null;
    const imapSecureCheck = document.getElementById(
      "us1-mail-imap-secure-check"
    ) as HTMLInputElement | null;
    const smtpHostInput = document.getElementById(
      "us1-mail-smtp-host-input"
    ) as HTMLInputElement | null;
    const smtpPortInput = document.getElementById(
      "us1-mail-smtp-port-input"
    ) as HTMLInputElement | null;
    const smtpSecureCheck = document.getElementById(
      "us1-mail-smtp-secure-check"
    ) as HTMLInputElement | null;

    if (providerSelect) providerSelect.value = selectedMailAccount?.providerType ?? "gmail";
    if (gmailEmailInput) gmailEmailInput.value = selectedMailAccount?.email ?? "";
    if (gmailPasswordInput) gmailPasswordInput.value = selectedMailAccount?.auth.password ?? "";
    if (emailInput) emailInput.value = selectedMailAccount?.email ?? "";
    if (authTypeSelect) authTypeSelect.value = selectedMailAccount?.authType ?? "password";
    if (passwordInput) passwordInput.value = selectedMailAccount?.auth.password ?? "";
    if (accessTokenInput) accessTokenInput.value = selectedMailAccount?.auth.accessToken ?? "";
    if (refreshTokenInput) refreshTokenInput.value = selectedMailAccount?.auth.refreshToken ?? "";
    if (clientIdInput) clientIdInput.value = selectedMailAccount?.auth.clientId ?? "";
    if (clientSecretInput) clientSecretInput.value = selectedMailAccount?.auth.clientSecret ?? "";
    if (imapHostInput) imapHostInput.value = selectedMailAccount?.imap.host ?? "";
    if (imapPortInput) {
      const imapPort = selectedMailAccount?.imap.port;
      imapPortInput.value =
        typeof imapPort === "number" && Number.isFinite(imapPort) ? String(imapPort) : "";
    }
    if (imapSecureCheck) imapSecureCheck.checked = selectedMailAccount?.imap.secure ?? true;
    if (smtpHostInput) smtpHostInput.value = selectedMailAccount?.smtp.host ?? "";
    if (smtpPortInput) {
      const smtpPort = selectedMailAccount?.smtp.port;
      smtpPortInput.value =
        typeof smtpPort === "number" && Number.isFinite(smtpPort) ? String(smtpPort) : "";
    }
    if (smtpSecureCheck) smtpSecureCheck.checked = selectedMailAccount?.smtp.secure ?? true;

    const deleteBtn = document.getElementById("us1-mail-delete-btn") as HTMLButtonElement | null;
    if (deleteBtn) {
      deleteBtn.disabled = selectedMailAccount === null;
    }

    this.renderMailVerifyButton();
  }

  private renderMailVerifyButton(): void {
    const verifyBtn = document.getElementById("us1-mail-verify-btn") as HTMLButtonElement | null;
    if (verifyBtn === null) {
      return;
    }

    verifyBtn.disabled = this.mailVerifyBusy;
    verifyBtn.textContent = this.mailVerifyBusy
      ? entranceT("slot.connecting")
      : entranceT("us1.mailAccount.actions.connect");
    verifyBtn.classList.toggle("is-busy", this.mailVerifyBusy);
    verifyBtn.setAttribute("aria-busy", String(this.mailVerifyBusy));
  }

  private renderRelayHealthButton(): void {
    const relayTestBtn = document.getElementById("us1-relay-test-btn") as HTMLButtonElement | null;
    if (relayTestBtn === null) {
      return;
    }

    const settings = this.settingsManager.getSnapshot();
    relayTestBtn.disabled = this.relayHealthBusy || this.isRelayConfigured(settings) !== true;
    relayTestBtn.textContent = this.relayHealthBusy
      ? entranceT("us1.relay.actions.testing")
      : entranceT("us1.relay.actions.test");
    relayTestBtn.classList.toggle("is-busy", this.relayHealthBusy);
    relayTestBtn.setAttribute("aria-busy", String(this.relayHealthBusy));
  }

  private renderRelayTrustResetButton(): void {
    const relayResetTrustBtn = document.getElementById(
      "us1-relay-reset-trust-btn"
    ) as HTMLButtonElement | null;
    if (relayResetTrustBtn === null) {
      return;
    }

    const settings = this.settingsManager.getSnapshot();
    relayResetTrustBtn.disabled =
      this.normalizeText(settings.integrations?.us1Relay?.trustedServerFingerprint) === null;
  }

  private renderMailAccountFormState(): void {
    const providerSelect = document.getElementById(
      "us1-mail-provider-select"
    ) as HTMLSelectElement | null;
    const authTypeSelect = document.getElementById(
      "us1-mail-auth-type-select"
    ) as HTMLSelectElement | null;
    const providerType = providerSelect?.value ?? "gmail";
    const authType = authTypeSelect?.value ?? "password";

    if (providerType === "gmail" && authTypeSelect) {
      authTypeSelect.value = "password";
    }

    document
      .querySelectorAll<HTMLElement>("[data-us1-mail-custom]")
      .forEach((element) =>
        element.classList.toggle("is-hidden", providerType !== "custom-imap-smtp")
      );

    document
      .querySelectorAll<HTMLElement>("[data-us1-mail-gmail-helper]")
      .forEach((element) => element.classList.toggle("is-hidden", providerType !== "gmail"));

    document
      .querySelectorAll<HTMLElement>("[data-us1-mail-manual-fields]")
      .forEach((element) => element.classList.toggle("is-hidden", providerType === "gmail"));

    document
      .querySelectorAll<HTMLElement>("[data-us1-mail-password]")
      .forEach((element) =>
        element.classList.toggle("is-hidden", authType !== "password" || providerType === "gmail")
      );

    document
      .querySelectorAll<HTMLElement>("[data-us1-mail-oauth]")
      .forEach((element) =>
        element.classList.toggle("is-hidden", authType !== "oauth2" || providerType === "gmail")
      );
  }

  private renderSlotSelect(
    activeBindings: ActiveRemoteBinding[],
    selectedBinding: ActiveRemoteBinding | null
  ): void {
    const slotUserSelect = document.getElementById(
      "us1-identity-select"
    ) as HTMLSelectElement | null;
    if (slotUserSelect === null) {
      return;
    }

    slotUserSelect.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent =
      activeBindings.length > 0
        ? entranceT("us1.selectPlaceholder")
        : entranceT("us1.noReadyUsers");
    slotUserSelect.appendChild(placeholder);

    activeBindings.forEach((binding) => {
      const option = document.createElement("option");
      option.value = binding.accountId;
      option.textContent = `${binding.nickname} (${binding.email})`;
      slotUserSelect.appendChild(option);
    });

    slotUserSelect.value = selectedBinding?.accountId ?? "";
    slotUserSelect.disabled = activeBindings.length === 0;
  }

  private renderCommunicationSystem(settings: AppSettings): void {
    const communicationSystemSelect = document.getElementById(
      "us1-communication-system-select"
    ) as HTMLSelectElement | null;
    if (communicationSystemSelect !== null) {
      communicationSystemSelect.value = this.getCommunicationSystem(settings);
    }
  }

  private renderRelaySettings(
    settings: AppSettings,
    selectedBinding: ActiveRemoteBinding | null
  ): void {
    const relayEnabledCheck = document.getElementById(
      "us1-relay-enabled-check"
    ) as HTMLInputElement | null;
    if (relayEnabledCheck !== null) {
      relayEnabledCheck.checked = settings.integrations?.us1Relay?.enabled === true;
    }

    const relayBaseUrlInput = document.getElementById(
      "us1-relay-base-url-input"
    ) as HTMLInputElement | null;
    if (relayBaseUrlInput !== null) {
      relayBaseUrlInput.value = settings.integrations?.us1Relay?.baseUrl ?? "";
    }

    const relayStatus = document.getElementById("us1-relay-status");
    if (relayStatus !== null) {
      relayStatus.textContent = this.getRelayStatusText(settings, selectedBinding);
    }

    const relayFingerprint = document.getElementById("us1-relay-fingerprint");
    if (relayFingerprint !== null) {
      relayFingerprint.textContent =
        this.normalizeText(settings.integrations?.us1Relay?.signingKeyFingerprint) ??
        entranceT("us1.relay.status.noFingerprint");
    }

    const relayServerFingerprint = document.getElementById("us1-relay-server-fingerprint");
    if (relayServerFingerprint !== null) {
      relayServerFingerprint.textContent =
        this.normalizeText(settings.integrations?.us1Relay?.trustedServerFingerprint) ??
        entranceT("us1.relay.status.noServerFingerprint");
    }

    this.renderRelayHealthButton();
    this.renderRelayTrustResetButton();
  }

  private getMailAccountStatusText(selectedMailAccount: MailTransportAccountConfig | null): string {
    if (selectedMailAccount === null) {
      return entranceT("us1.mailAccount.status.none");
    }
    return entranceT(
      `us1.mailAccount.status.${selectedMailAccount.connectionState ?? "disconnected"}`
    );
  }

  private getSlotStatusText(
    editableMailAccount: MailTransportAccountConfig | null,
    verifiedLocalMailAccount: MailTransportAccountConfig | null,
    activeUserCount: number,
    selectedBinding: ActiveRemoteBinding | null,
    connected: boolean
  ): string {
    const settings = this.settingsManager.getSnapshot();
    if (editableMailAccount === null) {
      return entranceT("us1.status.noMailAccount");
    }
    if (verifiedLocalMailAccount === null) {
      return entranceT("us1.status.noConnectedMailAccount");
    }
    if (activeUserCount === 0) {
      return entranceT("us1.status.noUsers");
    }
    if (selectedBinding === null) {
      return entranceT("us1.status.empty");
    }
    if (
      this.getCommunicationSystem(settings) === "relay-e2ee" &&
      this.isRelayConfigured(settings) !== true
    ) {
      return entranceT("us1.relay.status.notConfigured");
    }
    if (
      this.getCommunicationSystem(settings) === "relay-e2ee" &&
      selectedBinding.relayCapable !== true
    ) {
      return entranceT("us1.relay.status.peerUnsupported");
    }
    if (connected) {
      return entranceT("us1.status.connected");
    }
    return entranceT("us1.status.ready");
  }

  private getPhaseHint(
    editableMailAccount: MailTransportAccountConfig | null,
    verifiedLocalMailAccount: MailTransportAccountConfig | null,
    activeUserCount: number
  ): string {
    const settings = this.settingsManager.getSnapshot();
    if (editableMailAccount === null) {
      return entranceT("us1.phaseHintNoMailAccount");
    }
    if (verifiedLocalMailAccount === null) {
      return entranceT("us1.phaseHintVerifyMail");
    }
    if (activeUserCount === 0) {
      return entranceT("us1.phaseHintHandshake");
    }
    if (this.getCommunicationSystem(settings) === "relay-e2ee") {
      return entranceT("us1.relay.phaseHint");
    }
    return entranceT("us1.phaseHint");
  }

  private addReport(message: string, kind: FeedbackKind = "info"): void {
    const trimmed = message.trim();
    if (trimmed === "") {
      return;
    }

    this.reportEntries = [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        at: Date.now(),
        kind,
        message: trimmed,
      },
      ...this.reportEntries,
    ].slice(0, 16);
  }

  private describeBinding(binding: ActiveRemoteBinding): string {
    return `${binding.nickname} (${binding.email})`;
  }

  private notifyFeedback(
    title: string,
    kind: FeedbackKind,
    message?: string,
    dedupeKey?: string
  ): void {
    notifyUser({
      kind,
      title,
      ...(message != null && message !== "" ? { message } : {}),
      ...(dedupeKey != null && dedupeKey !== "" ? { dedupeKey } : {}),
      inlineTargetId: "us1-feedback-msg",
    });
  }

  private renderReportLog(): void {
    const reportEl = document.getElementById("us1-report-log");
    if (reportEl === null) {
      return;
    }

    reportEl.innerHTML = "";

    if (this.reportEntries.length === 0) {
      reportEl.innerHTML = `<div class="empty-message">${this.escapeHtml(
        entranceT("us1.reportEmpty")
      )}</div>`;
      return;
    }

    this.reportEntries.forEach((entry) => {
      const row = document.createElement("div");
      row.className = `us1-slot-panel__report-entry is-${entry.kind}`;
      row.innerHTML = `
        <span class="us1-slot-panel__report-time">${this.escapeHtml(formatTime(entry.at))}</span>
        <div>${this.escapeHtml(entry.message)}</div>
      `;
      reportEl.appendChild(row);
    });
  }

  private escapeHtml(text: string): string {
    if (text === "") {
      return "";
    }
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  private showFeedback(message: string, kind: FeedbackKind = "info"): void {
    const statusEl = document.getElementById("us1-feedback-msg");
    if (statusEl === null) {
      return;
    }

    statusEl.textContent = message;
    statusEl.className = `ds-status-msg is-visible is-${kind}`;

    window.setTimeout(() => {
      statusEl.classList.remove("is-visible");
    }, 3200);
  }

  private syncIndicators(connected: boolean): void {
    TrafficManager.setIndicator("us1", "loading", this.loadingBusy ? "busy" : "idle");
    if (connected === false) {
      TrafficManager.setIndicator("us1", "thinking", "idle");
    }
    TrafficManager.setIndicator("us1", "send", connected ? "idle" : "busy");
  }
}

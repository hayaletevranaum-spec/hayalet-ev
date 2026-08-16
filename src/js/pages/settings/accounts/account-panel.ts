import { getMimeTypeFromPath, generateAccountId } from "../../../constants/index.js";
import { LogCategory, LogLevel } from "@shared/logging-core";
import { getErrorMessage } from "@shared/index.js";
import {
  buildRemoteEmailAccountId,
  extractUs1RemoteIdentityIdFromAccountId,
} from "@shared/archive.js";
import { Logger } from "../../../modules/logger/index.js";
import {
  isRemoteEmailAccount,
  type AccountKind,
  type AppSettings,
  type Account,
  type MailTransportAccountConfig,
} from "@shared/settings.js";
import { notifyUser } from "../../../ui/user-notification.js";
import { t as entranceT } from "../panel-i18n.js";

interface SettingsManager {
  getSnapshot(): AppSettings;
  save(settings: Record<string, unknown>): Promise<boolean>;
  reload?(): Promise<AppSettings>;
  load?(options?: { force?: boolean }): Promise<AppSettings>;
}

type FeedbackKind = "success" | "error" | "info" | "warning";

export class AccountPanel {
  _newAccountAvatarPath: string | null;
  _editingAccountId: string | null;
  _newAccountAvatarPreviewRequestId: number;
  settingsManager: SettingsManager;

  constructor(settingsManager: SettingsManager) {
    this.settingsManager = settingsManager;
    this._newAccountAvatarPath = null;
    this._editingAccountId = null;
    this._newAccountAvatarPreviewRequestId = 0;
  }

  init(): void {
    this.setupListeners();
    this.render();
    void this.renderNewAccountAvatarPreview();
  }

  setupListeners(): void {
    const createBtn = document.getElementById("settings-create-account");
    if (createBtn instanceof HTMLElement) {
      createBtn.onclick = (): void => {
        void this.handlePrimaryAction();
      };
    }

    const cancelBtn = document.getElementById("settings-cancel-edit");
    if (cancelBtn instanceof HTMLElement) {
      cancelBtn.onclick = (): void => {
        this.cancelEdit();
      };
    }

    const avatarBrowseBtn = document.getElementById("new-account-avatar-browse");
    if (avatarBrowseBtn instanceof HTMLElement) {
      avatarBrowseBtn.onclick = (): void => {
        void this.browseNewAccountAvatar();
      };
    }

    const kindSelect = document.getElementById("new-account-kind") as HTMLSelectElement | null;
    if (kindSelect !== null) {
      kindSelect.onchange = (): void => {
        this._editingAccountId = null;
        this.renderFormMeta();
      };
    }

    const syncRemoteAccountsBtn = document.getElementById("settings-sync-remote-accounts");
    if (syncRemoteAccountsBtn instanceof HTMLElement) {
      syncRemoteAccountsBtn.onclick = (): void => {
        void this.handleSyncRemoteAccounts();
      };
    }
  }

  render(): void {
    this.renderAccountList();
    this.renderFormMeta();
  }

  private getAccountKind(account: Account | null | undefined): AccountKind {
    return isRemoteEmailAccount(account) ? "remote-email" : "ai-provider";
  }

  private getSelectedKind(): AccountKind {
    const kind =
      (document.getElementById("new-account-kind") as HTMLSelectElement | null)?.value ??
      "ai-provider";
    return kind === "remote-email" ? "remote-email" : "ai-provider";
  }

  private setSelectedKind(kind: AccountKind): void {
    const kindSelect = document.getElementById("new-account-kind") as HTMLSelectElement | null;
    if (kindSelect) {
      kindSelect.value = kind;
    }
  }

  private getManagedAccounts(settings: AppSettings): Account[] {
    const accounts = Array.isArray(settings.accounts) ? [...settings.accounts] : [];
    const priority = new Map<string, number>([
      ["active", 0],
      ["handshake_pending", 1],
      ["invite_sent", 2],
      ["rejected", 3],
      ["error", 4],
    ]);

    return accounts.sort((left, right) => {
      const leftKind = this.getAccountKind(left);
      const rightKind = this.getAccountKind(right);
      if (leftKind !== rightKind) {
        return leftKind === "ai-provider" ? -1 : 1;
      }

      if (leftKind === "remote-email" && rightKind === "remote-email") {
        const leftPriority = priority.get(left.remoteEmail?.handshakeState ?? "error") ?? 9;
        const rightPriority = priority.get(right.remoteEmail?.handshakeState ?? "error") ?? 9;
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }
      }

      const leftLabel = `${left.nickname ?? left.email}`.toLowerCase();
      const rightLabel = `${right.nickname ?? right.email}`.toLowerCase();
      return leftLabel.localeCompare(rightLabel, "tr");
    });
  }

  private getRemoteUserId(account: Account): string {
    return (
      account.remoteEmail?.remoteUserId ??
      extractUs1RemoteIdentityIdFromAccountId(account.id) ??
      account.email
    );
  }

  private getVerifiedLocalMailAccount(settings: AppSettings): MailTransportAccountConfig | null {
    const localAccount = settings.integrations?.mailTransport?.localAccount ?? null;
    if (localAccount?.connectionState === "connected") {
      return localAccount;
    }
    return null;
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

  private dispatchAccountListUpdated(): void {
    window.dispatchEvent(new CustomEvent("account-list-updated"));
  }

  renderAccountList(): void {
    const accountListEl = document.getElementById("account-list");
    if (!accountListEl) {
      return;
    }

    const settings = this.settingsManager.getSnapshot();
    const accounts = this.getManagedAccounts(settings);

    accountListEl.innerHTML = "";

    if (accounts.length === 0) {
      accountListEl.innerHTML = `<div class="empty-message">${entranceT("accounts.empty")}</div>`;
      return;
    }

    accounts.forEach((account) => {
      const item = document.createElement("div");
      item.className = "account-row";
      if (this._editingAccountId === account.id) {
        item.classList.add("editing");
      }

      const isRemote = this.getAccountKind(account) === "remote-email";
      const stateLabel = isRemote ? this.getRemoteStateLabel(account) : null;
      const stateClass = isRemote ? this.getRemoteStateClass(account) : "";
      const actionMarkup = isRemote
        ? [
            account.remoteEmail?.handshakeState === "handshake_pending"
              ? `<button class="btn btn-secondary btn-xs accept-btn" title="${this.escapeHtml(entranceT("us1.remote.actions.accept"))}" data-id="${this.escapeHtml(account.id)}">${this.escapeHtml(entranceT("us1.remote.actions.accept"))}</button><button class="btn btn-ghost btn-xs reject-btn" title="${this.escapeHtml(entranceT("us1.remote.actions.reject"))}" data-id="${this.escapeHtml(account.id)}">${this.escapeHtml(entranceT("us1.remote.actions.reject"))}</button>`
              : "",
            `<button class="btn btn-ghost btn-xs delete-btn" title="${this.escapeHtml(entranceT("accounts.deleteTitle"))}" data-id="${this.escapeHtml(account.id)}">×</button>`,
          ].join("")
        : [
            `<button class="btn btn-ghost btn-xs edit-btn" title="${this.escapeHtml(entranceT("accounts.editTitle"))}" data-id="${this.escapeHtml(account.id)}">✎</button>`,
            `<button class="btn btn-ghost btn-xs delete-btn" title="${this.escapeHtml(entranceT("accounts.deleteTitle"))}" data-id="${this.escapeHtml(account.id)}">×</button>`,
          ].join("");

      item.innerHTML = `
        <div id="account-avatar-${this.escapeHtml(account.id)}" class="account-avatar-2row">
          <div class="avatar-placeholder img-cover"></div>
        </div>
        <div class="account-info-grid">
          <div class="account-info-top">
            <span class="account-nick">${this.escapeHtml(account.nickname ?? account.email)}</span>
            <span class="account-type">${this.escapeHtml(this.getAccountTypeLabel(account))}</span>
            ${
              stateLabel !== null
                ? `<span class="account-state-badge ${this.escapeHtml(stateClass)}">${this.escapeHtml(stateLabel)}</span>`
                : `<span class="account-provider">${this.escapeHtml(account.provider)}</span>`
            }
            <div class="account-actions">
              ${actionMarkup}
            </div>
          </div>
          <div class="account-email">${this.escapeHtml(account.email)}</div>
        </div>
      `;

      item.querySelector(".edit-btn")?.addEventListener("click", () => {
        this.startEdit(account);
      });

      item.querySelector(".delete-btn")?.addEventListener("click", () => {
        void this.deleteAccount(account);
      });

      item.querySelector(".accept-btn")?.addEventListener("click", () => {
        void this.acceptRemoteAccount(account);
      });

      item.querySelector(".reject-btn")?.addEventListener("click", () => {
        void this.rejectRemoteAccount(account);
      });

      accountListEl.appendChild(item);
      void this.renderAccountAvatar(account);
    });
  }

  private getAccountTypeLabel(account: Account): string {
    return this.getAccountKind(account) === "remote-email"
      ? entranceT("accounts.types.remoteEmail")
      : entranceT("accounts.types.aiProvider");
  }

  private getRemoteStateLabel(account: Account): string {
    return entranceT(`us1.remote.state.${account.remoteEmail?.handshakeState ?? "error"}`);
  }

  private getRemoteStateClass(account: Account): string {
    const state = account.remoteEmail?.handshakeState ?? "error";
    if (state === "active") {
      return "is-active";
    }
    if (state === "handshake_pending") {
      return "is-pending";
    }
    if (state === "invite_sent") {
      return "is-invite";
    }
    if (state === "rejected") {
      return "is-rejected";
    }
    return "is-error";
  }

  async renderAccountAvatar(account: Account): Promise<void> {
    const previewEl = document.getElementById(`account-avatar-${account.id}`);
    if (!previewEl) {
      return;
    }

    const electronApi = window.electronAPI;
    const canRead = typeof electronApi?.["readFile"] === "function";
    const avatarPath = account.avatarPath ?? "";
    const avatarUrl = account.avatar ?? "";
    const fallbackPath =
      account.provider === "remote-email"
        ? "src/assets/default.png"
        : `src/assets/${account.provider}.png`;
    const altText = this.escapeHtml(entranceT("accounts.avatarAlt"));

    const tryLoadFile = async (filePath: string): Promise<boolean> => {
      if (!canRead) return false;
      try {
        const readFile = electronApi["readFile"] as ((path: string) => Promise<string>) | undefined;
        if (typeof readFile !== "function") return false;
        const data = await readFile(filePath);
        const base64 = String(data);
        if (base64 === "") return false;
        const mimeType = getMimeTypeFromPath(filePath);
        previewEl.innerHTML = `<img src="data:${mimeType};base64,${base64}" alt="${altText}" class="img-cover">`;
        return true;
      } catch {
        return false;
      }
    };

    if (avatarPath !== "" && (await tryLoadFile(avatarPath))) {
      return;
    }

    if (
      avatarUrl.startsWith("https://") ||
      avatarUrl.startsWith("http://") ||
      avatarUrl.startsWith("data:")
    ) {
      previewEl.innerHTML = `<img src="${this.escapeHtml(avatarUrl)}" alt="${altText}" class="img-cover">`;
      return;
    }

    if (fallbackPath !== "" && (await tryLoadFile(fallbackPath))) {
      return;
    }

    previewEl.innerHTML = '<div class="avatar-placeholder">?</div>';
  }

  async renderNewAccountAvatarPreview(): Promise<void> {
    const previewEl = document.getElementById("new-account-avatar-preview");
    if (!previewEl) {
      return;
    }

    const electronApi = window.electronAPI;
    const canRead = typeof electronApi?.["readFile"] === "function";
    const avatarPath = this._newAccountAvatarPath;
    const requestId = ++this._newAccountAvatarPreviewRequestId;
    const altText = this.escapeHtml(entranceT("accounts.avatarPreviewAlt"));

    const tryLoadFile = async (filePath: string): Promise<boolean> => {
      if (!canRead) return false;
      try {
        const readFile = electronApi["readFile"] as ((path: string) => Promise<string>) | undefined;
        if (typeof readFile !== "function") return false;
        const data = await readFile(filePath);
        const base64 = String(data);
        if (base64 === "") return false;
        if (
          requestId !== this._newAccountAvatarPreviewRequestId ||
          avatarPath !== this._newAccountAvatarPath
        ) {
          return false;
        }
        const mimeType = getMimeTypeFromPath(filePath);
        previewEl.innerHTML = `<img src="data:${mimeType};base64,${base64}" alt="${altText}" class="img-cover">`;
        return true;
      } catch {
        return false;
      }
    };

    if (avatarPath !== null && avatarPath !== "" && (await tryLoadFile(avatarPath))) {
      return;
    }

    previewEl.innerHTML = '<div class="avatar-placeholder">?</div>';
  }

  startEdit(account: Account): void {
    if (this.getAccountKind(account) === "remote-email") {
      return;
    }

    this._editingAccountId = account.id;
    this._newAccountAvatarPath = account.avatarPath ?? null;
    this.setSelectedKind("ai-provider");

    const emailEl = document.getElementById("new-account-email") as HTMLInputElement | null;
    const providerEl = document.getElementById("new-account-provider") as HTMLSelectElement | null;
    const nicknameEl = document.getElementById("new-account-nickname") as HTMLInputElement | null;

    if (emailEl) {
      emailEl.value = account.email;
    }
    if (providerEl) {
      providerEl.value = account.provider;
    }
    if (nicknameEl) {
      nicknameEl.value = account.nickname ?? "";
    }

    this.renderFormState();
    void this.renderNewAccountAvatarPreview();
    this.render();
  }

  cancelEdit(): void {
    this._editingAccountId = null;
    this._newAccountAvatarPath = null;
    this.setSelectedKind("ai-provider");

    const emailEl = document.getElementById("new-account-email") as HTMLInputElement | null;
    const providerEl = document.getElementById("new-account-provider") as HTMLSelectElement | null;
    const nicknameEl = document.getElementById("new-account-nickname") as HTMLInputElement | null;

    if (emailEl) {
      emailEl.value = "";
    }
    if (providerEl) {
      providerEl.value = "chatgpt";
    }
    if (nicknameEl) {
      nicknameEl.value = "";
    }
    this.renderFormState();
    this.clearNewAccountAvatarPreview();
    this.render();
  }

  private clearNewAccountAvatarPreview(): void {
    this._newAccountAvatarPreviewRequestId += 1;
    this._newAccountAvatarPath = null;
    const previewEl = document.getElementById("new-account-avatar-preview");
    if (previewEl) {
      previewEl.innerHTML = '<div class="avatar-placeholder">?</div>';
    }
  }

  private renderFormMeta(): void {
    this.renderFormState();
    if (this._newAccountAvatarPath === null || this._newAccountAvatarPath === "") {
      this.clearNewAccountAvatarPreview();
    } else {
      void this.renderNewAccountAvatarPreview();
    }
  }

  private renderFormState(): void {
    const kind = this.getSelectedKind();
    const isEditingAi = this._editingAccountId !== null && kind === "ai-provider";
    const providerEl = document.getElementById("new-account-provider") as HTMLSelectElement | null;
    const kindEl = document.getElementById("new-account-kind") as HTMLSelectElement | null;
    const titleEl = document.getElementById("account-form-title");
    const createBtn = document.getElementById("settings-create-account");
    const cancelBtn = document.getElementById("settings-cancel-edit");
    const syncBtn = document.getElementById("settings-sync-remote-accounts");
    const noteEl = document.getElementById("account-kind-note");
    const remoteMailStatusEl = document.getElementById("remote-account-mail-status");

    document.querySelectorAll<HTMLElement>("[data-account-kind]").forEach((element) => {
      const targetKind = element.getAttribute("data-account-kind");
      element.classList.toggle("is-hidden", targetKind !== kind);
    });

    if (providerEl) {
      providerEl.disabled = kind !== "ai-provider" || isEditingAi;
    }
    if (kindEl) {
      kindEl.disabled = isEditingAi;
    }

    if (titleEl) {
      titleEl.textContent =
        kind === "remote-email"
          ? entranceT("accounts.form.remoteTitle")
          : isEditingAi
            ? entranceT("accounts.form.editTitle")
            : entranceT("accounts.form.createTitle");
    }

    if (createBtn) {
      createBtn.textContent =
        kind === "remote-email"
          ? entranceT("accounts.form.remoteInviteAction")
          : isEditingAi
            ? entranceT("accounts.form.updateAction")
            : entranceT("accounts.form.createAction");
    }

    if (cancelBtn) {
      cancelBtn.classList.toggle("is-hidden", !isEditingAi);
    }

    if (syncBtn) {
      syncBtn.classList.toggle("is-hidden", kind !== "remote-email");
    }

    if (noteEl) {
      noteEl.textContent = "";
    }

    if (remoteMailStatusEl) {
      const settings = this.settingsManager.getSnapshot();
      const localMailAccount = this.getVerifiedLocalMailAccount(settings);
      remoteMailStatusEl.textContent =
        localMailAccount !== null
          ? entranceT("accounts.form.remoteMailReady", { email: localMailAccount.email })
          : entranceT("accounts.form.remoteMailMissing");
    }
  }

  async browseNewAccountAvatar(): Promise<void> {
    try {
      const electronApi = window.electronAPI;
      if (!electronApi) {
        return;
      }
      const showOpenDialog = electronApi["showOpenDialog"];
      if (typeof showOpenDialog !== "function") return;
      const result = await showOpenDialog({
        title: entranceT("accounts.dialog.avatarTitle"),
        buttonLabel: entranceT("accounts.dialog.selectButton"),
        filters: [
          {
            name: entranceT("accounts.dialog.imageFilterName"),
            extensions: ["png", "jpg", "jpeg", "gif", "webp"],
          },
        ],
        properties: ["openFile"],
      });

      if (result.canceled === true || result.filePaths.length === 0) {
        return;
      }

      this._newAccountAvatarPath = result.filePaths[0] ?? null;
      await this.renderNewAccountAvatarPreview();
    } catch (err) {
      Logger.error(
        LogCategory.ENTRANCE,
        entranceT("logs.accountAvatarBrowseError", { message: getErrorMessage(err) })
      );
    }
  }

  async handlePrimaryAction(): Promise<void> {
    if (this.getSelectedKind() === "remote-email") {
      await this.handleInviteRemoteAccount();
      return;
    }

    if (this._editingAccountId !== null && this._editingAccountId !== "") {
      await this.updateAccount();
      return;
    }

    await this.createAccount();
  }

  private async handleInviteRemoteAccount(): Promise<void> {
    const electronApi = window.electronAPI;
    if (!electronApi) {
      this.showFeedback(entranceT("accounts.feedback.electronApiMissing"), "error");
      return;
    }

    const settings = this.settingsManager.getSnapshot();
    const localMailAccount = this.getVerifiedLocalMailAccount(settings);
    if (localMailAccount === null) {
      this.showFeedback(entranceT("accounts.form.remoteMailMissing"), "warning");
      return;
    }

    const emailEl = document.getElementById("new-account-email") as HTMLInputElement | null;
    const email = emailEl?.value.trim().toLowerCase() ?? "";
    if (email === "") {
      this.showFeedback(entranceT("us1.feedback.remoteEmailRequired"), "error");
      return;
    }

    const inviteRemoteUser = electronApi["us1InviteRemoteUser"] as (opts: {
      mailAccountId: string;
      email: string;
    }) => Promise<{ success?: boolean; error?: string }>;
    if (typeof inviteRemoteUser !== "function") return;
    const result = await inviteRemoteUser({
      mailAccountId: localMailAccount.id,
      email,
    });

    await this.reloadSettings();
    this.render();

    if (result.success === true) {
      if (emailEl) {
        emailEl.value = "";
      }
      this.clearNewAccountAvatarPreview();
      this.notifyFeedback(
        entranceT("us1.feedback.inviteSent"),
        "success",
        email,
        "accounts:remote"
      );
      return;
    }

    this.notifyFeedback(
      result.error ?? entranceT("us1.feedback.operationFailed"),
      "error",
      undefined,
      "accounts:remote"
    );
  }

  private async handleSyncRemoteAccounts(): Promise<void> {
    const electronApi = window.electronAPI;
    if (!electronApi) {
      this.showFeedback(entranceT("accounts.feedback.electronApiMissing"), "error");
      return;
    }

    const settings = this.settingsManager.getSnapshot();
    const localMailAccount = this.getVerifiedLocalMailAccount(settings);
    if (localMailAccount === null) {
      this.showFeedback(entranceT("accounts.form.remoteMailMissing"), "warning");
      return;
    }

    const syncRemoteUsers = electronApi["us1SyncRemoteUsers"] as (opts: {
      mailAccountId: string;
      limit: number;
    }) => Promise<{ success?: boolean; error?: string; processedCount?: number }>;
    if (typeof syncRemoteUsers !== "function") return;
    const result = await syncRemoteUsers({
      mailAccountId: localMailAccount.id,
      limit: 25,
    });

    await this.reloadSettings();
    this.render();

    if (result.success === true) {
      const processedCount = result.processedCount ?? 0;
      this.notifyFeedback(
        entranceT("us1.feedback.syncSuccess", { count: String(processedCount) }),
        processedCount > 0 ? "success" : "info",
        undefined,
        "accounts:remote-sync"
      );
      return;
    }

    this.notifyFeedback(
      result.error ?? entranceT("us1.feedback.operationFailed"),
      "error",
      undefined,
      "accounts:remote-sync"
    );
  }

  private async acceptRemoteAccount(account: Account): Promise<void> {
    const electronApi = window.electronAPI;
    if (!electronApi) {
      this.showFeedback(entranceT("accounts.feedback.electronApiMissing"), "error");
      return;
    }

    const remoteUserId = this.getRemoteUserId(account);
    const acceptRemoteUser = electronApi["us1AcceptRemoteUser"] as (opts: {
      remoteUserId: string;
    }) => Promise<{ success?: boolean; error?: string }>;
    if (typeof acceptRemoteUser !== "function") return;
    const result = await acceptRemoteUser({ remoteUserId });
    await this.reloadSettings();
    this.render();

    if (result.success === true) {
      this.notifyFeedback(
        entranceT("us1.feedback.acceptSent"),
        "success",
        this.describeRemoteAccount(account),
        "accounts:remote"
      );
      return;
    }

    this.notifyFeedback(
      result.error ?? entranceT("us1.feedback.operationFailed"),
      "error",
      undefined,
      "accounts:remote"
    );
  }

  private async rejectRemoteAccount(account: Account): Promise<void> {
    const electronApi = window.electronAPI;
    if (!electronApi) {
      this.showFeedback(entranceT("accounts.feedback.electronApiMissing"), "error");
      return;
    }

    const remoteUserId = this.getRemoteUserId(account);
    const rejectRemoteUser = electronApi["us1RejectRemoteUser"] as (opts: {
      remoteUserId: string;
    }) => Promise<{ success?: boolean; error?: string }>;
    if (typeof rejectRemoteUser !== "function") return;
    const result = await rejectRemoteUser({ remoteUserId });
    await this.reloadSettings();
    this.render();

    if (result.success === true) {
      this.notifyFeedback(
        entranceT("us1.feedback.rejectSent"),
        "success",
        this.describeRemoteAccount(account),
        "accounts:remote"
      );
      return;
    }

    this.notifyFeedback(
      result.error ?? entranceT("us1.feedback.operationFailed"),
      "error",
      undefined,
      "accounts:remote"
    );
  }

  async createAccount(): Promise<void> {
    const emailEl = document.getElementById("new-account-email") as HTMLInputElement | null;
    const providerEl = document.getElementById("new-account-provider") as HTMLSelectElement | null;
    const nicknameEl = document.getElementById("new-account-nickname") as HTMLInputElement | null;

    const email = emailEl?.value.trim() ?? "";
    const provider = providerEl?.value ?? "";
    const nicknameInput = nicknameEl?.value.trim() ?? "";
    const nickname = nicknameInput !== "" ? nicknameInput : provider;

    if (email === "" || provider === "") {
      this.showFeedback(entranceT("accounts.feedback.emailProviderRequired"), "error");
      return;
    }

    try {
      const settings = this.settingsManager.getSnapshot();
      const accounts = settings.accounts;

      const existingAccount = accounts.find(
        (account) =>
          account.email.toLowerCase() === email.toLowerCase() && account.provider === provider
      );
      if (existingAccount) {
        this.showFeedback(entranceT("accounts.feedback.duplicate"), "error");
        return;
      }

      const accountId = generateAccountId(email, provider);
      let finalAvatarPath = "";

      if (this._newAccountAvatarPath !== null && this._newAccountAvatarPath !== "") {
        const electronApi = window.electronAPI;
        if (!electronApi) {
          this.showFeedback(entranceT("accounts.feedback.electronApiMissing"), "error");
          return;
        }
        const copyToAssets = electronApi["copyToAssets"] as (
          srcPath: string,
          kind: string,
          meta: { id: string; email: string; provider: string }
        ) => Promise<{ path?: string } | undefined>;
        if (typeof copyToAssets !== "function") return;
        const copied = await copyToAssets(this._newAccountAvatarPath, "account", {
          id: accountId,
          email,
          provider,
        });
        finalAvatarPath = copied?.path ?? "";
      } else {
        finalAvatarPath = "";
      }

      const newAccount: Account = {
        id: accountId,
        email,
        provider: provider as Account["provider"],
        accountKind: "ai-provider",
        nickname,
        avatarPath: finalAvatarPath,
      };

      const electronApi = window.electronAPI;
      const dbInitAccount = electronApi?.["dbInitAccount"] as
        | ((opts: { accountId: string }) => Promise<{ success?: boolean; error?: string }>)
        | undefined;
      if (!dbInitAccount) {
        this.notifyFeedback(
          entranceT("accounts.feedback.dbInitMissing"),
          "error",
          undefined,
          "accounts:crud"
        );
        return;
      }
      const dbResult = await dbInitAccount({ accountId });
      if (dbResult.success !== true) {
        this.notifyFeedback(
          entranceT("accounts.feedback.dbError", {
            message: dbResult.error ?? entranceT("logs.unknownMessage"),
          }),
          "error",
          undefined,
          "accounts:crud"
        );
        return;
      }

      const updated = { ...settings, accounts: [...accounts, newAccount] };
      await this.settingsManager.save(updated);

      this.cancelEdit();
      this.dispatchAccountListUpdated();
      Logger.info(LogCategory.ENTRANCE, entranceT("logs.accountCreateSuccess"));
      this.notifyFeedback(
        entranceT("logs.accountCreateSuccess"),
        "success",
        this.describeManagedAccount(newAccount),
        "accounts:crud"
      );
    } catch (err) {
      Logger.panel(
        LogCategory.ENTRANCE,
        LogLevel.ERROR,
        entranceT("logs.accountCreateError", { message: getErrorMessage(err) })
      );
      this.notifyFeedback(
        entranceT("accounts.feedback.createError", { message: getErrorMessage(err) }),
        "error",
        undefined,
        "accounts:crud"
      );
    }
  }

  async updateAccount(): Promise<void> {
    const emailEl = document.getElementById("new-account-email") as HTMLInputElement | null;
    const nicknameEl = document.getElementById("new-account-nickname") as HTMLInputElement | null;

    const email = emailEl?.value.trim() ?? "";
    const nickname = nicknameEl?.value.trim() ?? "";

    if (email === "") {
      this.showFeedback(entranceT("accounts.feedback.emailRequired"), "error");
      return;
    }

    try {
      const settings = this.settingsManager.getSnapshot();
      const accounts = settings.accounts;
      const accountIndex = accounts.findIndex((account) => account.id === this._editingAccountId);

      if (accountIndex === -1) {
        this.showFeedback(entranceT("accounts.feedback.editingMissing"), "error");
        this.cancelEdit();
        return;
      }

      const oldAccount = accounts[accountIndex];
      if (!oldAccount) {
        this.showFeedback(entranceT("accounts.feedback.accountMissing"), "error");
        return;
      }
      let finalAvatarPath = oldAccount.avatarPath;

      if (
        this._newAccountAvatarPath !== null &&
        this._newAccountAvatarPath !== "" &&
        this._newAccountAvatarPath !== oldAccount.avatarPath
      ) {
        const electronApi = window.electronAPI;
        if (!electronApi) {
          this.showFeedback(entranceT("accounts.feedback.electronApiMissing"), "error");
          return;
        }
        const copyToAssets = electronApi["copyToAssets"] as (
          srcPath: string,
          kind: string,
          meta: { id: string; email: string; provider: string }
        ) => Promise<{ path?: string } | undefined>;
        if (typeof copyToAssets !== "function") return;
        const copied = await copyToAssets(this._newAccountAvatarPath, "account", {
          id: oldAccount.id,
          email: oldAccount.email,
          provider: oldAccount.provider,
        });
        finalAvatarPath = copied?.path ?? finalAvatarPath;
      }

      const updatedAccount: Account = {
        ...oldAccount,
        email,
        nickname: nickname === "" ? oldAccount.provider : nickname,
        ...(finalAvatarPath !== "" ? { avatarPath: finalAvatarPath } : {}),
      };

      const newAccounts = [...accounts];
      newAccounts[accountIndex] = updatedAccount;

      const updated = { ...settings, accounts: newAccounts };
      await this.settingsManager.save(updated);

      this.cancelEdit();
      this.dispatchAccountListUpdated();
      Logger.info(LogCategory.ENTRANCE, entranceT("logs.accountUpdateSuccess"));
      this.notifyFeedback(
        entranceT("logs.accountUpdateSuccess"),
        "success",
        this.describeManagedAccount(updatedAccount),
        "accounts:crud"
      );
    } catch (err) {
      Logger.panel(
        LogCategory.ENTRANCE,
        LogLevel.ERROR,
        entranceT("logs.accountUpdateError", { message: getErrorMessage(err) })
      );
      this.notifyFeedback(
        entranceT("accounts.feedback.updateError", { message: getErrorMessage(err) }),
        "error",
        undefined,
        "accounts:crud"
      );
    }
  }

  async deleteAccount(account: Account): Promise<void> {
    if (this.getAccountKind(account) === "remote-email") {
      await this.deleteRemoteAccount(account);
      return;
    }

    const electronApi = window.electronAPI;
    if (!electronApi) {
      return;
    }
    const showMessageBox = electronApi["showMessageBox"] as (opts: {
      type: string;
      buttons: string[];
      defaultId: number;
      cancelId: number;
      title: string;
      message: string;
    }) => Promise<{ response: number }>;
    if (typeof showMessageBox !== "function") return;
    const result = await showMessageBox({
      type: "question",
      buttons: [
        entranceT("accounts.dialog.deleteCancel"),
        entranceT("accounts.dialog.deleteConfirm"),
      ],
      defaultId: 0,
      cancelId: 0,
      title: entranceT("accounts.dialog.deleteTitle"),
      message: entranceT("accounts.dialog.deleteMessage"),
    });

    if (result.response === 0) {
      return;
    }

    try {
      const settings = this.settingsManager.getSnapshot();
      const accounts = settings.accounts;
      const updatedAccounts = accounts.filter((entry) => entry.id !== account.id);
      const clearedSlots: Array<{ label: string; dedupeKey: string }> = [];

      try {
        const dbDeleteAccount = electronApi["dbDeleteAccount"] as
          ((opts: { accountId: string }) => Promise<{ success?: boolean }>) | undefined;
        if (dbDeleteAccount) {
          await dbDeleteAccount({ accountId: account.id });
        }
      } catch (dbErr) {
        Logger.error(
          LogCategory.ENTRANCE,
          entranceT("logs.accountDeleteDataError", { message: getErrorMessage(dbErr) })
        );
      }

      const slots = { ...settings.slots };
      if (slots.ai1.accountId === account.id) {
        slots.ai1 = { ...slots.ai1, accountId: null };
        clearedSlots.push({ label: "AI1", dedupeKey: "slot:ai1:account" });
      }
      if (slots.ai2.accountId === account.id) {
        slots.ai2 = { ...slots.ai2, accountId: null };
        clearedSlots.push({ label: "AI2", dedupeKey: "slot:ai2:account" });
      }

      const updated = { ...settings, accounts: updatedAccounts, slots };
      await this.settingsManager.save(updated);

      if (this._editingAccountId === account.id) {
        this.cancelEdit();
      }

      this.dispatchAccountListUpdated();
      Logger.info(LogCategory.ENTRANCE, entranceT("logs.accountDeleteSuccess"));
      this.notifyFeedback(
        entranceT("logs.accountDeleteSuccess"),
        "success",
        this.describeManagedAccount(account),
        "accounts:crud"
      );
      clearedSlots.forEach(({ label, dedupeKey }) => {
        this.notifySlotAccountCleared(label, dedupeKey);
      });
    } catch (err) {
      this.notifyFeedback(
        entranceT("accounts.feedback.deleteError", { message: getErrorMessage(err) }),
        "error",
        undefined,
        "accounts:crud"
      );
    }
  }

  private async deleteRemoteAccount(account: Account): Promise<void> {
    const electronApi = window.electronAPI;
    if (!electronApi) {
      this.showFeedback(entranceT("accounts.feedback.electronApiMissing"), "error");
      return;
    }

    const showMessageBox = electronApi["showMessageBox"] as (opts: {
      type: string;
      buttons: string[];
      defaultId: number;
      cancelId: number;
      title: string;
      message: string;
    }) => Promise<{ response: number }>;
    if (typeof showMessageBox !== "function") return;
    const result = await showMessageBox({
      type: "question",
      buttons: [
        entranceT("accounts.dialog.deleteCancel"),
        entranceT("accounts.dialog.deleteConfirm"),
      ],
      defaultId: 0,
      cancelId: 0,
      title: entranceT("accounts.dialog.deleteTitle"),
      message: entranceT("accounts.dialog.deleteMessage"),
    });

    if (result.response === 0) {
      return;
    }

    const remoteUserId = this.getRemoteUserId(account);
    const remoteAccountId = buildRemoteEmailAccountId(remoteUserId);
    const settings = this.settingsManager.getSnapshot();
    const updatedAccounts = settings.accounts.filter((entry) => entry.id !== account.id);
    const updatedRemoteUsers = (settings.remoteUsers ?? []).filter(
      (remoteUser) => remoteUser.remoteUserId !== remoteUserId
    );
    const currentUs1Slot = settings.us1Slot ?? null;
    const shouldClearUs1Selection =
      currentUs1Slot?.selectedRemoteUserId === remoteUserId ||
      currentUs1Slot?.selectedAccountId === remoteAccountId;

    await this.settingsManager.save({
      ...settings,
      accounts: updatedAccounts,
      remoteUsers: updatedRemoteUsers,
      us1Slot: {
        ...settings.us1Slot,
        ...(shouldClearUs1Selection
          ? {
              selectedRemoteUserId: null,
              selectedAccountId: null,
              connectionState: "disconnected",
            }
          : {}),
      },
    });

    this.dispatchAccountListUpdated();
    this.notifyFeedback(
      entranceT("logs.accountDeleteSuccess"),
      "success",
      this.describeRemoteAccount(account),
      "accounts:remote"
    );
    if (shouldClearUs1Selection) {
      this.notifySlotAccountCleared("US1", "us1:slot-binding");
    }
  }

  private describeManagedAccount(
    account: Pick<Account, "email" | "nickname" | "provider">
  ): string {
    return `${account.nickname ?? account.email} (${account.provider})`;
  }

  private describeRemoteAccount(account: Account): string {
    return account.nickname != null && account.nickname !== ""
      ? `${account.nickname} (${account.email})`
      : account.email;
  }

  private notifySlotAccountCleared(slot: string, dedupeKey: string): void {
    notifyUser({
      kind: "info",
      title: entranceT("slot.toasts.accountCleared", { slot }),
      dedupeKey,
    });
  }

  private notifyFeedback(
    title: string,
    type: FeedbackKind,
    message?: string,
    dedupeKey?: string
  ): void {
    notifyUser({
      kind: type,
      title,
      ...(message != null && message !== "" ? { message } : {}),
      ...(dedupeKey != null && dedupeKey !== "" ? { dedupeKey } : {}),
      inlineTargetId: "account-status-msg",
    });
  }

  escapeHtml(text: string | null | undefined): string {
    if (text === null || text === undefined || text === "") {
      return "";
    }
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  showFeedback(message: string, type: FeedbackKind = "info"): void {
    const statusEl = document.getElementById("account-status-msg");
    if (!statusEl) {
      return;
    }

    const normalizedType = type.startsWith("is-") ? type : `is-${type}`;
    statusEl.textContent = message;
    statusEl.className = `ds-status-msg ${normalizedType}`;
    statusEl.classList.add("is-visible");

    setTimeout(() => {
      statusEl.classList.remove("is-visible");
    }, 3200);
  }
}

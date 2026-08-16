import type { TranslationParams } from "@shared/i18n.js";
import { Logger } from "../../modules/logger/index.js";
import { LogCategory } from "@shared/logging-core";
import { SettingsManager } from "../../modules/settings-manager.js";
import { AppState } from "../../modules/app-state.js";
import { AppI18n } from "../../modules/i18n/index.js";
import { ButtonStates } from "../../ui/button-states.js";
import {
  OVERLAY_GROUPS,
  OVERLAY_KINDS,
  createManagedOverlayController,
  mountElementInOverlayHostLayer,
  OVERLAY_SURFACE_FAMILIES,
  type ManagedOverlayController,
} from "../../ui/overlay-system.js";
import {
  WORKSPACE_TOOL_CLOSE_EVENT,
  WORKSPACE_TOOL_OPEN_EVENT,
  syncWorkspaceToolState,
  type WorkspaceToolCloseDetail,
  type WorkspaceToolOpenDetail,
} from "../../ui/workspace-tool-overlay.js";
import type { ArchiveEntry, FileResult, MessageResult } from "./types.js";
import {
  deleteArchiveEntry,
  navigateArchiveResult,
  performArchiveSearch,
  saveArchiveSelection,
} from "./actions.js";
import {
  applyProtocolSelectionView,
  bindProtocolEditor,
  insertTagAtCursor as insertTagAtCursorInEditor,
  loadProtocolsFromApi,
  readProtocolEditorValue,
  refreshProtocolEditorTokens,
  refreshProtocolTagButtons,
  renderProtocolListView,
  saveProtocolContent,
  setProtocolStatusView,
} from "./protocol-editor.js";
import { handleProtocolLocaleChange } from "./protocol-locale.js";
import { clearSearchResultsView, renderSearchResultsView, switchSearchTab } from "./search-view.js";
import { isAssistantAccountsSettingsPath, isAssistantSlotSettingsPath } from "@shared/settings.js";
import {
  ARCHIVE_PROVIDER_KEYS,
  isArchiveProviderKey,
  type ArchiveProviderKey,
} from "@shared/archive.js";
import { ensureRuntimePageStyles } from "../../app/runtime-page-styles.js";
import { mountWorkspaceToolSceneChrome } from "../../scene/workspace-tool-scene-chrome.js";
function archivesT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`app.archives.${key}`, params);
}

function isHostedInMainShell(): boolean {
  return document.getElementById("pages-container") instanceof HTMLElement;
}

function applyWorkspaceToolPageVisibility(page: HTMLElement, open: boolean): void {
  page.classList.toggle("is-hidden", !open);
  page.toggleAttribute("hidden", !open);
  page.setAttribute("aria-hidden", String(!open));
  if (open) {
    page.dataset["workspaceToolMode"] = "overlay";
    return;
  }

  delete page.dataset["workspaceToolMode"];
}

export class ArchivesPageController {
  entries: ArchiveEntry[];
  activeProvider: ArchiveProviderKey;
  selectedId: string | null;
  searchQuery: string;
  searchScope: string;
  searchResults: { messages: MessageResult[]; attachments: FileResult[] };
  activeTab: string;
  _searchTimeout: ReturnType<typeof setTimeout> | null;
  _unsubSettings: (() => void) | null;
  _unsubI18n: (() => void) | null;

  _protocols: Record<string, string>;
  _selectedProtocolKey: string | null;
  _isOpen: boolean;
  _overlayController: ManagedOverlayController | null;
  overlayEl: HTMLElement | null;
  closeButtonEl: HTMLButtonElement | null;
  listEl: HTMLElement | null;
  titleEl: HTMLInputElement | null;
  summaryEl: HTMLTextAreaElement | null;
  webUrlDisplayEl: HTMLElement | null;
  statusEl: HTMLElement | null;
  detailEmptyEl: HTMLElement | null;
  conversationFormEl: HTMLElement | null;
  searchInputEl: HTMLInputElement | null;
  clearSearchBtn: HTMLElement | null;
  searchEmptyEl: HTMLElement | null;
  messagesCountEl: HTMLElement | null;
  filesCountEl: HTMLElement | null;
  resultsMessagesEl: HTMLElement | null;
  resultsFilesEl: HTMLElement | null;
  _selectedEntry: ArchiveEntry | null;

  protocolListEl: HTMLElement | null;
  protocolEditorTitleEl: HTMLElement | null;
  protocolEditorEl: HTMLElement | null;
  protocolTextareaEl: HTMLTextAreaElement | null;
  protocolSaveBtn: HTMLElement | null;
  protocolEmptyEl: HTMLElement | null;
  protocolStatusEl: HTMLElement | null;
  protocolTagButtonsEl: HTMLElement | null;

  constructor() {
    this.entries = [];
    this.activeProvider = "ai1";
    this.selectedId = null;
    this.searchQuery = "";
    this.searchScope = "current";
    this.searchResults = { messages: [], attachments: [] };
    this.activeTab = "messages";
    this._searchTimeout = null;
    this._unsubSettings = null;
    this._unsubI18n = null;

    this._protocols = {};
    this._selectedProtocolKey = null;
    this._isOpen = false;
    this._overlayController = null;

    this.overlayEl = null;
    this.closeButtonEl = null;
    this.listEl = null;
    this.titleEl = null;
    this.summaryEl = null;
    this.webUrlDisplayEl = null;
    this.statusEl = null;
    this.detailEmptyEl = null;
    this.conversationFormEl = null;
    this.searchInputEl = null;
    this.clearSearchBtn = null;
    this.searchEmptyEl = null;
    this.messagesCountEl = null;
    this.filesCountEl = null;
    this.resultsMessagesEl = null;
    this.resultsFilesEl = null;
    this._selectedEntry = null;

    this.protocolListEl = null;
    this.protocolEditorTitleEl = null;
    this.protocolEditorEl = null;
    this.protocolTextareaEl = null;
    this.protocolSaveBtn = null;
    this.protocolEmptyEl = null;
    this.protocolStatusEl = null;
    this.protocolTagButtonsEl = null;
  }

  async init(): Promise<void> {
    this.cacheElements();
    this.bindEvents();
    this.ensureSubscriptions();

    await this.loadSettings();
    this.applyNames();
    this.applyTranslations();
    if (this.overlayEl instanceof HTMLElement && isHostedInMainShell()) {
      applyWorkspaceToolPageVisibility(this.overlayEl, false);
    }
  }

  cacheElements(): void {
    this.overlayEl = document.getElementById("page-archives");
    this.closeButtonEl = document.getElementById(
      "archives-page-close-btn"
    ) as HTMLButtonElement | null;
    this.listEl = document.getElementById("archives-list");

    this.titleEl = document.getElementById("archive-title") as HTMLInputElement | null;
    this.summaryEl = document.getElementById("archive-summary") as HTMLTextAreaElement | null;
    this.webUrlDisplayEl = document.getElementById("archive-weburl-display");
    this.statusEl = document.getElementById("archive-status");
    this.detailEmptyEl = document.getElementById("detail-empty");
    this.conversationFormEl = document.getElementById("conversation-form");

    this.searchInputEl = document.getElementById("search-input") as HTMLInputElement | null;
    this.clearSearchBtn = document.getElementById("btn-clear-search");
    this.searchEmptyEl = document.getElementById("search-empty");
    this.messagesCountEl = document.getElementById("messages-count");
    this.filesCountEl = document.getElementById("files-count");
    this.resultsMessagesEl = document.getElementById("results-messages");
    this.resultsFilesEl = document.getElementById("results-files");

    this.protocolListEl = document.getElementById("protocol-list");
    this.protocolEditorTitleEl = document.getElementById("protocol-editor-title");
    this.protocolEditorEl = document.getElementById("protocol-rich-editor");
    this.protocolTextareaEl = document.getElementById(
      "protocol-textarea"
    ) as HTMLTextAreaElement | null;
    this.protocolSaveBtn = document.getElementById("btn-protocol-save");
    this.protocolEmptyEl = document.getElementById("protocol-empty");
    this.protocolStatusEl = document.getElementById("protocol-status");
    this.protocolTagButtonsEl = document.getElementById("protocol-tag-buttons");
    bindProtocolEditor({
      protocolEditorEl: this.protocolEditorEl,
      protocolTextareaEl: this.protocolTextareaEl,
    });
  }

  bindEvents(): void {
    if (this.overlayEl instanceof HTMLElement) {
      if (isHostedInMainShell()) {
        mountElementInOverlayHostLayer(this.overlayEl, OVERLAY_SURFACE_FAMILIES.workspaceTool);
      }

      this._overlayController = createManagedOverlayController({
        id: "workspace-tool-archives",
        element: this.overlayEl,
        kind: OVERLAY_KINDS.workspace,
        exclusiveGroup: OVERLAY_GROUPS.workspace,
        isOpen: () => this._isOpen,
        setOpen: (open: boolean) => {
          this._isOpen = open;
          if (this.overlayEl instanceof HTMLElement) {
            applyWorkspaceToolPageVisibility(this.overlayEl, open);
          }
        },
        onAfterOpen: () => {
          this.handleWorkspaceOpen();
        },
        onAfterClose: () => {
          this.handleWorkspaceClose();
        },
      });
    }

    this.closeButtonEl?.addEventListener("click", () => {
      this.close();
    });

    if (this.overlayEl instanceof HTMLElement) {
      mountWorkspaceToolSceneChrome({
        root: this.overlayEl,
        onBack: () => {
          this.close();
        },
      });
    }

    document.addEventListener(
      WORKSPACE_TOOL_OPEN_EVENT,
      ((event: CustomEvent<WorkspaceToolOpenDetail>) => {
        if (event.detail.tool !== "archives") {
          return;
        }

        void this.handleWorkspaceToolOpenRequest();
      }) as EventListener
    );

    document.addEventListener(
      WORKSPACE_TOOL_CLOSE_EVENT,
      ((event: CustomEvent<WorkspaceToolCloseDetail>) => {
        if (event.detail.tool !== "archives") {
          return;
        }

        this._overlayController?.close();
      }) as EventListener
    );

    document.getElementsByName("archives-provider").forEach((el) => {
      el.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        const nextProvider = target.value;
        if (target.checked && isArchiveProviderKey(nextProvider)) {
          this.clearStatus();
          this.activeProvider = nextProvider;
          this.selectedId = null;
          this.renderList();
          this.fillForm(null);
        }
      });
    });

    document.getElementById("archive-save")?.addEventListener("click", (e) => {
      e.preventDefault();
      void this.saveSelected();
    });

    document.getElementById("btn-copy-url")?.addEventListener("click", () => {
      this.copyUrl();
    });

    document.getElementById("btn-delete")?.addEventListener("click", () => {
      const entry =
        this.selectedId !== null
          ? (this.entries.find(
              (archiveEntry) =>
                archiveEntry.id === this.selectedId && archiveEntry.provider === this.activeProvider
            ) ?? null)
          : null;
      if (entry) void this.deleteEntry(entry);
    });

    this.searchInputEl?.addEventListener("input", (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.clearSearchBtn?.classList.toggle("is-hidden", this.searchQuery === "");

      if (this._searchTimeout) clearTimeout(this._searchTimeout);
      this._searchTimeout = setTimeout(() => {
        void this.performSearch();
      }, 300);
    });

    this.clearSearchBtn?.addEventListener("click", () => {
      if (this.searchInputEl) this.searchInputEl.value = "";
      this.searchQuery = "";
      this.clearSearchBtn?.classList.add("is-hidden");
      this.clearSearchResults();
    });

    document.getElementsByName("search-scope").forEach((el) => {
      el.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          this.searchScope = target.value;
          if (this.searchQuery !== "") void this.performSearch();
        }
      });
    });

    document.querySelectorAll(".search-tabs .tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.switchTab((btn as HTMLElement).dataset["tab"] ?? "messages");
      });
    });

    this.protocolSaveBtn?.addEventListener("click", () => {
      void this.saveSelectedProtocol();
    });

    this.protocolTagButtonsEl?.querySelectorAll(".protocol-tag-btn").forEach((btn) => {
      btn.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      btn.addEventListener("click", () => {
        const tag = (btn as HTMLElement).dataset["tag"];
        if (tag !== undefined && tag !== "") {
          this.insertTagAtCursor(tag);
        }
      });
    });
  }

  ensureSubscriptions(): void {
    this._unsubSettings ??= SettingsManager.subscribe(
      ({ changedPaths }: { changedPaths: string[] }) => {
        const shouldApplyNames =
          changedPaths.includes("*") ||
          changedPaths.some(
            (path) =>
              path.startsWith("accounts") ||
              isAssistantAccountsSettingsPath(path) ||
              path.startsWith("slots") ||
              isAssistantSlotSettingsPath(path) ||
              path.startsWith("remoteUsers") ||
              path.startsWith("us1Slot")
          );

        if (!shouldApplyNames) {
          return;
        }

        this.applyNames();
        if (this._isOpen) {
          void this.loadIndex();
        }
      }
    );

    this._unsubI18n ??= AppI18n.subscribe(() => {
      void this.handleLocaleChanged();
    });
  }

  async open(): Promise<void> {
    if (!(this.overlayEl instanceof HTMLElement)) {
      return;
    }

    await this.ensureHostedStyles();

    if (this._overlayController !== null) {
      this._overlayController.open();
      return;
    }

    this._isOpen = true;
    await this.handlePageOpened();
  }

  close(): void {
    this._overlayController?.close();
  }

  onShow(): void {
    this.onHostShow();
  }

  onHostShow(): void {
    this._isOpen = true;
    void this.handlePageOpened();
  }

  onHide(): void {
    this.onHostHide();
  }

  onHostHide(): void {
    this._isOpen = false;
    this.handlePageClosed();
  }

  private async handleWorkspaceToolOpenRequest(): Promise<void> {
    try {
      await this.ensureHostedStyles();
      this._overlayController?.open();
    } catch (error) {
      this.handleHostedStylesLoadFailure(error);
    }
  }

  private handleWorkspaceOpen(): void {
    void this.handlePageOpened();
    syncWorkspaceToolState({
      tool: "archives",
      open: true,
      panel: null,
    });
  }

  private handleWorkspaceClose(): void {
    this.handlePageClosed();
    syncWorkspaceToolState({
      tool: "archives",
      open: false,
      panel: null,
    });
  }

  private async handlePageOpened(): Promise<void> {
    this.clearStatus();
    this.setProtocolStatus("");
    this.applyNames();
    this.applyTranslations();
    await this.refreshPageState();
    window.requestAnimationFrame(() => {
      this.searchInputEl?.focus();
    });
  }

  private handlePageClosed(): void {
    this.clearStatus();
    this.setProtocolStatus("");
    if (this._searchTimeout) {
      clearTimeout(this._searchTimeout);
      this._searchTimeout = null;
    }
  }

  private async ensureHostedStyles(): Promise<void> {
    if (!isHostedInMainShell()) {
      return;
    }

    await ensureRuntimePageStyles("archives");
  }

  private handleHostedStylesLoadFailure(error: unknown): void {
    const resolvedError = error instanceof Error ? error : new Error(String(error));
    Logger.error(LogCategory.ARCHIVES, `Archives page styles failed to load: ${resolvedError.message}`, {
      source: "runtime-page-styles",
      styleKey: "archives",
      error: {
        name: resolvedError.name,
        message: resolvedError.message,
        stack: resolvedError.stack,
      },
    });
  }

  async loadSettings(): Promise<void> {
    try {
      await SettingsManager.load();
    } catch (err) {
      const error = err as Error;
      Logger.error(
        LogCategory.ARCHIVES,
        archivesT("logs.settingsLoadError", { message: error.message })
      );
    }
  }

  async loadIndex(): Promise<void> {
    try {
      const electronApi = window.electronAPI;
      if (electronApi === undefined) {
        this.entries = [];
        this.syncActiveProvider();
        this.renderList();
        this.fillForm(null);
        return;
      }

      const providers = ARCHIVE_PROVIDER_KEYS.map((provider) => ({
        provider,
        accountId: AppState.getArchiveAccountIdForProvider(provider),
      }));

      const results = (await Promise.all(
        providers.map(async ({ accountId }) => {
          if (accountId === null) {
            return { data: [] };
          }
          return await electronApi.dbGetConversations({ accountId });
        })
      )) as Array<{ data?: unknown } | undefined>;

      this.entries = providers.flatMap(({ provider, accountId }, index) => {
        const result = results[index];
        const rawEntries = Array.isArray(result?.data) ? (result.data as ArchiveEntry[]) : [];
        return rawEntries.map((entry) => {
          const nextEntry: ArchiveEntry = {
            ...entry,
            provider,
          };

          const resolvedAccountId = accountId ?? entry.accountId;
          if (resolvedAccountId !== undefined) {
            nextEntry.accountId = resolvedAccountId;
          }

          return nextEntry;
        });
      });

      this.syncActiveProvider();
      this.renderList();

      const selectedEntry =
        this.selectedId !== null
          ? (this.entries.find(
              (entry) => entry.id === this.selectedId && entry.provider === this.activeProvider
            ) ?? null)
          : null;

      if (selectedEntry !== null) {
        this.fillForm(selectedEntry);
      } else {
        this.selectedId = null;
        this.fillForm(null);
      }
    } catch (e) {
      const err = e as Error;
      Logger.error(
        LogCategory.ARCHIVES,
        archivesT("logs.archiveReadError", { message: err.message })
      );
      this.entries = [];
      this.syncActiveProvider();
      this.renderList();
      this.fillForm(null);
    }
  }

  renderList(): void {
    if (!this.listEl) return;
    const items = this.entries.filter((entry) => entry.provider === this.activeProvider);
    this.listEl.innerHTML = "";
    if (items.length === 0) {
      const div = document.createElement("div");
      div.className = "empty";
      div.textContent = archivesT("page.empty");
      this.listEl.appendChild(div);
      return;
    }
    items.forEach((entry) => {
      const item = document.createElement("div");
      item.className = "archive-item glass-panel";
      const titleWrap = document.createElement("div");
      titleWrap.className = "archive-title";
      titleWrap.textContent = entry.title ?? entry.id;
      titleWrap.addEventListener("click", () => {
        if (this.selectedId !== entry.id) {
          this.clearStatus();
        }
        this.selectedId = entry.id;
        this.renderList();
        this.fillForm(entry);
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "archive-remove";
      removeBtn.title = archivesT("page.deleteTitle");
      removeBtn.innerHTML = "×";
      removeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        void this.deleteEntry(entry);
      });

      if (entry.id === this.selectedId) {
        item.classList.add("is-selected");
      }
      item.appendChild(titleWrap);
      item.appendChild(removeBtn);
      this.listEl?.appendChild(item);
    });
  }

  async deleteEntry(entry: ArchiveEntry | null): Promise<void> {
    await deleteArchiveEntry(this, entry);
  }

  fillForm(entry: ArchiveEntry | null): void {
    if (entry) {
      this.detailEmptyEl?.classList.add("is-hidden");
      this.conversationFormEl?.classList.remove("is-hidden");
    } else {
      this.detailEmptyEl?.classList.remove("is-hidden");
      this.conversationFormEl?.classList.add("is-hidden");
    }

    if (this.titleEl) this.titleEl.value = entry?.title ?? "";
    if (this.summaryEl) this.summaryEl.value = entry?.summary ?? "";
    if (this.webUrlDisplayEl) {
      this.webUrlDisplayEl.textContent = entry?.webUrl ?? archivesT("page.webUrlEmpty");
    }

    this._selectedEntry = entry;
  }

  copyUrl(): void {
    const url = this._selectedEntry?.webUrl;
    if (url === undefined || url === "") return;

    navigator.clipboard
      .writeText(url)
      .then(() => {
        this.setStatus(archivesT("page.urlCopied"), "success");
        setTimeout(() => {
          this.clearStatus();
        }, 2000);
      })
      .catch(() => {
        this.setStatus(archivesT("page.copyFailed"), "error");
      });
  }

  async performSearch(): Promise<void> {
    await performArchiveSearch(this);
  }

  renderSearchResults(): void {
    renderSearchResultsView({
      searchResults: this.searchResults,
      searchQuery: this.searchQuery,
      searchScope: this.searchScope,
      messagesCountEl: this.messagesCountEl,
      filesCountEl: this.filesCountEl,
      searchEmptyEl: this.searchEmptyEl,
      resultsMessagesEl: this.resultsMessagesEl,
      resultsFilesEl: this.resultsFilesEl,
      onNavigate: async (result, type) => {
        await this.navigateToResult(result, type);
      },
    });
  }

  async navigateToResult(result: MessageResult | FileResult, type: string): Promise<void> {
    await navigateArchiveResult(this, result, type);
    this.close();
  }

  switchTab(tab: string): void {
    this.activeTab = tab;
    switchSearchTab(tab, this.resultsMessagesEl, this.resultsFilesEl);
  }

  clearSearchResults(): void {
    this.searchResults = { messages: [], attachments: [] };
    clearSearchResultsView({
      messagesCountEl: this.messagesCountEl,
      filesCountEl: this.filesCountEl,
      resultsMessagesEl: this.resultsMessagesEl,
      resultsFilesEl: this.resultsFilesEl,
      searchEmptyEl: this.searchEmptyEl,
    });
  }

  async saveSelected(): Promise<void> {
    await saveArchiveSelection(this);
  }

  setStatus(text: string, type = "info"): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.className = `form-hint is-${type}`;
  }

  clearStatus(): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = "";
    this.statusEl.className = "form-hint";
  }

  getAvailableProviders(): ArchiveProviderKey[] {
    return ARCHIVE_PROVIDER_KEYS.filter((provider) => {
      return AppState.getArchiveAccountIdForProvider(provider) !== null;
    });
  }

  syncActiveProvider(): void {
    const availableProviders = this.getAvailableProviders();
    if (!availableProviders.includes(this.activeProvider)) {
      this.activeProvider = availableProviders[0] ?? "ai1";
    }

    ARCHIVE_PROVIDER_KEYS.forEach((provider) => {
      const radio = document.querySelector<HTMLInputElement>(
        `input[name="archives-provider"][value="${provider}"]`
      );
      if (radio !== null) {
        radio.checked = provider === this.activeProvider;
      }
    });
  }

  applyNames(): void {
    const ai1Assigned = AppState.isAssigned("ai1");
    const ai2Assigned = AppState.isAssigned("ai2");
    const us1Assigned = AppState.isAssigned("us1");

    const ai1Name = ai1Assigned ? AppState.getNickname("ai1") : "AI1";
    const ai0Name = AppState.getNickname("ai0");
    const ai2Name = ai2Assigned ? AppState.getNickname("ai2") : "AI2";
    const us1Name = us1Assigned ? AppState.getNickname("us1") : "US1";

    const labelAi1 = document.getElementById("archives-provider-ai1");
    const labelAi2 = document.getElementById("archives-provider-ai2");
    const labelUs1 = document.getElementById("archives-provider-us1");
    const radioAi1 = document.getElementById("archive-filter-ai1");
    const radioAi2 = document.getElementById("archive-filter-ai2");
    const radioUs1 = document.getElementById("archive-filter-us1");

    if (labelAi1) labelAi1.textContent = ai1Name;
    if (labelAi2) labelAi2.textContent = ai2Name;
    if (labelUs1) labelUs1.textContent = us1Name;

    if (radioAi1) (radioAi1 as HTMLInputElement).disabled = !ai1Assigned;
    if (radioAi2) (radioAi2 as HTMLInputElement).disabled = !ai2Assigned;
    if (radioUs1) (radioUs1 as HTMLInputElement).disabled = !us1Assigned;

    const ai0TagButton = this.protocolTagButtonsEl?.querySelector<HTMLElement>('[data-tag="<AI0>"]');
    const ai1TagButton = this.protocolTagButtonsEl?.querySelector<HTMLElement>('[data-tag="<AI1>"]');
    const ai2TagButton = this.protocolTagButtonsEl?.querySelector<HTMLElement>('[data-tag="<AI2>"]');
    const us1TagButton = this.protocolTagButtonsEl?.querySelector<HTMLElement>('[data-tag="<US1>"]');

    if (ai0TagButton) ai0TagButton.dataset["nickname"] = ai0Name;
    if (ai1TagButton) ai1TagButton.dataset["nickname"] = ai1Name;
    if (ai2TagButton) ai2TagButton.dataset["nickname"] = ai2Name;
    if (us1TagButton) us1TagButton.dataset["nickname"] = us1Name;

    refreshProtocolTagButtons(this.protocolTagButtonsEl);
    refreshProtocolEditorTokens({
      protocolEditorEl: this.protocolEditorEl,
      protocolTextareaEl: this.protocolTextareaEl,
    });
    this.syncActiveProvider();
  }

  async loadProtocols(): Promise<void> {
    try {
      this._protocols = await loadProtocolsFromApi(window.electronAPI);
      this.renderProtocolList();
      if (this._selectedProtocolKey !== null && this._protocols[this._selectedProtocolKey] !== undefined) {
        this.selectProtocol(this._selectedProtocolKey);
      }
    } catch (e) {
      const err = e as Error;
      Logger.error(
        LogCategory.ARCHIVES,
        archivesT("protocol.logs.loadFailed", { message: err.message })
      );
      this._protocols = {};
      this.renderProtocolList();
    }
  }

  renderProtocolList(): void {
    renderProtocolListView({
      protocolListEl: this.protocolListEl,
      protocols: this._protocols,
      selectedProtocolKey: this._selectedProtocolKey,
      onSelect: (key) => {
        this.selectProtocol(key);
      },
    });
  }

  selectProtocol(key: string): void {
    this._selectedProtocolKey = key;
    this.renderProtocolList();
    applyProtocolSelectionView({
      key,
      protocols: this._protocols,
      protocolEditorTitleEl: this.protocolEditorTitleEl,
      protocolEditorEl: this.protocolEditorEl,
      protocolTextareaEl: this.protocolTextareaEl,
      protocolEmptyEl: this.protocolEmptyEl,
      protocolSaveBtn: this.protocolSaveBtn,
      protocolTagButtonsEl: this.protocolTagButtonsEl,
      setStatus: (text, type) => {
        this.setProtocolStatus(text, type);
      },
    });
  }

  async saveSelectedProtocol(): Promise<void> {
    if (this._selectedProtocolKey === null || this._selectedProtocolKey === "") {
      this.setProtocolStatus(archivesT("protocol.status.selectionRequired"), "warning");
      return;
    }

    const content = readProtocolEditorValue({
      protocolEditorEl: this.protocolEditorEl,
      protocolTextareaEl: this.protocolTextareaEl,
    });
    const saveBtn = this.protocolSaveBtn as HTMLButtonElement | null;

    try {
      if (saveBtn) {
        ButtonStates.setLoading(saveBtn, archivesT("protocol.buttons.saving"));
      }

      const result = await saveProtocolContent({
        electronApi: window.electronAPI,
        selectedProtocolKey: this._selectedProtocolKey,
        content,
      });

      if (result.success) {
        this._protocols[this._selectedProtocolKey] = content;
        if (saveBtn) {
          ButtonStates.setSuccess(saveBtn, archivesT("protocol.buttons.saved"), 1500);
        }
        this.setProtocolStatus(archivesT("protocol.status.saved"), "success");
        Logger.info(
          LogCategory.ARCHIVES,
          archivesT("protocol.logs.saved", { key: this._selectedProtocolKey })
        );
      } else {
        if (saveBtn) {
          ButtonStates.setError(saveBtn, archivesT("protocol.buttons.error"), 1500);
        }
        this.setProtocolStatus(result.message ?? archivesT("protocol.status.saveFailed"), "error");
      }
    } catch (e) {
      const err = e as Error;
      if (saveBtn) {
        ButtonStates.setError(saveBtn, archivesT("protocol.buttons.error"), 1500);
      }
      Logger.error(
        LogCategory.ARCHIVES,
        archivesT("protocol.logs.saveError", { message: err.message })
      );
      this.setProtocolStatus(archivesT("protocol.status.saveFailed"), "error");
    }
  }

  insertTagAtCursor(tag: string): void {
    insertTagAtCursorInEditor({
      protocolEditorEl: this.protocolEditorEl,
      protocolTextareaEl: this.protocolTextareaEl,
      tag,
    });
  }

  setProtocolStatus(text: string, type = "info"): void {
    setProtocolStatusView(this.protocolStatusEl, text, type);
  }

  private async refreshPageState(): Promise<void> {
    await this.loadSettings();
    this.applyNames();
    this.applyTranslations();
    await Promise.all([this.loadIndex(), this.loadProtocols()]);
    this.applyTranslations();
  }

  private async handleLocaleChanged(): Promise<void> {
    await handleProtocolLocaleChange({
      isOpen: this._isOpen,
      applyTranslations: () => {
        this.applyTranslations();
      },
      loadProtocols: async () => {
        await this.loadProtocols();
      },
    });
  }

  private setElementText(id: string, text: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = text;
    }
  }

  private applyTranslations(): void {
    this.setElementText("archives-sidebar-title", archivesT("page.sidebarTitle"));
    this.setElementText("archives-detail-title", archivesT("page.detailTitle"));
    this.setElementText("archives-detail-empty-text", archivesT("page.detailEmpty"));
    this.setElementText("archives-title-label", archivesT("page.titleLabel"));
    this.setElementText("archives-summary-label", archivesT("page.summaryLabel"));
    this.setElementText("archives-weburl-label", archivesT("page.webUrlLabel"));
    this.setElementText("archives-search-title", archivesT("page.searchTitle"));
    this.setElementText("archives-scope-current", archivesT("page.scopeCurrent"));
    this.setElementText("archives-scope-all", archivesT("page.scopeAll"));
    this.setElementText("archives-messages-tab-label", archivesT("page.messagesTab"));
    this.setElementText("archives-files-tab-label", archivesT("page.filesTab"));
    this.setElementText("archives-search-empty-text", archivesT("page.searchEmpty"));
    this.setElementText("archives-protocol-list-title", archivesT("page.protocolListTitle"));
    this.setElementText("archives-protocol-list-loading", archivesT("page.protocolLoading"));
    this.setElementText("archives-protocol-empty-text", archivesT("page.protocolEmpty"));

    if (this.titleEl) {
      this.titleEl.placeholder = archivesT("page.titlePlaceholder");
    }
    if (this.summaryEl) {
      this.summaryEl.placeholder = archivesT("page.summaryPlaceholder");
    }
    if (this.searchInputEl) {
      this.searchInputEl.placeholder = archivesT("page.searchPlaceholder");
    }
    if (this.protocolTextareaEl) {
      this.protocolTextareaEl.placeholder = archivesT("page.protocolPlaceholder");
    }
    if (this.protocolEditorEl) {
      this.protocolEditorEl.dataset["placeholder"] = archivesT("page.protocolPlaceholder");
    }

    const copyUrlButton = document.getElementById("btn-copy-url");
    if (copyUrlButton) {
      copyUrlButton.title = archivesT("page.copyUrlTitle");
    }

    const saveButton = document.getElementById("archive-save");
    if (saveButton) {
      saveButton.textContent = archivesT("page.saveButton");
    }

    const deleteButton = document.getElementById("btn-delete");
    if (deleteButton) {
      deleteButton.textContent = `🗑️ ${archivesT("page.deleteButton")}`;
    }

    const protocolSaveButton = document.getElementById("btn-protocol-save");
    if (protocolSaveButton) {
      protocolSaveButton.textContent = `💾 ${archivesT("page.protocolSaveButton")}`;
    }

    if (this._selectedProtocolKey === null && this.protocolEditorTitleEl) {
      this.protocolEditorTitleEl.textContent = archivesT("page.protocolEditorPlaceholderTitle");
    }

    refreshProtocolTagButtons(this.protocolTagButtonsEl);

    this.fillForm(this._selectedEntry);
    this.renderList();
    this.renderProtocolList();

    if (this._selectedProtocolKey !== null) {
      this.selectProtocol(this._selectedProtocolKey);
    }

    if (this.searchQuery === "") {
      this.clearSearchResults();
      return;
    }

    this.renderSearchResults();
  }
}

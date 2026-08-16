import { AppState } from "../../modules/app-state.js";
import { SettingsManager } from "../../modules/settings-manager.js";
import type { Account } from "@shared/settings.js";
import { CoreEngine } from "../../modules/core-engine.js";
import { AppI18n } from "../../modules/i18n/index.js";
import { getErrorMessage } from "@shared/index.js";
import { formatDateTime, t as whisperUiT } from "./i18n.js";

interface WhisperRecord {
  id?: string;
  accountId: string;
  text: string;
  when?: number;
  done?: boolean;
  doneAt?: number;
}

interface WhisperAccountBucket {
  accountId: string;
  pending: WhisperRecord[];
  done: WhisperRecord[];
}

interface SlotBinding {
  slotId: "ai1" | "ai2";
  slotLabel: string;
  accountId: string;
  account: Account;
  accountLabel: string;
}

interface AccountSummary {
  accountLabel: string;
  accountMeta: string;
  slotSummary: string;
}

interface AddTargetOption {
  accountId: string;
  label: string;
}

function whisperT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.whisper.${key}`, params);
}

export class WhisperDockController {
  rootEl: HTMLElement | null;
  toggleEl: HTMLButtonElement | null;
  contentEl: HTMLElement | null;
  addAccountSelect: HTMLSelectElement | null;
  addTextInput: HTMLTextAreaElement | null;
  addWhenInput: HTMLInputElement | null;
  addButton: HTMLButtonElement | null;
  refreshButton: HTMLButtonElement | null;
  feedbackEl: HTMLElement | null;
  filtersEl: HTMLElement | null;
  pendingListEl: HTMLElement | null;
  doneListEl: HTMLElement | null;
  selectedCountEl: HTMLElement | null;
  pendingCountEl: HTMLElement | null;
  readyCountEl: HTMLElement | null;
  pendingMetaEl: HTMLElement | null;
  doneMetaEl: HTMLElement | null;
  feedbackTimer: ReturnType<typeof setTimeout> | null;
  selectedSlots: Set<"ai1" | "ai2">;
  selectionInitialized: boolean;
  autoOpenPending: boolean;
  settingsUnsub: (() => void) | null;
  whisperUpdateHandler: (() => void) | null;
  constructor() {
    this.rootEl = null;
    this.toggleEl = null;
    this.contentEl = null;
    this.addAccountSelect = null;
    this.addTextInput = null;
    this.addWhenInput = null;
    this.addButton = null;
    this.refreshButton = null;
    this.feedbackEl = null;
    this.filtersEl = null;
    this.pendingListEl = null;
    this.doneListEl = null;
    this.selectedCountEl = null;
    this.pendingCountEl = null;
    this.readyCountEl = null;
    this.pendingMetaEl = null;
    this.doneMetaEl = null;
    this.feedbackTimer = null;
    this.selectedSlots = new Set();
    this.selectionInitialized = false;
    this.autoOpenPending = true;
    this.settingsUnsub = null;
    this.whisperUpdateHandler = null;
  }

  init(): void {
    this.rootEl = document.getElementById("whisper-dock");
    this.toggleEl = document.getElementById("whisper-dock-toggle") as HTMLButtonElement | null;
    this.contentEl = document.getElementById("whisper-dock-content");
    this.addAccountSelect = document.getElementById(
      "whisper-add-account"
    ) as HTMLSelectElement | null;
    this.addTextInput = document.getElementById("whisper-add-text") as HTMLTextAreaElement | null;
    this.addWhenInput = document.getElementById("whisper-add-when") as HTMLInputElement | null;
    this.addButton = document.getElementById("whisper-add-btn") as HTMLButtonElement | null;
    this.refreshButton = document.getElementById("whisper-refresh-btn") as HTMLButtonElement | null;
    this.feedbackEl = document.getElementById("whisper-add-feedback");
    this.filtersEl = document.getElementById("whisper-slot-filters");
    this.pendingListEl = document.getElementById("whisper-pending-list");
    this.doneListEl = document.getElementById("whisper-done-list");
    this.selectedCountEl = document.getElementById("whisper-dock-selected-count");
    this.pendingCountEl = document.getElementById("whisper-dock-pending-count");
    this.readyCountEl = document.getElementById("whisper-dock-ready-count");
    this.pendingMetaEl = document.getElementById("whisper-pending-count-meta");
    this.doneMetaEl = document.getElementById("whisper-done-count-meta");
    this.setupListeners();

    this.settingsUnsub ??= SettingsManager.subscribe(
      ({ changedPaths }: { changedPaths: string[] }) => {
        const relevant =
          changedPaths.includes("*") ||
          changedPaths.some(
            (path) =>
              path.startsWith("accounts") ||
              path.startsWith("slots.ai1") ||
              path.startsWith("slots.ai2")
          );

        if (relevant) {
          void this.render();
        }
      }
    );

    this.whisperUpdateHandler = (): void => {
      void this.render();
    };
    window.addEventListener("whisper-updated", this.whisperUpdateHandler);

    void this.render();
  }

  setupListeners(): void {
    this.toggleEl?.addEventListener("click", () => {
      this.setExpanded(!this.isExpanded());
    });

    this.addButton?.addEventListener("click", () => {
      void this.handleAddWhisper();
    });

    this.refreshButton?.addEventListener("click", () => {
      void this.render();
    });
  }

  getAccountLabel(account: Account): string {
    return account.nickname ?? account.name ?? account.email;
  }

  getAccountMeta(account: Account, fallback: string): string {
    const email = account.email.trim();
    if (email !== "") {
      return email;
    }

    const provider = account.provider.trim();
    return provider !== "" ? provider : fallback;
  }

  getSlotBindings(): SlotBinding[] {
    return (["ai1", "ai2"] as const).flatMap((slotId) => {
      const account = AppState.getAccountForSlot(slotId);
      if (account === null || account.id.trim() === "") {
        return [];
      }

      return [
        {
          slotId,
          slotLabel: slotId.toUpperCase(),
          accountId: account.id,
          account,
          accountLabel: this.getAccountLabel(account),
        },
      ];
    });
  }

  getSelectedAccountIds(bindings: SlotBinding[]): string[] {
    return Array.from(
      new Set(
        bindings
          .filter((binding) => this.selectedSlots.has(binding.slotId))
          .map((binding) => binding.accountId)
      )
    );
  }

  buildAccountSummaryMap(bindings: SlotBinding[]): Map<string, AccountSummary> {
    const grouped = new Map<
      string,
      {
        account: Account;
        slots: string[];
      }
    >();

    bindings.forEach((binding) => {
      const current = grouped.get(binding.accountId);
      if (current) {
        current.slots.push(binding.slotLabel);
        return;
      }

      grouped.set(binding.accountId, {
        account: binding.account,
        slots: [binding.slotLabel],
      });
    });

    return new Map(
      Array.from(grouped.entries()).map(([accountId, value]) => [
        accountId,
        {
          accountLabel: this.getAccountLabel(value.account),
          accountMeta: this.getAccountMeta(value.account, accountId),
          slotSummary: value.slots.join(" / "),
        },
      ])
    );
  }

  buildAddTargetOptions(bindings: SlotBinding[]): AddTargetOption[] {
    const summaryMap = this.buildAccountSummaryMap(bindings);
    return Array.from(summaryMap.entries()).map(([accountId, summary]) => ({
      accountId,
      label: `${summary.slotSummary} · ${summary.accountLabel}`,
    }));
  }

  reconcileSelectedSlots(bindings: SlotBinding[]): void {
    const available = new Set(bindings.map((binding) => binding.slotId));
    const nextSelected = new Set(
      Array.from(this.selectedSlots).filter((slotId) => available.has(slotId))
    );

    if (!this.selectionInitialized) {
      available.forEach((slotId) => nextSelected.add(slotId));
      this.selectionInitialized = true;
    } else if (this.selectedSlots.size > 0 && nextSelected.size === 0 && available.size > 0) {
      available.forEach((slotId) => nextSelected.add(slotId));
    }

    this.selectedSlots = nextSelected;
  }

  syncAddAccountOptions(bindings: SlotBinding[]): void {
    if (!this.addAccountSelect) {
      return;
    }

    const options = this.buildAddTargetOptions(bindings);
    const previousValue = this.addAccountSelect.value;

    this.addAccountSelect.innerHTML = "";

    options.forEach((optionData) => {
      const option = document.createElement("option");
      option.value = optionData.accountId;
      option.textContent = optionData.label;
      this.addAccountSelect?.appendChild(option);
    });

    const hasPrevious = options.some((option) => option.accountId === previousValue);
    if (hasPrevious) {
      this.addAccountSelect.value = previousValue;
    }

    const disabled = options.length === 0;
    this.addAccountSelect.disabled = disabled;
    if (disabled) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = whisperUiT("whisper.noTargetOption");
      this.addAccountSelect.appendChild(option);
      this.addAccountSelect.value = "";
    }

    if (this.addButton) {
      this.addButton.disabled = disabled;
    }
  }

  isExpanded(): boolean {
    return this.contentEl?.classList.contains("is-expanded") ?? false;
  }

  setExpanded(expanded: boolean): void {
    if (!this.toggleEl || !this.contentEl) {
      return;
    }

    this.contentEl.classList.toggle("is-expanded", expanded);
    this.toggleEl.setAttribute("aria-expanded", String(expanded));
  }

  openPanel(shouldScrollIntoView = false): void {
    this.setExpanded(true);
    if (!shouldScrollIntoView || this.rootEl === null) {
      return;
    }

    if (document.documentElement.getAttribute("data-ui-mode") === "scene") {
      return;
    }

    this.rootEl.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }

  showFeedback(message: string, type: "success" | "error"): void {
    if (!this.feedbackEl) {
      return;
    }

    this.feedbackEl.textContent = message;
    this.feedbackEl.classList.remove("is-success", "is-error");
    this.feedbackEl.classList.add(type === "success" ? "is-success" : "is-error");

    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
    }

    this.feedbackTimer = setTimeout(() => {
      if (!this.feedbackEl) {
        return;
      }
      this.feedbackEl.textContent = "";
      this.feedbackEl.classList.remove("is-success", "is-error");
      this.feedbackTimer = null;
    }, 3500);
  }

  async handleAddWhisper(): Promise<void> {
    const accountId = (this.addAccountSelect?.value ?? "").trim();
    const text = (this.addTextInput?.value ?? "").trim();
    const when = (this.addWhenInput?.value ?? "").trim();

    if (accountId === "") {
      this.showFeedback(whisperT("feedback.accountRequired"), "error");
      return;
    }

    if (text === "") {
      this.showFeedback(whisperT("feedback.messageRequired"), "error");
      return;
    }

    try {
      await CoreEngine.whisper("add", {
        accountId,
        text,
        when: when === "" ? Date.now() : when,
      });

      if (this.addTextInput) {
        this.addTextInput.value = "";
      }

      this.showFeedback(whisperT("feedback.addSuccess"), "success");
      await this.render();
    } catch (error) {
      this.showFeedback(
        whisperT("feedback.addFailed", { message: getErrorMessage(error) }),
        "error"
      );
    }
  }

  async loadBuckets(): Promise<WhisperAccountBucket[]> {
    const bucketsRaw: unknown = await CoreEngine.whisper("accounts");
    return Array.isArray(bucketsRaw) ? (bucketsRaw as WhisperAccountBucket[]) : [];
  }

  renderSummary(selectedSlotCount: number, pendingCount: number, readyCount: number): void {
    this.selectedCountEl?.replaceChildren(
      document.createTextNode(whisperUiT("whisper.summarySelected", { count: selectedSlotCount }))
    );
    this.pendingCountEl?.replaceChildren(
      document.createTextNode(whisperUiT("whisper.summaryPending", { count: pendingCount }))
    );

    if (this.readyCountEl) {
      this.readyCountEl.textContent = whisperUiT("whisper.summaryReady", { count: readyCount });
      this.readyCountEl.classList.toggle("is-empty", readyCount === 0);
    }

    this.rootEl?.classList.toggle("has-ready-items", readyCount > 0);
  }

  renderSlotFilters(bindings: SlotBinding[]): void {
    if (!this.filtersEl) {
      return;
    }

    this.filtersEl.innerHTML = "";

    if (bindings.length === 0) {
      const empty = document.createElement("div");
      empty.className = "whisper-dock__empty-state";
      empty.textContent = whisperUiT("whisper.emptySlots");
      this.filtersEl.appendChild(empty);
      return;
    }

    bindings.forEach((binding) => {
      const label = document.createElement("label");
      label.className = "ds-choice-chip ds-choice-chip--segmented whisper-slot-chip";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = this.selectedSlots.has(binding.slotId);
      input.addEventListener("change", () => {
        if (input.checked) {
          this.selectedSlots.add(binding.slotId);
        } else {
          this.selectedSlots.delete(binding.slotId);
        }
        void this.render();
      });

      const slotTag = document.createElement("span");
      slotTag.className = "whisper-slot-chip__slot";
      slotTag.textContent = binding.slotLabel;

      const copy = document.createElement("span");
      copy.className = "whisper-slot-chip__copy";

      const title = document.createElement("strong");
      title.textContent = binding.accountLabel;

      const meta = document.createElement("small");
      meta.textContent = this.getAccountMeta(binding.account, binding.accountId);

      copy.appendChild(title);
      copy.appendChild(meta);

      label.appendChild(input);
      label.appendChild(slotTag);
      label.appendChild(copy);

      this.filtersEl?.appendChild(label);
    });
  }

  renderListEmptyState(
    listEl: HTMLElement,
    message: string,
    countEl: HTMLElement | null,
    count: number
  ): void {
    listEl.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "whisper-dock__empty-state";
    empty.textContent = message;
    listEl.appendChild(empty);
    if (countEl) {
      countEl.textContent = whisperUiT("whisper.sectionCount", { count });
    }
  }

  renderRecordList(
    listEl: HTMLElement | null,
    countEl: HTMLElement | null,
    records: WhisperRecord[],
    lane: "pending" | "done",
    summaries: Map<string, AccountSummary>,
    hasBindings: boolean,
    hasSelection: boolean
  ): void {
    if (!listEl) {
      return;
    }

    if (!hasBindings) {
      this.renderListEmptyState(listEl, whisperUiT("whisper.emptySlots"), countEl, 0);
      return;
    }

    if (!hasSelection) {
      this.renderListEmptyState(listEl, whisperUiT("whisper.emptySelection"), countEl, 0);
      return;
    }

    if (records.length === 0) {
      this.renderListEmptyState(
        listEl,
        whisperUiT(lane === "pending" ? "whisper.emptyPending" : "whisper.emptyDone"),
        countEl,
        0
      );
      return;
    }

    listEl.innerHTML = "";
    if (countEl) {
      countEl.textContent = whisperUiT("whisper.sectionCount", { count: records.length });
    }

    records.forEach((record) => {
      listEl.appendChild(this.renderRecordRow(record, lane, summaries));
    });
  }

  renderRecordRow(
    record: WhisperRecord,
    lane: "pending" | "done",
    summaries: Map<string, AccountSummary>
  ): HTMLElement {
    const row = document.createElement("article");
    row.className = "whisper-dock__record";

    const summary = summaries.get(record.accountId);
    const scheduledAt = lane === "pending" ? record.when : (record.doneAt ?? record.when);

    const header = document.createElement("div");
    header.className = "whisper-dock__record-head";

    const badges = document.createElement("div");
    badges.className = "whisper-dock__record-badges";

    const slotBadge = document.createElement("span");
    slotBadge.className = "badge badge-secondary whisper-dock__badge whisper-dock__badge--slot";
    slotBadge.textContent = summary?.slotSummary ?? record.accountId;

    const accountBadge = document.createElement("span");
    accountBadge.className = "badge whisper-dock__badge";
    accountBadge.textContent = summary?.accountLabel ?? record.accountId;

    badges.appendChild(slotBadge);
    badges.appendChild(accountBadge);

    const meta = document.createElement("span");
    meta.className = "whisper-dock__record-time";
    meta.textContent =
      scheduledAt !== undefined && scheduledAt !== 0 ? formatDateTime(scheduledAt) : "—";

    header.appendChild(badges);
    header.appendChild(meta);

    const text = document.createElement("p");
    text.className = "whisper-dock__record-text";
    text.textContent = record.text;

    const footer = document.createElement("div");
    footer.className = "whisper-dock__record-actions";

    const metaText = document.createElement("span");
    metaText.className = "whisper-dock__record-meta";
    metaText.textContent = summary?.accountMeta ?? record.accountId;

    const actionGroup = document.createElement("div");
    actionGroup.className = "whisper-dock__record-buttons";

    const editBtn = document.createElement("button");
    editBtn.className = "whisper-action-btn btn btn-xs btn-secondary";
    editBtn.type = "button";
    editBtn.textContent = whisperT("actions.edit");
    editBtn.addEventListener("click", () => {
      void this.handleUpdate(record.accountId, record, lane === "pending");
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "whisper-action-btn danger btn btn-xs btn-danger";
    deleteBtn.type = "button";
    deleteBtn.textContent = whisperT("actions.delete");
    deleteBtn.title = whisperUiT("whisper.deleteTitle");
    deleteBtn.addEventListener("click", () => {
      void this.handleDelete(record.accountId, record.id ?? "");
    });

    actionGroup.appendChild(editBtn);
    actionGroup.appendChild(deleteBtn);

    footer.appendChild(metaText);
    footer.appendChild(actionGroup);

    row.appendChild(header);
    row.appendChild(text);
    row.appendChild(footer);
    return row;
  }

  async handleDelete(accountId: string, whisperId: string): Promise<void> {
    if (whisperId === "") {
      return;
    }

    try {
      await CoreEngine.whisper("remove", { accountId, id: whisperId });
      this.showFeedback(whisperT("feedback.deleteSuccess"), "success");
      await this.render();
    } catch (error) {
      this.showFeedback(
        whisperT("feedback.deleteFailed", { message: getErrorMessage(error) }),
        "error"
      );
    }
  }

  async handleUpdate(accountId: string, record: WhisperRecord, isPending: boolean): Promise<void> {
    if (record.id === undefined || record.id === "") {
      return;
    }

    const nextTextRaw = window.prompt(whisperT("prompts.updateMessage"), record.text);
    if (nextTextRaw === null) {
      return;
    }

    const nextText = nextTextRaw.trim();
    if (nextText === "") {
      this.showFeedback(whisperT("feedback.messageRequired"), "error");
      return;
    }

    const currentWhen = isPending ? this.toDateTimeInputValue(record.when) : "";
    const nextWhenRaw = window.prompt(whisperT("prompts.updateTime"), currentWhen);
    if (nextWhenRaw === null) {
      return;
    }

    const patch: { text?: string; when?: unknown } = {};
    if (nextText !== record.text) {
      patch.text = nextText;
    }

    const nextWhen = nextWhenRaw.trim();
    if (nextWhen !== "" && nextWhen !== currentWhen) {
      patch.when = nextWhen;
    }

    if (patch.text === undefined && patch.when === undefined) {
      return;
    }

    try {
      await CoreEngine.whisper("update", {
        accountId,
        id: record.id,
        patch,
      });
      this.showFeedback(whisperT("feedback.updateSuccess"), "success");
      await this.render();
    } catch (error) {
      this.showFeedback(
        whisperT("feedback.updateFailed", { message: getErrorMessage(error) }),
        "error"
      );
    }
  }

  toDateTimeInputValue(ts: number | undefined): string {
    if (ts == null || ts === 0 || Number.isNaN(ts)) {
      return "";
    }

    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  async render(): Promise<void> {
    const hasRequiredElements =
      this.addAccountSelect &&
      this.pendingListEl &&
      this.doneListEl &&
      this.selectedCountEl &&
      this.pendingCountEl &&
      this.readyCountEl;

    if (!hasRequiredElements) {
      return;
    }

    const bindings = this.getSlotBindings();
    this.reconcileSelectedSlots(bindings);
    this.syncAddAccountOptions(bindings);
    this.renderSlotFilters(bindings);

    const summaries = this.buildAccountSummaryMap(bindings);
    const selectedAccountIds = this.getSelectedAccountIds(bindings);
    const selectedAccountSet = new Set(selectedAccountIds);
    const hasBindings = bindings.length > 0;
    const hasSelection = selectedAccountIds.length > 0;

    const buckets = await this.loadBuckets();
    const pendingRecords = buckets
      .flatMap((bucket) =>
        selectedAccountSet.has(bucket.accountId)
          ? bucket.pending.map((record) => ({
              ...record,
              accountId: bucket.accountId,
            }))
          : []
      )
      .slice()
      .sort(
        (left, right) =>
          (left.when ?? Number.MAX_SAFE_INTEGER) - (right.when ?? Number.MAX_SAFE_INTEGER)
      );

    const doneRecords = buckets
      .flatMap((bucket) =>
        selectedAccountSet.has(bucket.accountId)
          ? bucket.done.map((record) => ({
              ...record,
              accountId: bucket.accountId,
            }))
          : []
      )
      .slice()
      .sort((left, right) => (right.doneAt ?? right.when ?? 0) - (left.doneAt ?? left.when ?? 0));

    const readyCount = pendingRecords.filter((record) => (record.when ?? 0) <= Date.now()).length;

    this.renderSummary(this.selectedSlots.size, pendingRecords.length, readyCount);
    this.renderRecordList(
      this.pendingListEl,
      this.pendingMetaEl,
      pendingRecords,
      "pending",
      summaries,
      hasBindings,
      hasSelection
    );
    this.renderRecordList(
      this.doneListEl,
      this.doneMetaEl,
      doneRecords,
      "done",
      summaries,
      hasBindings,
      hasSelection
    );

    if (this.autoOpenPending && readyCount > 0) {
      this.setExpanded(true);
    }
    this.autoOpenPending = false;
  }
}

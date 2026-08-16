// NOTE: Opened from the Assistant page; uses memory-* IPC channels for shared memory.
import { AppI18n } from "../../modules/i18n/index.js";
import type { ManagedOverlayController } from "../../ui/overlay-system.js";
import { createSharedAssistantToolOverlayController } from "../../ui/overlay-presets.js";

interface MemoryItem {
  id: string;
  namespace: string;
  content: string;
  summary: string | null;
  sourceProvider: string | null;
  memoryType: string;
  importance: number;
  pinned: boolean;
  tags: string[];
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

interface MemoryStats {
  totalMemories: number;
  pinnedMemories: number;
  averageImportance: number;
  lastUpdatedAt: number | null;
}

const DEBOUNCE_MS = 300;

function memoryT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`shell.assistant.memoryOverlay.${key}`, params);
}

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, ms);
  }) as T;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const locale = AppI18n.getLocale() === "tr" ? "tr-TR" : "en-US";
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

function stars(n: number): string {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function optionalNonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed != null && trimmed !== "" ? trimmed : undefined;
}

function parseTags(value: string | null | undefined): string[] {
  if (value == null || value.trim() === "") return [];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

export class MemoryOverlay {
  private overlay: HTMLElement | null = null;
  private overlayController: ManagedOverlayController | null = null;
  private closeBtn: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private resultCount: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private emptyState: HTMLElement | null = null;
  private filterNamespace: HTMLSelectElement | null = null;
  private filterProvider: HTMLSelectElement | null = null;
  private tagCloud: HTMLElement | null = null;
  private statTotal: HTMLElement | null = null;
  private statPinned: HTMLElement | null = null;
  private statImportance: HTMLElement | null = null;
  private statUpdated: HTMLElement | null = null;

  private newContent: HTMLTextAreaElement | null = null;
  private newSummary: HTMLInputElement | null = null;
  private newTags: HTMLInputElement | null = null;
  private newNamespace: HTMLSelectElement | null = null;
  private newType: HTMLSelectElement | null = null;
  private newImportancePicker: HTMLElement | null = null;
  private newPinned: HTMLInputElement | null = null;
  private newSaveBtn: HTMLButtonElement | null = null;

  private pruneMaxInput: HTMLInputElement | null = null;
  private pruneDaysInput: HTMLInputElement | null = null;
  private pruneBtn: HTMLButtonElement | null = null;
  private deleteAllBtn: HTMLButtonElement | null = null;

  private _items: MemoryItem[] = [];
  private _activeTagFilter: Set<string> = new Set();
  private _newImportanceValue = 3;

  onLocaleChanged(): void {
    if (this.overlay?.classList.contains("is-hidden") !== false) {
      return;
    }
    void this._loadAndRender();
  }

  destroy(): void {
    this.overlayController?.destroy();
    this.overlayController = null;
    this.overlay = null;
    this.closeBtn = null;
    this.searchInput = null;
  }

  init(): void {
    this.overlay = document.getElementById("memory-overlay");
    if (this.overlay instanceof HTMLElement && this.overlayController === null) {
      this.overlayController = createSharedAssistantToolOverlayController({
        id: "memory-overlay",
        element: this.overlay,
      });
    }
    this.closeBtn = document.getElementById("memory-overlay-close");
    this.searchInput = document.getElementById("mem-search-input") as HTMLInputElement | null;
    this.resultCount = document.getElementById("mem-result-count");
    this.listEl = document.getElementById("memory-list");
    this.emptyState = document.getElementById("memory-empty-state");
    this.filterNamespace = document.getElementById(
      "mem-filter-namespace"
    ) as HTMLSelectElement | null;
    this.filterProvider = document.getElementById(
      "mem-filter-provider"
    ) as HTMLSelectElement | null;
    this.tagCloud = document.getElementById("mem-tag-cloud");
    this.statTotal = document.getElementById("mem-stat-total");
    this.statPinned = document.getElementById("mem-stat-pinned");
    this.statImportance = document.getElementById("mem-stat-importance");
    this.statUpdated = document.getElementById("mem-stat-updated");

    this.newContent = document.getElementById("mem-new-content") as HTMLTextAreaElement | null;
    this.newSummary = document.getElementById("mem-new-summary") as HTMLInputElement | null;
    this.newTags = document.getElementById("mem-new-tags") as HTMLInputElement | null;
    this.newNamespace = document.getElementById("mem-new-namespace") as HTMLSelectElement | null;
    this.newType = document.getElementById("mem-new-type") as HTMLSelectElement | null;
    this.newImportancePicker = document.getElementById("mem-new-importance");
    this.newPinned = document.getElementById("mem-new-pinned") as HTMLInputElement | null;
    this.newSaveBtn = document.getElementById("mem-new-save-btn") as HTMLButtonElement | null;

    this.pruneMaxInput = document.getElementById("mem-prune-max") as HTMLInputElement | null;
    this.pruneDaysInput = document.getElementById("mem-prune-days") as HTMLInputElement | null;
    this.pruneBtn = document.getElementById("mem-prune-btn") as HTMLButtonElement | null;
    this.deleteAllBtn = document.getElementById("mem-delete-all-btn") as HTMLButtonElement | null;

    this._setupEvents();
    this._setupImportancePicker(this.newImportancePicker, (v) => {
      this._newImportanceValue = v;
    });
  }

  private _setupEvents(): void {
    this.closeBtn?.addEventListener("click", () => {
      this.close();
    });
    this.overlay?.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.close();
    });

    const debouncedSearch = debounce(() => {
      void this._loadAndRender();
    }, DEBOUNCE_MS);

    this.searchInput?.addEventListener("input", debouncedSearch);
    this.filterNamespace?.addEventListener("change", () => void this._loadAndRender());
    this.filterProvider?.addEventListener("change", () => void this._loadAndRender());

    this.newSaveBtn?.addEventListener("click", () => void this._handleNewSave());
    this.pruneBtn?.addEventListener("click", () => void this._handlePrune());
    this.deleteAllBtn?.addEventListener("click", () => void this._handleDeleteAll());
  }

  private _setupImportancePicker(el: HTMLElement | null, onChange: (v: number) => void): void {
    if (!el) return;
    const spans = el.querySelectorAll("span[data-star]");
    const highlight = (val: number): void => {
      spans.forEach((s) => {
        const star = parseInt((s as HTMLElement).dataset["star"] ?? "0", 10);
        s.classList.toggle("is-active", star <= val);
      });
    };
    highlight(parseInt(el.dataset["value"] ?? "3", 10));
    spans.forEach((s) => {
      s.addEventListener("click", () => {
        const val = parseInt((s as HTMLElement).dataset["star"] ?? "3", 10);
        el.dataset["value"] = String(val);
        highlight(val);
        onChange(val);
      });
    });
  }

  open(): void {
    if (!this.overlay) return;
    this.overlayController?.open();
    void this._loadAndRender();
  }

  close(): void {
    this.overlayController?.close();
  }

  private async _loadAndRender(): Promise<void> {
    const api = window.electronAPI;
    if (!api) return;

    const query = optionalNonEmpty(this.searchInput?.value);
    const namespace = optionalNonEmpty(this.filterNamespace?.value);
    const sourceProvider = optionalNonEmpty(this.filterProvider?.value);
    const tags = this._activeTagFilter.size > 0 ? Array.from(this._activeTagFilter) : undefined;

    try {
      const [searchRes, statsRes] = await Promise.all([
        (
          api as unknown as {
            memorySearch: (p: unknown) => Promise<{
              success: boolean;
              data?: { items: MemoryItem[]; total: number };
              error?: string;
            }>;
          }
        ).memorySearch({ query, namespace, sourceProvider, tags, limit: 100 }),
        (
          api as unknown as {
            memoryStats: (
              p: unknown
            ) => Promise<{ success: boolean; data?: MemoryStats; error?: string }>;
          }
        ).memoryStats({ namespace }),
      ]);

      if (searchRes.success && searchRes.data) {
        this._items = searchRes.data.items;
        this._renderList(this._items);
        this._renderTagCloud(this._items);
        this._renderProviderFilter(this._items);
      }

      if (statsRes.success && statsRes.data) {
        this._renderStats(statsRes.data);
      }
    } catch (err) {
      console.error(
        memoryT("errors.loadFailed", {
          message: err instanceof Error ? err.message : String(err),
        }),
        err
      );
    }
  }

  private _renderStats(stats: MemoryStats): void {
    if (this.statTotal) {
      this.statTotal.textContent = memoryT("statsTotal", { count: stats.totalMemories });
    }
    if (this.statPinned) this.statPinned.textContent = `📌 ${stats.pinnedMemories}`;
    if (this.statImportance)
      this.statImportance.textContent = `⭐ ${stats.averageImportance.toFixed(1)}`;
    if (this.statUpdated && stats.lastUpdatedAt != null) {
      this.statUpdated.textContent = `🕒 ${formatDate(stats.lastUpdatedAt)}`;
    }
  }

  private _renderTagCloud(items: MemoryItem[]): void {
    if (!this.tagCloud) return;
    const tagCounts = new Map<string, number>();
    for (const item of items) {
      for (const tag of item.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }
    this.tagCloud.innerHTML = "";
    if (tagCounts.size === 0) {
      this.tagCloud.innerHTML = `<span class="memory-tag-empty">${memoryT("noTags")}</span>`;
      return;
    }
    const sorted = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
    for (const [tag, count] of sorted) {
      const chip = document.createElement("span");
      chip.className = "memory-tag-chip" + (this._activeTagFilter.has(tag) ? " is-active" : "");
      chip.textContent = `${tag} (${count})`;
      chip.addEventListener("click", () => {
        if (this._activeTagFilter.has(tag)) {
          this._activeTagFilter.delete(tag);
        } else {
          this._activeTagFilter.add(tag);
        }
        void this._loadAndRender();
      });
      this.tagCloud.appendChild(chip);
    }
  }

  private _renderProviderFilter(items: MemoryItem[]): void {
    if (!this.filterProvider) return;
    const currentVal = this.filterProvider.value;
    const providers = new Set<string>();
    for (const item of items) {
      const provider = optionalNonEmpty(item.sourceProvider);
      if (provider !== undefined) providers.add(provider);
    }
    const existingOptions = Array.from(this.filterProvider.options)
      .map((o) => o.value)
      .filter((v) => v !== "");
    const newProviders = Array.from(providers);
    const changed =
      newProviders.length !== existingOptions.length ||
      newProviders.some((p) => !existingOptions.includes(p));

    if (changed) {
      while (this.filterProvider.options.length > 1) {
        this.filterProvider.remove(1);
      }
      for (const p of newProviders.sort()) {
        const opt = document.createElement("option");
        opt.value = p;
        opt.textContent = p;
        this.filterProvider.appendChild(opt);
      }
      this.filterProvider.value = newProviders.includes(currentVal) ? currentVal : "";
    }
  }

  private _renderList(items: MemoryItem[]): void {
    if (!this.listEl) return;

    const cards = this.listEl.querySelectorAll(".memory-card");
    cards.forEach((c) => {
      c.remove();
    });

    if (this.resultCount) {
      this.resultCount.textContent =
        items.length > 0 ? memoryT("resultsCount", { count: items.length }) : "";
    }

    if (items.length === 0) {
      this.emptyState?.classList.remove("is-hidden");
      return;
    }

    this.emptyState?.classList.add("is-hidden");

    for (const item of items) {
      const card = this._buildCard(item);
      this.listEl.appendChild(card);
    }
  }

  private _buildCard(item: MemoryItem): HTMLElement {
    const card = document.createElement("div");
    card.className = "memory-card" + (item.pinned ? " pinned" : "");
    card.dataset["id"] = item.id;

    const tagsHtml = item.tags.map((t) => `<span class="memory-card-tag">${t}</span>`).join("");
    const sourceProvider = optionalNonEmpty(item.sourceProvider);
    const providerBadge =
      sourceProvider !== undefined
        ? `<span class="memory-card-provider">${sourceProvider}</span>`
        : "";
    const typeBadge = `<span class="memory-card-type">${item.memoryType}</span>`;
    const nsBadge = `<span class="memory-card-ns">${item.namespace}</span>`;
    const pinBadge = item.pinned ? '<span class="memory-card-pin">📌</span>' : "";
    const importanceTitle = memoryT("importanceTitle", { value: item.importance });
    const pinTitle = memoryT(item.pinned ? "unpinTitle" : "pinTitle");
    const editTitle = memoryT("editTitle");
    const deleteTitle = memoryT("deleteTitle");
    const expandLabel = memoryT("expandButton");
    const createdAtTitle = memoryT("createdAtTitle");
    const accessCountTitle = memoryT("accessCountTitle");
    const editSummaryPlaceholder = memoryT("editSummaryPlaceholder");
    const editTagsPlaceholder = memoryT("editTagsPlaceholder");
    const editCancelButton = AppI18n.t("shell.common.cancel");
    const editSaveButton = AppI18n.t("shell.common.save");

    card.innerHTML = `
      <div class="memory-card-header">
        <div class="memory-card-badges">
          ${pinBadge}${nsBadge}${typeBadge}${providerBadge}
        </div>
        <div class="memory-card-importance" title="${importanceTitle}">${stars(item.importance)}</div>
        <div class="memory-card-actions">
          <button class="memory-card-btn pin-btn btn btn-xs btn-ghost" title="${pinTitle}">${item.pinned ? "📍" : "📌"}</button>
          <button class="memory-card-btn edit-btn btn btn-xs btn-ghost" title="${editTitle}">✏️</button>
          <button class="memory-card-btn delete-btn btn btn-xs btn-ghost" title="${deleteTitle}">🗑️</button>
        </div>
      </div>
      <div class="memory-card-summary">${item.summary ?? ""}</div>
      <div class="memory-card-content is-collapsed" data-expanded="false">${item.content}</div>
      <div class="memory-card-expand-btn">▼ ${expandLabel}</div>
      <div class="memory-card-tags">${tagsHtml}</div>
      <div class="memory-card-meta">
        <span title="${createdAtTitle}">${formatDate(item.createdAt)}</span>
        <span title="${accessCountTitle}">👁️ ${item.accessCount}</span>
      </div>
      <div class="memory-card-edit-form is-hidden">
        <textarea class="memory-textarea input edit-content-input">${item.content}</textarea>
        <input class="memory-input input input-sm edit-summary-input" type="text" value="${item.summary ?? ""}" placeholder="${editSummaryPlaceholder}" />
        <input class="memory-input input input-sm edit-tags-input" type="text" value="${item.tags.join(", ")}" placeholder="${editTagsPlaceholder}" />
        <div class="memory-edit-row">
          <div class="memory-importance-picker edit-importance" data-value="${item.importance}">
            <span data-star="1">★</span><span data-star="2">★</span><span data-star="3">★</span><span data-star="4">★</span><span data-star="5">★</span>
          </div>
          <div class="memory-edit-actions">
            <button class="btn btn-sm btn-ghost edit-cancel-btn">${editCancelButton}</button>
            <button class="btn btn-sm btn-primary edit-save-btn">${editSaveButton}</button>
          </div>
        </div>
      </div>
    `;

    const contentEl = card.querySelector<HTMLElement>(".memory-card-content");
    const expandBtn = card.querySelector<HTMLElement>(".memory-card-expand-btn");
    if (contentEl && expandBtn) {
      expandBtn.addEventListener("click", () => {
        const expanded = contentEl.dataset["expanded"] === "true";
        contentEl.dataset["expanded"] = expanded ? "false" : "true";
        contentEl.classList.toggle("is-collapsed", expanded);
        expandBtn.textContent = expanded
          ? `▼ ${memoryT("expandButton")}`
          : `▲ ${memoryT("collapseButton")}`;
      });
    }

    const pinBtn = card.querySelector(".pin-btn");
    pinBtn?.addEventListener("click", () => void this._handlePin(item));

    const delBtn = card.querySelector(".delete-btn");
    delBtn?.addEventListener("click", () => void this._handleDelete(item.id));

    const editBtn = card.querySelector(".edit-btn");
    const editForm = card.querySelector<HTMLElement>(".memory-card-edit-form");
    const editCancelBtn = card.querySelector<HTMLElement>(".edit-cancel-btn");
    const editSaveBtn = card.querySelector<HTMLElement>(".edit-save-btn");
    const editImportancePicker = card.querySelector<HTMLElement>(".edit-importance");

    let editImportanceValue = item.importance;
    this._setupImportancePicker(editImportancePicker, (v) => {
      editImportanceValue = v;
    });
    if (editImportancePicker) {
      const spans = editImportancePicker.querySelectorAll("span[data-star]");
      spans.forEach((s) => {
        const star = parseInt((s as HTMLElement).dataset["star"] ?? "0", 10);
        s.classList.toggle("is-active", star <= item.importance);
      });
    }

    editBtn?.addEventListener("click", () => {
      editForm?.classList.toggle("is-hidden");
    });
    editCancelBtn?.addEventListener("click", () => {
      editForm?.classList.add("is-hidden");
    });
    editSaveBtn?.addEventListener("click", () => {
      const contentInput = card.querySelector<HTMLTextAreaElement>(".edit-content-input");
      const summaryInput = card.querySelector<HTMLInputElement>(".edit-summary-input");
      const tagsInput = card.querySelector<HTMLInputElement>(".edit-tags-input");

      const newContent = optionalNonEmpty(contentInput?.value);
      if (newContent === undefined) return;
      const newSummary = optionalNonEmpty(summaryInput?.value);
      const newTags = tagsInput != null ? parseTags(tagsInput.value) : undefined;

      void this._handleUpdate(item.id, {
        content: newContent,
        ...(newSummary !== undefined ? { summary: newSummary } : {}),
        importance: editImportanceValue,
        ...(newTags !== undefined ? { tags: newTags } : {}),
      });
    });

    return card;
  }

  private async _handlePin(item: MemoryItem): Promise<void> {
    const api = window.electronAPI as unknown as {
      memoryUpdate: (p: unknown) => Promise<{ success: boolean; error?: string }>;
    };
    try {
      await api.memoryUpdate({ id: item.id, pinned: !item.pinned });
      await this._loadAndRender();
    } catch (err) {
      console.error(
        memoryT("errors.pinFailed", {
          message: err instanceof Error ? err.message : String(err),
        }),
        err
      );
    }
  }

  private async _handleDelete(id: string): Promise<void> {
    if (!confirm(memoryT("deleteConfirm"))) return;
    const api = window.electronAPI as unknown as {
      memoryDelete: (p: unknown) => Promise<{ success: boolean; error?: string }>;
    };
    try {
      await api.memoryDelete({ id });
      await this._loadAndRender();
    } catch (err) {
      console.error(
        memoryT("errors.deleteFailed", {
          message: err instanceof Error ? err.message : String(err),
        }),
        err
      );
    }
  }

  private async _handleUpdate(
    id: string,
    params: { content?: string; summary?: string; importance?: number; tags?: string[] }
  ): Promise<void> {
    const api = window.electronAPI as unknown as {
      memoryUpdate: (p: unknown) => Promise<{ success: boolean; error?: string }>;
    };
    try {
      const payload: Record<string, unknown> = { id };
      if (params.content !== undefined) payload["content"] = params.content;
      if (params.summary !== undefined) payload["summary"] = params.summary;
      if (params.importance !== undefined) payload["importance"] = params.importance;
      if (params.tags !== undefined) payload["tags"] = params.tags;
      await api.memoryUpdate(payload);
      await this._loadAndRender();
    } catch (err) {
      console.error(
        memoryT("errors.updateFailed", {
          message: err instanceof Error ? err.message : String(err),
        }),
        err
      );
    }
  }

  private async _handleNewSave(): Promise<void> {
    const content = optionalNonEmpty(this.newContent?.value);
    if (content === undefined) {
      alert(memoryT("contentRequired"));
      return;
    }
    const api = window.electronAPI as unknown as {
      memoryWrite: (p: unknown) => Promise<{ success: boolean; error?: string }>;
    };
    try {
      const tags = parseTags(this.newTags?.value);

      await api.memoryWrite({
        content,
        summary: optionalNonEmpty(this.newSummary?.value),
        tags,
        namespace: optionalNonEmpty(this.newNamespace?.value) ?? "global",
        memoryType: optionalNonEmpty(this.newType?.value) ?? "note",
        importance: this._newImportanceValue,
        pinned: this.newPinned?.checked ?? false,
        sourceProvider: "app-ui",
      });

      if (this.newContent) this.newContent.value = "";
      if (this.newSummary) this.newSummary.value = "";
      if (this.newTags) this.newTags.value = "";
      if (this.newPinned) this.newPinned.checked = false;
      this._newImportanceValue = 3;
      if (this.newImportancePicker) {
        this.newImportancePicker.dataset["value"] = "3";
        this._setupImportancePicker(this.newImportancePicker, (v) => {
          this._newImportanceValue = v;
        });
      }

      await this._loadAndRender();
    } catch (err) {
      console.error(
        memoryT("errors.writeFailed", {
          message: err instanceof Error ? err.message : String(err),
        }),
        err
      );
    }
  }

  private async _handlePrune(): Promise<void> {
    const maxItems = parseInt(this.pruneMaxInput?.value ?? "50", 10);
    const olderThanDays = parseInt(this.pruneDaysInput?.value ?? "30", 10);
    const namespace = optionalNonEmpty(this.filterNamespace?.value);

    if (
      !confirm(
        memoryT("pruneConfirm", {
          maxItems,
          olderThanDays,
          namespace: namespace ?? "",
          namespaceSuffix: namespace !== undefined ? ` (${namespace})` : "",
        })
      )
    )
      return;

    const api = window.electronAPI as unknown as {
      memoryPrune: (p: unknown) => Promise<{ success: boolean; deleted?: number; error?: string }>;
    };
    try {
      const res = await api.memoryPrune({ namespace, maxItems, olderThanDays });
      if (res.success) {
        alert(memoryT("deletedSuccess", { count: res.deleted ?? 0 }));
        await this._loadAndRender();
      }
    } catch (err) {
      console.error(
        memoryT("errors.pruneFailed", {
          message: err instanceof Error ? err.message : String(err),
        }),
        err
      );
    }
  }

  private async _handleDeleteAll(): Promise<void> {
    const namespace = optionalNonEmpty(this.filterNamespace?.value);
    const label =
      namespace !== undefined
        ? memoryT("deleteAllNamespaceLabel", { namespace })
        : memoryT("deleteAllGlobalLabel");
    if (!confirm(memoryT("deleteAllConfirm", { label }))) return;
    if (!confirm(memoryT("deleteAllFinalConfirm", { label }))) return;

    const api = window.electronAPI as unknown as {
      memoryDeleteAll: (
        p: unknown
      ) => Promise<{ success: boolean; deleted?: number; error?: string }>;
    };
    try {
      const res = await api.memoryDeleteAll({ namespace });
      if (res.success) {
        alert(memoryT("deletedSuccess", { count: res.deleted ?? 0 }));
        await this._loadAndRender();
      }
    } catch (err) {
      console.error(
        memoryT("errors.deleteAllFailed", {
          message: err instanceof Error ? err.message : String(err),
        }),
        err
      );
    }
  }
}

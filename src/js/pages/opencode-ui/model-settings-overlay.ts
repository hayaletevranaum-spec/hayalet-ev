import { escapeHtml } from "./chat-utils.js";
import type { ByIdFn } from "./host-helpers.js";
import { getIntlLocale, t } from "./i18n.js";
import type { OpencodeUiModelPreferences, RuntimeState, SelectItem } from "./types.js";
import {
  patchOpencodeUiSharedState,
  readOpencodeUiSharedState,
} from "../../modules/opencode-ui-shared-state.js";
import {
  OVERLAY_GROUPS,
  OVERLAY_KINDS,
  type ManagedOverlayController,
} from "../../ui/overlay-system.js";
import { createSharedActiveClassOverlayController } from "../../ui/overlay-presets.js";

interface ModelSettingsOverlayOptions {
  runtime: RuntimeState;
  byId: ByIdFn;
  showToast: (message: string) => void;
  updateModelPreferences: (
    updater:
      | OpencodeUiModelPreferences
      | ((current: OpencodeUiModelPreferences) => OpencodeUiModelPreferences)
  ) => Promise<void>;
  selectActiveModelKey: (modelKey: string | null) => Promise<void>;
}

interface OverlayUiState {
  searchQuery: string;
  favoritesOnly: boolean;
  showHidden: boolean;
}

function renderSummary(runtime: RuntimeState): string {
  const hiddenProviderCount = runtime.modelPreferences.hiddenProviders.length;
  const hiddenModelCount = runtime.modelItems.filter((item) => item.isHidden === true).length;
  const passiveProviderCount = runtime.modelPreferences.disabledProviders.length;
  const passiveModelCount = runtime.modelItems.filter((item) => item.isPassive === true).length;
  const favoriteCount = runtime.modelPreferences.favoriteModels.length;
  const activeMeta =
    runtime.activeModelKey != null ? runtime.modelMetaByKey[runtime.activeModelKey] : undefined;
  const defaultMeta =
    runtime.modelPreferences.defaultModelKey != null
      ? runtime.modelMetaByKey[runtime.modelPreferences.defaultModelKey]
      : undefined;
  const activeLabel = activeMeta?.label ?? t("common.none");
  const defaultLabel = defaultMeta?.label ?? t("modelSettings.endpointFallback");

  return (
    `<span class="model-settings__chip model-settings__chip--active">${escapeHtml(t("modelSettings.chipCurrent", { value: activeLabel }))}</span>` +
    `<span class="model-settings__chip">${escapeHtml(t("modelSettings.chipDefault", { value: defaultLabel }))}</span>` +
    `<span class="model-settings__chip">${escapeHtml(t("modelSettings.chipFavorite", { count: favoriteCount }))}</span>` +
    `<span class="model-settings__chip">${escapeHtml(t("modelSettings.chipPassiveProvider", { count: passiveProviderCount }))}</span>` +
    `<span class="model-settings__chip">${escapeHtml(t("modelSettings.chipPassiveModel", { count: passiveModelCount }))}</span>` +
    `<span class="model-settings__chip">${escapeHtml(t("modelSettings.chipHiddenProvider", { count: hiddenProviderCount }))}</span>` +
    `<span class="model-settings__chip">${escapeHtml(t("modelSettings.chipHiddenModel", { count: hiddenModelCount }))}</span>`
  );
}

function renderProviderRows(runtime: RuntimeState): string {
  if (runtime.providerItems.length === 0) {
    return `<div class="ds-empty-state">${escapeHtml(t("modelSettings.providerMissing"))}</div>`;
  }

  return runtime.providerItems
    .map((provider) => {
      const hidden = provider.isHidden === true;
      const passive = provider.isPassive === true;
      const statusLabel =
        provider.isConnected === true ? t("provider.connected") : t("provider.available");
      const countLabel =
        typeof provider.visibleModels === "number" && typeof provider.totalModels === "number"
          ? `${String(provider.visibleModels)}/${String(provider.totalModels)}`
          : "0/0";
      const passiveLabel =
        typeof provider.passiveModels === "number" && provider.passiveModels > 0
          ? ` • ${escapeHtml(
              t("modelSettings.providerPassiveCount", { count: provider.passiveModels })
            )}`
          : "";

      return (
        `<div class="model-settings__provider-row${hidden ? " is-hidden" : ""}${passive ? " is-passive" : ""}">` +
        `<div class="model-settings__provider-meta">` +
        `<div class="model-settings__provider-name">${escapeHtml(provider.name)}</div>` +
        `<div class="model-settings__provider-subtitle">${escapeHtml(statusLabel)} • ${escapeHtml(
          countLabel
        )}${passiveLabel}</div>` +
        `</div>` +
        `<div class="model-settings__provider-actions">` +
        `<button type="button" class="model-settings__toggle-btn${passive ? " is-active" : ""}" data-provider-passive="${escapeHtml(
          provider.id
        )}" aria-pressed="${passive ? "true" : "false"}">${escapeHtml(
          passive ? t("modelSettings.providerPassive") : t("modelSettings.providerActive")
        )}</button>` +
        `<button type="button" class="model-settings__toggle-btn" data-provider-toggle="${escapeHtml(
          provider.id
        )}" aria-pressed="${hidden ? "true" : "false"}">${escapeHtml(
          hidden ? t("modelSettings.providerHidden") : t("modelSettings.providerVisible")
        )}</button>` +
        `</div>` +
        `</div>`
      );
    })
    .join("");
}

function filterModelItems(runtime: RuntimeState, ui: OverlayUiState): SelectItem[] {
  const intlLocale = getIntlLocale();
  const query = ui.searchQuery.trim().toLocaleLowerCase(intlLocale);

  return runtime.modelItems.filter((item) => {
    const label =
      `${item.label} ${item.subtitle ?? ""} ${item.providerName ?? item.providerId ?? ""}`
        .trim()
        .toLocaleLowerCase(intlLocale);
    if (query !== "" && !label.includes(query)) {
      return false;
    }
    if (ui.favoritesOnly && item.isFavorite !== true) {
      return false;
    }
    if (!ui.showHidden && item.isHidden === true) {
      return false;
    }
    return true;
  });
}

function renderModelRows(runtime: RuntimeState, ui: OverlayUiState): string {
  const items = filterModelItems(runtime, ui);
  if (items.length === 0) {
    return `<div class="ds-empty-state">${escapeHtml(t("modelSettings.filteredEmpty"))}</div>`;
  }

  const grouped = new Map<string, SelectItem[]>();
  items.forEach((item) => {
    const providerName = item.providerName ?? item.providerId ?? t("modelSettings.unknownProvider");
    const existing = grouped.get(providerName) ?? [];
    existing.push(item);
    grouped.set(providerName, existing);
  });

  return Array.from(grouped.entries())
    .map(([providerName, providerItems]) => {
      const rows = providerItems
        .map((item) => {
          const modelKey = item.modelKey ?? item.value;
          const isDefault = runtime.modelPreferences.defaultModelKey === modelKey;
          const isFavorite = item.isFavorite === true;
          const isHidden = item.isHidden === true;
          const isPassive = item.isPassive === true;
          const isActive = runtime.activeModelKey === modelKey;
          const isLastSelected = runtime.modelPreferences.lastSelectedModelKey === modelKey;
          const badges = [
            isActive
              ? `<span class="model-settings__badge model-settings__badge--active">${escapeHtml(t("modelSettings.badgeSelected"))}</span>`
              : "",
            isDefault
              ? `<span class="model-settings__badge model-settings__badge--default">${escapeHtml(t("modelSettings.badgeDefault"))}</span>`
              : "",
            isLastSelected
              ? `<span class="model-settings__badge">${escapeHtml(t("modelSettings.badgeLastUsed"))}</span>`
              : "",
            isPassive
              ? `<span class="model-settings__badge model-settings__badge--passive">${escapeHtml(t("modelSettings.badgePassive"))}</span>`
              : "",
            item.isConnected === true
              ? `<span class="model-settings__badge">${escapeHtml(t("modelSettings.badgeConnected"))}</span>`
              : `<span class="model-settings__badge">${escapeHtml(t("modelSettings.badgeAvailable"))}</span>`,
          ]
            .filter((item) => item !== "")
            .join("");

          return (
            `<div class="model-settings__model-row${isHidden ? " is-hidden" : ""}${isPassive ? " is-passive" : ""}">` +
            `<div class="model-settings__model-main">` +
            `<div class="model-settings__model-title">${escapeHtml(item.label)}</div>` +
            `<div class="model-settings__model-subtitle">${escapeHtml(item.subtitle ?? modelKey)}</div>` +
            `<div class="model-settings__badge-row">${badges}</div>` +
            `</div>` +
            `<div class="model-settings__model-actions">` +
            `<button type="button" class="model-settings__icon-btn${
              isFavorite ? " is-active" : ""
            }" data-model-favorite="${escapeHtml(modelKey)}" title="${escapeHtml(t("modelSettings.favoriteTitle"))}">${
              isFavorite ? "★" : "☆"
            }</button>` +
            `<button type="button" class="model-settings__action-btn model-settings__action-btn--primary${
              isActive ? " is-active" : ""
            }" data-model-select="${escapeHtml(modelKey)}">${escapeHtml(
              isActive ? t("modelSettings.activeSelected") : t("modelSettings.selectActive")
            )}</button>` +
            `<button type="button" class="model-settings__action-btn" data-model-default="${escapeHtml(
              modelKey
            )}">${escapeHtml(isDefault ? t("modelSettings.defaultActive") : t("modelSettings.setDefault"))}</button>` +
            `<button type="button" class="model-settings__action-btn${isPassive ? " is-active" : ""}" data-model-passive="${escapeHtml(
              modelKey
            )}">${escapeHtml(
              isPassive ? t("modelSettings.setAvailable") : t("modelSettings.setPassive")
            )}</button>` +
            `<button type="button" class="model-settings__action-btn" data-model-toggle="${escapeHtml(
              modelKey
            )}">${escapeHtml(isHidden ? t("modelSettings.show") : t("modelSettings.hide"))}</button>` +
            `</div>` +
            `</div>`
          );
        })
        .join("");

      return (
        `<section class="model-settings__group">` +
        `<div class="model-settings__group-title">${escapeHtml(providerName)}</div>` +
        rows +
        `</section>`
      );
    })
    .join("");
}

export function createModelSettingsOverlayController(options: ModelSettingsOverlayOptions): {
  init: () => void;
  refresh: () => void;
} {
  const ui: OverlayUiState = {
    searchQuery: "",
    favoritesOnly: false,
    showHidden: false,
  };
  let overlayController: ManagedOverlayController | null = null;
  let overlayStateHydration: Promise<void> | null = null;

  const persistUiState = async (): Promise<void> => {
    await patchOpencodeUiSharedState((current) => ({
      ...current,
      modelSettingsOverlay: {
        favoritesOnly: ui.favoritesOnly,
        showHidden: ui.showHidden,
      },
    }));
  };

  const hydrateUiState = async (): Promise<void> => {
    if (overlayStateHydration != null) {
      await overlayStateHydration;
      return;
    }

    overlayStateHydration = (async (): Promise<void> => {
      const sharedState = await readOpencodeUiSharedState();
      ui.favoritesOnly = sharedState.modelSettingsOverlay.favoritesOnly;
      ui.showHidden = sharedState.modelSettingsOverlay.showHidden;
    })().finally(() => {
      overlayStateHydration = null;
      refresh();
    });

    await overlayStateHydration;
  };

  const ensureOverlayController = (): ManagedOverlayController | null => {
    if (overlayController !== null) {
      return overlayController;
    }

    const modal = options.byId<HTMLElement>("model-settings-modal");
    if (!(modal instanceof HTMLElement)) {
      return null;
    }

    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }

    overlayController = createSharedActiveClassOverlayController({
      id: "opencode-ui-model-settings-modal",
      element: modal,
      kind: OVERLAY_KINDS.modal,
      group: OVERLAY_GROUPS.opencodeUi,
    });

    return overlayController;
  };

  const open = (): void => {
    const controller = ensureOverlayController();
    if (controller === null) {
      return;
    }
    controller.open();
    void hydrateUiState();
    refresh();
  };

  const close = (): void => {
    ensureOverlayController()?.close();
  };

  const refresh = (): void => {
    const summary = options.byId<HTMLElement>("model-settings-summary");
    if (summary != null) {
      summary.innerHTML = renderSummary(options.runtime);
    }

    const providerList = options.byId<HTMLElement>("model-settings-provider-list");
    if (providerList != null) {
      providerList.innerHTML = renderProviderRows(options.runtime);
    }

    const modelList = options.byId<HTMLElement>("model-settings-model-list");
    if (modelList != null) {
      modelList.innerHTML = renderModelRows(options.runtime, ui);
    }

    const searchInput = options.byId<HTMLInputElement>("model-settings-search");
    if (searchInput != null && searchInput.value !== ui.searchQuery) {
      searchInput.value = ui.searchQuery;
    }

    const favoritesOnly = options.byId<HTMLInputElement>("model-settings-favorites-only");
    if (favoritesOnly != null) {
      favoritesOnly.checked = ui.favoritesOnly;
    }

    const showHidden = options.byId<HTMLInputElement>("model-settings-show-hidden");
    if (showHidden != null) {
      showHidden.checked = ui.showHidden;
    }
  };

  const toggleProviderVisibility = async (providerId: string): Promise<void> => {
    await options.updateModelPreferences((current) => {
      const hiddenProviders = new Set(current.hiddenProviders);
      if (hiddenProviders.has(providerId)) {
        hiddenProviders.delete(providerId);
      } else {
        hiddenProviders.add(providerId);
      }

      return {
        ...current,
        hiddenProviders: Array.from(hiddenProviders).sort(),
      };
    });
    refresh();
  };

  const toggleProviderPassive = async (providerId: string): Promise<void> => {
    await options.updateModelPreferences((current) => {
      const disabledProviders = new Set(current.disabledProviders);
      if (disabledProviders.has(providerId)) {
        disabledProviders.delete(providerId);
      } else {
        disabledProviders.add(providerId);
      }

      return {
        ...current,
        disabledProviders: Array.from(disabledProviders).sort(),
      };
    });
    refresh();
  };

  const toggleModelFavorite = async (modelKey: string): Promise<void> => {
    await options.updateModelPreferences((current) => {
      const favorites = new Set(current.favoriteModels);
      if (favorites.has(modelKey)) {
        favorites.delete(modelKey);
      } else {
        favorites.add(modelKey);
      }

      return {
        ...current,
        favoriteModels: Array.from(favorites).sort(),
      };
    });
    refresh();
  };

  const toggleModelVisibility = async (modelKey: string): Promise<void> => {
    await options.updateModelPreferences((current) => {
      const hiddenModels = new Set(current.hiddenModels);
      if (hiddenModels.has(modelKey)) {
        hiddenModels.delete(modelKey);
      } else {
        hiddenModels.add(modelKey);
      }

      return {
        ...current,
        hiddenModels: Array.from(hiddenModels).sort(),
      };
    });
    refresh();
  };

  const toggleModelPassive = async (modelKey: string): Promise<void> => {
    await options.updateModelPreferences((current) => {
      const disabledModels = new Set(current.disabledModels);
      if (disabledModels.has(modelKey)) {
        disabledModels.delete(modelKey);
      } else {
        disabledModels.add(modelKey);
      }

      return {
        ...current,
        disabledModels: Array.from(disabledModels).sort(),
      };
    });
    refresh();
  };

  const setDefaultModel = async (modelKey: string): Promise<void> => {
    const meta = options.runtime.modelMetaByKey[modelKey];
    if (meta == null) {
      options.showToast(t("modelSettings.modelMissingToast"));
      return;
    }

    await options.updateModelPreferences((current) => ({
      ...current,
      hiddenProviders: current.hiddenProviders.filter((item) => item !== meta.providerId),
      hiddenModels: current.hiddenModels.filter((item) => item !== modelKey),
      disabledProviders: current.disabledProviders.filter((item) => item !== meta.providerId),
      disabledModels: current.disabledModels.filter((item) => item !== modelKey),
      defaultModelKey: modelKey,
    }));
    options.showToast(t("modelSettings.defaultUpdatedToast"));
    refresh();
  };

  const setActiveModel = async (modelKey: string): Promise<void> => {
    const meta = options.runtime.modelMetaByKey[modelKey];
    if (meta == null) {
      options.showToast(t("modelSettings.modelMissingToast"));
      return;
    }

    await options.updateModelPreferences((current) => ({
      ...current,
      hiddenProviders: current.hiddenProviders.filter((item) => item !== meta.providerId),
      hiddenModels: current.hiddenModels.filter((item) => item !== modelKey),
      disabledProviders: current.disabledProviders.filter((item) => item !== meta.providerId),
      disabledModels: current.disabledModels.filter((item) => item !== modelKey),
      lastSelectedModelKey: modelKey,
    }));
    await options.selectActiveModelKey(modelKey);
    options.showToast(t("modelSettings.activeUpdatedToast"));
    refresh();
  };

  const bindActionHandlers = (): void => {
    options.byId<HTMLButtonElement>("model-settings-btn")?.addEventListener("click", open);
    options.byId<HTMLButtonElement>("model-settings-close")?.addEventListener("click", close);
    options.byId<HTMLElement>("model-settings-backdrop")?.addEventListener("click", close);

    options.byId<HTMLInputElement>("model-settings-search")?.addEventListener("input", (event) => {
      ui.searchQuery = (event.target as HTMLInputElement).value;
      refresh();
    });

    options
      .byId<HTMLInputElement>("model-settings-favorites-only")
      ?.addEventListener("change", (event) => {
        ui.favoritesOnly = (event.target as HTMLInputElement).checked;
        void persistUiState();
        refresh();
      });

    options
      .byId<HTMLInputElement>("model-settings-show-hidden")
      ?.addEventListener("change", (event) => {
        ui.showHidden = (event.target as HTMLInputElement).checked;
        void persistUiState();
        refresh();
      });

    options
      .byId<HTMLElement>("model-settings-provider-list")
      ?.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        const providerId =
          target.closest<HTMLElement>("[data-provider-toggle]")?.dataset["providerToggle"];
        if (providerId != null && providerId !== "") {
          void toggleProviderVisibility(providerId);
          return;
        }

        const passiveProviderId =
          target.closest<HTMLElement>("[data-provider-passive]")?.dataset["providerPassive"];
        if (passiveProviderId != null && passiveProviderId !== "") {
          void toggleProviderPassive(passiveProviderId);
        }
      });

    options.byId<HTMLElement>("model-settings-model-list")?.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;

      const favoriteKey =
        target.closest<HTMLElement>("[data-model-favorite]")?.dataset["modelFavorite"];
      if (favoriteKey != null && favoriteKey !== "") {
        void toggleModelFavorite(favoriteKey);
        return;
      }

      const activeKey = target.closest<HTMLElement>("[data-model-select]")?.dataset["modelSelect"];
      if (activeKey != null && activeKey !== "") {
        void setActiveModel(activeKey);
        return;
      }

      const toggleKey = target.closest<HTMLElement>("[data-model-toggle]")?.dataset["modelToggle"];
      if (toggleKey != null && toggleKey !== "") {
        void toggleModelVisibility(toggleKey);
        return;
      }

      const passiveKey =
        target.closest<HTMLElement>("[data-model-passive]")?.dataset["modelPassive"];
      if (passiveKey != null && passiveKey !== "") {
        void toggleModelPassive(passiveKey);
        return;
      }

      const defaultKey =
        target.closest<HTMLElement>("[data-model-default]")?.dataset["modelDefault"];
      if (defaultKey != null && defaultKey !== "") {
        void setDefaultModel(defaultKey);
      }
    });
  };

  return {
    init(): void {
      ensureOverlayController();
      void hydrateUiState();
      bindActionHandlers();
      refresh();
    },
    refresh,
  };
}

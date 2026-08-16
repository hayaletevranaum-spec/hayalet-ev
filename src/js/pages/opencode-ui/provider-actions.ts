import { apiCall } from "./api.js";
import {
  loadOpencodeUiModelPreferences,
  saveOpencodeUiModelPreferences,
} from "./model-preferences.js";
import {
  applyModelPreferences,
  chooseActiveModelKey,
  enrichProviderItems,
  filterVisibleModelItems,
  getEndpointDefaultModelKeys,
  normalizeConnectedProviderIds,
  normalizeModelItems,
  normalizeProviderItemsFromConfig,
  renderProviderRows,
  sortModelItems,
  toReasoningEffortItems,
} from "./provider-catalog.js";
import { localeCompare, t } from "./i18n.js";
import type { CustomSelectAPI, OpencodeUiModelPreferences, RuntimeState } from "./types.js";

type ByIdFn = <T extends HTMLElement>(id: string, guard?: (element: T) => boolean) => T | null;

export interface ProviderContext {
  runtime: RuntimeState;
  byId: ByIdFn;
  modelDropdown: CustomSelectAPI | null;
  effortDropdown: CustomSelectAPI | null;
  onModelStateUpdated?: () => void;
}

const DEFAULT_VARIANT_ORDER = ["medium", "max", "high", "low", "xhigh", "minimal", "none"];

async function ensureModelPreferencesLoaded(context: ProviderContext): Promise<void> {
  const preferences = await loadOpencodeUiModelPreferences();
  context.runtime.modelPreferences = preferences;
}

function setSelectedModelLabel(context: ProviderContext, modelKey: string | null): void {
  const modelEl = context.byId<HTMLElement>("model");
  if (modelEl == null) {
    return;
  }

  if (modelKey == null || modelKey === "") {
    modelEl.textContent = "-";
    return;
  }

  const selectedMeta = context.runtime.modelMetaByKey[modelKey];
  modelEl.textContent = selectedMeta?.label ?? modelKey;
}

function applyModelState(context: ProviderContext): void {
  const preferredItems = applyModelPreferences(
    context.runtime.modelItems,
    context.runtime.modelPreferences,
    context.runtime.providerItems.filter((item) => item.isConnected === true).map((item) => item.id)
  );
  const visibleItems = sortModelItems(filterVisibleModelItems(preferredItems));

  context.runtime.modelItems = preferredItems;
  context.runtime.providerItems = enrichProviderItems(
    context.runtime.providerItems,
    preferredItems,
    context.runtime.modelPreferences,
    context.runtime.providerItems.filter((item) => item.isConnected === true).map((item) => item.id)
  );
  renderProvidersPanel(context, renderProviderRows(context.runtime.providerItems));

  if (context.modelDropdown == null) {
    return;
  }

  if (visibleItems.length === 0) {
    context.modelDropdown.setError(t("provider.none"));
    context.runtime.activeModelKey = null;
    context.runtime.activeReasoningEffort = null;
    refreshReasoningEffortDropdown(context);
    setSelectedModelLabel(context, null);
    context.onModelStateUpdated?.();
    return;
  }

  const selected = chooseActiveModelKey({
    currentModelKey: context.runtime.activeModelKey,
    preferences: context.runtime.modelPreferences,
    endpointDefaultModelKeys: context.runtime.endpointDefaultModelKeys,
    visibleItems,
  });

  context.runtime.activeModelKey = selected;
  context.modelDropdown.setItems(visibleItems, selected ?? undefined);
  refreshReasoningEffortDropdown(context);
  setSelectedModelLabel(context, selected);
  context.onModelStateUpdated?.();
}

export function refreshReasoningEffortDropdown(context: ProviderContext): void {
  if (context.effortDropdown == null) {
    return;
  }

  const items = toReasoningEffortItems(
    context.runtime.modelMetaByKey,
    context.runtime.activeModelKey
  );
  if (items.length === 0) {
    context.runtime.activeReasoningEffort = null;
    context.effortDropdown.setError(t("provider.none"));
    return;
  }

  const selected =
    context.runtime.activeReasoningEffort != null &&
    items.some((item) => item.value === context.runtime.activeReasoningEffort)
      ? context.runtime.activeReasoningEffort
      : ((): string | null => {
          for (const candidate of DEFAULT_VARIANT_ORDER) {
            const matched = items.find((item) => item.value === candidate);
            if (matched != null) {
              return matched.value;
            }
          }

          return items[0]?.value ?? null;
        })();

  context.runtime.activeReasoningEffort = selected;
  context.effortDropdown.setItems(items, selected ?? undefined);
}

export async function selectActiveModelKey(
  context: ProviderContext,
  modelKey: string | null,
  options: { persistSelection?: boolean } = {}
): Promise<void> {
  context.runtime.activeModelKey = modelKey != null && modelKey !== "" ? modelKey : null;
  refreshReasoningEffortDropdown(context);
  setSelectedModelLabel(context, context.runtime.activeModelKey);

  if (options.persistSelection === true) {
    context.runtime.modelPreferences = await saveOpencodeUiModelPreferences((current) => ({
      ...current,
      lastSelectedModelKey: context.runtime.activeModelKey,
    }));
    context.onModelStateUpdated?.();
  }
}

export async function updateModelPreferences(
  context: ProviderContext,
  updater:
    | OpencodeUiModelPreferences
    | ((current: OpencodeUiModelPreferences) => OpencodeUiModelPreferences)
): Promise<void> {
  context.runtime.modelPreferences = await saveOpencodeUiModelPreferences(updater);
  applyModelState(context);
}

export async function loadModels(
  context: ProviderContext,
  payloadOverride?: unknown,
  connectedProviderIds: string[] = [],
  providerItemsOverride?: ReturnType<typeof normalizeProviderItemsFromConfig>
): Promise<void> {
  if (context.modelDropdown == null) {
    return;
  }

  await ensureModelPreferencesLoaded(context);

  try {
    const payload = payloadOverride ?? (await apiCall<unknown>("GET", "/config/providers"));
    const modelItems = normalizeModelItems(payload);
    const providerItems = providerItemsOverride ?? normalizeProviderItemsFromConfig(payload);

    context.runtime.modelMetaByKey = {};
    modelItems.forEach((item) => {
      const modelKey = item.modelKey ?? item.value;
      const modelId = item.modelId ?? item.subtitle ?? "";
      context.runtime.modelMetaByKey[modelKey] = {
        modelId,
        modelKey,
        providerId: item.providerId ?? "",
        providerName: item.providerName ?? item.providerId ?? "",
        label: item.label,
        subtitle: item.subtitle ?? modelId,
        reasoningEfforts: item.reasoningEfforts ?? [],
        variantOptions: item.variantOptions ?? [],
      };
    });

    context.runtime.modelItems = modelItems;
    context.runtime.providerItems = enrichProviderItems(
      providerItems.map((item) => ({
        ...item,
        isConnected: connectedProviderIds.includes(item.id),
      })),
      modelItems,
      context.runtime.modelPreferences,
      connectedProviderIds
    );
    context.runtime.endpointDefaultModelKeys = getEndpointDefaultModelKeys(payload);

    applyModelState(context);
  } catch {
    context.modelDropdown.setError(t("provider.error"));
    context.runtime.activeModelKey = null;
    context.runtime.activeReasoningEffort = null;
    context.runtime.modelMetaByKey = {};
    context.runtime.modelItems = [];
    context.runtime.providerItems = [];
    context.runtime.endpointDefaultModelKeys = [];
    refreshReasoningEffortDropdown(context);
    context.onModelStateUpdated?.();
  }
}

function renderProvidersPanel(context: ProviderContext, markup: string): void {
  const listEl = context.byId<HTMLElement>("providers-list");
  if (listEl == null) {
    return;
  }

  listEl.innerHTML = markup;
}

export async function loadProviderContextAndModels(
  context: ProviderContext,
  providerPayloadOverride?: unknown,
  configPayloadOverride?: unknown
): Promise<void> {
  try {
    const providerPayload =
      providerPayloadOverride ?? (await apiCall<Record<string, unknown>>("GET", "/provider"));
    const configPayload =
      configPayloadOverride ?? (await apiCall<Record<string, unknown>>("GET", "/config/providers"));

    const connectedIds = normalizeConnectedProviderIds(providerPayload);
    const catalog = normalizeProviderItemsFromConfig(configPayload);
    const connectedSet = new Set(connectedIds);
    const items = catalog
      .map((item) => ({
        ...item,
        badge: connectedSet.has(item.id) ? t("provider.connected") : t("provider.available"),
        isConnected: connectedSet.has(item.id),
      }))
      .sort((left, right) => {
        if (left.badge !== right.badge) {
          return left.badge === t("provider.connected") ? -1 : 1;
        }
        return localeCompare(left.name, right.name);
      });

    renderProvidersPanel(context, renderProviderRows(items));
    await loadModels(context, configPayload, connectedIds, items);
  } catch {
    renderProvidersPanel(context, renderProviderRows([]));
    await loadModels(context, configPayloadOverride);
  }
}

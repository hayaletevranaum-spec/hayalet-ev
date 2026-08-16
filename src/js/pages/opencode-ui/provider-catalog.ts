import { escapeHtml } from "./chat-utils.js";
import { localeCompare, t } from "./i18n.js";
import type {
  ModelMeta,
  ModelVariantOption,
  OpencodeUiModelPreferences,
  ProviderItem,
  SelectItem,
} from "./types.js";
import { normalizeString } from "./message-content.js";

const MODEL_VARIANT_ORDER = ["none", "minimal", "low", "medium", "high", "max", "xhigh"];

export function toModelKey(providerId: string, modelId: string): string {
  return providerId !== "" ? `${providerId}:${modelId}` : modelId;
}

function normalizeReasoningEfforts(raw: unknown): string[] {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }

  const values = Object.keys(raw)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => MODEL_VARIANT_ORDER.includes(item));

  if (values.length === 0) {
    return [];
  }

  const unique = Array.from(new Set(values));
  return MODEL_VARIANT_ORDER.filter((item) => unique.includes(item));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function formatVariantSubtitle(options: Record<string, unknown>): string {
  const reasoningEffort = normalizeString(options["reasoningEffort"]).trim();
  if (reasoningEffort !== "") {
    return `reasoning:${reasoningEffort}`;
  }

  const thinkingLevel = normalizeString(options["thinkingLevel"]).trim();
  if (thinkingLevel !== "") {
    return `thinking:${thinkingLevel}`;
  }

  const thinkingConfig = asRecord(options["thinkingConfig"]);
  const thinkingBudget = Number(thinkingConfig?.["thinkingBudget"] ?? 0);
  if (Number.isFinite(thinkingBudget) && thinkingBudget > 0) {
    return `budget:${String(thinkingBudget)}`;
  }

  const textVerbosity = normalizeString(options["textVerbosity"]).trim();
  if (textVerbosity !== "") {
    return `verbosity:${textVerbosity}`;
  }

  return "";
}

function normalizeModelVariants(raw: unknown): ModelVariantOption[] {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }

  const variants: ModelVariantOption[] = [];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalizedKey = key.trim().toLowerCase();
    if (normalizedKey === "") {
      continue;
    }

    const options = asRecord(value) ?? {};
    const subtitle = formatVariantSubtitle(options);
    variants.push({
      key: normalizedKey,
      label: normalizedKey,
      ...(subtitle !== "" ? { subtitle } : {}),
      options,
    });
  }

  if (variants.length <= 1) {
    return variants;
  }

  return variants.sort((left, right) => {
    const leftIndex = MODEL_VARIANT_ORDER.indexOf(left.key);
    const rightIndex = MODEL_VARIANT_ORDER.indexOf(right.key);
    const normalizedLeft = leftIndex >= 0 ? leftIndex : MODEL_VARIANT_ORDER.length;
    const normalizedRight = rightIndex >= 0 ? rightIndex : MODEL_VARIANT_ORDER.length;

    if (normalizedLeft !== normalizedRight) {
      return normalizedLeft - normalizedRight;
    }

    return left.key.localeCompare(right.key, "en");
  });
}

function extractModelMeta(modelRecord: Record<string, unknown>, providerId: string): ModelMeta {
  const idFromId = normalizeString(modelRecord["id"]);
  const idFromModel = normalizeString(modelRecord["model"]);
  const idFromModelId = normalizeString(modelRecord["modelID"]);
  const modelId = idFromId !== "" ? idFromId : idFromModel !== "" ? idFromModel : idFromModelId;
  const providerName = normalizeString(modelRecord["providerName"]);
  const rawModelName = normalizeString(modelRecord["name"]);
  const modelName = rawModelName !== "" ? rawModelName : modelId;
  const variants = modelRecord["variants"];
  const variantOptions = normalizeModelVariants(variants);
  const reasoningEfforts = normalizeReasoningEfforts(variants);
  return {
    modelId,
    modelKey: toModelKey(providerId, modelId),
    providerId,
    providerName,
    label: providerId !== "" ? `${providerId}:${modelName}` : modelName,
    subtitle: modelId,
    reasoningEfforts,
    variantOptions,
  };
}

export function toReasoningEffortItems(
  modelMetaByKey: Record<string, ModelMeta>,
  modelKey: string | null
): SelectItem[] {
  if (modelKey == null || modelKey === "") {
    return [];
  }

  const meta = modelMetaByKey[modelKey];
  if (meta == null) {
    return [];
  }

  if (meta.variantOptions.length > 0) {
    return meta.variantOptions.map((variant) => {
      const subtitle = variant.subtitle ?? meta.modelId;
      return {
        value: variant.key,
        label: variant.label,
        ...(subtitle !== "" ? { subtitle } : {}),
      };
    });
  }

  return meta.reasoningEfforts.map((effort) => ({
    value: effort,
    label: effort,
    subtitle: meta.modelId,
  }));
}

export function normalizeAgentItems(data: unknown): SelectItem[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => {
      if (typeof item === "string") {
        return { value: item, label: item };
      }

      if (item != null && typeof item === "object" && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        const idValue = normalizeString(record["id"]);
        const nameValue = normalizeString(record["name"]);
        const value = idValue !== "" ? idValue : nameValue;
        if (value === "") return null;
        return {
          value,
          label: nameValue !== "" ? nameValue : value,
          subtitle: normalizeString(record["description"]),
        };
      }

      return null;
    })
    .filter((item): item is SelectItem => item != null && item.value !== "");
}

export function normalizeModelItems(payload: unknown): SelectItem[] {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const providers = Array.isArray(record["providers"]) ? record["providers"] : [];
  const items: SelectItem[] = [];

  providers.forEach((provider) => {
    if (provider == null || typeof provider !== "object" || Array.isArray(provider)) {
      return;
    }

    const providerRecord = provider as Record<string, unknown>;
    const providerId = normalizeString(providerRecord["id"]);
    const rawProviderName = normalizeString(providerRecord["name"]);
    const providerName = rawProviderName !== "" ? rawProviderName : providerId;
    const modelsRaw = providerRecord["models"];
    const models = Array.isArray(modelsRaw)
      ? modelsRaw
      : modelsRaw != null && typeof modelsRaw === "object"
        ? Object.values(modelsRaw as Record<string, unknown>)
        : [];

    models.forEach((model) => {
      if (typeof model === "string") {
        const modelKey = toModelKey(providerId, model);
        const label = providerId !== "" ? `${providerId}:${model}` : model;
        items.push({
          value: modelKey,
          label,
          subtitle: model,
          providerId,
          providerName,
          modelId: model,
          modelKey,
          reasoningEfforts: [],
          variantOptions: [],
        });
        return;
      }

      if (model != null && typeof model === "object" && !Array.isArray(model)) {
        const modelRecord = model as Record<string, unknown>;
        const directModelId = normalizeString(modelRecord["id"]);
        const legacyModelId = normalizeString(modelRecord["model"]);
        const altModelId = normalizeString(modelRecord["modelID"]);
        const modelId =
          directModelId !== "" ? directModelId : legacyModelId !== "" ? legacyModelId : altModelId;
        if (modelId === "") {
          return;
        }

        modelRecord["providerName"] = providerName;
        const rawModelName = normalizeString(modelRecord["name"]);
        const modelName = rawModelName !== "" ? rawModelName : modelId;
        const label = providerId !== "" ? `${providerId}:${modelName}` : modelName;
        const modelMeta = extractModelMeta(modelRecord, providerId);
        items.push({
          value: modelMeta.modelKey,
          label,
          subtitle: modelId,
          providerId: modelMeta.providerId,
          providerName,
          modelId,
          modelKey: modelMeta.modelKey,
          reasoningEfforts: modelMeta.reasoningEfforts,
          variantOptions: modelMeta.variantOptions,
        });
      }
    });
  });

  const deduped = new Map<string, SelectItem>();
  items.forEach((item) => {
    if (!deduped.has(item.value)) {
      deduped.set(item.value, item);
    }
  });

  return Array.from(deduped.values());
}

export function getEndpointDefaultModelKeys(payload: unknown): string[] {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }

  const defaultMap = (payload as Record<string, unknown>)["default"];
  if (defaultMap == null || typeof defaultMap !== "object" || Array.isArray(defaultMap)) {
    return [];
  }

  return Object.entries(defaultMap as Record<string, unknown>)
    .map(([providerId, modelId]) => {
      const normalizedProviderId = providerId.trim();
      const normalizedModelId = typeof modelId === "string" ? modelId.trim() : "";
      return normalizedProviderId !== "" && normalizedModelId !== ""
        ? toModelKey(normalizedProviderId, normalizedModelId)
        : "";
    })
    .filter((item) => item !== "");
}

export function applyModelPreferences(
  items: SelectItem[],
  preferences: OpencodeUiModelPreferences,
  connectedProviderIds: string[]
): SelectItem[] {
  const hiddenProviders = new Set(preferences.hiddenProviders);
  const hiddenModels = new Set(preferences.hiddenModels);
  const disabledProviders = new Set(preferences.disabledProviders);
  const disabledModels = new Set(preferences.disabledModels);
  const favoriteModels = new Set(preferences.favoriteModels);
  const connectedProviders = new Set(connectedProviderIds);

  return items.map((item) => {
    const providerId = item.providerId ?? "";
    const modelKey = item.modelKey ?? item.value;
    const providerHidden = providerId !== "" && hiddenProviders.has(providerId);
    const modelHidden = modelKey !== "" && hiddenModels.has(modelKey);
    const providerPassive = providerId !== "" && disabledProviders.has(providerId);
    const modelPassive = modelKey !== "" && disabledModels.has(modelKey);

    return {
      ...item,
      isConnected: providerId !== "" && connectedProviders.has(providerId),
      isFavorite: modelKey !== "" && favoriteModels.has(modelKey),
      isHidden: providerHidden || modelHidden,
      isPassive: providerPassive || modelPassive,
    };
  });
}

export function filterVisibleModelItems(items: SelectItem[]): SelectItem[] {
  return items.filter((item) => item.isHidden !== true && item.isPassive !== true);
}

export function sortModelItems(items: SelectItem[]): SelectItem[] {
  return [...items].sort((left, right) => {
    if ((left.isFavorite === true) !== (right.isFavorite === true)) {
      return left.isFavorite === true ? -1 : 1;
    }
    if ((left.isConnected === true) !== (right.isConnected === true)) {
      return left.isConnected === true ? -1 : 1;
    }
    const providerCompare = localeCompare(
      left.providerName ?? left.providerId ?? "",
      right.providerName ?? right.providerId ?? ""
    );
    if (providerCompare !== 0) {
      return providerCompare;
    }
    return localeCompare(left.label, right.label);
  });
}

export function chooseActiveModelKey(options: {
  currentModelKey: string | null;
  preferences: OpencodeUiModelPreferences;
  endpointDefaultModelKeys: string[];
  visibleItems: SelectItem[];
}): string | null {
  const { currentModelKey, preferences, endpointDefaultModelKeys, visibleItems } = options;
  if (visibleItems.length === 0) {
    return null;
  }

  const visibleKeys = new Set(
    visibleItems.map((item) => item.modelKey ?? item.value).filter((item) => item !== "")
  );

  const candidates = [
    currentModelKey,
    preferences.lastSelectedModelKey,
    preferences.defaultModelKey,
    ...endpointDefaultModelKeys,
    visibleItems[0]?.modelKey ?? visibleItems[0]?.value ?? null,
  ];

  for (const candidate of candidates) {
    if (candidate != null && candidate !== "" && visibleKeys.has(candidate)) {
      return candidate;
    }
  }

  return visibleItems[0]?.modelKey ?? visibleItems[0]?.value ?? null;
}

export function enrichProviderItems(
  providers: ProviderItem[],
  items: SelectItem[],
  preferences: OpencodeUiModelPreferences,
  connectedProviderIds: string[]
): ProviderItem[] {
  const hiddenProviders = new Set(preferences.hiddenProviders);
  const disabledProviders = new Set(preferences.disabledProviders);
  const connectedSet = new Set(connectedProviderIds);

  return providers.map((provider) => {
    const providerModels = items.filter((item) => item.providerId === provider.id);
    const visibleModels = providerModels.filter(
      (item) => item.isHidden !== true && item.isPassive !== true
    );
    const passiveModels = providerModels.filter((item) => item.isPassive === true).length;

    return {
      ...provider,
      isConnected: connectedSet.has(provider.id),
      isHidden: hiddenProviders.has(provider.id),
      isPassive: disabledProviders.has(provider.id),
      totalModels: providerModels.length,
      visibleModels: visibleModels.length,
      passiveModels,
    };
  });
}

export function normalizeProviderItemsFromConfig(payload: unknown): ProviderItem[] {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }

  const providersRaw = (payload as Record<string, unknown>)["providers"];
  if (!Array.isArray(providersRaw)) {
    return [];
  }

  const deduped = new Map<string, ProviderItem>();

  providersRaw.forEach((provider) => {
    if (provider == null || typeof provider !== "object" || Array.isArray(provider)) {
      return;
    }

    const record = provider as Record<string, unknown>;
    const id = normalizeString(record["id"]);
    if (id === "") {
      return;
    }

    const name = normalizeString(record["name"]);
    const type = normalizeString(record["type"]);
    const badge = type !== "" ? type : "Config";

    deduped.set(id, {
      id,
      name: name !== "" ? name : id,
      badge,
    });
  });

  return Array.from(deduped.values());
}

export function normalizeConnectedProviderIds(payload: unknown): string[] {
  const collectStringArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .map((item) => {
            if (typeof item === "string") {
              return item.trim();
            }

            if (item != null && typeof item === "object" && !Array.isArray(item)) {
              const record = item as Record<string, unknown>;
              const id = normalizeString(record["id"]);
              const name = normalizeString(record["name"]);
              return id !== "" ? id : name;
            }

            return "";
          })
          .filter((item) => item !== "")
      : [];

  if (Array.isArray(payload)) {
    return Array.from(new Set(collectStringArray(payload)));
  }

  if (payload == null || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const connected = collectStringArray(record["connected"]);
  if (connected.length > 0) {
    return Array.from(new Set(connected));
  }

  const providers = record["providers"];
  if (Array.isArray(providers)) {
    const activeIds = providers
      .map((item) => {
        if (item == null || typeof item !== "object" || Array.isArray(item)) {
          return "";
        }

        const providerRecord = item as Record<string, unknown>;
        const connectedValue = providerRecord["connected"];
        const activeValue = providerRecord["active"];
        if (connectedValue === true || activeValue === true) {
          const id = normalizeString(providerRecord["id"]);
          const name = normalizeString(providerRecord["name"]);
          return id !== "" ? id : name;
        }

        return "";
      })
      .filter((item) => item !== "");

    if (activeIds.length > 0) {
      return Array.from(new Set(activeIds));
    }
  }

  return [];
}

export function renderProviderRows(items: ProviderItem[]): string {
  if (items.length === 0) {
    return `<div class="ds-empty-state">${escapeHtml(t("modelSettings.providerMissing"))}</div>`;
  }

  return items
    .map((item) => {
      const safeName = escapeHtml(item.name);
      const safeBadge = escapeHtml(item.badge);

      return (
        `<div class="ds-provider-row">` +
        `<span class="ds-provider-name">${safeName}</span>` +
        (safeBadge !== "" ? `<span class="ds-provider-badge">${safeBadge}</span>` : "") +
        `</div>`
      );
    })
    .join("");
}

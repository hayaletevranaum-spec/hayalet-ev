type LaboratoryRecord = Record<string, unknown>;

type LaboratoryVisualRuntimeRecord = LaboratoryRecord & {
  toolState?: unknown;
  visualAnalysisCapabilities?: unknown;
  visualAnalysisCatalog?: unknown;
  visualAnalysisProviders?: unknown;
};

type LaboratoryProjectRecord = LaboratoryRecord & {
  workbench?: unknown;
};

type LaboratoryToolStateEntryRecord = LaboratoryRecord & {
  installed?: unknown;
};

type LaboratoryVisualCatalogRecord = LaboratoryRecord & {
  modules?: unknown;
};

type LaboratoryVisualCatalogEntryRecord = LaboratoryRecord & {
  id?: unknown;
  phase?: unknown;
  providerIds?: unknown;
  optionalToolIds?: unknown;
  sourceKinds?: unknown;
  status?: unknown;
  requiredToolIds?: unknown;
  summaryKey?: unknown;
  titleKey?: unknown;
  toolIds?: unknown;
};

type LaboratoryVisualProviderCollectionRecord = LaboratoryRecord & {
  providers?: unknown;
};

type LaboratoryVisualProviderRecord = LaboratoryRecord & {
  expectedArtifacts?: unknown;
  fallbackProviderIds?: unknown;
  id?: unknown;
  installStrategy?: unknown;
  moduleIds?: unknown;
  providerType?: unknown;
  status?: unknown;
  summaryKey?: unknown;
  titleKey?: unknown;
  toolId?: unknown;
};

type VisualAnalysisRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryVisualAnalysisRuntime(deps: VisualAnalysisRuntimeDeps) {
  const { asNonEmptyString, toRecord } = deps;

  function toRuntimeRecord(value: unknown): LaboratoryVisualRuntimeRecord {
    return toRecord(value);
  }

  function toProjectRecord(value: unknown): LaboratoryProjectRecord {
    return toRecord(value);
  }

  function toToolStateEntryRecord(value: unknown): LaboratoryToolStateEntryRecord {
    return toRecord(value);
  }

  function toCatalogRecord(value: unknown): LaboratoryVisualCatalogRecord {
    return toRecord(value);
  }

  function toCatalogEntryRecord(value: unknown): LaboratoryVisualCatalogEntryRecord {
    return toRecord(value);
  }

  function toProviderCollectionRecord(value: unknown): LaboratoryVisualProviderCollectionRecord {
    return toRecord(value);
  }

  function toProviderRecord(value: unknown): LaboratoryVisualProviderRecord {
    return toRecord(value);
  }

  function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map(function (entry) {
        return asNonEmptyString(entry);
      })
      .filter((entry): entry is string => entry !== null);
  }

  function getVisualAnalysisCapabilities(runtime: LaboratoryVisualRuntimeRecord) {
    return toRecord(toRuntimeRecord(runtime).visualAnalysisCapabilities);
  }

  function getVisualAnalysisCatalog(runtime: LaboratoryVisualRuntimeRecord) {
    return toCatalogRecord(toRuntimeRecord(runtime).visualAnalysisCatalog);
  }

  function getVisualAnalysisProviders(runtime: LaboratoryVisualRuntimeRecord) {
    return toProviderCollectionRecord(toRuntimeRecord(runtime).visualAnalysisProviders);
  }

  function getVisualAnalysisModulesForRuntime(
    runtime: LaboratoryVisualRuntimeRecord,
    sourceKind: string | null = null
  ): LaboratoryVisualCatalogEntryRecord[] {
    const catalog = getVisualAnalysisCatalog(runtime);
    const entries = Array.isArray(catalog.modules) ? catalog.modules.map(toCatalogEntryRecord) : [];
    if (sourceKind === null) {
      return entries;
    }
    return entries.filter(function (entry) {
      const sourceKinds = toStringArray(entry.sourceKinds);
      return sourceKinds.length === 0 || sourceKinds.includes(sourceKind);
    });
  }

  function getVisualAnalysisProviderEntries(
    runtime: LaboratoryVisualRuntimeRecord
  ): LaboratoryVisualProviderRecord[] {
    const providers = getVisualAnalysisProviders(runtime).providers;
    return Array.isArray(providers) ? providers.map(toProviderRecord) : [];
  }

  function getToolInstalled(
    runtime: LaboratoryVisualRuntimeRecord,
    toolId: string | null
  ): boolean {
    if (toolId === null) {
      return false;
    }
    const tools = toRecord(toRecord(toRecord(runtime["toolState"])["tools"])[toolId]);
    return toToolStateEntryRecord(tools).installed === true;
  }

  function buildVisualAnalysisProviderState(runtime: LaboratoryVisualRuntimeRecord) {
    const providerState: Record<string, LaboratoryRecord> = {};

    getVisualAnalysisProviderEntries(runtime).forEach(function (provider) {
      const providerId = asNonEmptyString(provider.id) || "visual-provider";
      const providerStatus = asNonEmptyString(provider.status) || "planned";
      const toolId = asNonEmptyString(provider.toolId);
      const installed = getToolInstalled(runtime, toolId);
      const planned = providerStatus === "planned";
      const toolReady = planned ? false : toolId ? installed : providerStatus === "ready";
      const capabilityReady = planned ? false : toolReady;
      providerState[providerId] = {
        providerId,
        status: planned ? "planned" : capabilityReady ? "ready" : "blocked",
        ready: capabilityReady,
        toolReady,
        capabilityReady,
        toolId,
        moduleIds: toStringArray(provider.moduleIds),
        providerType: asNonEmptyString(provider.providerType),
        installStrategy: asNonEmptyString(provider.installStrategy),
        expectedArtifacts: toStringArray(provider.expectedArtifacts),
        fallbackProviderIds: toStringArray(provider.fallbackProviderIds),
        titleKey: asNonEmptyString(provider.titleKey),
        summaryKey: asNonEmptyString(provider.summaryKey),
        blockers:
          planned || capabilityReady
            ? []
            : [`Install ${toolId || "the required runtime"} before enabling this visual provider.`],
        warnings: planned
          ? ["This provider stays reserved for a later visual-analysis rollout."]
          : [],
      };
    });

    return providerState;
  }

  function buildVisualAnalysisCapabilityState(
    runtime: LaboratoryVisualRuntimeRecord,
    sourceKind: string | null
  ) {
    const providerState = buildVisualAnalysisProviderState(runtime);
    const capabilityState: Record<string, LaboratoryRecord> = {};

    getVisualAnalysisModulesForRuntime(runtime).forEach(function (entry) {
      const moduleId = asNonEmptyString(entry.id) || "visual-module";
      const moduleStatus = asNonEmptyString(entry.status) || "planned";
      const sourceKinds = toStringArray(entry.sourceKinds);
      const providerIds = toStringArray(entry.providerIds);
      const providerEntries = providerIds.map(function (providerId) {
        return toRecord(providerState[providerId]);
      });
      const readyProvider = providerEntries.find(function (providerEntry) {
        return providerEntry["ready"] === true;
      });
      const toolReady = providerEntries.some(function (providerEntry) {
        return providerEntry["toolReady"] === true;
      });
      const sourceSupported =
        sourceKind === null || sourceKinds.length === 0 || sourceKinds.includes(sourceKind);
      const nextStatus =
        moduleStatus === "planned" || moduleStatus === "gated"
          ? moduleStatus
          : sourceSupported !== true
            ? "blocked"
            : readyProvider
              ? "ready"
              : "blocked";

      capabilityState[moduleId] = {
        moduleId,
        status: nextStatus,
        phase: asNonEmptyString(entry.phase) || "v2",
        providerIds,
        toolIds: toStringArray(entry.toolIds),
        requiredToolIds:
          toStringArray(entry.requiredToolIds).length > 0
            ? toStringArray(entry.requiredToolIds)
            : toStringArray(entry.toolIds),
        optionalToolIds: toStringArray(entry.optionalToolIds),
        toolReady,
        featureSupported: sourceSupported,
        capabilityReady: nextStatus === "ready",
        titleKey: asNonEmptyString(entry.titleKey),
        summaryKey: asNonEmptyString(entry.summaryKey),
        sourceKinds,
        blockers:
          nextStatus === "blocked"
            ? sourceSupported !== true
              ? [`${moduleId} is not available for ${sourceKind || "this source kind"}.`]
              : providerEntries.flatMap(function (providerEntry) {
                  return toStringArray(providerEntry["blockers"]);
                })
            : [],
        warnings:
          nextStatus === "gated"
            ? ["This visual capability is defined but still gated behind a future-ready provider."]
            : providerEntries.flatMap(function (providerEntry) {
                return toStringArray(providerEntry["warnings"]);
              }),
      };
    });

    return capabilityState;
  }

  function getMergedModuleToggles(project: LaboratoryProjectRecord, workbenchSource: unknown = {}) {
    return {
      ...toRecord(toRecord(project["workbench"])["moduleToggles"]),
      ...toRecord(toRecord(workbenchSource)["moduleToggles"]),
    };
  }

  function resolveEnabledVisualAnalysisModuleIds(
    runtime: LaboratoryVisualRuntimeRecord,
    project: LaboratoryProjectRecord,
    sourceKind: string | null,
    workbenchSource: unknown = {}
  ): string[] {
    const capabilityState = buildVisualAnalysisCapabilityState(runtime, sourceKind);
    const modules = getVisualAnalysisModulesForRuntime(runtime, sourceKind).filter(
      function (entry) {
        const moduleId = asNonEmptyString(entry.id) || "";
        return toRecord(capabilityState[moduleId])["status"] === "ready";
      }
    );
    const moduleToggles = getMergedModuleToggles(toProjectRecord(project), workbenchSource);
    const relevantToggleIds = modules
      .map(function (entry) {
        return asNonEmptyString(entry.id);
      })
      .filter((moduleId): moduleId is string => moduleId !== null)
      .filter(function (moduleId) {
        return Object.prototype.hasOwnProperty.call(moduleToggles, moduleId);
      });

    if (relevantToggleIds.length > 0) {
      return relevantToggleIds.filter(function (moduleId) {
        return moduleToggles[moduleId] === true;
      });
    }

    return modules
      .map(function (entry) {
        return asNonEmptyString(entry.id);
      })
      .filter((moduleId): moduleId is string => moduleId !== null);
  }

  function partitionVisualAnalysisModuleIds(
    runtime: LaboratoryVisualRuntimeRecord,
    moduleIds: string[]
  ) {
    const catalogEntries = getVisualAnalysisModulesForRuntime(runtime);
    const moduleMap = new Map<string, LaboratoryVisualCatalogEntryRecord>();
    catalogEntries.forEach(function (entry) {
      const moduleId = asNonEmptyString(entry.id);
      if (moduleId) {
        moduleMap.set(moduleId, entry);
      }
    });

    const structure: string[] = [];
    const reveal: string[] = [];

    moduleIds.forEach(function (moduleId) {
      const entry = moduleMap.get(moduleId);
      const providerIds = entry ? toStringArray(entry.providerIds) : [];
      if (providerIds.includes("ffmpeg-visual-reveal")) {
        reveal.push(moduleId);
        return;
      }
      structure.push(moduleId);
    });

    return {
      reveal,
      structure,
    };
  }

  function getVisualAnalysisDensity(runtime: LaboratoryVisualRuntimeRecord) {
    return toRecord(getVisualAnalysisCapabilities(runtime)["density"]);
  }

  return {
    buildVisualAnalysisCapabilityState,
    buildVisualAnalysisProviderState,
    getVisualAnalysisCapabilities,
    getVisualAnalysisCatalog,
    getVisualAnalysisDensity,
    getVisualAnalysisModulesForRuntime,
    getVisualAnalysisProviderEntries,
    partitionVisualAnalysisModuleIds,
    resolveEnabledVisualAnalysisModuleIds,
  };
}

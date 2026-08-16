type LaboratoryRecord = Record<string, unknown>;

type LaboratoryAudioAnalysisRuntime = LaboratoryRecord & {
  audioAnalysisProviders?: unknown;
  toolState?: unknown;
};

type LaboratoryProjectRecord = LaboratoryRecord & {
  edit?: unknown;
  name?: unknown;
  source?: unknown;
};

type LaboratoryAudioCatalogProjection = {
  orderedIds: string[];
  implementedIds: string[];
  gatedIds: string[];
  plannedIds: string[];
  visibleIds: string[];
};

type LaboratoryAudioCatalogModuleRecord = LaboratoryRecord & {
  id?: unknown;
  phase?: unknown;
  providerIds?: unknown;
  requiredToolIds?: unknown;
  status?: unknown;
  summaryKey?: unknown;
  titleKey?: unknown;
  toolIds?: unknown;
};

type LaboratoryAudioProviderCollectionRecord = LaboratoryRecord & {
  providers?: unknown;
};

type LaboratoryAudioProviderDescriptorRecord = LaboratoryRecord & {
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

type LaboratoryAudioProviderStateEntryRecord = LaboratoryRecord & {
  blockers?: unknown;
  ready?: unknown;
  warnings?: unknown;
};

type LaboratoryAudioCapabilityEntryRecord = LaboratoryRecord;

type LaboratoryAudioTargetRecord = LaboratoryRecord & {
  fileName?: unknown;
  id?: unknown;
  label?: unknown;
  metadata?: unknown;
  mimeType?: unknown;
  mode?: unknown;
  outputId?: unknown;
  path?: unknown;
  requestedMode?: unknown;
  signature?: unknown;
  usingFallback?: unknown;
};

type LaboratoryEditRecord = LaboratoryRecord & {
  activeOutputId?: unknown;
  handoffMode?: unknown;
};

type LaboratorySourceRecord = LaboratoryRecord & {
  metadata?: unknown;
  mimeType?: unknown;
  storedFileName?: unknown;
  storedPath?: unknown;
};

type LaboratoryEditOutputRecord = LaboratoryRecord & {
  fileName?: unknown;
  id?: unknown;
  label?: unknown;
  metadata?: unknown;
  mimeType?: unknown;
  path?: unknown;
};

type LaboratoryToolStateEntryRecord = LaboratoryRecord & {
  busy?: unknown;
  details?: unknown;
  installed?: unknown;
  lastError?: unknown;
  version?: unknown;
};

type LaboratoryToolDetailsRecord = LaboratoryRecord & {
  platformSupported?: unknown;
};

type LaboratorySpeechAvailabilityRecord = LaboratoryRecord & {
  ready?: unknown;
};

type LaboratoryProfileModelSummaryRecord = LaboratoryRecord & {
  modelId?: unknown;
  ready?: unknown;
  selected?: unknown;
};

type AudioAnalysisProjectionCatalogDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  buildDerivedTargetSignature: (output: LaboratoryEditOutputRecord) => string | null;
  buildProcessSpeechAvailability: (
    runtime: LaboratoryAudioAnalysisRuntime,
    project: LaboratoryProjectRecord
  ) => LaboratorySpeechAvailabilityRecord;
  buildProfileModelSummary: (
    runtime: LaboratoryAudioAnalysisRuntime,
    project: LaboratoryProjectRecord
  ) => LaboratoryProfileModelSummaryRecord[];
  buildSourceTargetSignature: (project: LaboratoryProjectRecord) => string | null;
  findEditOutputById: (project: LaboratoryProjectRecord, outputId: string | null) => unknown | null;
  getAudioAnalysisModulesForRuntime: (
    runtime: LaboratoryAudioAnalysisRuntime
  ) => LaboratoryAudioCatalogModuleRecord[];
  normalizeAudioAnalysisCapabilityEntry: (
    rawValue: unknown,
    moduleId: string,
    catalogEntry: LaboratoryAudioCatalogModuleRecord
  ) => LaboratoryAudioCapabilityEntryRecord;
  normalizeAudioAnalysisProviderStateEntry: (
    rawValue: unknown,
    providerId: string,
    descriptor: LaboratoryAudioProviderDescriptorRecord
  ) => LaboratoryAudioProviderStateEntryRecord;
  normalizeEditOutput: (value: unknown) => LaboratoryEditOutputRecord;
  normalizeSourceMetadata: (value: unknown) => LaboratoryRecord | null;
  normalizeStringArray: (value: unknown) => string[];
  toRecord: (value: unknown) => LaboratoryRecord;
};

function isNonNullString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

export function createAudioAnalysisProjectionCatalogRuntime(
  deps: AudioAnalysisProjectionCatalogDeps
) {
  const {
    asNonEmptyString,
    buildDerivedTargetSignature,
    buildProcessSpeechAvailability,
    buildProfileModelSummary,
    buildSourceTargetSignature,
    findEditOutputById,
    getAudioAnalysisModulesForRuntime,
    normalizeAudioAnalysisCapabilityEntry,
    normalizeAudioAnalysisProviderStateEntry,
    normalizeEditOutput,
    normalizeSourceMetadata,
    normalizeStringArray,
    toRecord,
  } = deps;

  function toRuntimeRecord(value: unknown): LaboratoryAudioAnalysisRuntime {
    return toRecord(value);
  }

  function toProjectRecord(value: unknown): LaboratoryProjectRecord {
    return toRecord(value);
  }

  function toCatalogModuleRecord(value: unknown): LaboratoryAudioCatalogModuleRecord {
    return toRecord(value);
  }

  function toProviderCollectionRecord(value: unknown): LaboratoryAudioProviderCollectionRecord {
    return toRecord(value);
  }

  function toProviderDescriptorRecord(value: unknown): LaboratoryAudioProviderDescriptorRecord {
    return toRecord(value);
  }

  function toProviderStateEntryRecord(value: unknown): LaboratoryAudioProviderStateEntryRecord {
    return toRecord(value);
  }

  function toTargetRecord(value: unknown): LaboratoryAudioTargetRecord {
    return toRecord(value);
  }

  function toEditRecord(value: unknown): LaboratoryEditRecord {
    return toRecord(value);
  }

  function toSourceRecord(value: unknown): LaboratorySourceRecord {
    return toRecord(value);
  }

  function toEditOutputRecord(value: unknown): LaboratoryEditOutputRecord {
    return toRecord(value);
  }

  function toToolStateEntryRecord(value: unknown): LaboratoryToolStateEntryRecord {
    return toRecord(value);
  }

  function toToolDetailsRecord(value: unknown): LaboratoryToolDetailsRecord {
    return toRecord(value);
  }

  function toSpeechAvailabilityRecord(value: unknown): LaboratorySpeechAvailabilityRecord {
    return toRecord(value);
  }

  function toModelSummaryRecord(value: unknown): LaboratoryProfileModelSummaryRecord {
    return toRecord(value);
  }

  function hasRecordValues(value: LaboratoryRecord): boolean {
    return Object.keys(value).length > 0;
  }

  function toUniqueStrings(values: string[]): string[] {
    return Array.from(
      new Set(
        values.filter(function (value) {
          return value.length > 0;
        })
      )
    );
  }

  function collectModuleIdsByStatus(
    modules: LaboratoryAudioCatalogModuleRecord[],
    status: string
  ): string[] {
    return modules
      .filter(function (entry) {
        return asNonEmptyString(entry.status) === status;
      })
      .map(function (entry) {
        return asNonEmptyString(entry.id);
      })
      .filter(isNonNullString);
  }

  function getToolState(runtime: LaboratoryAudioAnalysisRuntime): LaboratoryRecord {
    const runtimeRecord = toRuntimeRecord(runtime);
    return toRecord(toRecord(runtimeRecord.toolState)["tools"]);
  }

  function getToolEntry(
    toolState: LaboratoryRecord,
    toolId: string | null
  ): LaboratoryToolStateEntryRecord {
    return toolId === null ? {} : toToolStateEntryRecord(toolState[toolId]);
  }

  function buildAudioAnalysisCatalogProjection(
    runtime: LaboratoryAudioAnalysisRuntime
  ): LaboratoryAudioCatalogProjection {
    const modules = getAudioAnalysisModulesForRuntime(runtime).map(toCatalogModuleRecord);
    const orderedIds = modules
      .map(function (entry) {
        return asNonEmptyString(entry.id);
      })
      .filter(isNonNullString);

    return {
      orderedIds,
      implementedIds: collectModuleIdsByStatus(modules, "implemented"),
      gatedIds: collectModuleIdsByStatus(modules, "gated"),
      plannedIds: collectModuleIdsByStatus(modules, "planned"),
      visibleIds: orderedIds,
    };
  }

  function getAudioAnalysisProviderDescriptors(
    runtime: LaboratoryAudioAnalysisRuntime
  ): LaboratoryAudioProviderDescriptorRecord[] {
    const providerCollection = toProviderCollectionRecord(
      toRuntimeRecord(runtime).audioAnalysisProviders
    );
    return Array.isArray(providerCollection.providers)
      ? providerCollection.providers.map(toProviderDescriptorRecord)
      : [];
  }

  function resolveAudioAnalysisProviderIdsForModule(
    runtime: LaboratoryAudioAnalysisRuntime,
    catalogEntry: LaboratoryAudioCatalogModuleRecord
  ): string[] {
    const descriptorProviderIds = normalizeStringArray(catalogEntry.providerIds);
    if (descriptorProviderIds.length > 0) {
      return toUniqueStrings(descriptorProviderIds);
    }

    const toolIds = toUniqueStrings(normalizeStringArray(catalogEntry.toolIds));
    return getAudioAnalysisProviderDescriptors(runtime)
      .filter(function (entry) {
        const toolId = asNonEmptyString(entry.toolId);
        return toolId !== null && toolIds.includes(toolId);
      })
      .map(function (entry) {
        return asNonEmptyString(entry.id);
      })
      .filter(isNonNullString);
  }

  function getAudioAnalysisRequiredToolIds(
    catalogEntry: LaboratoryAudioCatalogModuleRecord
  ): string[] {
    const requiredToolIds = normalizeStringArray(catalogEntry.requiredToolIds);
    return requiredToolIds.length > 0
      ? toUniqueStrings(requiredToolIds)
      : toUniqueStrings(normalizeStringArray(catalogEntry.toolIds));
  }

  function buildAudioAnalysisProviderState(
    runtime: LaboratoryAudioAnalysisRuntime,
    project: LaboratoryProjectRecord
  ): Record<string, LaboratoryAudioProviderStateEntryRecord> {
    const toolState = getToolState(runtime);
    const speechAvailability = toSpeechAvailabilityRecord(
      buildProcessSpeechAvailability(runtime, project)
    );
    const modelSummaries = buildProfileModelSummary(runtime, project).map(toModelSummaryRecord);
    const selectedModel =
      modelSummaries.find(function (entry) {
        return entry.selected === true;
      }) ??
      modelSummaries.find(function (entry) {
        return entry.ready === true;
      }) ??
      null;

    return getAudioAnalysisProviderDescriptors(runtime).reduce<
      Record<string, LaboratoryAudioProviderStateEntryRecord>
    >(function (accumulator, descriptor, index) {
      const providerId = asNonEmptyString(descriptor.id) ?? `audio-provider-${index}`;
      const toolId = asNonEmptyString(descriptor.toolId);
      const usesTranscriptRuntime = toolId === "transcript-runtime";
      const toolEntry = getToolEntry(toolState, toolId);
      const toolDetails = toToolDetailsRecord(toolEntry.details);
      const descriptorStatus = asNonEmptyString(descriptor.status) ?? "planned";
      const moduleIds = normalizeStringArray(descriptor.moduleIds);
      const blockers: string[] = [];
      const warnings: string[] = [];
      let status = descriptorStatus;
      let ready = false;

      if (descriptorStatus === "ready") {
        if (usesTranscriptRuntime && speechAvailability.ready !== true) {
          status = "missing-model";
          blockers.push("Prepare the central Speech Runtime model to enable this provider.");
        } else if (
          toolId !== null &&
          usesTranscriptRuntime !== true &&
          toolEntry.installed !== true
        ) {
          status = "missing-tool";
          blockers.push(`Install ${toolId} to enable this provider.`);
        } else {
          status = "ready";
          ready = true;
        }
      } else if (descriptorStatus === "gated") {
        warnings.push("This provider remains capability-gated in the current rollout.");
      }

      accumulator[providerId] = normalizeAudioAnalysisProviderStateEntry(
        {
          providerId,
          status,
          toolId,
          moduleIds,
          titleKey: asNonEmptyString(descriptor.titleKey),
          summaryKey: asNonEmptyString(descriptor.summaryKey),
          providerType: asNonEmptyString(descriptor.providerType),
          installStrategy: asNonEmptyString(descriptor.installStrategy),
          expectedArtifacts: normalizeStringArray(descriptor.expectedArtifacts),
          fallbackProviderIds: normalizeStringArray(descriptor.fallbackProviderIds),
          installed: usesTranscriptRuntime
            ? speechAvailability.ready === true
            : toolEntry.installed === true,
          ready,
          busy: toolEntry.busy === true,
          version: asNonEmptyString(toolEntry.version),
          modelId: selectedModel === null ? null : asNonEmptyString(selectedModel.modelId),
          platformSupported: toolDetails.platformSupported !== false,
          blockers,
          warnings,
          lastError: asNonEmptyString(toolEntry.lastError),
        },
        providerId,
        descriptor
      );
      return accumulator;
    }, {});
  }

  function buildAudioAnalysisCapabilityState(
    runtime: LaboratoryAudioAnalysisRuntime,
    _project: LaboratoryProjectRecord,
    target: LaboratoryAudioTargetRecord,
    providerState: Record<string, LaboratoryAudioProviderStateEntryRecord>
  ): Record<string, LaboratoryAudioCapabilityEntryRecord> {
    const toolState = getToolState(runtime);
    const targetRecord = toTargetRecord(target);

    return getAudioAnalysisModulesForRuntime(runtime)
      .map(toCatalogModuleRecord)
      .reduce<Record<string, LaboratoryAudioCapabilityEntryRecord>>(function (
        accumulator,
        entry,
        index
      ) {
        const moduleId = asNonEmptyString(entry.id) ?? `audio-module-${index}`;
        const moduleStatus = asNonEmptyString(entry.status) ?? "planned";
        const providerIds = resolveAudioAnalysisProviderIdsForModule(runtime, entry);
        const toolIds = normalizeStringArray(entry.toolIds);
        const requiredToolIds = getAudioAnalysisRequiredToolIds(entry);
        const blockers: string[] = [];
        const warnings: string[] = [];
        let status = moduleStatus;

        if (moduleStatus === "implemented") {
          if (asNonEmptyString(targetRecord.path) === null) {
            status = "blocked";
            blockers.push("Prepare an audio-ready source before running this module.");
          } else if (providerIds.length > 0) {
            const providerEntries = providerIds
              .map(function (providerId) {
                return toProviderStateEntryRecord(providerState[providerId]);
              })
              .filter(hasRecordValues);

            if (
              providerEntries.some(function (provider) {
                return provider.ready === true;
              })
            ) {
              status = "ready";
            } else {
              status = "blocked";
              providerEntries.forEach(function (provider) {
                normalizeStringArray(provider.blockers).forEach(function (entryText) {
                  blockers.push(entryText);
                });
                normalizeStringArray(provider.warnings).forEach(function (entryText) {
                  warnings.push(entryText);
                });
              });
            }
          }

          if (status === "ready") {
            const missingToolIds = requiredToolIds.filter(function (toolId) {
              return getToolEntry(toolState, toolId).installed !== true;
            });
            if (missingToolIds.length > 0) {
              status = "blocked";
              missingToolIds.forEach(function (toolId) {
                blockers.push(`Install ${toolId} to enable this module.`);
              });
            }
          }
        } else if (moduleStatus === "gated") {
          warnings.push("This module remains capability-gated on the current runtime.");
        }

        accumulator[moduleId] = normalizeAudioAnalysisCapabilityEntry(
          {
            moduleId,
            phase: asNonEmptyString(entry.phase),
            status,
            titleKey: asNonEmptyString(entry.titleKey),
            summaryKey: asNonEmptyString(entry.summaryKey),
            providerIds,
            toolIds,
            requiredToolIds,
            blockers: toUniqueStrings(blockers),
            warnings: toUniqueStrings(warnings),
          },
          moduleId,
          entry
        );
        return accumulator;
      }, {});
  }

  function resolveAudioFeatureTarget(
    project: LaboratoryProjectRecord
  ): LaboratoryAudioTargetRecord {
    const projectRecord = toProjectRecord(project);
    const source = toSourceRecord(projectRecord.source);
    const edit = toEditRecord(projectRecord.edit);
    const activeOutputId = asNonEmptyString(edit.activeOutputId);
    const activeOutput = findEditOutputById(projectRecord, activeOutputId);

    if (
      asNonEmptyString(edit.handoffMode) === "derived" &&
      activeOutput !== null &&
      asNonEmptyString(toEditOutputRecord(activeOutput).path) !== null
    ) {
      const output = normalizeEditOutput(activeOutput);
      return {
        requestedMode: "derived",
        mode: "derived",
        outputId: asNonEmptyString(output.id),
        path: asNonEmptyString(output.path),
        fileName: asNonEmptyString(output.fileName),
        mimeType: asNonEmptyString(output.mimeType),
        metadata: normalizeSourceMetadata(output.metadata),
        signature: buildDerivedTargetSignature(output),
        label:
          asNonEmptyString(output.label) ??
          asNonEmptyString(output.fileName) ??
          asNonEmptyString(output.id),
        usingFallback: false,
        reason: null,
      };
    }

    const sourcePath = asNonEmptyString(source.storedPath);
    const sourceFileName = asNonEmptyString(source.storedFileName);

    return {
      requestedMode: "source",
      mode: "source",
      outputId: null,
      path: sourcePath,
      fileName: sourceFileName,
      mimeType: asNonEmptyString(source.mimeType),
      metadata: normalizeSourceMetadata(source.metadata),
      signature: sourcePath === null ? null : buildSourceTargetSignature(projectRecord),
      label: sourceFileName ?? asNonEmptyString(projectRecord.name),
      usingFallback: false,
      reason: null,
    };
  }

  return {
    buildAudioAnalysisCapabilityState,
    buildAudioAnalysisCatalogProjection,
    buildAudioAnalysisProviderState,
    getAudioAnalysisRequiredToolIds,
    resolveAudioFeatureTarget,
  };
}

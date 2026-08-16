type LaboratoryRecord = Record<string, unknown>;

type LaboratorySourceMetadataRecord = LaboratoryRecord & {
  durationSeconds?: unknown;
  sizeBytes?: unknown;
};

type LaboratoryProjectSourceRecord = LaboratoryRecord & {
  kind?: unknown;
  metadata?: unknown;
  mimeType?: unknown;
  storedFileName?: unknown;
  storedPath?: unknown;
};

type LaboratoryEditPreviewRecord = LaboratoryRecord & {
  artifacts?: unknown;
  fileName?: unknown;
  metadata?: unknown;
  path?: unknown;
  recipeSignature?: unknown;
  status?: unknown;
  updatedAt?: unknown;
};

type LaboratoryEditOutputRecord = LaboratoryRecord & {
  artifacts?: unknown;
  createdAt?: unknown;
  fileName?: unknown;
  id?: unknown;
  kind?: unknown;
  label?: unknown;
  metadata?: unknown;
  mimeType?: unknown;
  path?: unknown;
  recipeSignature?: unknown;
};

type LaboratoryProjectEditRecord = LaboratoryRecord & {
  activeOutputId?: unknown;
  handoffMode?: unknown;
  outputs?: unknown;
  preview?: unknown;
};

type LaboratoryProjectProfileRecord = LaboratoryRecord & {
  activePresetId?: unknown;
  artifactPreferences?: unknown;
  artifacts?: unknown;
  depth?: unknown;
  frameSampleDensity?: unknown;
  preflight?: unknown;
  sensitivity?: unknown;
  signals?: unknown;
  targetAssetMode?: unknown;
  targetAssetSignature?: unknown;
  targetOutputId?: unknown;
  transcriptSampleSeconds?: unknown;
};

type LaboratoryProjectRecord = LaboratoryRecord & {
  edit?: unknown;
  id?: unknown;
  process?: unknown;
  profile?: unknown;
  report?: unknown;
  source?: unknown;
  updatedAt?: unknown;
};

type LaboratoryProjectManifestRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  asNumber: (value: unknown) => number | null;
  clone: <T>(value: T) => T;
  normalizeEditOutput: (value: unknown) => LaboratoryEditOutputRecord;
  normalizeProcessState: (value: unknown) => unknown;
  normalizeProfileArtifact: (value: unknown) => unknown;
  normalizeProfileSignal: (value: unknown) => unknown;
  normalizeReportState: (value: unknown) => unknown;
  normalizeSourceMetadata: (value: unknown) => LaboratorySourceMetadataRecord;
  projectSchemaVersion: number;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryProjectManifestRuntime(deps: LaboratoryProjectManifestRuntimeDeps) {
  const {
    asNonEmptyString,
    asNumber,
    clone,
    normalizeEditOutput,
    normalizeProcessState,
    normalizeProfileArtifact,
    normalizeProfileSignal,
    normalizeReportState,
    normalizeSourceMetadata,
    projectSchemaVersion,
    toRecord,
  } = deps;

  function toProjectRecord(value: unknown): LaboratoryProjectRecord {
    return toRecord(value);
  }

  function toProjectSourceRecord(value: unknown): LaboratoryProjectSourceRecord {
    return toRecord(value);
  }

  function toProjectEditRecord(value: unknown): LaboratoryProjectEditRecord {
    return toRecord(value);
  }

  function toEditPreviewRecord(value: unknown): LaboratoryEditPreviewRecord {
    return toRecord(value);
  }

  function toProjectProfileRecord(value: unknown): LaboratoryProjectProfileRecord {
    return toRecord(value);
  }

  function toRecordList(value: unknown): LaboratoryRecord[] {
    return Array.isArray(value) ? value.map(toRecord) : [];
  }

  function getEditOutputs(edit: LaboratoryProjectEditRecord): LaboratoryEditOutputRecord[] {
    return Array.isArray(edit.outputs) ? edit.outputs.map(normalizeEditOutput) : [];
  }

  function buildEditManifest(project: unknown) {
    const projectRecord = toProjectRecord(project);
    const sourceRecord = toProjectSourceRecord(projectRecord.source);
    const editRecord = toProjectEditRecord(projectRecord.edit);
    const previewRecord = toEditPreviewRecord(editRecord.preview);
    const outputs = getEditOutputs(editRecord);

    return {
      schemaVersion: projectSchemaVersion,
      projectId: asNonEmptyString(projectRecord.id),
      updatedAt: asNonEmptyString(projectRecord.updatedAt),
      sourceKind: asNonEmptyString(sourceRecord.kind) || "video",
      handoffMode: asNonEmptyString(editRecord.handoffMode) || "source",
      activeOutputId: asNonEmptyString(editRecord.activeOutputId),
      preview: {
        status: asNonEmptyString(previewRecord.status) || "idle",
        path: asNonEmptyString(previewRecord.path),
        fileName: asNonEmptyString(previewRecord.fileName),
        recipeSignature: asNonEmptyString(previewRecord.recipeSignature),
        metadata: normalizeSourceMetadata(previewRecord.metadata),
        artifacts: toRecordList(previewRecord.artifacts),
        updatedAt: asNonEmptyString(previewRecord.updatedAt),
      },
      outputs: outputs.map(function (entry) {
        return {
          id: asNonEmptyString(entry.id),
          path: asNonEmptyString(entry.path),
          fileName: asNonEmptyString(entry.fileName),
          kind: asNonEmptyString(entry.kind),
          label: asNonEmptyString(entry.label),
          recipeSignature: asNonEmptyString(entry.recipeSignature),
          createdAt: asNonEmptyString(entry.createdAt),
          metadata: normalizeSourceMetadata(entry.metadata),
          artifacts: toRecordList(entry.artifacts),
        };
      }),
    };
  }

  function buildProfileManifest(project: unknown) {
    const projectRecord = toProjectRecord(project);
    const profileRecord = toProjectProfileRecord(projectRecord.profile);

    return {
      schemaVersion: projectSchemaVersion,
      projectId: asNonEmptyString(projectRecord.id),
      updatedAt: asNonEmptyString(projectRecord.updatedAt),
      targetAssetMode: asNonEmptyString(profileRecord.targetAssetMode) || "source",
      targetOutputId: asNonEmptyString(profileRecord.targetOutputId),
      targetAssetSignature: asNonEmptyString(profileRecord.targetAssetSignature),
      depth: asNonEmptyString(profileRecord.depth) || "balanced",
      sensitivity: asNumber(profileRecord.sensitivity),
      frameSampleDensity: asNonEmptyString(profileRecord.frameSampleDensity) || "balanced",
      transcriptSampleSeconds: asNumber(profileRecord.transcriptSampleSeconds),
      activePresetId: asNonEmptyString(profileRecord.activePresetId),
      artifactPreferences: clone(toRecord(profileRecord.artifactPreferences)),
      preflight: clone(toRecord(profileRecord.preflight)),
      signals: Array.isArray(profileRecord.signals)
        ? profileRecord.signals.map(normalizeProfileSignal)
        : [],
      artifacts: Array.isArray(profileRecord.artifacts)
        ? profileRecord.artifacts.map(normalizeProfileArtifact)
        : [],
    };
  }

  function buildProcessManifest(project: unknown) {
    const projectRecord = toProjectRecord(project);
    return {
      schemaVersion: projectSchemaVersion,
      projectId: asNonEmptyString(projectRecord.id),
      updatedAt: asNonEmptyString(projectRecord.updatedAt),
      process: normalizeProcessState(projectRecord.process),
    };
  }

  function buildReportManifest(project: unknown) {
    const projectRecord = toProjectRecord(project);
    return {
      schemaVersion: projectSchemaVersion,
      projectId: asNonEmptyString(projectRecord.id),
      updatedAt: asNonEmptyString(projectRecord.updatedAt),
      report: normalizeReportState(projectRecord.report),
    };
  }

  function buildSourceTargetSignature(project: unknown) {
    const projectRecord = toProjectRecord(project);
    const sourceRecord = toProjectSourceRecord(projectRecord.source);
    const metadata = toRecord(normalizeSourceMetadata(sourceRecord.metadata));

    return JSON.stringify({
      mode: "source",
      kind: asNonEmptyString(sourceRecord.kind) || "video",
      path: asNonEmptyString(sourceRecord.storedPath),
      fileName: asNonEmptyString(sourceRecord.storedFileName),
      mimeType: asNonEmptyString(sourceRecord.mimeType),
      durationSeconds: asNumber(metadata["durationSeconds"]),
      sizeBytes: asNumber(metadata["sizeBytes"]),
    });
  }

  function buildDerivedTargetSignature(output: unknown) {
    const entry = normalizeEditOutput(output);
    const metadata = toRecord(normalizeSourceMetadata(entry.metadata));

    return JSON.stringify({
      mode: "derived",
      outputId: asNonEmptyString(entry.id),
      path: asNonEmptyString(entry.path),
      fileName: asNonEmptyString(entry.fileName),
      mimeType: asNonEmptyString(entry.mimeType),
      recipeSignature: asNonEmptyString(entry.recipeSignature),
      durationSeconds: asNumber(metadata["durationSeconds"]),
      sizeBytes: asNumber(metadata["sizeBytes"]),
      createdAt: asNonEmptyString(entry.createdAt),
    });
  }

  function findEditOutputById(project: unknown, outputId: unknown) {
    const targetId = asNonEmptyString(outputId);
    if (targetId === null) {
      return null;
    }

    const projectRecord = toProjectRecord(project);
    const editRecord = toProjectEditRecord(projectRecord.edit);
    return (
      getEditOutputs(editRecord).find(function (entry) {
        return asNonEmptyString(entry.id) === targetId;
      }) || null
    );
  }

  return {
    buildDerivedTargetSignature,
    buildEditManifest,
    buildProcessManifest,
    buildProfileManifest,
    buildReportManifest,
    buildSourceTargetSignature,
    findEditOutputById,
  };
}

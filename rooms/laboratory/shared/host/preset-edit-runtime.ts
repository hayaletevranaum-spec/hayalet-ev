type LaboratoryRecord = Record<string, unknown> & {
  activeOutputId?: unknown;
  activePresetId?: unknown;
  analysis?: unknown;
  artifacts?: unknown[];
  audio?: LaboratoryRecord;
  beginner?: unknown[];
  common?: LaboratoryRecord;
  createdAt?: unknown;
  cropNormalized?: LaboratoryRecord;
  defaultMode?: unknown;
  dirty?: unknown;
  error?: unknown;
  fileName?: unknown;
  focusRegionId?: unknown;
  focusRegions?: LaboratoryRecord;
  handoffMode?: unknown;
  height?: unknown;
  id?: unknown;
  image?: LaboratoryRecord;
  jobId?: unknown;
  kind?: unknown;
  label?: unknown;
  lastActionAt?: unknown;
  lastError?: unknown;
  metadata?: unknown;
  mimeType?: unknown;
  mode?: unknown;
  notes?: unknown;
  outputId?: unknown;
  outputNameHint?: unknown;
  outputs?: unknown[];
  patch?: LaboratoryRecord;
  path?: unknown;
  presets?: LaboratoryRecord;
  preview?: LaboratoryRecord;
  recipe?: LaboratoryRecord;
  recipeSignature?: unknown;
  redactionBoxes?: unknown[];
  requestId?: unknown;
  resizePresets?: LaboratoryRecord;
  sourcePath?: unknown;
  status?: unknown;
  updatedAt?: unknown;
  video?: LaboratoryRecord;
  width?: unknown;
  x?: unknown;
  y?: unknown;
};

type LaboratoryCropBox = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type LaboratoryEditOutputArtifact = {
  fileName: string | null;
  kind: string | null;
  path: string | null;
};

type LaboratoryEditOutput = {
  artifacts: LaboratoryEditOutputArtifact[];
  createdAt: string;
  fileName: string | null;
  id: string;
  jobId: string | null;
  kind: string;
  label: string | null;
  metadata: LaboratoryRecord | null;
  mimeType: string | null;
  path: string | null;
  recipeSignature: string | null;
  sourcePath: string | null;
};

type LaboratoryEditPreview = {
  artifacts: LaboratoryRecord[];
  error: string | null;
  fileName: string | null;
  jobId: string | null;
  metadata: LaboratoryRecord | null;
  mimeType: string | null;
  outputId: string | null;
  path: string | null;
  recipeSignature: string | null;
  requestId: string | null;
  status: string;
  updatedAt: string | null;
};

type LaboratoryEditRecipeCommon = {
  cropNormalized: LaboratoryCropBox;
  focusRegionId: string;
  notes: string;
  outputNameHint: string;
  redactionBoxes: LaboratoryRecord[];
};

type LaboratoryEditRecipeVideo = LaboratoryRecord & {
  blurFocusOutside: boolean;
  customHeight: number | null;
  customWidth: number | null;
  fpsLimit: number;
  frameGrabCount: number;
  includeAudio: boolean;
  resizePreset: string;
  trimEnabled: boolean;
  trimEndSeconds: number;
  trimStartSeconds: number;
};

type LaboratoryEditRecipeAudio = LaboratoryRecord & {
  highpassHz: number;
  lowpassHz: number;
  mono: boolean;
  normalize: boolean;
  normalizeTargetDb: number;
  silenceTrim: boolean;
  spectrogram: boolean;
  trimEnabled: boolean;
  trimEndSeconds: number;
  trimStartSeconds: number;
};

type LaboratoryEditRecipeImage = LaboratoryRecord & {
  blurStrength: number;
  brightness: number;
  contrast: number;
  customHeight: number | null;
  customWidth: number | null;
  resizePreset: string;
  rotateDegrees: number;
  sharpen: number;
};

type LaboratoryEditRecipe = {
  audio: LaboratoryEditRecipeAudio;
  common: LaboratoryEditRecipeCommon;
  image: LaboratoryEditRecipeImage;
  video: LaboratoryEditRecipeVideo;
};

type LaboratoryEditState = {
  activeOutputId: string | null;
  activePresetId: string | null;
  dirty: boolean;
  handoffMode: "source" | "derived";
  lastActionAt: string | null;
  lastError: string | null;
  mode: string;
  outputs: LaboratoryEditOutput[];
  preview: LaboratoryEditPreview;
  recipe: LaboratoryEditRecipe;
};

type LaboratoryPresetEditRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  normalizeSourceMetadata: (rawValue: unknown) => LaboratoryRecord | null;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryPresetEditRuntime(deps: LaboratoryPresetEditRuntimeDeps) {
  const { asNonEmptyString, normalizeSourceMetadata, toRecord } = deps;

  function getFocusRegionMap(editPresets: unknown): LaboratoryRecord {
    return toRecord(toRecord(editPresets).focusRegions);
  }

  function getDefaultFocusRegionId(editPresets: unknown): string {
    const focusRegions = getFocusRegionMap(editPresets);
    if (focusRegions["full-frame"]) {
      return "full-frame";
    }
    return Object.keys(focusRegions)[0] || "full-frame";
  }

  function getFocusRegionCrop(editPresets: unknown, regionId: string): LaboratoryCropBox {
    const focusRegions = getFocusRegionMap(editPresets);
    const region = toRecord(focusRegions[regionId]);
    const crop = toRecord(region.cropNormalized);
    return {
      x: Number.isFinite(Number(crop.x)) ? Number(crop.x) : 0,
      y: Number.isFinite(Number(crop.y)) ? Number(crop.y) : 0,
      width: Number.isFinite(Number(crop.width)) ? Number(crop.width) : 1,
      height: Number.isFinite(Number(crop.height)) ? Number(crop.height) : 1,
    };
  }

  function getResizePresetMap(editPresets: unknown): LaboratoryRecord {
    return toRecord(toRecord(editPresets).resizePresets);
  }

  function getDefaultEditPresetId(editPresets: unknown, sourceKind: string): string | null {
    const presetsByKind = toRecord(toRecord(editPresets).presets);
    const mode = asNonEmptyString(toRecord(editPresets).defaultMode) || "beginner";
    const sourcePresets = toRecord(presetsByKind[sourceKind]);
    const modePresets = sourcePresets[mode];
    const presetList = Array.isArray(modePresets) ? modePresets : [];
    const first = toRecord(presetList[0]);
    return asNonEmptyString(first.id);
  }

  function mergeObjects(baseValue: unknown, patchValue: unknown): LaboratoryRecord {
    const baseRecord = toRecord(baseValue);
    const patchRecord = toRecord(patchValue);
    const nextValue = { ...baseRecord };

    Object.keys(patchRecord).forEach(function (key: string) {
      const patchEntry = patchRecord[key];
      if (patchEntry && typeof patchEntry === "object" && Array.isArray(patchEntry) === false) {
        nextValue[key] = mergeObjects(baseRecord[key], patchEntry);
        return;
      }
      nextValue[key] = patchEntry;
    });

    return nextValue;
  }

  function createDefaultEditState(editPresets: unknown, sourceKind: string) {
    const focusRegionId = getDefaultFocusRegionId(editPresets);
    const resizePresets = getResizePresetMap(editPresets);
    const analysisResize = resizePresets.analysis ? "analysis" : "keep";
    const defaultPresetId = getDefaultEditPresetId(editPresets, sourceKind);
    let editState: LaboratoryEditState = {
      mode: asNonEmptyString(toRecord(editPresets).defaultMode) || "beginner",
      dirty: false,
      activePresetId: defaultPresetId,
      activeOutputId: null,
      handoffMode: "source",
      lastError: null,
      lastActionAt: null,
      preview: {
        status: "idle",
        outputId: null,
        jobId: null,
        requestId: null,
        path: null,
        fileName: null,
        mimeType: null,
        metadata: null,
        artifacts: [],
        error: null,
        recipeSignature: null,
        updatedAt: null,
      },
      recipe: {
        common: {
          focusRegionId: focusRegionId,
          cropNormalized: getFocusRegionCrop(editPresets, focusRegionId),
          redactionBoxes: [],
          outputNameHint: "",
          notes: "",
        },
        video: {
          trimEnabled: false,
          trimStartSeconds: 0,
          trimEndSeconds: 0,
          resizePreset: analysisResize,
          customWidth: null,
          customHeight: null,
          fpsLimit: 24,
          includeAudio: true,
          blurFocusOutside: false,
          frameGrabCount: 0,
        },
        audio: {
          trimEnabled: false,
          trimStartSeconds: 0,
          trimEndSeconds: 0,
          silenceTrim: false,
          normalize: false,
          normalizeTargetDb: -16,
          mono: false,
          spectrogram: false,
          highpassHz: 0,
          lowpassHz: 0,
        },
        image: {
          rotateDegrees: 0,
          resizePreset: analysisResize,
          customWidth: null,
          customHeight: null,
          brightness: 0,
          contrast: 1,
          sharpen: 0,
          blurStrength: 0,
        },
      },
      outputs: [],
    };

    const presetId = asNonEmptyString(editState.activePresetId);
    if (presetId === null) {
      return editState;
    }

    const presetsByKind = toRecord(toRecord(editPresets).presets);
    const sourcePresets = toRecord(presetsByKind[sourceKind]);
    const beginnerPresets = sourcePresets.beginner;
    const presetList = Array.isArray(beginnerPresets) ? beginnerPresets : [];
    const preset = presetList.find(function (entry: unknown) {
      return asNonEmptyString(toRecord(entry).id) === presetId;
    });
    const patch = toRecord(toRecord(preset).patch);
    if (Object.keys(patch).length === 0) {
      return editState;
    }

    editState = mergeObjects(editState, {
      recipe: patch,
    }) as LaboratoryEditState;

    const patchedFocusRegionId = asNonEmptyString(
      toRecord(toRecord(editState.recipe).common).focusRegionId
    );
    if (patchedFocusRegionId) {
      editState.recipe.common.cropNormalized = getFocusRegionCrop(
        editPresets,
        patchedFocusRegionId
      );
    }
    return editState;
  }

  function normalizeCropBox(value: unknown, fallback: unknown): LaboratoryCropBox {
    const source = toRecord(value);
    const nextFallback = toRecord(fallback);
    const x = Number.isFinite(Number(source.x)) ? Number(source.x) : Number(nextFallback.x || 0);
    const y = Number.isFinite(Number(source.y)) ? Number(source.y) : Number(nextFallback.y || 0);
    const width = Number.isFinite(Number(source.width))
      ? Number(source.width)
      : Number(nextFallback.width || 1);
    const height = Number.isFinite(Number(source.height))
      ? Number(source.height)
      : Number(nextFallback.height || 1);

    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
      width: Math.max(0.02, Math.min(1, width)),
      height: Math.max(0.02, Math.min(1, height)),
    };
  }

  function normalizeEditOutput(rawValue: unknown) {
    const source = toRecord(rawValue);
    return {
      id: asNonEmptyString(source.id) || `edit-output-${Date.now()}`,
      kind: asNonEmptyString(source.kind) || "output",
      path: asNonEmptyString(source.path),
      fileName: asNonEmptyString(source.fileName),
      mimeType: asNonEmptyString(source.mimeType),
      createdAt: asNonEmptyString(source.createdAt) || new Date().toISOString(),
      recipeSignature: asNonEmptyString(source.recipeSignature),
      metadata: normalizeSourceMetadata(source.metadata),
      label: asNonEmptyString(source.label),
      jobId: asNonEmptyString(source.jobId),
      sourcePath: asNonEmptyString(source.sourcePath),
      artifacts: Array.isArray(source.artifacts)
        ? source.artifacts
            .map(function (entry: unknown) {
              const artifact = toRecord(entry);
              return {
                kind: asNonEmptyString(artifact.kind),
                path: asNonEmptyString(artifact.path),
                fileName: asNonEmptyString(artifact.fileName),
              };
            })
            .filter(function (entry: LaboratoryEditOutputArtifact) {
              return entry.path !== null;
            })
        : [],
    };
  }

  function normalizeEditState(rawValue: unknown, editPresets: unknown, sourceKind: string) {
    const defaults = createDefaultEditState(editPresets, sourceKind);
    const source = toRecord(rawValue);
    const recipe = toRecord(source.recipe);
    const common = toRecord(recipe.common);
    const preview = toRecord(source.preview);
    const previewArtifacts = preview.artifacts;
    const defaultFocusRegionId = getDefaultFocusRegionId(editPresets);
    const focusRegionId = asNonEmptyString(common.focusRegionId) || defaultFocusRegionId;
    const defaultCrop = getFocusRegionCrop(editPresets, focusRegionId);
    const outputs = Array.isArray(source.outputs)
      ? source.outputs.map(normalizeEditOutput).filter(function (entry: LaboratoryEditOutput) {
          return asNonEmptyString(entry.path) !== null;
        })
      : [];

    return {
      mode:
        asNonEmptyString(source.mode) === "advanced"
          ? "advanced"
          : asNonEmptyString(source.mode) || defaults.mode,
      dirty: source.dirty === true,
      activePresetId: asNonEmptyString(source.activePresetId) || defaults.activePresetId,
      activeOutputId: asNonEmptyString(source.activeOutputId),
      handoffMode: asNonEmptyString(source.handoffMode) === "derived" ? "derived" : "source",
      lastError: asNonEmptyString(source.lastError),
      lastActionAt: asNonEmptyString(source.lastActionAt),
      preview: {
        status: asNonEmptyString(preview.status) || "idle",
        outputId: asNonEmptyString(preview.outputId),
        jobId: asNonEmptyString(preview.jobId),
        requestId: asNonEmptyString(preview.requestId),
        path: asNonEmptyString(preview.path),
        fileName: asNonEmptyString(preview.fileName),
        mimeType: asNonEmptyString(preview.mimeType),
        metadata: normalizeSourceMetadata(preview.metadata),
        artifacts: Array.isArray(previewArtifacts) ? previewArtifacts.map(toRecord) : [],
        error: asNonEmptyString(preview.error),
        recipeSignature: asNonEmptyString(preview.recipeSignature),
        updatedAt: asNonEmptyString(preview.updatedAt),
      },
      recipe: {
        common: {
          focusRegionId: focusRegionId,
          cropNormalized: normalizeCropBox(common.cropNormalized, defaultCrop),
          redactionBoxes: Array.isArray(common.redactionBoxes)
            ? common.redactionBoxes.map(toRecord)
            : [],
          outputNameHint: asNonEmptyString(common.outputNameHint) || "",
          notes: asNonEmptyString(common.notes) || "",
        },
        video: {
          ...defaults.recipe.video,
          ...toRecord(recipe.video),
        },
        audio: {
          ...defaults.recipe.audio,
          ...toRecord(recipe.audio),
        },
        image: {
          ...defaults.recipe.image,
          ...toRecord(recipe.image),
        },
      },
      outputs: outputs,
    };
  }

  return {
    getFocusRegionMap,
    getDefaultFocusRegionId,
    getFocusRegionCrop,
    getResizePresetMap,
    getDefaultEditPresetId,
    mergeObjects,
    createDefaultEditState,
    normalizeCropBox,
    normalizeEditOutput,
    normalizeEditState,
  };
}

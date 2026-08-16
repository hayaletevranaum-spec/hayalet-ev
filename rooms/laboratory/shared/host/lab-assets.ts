import type { LabAsset, LabAssetType, LabRecord } from "../../domain/lab-types.js";

const LAB_ASSET_TYPES: LabAssetType[] = [
  "source",
  "clip",
  "frame",
  "audio",
  "image",
  "report",
  "artifact",
];

type ProjectLike = Record<string, unknown> & {
  id?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  source?: unknown;
};

type OutputAssetInput = {
  id?: string;
  type: LabAssetType;
  name?: string | null;
  localPath?: string | null;
  url?: string | null;
  createdAt?: number;
  sourceId?: string | null;
  derivedFromAssetId?: string | null;
  derivedFromSourceId?: string | null;
  runId?: string | null;
  metadata?: LabRecord;
};

function toRecord(value: unknown): LabRecord {
  if (value !== null && typeof value === "object" && Array.isArray(value) === false) {
    return value as LabRecord;
  }
  return {};
}

function asString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function asNonEmptyString(value: unknown): string | null {
  const text = asString(value).trim();
  return text !== "" ? text : null;
}

function asTimestamp(value: unknown, fallback = Date.now()): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const text = asNonEmptyString(value);
  if (text !== null) {
    const parsed = Date.parse(text);
    if (Number.isNaN(parsed) !== true) {
      return parsed;
    }
  }
  return fallback;
}

function isLabAssetType(value: unknown): value is LabAssetType {
  return LAB_ASSET_TYPES.includes(value as LabAssetType);
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function basename(value: string): string {
  const parts = value.split(/[\\/]/);
  return parts[parts.length - 1] || value;
}

function deriveProjectId(project: ProjectLike): string {
  return asNonEmptyString(project["id"]) || "project";
}

function getProjectSource(project: ProjectLike): LabRecord {
  return toRecord(project["source"]);
}

export function deriveLabSourceId(project: ProjectLike): string | null {
  const source = getProjectSource(project);
  const storedPath = asNonEmptyString(source["storedPath"]);
  const sourceUrl = asNonEmptyString(source["sourceUrl"]);
  const sourceKind = asNonEmptyString(source["kind"]) || "unknown";
  const identity = storedPath || sourceUrl;
  if (identity === null) {
    return null;
  }
  return `source-${hashText([deriveProjectId(project), sourceKind, identity].join("|"))}`;
}

export function normalizeLabAsset(value: unknown): LabAsset | null {
  const record = toRecord(value);
  const id = asNonEmptyString(record["id"]);
  const type = record["type"];
  if (id === null || isLabAssetType(type) !== true) {
    return null;
  }

  const name = asNonEmptyString(record["name"]);
  if (name === null) {
    return null;
  }

  const localPath = asNonEmptyString(record["localPath"]);
  const url = asNonEmptyString(record["url"]);
  const sourceId = asNonEmptyString(record["sourceId"]);
  const derivedFromAssetId = asNonEmptyString(record["derivedFromAssetId"]);
  const derivedFromSourceId = asNonEmptyString(record["derivedFromSourceId"]);
  const runId = asNonEmptyString(record["runId"]);
  const metadata = toRecord(record["metadata"]);

  return {
    id,
    type,
    name,
    ...(url === null ? {} : { url }),
    ...(localPath === null ? {} : { localPath }),
    createdAt: asTimestamp(record["createdAt"]),
    ...(sourceId === null ? {} : { sourceId }),
    ...(derivedFromAssetId === null ? {} : { derivedFromAssetId }),
    ...(derivedFromSourceId === null ? {} : { derivedFromSourceId }),
    ...(runId === null ? {} : { runId }),
    ...(Object.keys(metadata).length === 0 ? {} : { metadata }),
  };
}

export function normalizeLabAssets(value: unknown): LabAsset[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const assets: LabAsset[] = [];
  value.forEach(function (entry) {
    const asset = normalizeLabAsset(entry);
    if (asset === null || assets.some((existing) => existing.id === asset.id)) {
      return;
    }
    assets.push(asset);
  });
  return assets;
}

export function upsertLabAsset(assetsValue: unknown, assetValue: unknown): LabAsset[] {
  const assets = normalizeLabAssets(assetsValue);
  const asset = normalizeLabAsset(assetValue);
  if (asset === null) {
    return assets;
  }
  const index = assets.findIndex(function (entry) {
    return entry.id === asset.id;
  });
  if (index === -1) {
    return assets.concat(asset);
  }
  const nextAssets = assets.slice();
  nextAssets[index] = {
    ...nextAssets[index],
    ...asset,
  };
  return nextAssets;
}

export function removeLabAssetById(assetsValue: unknown, assetId: unknown): LabAsset[] {
  const id = asNonEmptyString(assetId);
  if (id === null) {
    return normalizeLabAssets(assetsValue);
  }
  return normalizeLabAssets(assetsValue).filter(function (asset) {
    return asset.id !== id;
  });
}

export function findLabAssetById(project: ProjectLike, assetId: unknown): LabAsset | null {
  const id = asNonEmptyString(assetId);
  if (id === null) {
    return null;
  }
  return (
    normalizeLabAssets((project as Record<string, unknown>)["assets"]).find(function (asset) {
      return asset.id === id;
    }) || null
  );
}

export function buildSourceLabAsset(project: ProjectLike): LabAsset | null {
  const source = getProjectSource(project);
  const localPath = asNonEmptyString(source["storedPath"]);
  const sourceUrl = asNonEmptyString(source["sourceUrl"]);
  const identity = localPath || sourceUrl;
  const sourceId = deriveLabSourceId(project);
  if (identity === null || sourceId === null) {
    return null;
  }

  const sourceKind = asNonEmptyString(source["kind"]) || "video";
  const routeLabel = asNonEmptyString(source["routeLabel"]);
  const storedFileName = asNonEmptyString(source["storedFileName"]);
  const sourceMetadata = toRecord(source["metadata"]);
  const derivedFromAssetId = asNonEmptyString(sourceMetadata["derivedFromAssetId"]);
  const derivedFromSourceId = asNonEmptyString(sourceMetadata["derivedFromSourceId"]);
  const name =
    storedFileName ||
    (localPath === null ? null : basename(localPath)) ||
    (sourceUrl === null ? null : sourceUrl) ||
    "Source";

  return {
    id: sourceId,
    type: "source",
    name,
    ...(sourceUrl === null ? {} : { url: sourceUrl }),
    ...(localPath === null ? {} : { localPath }),
    createdAt: asTimestamp(sourceMetadata["extractedAt"], asTimestamp(project["createdAt"])),
    sourceId,
    ...(derivedFromAssetId === null ? {} : { derivedFromAssetId }),
    ...(derivedFromSourceId === null ? {} : { derivedFromSourceId }),
    metadata: {
      ...sourceMetadata,
      kind: sourceKind,
      mode: asNonEmptyString(source["mode"]) || "local",
      mimeType: asNonEmptyString(source["mimeType"]),
      routeLabel,
      storedFileName,
      projectId: deriveProjectId(project),
    },
  };
}

function isReusedSourceAssetMirror(asset: LabAsset, assets: LabAsset[]): boolean {
  if (asset.type !== "source") {
    return false;
  }

  const metadata = toRecord(asset.metadata);
  const originAssetType = asNonEmptyString(metadata["originAssetType"]);
  if (originAssetType !== null && originAssetType !== "source") {
    return true;
  }

  const originAssetId =
    asNonEmptyString(metadata["originAssetId"]) ||
    asNonEmptyString(metadata["derivedFromAssetId"]) ||
    asNonEmptyString(asset.derivedFromAssetId);
  if (originAssetId === null) {
    return false;
  }

  return assets.some(function (candidate) {
    return candidate.id === originAssetId && candidate.type !== "source";
  });
}

function removeReusedSourceAssetMirrors(assets: LabAsset[]): LabAsset[] {
  return assets.filter(function (asset) {
    return isReusedSourceAssetMirror(asset, assets) !== true;
  });
}

export function syncSourceLabAssetForProject(
  project: ProjectLike,
  assetsValue: unknown
): LabAsset[] {
  const assets = removeReusedSourceAssetMirrors(normalizeLabAssets(assetsValue));
  const sourceAsset = buildSourceLabAsset(project);
  if (sourceAsset === null) {
    return assets;
  }

  const sourceMetadata = toRecord(getProjectSource(project)["metadata"]);
  const originAssetId =
    asNonEmptyString(sourceMetadata["originAssetId"]) ||
    asNonEmptyString(sourceMetadata["derivedFromAssetId"]);
  const originAssetType = asNonEmptyString(sourceMetadata["originAssetType"]);
  const mirrorsReusedAsset =
    originAssetId !== null &&
    originAssetType !== "source" &&
    (originAssetType !== null || originAssetId !== sourceAsset.id);

  if (mirrorsReusedAsset) {
    return assets.filter(function (asset) {
      return asset.type !== "source" || asset.id !== sourceAsset.id;
    });
  }
  return upsertLabAsset(assets, sourceAsset);
}

export function createLabOutputAsset(project: ProjectLike, input: OutputAssetInput): LabAsset {
  const localPath = asNonEmptyString(input.localPath);
  const url = asNonEmptyString(input.url);
  const name =
    asNonEmptyString(input.name) ||
    (localPath === null ? null : basename(localPath)) ||
    (url === null ? null : url) ||
    input.type;
  const sourceId = asNonEmptyString(input.sourceId) || deriveLabSourceId(project) || undefined;
  const derivedFromAssetId = asNonEmptyString(input.derivedFromAssetId) || undefined;
  const derivedFromSourceId = asNonEmptyString(input.derivedFromSourceId) || undefined;
  const runId = asNonEmptyString(input.runId) || undefined;
  const id =
    asNonEmptyString(input.id) ||
    `asset-${input.type}-${hashText([deriveProjectId(project), input.type, localPath || url || name].join("|"))}`;

  return {
    id,
    type: input.type,
    name,
    ...(url === null ? {} : { url }),
    ...(localPath === null ? {} : { localPath }),
    createdAt: typeof input.createdAt === "number" ? input.createdAt : Date.now(),
    ...(sourceId === undefined ? {} : { sourceId }),
    ...(derivedFromAssetId === undefined ? {} : { derivedFromAssetId }),
    ...(derivedFromSourceId === undefined ? {} : { derivedFromSourceId }),
    ...(runId === undefined ? {} : { runId }),
    ...(input.metadata && Object.keys(input.metadata).length > 0
      ? { metadata: input.metadata }
      : {}),
  };
}

export function serializeLabAssetForSnapshot(
  value: unknown,
  toFileUrl: (path: unknown) => string
): LabAsset | null {
  const asset = normalizeLabAsset(value);
  if (asset === null) {
    return null;
  }
  const fileUrl = asset.localPath ? toFileUrl(asset.localPath) : asset.url || "";
  return {
    ...asset,
    ...(fileUrl === "" ? {} : { url: fileUrl }),
  };
}

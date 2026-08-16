import { asLabRecord, asNonEmptyString, asNumber } from "../../domain/lab-types.js";
import type { LabAsset, LabAssetType } from "../../domain/lab-types.js";

const LAB_ASSET_TYPES: LabAssetType[] = [
  "source",
  "clip",
  "frame",
  "audio",
  "image",
  "report",
  "artifact",
];

function normalizeAssetType(value: unknown): LabAssetType | null {
  return LAB_ASSET_TYPES.includes(value as LabAssetType) ? (value as LabAssetType) : null;
}

export function normalizeStoreAsset(value: unknown): LabAsset | null {
  const record = asLabRecord(value);
  const id = asNonEmptyString(record["id"]);
  const type = normalizeAssetType(record["type"]);
  const name = asNonEmptyString(record["name"]);
  if (id === null || type === null || name === null) {
    return null;
  }

  const url = asNonEmptyString(record["url"]);
  const localPath = asNonEmptyString(record["localPath"]);
  const sourceId = asNonEmptyString(record["sourceId"]);
  const derivedFromAssetId = asNonEmptyString(record["derivedFromAssetId"]);
  const derivedFromSourceId = asNonEmptyString(record["derivedFromSourceId"]);
  const runId = asNonEmptyString(record["runId"]);
  const metadata = asLabRecord(record["metadata"]);

  return {
    id,
    type,
    name,
    ...(url === null ? {} : { url }),
    ...(localPath === null ? {} : { localPath }),
    createdAt: asNumber(record["createdAt"]) || Date.now(),
    ...(sourceId === null ? {} : { sourceId }),
    ...(derivedFromAssetId === null ? {} : { derivedFromAssetId }),
    ...(derivedFromSourceId === null ? {} : { derivedFromSourceId }),
    ...(runId === null ? {} : { runId }),
    ...(Object.keys(metadata).length === 0 ? {} : { metadata }),
  };
}

export function normalizeStoreAssets(value: unknown): LabAsset[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const assets: LabAsset[] = [];
  value.forEach(function (entry) {
    const asset = normalizeStoreAsset(entry);
    if (asset === null || assets.some((existing) => existing.id === asset.id)) {
      return;
    }
    assets.push(asset);
  });
  return assets;
}

export function upsertStoreAsset(assets: LabAsset[], assetValue: unknown): LabAsset[] {
  const asset = normalizeStoreAsset(assetValue);
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

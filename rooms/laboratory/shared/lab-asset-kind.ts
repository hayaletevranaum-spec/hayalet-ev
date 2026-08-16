import { asLabRecord, asNonEmptyString } from "../domain/lab-types.js";
import type { LabAsset } from "../domain/lab-types.js";

export type LabAssetSourceKind = "video" | "audio" | "image";
export type LabAssetContentKind = LabAssetSourceKind | "document" | "unsupported";

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]);
const VIDEO_EXTENSIONS = new Set(["avi", "m4v", "mkv", "mov", "mp4", "mpeg", "mpg", "webm"]);
const AUDIO_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "ogg", "opus", "wav", "webm"]);
const DOCUMENT_EXTENSIONS = new Set([
  "csv",
  "html",
  "htm",
  "json",
  "log",
  "md",
  "pdf",
  "txt",
  "xml",
]);

export function getLabPathExtension(path: string | null): string | null {
  if (path === null) {
    return null;
  }
  const cleanPath = path.split(/[?#]/)[0] || "";
  const leaf = cleanPath.split(/[\\/]/).pop() || cleanPath;
  const dotIndex = leaf.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === leaf.length - 1) {
    return null;
  }
  return leaf.slice(dotIndex + 1).toLowerCase();
}

function getLabAssetCandidatePath(asset: LabAsset): string | null {
  return (
    asNonEmptyString(asset.localPath) || asNonEmptyString(asset.url) || asNonEmptyString(asset.name)
  );
}

export function getLabSourceKindForExtension(extension: string | null): LabAssetSourceKind | null {
  if (extension !== null && VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }
  if (extension !== null && AUDIO_EXTENSIONS.has(extension)) {
    return "audio";
  }
  if (extension !== null && IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  return null;
}

export function inferLabSourceKindFromUrl(value: string): LabAssetSourceKind {
  return getLabSourceKindForExtension(getLabPathExtension(value)) || "video";
}

export function inferLabAssetSourceKind(asset: LabAsset): LabAssetSourceKind | null {
  const metadata = asLabRecord(asset.metadata);
  const metadataKind =
    asNonEmptyString(metadata["kind"]) || asNonEmptyString(metadata["sourceKind"]);
  if (metadataKind === "video" || metadataKind === "audio" || metadataKind === "image") {
    return metadataKind;
  }
  if (asset.type === "audio") {
    return "audio";
  }
  if (asset.type === "frame" || asset.type === "image") {
    return "image";
  }
  const extensionKind = getLabSourceKindForExtension(
    getLabPathExtension(getLabAssetCandidatePath(asset))
  );
  if (extensionKind !== null) {
    return extensionKind;
  }
  if (asset.type === "source" || asset.type === "clip") {
    return "video";
  }
  return null;
}

export function inferLabAssetContentKind(
  asset: LabAsset,
  path: string | null = getLabAssetCandidatePath(asset),
  options: { usesThumbnail?: boolean } = {}
): LabAssetContentKind {
  const metadata = asLabRecord(asset.metadata);
  if (options.usesThumbnail === true && asNonEmptyString(metadata["thumbnailUrl"]) !== null) {
    return "image";
  }

  const sourceKind = inferLabAssetSourceKind(asset);
  if (sourceKind !== null) {
    return sourceKind;
  }

  const extension = getLabPathExtension(path);
  if (extension !== null && DOCUMENT_EXTENSIONS.has(extension)) {
    return "document";
  }
  if (asset.type === "report") {
    return "document";
  }
  return "unsupported";
}

import { getMimeTypeFromPath } from "../../constants/index.js";

const roomRuntimeAssetSourceCache = new Map<string, string>();

function normalizeRoomRuntimeSource(rawSource: string): string {
  const normalized = rawSource.replace(/\\/g, "/").trim();
  if (normalized.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(normalized).pathname);
    } catch {
      return normalized;
    }
  }

  return normalized;
}

function isBrowserLoadableRoomRuntimeSource(source: string): boolean {
  return (
    source.startsWith("data:") ||
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    source.startsWith("blob:") ||
    source.startsWith("/assets/")
  );
}

export function canUseDirectFileUrls(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.location.protocol !== "http:" && window.location.protocol !== "https:";
}

function getRoomRuntimeAssetFallback(source: string): string {
  if (source === "") {
    return "";
  }

  if (isBrowserLoadableRoomRuntimeSource(source)) {
    return source;
  }

  if (!source.startsWith("/") && !/^[a-zA-Z]:\//.test(source)) {
    return `/${source.replace(/^\/+/, "")}`;
  }

  return canUseDirectFileUrls() ? toRoomRuntimeFileUrl(source) : "";
}

export function getRoomRuntimeAssetSource(rawSource: string | null | undefined): string {
  const source = normalizeRoomRuntimeSource(rawSource ?? "");
  if (source === "") {
    return "";
  }

  const cached = roomRuntimeAssetSourceCache.get(source);
  if (cached !== undefined) {
    return cached;
  }

  return getRoomRuntimeAssetFallback(source);
}

export async function resolveRoomRuntimeAssetSource(
  rawSource: string | null | undefined
): Promise<string> {
  const source = normalizeRoomRuntimeSource(rawSource ?? "");
  if (source === "") {
    return "";
  }

  if (isBrowserLoadableRoomRuntimeSource(source)) {
    roomRuntimeAssetSourceCache.set(source, source);
    return source;
  }

  const cached = roomRuntimeAssetSourceCache.get(source);
  if (cached !== undefined) {
    return cached;
  }

  const readFile = window.electronAPI?.["readFile"];
  if (typeof readFile === "function") {
    try {
      const base64 = await readFile(source);
      if (typeof base64 === "string" && base64 !== "") {
        const dataUrl = `data:${getMimeTypeFromPath(source)};base64,${base64}`;
        roomRuntimeAssetSourceCache.set(source, dataUrl);
        return dataUrl;
      }
    } catch {
      // Fall through to non-preload fallbacks for browser-only flows.
    }
  }

  const fallback = getRoomRuntimeAssetFallback(source);
  if (fallback !== "") {
    roomRuntimeAssetSourceCache.set(source, fallback);
  }
  return fallback;
}

export function toRoomRuntimeFileUrl(runtimeEntryPath: string): string {
  const normalized = runtimeEntryPath.replace(/\\/g, "/");
  const url = new URL("file:///");
  url.pathname = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return url.toString();
}

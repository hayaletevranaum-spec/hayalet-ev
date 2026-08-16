import { getMimeTypeFromPath } from "../../constants/index.js";

const avatarCache = new Map<string, string | null>();

function normalizeAvatarSource(rawSource: string): string {
  if (rawSource.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(rawSource).pathname);
    } catch {
      return rawSource;
    }
  }

  return rawSource;
}

function isBrowserLoadableAvatarSource(value: string): boolean {
  return (
    value.startsWith("data:") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("blob:") ||
    value.startsWith("/assets/")
  );
}

export async function resolveSceneAvatarSource(
  rawSource: string | null | undefined
): Promise<string | null> {
  const source = normalizeAvatarSource((rawSource ?? "").trim());
  if (source === "") {
    return null;
  }

  if (isBrowserLoadableAvatarSource(source)) {
    return source;
  }

  if (avatarCache.has(source)) {
    return avatarCache.get(source) ?? null;
  }

  const readFile = window.electronAPI?.["readFile"] as
    ((path: string) => Promise<string | null>) | undefined;
  if (typeof readFile !== "function") {
    avatarCache.set(source, null);
    return null;
  }

  try {
    const base64 = await readFile(source);
    if (typeof base64 !== "string" || base64 === "") {
      avatarCache.set(source, null);
      return null;
    }

    const dataUrl = `data:${getMimeTypeFromPath(source)};base64,${base64}`;
    avatarCache.set(source, dataUrl);
    return dataUrl;
  } catch {
    avatarCache.set(source, null);
    return null;
  }
}

export function getExtension(filePath: string): string {
  if (filePath === "") return "";
  return filePath.split(".").pop()?.toLowerCase() ?? "";
}

export function getFilename(filePath: string): string {
  if (filePath === "") return "";
  return filePath.split(/[/\\]/).pop() ?? "";
}

export function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    ico: "image/x-icon",
    pdf: "application/pdf",
    txt: "text/plain",
    json: "application/json",
    js: "text/javascript",
    css: "text/css",
    html: "text/html",
    xml: "application/xml",
    zip: "application/zip",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    wav: "audio/wav",
  };
  return mimeTypes[ext.toLowerCase()] ?? "application/octet-stream";
}

export function getMimeTypeFromPath(filePath: string): string {
  const ext = getExtension(filePath);
  return getMimeType(ext);
}

export function generateUniqueId(prefix = "id"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function sanitizeEmail(email: string): string {
  if (email === "") return "";
  return email.toLowerCase().trim().replace(/@/g, "_at_").replace(/\./g, "_");
}

export function generateAccountId(email: string, provider: string): string {
  if (email === "" || provider === "") return "";
  return `${provider}_${sanitizeEmail(email)}`;
}

export function decodeBase64(base64: string): string {
  if (base64 === "") return "";
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(bytes);
  } catch (_err) {
    return "";
  }
}

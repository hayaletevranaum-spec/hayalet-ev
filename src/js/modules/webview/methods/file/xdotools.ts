import { AppI18n } from "../../../i18n/index.js";

interface FilePayload {
  name: string;
  path?: string;
  base64?: string;
  mimeType?: string;
}

interface AttachResult {
  success: boolean;
  message: string;
  injected?: boolean;
}

function uploadT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.upload.${key}`, params);
}

export async function attachFiles(
  _webview: HTMLElement,
  { files }: { files: FilePayload[] }
): Promise<AttachResult> {
  if (files.length === 0) {
    return await Promise.resolve({ success: false, message: uploadT("noFiles") });
  }

  return await Promise.resolve({
    success: false,
    message: uploadT("xdotoolsNotImplemented"),
    injected: false,
  });
}

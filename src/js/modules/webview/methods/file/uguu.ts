import { LogCategory } from "@shared/logging-core";
import { UploadManager } from "../../../upload-manager.js";
import { Logger } from "../../../logger/index.js";

interface FilePayload {
  name: string;
  path?: string;
  base64?: string;
  mimeType?: string;
}

export async function attachFiles(
  _webview: HTMLElement,
  { files }: { files: FilePayload[] }
): Promise<{
  success: boolean;
  message: string;
  injected: boolean;
  uploadedLinks?: string[];
  errors?: { file: string; error: string }[];
}> {
  const validation = UploadManager.validateFiles(files);
  if (!validation.valid) {
    return UploadManager.createError(validation.message ?? UploadManager.t("validationFailed"));
  }

  if (!UploadManager.isServiceAvailable("UGUU")) {
    return UploadManager.serviceUnavailable("Uguu");
  }

  try {
    const { uploadedLinks, uploadErrors } = await UploadManager.uploadMultipleFiles("UGUU", files);

    return UploadManager.formatResponse(uploadedLinks, uploadErrors, "Uguu");
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    Logger.error(
      LogCategory.WEBVIEW,
      UploadManager.t("uploadFailed", { service: "Uguu", reason: errorMsg }),
      { error: errorMsg }
    );
    return UploadManager.createError(errorMsg, [], "Uguu");
  }
}

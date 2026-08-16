import { AppI18n } from "./i18n/index.js";
import { formatErrorWithDetail } from "../../../shared/i18n/error-detail.js";

interface FilePayload {
  name: string;
  path?: string;
  base64?: string;
  mimeType?: string;
}

interface UploadError {
  file: string;
  error: string;
}

type ServiceName = "CATBOX" | "UGUU" | "TMPFILE" | "GOOGLEDRIVE";

function uploadT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.upload.${key}`, params);
}

function uploadError(
  key: string,
  detail?: unknown,
  params?: Record<string, string | number>
): string {
  return formatErrorWithDetail(uploadT(key, params), detail);
}

function getServiceLabel(serviceName: string): string {
  const labels: Record<string, string> = {
    CATBOX: "Catbox",
    UGUU: "Uguu",
    TMPFILE: "Tmpfile",
    GOOGLEDRIVE: "Google Drive",
    Drive: "Drive",
  };

  return labels[serviceName] ?? serviceName;
}

const UPLOAD_SERVICES: Record<ServiceName, { ipcMethod: string; available: () => boolean }> = {
  CATBOX: {
    ipcMethod: "catboxUpload",
    available: () => !!window.electronAPI?.["catboxUpload"],
  },
  UGUU: {
    ipcMethod: "uguuUpload",
    available: () => !!window.electronAPI?.["uguuUpload"],
  },
  TMPFILE: {
    ipcMethod: "tmpfileUpload",
    available: () => !!window.electronAPI?.["tmpfileUpload"],
  },
  GOOGLEDRIVE: {
    ipcMethod: "googledriveUpload",
    available: () => !!window.electronAPI?.["googledriveUpload"],
  },
};

type UploadResponse = {
  success: boolean;
  message: string;
  uploadedLinks?: string[];
  errors?: UploadError[];
  injected: boolean;
};

const uploadManager = {
  isServiceAvailable(serviceName: ServiceName): boolean {
    const service = UPLOAD_SERVICES[serviceName];
    try {
      return service.available();
    } catch {
      return false;
    }
  },

  validateFiles(files: FilePayload[]): { valid: boolean; message?: string } {
    if (files.length === 0) {
      return { valid: false, message: uploadT("noFiles") };
    }

    for (const file of files) {
      if (file.name === "" || file.base64 === undefined || file.base64 === "") {
        return {
          valid: false,
          message: uploadT("invalidFile", {
            name: file.name !== "" ? file.name : uploadT("untitledFile"),
          }),
        };
      }
    }

    return { valid: true };
  },

  async uploadMultipleFiles(
    serviceName: ServiceName,
    files: FilePayload[]
  ): Promise<{ uploadedLinks: string[]; uploadErrors: UploadError[] }> {
    const service = UPLOAD_SERVICES[serviceName];

    const api = window.electronAPI;
    const ipcMethod = api?.[service.ipcMethod as keyof typeof api] as
      | ((options: unknown) => Promise<{ success?: boolean; url?: string; message?: string }>)
      | undefined;
    if (!ipcMethod) {
      throw new Error(uploadT("ipcMethodUnavailable", { method: service.ipcMethod }));
    }

    const uploadResults = await Promise.all(
      files.map(async (file) => {
        try {
          const result = await ipcMethod({
            name: file.name,
            mimeType: file.mimeType,
            base64: file.base64,
          });

          if (result.success === true && result.url !== undefined && result.url !== "") {
            return { link: result.url };
          } else {
            return {
              error: {
                file: file.name,
                error: uploadError("uploadFailedGeneric", result.message),
              },
            };
          }
        } catch (err) {
          return {
            error: {
              file: file.name,
              error: uploadError("uploadFailedGeneric", err),
            },
          };
        }
      })
    );

    const uploadedLinks = uploadResults
      .map((result) => result.link)
      .filter((link): link is string => typeof link === "string" && link !== "");
    const uploadErrors = uploadResults
      .map((result) => result.error)
      .filter((error): error is UploadError => error !== undefined);

    return { uploadedLinks, uploadErrors };
  },

  async uploadGoogleDrive(
    files: FilePayload[]
  ): Promise<{ uploadedLinks: string[]; errors: UploadError[] }> {
    if (!this.isServiceAvailable("GOOGLEDRIVE")) {
      throw new Error(uploadT("googleDriveIpcUnavailable"));
    }

    const payloadFiles = files.map((f) => ({
      name: f.name,
      mimeType: f.mimeType,
      base64: f.base64,
    }));

    const electronApi = window.electronAPI;
    const googledriveUpload = electronApi?.["googledriveUpload"] as
      | ((options: { files: { name: string; mimeType?: string; base64?: string }[] }) => Promise<{
          success?: boolean;
          message?: string;
          uploadedLinks?: string[];
          uploaded?: string[];
          data?: { uploadedLinks?: string[] };
          errors?: string[];
        }>)
      | undefined;
    if (typeof googledriveUpload !== "function") {
      throw new Error(uploadT("googleDriveIpcUnavailable"));
    }

    const result = await googledriveUpload({
      files: payloadFiles as { name: string; mimeType?: string; base64?: string }[],
    });

    if (result.success !== true) {
      throw new Error(uploadError("googleDriveUploadFailed", result.message));
    }

    const uploaded = result.uploadedLinks ?? result.uploaded ?? result.data?.uploadedLinks ?? [];

    const rawErrors = result.errors ?? [];
    const mappedErrors: UploadError[] = Array.isArray(rawErrors)
      ? rawErrors.map((e: string) => ({ file: "", error: e }))
      : [];

    return {
      uploadedLinks: Array.isArray(uploaded) ? uploaded : [],
      errors: mappedErrors,
    };
  },

  formatResponse(
    uploadedLinks: string[],
    errors: UploadError[] = [],
    serviceName = ""
  ): UploadResponse {
    const resolvedServiceName = getServiceLabel(serviceName);
    if (uploadedLinks.length === 0) {
      const errorSummary = errors
        .map((err) =>
          err.error !== "" ? `${err.file !== "" ? `${err.file}: ` : ""}${err.error}` : ""
        )
        .filter((entry) => entry !== "")
        .join("; ");
      return {
        success: false,
        message: uploadT("uploadFailed", {
          service: resolvedServiceName,
          reason: errorSummary !== "" ? errorSummary : uploadT("unknownError"),
        }),
        errors,
        injected: false,
      };
    }

    return {
      success: true,
      message: uploadT("uploadSuccess", { count: uploadedLinks.length }),
      uploadedLinks,
      ...(errors.length > 0 ? { errors } : {}),
      injected: false,
    };
  },

  createError(message: string, errors: UploadError[] = [], serviceName = ""): UploadResponse {
    const resolvedServiceName = serviceName !== "" ? getServiceLabel(serviceName) : "";
    return {
      success: false,
      message:
        resolvedServiceName !== ""
          ? uploadT("serviceError", { service: resolvedServiceName, message })
          : message,
      errors,
      injected: false,
    };
  },

  serviceUnavailable(serviceName: string): UploadResponse {
    return this.createError(
      uploadT("serviceUnavailable", { service: getServiceLabel(serviceName) })
    );
  },

  t(key: string, params?: Record<string, string | number>): string {
    return uploadT(key, params);
  },
};

export { uploadManager, uploadManager as UploadManager };

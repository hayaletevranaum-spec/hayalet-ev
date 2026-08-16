import type {
  TranscriptIngressPayload,
  TranscriptManagedModelId,
  TranscriptManagedModelStatus,
  TranscriptRuntimeStatus,
  TranscriptSubmitIngressRequest,
  TranscriptSubmitIngressResult,
  TranscriptTranscriptionRequest,
  TranscriptTranscriptionResult,
} from "../../../types/transcript.js";

const FALLBACK_STATUS: TranscriptRuntimeStatus = {
  state: "missing-runtime",
  ready: false,
  backend: "whisper.cpp",
  binaryPath: null,
  modelPath: null,
  modelId: "base",
  modelLanguage: "auto",
  appLanguage: "tr",
  activeLanguage: "tr",
  activeVariant: "full",
  message: "Electron transcript bridge is unavailable.",
};

function getElectronApi(): typeof window.electronAPI | undefined {
  return window.electronAPI;
}

function normalizeRuntimeStatus(value: unknown): TranscriptRuntimeStatus {
  if (
    typeof value === "object" &&
    value !== null &&
    "ready" in value &&
    "state" in value &&
    "binaryPath" in value &&
    "modelPath" in value
  ) {
    return value as TranscriptRuntimeStatus;
  }

  return FALLBACK_STATUS;
}

function normalizeTranscriptionResult(value: unknown): TranscriptTranscriptionResult {
  if (typeof value === "object" && value !== null && "success" in value && "status" in value) {
    const result = value as TranscriptTranscriptionResult;
    return {
      ...result,
      status: normalizeRuntimeStatus(result.status),
    };
  }

  return {
    success: false,
    status: FALLBACK_STATUS,
    error: "Electron transcript bridge is unavailable.",
  };
}

function normalizeSubmitIngressResult(value: unknown): TranscriptSubmitIngressResult {
  if (typeof value === "object" && value !== null && "success" in value) {
    return value as TranscriptSubmitIngressResult;
  }

  return {
    success: false,
    error: "Electron transcript bridge is unavailable.",
  };
}

function normalizeManagedModelStatus(value: unknown): TranscriptManagedModelStatus | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "modelId" in value &&
    "label" in value &&
    "installed" in value
  ) {
    return value as TranscriptManagedModelStatus;
  }

  return null;
}

export async function getTranscriptStatus(): Promise<TranscriptRuntimeStatus> {
  const api = getElectronApi();
  if (typeof api?.transcriptStatus !== "function") {
    return FALLBACK_STATUS;
  }

  return normalizeRuntimeStatus(await api.transcriptStatus());
}

export async function ensureTranscriptRuntime(): Promise<TranscriptRuntimeStatus> {
  const api = getElectronApi();
  if (typeof api?.transcriptEnsureRuntime !== "function") {
    return FALLBACK_STATUS;
  }

  return normalizeRuntimeStatus(await api.transcriptEnsureRuntime());
}

export async function listTranscriptModels(): Promise<TranscriptManagedModelStatus[]> {
  const api = getElectronApi();
  if (typeof api?.transcriptListModels !== "function") {
    return [];
  }

  const value = await api.transcriptListModels();
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeManagedModelStatus(entry))
    .filter((entry): entry is TranscriptManagedModelStatus => entry !== null);
}

export async function installTranscriptModel(
  modelId: TranscriptManagedModelId
): Promise<TranscriptManagedModelStatus | null> {
  const api = getElectronApi();
  if (typeof api?.transcriptInstallModel !== "function") {
    return null;
  }

  return normalizeManagedModelStatus(await api.transcriptInstallModel(modelId));
}

export async function removeTranscriptModel(
  modelId: TranscriptManagedModelId
): Promise<TranscriptManagedModelStatus | null> {
  const api = getElectronApi();
  if (typeof api?.transcriptRemoveModel !== "function") {
    return null;
  }

  return normalizeManagedModelStatus(await api.transcriptRemoveModel(modelId));
}

export async function transcribeLocalAudio(
  request: TranscriptTranscriptionRequest
): Promise<TranscriptTranscriptionResult> {
  const api = getElectronApi();
  if (typeof api?.transcriptTranscribeLocal !== "function") {
    return {
      success: false,
      status: FALLBACK_STATUS,
      error: "Electron transcript bridge is unavailable.",
    };
  }

  return normalizeTranscriptionResult(await api.transcriptTranscribeLocal(request));
}

export async function submitTranscriptIngress(
  request: TranscriptSubmitIngressRequest
): Promise<TranscriptSubmitIngressResult> {
  const api = getElectronApi();
  if (typeof api?.transcriptSubmitIngress !== "function") {
    return {
      success: false,
      error: "Electron transcript bridge is unavailable.",
    };
  }

  return normalizeSubmitIngressResult(await api.transcriptSubmitIngress(request));
}

export function onTranscriptIngress(
  callback: (payload: TranscriptIngressPayload) => void
): () => void {
  const api = getElectronApi();
  if (api == null) {
    return () => {};
  }

  const { transcriptOnIngress, transcriptOffIngress } = api;
  if (typeof transcriptOnIngress !== "function" || typeof transcriptOffIngress !== "function") {
    return () => {};
  }

  transcriptOnIngress(callback);
  return () => {
    transcriptOffIngress(callback);
  };
}

export function onAssistantTranscriptIngress(
  callback: (payload: TranscriptIngressPayload) => void
): () => void {
  const api = getElectronApi();
  if (api == null) {
    return () => {};
  }

  const { assistantOnTranscriptIngress, assistantOffTranscriptIngress } = api;
  if (
    typeof assistantOnTranscriptIngress !== "function" ||
    typeof assistantOffTranscriptIngress !== "function"
  ) {
    return () => {};
  }

  assistantOnTranscriptIngress(callback);
  return () => {
    assistantOffTranscriptIngress(callback);
  };
}

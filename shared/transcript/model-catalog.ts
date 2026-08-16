import { resolveSelectorLanguage } from "../i18n/locale.js";
import type {
  TranscriptDictationBackend,
  TranscriptManagedModelDescriptor,
  TranscriptManagedModelId,
  TranscriptModelVariant,
  TranscriptSupportedLanguage,
} from "../../src/types/transcript.js";

const TRANSCRIPT_MODEL_CATALOG: Record<TranscriptManagedModelId, TranscriptManagedModelDescriptor> =
  {
    tiny: {
      modelId: "tiny",
      backend: "whisper.cpp",
      variant: "light",
      label: "Tiny Multilingual",
      family: "multilingual",
      locale: "tr",
      englishOnly: false,
      fileName: "ggml-tiny.bin",
      downloadUrl: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
      expectedSha1: "bd577a113a864445d4c299885e0cb97d4ba92b5f",
      expectedBytes: null,
      archiveFormat: "file",
    },
    base: {
      modelId: "base",
      backend: "whisper.cpp",
      variant: "full",
      label: "Base Multilingual",
      family: "multilingual",
      locale: "tr",
      englishOnly: false,
      fileName: "ggml-base.bin",
      downloadUrl: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
      expectedSha1: "465707469ff3a37a2b9b8d8f89f2f99de7299dac",
      expectedBytes: null,
      archiveFormat: "file",
    },
    "tiny.en": {
      modelId: "tiny.en",
      backend: "whisper.cpp",
      variant: "light",
      label: "Tiny English",
      family: "english",
      locale: "en",
      englishOnly: true,
      fileName: "ggml-tiny.en.bin",
      downloadUrl:
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
      expectedSha1: "c78c86eb1a8faa21b369bcd33207cc90d64ae9df",
      expectedBytes: 77704715,
      archiveFormat: "file",
    },
    "base.en": {
      modelId: "base.en",
      backend: "whisper.cpp",
      variant: "full",
      label: "Base English",
      family: "english",
      locale: "en",
      englishOnly: true,
      fileName: "ggml-base.en.bin",
      downloadUrl:
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
      expectedSha1: "137c40403d78fd54d454da0f9bd998f78703390c",
      expectedBytes: 147964211,
      archiveFormat: "file",
    },
    "vosk-small-tr": {
      modelId: "vosk-small-tr",
      backend: "vosk",
      variant: "light",
      label: "Vosk Small Turkish",
      family: "multilingual",
      locale: "tr",
      englishOnly: false,
      fileName: "vosk-model-small-tr-0.3.zip",
      downloadUrl: "https://alphacephei.com/vosk/models/vosk-model-small-tr-0.3.zip",
      expectedSha1: "1bc2391ea03d6091c39c4ff42b627c811501d41f",
      expectedBytes: 36855784,
      archiveFormat: "zip-directory",
      directoryName: "vosk-model-small-tr-0.3",
    },
    "vosk-small-en": {
      modelId: "vosk-small-en",
      backend: "vosk",
      variant: "light",
      label: "Vosk Small English",
      family: "english",
      locale: "en",
      englishOnly: true,
      fileName: "vosk-model-small-en-us-0.15.zip",
      downloadUrl: "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip",
      expectedSha1: "4b5523d1db7688e31e44608cf96cdad92e4603e7",
      expectedBytes: 41205931,
      archiveFormat: "zip-directory",
      directoryName: "vosk-model-small-en-us-0.15",
    },
    "vosk-full-en": {
      modelId: "vosk-full-en",
      backend: "vosk",
      variant: "full",
      label: "Vosk Full English",
      family: "english",
      locale: "en",
      englishOnly: true,
      fileName: "vosk-model-en-us-0.22.zip",
      downloadUrl: "https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip",
      expectedSha1: "5c763fc6d527af15197b542e47c5221a09da25b6",
      expectedBytes: 1913365522,
      archiveFormat: "zip-directory",
      directoryName: "vosk-model-en-us-0.22",
    },
  };

const TRANSCRIPT_MODEL_IDS = Object.keys(
  TRANSCRIPT_MODEL_CATALOG
) as TranscriptManagedModelId[];

export function normalizeTranscriptManagedModelId(value: unknown): TranscriptManagedModelId | null {
  return typeof value === "string" && TRANSCRIPT_MODEL_IDS.includes(value as TranscriptManagedModelId)
    ? (value as TranscriptManagedModelId)
    : null;
}

export function normalizeTranscriptModelVariant(
  value: unknown,
  fallback: TranscriptModelVariant = "full"
): TranscriptModelVariant {
  return value === "light" || value === "full" ? value : fallback;
}

export function normalizeTranscriptBackend(
  value: unknown,
  fallback: TranscriptDictationBackend = "whisper.cpp"
): TranscriptDictationBackend {
  return value === "vosk" || value === "whisper.cpp" ? value : fallback;
}

export function resolveTranscriptSupportedLanguage(value: unknown): TranscriptSupportedLanguage {
  if (typeof value === "string" && value.trim().toLowerCase().startsWith("tr")) {
    return "tr";
  }
  if (resolveSelectorLanguage(value) === "en") {
    return "en";
  }
  return "en";
}

export function resolveTranscriptModelId(
  language: TranscriptSupportedLanguage,
  variant: TranscriptModelVariant,
  backend: TranscriptDictationBackend = "whisper.cpp"
): TranscriptManagedModelId {
  if (backend === "vosk") {
    if (language === "tr") {
      return "vosk-small-tr";
    }
    return variant === "light" ? "vosk-small-en" : "vosk-full-en";
  }

  if (language === "tr") {
    return variant === "light" ? "tiny" : "base";
  }

  return variant === "light" ? "tiny.en" : "base.en";
}

export function getTranscriptModelDescriptor(
  modelId: unknown
): TranscriptManagedModelDescriptor | null {
  const normalizedModelId = normalizeTranscriptManagedModelId(modelId);
  if (normalizedModelId === null) {
    return null;
  }

  return { ...TRANSCRIPT_MODEL_CATALOG[normalizedModelId] };
}

export function listTranscriptModelCatalog(): TranscriptManagedModelDescriptor[] {
  return TRANSCRIPT_MODEL_IDS.map(function (modelId) {
    return { ...TRANSCRIPT_MODEL_CATALOG[modelId] };
  });
}

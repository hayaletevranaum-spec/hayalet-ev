import type {
  TtsLanguage,
  TtsManagedModelId,
  TtsModelDescriptor,
  TtsMode,
} from "../../src/types/tts.js";

const TTS_MODEL_CATALOG: Record<TtsManagedModelId, TtsModelDescriptor> = {
  "tr_TR-dfki-medium": {
    modelId: "tr_TR-dfki-medium",
    engine: "sherpa-onnx",
    language: "tr",
    label: "Turkish DFKI Medium",
    voice: "dfki",
    sampleRate: 22_050,
    licenseUrl: "https://huggingface.co/rhasspy/piper-voices/tree/main/tr/tr_TR/dfki/medium",
    archive: {
      fileName: "vits-piper-tr_TR-dfki-medium.tar.bz2",
      downloadUrl:
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-tr_TR-dfki-medium.tar.bz2",
      expectedBytes: null,
    },
    dataDirName: "espeak-ng-data",
    files: {
      model: {
        fileName: "tr_TR-dfki-medium.onnx",
        downloadUrl:
          "https://huggingface.co/rhasspy/piper-voices/resolve/main/tr/tr_TR/dfki/medium/tr_TR-dfki-medium.onnx",
        expectedBytes: null,
      },
      tokens: {
        fileName: "tokens.txt",
        downloadUrl:
          "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-tr_TR-dfki-medium.tar.bz2",
        expectedBytes: null,
      },
      config: null,
    },
  },
  "en_US-lessac-medium": {
    modelId: "en_US-lessac-medium",
    engine: "sherpa-onnx",
    language: "en",
    label: "English Lessac Medium",
    voice: "lessac",
    sampleRate: 22_050,
    licenseUrl: "https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/lessac/medium",
    archive: {
      fileName: "vits-piper-en_US-lessac-medium.tar.bz2",
      downloadUrl:
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-lessac-medium.tar.bz2",
      expectedBytes: null,
    },
    dataDirName: "espeak-ng-data",
    files: {
      model: {
        fileName: "en_US-lessac-medium.onnx",
        downloadUrl:
          "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
        expectedBytes: null,
      },
      tokens: {
        fileName: "tokens.txt",
        downloadUrl:
          "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-lessac-medium.tar.bz2",
        expectedBytes: null,
      },
      config: null,
    },
  },
};

const TTS_MODEL_IDS = Object.keys(TTS_MODEL_CATALOG) as TtsManagedModelId[];

export function normalizeTtsMode(value: unknown, fallback: TtsMode = "local"): TtsMode {
  return value === "android" || value === "local" ? value : fallback;
}

export function normalizeTtsLanguage(value: unknown, fallback: TtsLanguage = "tr"): TtsLanguage {
  if (typeof value === "string" && value.trim().toLowerCase().startsWith("tr")) {
    return "tr";
  }
  if (typeof value === "string" && value.trim().toLowerCase().startsWith("en")) {
    return "en";
  }
  return fallback;
}

export function resolveTtsLanguageFromLocale(value: unknown): TtsLanguage {
  return normalizeTtsLanguage(value, "en");
}

export function normalizeTtsManagedModelId(value: unknown): TtsManagedModelId | null {
  return typeof value === "string" && TTS_MODEL_IDS.includes(value as TtsManagedModelId)
    ? (value as TtsManagedModelId)
    : null;
}

export function resolveTtsModelId(language: TtsLanguage): TtsManagedModelId {
  return language === "tr" ? "tr_TR-dfki-medium" : "en_US-lessac-medium";
}

export function getTtsModelDescriptor(modelId: unknown): TtsModelDescriptor | null {
  const normalizedModelId = normalizeTtsManagedModelId(modelId);
  if (normalizedModelId === null) {
    return null;
  }

  return { ...TTS_MODEL_CATALOG[normalizedModelId] };
}

export function listTtsModelCatalog(): TtsModelDescriptor[] {
  return TTS_MODEL_IDS.map((modelId) => ({ ...TTS_MODEL_CATALOG[modelId] }));
}

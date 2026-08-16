import { getErrorMessage } from "@shared/index.js";
import type { TranslationParams } from "@shared/i18n.js";
import type { AppSettings, CaptureCommandPhraseSettings } from "@shared/settings.js";
import { SettingsManager } from "../settings-manager.js";
import { AppI18n } from "../i18n/index.js";
import { notifyUser } from "../../ui/user-notification.js";
import { ModalManager } from "../../ui/modal-manager.js";
import { refreshCaptureStatus, runCaptureAction } from "../capture/electron-client.js";
import { getTtsStatus, installTtsModel } from "../tts/electron-client.js";
import type { CaptureAndroidDeviceStatus, CaptureServiceStatus } from "../../../types/capture.js";
import type {
  TranscriptDictationBackend,
  TranscriptModelVariant,
  TranscriptSupportedLanguage,
} from "../../../types/transcript.js";
import type { TtsLanguage, TtsMode, TtsRuntimeStatus } from "../../../types/tts.js";
import type { DictationMode } from "../transcript/dictation-ui.js";
import {
  DEFAULT_AMBIENT_ACTIVE_WINDOW_MS,
  DEFAULT_AMBIENT_SILENCE_TIMEOUT_MS,
  DEFAULT_AMBIENT_WAKE_PHRASES,
  normalizeAmbientDurationMs,
  normalizeAmbientWakePhrases,
} from "../../../../shared/capture/ambient-defaults.js";
import {
  DEFAULT_CAPTURE_COMMAND_PHRASES,
  normalizeCapturePhraseList,
} from "../../../../shared/capture/command-catalog.js";
import {
  normalizeTranscriptBackend,
  normalizeTranscriptModelVariant,
} from "../../../../shared/transcript/model-catalog.js";
import {
  normalizeTtsLanguage,
  normalizeTtsMode,
  resolveTtsLanguageFromLocale,
  resolveTtsModelId,
} from "../../../../shared/tts/model-catalog.js";

type CompanionNotifyKind = "success" | "error" | "warning" | "info";

export interface CompanionOperationSettingsOptions {
  notify?: (kind: CompanionNotifyKind, message: string, dedupeKey: string) => void;
  onCaptureStatus?: (status: CaptureServiceStatus | null) => void;
  onTtsRuntimeStatus?: (status: TtsRuntimeStatus | null) => void;
  onDictationModeChanged?: (mode: DictationMode) => void;
  onVoiceCommandSettingsChanged?: () => void;
  onClose?: () => void;
}

export type CompanionOperationSettingsEvent =
  | { type: "capture-status"; status: CaptureServiceStatus | null }
  | { type: "tts-runtime-status"; status: TtsRuntimeStatus | null }
  | { type: "dictation-mode"; mode: DictationMode }
  | { type: "voice-command-settings-changed" };

type CompanionOperationSettingsEventListener = (event: CompanionOperationSettingsEvent) => void;

const companionOperationSettingsEventListeners = new Set<CompanionOperationSettingsEventListener>();

export function subscribeCompanionOperationSettingsEvents(
  listener: CompanionOperationSettingsEventListener
): () => void {
  companionOperationSettingsEventListeners.add(listener);
  return () => {
    companionOperationSettingsEventListeners.delete(listener);
  };
}

function emitCompanionOperationSettingsEvent(event: CompanionOperationSettingsEvent): void {
  companionOperationSettingsEventListeners.forEach((listener) => {
    listener(event);
  });
}

function companionT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`app.analyze.${key}`, params);
}

function captureDefaults(): NonNullable<AppSettings["capture"]>["defaults"] {
  return SettingsManager.getSnapshot().capture?.defaults ?? {};
}

function captureProviders(): NonNullable<AppSettings["capture"]>["providers"] {
  return SettingsManager.getSnapshot().capture?.providers ?? {};
}

export function settingsDictationMode(): DictationMode {
  return captureDefaults()?.dictationMode === "android" ? "android" : "local";
}

export function dictationLanguage(): TranscriptSupportedLanguage {
  const settings = SettingsManager.getSnapshot();
  const value = captureDefaults()?.dictationLanguage ?? settings.general?.language;
  return typeof value === "string" && value.toLowerCase().startsWith("tr") ? "tr" : "en";
}

function localTranscriptBackend(): TranscriptDictationBackend {
  return normalizeTranscriptBackend(
    SettingsManager.getSnapshot().general?.transcriptBackend,
    "whisper.cpp"
  );
}

function localTranscriptVariant(): TranscriptModelVariant {
  return normalizeTranscriptModelVariant(
    SettingsManager.getSnapshot().general?.transcriptModelVariant,
    "full"
  );
}

export function ttsMode(): TtsMode {
  return normalizeTtsMode(captureDefaults()?.ttsMode, "local");
}

export function ttsLanguage(): TtsLanguage {
  const settings = SettingsManager.getSnapshot();
  const fallback = resolveTtsLanguageFromLocale(settings.general?.language);
  return normalizeTtsLanguage(captureDefaults()?.ttsLanguage, fallback);
}

function photoFlashMode(): "off" | "auto" | "on" {
  const defaults = captureDefaults() ?? {};
  if (defaults.photoFlashMode === "auto" || defaults.photoFlashMode === "on") {
    return defaults.photoFlashMode;
  }
  return (defaults as Record<string, unknown>)["photoFlashEnabled"] === true ? "on" : "off";
}

export function ambientWakePhrases(): string[] {
  return normalizeAmbientWakePhrases(
    SettingsManager.getSnapshot().voiceCommands?.ambient?.wakePhrases,
    DEFAULT_AMBIENT_WAKE_PHRASES
  );
}

export function ambientActiveWindowMs(): number {
  return normalizeAmbientDurationMs(
    SettingsManager.getSnapshot().voiceCommands?.ambient?.activeWindowMs,
    DEFAULT_AMBIENT_ACTIVE_WINDOW_MS,
    { min: 1_000, max: 30_000 }
  );
}

export function ambientSilenceTimeoutMs(): number {
  return normalizeAmbientDurationMs(
    SettingsManager.getSnapshot().voiceCommands?.ambient?.silenceTimeoutMs,
    DEFAULT_AMBIENT_SILENCE_TIMEOUT_MS,
    { min: 300, max: 10_000 }
  );
}

export function voiceCommandPhrases(): Required<CaptureCommandPhraseSettings> {
  const phrases = SettingsManager.getSnapshot().voiceCommands?.analyzePhrases;
  return {
    openCamera: phrases?.openCamera ?? [...DEFAULT_CAPTURE_COMMAND_PHRASES.openCamera],
    capture: phrases?.capture ?? [...DEFAULT_CAPTURE_COMMAND_PHRASES.capture],
    stop: phrases?.stop ?? [...DEFAULT_CAPTURE_COMMAND_PHRASES.stop],
  };
}

function selectedAndroidDictationDevice(
  status: CaptureServiceStatus | null
): CaptureAndroidDeviceStatus | null {
  const devices = status?.android.devices ?? [];
  return devices.find((device) => device.selected && device.connectionState === "device") ?? null;
}

function notifyOperationSettingsSaved(): void {
  notifyUser({
    kind: "success",
    title: companionT("page.operationSettings.saved"),
    dedupeKey: "companion-operation-settings-saved",
  });
}

function notifyCompanionFeedback(
  options: CompanionOperationSettingsOptions,
  kind: CompanionNotifyKind,
  title: string,
  dedupeKey: string
): void {
  if (options.notify !== undefined) {
    options.notify(kind, title, dedupeKey);
    return;
  }

  const confirmationMode = captureDefaults()?.commandConfirmation ?? "toast";
  if (kind !== "error" && confirmationMode === "none") {
    return;
  }

  notifyUser({ kind, title, dedupeKey });
}

export async function openCompanionOperationSettings(
  options: CompanionOperationSettingsOptions = {}
): Promise<void> {
  let currentCaptureStatus = await refreshCaptureStatus().catch(() => null);
  let currentTtsRuntimeStatus = await getTtsStatus().catch(() => null);
  let voiceCommandsEnabled = SettingsManager.getSnapshot().voiceCommands?.analyzeEnabled === true;

  const reportCaptureStatus = (status: CaptureServiceStatus | null): void => {
    options.onCaptureStatus?.(status);
    emitCompanionOperationSettingsEvent({ type: "capture-status", status });
  };
  const reportTtsRuntimeStatus = (status: TtsRuntimeStatus | null): void => {
    options.onTtsRuntimeStatus?.(status);
    emitCompanionOperationSettingsEvent({ type: "tts-runtime-status", status });
  };
  const reportDictationModeChanged = (mode: DictationMode): void => {
    options.onDictationModeChanged?.(mode);
    emitCompanionOperationSettingsEvent({ type: "dictation-mode", mode });
  };
  const reportVoiceCommandSettingsChanged = (): void => {
    options.onVoiceCommandSettingsChanged?.();
    emitCompanionOperationSettingsEvent({ type: "voice-command-settings-changed" });
  };

  reportCaptureStatus(currentCaptureStatus);
  reportTtsRuntimeStatus(currentTtsRuntimeStatus);
  const content = document.createElement("div");
  content.className = "analyze-operation-settings";

  const normalizeOperationLanguage = (value: string): TranscriptSupportedLanguage =>
    value === "tr" ? "tr" : "en";

  const createSection = (titleText: string, hintText: string): HTMLElement => {
    const section = document.createElement("section");
    section.className = "analyze-operation-settings__section";

    const header = document.createElement("div");
    header.className = "analyze-operation-settings__section-head";
    const title = document.createElement("h3");
    title.textContent = titleText;
    const hint = document.createElement("p");
    hint.textContent = hintText;
    header.append(title, hint);
    section.appendChild(header);
    return section;
  };

  const createRow = (labelText: string, value: HTMLElement): HTMLLabelElement => {
    const row = document.createElement("label");
    row.className = "analyze-operation-settings__row";
    const label = document.createElement("span");
    label.className = "analyze-operation-settings__label";
    label.textContent = labelText;
    row.append(label, value);
    return row;
  };

  const createSelect = <T extends string>(
    options: Array<{ value: T; label: string }>,
    value: T
  ): HTMLSelectElement => {
    const select = document.createElement("select");
    select.className = "form-input";
    options.forEach((optionConfig) => {
      const option = document.createElement("option");
      option.value = optionConfig.value;
      option.textContent = optionConfig.label;
      select.appendChild(option);
    });
    select.value = value;
    return select;
  };

  const createTextInput = (value: string): HTMLInputElement => {
    const input = document.createElement("input");
    input.className = "form-input";
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = value;
    return input;
  };

  const createNumberInput = (
    value: number,
    options: { min: number; max: number; step: number }
  ): HTMLInputElement => {
    const input = document.createElement("input");
    input.className = "form-input";
    input.type = "number";
    input.min = String(options.min);
    input.max = String(options.max);
    input.step = String(options.step);
    input.value = String(value);
    return input;
  };

  const createValueBox = (): HTMLElement => {
    const box = document.createElement("div");
    box.className = "analyze-operation-settings__value";
    return box;
  };

  const androidEnabledInput = document.createElement("input");
  androidEnabledInput.type = "checkbox";
  androidEnabledInput.checked = captureProviders()?.androidCompanionEnabled !== false;
  const androidEnabledLabel = document.createElement("span");
  androidEnabledLabel.className = "analyze-operation-settings__inline-check";
  androidEnabledLabel.append(androidEnabledInput);
  androidEnabledLabel.append(
    document.createTextNode(companionT("page.operationSettings.androidEnabled"))
  );

  const androidTorchInput = document.createElement("input");
  androidTorchInput.type = "checkbox";
  androidTorchInput.checked = captureProviders()?.androidTorchEnabled === true;
  const androidTorchLabel = document.createElement("span");
  androidTorchLabel.className = "analyze-operation-settings__inline-check";
  androidTorchLabel.append(androidTorchInput);
  androidTorchLabel.append(
    document.createTextNode(companionT("page.operationSettings.torchEnabled"))
  );

  const deviceSelect = document.createElement("select");
  deviceSelect.className = "form-input";
  const androidStatusValue = createValueBox();
  const companionValue = createValueBox();
  const transcriptValue = createValueBox();
  const ttsRuntimeValue = createValueBox();

  const dictationModeSelect = createSelect<DictationMode>(
    [
      { value: "local", label: companionT("page.tts.modeLocal") },
      { value: "android", label: companionT("page.tts.modeAndroid") },
    ],
    settingsDictationMode()
  );
  const dictationLanguageSelect = createSelect<TranscriptSupportedLanguage>(
    [
      { value: "tr", label: companionT("page.tts.languageTr") },
      { value: "en", label: companionT("page.tts.languageEn") },
    ],
    dictationLanguage()
  );
  const transcriptBackendSelect = createSelect<TranscriptDictationBackend>(
    [
      { value: "whisper.cpp", label: "whisper.cpp" },
      { value: "vosk", label: "Vosk" },
    ],
    localTranscriptBackend()
  );
  const transcriptVariantSelect = createSelect<TranscriptModelVariant>(
    [
      { value: "light", label: companionT("page.operationSettings.modelLight") },
      { value: "full", label: companionT("page.operationSettings.modelFull") },
    ],
    localTranscriptVariant()
  );

  const voiceEnabledInput = document.createElement("input");
  voiceEnabledInput.type = "checkbox";
  voiceEnabledInput.checked = voiceCommandsEnabled;
  const voiceEnabledLabel = document.createElement("span");
  voiceEnabledLabel.className = "analyze-operation-settings__inline-check";
  voiceEnabledLabel.append(voiceEnabledInput);
  voiceEnabledLabel.append(
    document.createTextNode(companionT("page.operationSettings.voiceCommandsEnabled"))
  );
  const ambientWakeInput = createTextInput(ambientWakePhrases().join(", "));
  const ambientActiveWindowInput = createNumberInput(ambientActiveWindowMs(), {
    min: 1_000,
    max: 30_000,
    step: 100,
  });
  const ambientSilenceInput = createNumberInput(ambientSilenceTimeoutMs(), {
    min: 300,
    max: 10_000,
    step: 100,
  });
  const voicePhrases = voiceCommandPhrases();
  const openCameraPhrasesInput = createTextInput(voicePhrases.openCamera.join(", "));
  const capturePhrasesInput = createTextInput(voicePhrases.capture.join(", "));
  const stopPhrasesInput = createTextInput(voicePhrases.stop.join(", "));

  const ttsModeSelect = createSelect<TtsMode>(
    [
      { value: "local", label: companionT("page.tts.modeLocal") },
      { value: "android", label: companionT("page.tts.modeAndroid") },
    ],
    ttsMode()
  );
  const ttsLanguageSelect = createSelect<TtsLanguage>(
    [
      { value: "tr", label: companionT("page.tts.languageTr") },
      { value: "en", label: companionT("page.tts.languageEn") },
    ],
    ttsLanguage()
  );
  const selectedTtsModelId = (): ReturnType<typeof resolveTtsModelId> =>
    resolveTtsModelId(normalizeTtsLanguage(ttsLanguageSelect.value));

  const lensSelect = createSelect<"back" | "front">(
    [
      { value: "back", label: companionT("page.operationSettings.lensBack") },
      { value: "front", label: companionT("page.operationSettings.lensFront") },
    ],
    captureDefaults()?.defaultLens === "front" ? "front" : "back"
  );
  const qualitySelect = createSelect<"high" | "balanced">(
    [
      { value: "high", label: companionT("page.operationSettings.qualityHigh") },
      { value: "balanced", label: companionT("page.operationSettings.qualityBalanced") },
    ],
    captureDefaults()?.photoQuality === "balanced" ? "balanced" : "high"
  );
  const photoFlashSelect = createSelect<"off" | "auto" | "on">(
    [
      { value: "off", label: companionT("page.operationSettings.photoFlashOff") },
      { value: "auto", label: companionT("page.operationSettings.photoFlashAuto") },
      { value: "on", label: companionT("page.operationSettings.photoFlashOn") },
    ],
    photoFlashMode()
  );
  const attachModeSelect = createSelect<"manual-sync" | "auto-stage">(
    [
      { value: "manual-sync", label: companionT("page.operationSettings.attachManual") },
      { value: "auto-stage", label: companionT("page.operationSettings.attachAuto") },
    ],
    captureDefaults()?.attachMode === "auto-stage" ? "auto-stage" : "manual-sync"
  );
  const confirmationSelect = createSelect<"toast" | "none">(
    [
      { value: "toast", label: companionT("page.operationSettings.confirmToast") },
      { value: "none", label: companionT("page.operationSettings.confirmNone") },
    ],
    captureDefaults()?.commandConfirmation === "none" ? "none" : "toast"
  );

  const populateDeviceSelect = (): void => {
    const preferredDeviceId = captureDefaults()?.preferredDeviceId ?? "";
    deviceSelect.innerHTML = "";
    const autoOption = document.createElement("option");
    autoOption.value = "";
    autoOption.textContent = companionT("page.tts.deviceAuto");
    deviceSelect.appendChild(autoOption);
    (currentCaptureStatus?.android.devices ?? [])
      .filter((device) => device.connectionState === "device")
      .forEach((device) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.textContent = device.label;
        deviceSelect.appendChild(option);
      });
    deviceSelect.value =
      preferredDeviceId !== "" &&
      Array.from(deviceSelect.options).some((option) => option.value === preferredDeviceId)
        ? preferredDeviceId
        : "";
  };

  const renderStatus = (): void => {
    const activeDevice = selectedAndroidDictationDevice(currentCaptureStatus);
    androidStatusValue.textContent =
      activeDevice !== null
        ? companionT("page.operationSettings.androidReady", { device: activeDevice.label })
        : companionT("page.dictation.androidUnavailableTitle");
    companionValue.textContent =
      currentCaptureStatus?.android.message ?? companionT("page.tts.statusUnknown");
    const transcriptRuntime = currentCaptureStatus?.transcript.runtime ?? null;
    transcriptValue.textContent =
      transcriptRuntime?.message ??
      (transcriptRuntime?.ready === true
        ? companionT("page.operationSettings.runtimeReady")
        : companionT("page.tts.statusUnknown"));
    const model = currentTtsRuntimeStatus?.models.find(
      (entry) => entry.modelId === selectedTtsModelId()
    );
    ttsRuntimeValue.textContent =
      currentTtsRuntimeStatus?.active?.message ??
      (model?.ready === true
        ? companionT("page.tts.modelReady", { model: model.label })
        : (model?.lastError ?? currentTtsRuntimeStatus?.local.message)) ??
      companionT("page.tts.statusIdle");
  };

  androidEnabledInput.addEventListener("change", () => {
    void SettingsManager.set(
      "capture.providers.androidCompanionEnabled",
      androidEnabledInput.checked
    );
  });
  androidTorchInput.addEventListener("change", () => {
    void (async (): Promise<void> => {
      const enabled = androidTorchInput.checked;
      await SettingsManager.set("capture.providers.androidTorchEnabled", enabled);
      const outcome = await runCaptureAction("set-torch", {
        target: "analyze-compose",
        deviceId: deviceSelect.value.trim() === "" ? null : deviceSelect.value.trim(),
        enabled,
      });
      currentCaptureStatus = outcome.status;
      reportCaptureStatus(currentCaptureStatus);
      notifyCompanionFeedback(
        options,
        outcome.ok ? "success" : "error",
        outcome.message,
        "companion-operation-torch"
      );
      populateDeviceSelect();
      renderStatus();
    })();
  });
  deviceSelect.addEventListener("change", () => {
    void (async (): Promise<void> => {
      await SettingsManager.set(
        "capture.defaults.preferredDeviceId",
        deviceSelect.value.trim() === "" ? null : deviceSelect.value.trim()
      );
      currentCaptureStatus = await refreshCaptureStatus().catch(() => currentCaptureStatus);
      reportCaptureStatus(currentCaptureStatus);
      populateDeviceSelect();
      renderStatus();
    })();
  });
  dictationModeSelect.addEventListener("change", () => {
    void (async (): Promise<void> => {
      const nextMode: DictationMode = dictationModeSelect.value === "android" ? "android" : "local";
      await SettingsManager.set("capture.defaults.dictationMode", nextMode);
      reportDictationModeChanged(nextMode);
      renderStatus();
    })();
  });
  dictationLanguageSelect.addEventListener("change", () => {
    void SettingsManager.set(
      "capture.defaults.dictationLanguage",
      normalizeOperationLanguage(dictationLanguageSelect.value)
    );
  });
  transcriptBackendSelect.addEventListener("change", () => {
    void SettingsManager.set(
      "general.transcriptBackend",
      normalizeTranscriptBackend(transcriptBackendSelect.value, "whisper.cpp")
    );
  });
  transcriptVariantSelect.addEventListener("change", () => {
    void SettingsManager.set(
      "general.transcriptModelVariant",
      normalizeTranscriptModelVariant(transcriptVariantSelect.value, "full")
    );
  });
  ttsModeSelect.addEventListener("change", () => {
    void SettingsManager.set("capture.defaults.ttsMode", normalizeTtsMode(ttsModeSelect.value));
  });
  ttsLanguageSelect.addEventListener("change", () => {
    void (async (): Promise<void> => {
      await SettingsManager.set(
        "capture.defaults.ttsLanguage",
        normalizeTtsLanguage(ttsLanguageSelect.value)
      );
      currentTtsRuntimeStatus = await getTtsStatus().catch(() => currentTtsRuntimeStatus);
      reportTtsRuntimeStatus(currentTtsRuntimeStatus);
      renderStatus();
    })();
  });
  const saveCameraDefaults = (): void => {
    void SettingsManager.patch((settings) => {
      const nextCapture = (settings["capture"] ?? {}) as Record<string, unknown>;
      const nextDefaults = (nextCapture["defaults"] ?? {}) as Record<string, unknown>;
      nextDefaults["defaultLens"] = lensSelect.value === "front" ? "front" : "back";
      nextDefaults["photoQuality"] = qualitySelect.value === "balanced" ? "balanced" : "high";
      nextDefaults["photoFlashMode"] =
        photoFlashSelect.value === "auto" || photoFlashSelect.value === "on"
          ? photoFlashSelect.value
          : "off";
      delete nextDefaults["photoFlashEnabled"];
      nextDefaults["attachMode"] =
        attachModeSelect.value === "auto-stage" ? "auto-stage" : "manual-sync";
      nextDefaults["commandConfirmation"] = confirmationSelect.value === "none" ? "none" : "toast";
      nextCapture["defaults"] = nextDefaults;
      settings["capture"] = nextCapture;
    });
  };
  [lensSelect, qualitySelect, photoFlashSelect, attachModeSelect, confirmationSelect].forEach(
    (select) => {
      select.addEventListener("change", saveCameraDefaults);
    }
  );

  const saveAmbientButton = document.createElement("button");
  saveAmbientButton.type = "button";
  saveAmbientButton.className = "btn btn-secondary btn-sm";
  saveAmbientButton.textContent = companionT("page.operationSettings.saveVoiceSettings");
  saveAmbientButton.addEventListener("click", () => {
    void (async (): Promise<void> => {
      const analyzePhrases: Required<CaptureCommandPhraseSettings> = {
        openCamera: normalizeCapturePhraseList(
          openCameraPhrasesInput.value.split(/[\n,]/),
          DEFAULT_CAPTURE_COMMAND_PHRASES.openCamera
        ),
        capture: normalizeCapturePhraseList(
          capturePhrasesInput.value.split(/[\n,]/),
          DEFAULT_CAPTURE_COMMAND_PHRASES.capture
        ),
        stop: normalizeCapturePhraseList(
          stopPhrasesInput.value.split(/[\n,]/),
          DEFAULT_CAPTURE_COMMAND_PHRASES.stop
        ),
      };
      await SettingsManager.patch((settings) => {
        const nextVoiceCommands = (settings["voiceCommands"] ?? {}) as Record<string, unknown>;
        nextVoiceCommands["analyzeEnabled"] = voiceEnabledInput.checked;
        nextVoiceCommands["analyzePhrases"] = analyzePhrases;
        nextVoiceCommands["ambient"] = {
          wakePhrases: normalizeAmbientWakePhrases(
            ambientWakeInput.value.split(/[\n,]/),
            DEFAULT_AMBIENT_WAKE_PHRASES
          ),
          activeWindowMs: normalizeAmbientDurationMs(
            ambientActiveWindowInput.value,
            DEFAULT_AMBIENT_ACTIVE_WINDOW_MS,
            { min: 1_000, max: 30_000 }
          ),
          silenceTimeoutMs: normalizeAmbientDurationMs(
            ambientSilenceInput.value,
            DEFAULT_AMBIENT_SILENCE_TIMEOUT_MS,
            { min: 300, max: 10_000 }
          ),
        };
        delete nextVoiceCommands["commandPhrases"];
        settings["voiceCommands"] = nextVoiceCommands;
      });
      voiceCommandsEnabled = SettingsManager.getSnapshot().voiceCommands?.analyzeEnabled === true;
      reportVoiceCommandSettingsChanged();
      notifyOperationSettingsSaved();
    })();
  });
  voiceEnabledInput.addEventListener("change", () => {
    const enabled = voiceEnabledInput.checked;
    void (async (): Promise<void> => {
      await SettingsManager.patch((settings) => {
        settings["voiceCommands"] = {
          ...(settings["voiceCommands"] ?? {}),
          analyzeEnabled: enabled,
        };
      });
      voiceCommandsEnabled = SettingsManager.getSnapshot().voiceCommands?.analyzeEnabled === true;
      voiceEnabledInput.checked = voiceCommandsEnabled;
      reportVoiceCommandSettingsChanged();
    })();
  });

  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.className = "btn btn-secondary btn-sm";
  refreshButton.textContent = companionT("page.tts.refreshButton");
  refreshButton.addEventListener("click", () => {
    void (async (): Promise<void> => {
      const [nextCaptureStatus, nextTtsRuntimeStatus] = await Promise.all([
        refreshCaptureStatus().catch(() => currentCaptureStatus),
        getTtsStatus().catch(() => currentTtsRuntimeStatus),
      ]);
      currentCaptureStatus = nextCaptureStatus;
      currentTtsRuntimeStatus = nextTtsRuntimeStatus;
      reportCaptureStatus(currentCaptureStatus);
      reportTtsRuntimeStatus(currentTtsRuntimeStatus);
      populateDeviceSelect();
      renderStatus();
    })();
  });
  const prepareModelButton = document.createElement("button");
  prepareModelButton.type = "button";
  prepareModelButton.className = "btn btn-secondary btn-sm";
  prepareModelButton.textContent = companionT("page.tts.prepareModelButton");
  prepareModelButton.addEventListener("click", () => {
    void (async (): Promise<void> => {
      prepareModelButton.disabled = true;
      prepareModelButton.textContent = companionT("page.tts.installingModel");
      const modelId = selectedTtsModelId();
      const result = await installTtsModel(modelId).catch((error: unknown) => ({
        success: false,
        model: null,
        error: getErrorMessage(error),
      }));
      currentTtsRuntimeStatus = await getTtsStatus().catch(() => currentTtsRuntimeStatus);
      reportTtsRuntimeStatus(currentTtsRuntimeStatus);
      notifyCompanionFeedback(
        options,
        result?.success === true ? "success" : "error",
        result?.success === true
          ? companionT("page.tts.modelReady", {
              model: result.model?.label ?? modelId,
            })
          : (result?.error ?? companionT("page.tts.statusUnknown")),
        "analyze-tts-model-install"
      );
      prepareModelButton.disabled = false;
      prepareModelButton.textContent = companionT("page.tts.prepareModelButton");
      renderStatus();
    })();
  });
  const launchButton = document.createElement("button");
  launchButton.type = "button";
  launchButton.className = "btn btn-secondary btn-sm";
  launchButton.textContent = companionT("page.operationSettings.launchCompanion");
  launchButton.addEventListener("click", () => {
    void (async (): Promise<void> => {
      const outcome = await runCaptureAction("launch-companion", {
        target: "analyze-compose",
        activeTab: "dictate",
        deviceId: deviceSelect.value.trim() === "" ? null : deviceSelect.value.trim(),
      });
      currentCaptureStatus = outcome.status;
      reportCaptureStatus(currentCaptureStatus);
      notifyCompanionFeedback(
        options,
        outcome.ok ? "success" : "error",
        outcome.message,
        "companion-operation-launch"
      );
      populateDeviceSelect();
      renderStatus();
    })();
  });

  const androidSection = createSection(
    companionT("page.operationSettings.androidSection"),
    companionT("page.operationSettings.androidHint")
  );
  androidSection.append(
    createRow(companionT("page.operationSettings.androidEnabledLabel"), androidEnabledLabel),
    createRow(companionT("page.operationSettings.torchLabel"), androidTorchLabel),
    createRow(companionT("page.tts.deviceLabel"), deviceSelect),
    createRow(companionT("page.operationSettings.androidStatusLabel"), androidStatusValue),
    createRow(companionT("page.tts.companionLabel"), companionValue)
  );

  const dictationSection = createSection(
    companionT("page.operationSettings.dictationSection"),
    companionT("page.operationSettings.dictationHint")
  );
  dictationSection.append(
    createRow(companionT("page.operationSettings.sourceLabel"), dictationModeSelect),
    createRow(companionT("page.tts.languageLabel"), dictationLanguageSelect),
    createRow(companionT("page.operationSettings.transcriptBackendLabel"), transcriptBackendSelect),
    createRow(companionT("page.operationSettings.transcriptVariantLabel"), transcriptVariantSelect),
    createRow(companionT("page.operationSettings.runtimeLabel"), transcriptValue)
  );

  const ambientSection = createSection(
    companionT("page.operationSettings.ambientSection"),
    companionT("page.operationSettings.ambientHint")
  );
  const ambientActions = document.createElement("div");
  ambientActions.className = "analyze-operation-settings__actions";
  ambientActions.append(saveAmbientButton);
  ambientSection.append(
    createRow(companionT("page.operationSettings.voiceCommandsToggleLabel"), voiceEnabledLabel),
    createRow(companionT("page.operationSettings.ambientWakeLabel"), ambientWakeInput),
    createRow(
      companionT("page.operationSettings.ambientActiveWindowLabel"),
      ambientActiveWindowInput
    ),
    createRow(companionT("page.operationSettings.ambientSilenceLabel"), ambientSilenceInput),
    createRow(companionT("page.operationSettings.openCameraPhrasesLabel"), openCameraPhrasesInput),
    createRow(companionT("page.operationSettings.capturePhrasesLabel"), capturePhrasesInput),
    createRow(companionT("page.operationSettings.stopPhrasesLabel"), stopPhrasesInput),
    ambientActions
  );

  const ttsSection = createSection(
    companionT("page.operationSettings.ttsSection"),
    companionT("page.operationSettings.ttsHint")
  );
  const ttsActions = document.createElement("div");
  ttsActions.className = "analyze-operation-settings__actions";
  ttsActions.append(refreshButton, prepareModelButton);
  ttsSection.append(
    createRow(companionT("page.tts.modeLabel"), ttsModeSelect),
    createRow(companionT("page.tts.languageLabel"), ttsLanguageSelect),
    createRow(companionT("page.tts.runtimeLabel"), ttsRuntimeValue),
    ttsActions
  );

  const cameraSection = createSection(
    companionT("page.operationSettings.cameraSection"),
    companionT("page.operationSettings.cameraHint")
  );
  const cameraActions = document.createElement("div");
  cameraActions.className = "analyze-operation-settings__actions";
  cameraActions.append(launchButton);
  cameraSection.append(
    createRow(companionT("page.operationSettings.lensLabel"), lensSelect),
    createRow(companionT("page.operationSettings.qualityLabel"), qualitySelect),
    createRow(companionT("page.operationSettings.photoFlashLabel"), photoFlashSelect),
    createRow(companionT("page.operationSettings.attachModeLabel"), attachModeSelect),
    createRow(companionT("page.operationSettings.confirmationLabel"), confirmationSelect),
    cameraActions
  );

  content.append(androidSection, dictationSection, cameraSection, ambientSection, ttsSection);
  populateDeviceSelect();
  renderStatus();

  ModalManager.open({
    title: companionT("page.operationSettings.title"),
    content,
    size: "large",
    containerClassName: "modal-analyze-operation-settings",
    ...(options.onClose !== undefined ? { onClose: options.onClose } : {}),
  });
}

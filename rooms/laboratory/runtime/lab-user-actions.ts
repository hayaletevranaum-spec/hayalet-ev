import type { LabUserActionEvent } from "../domain/lab-types.js";

export const LAB_USER_ACTION_HISTORY_LIMIT = 24;
export const LAB_USER_ACTION_HUB_SUCCESS_WINDOW_MS = 2600;

type LabTrackedUserActionDefinition = {
  sourceAction: string;
  type: LabUserActionEvent["type"];
  label: string;
  successMessage: string;
  errorMessage: string;
};

const TRACKED_USER_ACTION_DEFINITIONS: Record<string, LabTrackedUserActionDefinition> = {
  "export-timeline-clip": {
    sourceAction: "export-timeline-clip",
    type: "export-clip",
    label: "Klip çıkarılıyor",
    successMessage: "Klip hazır",
    errorMessage: "Klip çıkarılamadı",
  },
  "export-frame-grab": {
    sourceAction: "export-frame-grab",
    type: "grab-frame",
    label: "Frame alınıyor",
    successMessage: "Frame alındı",
    errorMessage: "Frame alınamadı",
  },
  "export-enhanced-frame": {
    sourceAction: "export-enhanced-frame",
    type: "custom",
    label: "İyileştirilmiş frame hazırlanıyor",
    successMessage: "İyileştirilmiş frame hazır",
    errorMessage: "İyileştirilmiş frame hazırlanamadı",
  },
  "export-before-after-variant": {
    sourceAction: "export-before-after-variant",
    type: "custom",
    label: "Önce/sonra görüntüsü hazırlanıyor",
    successMessage: "Önce/sonra görüntüsü hazır",
    errorMessage: "Önce/sonra görüntüsü hazırlanamadı",
  },
  "export-image-comparison": {
    sourceAction: "export-image-comparison",
    type: "custom",
    label: "Görsel karşılaştırma hazırlanıyor",
    successMessage: "Görsel karşılaştırma hazır",
    errorMessage: "Görsel karşılaştırma hazırlanamadı",
  },
  "capture-comparison-moment": {
    sourceAction: "capture-comparison-moment",
    type: "custom",
    label: "Karşılaştırma anı yakalanıyor",
    successMessage: "Karşılaştırma anı kaydedildi",
    errorMessage: "Karşılaştırma anı kaydedilemedi",
  },
  "save-comparison-finding": {
    sourceAction: "save-comparison-finding",
    type: "custom",
    label: "Karşılaştırma bulgusu kaydediliyor",
    successMessage: "Karşılaştırma bulgusu kaydedildi",
    errorMessage: "Karşılaştırma bulgusu kaydedilemedi",
  },
  "export-stabilized-clip": {
    sourceAction: "export-stabilized-clip",
    type: "export-clip",
    label: "Stabilize klip hazırlanıyor",
    successMessage: "Stabilize klip hazır",
    errorMessage: "Stabilize klip hazırlanamadı",
  },
  "export-audio-track": {
    sourceAction: "export-audio-track",
    type: "extract-audio",
    label: "Ses çıkarılıyor",
    successMessage: "Ses çıkarıldı",
    errorMessage: "Ses çıkarılamadı",
  },
  "export-clean-audio": {
    sourceAction: "export-clean-audio",
    type: "custom",
    label: "Ses temizleniyor",
    successMessage: "Temiz ses hazır",
    errorMessage: "Ses temizlenemedi",
  },
  "export-band-pass-voice": {
    sourceAction: "export-band-pass-voice",
    type: "custom",
    label: "Ses band-pass hazırlanıyor",
    successMessage: "Band-pass ses hazır",
    errorMessage: "Band-pass ses hazırlanamadı",
  },
  "export-stem-separation": {
    sourceAction: "export-stem-separation",
    type: "custom",
    label: "Stem ayrımı hazırlanıyor",
    successMessage: "Stem çıktıları hazır",
    errorMessage: "Stem ayrımı hazırlanamadı",
  },
  "export-roi-image": {
    sourceAction: "export-roi-image",
    type: "custom",
    label: "Bölge görüntüsü alınıyor",
    successMessage: "Bölge görüntüsü hazır",
    errorMessage: "Bölge görüntüsü alınamadı",
  },
  "report-export": {
    sourceAction: "report-export",
    type: "custom",
    label: "Rapor dışa aktarılıyor",
    successMessage: "Rapor dışa aktarıldı",
    errorMessage: "Rapor dışa aktarılamadı",
  },
  "audio-report-export": {
    sourceAction: "audio-report-export",
    type: "custom",
    label: "Ses raporu dışa aktarılıyor",
    successMessage: "Ses raporu dışa aktarıldı",
    errorMessage: "Ses raporu dışa aktarılamadı",
  },
};

export function getTrackedLabUserActionDefinition(action: string | null | undefined) {
  if (!action) {
    return null;
  }
  return TRACKED_USER_ACTION_DEFINITIONS[action] || null;
}

export function isTrackedLabUserAction(action: string | null | undefined) {
  return getTrackedLabUserActionDefinition(action) !== null;
}

import type { LabStoreState } from "../../domain/lab-types.js";
import {
  getAnalysisActionBlockReason,
  getEditActionBlockReason,
  getReportActionBlockReason,
  getSourceActionBlockReason,
  getSourceProbeStatus,
  getSourceReady,
  getSourceStatus,
  hasReportPayload,
  isRunActive,
  isRunComplete,
} from "../lab-selectors.js";

export function getLabPrimaryActionState(state: LabStoreState) {
  if (hasReportPayload(state) && (state.ui.workspace.reportOverlayOpen || isRunComplete(state))) {
    const reportBlock = getReportActionBlockReason(state);
    return {
      disabled: reportBlock !== null,
      detail: reportBlock || "Structured rapor dışa aktarılır",
      label: "Raporları Dışa Aktar",
    };
  }

  if (isRunActive(state)) {
    return {
      disabled: false,
      detail: "Aktif run iptal edilir",
      label: "Çalışmayı İptal Et",
    };
  }
  if (getSourceReady(state) && getAnalysisActionBlockReason(state) === null) {
    return {
      disabled: false,
      detail: "Sadece enabled modüller çalışır",
      label: "Analizi Başlat",
    };
  }

  if (getSourceReady(state)) {
    const editBlock = getEditActionBlockReason(state);
    if (editBlock === null) {
      return {
        disabled: false,
        detail: "Preview completion fake edilemez",
        label: "Önizleme Üret",
      };
    }
  }

  const sourceStatus = getSourceStatus(state);
  const sourceProbeStatus = getSourceProbeStatus(state);
  const sourceBlock = getSourceActionBlockReason(state);
  return {
    disabled: sourceBlock !== null,
    detail:
      sourceBlock ||
      (sourceProbeStatus === "running"
        ? "Gerçek probe tamamlanıyor"
        : sourceProbeStatus === "completed" || sourceStatus === "ready"
          ? "Probe tamamlandı"
          : "Source probe başlatılır"),
    label:
      sourceProbeStatus === "completed" || sourceStatus === "ready"
        ? "Kaynağı Yenile"
        : "Kaynağı Hazırla",
  };
}

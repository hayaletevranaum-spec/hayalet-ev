import type { LabEventFeedItem, LabUserActionEvent } from "../domain/lab-types.js";
import { LAB_FALLBACK_I18N } from "./lab-i18n.js";
import type { LabI18n } from "./lab-i18n.js";

type RuntimeCopyParams = Record<string, string | number>;

type RuntimeCopyDescriptor = {
  fallback: string;
  key: string;
  params?: RuntimeCopyParams;
};

type RuntimeTextPattern = {
  pattern: RegExp;
  read(match: RegExpMatchArray): RuntimeCopyDescriptor;
};

function renderDescriptor(
  descriptor: RuntimeCopyDescriptor,
  copy: LabI18n = LAB_FALLBACK_I18N
): string {
  return copy.t(descriptor.key, descriptor.fallback, descriptor.params);
}

const RUNTIME_TEXT: Record<string, RuntimeCopyDescriptor> = {
  "Önce kaynak seçilmelidir.": {
    key: "mediaAnalysis.runtime.blockReasons.selectSource",
    fallback: "Select a source first.",
  },
  "Kaynak probe tamamlanmadan ön kontrol doğrulanamaz.": {
    key: "mediaAnalysis.runtime.blockReasons.sourceProbeRequiredForPreflight",
    fallback: "Preflight cannot be verified until source probe completes.",
  },
  "Önce en az bir yetenek ailesi seçilmelidir.": {
    key: "mediaAnalysis.runtime.blockReasons.selectCapabilityFamily",
    fallback: "Select at least one capability family first.",
  },
  "Seçili yetenekler henüz hazır değil.": {
    key: "mediaAnalysis.runtime.blockReasons.selectedCapabilitiesNotReady",
    fallback: "Selected capabilities are not ready yet.",
  },
  "Araç uyarıları var ama işlem başlatılabilir.": {
    key: "mediaAnalysis.runtime.blockReasons.toolWarningsCanProceed",
    fallback: "Tool warnings exist, but the run can start.",
  },
  "Kaynak probe işlemi tamamlanmadı.": {
    key: "mediaAnalysis.runtime.blockReasons.sourceProbeIncomplete",
    fallback: "Source probe has not completed.",
  },
  "Kaynak probe hata verdi.": {
    key: "mediaAnalysis.runtime.blockReasons.sourceProbeFailed",
    fallback: "Source probe failed.",
  },
  "Kaynak probe tamamlanmalı.": {
    key: "mediaAnalysis.runtime.blockReasons.sourceProbeMustComplete",
    fallback: "Source probe must complete.",
  },
  "Analizden önce kaynak probe tamamlanmalı.": {
    key: "mediaAnalysis.runtime.blockReasons.sourceProbeBeforeAnalysis",
    fallback: "Source probe must complete before analysis.",
  },
  "Ön kontrol bu aşamayı blokladı.": {
    key: "mediaAnalysis.runtime.blockReasons.preflightBlockedStage",
    fallback: "Preflight blocked this stage.",
  },
  "Ön kontrol henüz hazır değil.": {
    key: "mediaAnalysis.runtime.blockReasons.preflightNotReady",
    fallback: "Preflight is not ready yet.",
  },
  "Rapor henüz üretilmedi.": {
    key: "mediaAnalysis.runtime.blockReasons.reportNotGenerated",
    fallback: "Report has not been generated yet.",
  },
  "Bu aşama henüz hazır değil.": {
    key: "mediaAnalysis.runtime.blockReasons.stageNotReady",
    fallback: "This stage is not ready yet.",
  },
  "Önce kaynak hazırlanmalı ve probe tamamlanmalı.": {
    key: "mediaAnalysis.runtime.blockReasons.prepareSourceAndProbe",
    fallback: "Prepare the source and complete probe first.",
  },
  "En az bir analiz modülü seçilmelidir.": {
    key: "mediaAnalysis.runtime.blockReasons.selectAnalysisModule",
    fallback: "Select at least one analysis module.",
  },
  "Kaynak henüz hazır değil.": {
    key: "mediaAnalysis.runtime.blockReasons.sourceNotReady",
    fallback: "Source is not ready yet.",
  },
  "Source not ready.": {
    key: "mediaAnalysis.runtime.blockReasons.sourceNotReady",
    fallback: "Source not ready.",
  },
  "Not available for this source type.": {
    key: "mediaAnalysis.runtime.blockReasons.sourceUnsupported",
    fallback: "Not available for this source type.",
  },
  "Required tools not installed.": {
    key: "mediaAnalysis.runtime.blockReasons.requiredToolsNotInstalled",
    fallback: "Required tools not installed.",
  },
  "Some tools missing — partial results.": {
    key: "mediaAnalysis.runtime.blockReasons.someToolsMissingPartial",
    fallback: "Some tools missing — partial results.",
  },
  "Kaynak URL gerekli": {
    key: "mediaAnalysis.runtime.blockReasons.sourceUrlRequired",
    fallback: "Source URL is required",
  },
  "YouTube URL gerekli": {
    key: "mediaAnalysis.runtime.blockReasons.youtubeUrlRequired",
    fallback: "YouTube URL is required",
  },
  "Ön kontrolde uyarılar var ama işlem devam edebilir.": {
    key: "mediaAnalysis.runtime.preflight.warningCanContinue",
    fallback: "Preflight has warnings, but the run can continue.",
  },
  "Ön kontrol bu aşamayı henüz hazır işaretlemedi.": {
    key: "mediaAnalysis.runtime.preflight.stageNotMarkedReady",
    fallback: "Preflight has not marked this stage ready yet.",
  },
  "Ön kontrol henüz çalıştırılmadı.": {
    key: "mediaAnalysis.runtime.preflight.notRun",
    fallback: "Preflight has not run yet.",
  },
  "Ön kontrol tamamlanamadı.": {
    key: "mediaAnalysis.runtime.preflight.failed",
    fallback: "Preflight could not complete.",
  },
  "Ön kontrol çalışıyor.": {
    key: "mediaAnalysis.runtime.preflight.running",
    fallback: "Preflight is running.",
  },
  "Çalışma tamamlandı ancak raporlanabilir bulgu veya artefakt oluşmadı.": {
    key: "mediaAnalysis.runtime.emptyReasons.runCompletedNoFindings",
    fallback: "The run completed, but no reportable findings or artifacts were produced.",
  },
  "Rapor hazır ancak okunabilir içerik üretilemedi.": {
    key: "mediaAnalysis.runtime.emptyReasons.reportReadyUnreadable",
    fallback: "The report is ready, but readable content could not be produced.",
  },
  "Önceki çalışma özet olarak geri yüklendi.": {
    key: "mediaAnalysis.runtime.emptyReasons.previousRunRestored",
    fallback: "The previous run was restored as a summary.",
  },
  "Olay akisi temizlendi.": {
    key: "mediaAnalysis.runtime.events.feedCleared",
    fallback: "Event feed cleared.",
  },
  "İşlem güncellemesi": {
    key: "mediaAnalysis.runtime.events.processUpdate",
    fallback: "Process update",
  },
  "Ham çıktı": {
    key: "mediaAnalysis.runtime.events.rawOutput",
    fallback: "Raw output",
  },
  "Analiz tamamlandi": {
    key: "mediaAnalysis.runtime.events.analysisCompleted",
    fallback: "Analysis completed",
  },
  "Analiz hata verdi": {
    key: "mediaAnalysis.runtime.events.analysisFailed",
    fallback: "Analysis failed",
  },
  "Analiz iptal edildi": {
    key: "mediaAnalysis.runtime.events.analysisCancelled",
    fallback: "Analysis cancelled",
  },
  "Analiz basladi": {
    key: "mediaAnalysis.runtime.events.analysisStarted",
    fallback: "Analysis started",
  },
  "Analiz istegi tamamlandi": {
    key: "mediaAnalysis.runtime.events.analysisRequestCompleted",
    fallback: "Analysis request completed",
  },
  "Analiz istegi hata verdi": {
    key: "mediaAnalysis.runtime.events.analysisRequestFailed",
    fallback: "Analysis request failed",
  },
  "Analiz istegi iptal edildi": {
    key: "mediaAnalysis.runtime.events.analysisRequestCancelled",
    fallback: "Analysis request cancelled",
  },
  "Analysis scope locked for the current run.": {
    key: "mediaAnalysis.runtime.events.analysisScopeLocked",
    fallback: "Analysis scope locked for the current run.",
  },
  "Cancelled by operator.": {
    key: "mediaAnalysis.runtime.events.cancelledByOperator",
    fallback: "Cancelled by operator.",
  },
  "Calisma kullanici tarafindan iptal edildi.": {
    key: "mediaAnalysis.runtime.events.cancelledByUser",
    fallback: "Run cancelled by the user.",
  },
  "Structured rapor dışa aktarılır": {
    key: "mediaAnalysis.runtime.primaryAction.exportReportDetail",
    fallback: "Structured report will be exported",
  },
  "Aktif run iptal edilir": {
    key: "mediaAnalysis.runtime.primaryAction.cancelRunDetail",
    fallback: "Active run will be cancelled",
  },
  "Sadece enabled modüller çalışır": {
    key: "mediaAnalysis.runtime.primaryAction.startAnalysisDetail",
    fallback: "Only enabled modules will run",
  },
  "Preview completion fake edilemez": {
    key: "mediaAnalysis.runtime.primaryAction.generatePreviewDetail",
    fallback: "Preview completion cannot be faked",
  },
  "Gerçek probe tamamlanıyor": {
    key: "mediaAnalysis.runtime.primaryAction.probeRunningDetail",
    fallback: "Real probe is completing",
  },
  "Probe tamamlandı": {
    key: "mediaAnalysis.runtime.primaryAction.probeCompleteDetail",
    fallback: "Probe completed",
  },
  "Source probe başlatılır": {
    key: "mediaAnalysis.runtime.primaryAction.startProbeDetail",
    fallback: "Source probe will start",
  },
  "Room API bridge is not connected.": {
    key: "mediaAnalysis.runtime.controller.roomApiDisconnected",
    fallback: "Room API bridge is not connected.",
  },
  "Source preview is unavailable.": {
    key: "mediaAnalysis.runtime.controller.sourcePreviewUnavailable",
    fallback: "Source preview is unavailable.",
  },
  "Proje mevcut checkpoint durumu ile kaydedildi.": {
    key: "mediaAnalysis.runtime.controller.projectCheckpointSaved",
    fallback: "Project saved with the current checkpoint state.",
  },
  "Klip çıkarılıyor": {
    key: "mediaAnalysis.runtime.userActions.exportTimelineClip.running",
    fallback: "Extracting clip",
  },
  "Klip hazır": {
    key: "mediaAnalysis.runtime.userActions.exportTimelineClip.success",
    fallback: "Clip ready",
  },
  "Klip çıkarılamadı": {
    key: "mediaAnalysis.runtime.userActions.exportTimelineClip.error",
    fallback: "Clip could not be extracted",
  },
  "Frame alınıyor": {
    key: "mediaAnalysis.runtime.userActions.exportFrameGrab.running",
    fallback: "Grabbing frame",
  },
  "Frame alındı": {
    key: "mediaAnalysis.runtime.userActions.exportFrameGrab.success",
    fallback: "Frame grabbed",
  },
  "Frame alınamadı": {
    key: "mediaAnalysis.runtime.userActions.exportFrameGrab.error",
    fallback: "Frame could not be grabbed",
  },
  "Ses çıkarılıyor": {
    key: "mediaAnalysis.runtime.userActions.exportAudioTrack.running",
    fallback: "Extracting audio",
  },
  "Ses çıkarıldı": {
    key: "mediaAnalysis.runtime.userActions.exportAudioTrack.success",
    fallback: "Audio extracted",
  },
  "Ses çıkarılamadı": {
    key: "mediaAnalysis.runtime.userActions.exportAudioTrack.error",
    fallback: "Audio could not be extracted",
  },
  "Bölge görüntüsü alınıyor": {
    key: "mediaAnalysis.runtime.userActions.exportRoiImage.running",
    fallback: "Capturing region image",
  },
  "Bölge görüntüsü hazır": {
    key: "mediaAnalysis.runtime.userActions.exportRoiImage.success",
    fallback: "Region image ready",
  },
  "Bölge görüntüsü alınamadı": {
    key: "mediaAnalysis.runtime.userActions.exportRoiImage.error",
    fallback: "Region image could not be captured",
  },
  "Rapor dışa aktarılıyor": {
    key: "mediaAnalysis.runtime.userActions.reportExport.running",
    fallback: "Exporting report",
  },
  "Rapor dışa aktarıldı": {
    key: "mediaAnalysis.runtime.userActions.reportExport.success",
    fallback: "Report exported",
  },
  "Rapor dışa aktarılamadı": {
    key: "mediaAnalysis.runtime.userActions.reportExport.error",
    fallback: "Report could not be exported",
  },
  "Ses raporu dışa aktarılıyor": {
    key: "mediaAnalysis.runtime.userActions.audioReportExport.running",
    fallback: "Exporting audio report",
  },
  "Ses raporu dışa aktarıldı": {
    key: "mediaAnalysis.runtime.userActions.audioReportExport.success",
    fallback: "Audio report exported",
  },
  "Ses raporu dışa aktarılamadı": {
    key: "mediaAnalysis.runtime.userActions.audioReportExport.error",
    fallback: "Audio report could not be exported",
  },
};

const RUNTIME_TEXT_PATTERNS: RuntimeTextPattern[] = [
  {
    pattern: /^(.+) kısmi hazırlıkta\.$/,
    read(match) {
      return {
        key: "mediaAnalysis.runtime.blockReasons.capabilityPartiallyReady",
        fallback: "{label} is partially ready.",
        params: { label: match[1] ?? "" },
      };
    },
  },
  {
    pattern: /^Bu kaynak türü \((.+)\) desteklenmiyor\.$/,
    read(match) {
      return {
        key: "mediaAnalysis.runtime.blockReasons.sourceKindUnsupported",
        fallback: "This source type ({sourceKind}) is not supported.",
        params: { sourceKind: match[1] ?? "" },
      };
    },
  },
  {
    pattern: /^Eksik araç: (.+)$/,
    read(match) {
      return {
        key: "mediaAnalysis.runtime.blockReasons.missingTools",
        fallback: "Missing tool: {tools}",
        params: { tools: match[1] ?? "" },
      };
    },
  },
  {
    pattern: /^Opsiyonel araç eksik: (.+)$/,
    read(match) {
      return {
        key: "mediaAnalysis.runtime.blockReasons.optionalToolsMissing",
        fallback: "Optional tool missing: {tools}",
        params: { tools: match[1] ?? "" },
      };
    },
  },
  {
    pattern: /^Eksik dependency: (.+)$/,
    read(match) {
      return {
        key: "mediaAnalysis.runtime.blockReasons.missingDependencies",
        fallback: "Missing dependency: {dependencies}",
        params: { dependencies: match[1] ?? "" },
      };
    },
  },
  {
    pattern: /^Eksik bağımlılıklar: (.+)$/,
    read(match) {
      return {
        key: "mediaAnalysis.runtime.preflight.missingDependencies",
        fallback: "Missing dependencies: {dependencies}",
        params: { dependencies: match[1] ?? "" },
      };
    },
  },
  {
    pattern: /^(.+) kuyruğa alındı$/,
    read(match) {
      return {
        key: "mediaAnalysis.runtime.events.stage.queued",
        fallback: "{action} queued",
        params: { action: match[1] ?? "" },
      };
    },
  },
  {
    pattern: /^(.+) tamamlandı$/,
    read(match) {
      return {
        key: "mediaAnalysis.runtime.events.stage.completed",
        fallback: "{action} completed",
        params: { action: match[1] ?? "" },
      };
    },
  },
  {
    pattern: /^(.+) hata verdi$/,
    read(match) {
      return {
        key: "mediaAnalysis.runtime.events.stage.failed",
        fallback: "{action} failed",
        params: { action: match[1] ?? "" },
      };
    },
  },
  {
    pattern: /^(.+) iptal edildi$/,
    read(match) {
      return {
        key: "mediaAnalysis.runtime.events.stage.cancelled",
        fallback: "{action} cancelled",
        params: { action: match[1] ?? "" },
      };
    },
  },
  {
    pattern: /^(.+) başladı$/,
    read(match) {
      return {
        key: "mediaAnalysis.runtime.events.stage.started",
        fallback: "{action} started",
        params: { action: match[1] ?? "" },
      };
    },
  },
];

const ACTION_LABELS: Record<string, RuntimeCopyDescriptor> = {
  "source-download-url": {
    key: "mediaAnalysis.runtime.actions.sourceDownloadUrl",
    fallback: "Downloading URL source",
  },
  "source-download-youtube": {
    key: "mediaAnalysis.runtime.actions.sourceDownloadYoutube",
    fallback: "Preparing YouTube source",
  },
  "source-pick-local": {
    key: "mediaAnalysis.runtime.actions.sourcePickLocal",
    fallback: "Importing local source",
  },
  "edit-preview": {
    key: "mediaAnalysis.runtime.actions.editPreview",
    fallback: "Preparing preview",
  },
  "profile-run-preflight": {
    key: "mediaAnalysis.runtime.actions.runPreflight",
    fallback: "Running preflight",
  },
  "process-run": {
    key: "mediaAnalysis.runtime.actions.processRun",
    fallback: "Running analysis",
  },
  "audio-process-run": {
    key: "mediaAnalysis.runtime.actions.processRun",
    fallback: "Running analysis",
  },
  "process-cancel": {
    key: "mediaAnalysis.runtime.actions.processCancel",
    fallback: "Cancelling analysis",
  },
  "audio-process-cancel": {
    key: "mediaAnalysis.runtime.actions.processCancel",
    fallback: "Cancelling analysis",
  },
  "report-export": {
    key: "mediaAnalysis.runtime.actions.reportExport",
    fallback: "Exporting report",
  },
  "audio-report-export": {
    key: "mediaAnalysis.runtime.actions.reportExport",
    fallback: "Exporting report",
  },
  "tool-install": {
    key: "mediaAnalysis.runtime.actions.toolInstall",
    fallback: "Installing tool",
  },
  "tool-update": {
    key: "mediaAnalysis.runtime.actions.toolUpdate",
    fallback: "Updating tool",
  },
  "tool-check-updates": {
    key: "mediaAnalysis.runtime.actions.toolCheckUpdates",
    fallback: "Checking tool updates",
  },
  "tool-check-all-updates": {
    key: "mediaAnalysis.runtime.actions.toolCheckUpdates",
    fallback: "Checking tool updates",
  },
  "tool-update-selected": {
    key: "mediaAnalysis.runtime.actions.toolUpdate",
    fallback: "Updating tool",
  },
};

const PRIMARY_ACTION_LABELS: Record<string, RuntimeCopyDescriptor> = {
  "Raporları Dışa Aktar": {
    key: "mediaAnalysis.runtime.primaryAction.exportReport",
    fallback: "Export Reports",
  },
  "Çalışmayı İptal Et": {
    key: "mediaAnalysis.runtime.primaryAction.cancelRun",
    fallback: "Cancel Run",
  },
  "Analizi Başlat": {
    key: "mediaAnalysis.runtime.primaryAction.startAnalysis",
    fallback: "Start Analysis",
  },
  "Önizleme Üret": {
    key: "mediaAnalysis.runtime.primaryAction.generatePreview",
    fallback: "Generate Preview",
  },
  "Önizlemeyi Yenile": {
    key: "mediaAnalysis.runtime.primaryAction.refreshPreview",
    fallback: "Refresh Preview",
  },
  "Kaynağı Yenile": {
    key: "mediaAnalysis.runtime.primaryAction.refreshSource",
    fallback: "Refresh Source",
  },
  "Kaynağı Hazırla": {
    key: "mediaAnalysis.runtime.primaryAction.prepareSource",
    fallback: "Prepare Source",
  },
};

const USER_ACTIONS: Record<string, Record<LabUserActionEvent["status"], RuntimeCopyDescriptor>> = {
  "export-timeline-clip": {
    idle: {
      key: "mediaAnalysis.runtime.userActions.exportTimelineClip.running",
      fallback: "Extracting clip",
    },
    running: {
      key: "mediaAnalysis.runtime.userActions.exportTimelineClip.running",
      fallback: "Extracting clip",
    },
    success: {
      key: "mediaAnalysis.runtime.userActions.exportTimelineClip.success",
      fallback: "Clip ready",
    },
    error: {
      key: "mediaAnalysis.runtime.userActions.exportTimelineClip.error",
      fallback: "Clip could not be extracted",
    },
  },
  "export-frame-grab": {
    idle: {
      key: "mediaAnalysis.runtime.userActions.exportFrameGrab.running",
      fallback: "Grabbing frame",
    },
    running: {
      key: "mediaAnalysis.runtime.userActions.exportFrameGrab.running",
      fallback: "Grabbing frame",
    },
    success: {
      key: "mediaAnalysis.runtime.userActions.exportFrameGrab.success",
      fallback: "Frame grabbed",
    },
    error: {
      key: "mediaAnalysis.runtime.userActions.exportFrameGrab.error",
      fallback: "Frame could not be grabbed",
    },
  },
  "export-enhanced-frame": {
    idle: {
      key: "mediaAnalysis.runtime.userActions.exportEnhancedFrame.running",
      fallback: "Preparing enhanced frame",
    },
    running: {
      key: "mediaAnalysis.runtime.userActions.exportEnhancedFrame.running",
      fallback: "Preparing enhanced frame",
    },
    success: {
      key: "mediaAnalysis.runtime.userActions.exportEnhancedFrame.success",
      fallback: "Enhanced frame ready",
    },
    error: {
      key: "mediaAnalysis.runtime.userActions.exportEnhancedFrame.error",
      fallback: "Enhanced frame could not be prepared",
    },
  },
  "export-audio-track": {
    idle: {
      key: "mediaAnalysis.runtime.userActions.exportAudioTrack.running",
      fallback: "Extracting audio",
    },
    running: {
      key: "mediaAnalysis.runtime.userActions.exportAudioTrack.running",
      fallback: "Extracting audio",
    },
    success: {
      key: "mediaAnalysis.runtime.userActions.exportAudioTrack.success",
      fallback: "Audio extracted",
    },
    error: {
      key: "mediaAnalysis.runtime.userActions.exportAudioTrack.error",
      fallback: "Audio could not be extracted",
    },
  },
  "export-roi-image": {
    idle: {
      key: "mediaAnalysis.runtime.userActions.exportRoiImage.running",
      fallback: "Capturing region image",
    },
    running: {
      key: "mediaAnalysis.runtime.userActions.exportRoiImage.running",
      fallback: "Capturing region image",
    },
    success: {
      key: "mediaAnalysis.runtime.userActions.exportRoiImage.success",
      fallback: "Region image ready",
    },
    error: {
      key: "mediaAnalysis.runtime.userActions.exportRoiImage.error",
      fallback: "Region image could not be captured",
    },
  },
  "report-export": {
    idle: {
      key: "mediaAnalysis.runtime.userActions.reportExport.running",
      fallback: "Exporting report",
    },
    running: {
      key: "mediaAnalysis.runtime.userActions.reportExport.running",
      fallback: "Exporting report",
    },
    success: {
      key: "mediaAnalysis.runtime.userActions.reportExport.success",
      fallback: "Report exported",
    },
    error: {
      key: "mediaAnalysis.runtime.userActions.reportExport.error",
      fallback: "Report could not be exported",
    },
  },
  "audio-report-export": {
    idle: {
      key: "mediaAnalysis.runtime.userActions.audioReportExport.running",
      fallback: "Exporting audio report",
    },
    running: {
      key: "mediaAnalysis.runtime.userActions.audioReportExport.running",
      fallback: "Exporting audio report",
    },
    success: {
      key: "mediaAnalysis.runtime.userActions.audioReportExport.success",
      fallback: "Audio report exported",
    },
    error: {
      key: "mediaAnalysis.runtime.userActions.audioReportExport.error",
      fallback: "Audio report could not be exported",
    },
  },
};

function readActionLabelDescriptor(action: string | null | undefined): RuntimeCopyDescriptor {
  if (!action) {
    return {
      key: "mediaAnalysis.runtime.actions.generic",
      fallback: "Action",
    };
  }
  return (
    ACTION_LABELS[action] || {
      key: "mediaAnalysis.runtime.actions.named",
      fallback: "{action}",
      params: { action },
    }
  );
}

export function translateLabRuntimeText(
  text: string | null | undefined,
  copy: LabI18n = LAB_FALLBACK_I18N
): string {
  if (typeof text !== "string" || text.trim() === "") {
    return "";
  }
  const exact = RUNTIME_TEXT[text] || PRIMARY_ACTION_LABELS[text];
  if (exact) {
    return renderDescriptor(exact, copy);
  }
  for (const entry of RUNTIME_TEXT_PATTERNS) {
    const match = text.match(entry.pattern);
    if (match) {
      return renderDescriptor(entry.read(match), copy);
    }
  }
  return text;
}

export function formatLabRuntimeActionLabel(
  action: string | null | undefined,
  copy: LabI18n = LAB_FALLBACK_I18N
): string {
  return renderDescriptor(readActionLabelDescriptor(action), copy);
}

export function formatLabRuntimeEventMessage(
  event: Pick<LabEventFeedItem, "action" | "message" | "stage">,
  copy: LabI18n = LAB_FALLBACK_I18N
): string {
  const stage = typeof event.stage === "string" ? event.stage : null;
  const action = typeof event.action === "string" ? event.action : null;
  if (action && stage) {
    const actionLabel = formatLabRuntimeActionLabel(action, copy);
    switch (stage) {
      case "queued":
        return copy.t("mediaAnalysis.runtime.events.stage.queued", "{action} queued", {
          action: actionLabel,
        });
      case "completed":
        return copy.t("mediaAnalysis.runtime.events.stage.completed", "{action} completed", {
          action: actionLabel,
        });
      case "failed":
        return copy.t("mediaAnalysis.runtime.events.stage.failed", "{action} failed", {
          action: actionLabel,
        });
      case "cancelled":
        return copy.t("mediaAnalysis.runtime.events.stage.cancelled", "{action} cancelled", {
          action: actionLabel,
        });
      default:
        return copy.t("mediaAnalysis.runtime.events.stage.started", "{action} started", {
          action: actionLabel,
        });
    }
  }
  return translateLabRuntimeText(event.message || stage || "", copy);
}

export function formatLabUserActionDisplayText(
  actionEvent: LabUserActionEvent,
  copy: LabI18n = LAB_FALLBACK_I18N
): string {
  const sourceAction = actionEvent.sourceAction || "";
  const known = USER_ACTIONS[sourceAction]?.[actionEvent.status];
  if (known && (actionEvent.status === "running" || !actionEvent.message)) {
    return renderDescriptor(known, copy);
  }
  return translateLabRuntimeText(actionEvent.message || actionEvent.label, copy);
}

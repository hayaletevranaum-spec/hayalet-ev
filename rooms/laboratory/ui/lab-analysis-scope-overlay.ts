import { escapeHtml } from "../domain/lab-types.js";
import { formatTimelineTimeMs } from "../runtime/controller/lab-timeline-controller-helpers.js";

type LabAnalysisScopeOverlayModel = {
  endMs: number | null;
  hasRoi: boolean;
  hasTimeRange: boolean;
  startMs: number | null;
};

type LabAnalysisScopeOverlayDeps = {
  documentRef: Document;
};

export function createLabAnalysisScopeOverlay(deps: LabAnalysisScopeOverlayDeps) {
  let overlay: HTMLElement | null = null;

  function hide() {
    overlay?.remove();
    overlay = null;
  }

  function isOpen() {
    return overlay !== null;
  }

  function formatSelectionSummary(model: LabAnalysisScopeOverlayModel) {
    const details: string[] = [];
    if (model.hasTimeRange) {
      details.push(
        `${formatTimelineTimeMs(model.startMs ?? 0)} - ${formatTimelineTimeMs(model.endMs ?? 0)}`
      );
    }
    if (model.hasRoi) {
      details.push("ROI");
    }
    return details.length > 0 ? details.join(" + ") : "Seçili kapsam";
  }

  function show(model: LabAnalysisScopeOverlayModel) {
    hide();
    const nextOverlay = deps.documentRef.createElement("div");
    nextOverlay.className = "labx-analysis-scope-overlay";
    nextOverlay.setAttribute("data-lab-analysis-scope-overlay", "true");
    nextOverlay.setAttribute("data-open", "true");
    nextOverlay.innerHTML = `
      <button class="labx-analysis-scope-overlay__backdrop" type="button" data-lab-action="analysis-scope-cancel" aria-label="Kapsam onayini kapat"></button>
      <section class="labx-analysis-scope-confirm" role="dialog" aria-modal="true" aria-label="Analiz kapsamı onayı">
        <div class="labx-analysis-scope-confirm__head">
          <span>Analiz kapsamı</span>
          <h3>Seçili alanla mı başlayalım?</h3>
          <p>${escapeHtml(formatSelectionSummary(model))} için ayrı bir kapsam seçili.</p>
        </div>
        <div class="labx-analysis-scope-confirm__body">
          <button class="labx-analysis-scope-confirm__choice" type="button" data-lab-action="analysis-scope-choice" data-lab-value="selected">
            <strong>Seçili alan</strong>
            <span>Zaman aralığı veya ROI ile sınırlı analiz başlat.</span>
          </button>
          <button class="labx-analysis-scope-confirm__choice" type="button" data-lab-action="analysis-scope-choice" data-lab-value="full">
            <strong>Tamamı</strong>
            <span>Seçimi yok sayıp tüm kaynak üzerinde çalıştır.</span>
          </button>
        </div>
        <div class="labx-analysis-scope-confirm__actions">
          <button class="labx-inline-action" type="button" data-lab-action="analysis-scope-cancel">İptal</button>
        </div>
      </section>
    `;
    deps.documentRef.body.appendChild(nextOverlay);
    overlay = nextOverlay;
    nextOverlay
      .querySelector<HTMLElement>(
        "[data-lab-action='analysis-scope-choice'][data-lab-value='selected']"
      )
      ?.focus();
    return true;
  }

  return {
    hide,
    isOpen,
    show,
  };
}

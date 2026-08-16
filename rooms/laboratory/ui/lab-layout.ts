import { escapeHtml } from "../domain/lab-types.js";
import type { LabStoreState, LabWorkspaceSurface } from "../domain/lab-types.js";
import { renderLabCenterPanel } from "./lab-center-panel.js";
import { renderLabDrawer } from "./lab-drawer.js";
import { renderLabProcessStrip } from "./lab-process-strip.js";
import { renderLabTopBar } from "./lab-top-bar.js";
import { renderToolManagementOverlay } from "./tool-management-overlay.js";
import { renderReportOverlay } from "./report-overlay.js";
import { renderLabSourcePanel } from "./lab-source-panel.js";
import { renderLaboratoryLayout } from "./laboratory-layout.js";
import {
  getDrawerCollapsed,
  getWorkspaceMode,
  isRunActive,
  resolveDrawerMode,
} from "../runtime/lab-selectors.js";
import { LAB_FALLBACK_I18N } from "./lab-i18n.js";
import type { LabI18n } from "./lab-i18n.js";

type LabLayoutOptions = {
  bootOverlayActive?: boolean;
};

type LabLayoutKind = "laboratory";

export function getLabLayoutKind(
  _state: LabStoreState,
  _options: LabLayoutOptions = {}
): LabLayoutKind {
  return "laboratory";
}

export function renderLabBootOverlay(copy: LabI18n = LAB_FALLBACK_I18N) {
  const steps = [
    copy.t("mediaAnalysis.loading.steps.context", "Loading room context"),
    copy.t("mediaAnalysis.loading.steps.modules", "Initializing modules"),
    copy.t("mediaAnalysis.loading.steps.tools", "Checking tools"),
  ];
  return `
    <div class="labx-boot-overlay" data-lab-boot-overlay="true" role="status" aria-live="polite" aria-label="${escapeHtml(copy.t("mediaAnalysis.loading.ariaLabel", "Laboratory loading"))}">
      <section class="labx-boot-panel">
        <div class="labx-boot-panel__header">
          <span class="labx-boot-mark" aria-hidden="true"></span>
          <div>
            <p class="labx-boot-panel__eyebrow">${escapeHtml(copy.t("mediaAnalysis.loading.eyebrow", "Ghost House Laboratory"))}</p>
            <h2>${escapeHtml(copy.t("mediaAnalysis.loading.title", "Preparing Laboratory environment"))}</h2>
          </div>
        </div>
        <p class="labx-boot-panel__body">${escapeHtml(copy.t("mediaAnalysis.loading.body", "The shell stays visible while room context and room-local translations finish loading."))}</p>
        <div class="labx-boot-progress" aria-hidden="true"><span></span></div>
        <ol class="labx-boot-steps">
          ${steps
            .map(function (step) {
              return `<li>${escapeHtml(step)}</li>`;
            })
            .join("")}
        </ol>
      </section>
    </div>
  `;
}

export function renderLabLayout(
  state: LabStoreState,
  surface: LabWorkspaceSurface,
  copy: LabI18n = LAB_FALLBACK_I18N,
  options: LabLayoutOptions = {}
) {
  const drawerCollapsed = getDrawerCollapsed(state);
  const drawerMode = resolveDrawerMode(state);
  const bootOverlayActive = options.bootOverlayActive === true;
  const layoutKind = getLabLayoutKind(state, { bootOverlayActive });

  const sourcePanelCollapsed = state.ui.sourcePanelCollapsed === true;
  const processViewActive = state.ui.workspace.processViewActive === true || isRunActive(state);

  return `
    ${renderLaboratoryLayout({
      bootOverlay: bootOverlayActive ? renderLabBootOverlay(copy) : "",
      contextPanel: renderLabDrawer(state, surface, copy),
      inspectorPanel: "",
      leftRail: renderLabSourcePanel(state, copy),
      mainStage: renderLabCenterPanel(surface),
      processStrip: renderLabProcessStrip(state, copy),
      shellAttributes: `data-layout-kind="${layoutKind}" data-ready="${bootOverlayActive ? "false" : "true"}" data-workspace-mode="${getWorkspaceMode(state)}" data-lab-mode="${state.ui.labMode}" data-drawer-mode="${drawerMode}" data-drawer-collapsed="${drawerCollapsed ? "true" : "false"}" data-source-panel-collapsed="${sourcePanelCollapsed ? "true" : "false"}" data-process-view="${processViewActive ? "expanded" : "compact"}"`,
      topBar: renderLabTopBar(state, copy),
    })}
    ${renderToolManagementOverlay(state, copy)}
    ${renderReportOverlay(state, copy)}
  `;
}

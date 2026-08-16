import { asLabRecord } from "../../domain/lab-types.js";
import type { LabStoreState } from "../../domain/lab-types.js";
import { clearExecutionIntent, clearSuggestionPreview } from "./lab-store-execution-state.js";
import { createDefaultWorkspaceUiState } from "./lab-store-defaults.js";
import { clearInspectionDepth, resetInspectionMode } from "./lab-store-workspace-state.js";

type WorkspaceSourceResetOptions = {
  activeWorkspaceAssetId?: string | null;
  comparisonReferenceAssetId?: string | null;
  sourceIntakeCollapsed?: boolean | undefined;
};

export function resetWorkspaceForSourceActivation(
  state: LabStoreState,
  options: WorkspaceSourceResetOptions = {}
) {
  const defaultWorkspace = createDefaultWorkspaceUiState();
  clearExecutionIntent(state);
  clearSuggestionPreview(state);
  resetInspectionMode(state);
  clearInspectionDepth(state);

  state.selectedCapabilities = [];
  state.ui.activeWorkspaceAssetId = options.activeWorkspaceAssetId ?? null;
  state.ui.activePreviewArtifactId = null;
  state.ui.activeDocumentOverlayAssetId = null;
  state.ui.liveFindingsExpanded = false;
  state.ui.analysisControlsCollapsed = true;
  state.ui.analysisCancelPending = false;
  state.ui.analysisCancelRequestId = null;
  state.ui.workspace = {
    ...defaultWorkspace,
    bookmarks: state.ui.workspace.bookmarks,
    comparisonReferenceAssetId: options.comparisonReferenceAssetId ?? null,
    sourceIntakeCollapsed:
      typeof options.sourceIntakeCollapsed === "boolean"
        ? options.sourceIntakeCollapsed
        : defaultWorkspace.sourceIntakeCollapsed,
  };

  state.workbench = {
    ...asLabRecord(state.workbench),
    activeLiveFindingsStreamId: null,
    activePreviewArtifactId: null,
    analysisScope: null,
    analysisSettings: {},
    controlsCollapsed: true,
    moduleToggles: {},
    operationSettings: {},
  };
}

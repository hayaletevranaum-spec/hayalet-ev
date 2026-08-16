import type { RepairPanelId } from "../../shared/types/index.js";
import type { RepairUiSnapshotMeta, RepairUiState } from "../../shared/ui/state.js";

export function buildRepairPanelSignature(params: {
  meta: RepairUiSnapshotMeta;
  panelId: RepairPanelId;
  state: RepairUiState;
}): string {
  const { meta, panelId, state } = params;
  const timelineShape = state.workbench.timeline;
  const layoutShape = {
    collapsed: state.layout.collapsedPanels[panelId],
    primarySurface: state.guidance.panelVisibility.primarySurface,
    operationalProfile: state.guidance.operationalProfile,
    interactionSettings: state.layout.interactionSettings,
    settingsOverlayOpen: state.layout.settingsOverlayOpen,
    settingsOverlayTabId: state.layout.settingsOverlayTabId,
  };
  const guidanceShape = {
    phase: state.guidance.investigationPhase,
    nextBestAction: state.guidance.nextBestAction.text,
    recovery: state.guidance.recovery,
    aiInterruption: state.guidance.aiInterruption,
    focusCorridor: state.guidance.focusCorridor,
    rhythm: state.guidance.rhythm,
    voice: state.guidance.voice,
  };
  const sessionShape = {
    activeId: state.sessions.activeId,
    active: state.sessions.activeId !== null && state.sessions.detail !== null,
  };
  switch (panelId) {
    case "session-rail":
      return JSON.stringify({
        aid: state.sessions.activeId,
        list: state.sessions.list,
        wizard: state.wizard,
        layoutShape,
      });
    case "workbench-stage":
      return JSON.stringify({
        sessionShape,
        sessionImage: state.sessions.detail?.pcbImage?.src ?? null,
        sessionImageLabel: state.sessions.detail?.pcbImage?.label ?? null,
        tool: state.workbench.activeTool,
        frozen: state.workbench.isFrozen,
        frozenAt: state.workbench.frozenAt,
        contextualCursor: state.workbench.contextualCursor,
        operationalMode: state.workbench.operationalMode,
        investigationModeEnabled: state.workbench.investigationModeEnabled,
        liveSource: state.workbench.liveSource,
        viewport: state.workbench.viewport,
        layers: state.workbench.visibleLayers,
        cursor: state.workbench.cursor,
        operationsAvailable: state.operationsAvailable,
        operations: state.operations,
        voiceReadiness: state.voiceReadiness,
        guidanceShape,
        layoutShape,
      });
    case "tactical-feed":
      return JSON.stringify({
        sessionShape,
        aiDispatch: state.aiDispatch,
        feed: state.tacticalFeed.map((item) => [
          item.eventId,
          item.occurredAt,
          item.relativeLabel,
          item.severity,
          item.badge,
          item.body,
        ]),
        focusedEventId: state.workbench.focusedEventId,
        guidanceShape,
        layoutShape,
      });
    case "session-wizard":
      return JSON.stringify({ wizard: state.wizard, guidanceShape, layoutShape });
    case "knowledge-pack":
      return JSON.stringify({
        sessionShape,
        knowledgePack: state.knowledgePack,
        guidanceShape,
        layoutShape,
      });
    case "visual-timeline":
      return JSON.stringify({
        sessionShape,
        phase: state.phase,
        focusedEventId: state.workbench.focusedEventId,
        timelineShape: {
          autoFollowLive: timelineShape.autoFollowLive,
          replayMode: timelineShape.replayMode,
        },
        events: meta.events,
        imageSrc: state.sessions.detail?.pcbImage?.src ?? null,
        guidanceShape,
        layoutShape,
      });
    case "operator-profile":
      return JSON.stringify({
        profile: state.operatorProfile,
        operatorProfileTabId: state.layout.operatorProfileTabId,
        layoutShape,
      });
    default: {
      const exhaustivePanelId: never = panelId;
      return JSON.stringify({ panelId: exhaustivePanelId, layoutShape });
    }
  }
}

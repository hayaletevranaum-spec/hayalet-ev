import type { RepairImagePoint, RepairOverlayEntityRef } from "../../shared/types/index.js";
import type { RepairUiSnapshotMeta, RepairUiState } from "../../shared/ui/state.js";
import type { createRepairUiRequestRuntime } from "../../shared/ui/request-runtime.js";
import { mountRepairOverlayStage, type RepairOverlayController } from "../overlay/overlay-stage.js";
import { resolveRepairAssetUrl } from "../repair-asset-url.js";
import { getRepairOverlayRefKey } from "./guidance-helpers.js";

type RepairUiRequestRuntime = ReturnType<typeof createRepairUiRequestRuntime>;
type RepairOverlayStageConfig = Parameters<typeof mountRepairOverlayStage>[0];

export function createRepairOverlayRuntime(params: {
  cancelSpatialFocusTween: () => void;
  onCursor: (point: RepairImagePoint) => void;
  meta: RepairUiSnapshotMeta;
  requestRuntime: RepairUiRequestRuntime;
  state: RepairUiState;
}) {
  const { cancelSpatialFocusTween, meta, onCursor, requestRuntime, state } = params;
  let overlayController: RepairOverlayController | null = null;
  let overlayControllerHost: HTMLElement | null = null;
  let overlayMounting = false;
  let overlayMountVersion = 0;
  let latestOverlayConfig: RepairOverlayStageConfig | null = null;
  let lastOverlaySignature = "";

  function destroyOverlay(): void {
    overlayMountVersion += 1;
    overlayController?.destroy();
    overlayController = null;
    overlayControllerHost = null;
    overlayMounting = false;
    latestOverlayConfig = null;
    lastOverlaySignature = "";
  }

  function buildOverlaySignature(config: RepairOverlayStageConfig): string {
    return JSON.stringify({
      events: config.events.map((event) => [
        event.id,
        event.kind,
        event.occurredAt,
        event.kind === "measurement" ? event.pinAt : null,
        event.kind === "annotation" ? [event.region, event.point, event.label, event.color] : null,
        event.kind === "ai-mark" || event.kind === "risk-flag" ? event.region : null,
      ]),
      focusedEventId: config.focusedEventId,
      image: [config.image.src, config.image.widthPx, config.image.heightPx],
      visibleLayers: config.visibleLayers,
      activeSpatialFocus: config.activeSpatialFocus,
      investigationRegions: config.investigationRegions,
      knowledgeRegions: config.knowledgeRegions,
      measurementRelationships: config.measurementRelationships,
      temporarySpatialRegions: config.temporarySpatialRegions,
      guidance: config.guidance,
      workbench: {
        activeTool: config.workbench.activeTool,
        viewport: config.workbench.viewport,
        contextualCursor: config.workbench.contextualCursor,
        hoveredEventId: config.workbench.selection.hoveredEventId,
        hoveredEntityRef: config.workbench.selection.hoveredEntityRef,
        selectedEventIds: config.workbench.selection.selectedEventIds,
        selectedEntityRefs: config.workbench.selection.selectedEntityRefs,
        investigationModeEnabled: config.workbench.investigationModeEnabled,
      },
    });
  }

  function buildOverlayConfig(root: HTMLElement): RepairOverlayStageConfig | null {
    const overlayHost = root.querySelector<HTMLElement>("[data-repair-overlay-stage='workbench']");
    const session = state.sessions.detail;
    if (overlayHost === null || session === null || session.pcbImage === null) return null;
    const image = {
      ...session.pcbImage,
      src: resolveRepairAssetUrl(session.pcbImage.src) ?? session.pcbImage.src,
    };
    const visibleOverlayEventIds = new Set(state.guidance.overlaySaturation.visibleEventIds);
    const visibleRelationshipIds = new Set(state.guidance.overlaySaturation.visibleRelationshipIds);
    const visibleRegionKeys = new Set(
      state.guidance.overlaySaturation.visibleRegionRefs.map(getRepairOverlayRefKey)
    );
    const shouldFilterRegions =
      state.guidance.operationalProfile !== "advanced" && visibleRegionKeys.size > 0;
    const overlayEvents =
      state.guidance.operationalProfile === "advanced" || visibleOverlayEventIds.size === 0
        ? meta.replay.overlayEvents
        : meta.replay.overlayEvents.filter((event) => visibleOverlayEventIds.has(event.id));
    const measurementRelationships =
      state.guidance.operationalProfile === "advanced" || visibleRelationshipIds.size === 0
        ? meta.replay.measurementRelationships
        : meta.replay.measurementRelationships.filter((relationship) =>
            visibleRelationshipIds.has(relationship.id)
          );
    const investigationRegions = shouldFilterRegions
      ? meta.replay.investigationRegions.filter((region) =>
          visibleRegionKeys.has(`investigation-region:${region.regionId}`)
        )
      : meta.replay.investigationRegions;
    const knowledgeRegions = shouldFilterRegions
      ? meta.replay.knowledgeRegions.filter((region) =>
          visibleRegionKeys.has(`knowledge-region:${region.id}`)
        )
      : meta.replay.knowledgeRegions;
    const temporarySpatialRegions = shouldFilterRegions
      ? meta.replay.temporarySpatialRegions.filter((region) =>
          visibleRegionKeys.has(`temporary-spatial-region:${region.id}`)
        )
      : meta.replay.temporarySpatialRegions;
    return {
      container: overlayHost,
      activeSpatialFocus: meta.replay.activeSpatialFocus,
      events: overlayEvents,
      focusedEventId: state.workbench.focusedEventId ?? meta.replay.focusSuggestionEventId,
      image,
      investigationRegions,
      knowledgeRegions,
      measurementRelationships,
      temporarySpatialRegions,
      guidance: state.guidance,
      visibleLayers: state.workbench.visibleLayers,
      workbench: state.workbench,
      onAddAnnotation: (payload) => {
        requestRuntime.addTimelineEvent({ kind: "annotation", ...payload });
      },
      onAddMeasurement: (payload) => {
        requestRuntime.addMeasurement({
          rawDisplay: state.measurement.current.display,
          ...payload,
        });
      },
      onCursor,
      onEntityClick: (ref, interaction) => {
        cancelSpatialFocusTween();
        requestRuntime.selectOverlayEntities({
          refs: [ref],
          mode: interaction.additive ? "toggle" : "replace",
          inspectorRef: ref,
          focusJump: interaction.focusJump,
        });
        if (interaction.focusJump && interaction.additive === false) {
          requestRuntime.focusOverlayEntity({ ref, focusJump: true });
        }
      },
      onEntityFocus: (ref) => {
        cancelSpatialFocusTween();
        requestRuntime.focusOverlayEntity({ ref, focusJump: true });
      },
      onEntityHover: (ref) => {
        requestRuntime.updateFocus({ hoveredEntityRef: ref });
      },
      onEventClick: (eventId, interaction) => {
        requestRuntime.updateFocus({
          eventId,
          selectionMode: interaction.additive ? "toggle" : "replace",
          focusJump: interaction.focusJump,
          jumpToEvent: interaction.focusJump && interaction.additive === false,
        });
      },
      onEventHover: (eventId) => {
        requestRuntime.updateFocus({ hoveredEventId: eventId });
      },
      onSelectionClear: () => {
        cancelSpatialFocusTween();
        requestRuntime.updateFocus({ clearSelection: true });
      },
      onMarqueeSelect: (refs: RepairOverlayEntityRef[], additive: boolean) => {
        requestRuntime.selectOverlayEntities({
          refs,
          mode: additive ? "toggle" : "replace",
          inspectorRef: refs.at(-1) ?? null,
          focusJump: false,
        });
      },
      onNudgeSelection: (delta, hardSnap) => {
        cancelSpatialFocusTween();
        requestRuntime.updateFocus({
          nudgeDelta: delta,
          hardSnap,
        });
      },
      onViewportChange: (payload) => {
        cancelSpatialFocusTween();
        requestRuntime.updateViewport({
          viewportZoom: payload.zoom,
          panXPx: payload.panXPx,
          panYPx: payload.panYPx,
        });
      },
    };
  }

  async function syncOverlay(root: HTMLElement): Promise<void> {
    const overlayConfig = buildOverlayConfig(root);
    latestOverlayConfig = overlayConfig;
    if (overlayConfig === null) {
      destroyOverlay();
      return;
    }
    const overlaySignature = buildOverlaySignature(overlayConfig);
    if (overlayController !== null && overlayControllerHost === overlayConfig.container) {
      if (overlaySignature === lastOverlaySignature) return;
      lastOverlaySignature = overlaySignature;
      overlayController.update(overlayConfig);
      return;
    }
    if (overlayController !== null && overlayControllerHost !== overlayConfig.container) {
      destroyOverlay();
    }
    if (overlayMounting) return;
    overlayMounting = true;
    const mountVersion = ++overlayMountVersion;
    let needsRemount = false;
    try {
      const controller = await mountRepairOverlayStage(overlayConfig);
      if (controller === null) return;
      const currentConfig = latestOverlayConfig;
      if (
        mountVersion !== overlayMountVersion ||
        currentConfig === null ||
        currentConfig.container !== overlayConfig.container
      ) {
        controller.destroy();
        needsRemount = currentConfig !== null;
        return;
      }
      overlayController = controller;
      overlayControllerHost = overlayConfig.container;
      lastOverlaySignature = buildOverlaySignature(currentConfig);
      controller.update(currentConfig);
    } catch (error) {
      overlayConfig.container.dataset["overlayError"] = "true";
      console.error("[repair-room] overlay mount failed", error);
      return;
    } finally {
      overlayMounting = false;
      if (needsRemount) {
        void syncOverlay(root);
      }
    }
  }

  return {
    destroyOverlay,
    syncOverlay,
  };
}

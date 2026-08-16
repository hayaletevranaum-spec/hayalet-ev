import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  getActiveExecutionIntent,
  getActiveSuggestionPreview,
  getAnalysisActionBlockReason,
  getAnalysisPreparationGroups,
  getProcessingOverlayState,
  getWaveformTimelineModel,
} from "../../rooms/laboratory/runtime/lab-selectors.ts";
import { createLabStore } from "../../rooms/laboratory/runtime/lab-store.ts";
import { renderLabDrawer } from "../../rooms/laboratory/ui/lab-drawer.ts";
import { renderLabProcessStrip } from "../../rooms/laboratory/ui/lab-process-strip.ts";
import { renderLabSourcePanel } from "../../rooms/laboratory/ui/lab-source-panel.ts";
import { createLabI18n } from "../../rooms/laboratory/ui/lab-i18n.ts";
import { renderLabLayout } from "../../rooms/laboratory/ui/lab-layout.ts";
import { renderToolManagementOverlay } from "../../rooms/laboratory/ui/tool-management-overlay.ts";
import { renderWorkspaceOperationControls } from "../../rooms/laboratory/ui/workspace-operation-controls.ts";
import {
  renderSourceIntake,
  renderWorkspaceSurface,
} from "../../rooms/laboratory/ui/workspace-surface.ts";

const sourcePresets = JSON.parse(
  readFileSync("rooms/laboratory/tools/source-presets.json", "utf8")
);
const ytDlpForm = JSON.parse(readFileSync("rooms/laboratory/tools/yt-dlp.form.json", "utf8"));

function createTurkishCopy() {
  return createLabI18n({
    locale: "tr",
    translations: JSON.parse(readFileSync("rooms/laboratory/i18n/tr.json", "utf8")),
  });
}

function createSeededState(ffmpegInstalled = false) {
  const store = createLabStore();
  store.dispatch({
    type: "snapshot-received",
    payload: {
      featureId: "media-analysis",
      ready: true,
      activeProjectId: "project-1",
      projects: [
        { id: "project-1", name: "2026-04-21 12-00 - lab-demo.mp4", hasSource: true },
        { id: "draft-1", name: "Draft", hasSource: false },
      ],
      activeProject: {
        id: "project-1",
        name: "2026-04-21 12-00 - lab-demo.mp4",
        createdAt: "2026-04-21T12:00:00.000Z",
        source: {
          status: "ready",
          kind: "video",
          mode: "local",
          previewUrl: "file:///tmp/lab-demo.mp4",
          storedFileName: "lab-demo.mp4",
          storedPath: "/tmp/lab-demo.mp4",
          routeLabel: "Local Copy",
          drafts: {
            urlInput: "",
            youtubeUrl: "",
            youtubePreset: "medium",
            youtubeCustom: {},
          },
          metadata: {
            audioCodec: "aac",
            width: 640,
            height: 360,
            durationSeconds: 801,
            sizeBytes: 86100000,
          },
        },
        edit: {},
        profile: {
          preflight: {},
        },
        process: {
          records: {},
        },
        report: {
          records: {},
        },
      },
      workbench: {
        activeModuleId: "media-analysis",
        availableModuleIds: ["media-analysis", "audio-analysis"],
        selectedModuleIds: ["media-analysis", "audio-analysis"],
      },
      sourcePresets,
      ytDlpForm,
      toolRegistry: [
        {
          toolId: "ffmpeg",
          displayName: "FFmpeg",
          availability: "system-command",
          stageSupport: {
            source: "optional",
            process: "required",
          },
          usedBy: ["media-analysis", "audio-analysis"],
        },
        {
          toolId: "yt-dlp",
          displayName: "yt-dlp",
          availability: "installable",
          readinessImpact: "YouTube capture stays enabled from the source intake frame.",
          stageSupport: {
            source: "required",
          },
          usedBy: ["source-intake"],
        },
        {
          toolId: "librosa",
          displayName: "librosa",
          availability: "system-command",
          installerType: "python-venv-pip",
          installPackages: ["librosa", "numpy", "scipy"],
          estimatedDownloadSize: "80 - 250 MB",
          estimatedInstalledSize: "250 - 700 MB",
          venvDir: "${roomStorageDir}/runtime/librosa-venv",
          readinessImpact: "Music helpers stay blocked until the Python runtime is installed.",
          stageSupport: {
            process: "optional",
          },
          usedBy: ["audio-analysis"],
        },
        {
          toolId: "transcript-runtime",
          displayName: "Speech Runtime",
          availability: "installable",
          readinessImpact: "Optional transcription helpers stay available for room-local runs.",
          stageSupport: {
            process: "optional",
          },
          usedBy: ["audio-analysis"],
        },
      ],
      toolState: {
        tools: {
          ffmpeg: {
            installed: ffmpegInstalled,
          },
          "yt-dlp": {
            installed: true,
            version: "2026.04.20",
            latestVersion: "2026.04.20",
            lastCheckedAt: "2026-05-24T20:23:29.941Z",
            updateAvailable: false,
          },
          librosa: {
            installed: false,
          },
          "transcript-runtime": {
            installed: false,
          },
        },
      },
      sourceProbeStatus: "completed",
      profileModels: [],
      reports: {
        user: null,
        ai: null,
        emptyReason: "Rapor henüz üretilmedi.",
      },
      activityFeed: [],
    },
  });
  return store;
}

void test("laboratory selected image assets stay on the processable inspection stage", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-enhanced-frame",
      type: "image",
      name: "enhanced-frame.png",
      localPath: "/tmp/enhanced-frame.png",
      createdAt: 300,
      metadata: {
        kind: "image",
      },
    },
  });
  store.dispatch({
    type: "workspace-asset-selected",
    assetId: "asset-enhanced-frame",
  });

  const surface = renderWorkspaceSurface(store.getState());

  assert.match(surface.main, /data-lab-preview-inspection-stage="true"/);
  assert.match(surface.main, /data-lab-selection-roi-stage="true"/);
  assert.match(surface.main, /data-lab-preview-inspection-topology="single-image"/);
  assert.match(surface.main, /data-lab-workspace-asset-id="asset-enhanced-frame"/);
  assert.match(surface.main, /data-lab-workspace-asset-kind="image"/);
  assert.match(surface.main, /data-lab-preserve-media="workspace-preview"/);
  assert.doesNotMatch(surface.main, /class="labx-workspace-content"/);
  assert.doesNotMatch(surface.main, /data-preview-mode=/);
  assert.match(surface.inspector ?? "", /data-operation-id="enhanced-frame"/);
});

void test("laboratory image comparison workspace keeps image pair on the inspection workbench", () => {
  const store = createSeededState(true);
  const state = store.getState();
  state.source = {
    ...state.source,
    status: "ready",
    kind: "image",
    mode: "local",
    previewUrl: "file:///tmp/primary-image.png",
    storedFileName: "primary-image.png",
    storedPath: "/tmp/primary-image.png",
    routeLabel: "Local Copy",
    metadata: {
      height: 480,
      width: 640,
    },
  };
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-reference-image",
      type: "image",
      name: "reference-image.png",
      localPath: "/tmp/reference-image.png",
      createdAt: 400,
      metadata: { kind: "image" },
    },
  });
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-comparison-snapshot",
      type: "image",
      name: "comparison-finding-snapshot.png",
      localPath: "/tmp/comparison-finding-snapshot.png",
      createdAt: 410,
      metadata: {
        artifactKind: "comparison-finding-snapshot",
        findingId: "finding-1",
      },
    },
  });
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-comparison-manifest",
      type: "artifact",
      name: "comparison-finding.json",
      localPath: "/tmp/comparison-finding.json",
      createdAt: 411,
      metadata: {
        artifactKind: "comparison-finding-manifest",
        captureContext: {
          comparisonRois: {
            activeSide: "reference",
            primary: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
            reference: { x: 0.2, y: 0.1, width: 0.25, height: 0.35 },
          },
        },
        findingId: "finding-1",
        note: "Sol göz çevresinde belirgin fark",
        primaryAssetId: "asset-primary-image",
        referenceAssetId: "asset-reference-image",
        roiSummary:
          "Primary ROI x=10%, y=20%, w=30%, h=40%; Reference ROI x=20%, y=10%, w=25%, h=35%; active=reference",
        snapshotAssetId: "asset-comparison-snapshot",
      },
    },
  });
  store.dispatch({
    type: "workspace-comparison-reference-set",
    assetId: "asset-reference-image",
  });
  store.dispatch({
    type: "workspace-comparison-updated",
    patch: { comparisonViewMode: "side-by-side" },
  });
  store.dispatch({
    type: "selection-roi-updated",
    comparisonSide: "primary",
    roi: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  });
  store.dispatch({
    type: "selection-roi-updated",
    comparisonSide: "reference",
    roi: { x: 0.2, y: 0.1, width: 0.25, height: 0.35 },
  });
  store.dispatch({
    type: "workspace-interactive-updated",
    comparisonSide: "reference",
    patch: { brightness: 112 },
  });

  const surface = renderWorkspaceSurface(store.getState());

  assert.match(surface.main, /data-lab-workspace-comparison-stage="true"/);
  assert.match(surface.main, /data-lab-selection-roi-stage="true"/);
  assert.match(surface.main, /data-lab-selection-roi-controls-reserve="0"/);
  assert.match(surface.main, /data-lab-selection-roi-overlay="true"/);
  assert.match(surface.main, /id="lab-roi-overlay-primary"/);
  assert.match(surface.main, /id="lab-roi-overlay-reference"/);
  assert.match(surface.main, /data-lab-comparison-roi-side="primary"/);
  assert.match(surface.main, /data-lab-comparison-roi-side="reference"/);
  assert.match(surface.main, /data-side="primary" data-active="false"/);
  assert.match(surface.main, /data-side="reference" data-active="true"/);
  assert.match(surface.main, /data-lab-comparison-roi-side="reference"[\s\S]*data-active="true"/);
  assert.match(surface.main, /data-lab-preview-inspection-stage="true"/);
  assert.match(surface.main, /data-lab-preview-inspection-topology="comparison-paired"/);
  assert.match(
    surface.main,
    /data-lab-preserve-media="workspace-comparison-primary" src="file:\/\/\/tmp\/primary-image\.png"/
  );
  assert.match(
    surface.main,
    /data-lab-preserve-media="workspace-comparison-reference" src="file:\/\/\/tmp\/reference-image\.png"/
  );
  assert.doesNotMatch(
    surface.main,
    /data-lab-preserve-media="workspace-comparison-primary"[^>]*style=/
  );
  assert.match(
    surface.main,
    /data-lab-preserve-media="workspace-comparison-reference"[^>]*style="filter: brightness\(1\.12\);"/
  );
  assert.match(surface.main, /data-lab-value="image-comparison"/);
  assert.doesNotMatch(surface.main, /data-preview-mode=/);
  assert.match(
    surface.inspector ?? "",
    /data-readiness="ready"[\s\S]*data-operation-id="image-comparison"/
  );
  assert.match(surface.inspector ?? "", /data-lab-comparison-roi-status="primary"/);
  assert.match(surface.inspector ?? "", /data-lab-comparison-roi-status="reference"/);
  assert.match(
    surface.inspector ?? "",
    /data-lab-comparison-roi-status="reference"[\s\S]*data-active="true"[\s\S]*data-selected="true"/
  );
  assert.match(surface.inspector ?? "", /data-lab-comparison-finding-list="true"/);
  assert.match(surface.inspector ?? "", /data-lab-action="workspace-comparison-finding-focus"/);
  assert.match(surface.inspector ?? "", /data-lab-value="finding-1"/);
  assert.match(surface.inspector ?? "", /Sol göz çevresinde belirgin fark/);
  assert.match(surface.inspector ?? "", /Primary ROI x=10%, y=20%, w=30%, h=40%/);
});

void test("laboratory image comparison visual controls follow the active image settings", () => {
  const store = createSeededState(true);
  const state = store.getState();
  state.source = {
    ...state.source,
    status: "ready",
    kind: "image",
    mode: "local",
    previewUrl: "file:///tmp/primary-image.png",
    storedFileName: "primary-image.png",
    storedPath: "/tmp/primary-image.png",
    routeLabel: "Local Copy",
  };
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-reference-image",
      type: "image",
      name: "reference-image.png",
      localPath: "/tmp/reference-image.png",
      createdAt: 400,
      metadata: { kind: "image" },
    },
  });
  store.dispatch({
    type: "workspace-comparison-reference-set",
    assetId: "asset-reference-image",
  });
  store.dispatch({
    type: "workspace-interactive-updated",
    comparisonSide: "primary",
    patch: { brightness: 132 },
  });
  store.dispatch({
    type: "workspace-interactive-updated",
    comparisonSide: "reference",
    patch: { brightness: 84 },
  });

  store.dispatch({ type: "workspace-comparison-side-activated", side: "primary" });
  let surface = renderWorkspaceSurface(store.getState());

  assert.match(
    surface.inspector ?? "",
    /value="132"[\s\S]*data-lab-field="workspace\.interactive\.brightness"/
  );
  assert.match(
    surface.main,
    /data-lab-preserve-media="workspace-comparison-primary"[^>]*style="filter: brightness\(1\.32\);"/
  );

  store.dispatch({ type: "workspace-comparison-side-activated", side: "reference" });
  surface = renderWorkspaceSurface(store.getState());

  assert.match(
    surface.inspector ?? "",
    /value="84"[\s\S]*data-lab-field="workspace\.interactive\.brightness"/
  );
  assert.match(
    surface.main,
    /data-lab-preserve-media="workspace-comparison-reference"[^>]*style="filter: brightness\(0\.84\);"/
  );
});

void test("laboratory workspace asset preview resets timeline controls to the selected file", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 72_232,
    endMs: 129_335,
  });
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-audio-target",
      type: "audio",
      name: "voice-clean.wav",
      localPath: "/tmp/voice-clean.wav",
      createdAt: 300,
      metadata: {
        durationMs: 4200,
        kind: "audio",
      },
    },
  });

  store.dispatch({
    type: "workspace-asset-selected",
    assetId: "asset-audio-target",
  });

  const state = store.getState();
  const timeline = getWaveformTimelineModel(state);
  const surface = renderWorkspaceSurface(state);

  assert.equal(state.ui.workspace.timelineStartMs, null);
  assert.equal(state.ui.workspace.timelineEndMs, null);
  assert.equal(state.ui.workspace.activeSelection, null);
  assert.equal(timeline.sourceKind, "audio");
  assert.equal(timeline.durationMs, 4200);
  assert.equal(timeline.startMs, null);
  assert.equal(timeline.endMs, null);
  assert.equal(timeline.activeSelection?.startMs, 0);
  assert.equal(timeline.activeSelection?.endMs, 4200);
  assert.match(surface.main, /data-duration="4200"/);
  assert.match(surface.main, /00:04\.200/);
  assert.doesNotMatch(surface.main, /01:12\.232/);
  assert.doesNotMatch(surface.main, /02:09\.335/);
});

void test("laboratory workspace operations block remote asset targets instead of falling back to source", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-remote-clip",
      type: "clip",
      name: "remote_clip.mp4",
      url: "https://example.test/remote_clip.mp4",
      createdAt: 300,
      metadata: {
        kind: "video",
      },
    },
  });
  store.dispatch({
    type: "workspace-asset-selected",
    assetId: "asset-remote-clip",
  });

  const surface = renderWorkspaceSurface(store.getState());

  assert.match(surface.main, /data-lab-workspace-asset-kind="video"/);
  assert.match(
    surface.inspector ?? "",
    /data-readiness="blocked"[\s\S]*data-operation-id="clip-export"/
  );
  assert.match(surface.inspector ?? "", /Seçili dosya yerel işlem hedefi değil/);
  assert.doesNotMatch(surface.inspector ?? "", /data-lab-action="timeline-export-clip"/);
});

void test("laboratory running work keeps the active operation contract without a fullscreen overlay", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "user-action-added",
    actionEvent: {
      id: "user-action-enhanced-frame",
      type: "custom",
      label: "İyileştirilmiş frame hazırlanıyor",
      status: "running",
      startedAt: Date.now() - 2400,
      requestId: "request-enhanced-frame",
      projectId: "project-1",
      sourceAction: "export-enhanced-frame",
      progress: 42,
    },
  });
  store.dispatch({ type: "workspace-source-intake-toggled", force: false });

  const overlay = getProcessingOverlayState(store.getState());
  const surface = renderWorkspaceSurface(store.getState());
  const sourceIntake = renderSourceIntake(store.getState());

  assert.equal(overlay.active, true);
  assert.equal(overlay.cancelAction, "operation-cancel");
  assert.equal(overlay.cancelValue, "enhanced-frame");
  assert.equal(overlay.progress, 42);
  assert.doesNotMatch(surface.main, /data-lab-region="processing-overlay"/);
  assert.doesNotMatch(surface.main, /class="labx-processing-overlay"/);
  assert.doesNotMatch(surface.main, /İyileştirilmiş frame hazırlanıyor/);
  assert.doesNotMatch(surface.main, /data-indeterminate="false" style="width: 42%"/);
  assert.doesNotMatch(
    surface.main,
    /data-lab-action="operation-cancel"[\s\S]*data-lab-value="enhanced-frame"/
  );
  assert.match(sourceIntake, /data-lab-action="load-source"[^>]*disabled/);
  assert.match(surface.main, /data-lab-action="timeline-toggle-playback"[^>]*disabled/);
  assert.match(surface.main, /data-lab-field="workspace\.previewVolume"[^>]*disabled/);
  assert.match(surface.main, /class="labx-icon-rail"[^>]*data-locked="true"/);
});

void test("laboratory active analysis locks source and workspace controls while showing process details", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "run-started",
    action: "process-run",
  });

  const state = store.getState();
  const surface = renderWorkspaceSurface(state);
  const sourcePanel = renderLabSourcePanel(state);
  const strip = renderLabProcessStrip(state);
  const layout = renderLabLayout(state, surface);

  assert.match(sourcePanel, /class="labx-source-panel"[^>]*data-analysis-locked="true"/);
  assert.match(sourcePanel, /data-lab-field="project\.id"[^>]*disabled/);
  assert.match(sourcePanel, /data-lab-action="project-create"[^>]*disabled/);
  assert.match(sourcePanel, /data-lab-action="project-import-local-add"[^>]*disabled/);
  assert.match(sourcePanel, /data-lab-field="project-import\.urlInput"[^>]*disabled/);
  assert.match(surface.main, /class="labx-workspace-main"[^>]*data-analysis-locked="true"/);
  assert.match(
    surface.main,
    /class="labx-media-workbench"[^>]*data-analysis-locked="true"[^>]*inert/
  );
  assert.match(strip, /data-process-view="expanded"/);
  assert.match(strip, /data-process-view-forced="true"/);
  assert.match(strip, /data-lab-process-expanded="true"/);
  assert.match(strip, /data-lab-action="workspace-process-view-toggled"[^>]*disabled/);
  assert.match(layout, /data-process-view="expanded"/);
});

void test("laboratory operation error buttons keep retry label short and expose message in title", () => {
  const html = renderWorkspaceOperationControls([
    {
      actionId: "workspace-enhanced-frame-export",
      actionStatus: "error",
      activeActionLabel: "İyileştirilmiş frame hazırlanıyor",
      activeActionMessage: "ffmpeg returned a very long diagnostic about an unsupported filter",
      activeJobId: null,
      activeRequestId: "request-enhanced-frame",
      blockReason: null,
      description: "Generate a clarity-focused frame or ROI variant.",
      flowKind: "operation-result",
      groupId: "frame",
      id: "enhanced-frame",
      label: "Enhanced Frame",
      outputKinds: ["frame", "image", "variant"],
      providerIds: ["ffmpeg-visual-reveal"],
      readiness: "ready",
      settings: {},
      settingsFields: [],
      sourceKinds: ["video", "image"],
      toolIds: ["ffmpeg"],
    },
  ]);

  assert.match(html, /data-action-status="error"/);
  assert.match(html, /<h3>Enhanced Frame<\/h3>/);
  assert.match(html, /data-title-hidden="false"/);
  assert.match(html, />Retry<\/button>/);
  assert.match(html, /title="ffmpeg returned a very long diagnostic about an unsupported filter"/);
  assert.match(html, /class="labx-operation-card__action-state"/);
  assert.doesNotMatch(html, /<h2 class="labx-card__title">(?:Operations|İşlemler)<\/h2>/);
});

void test("laboratory operation success state returns controls to the normal run action", () => {
  const html = renderWorkspaceOperationControls([
    {
      actionId: "workspace-selection-roi-export",
      actionStatus: "success",
      activeActionLabel: "Bölge görüntüsü alınıyor",
      activeActionMessage: "Bölge görüntüsü hazır",
      activeJobId: null,
      activeRequestId: "request-roi-crop",
      blockReason: null,
      description: "Crop the selected ROI.",
      flowKind: "operation-result",
      groupId: "frame",
      id: "roi-crop",
      label: "ROI Crop",
      outputKinds: ["image"],
      providerIds: ["ffmpeg-visual-reveal"],
      readiness: "ready",
      settings: {},
      settingsFields: [],
      sourceKinds: ["video", "image"],
      toolIds: ["ffmpeg"],
    },
  ]);

  assert.match(html, /data-action-status="idle"/);
  assert.match(html, />Run<\/button>/);
  assert.doesNotMatch(html, /Bölge görüntüsü hazır/);
  assert.doesNotMatch(html, /class="labx-operation-card__action-state"/);
});

void test("laboratory Turkish workspace controls localize operation and analysis catalog labels", () => {
  const store = createSeededState(true);
  store.dispatch({ type: "analysis-prep-group-toggled", capabilityId: "audio-signal" });
  store.dispatch({ type: "analysis-prep-group-expanded", capabilityIds: ["audio-signal"] });
  const trCopy = createTurkishCopy();
  const surface = renderWorkspaceSurface(store.getState(), { copy: trCopy });
  const drawer = renderLabDrawer(store.getState(), surface, trCopy);

  assert.match(surface.inspector ?? "", /Klip Dışa Aktarma/);
  assert.match(surface.inspector ?? "", /Aktif zaman aralığı seçiminden bağımsız bir klip oluştur/);
  assert.match(surface.inspector ?? "", /Kare Yakalama/);
  assert.match(surface.inspector ?? "", /Çıktı: klip/);
  assert.match(surface.inspector ?? "", /İşlemler/);
  assert.match(surface.inspector ?? "", /Ön ayar|On ayar/);
  assert.doesNotMatch(
    surface.inspector ?? "",
    /Clip Export|Frame Grab|Create a standalone clip|Capture the current video frame|>Preset<|>Apply preview</
  );
  assert.match(drawer, /Analiz Modulleri/);
  assert.match(drawer, /Ses sinyali/);
  assert.match(drawer, /Sinyal sagligi/);
  assert.doesNotMatch(
    drawer,
    /Visual inspection|Audio investigation|forensic markers|Audio signal|Speech evidence/
  );

  const blockedStore = createSeededState(false);
  const blockedSurface = renderWorkspaceSurface(blockedStore.getState(), { copy: trCopy });
  const blockedDrawer = renderLabDrawer(blockedStore.getState(), blockedSurface, trCopy);
  assert.match(blockedDrawer, /Mevcut araclarla yapilabilen analiz yok/);
  assert.doesNotMatch(blockedDrawer, /Gerekli araçlar kurulu değil/);
  assert.doesNotMatch(blockedDrawer, /Required tools not installed/);
});

void test("laboratory analysis preparation groups default closed and expand on demand", () => {
  const store = createSeededState(true);
  const defaultGroups = getAnalysisPreparationGroups(store.getState());
  assert.ok(defaultGroups.every((group) => group.selectionState === "none"));
  assert.ok(
    defaultGroups.every((group) => group.modules.every((module) => module.enabled === false))
  );

  const closedDrawer = renderLabDrawer(store.getState(), renderWorkspaceSurface(store.getState()));
  assert.match(closedDrawer, /data-lab-action="analysis-prep-group-toggle"/);
  assert.match(closedDrawer, /data-lab-action="analysis-prep-group-drawer-toggle"/);
  assert.match(closedDrawer, /aria-expanded="false"/);
  assert.doesNotMatch(closedDrawer, /class="labx-analysis-module"/);
  const closedGroupToggle = closedDrawer.match(
    /<input[^>]*data-lab-action="analysis-prep-group-toggle"[^>]*data-lab-value="audio-signal"[^>]*>/
  )?.[0];
  assert.ok(closedGroupToggle);
  assert.match(closedGroupToggle, /aria-checked="false"/);
  assert.match(closedGroupToggle, /data-selection-state="none"/);
  assert.doesNotMatch(closedGroupToggle, /\sdisabled(\s|>|\/)/);

  store.dispatch({ type: "analysis-prep-group-expanded", capabilityIds: ["audio-signal"] });
  const openDrawer = renderLabDrawer(store.getState(), renderWorkspaceSurface(store.getState()));

  assert.match(openDrawer, /data-lab-value="audio-signal"[\s\S]*aria-expanded="true"/);
  assert.match(openDrawer, /class="labx-analysis-module"/);
  assert.match(openDrawer, /Audio signal/);
  assert.deepEqual(store.getState().selectedCapabilities, []);
  const signalToggle = openDrawer.match(
    /<input[^>]*data-lab-action="module-toggle"[^>]*data-lab-value="audio-signal::signal-health"[^>]*>/
  )?.[0];
  assert.ok(signalToggle);
  assert.doesNotMatch(signalToggle, /\schecked(\s|>)/);
  assert.match(
    openDrawer,
    /data-lab-field="analysisSettings\.modules\.signal-health\.sampleWindowSeconds"/
  );
  assert.match(openDrawer, /data-lab-action="analysis-settings-reset"/);
});

void test("laboratory analysis preparation parent and child toggles stay synchronized", () => {
  const store = createSeededState(true);

  store.dispatch({ type: "analysis-prep-group-toggled", capabilityId: "audio-signal" });
  let audioGroup = getAnalysisPreparationGroups(store.getState()).find(function (group) {
    return group.capabilityId === "audio-signal";
  });
  assert.equal(audioGroup?.selectionState, "full");
  assert.ok(audioGroup?.modules.every((module) => module.enabled));
  assert.deepEqual(store.getState().ui.workspace.analysisPrepExpandedCapabilityIds, []);

  store.dispatch({ type: "analysis-prep-group-toggled", capabilityId: "audio-signal" });
  audioGroup = getAnalysisPreparationGroups(store.getState()).find(function (group) {
    return group.capabilityId === "audio-signal";
  });
  assert.equal(audioGroup?.selectionState, "none");
  assert.ok(audioGroup?.modules.every((module) => !module.enabled));
  assert.deepEqual(store.getState().ui.workspace.analysisPrepExpandedCapabilityIds, []);

  store.dispatch({
    type: "analysis-prep-module-toggled",
    capabilityId: "audio-signal",
    moduleId: "signal-health",
  });
  audioGroup = getAnalysisPreparationGroups(store.getState()).find(function (group) {
    return group.capabilityId === "audio-signal";
  });
  assert.equal(audioGroup?.selectionState, "partial");
  assert.equal(
    audioGroup?.modules.find((module) => module.moduleId === "signal-health")?.enabled,
    true
  );
  assert.ok(store.getState().selectedCapabilities.includes("audio-signal"));

  const drawer = renderLabDrawer(store.getState(), renderWorkspaceSurface(store.getState()));
  assert.match(drawer, /data-selection-state="partial"[\s\S]*data-lab-value="audio-signal"/);
  const partialGroupToggle = drawer.match(
    /<input[^>]*data-lab-action="analysis-prep-group-toggle"[^>]*data-lab-value="audio-signal"[^>]*>/
  )?.[0];
  assert.ok(partialGroupToggle);
  assert.match(partialGroupToggle, /aria-checked="mixed"/);
  assert.match(partialGroupToggle, /data-lab-indeterminate="true"/);
  assert.match(partialGroupToggle, /data-selection-state="partial"/);
  assert.doesNotMatch(partialGroupToggle, /\schecked(\s|>|\/)/);
  assert.doesNotMatch(partialGroupToggle, /\sdisabled(\s|>|\/)/);

  store.dispatch({ type: "analysis-prep-group-toggled", capabilityId: "audio-signal" });
  audioGroup = getAnalysisPreparationGroups(store.getState()).find(function (group) {
    return group.capabilityId === "audio-signal";
  });
  assert.equal(audioGroup?.selectionState, "full");
  assert.ok(audioGroup?.modules.every((module) => module.enabled));
  const fullDrawer = renderLabDrawer(store.getState(), renderWorkspaceSurface(store.getState()));
  const fullGroupToggle = fullDrawer.match(
    /<input[^>]*data-lab-action="analysis-prep-group-toggle"[^>]*data-lab-value="audio-signal"[^>]*>/
  )?.[0];
  assert.ok(fullGroupToggle);
  assert.match(fullGroupToggle, /aria-checked="true"/);
  assert.match(fullGroupToggle, /data-lab-indeterminate="false"/);
  assert.match(fullGroupToggle, /data-selection-state="full"/);
  assert.match(fullGroupToggle, /\schecked(\s|>|\/)/);
});

void test("laboratory selection guidance splits expanded operation and analysis suggestions", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 2400,
    endMs: 5600,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });

  const surface = renderWorkspaceSurface(store.getState());

  assert.match(surface.side, /Önerilen Analizler/);
  assert.doesNotMatch(surface.side, /Önerilen İşlemler/);
  assert.doesNotMatch(surface.side, /Sesi temizle/);
  assert.doesNotMatch(surface.side, /Kaynaklari ayir/);
  assert.match(surface.side, /Metadata kontrolu/);
  assert.match(surface.side, /Sahne gecislerini tara/);
});

void test("laboratory operation suggestions stay out of the selection tab and source analysis rail", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 2400,
    endMs: 5600,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "clean-audio",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "clean-audio",
  });

  const surface = renderWorkspaceSurface(store.getState());
  const drawer = renderLabDrawer(store.getState(), surface);

  assert.equal(getActiveSuggestionPreview(store.getState()), null);
  assert.equal(getActiveExecutionIntent(store.getState()), null);
  assert.doesNotMatch(surface.side, /data-lab-selection-suggestion="clean-audio"/);
  assert.doesNotMatch(surface.side, /Sesi temizle/);
  assert.doesNotMatch(drawer, /data-active="true"[\s\S]*Audio signal/);
});

void test("laboratory analysis suggestion acceptance opens and highlights the preparation rail", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 2400,
    endMs: 5600,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });
  store.dispatch({ type: "drawer-collapsed-toggled" });
  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "audio-inspect",
  });

  const surface = renderWorkspaceSurface(store.getState());
  const drawer = renderLabDrawer(store.getState(), surface);

  assert.notEqual(drawer, "");
  assert.match(drawer, /data-drawer-mode="setup"/);
  assert.match(drawer, /data-active="true"[\s\S]*Audio signal/);
  assert.doesNotMatch(drawer, /data-active="true"[\s\S]*Audio recovery/);
});

void test("laboratory queued analysis suggestions stay in the help tab after checking ready analyses", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 2400,
    endMs: 5600,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-queued",
    suggestionId: "audio-inspect",
  });

  const surface = renderWorkspaceSurface(store.getState());
  const drawer = renderLabDrawer(store.getState(), surface);

  assert.deepEqual(store.getState().selectedCapabilities, ["audio-signal"]);
  assert.equal(store.getState().ui.workspace.selectionTabActive, true);
  assert.equal(store.getState().ui.activeSuggestionPreviewId, null);
  assert.match(drawer, /data-pill-state="active"[\s\S]*Yardım/);
  assert.match(drawer, /lab-selection-panel--drawer/);
});

void test("laboratory root keeps passive selection suggestions outside the run controller", () => {
  const rootSource = readFileSync("rooms/laboratory/ui/lab-root.ts", "utf8");
  const binderSource = readFileSync(
    "rooms/laboratory/ui/lab-selection-suggestion-binder.ts",
    "utf8"
  );
  const runControllerSource = readFileSync(
    "rooms/laboratory/runtime/lab-run-controller.ts",
    "utf8"
  );

  assert.match(rootSource, /bindLabSelectionSuggestionClicks/);
  assert.match(rootSource, /beforeunload/);
  assert.match(binderSource, /workspace-selection-suggestion-accepted/);
  assert.match(binderSource, /workspace-selection-suggestion-dismissed/);
  assert.doesNotMatch(rootSource, /createLabExecutionDispatcher/);
  assert.doesNotMatch(rootSource, /getExecutionDispatchCandidate/);
  assert.doesNotMatch(runControllerSource, /createLabExecutionDispatcher/);
  assert.doesNotMatch(runControllerSource, /workspace-execution-dispatch/);
});

void test("laboratory analysis readiness allows capability-only selection when modules are ready", () => {
  const store = createSeededState(true);
  store.dispatch({ type: "capability-set", capabilities: ["visual-forensics"] });

  assert.equal(getAnalysisActionBlockReason(store.getState()), null);
});

void test("laboratory tool overlay lists room-local tool lifecycle actions inside the live shell", () => {
  const store = createSeededState();
  store.dispatch({ type: "tool-manager-toggled", open: true });
  const state = store.getState();
  state.snapshot = {
    ...(state.snapshot || {}),
    jobs: [
      {
        jobId: "job-yt-dlp-install",
        action: "tool-install",
        toolId: "yt-dlp",
        stage: "running",
        percent: 64,
        phaseIndex: 2,
        phaseCount: 5,
        phaseLabel: "Arşiv indiriliyor",
        message: "Paket indiriliyor",
        detailLines: ["Downloading yt-dlp archive", "64% of 12 MB"],
      },
    ],
  };
  state.toolState = {
    ...state.toolState,
    tools: {
      ...((state.toolState["tools"]) || {}),
      "yt-dlp": {
        ...(((state.toolState["tools"] as Record<string, unknown>) || {})["yt-dlp"] as Record<
          string,
          unknown
        >),
        latestVersion: "2026.05.10",
        updateAvailable: true,
      },
    },
  };
  const html = renderToolManagementOverlay(store.getState());

  assert.match(html, /Araç Yönetimi/);
  assert.match(html, /Güncellemeleri kontrol et/);
  assert.match(html, /Kurulu araç/);
  assert.match(html, /Güncelleme bekleyen/);
  assert.match(html, /İşlem takibi/);
  assert.match(html, /Kurulum ve güncelleme/);
  assert.match(html, /yt-dlp[\s\S]*Kurulum/);
  assert.match(html, /Arşiv indiriliyor/);
  assert.match(html, /64%/);
  assert.match(html, /Aşama 2\/5: Arşiv indiriliyor/);
  assert.match(html, /Downloading yt-dlp archive/);
  assert.match(html, /data-lab-action="tool-job-cancel" data-lab-value="job-yt-dlp-install"/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /yt-dlp/);
  assert.match(html, /FFmpeg/);
  assert.match(html, /data-lab-action="tool-check-all-updates"/);
  assert.match(html, /data-lab-update-choice value="yt-dlp" checked/);
  assert.match(html, /data-lab-action="tool-update-selected"/);
  assert.doesNotMatch(html, /data-lab-action="tool-update" data-lab-value="yt-dlp"/);
  assert.doesNotMatch(html, /<details class="labx-module-card__meta-details"/);
  assert.doesNotMatch(html, /class="labx-tool-monogram"/);
  assert.doesNotMatch(html, /Uygulama içi kurulum/);
  assert.match(html, /data-lab-action="tool-install-review"/);
  assert.match(html, /data-lab-action="tool-install-review" data-lab-value="librosa"/);
  assert.doesNotMatch(html, /Manuel kurulum|Manual setup/);
  assert.doesNotMatch(html, /Dense operator workbench|Modules|Focus/);

  const trCopy = createTurkishCopy();
  const translatedHtml = renderToolManagementOverlay(store.getState(), trCopy);
  assert.match(translatedHtml, /İşlem takibi/);
  assert.doesNotMatch(translatedHtml, /Laboratory araçları/);
  assert.match(translatedHtml, /Güncelleme listesi/);
  assert.match(translatedHtml, /Güncelleme bulundu \(/);
  assert.doesNotMatch(translatedHtml, /YouTube capture stays enabled from the source intake frame/);

  const idleStore = createSeededState();
  idleStore.dispatch({ type: "tool-manager-toggled", open: true });
  const idleHtml = renderToolManagementOverlay(idleStore.getState(), trCopy);
  assert.doesNotMatch(idleHtml, /Aktif kurulum veya güncelleme yok/);
  assert.doesNotMatch(idleHtml, /Bir araç işlemi başladığında ilerleme burada görünür/);
});

void test("laboratory tool manager asks for install confirmation with package and size details", () => {
  const store = createSeededState(true);
  store.dispatch({ type: "tool-manager-toggled", open: true });
  store.dispatch({ type: "tool-install-review-requested", toolId: "librosa" });

  const html = renderToolManagementOverlay(store.getState(), createTurkishCopy());

  assert.match(html, /Kurulum öncesi/);
  assert.match(html, /librosa kurulacak/);
  assert.match(html, /İndirilecek veri[\s\S]*80 - 250 MB/);
  assert.match(html, /Disk kullanımı[\s\S]*250 - 700 MB/);
  assert.match(html, /librosa/);
  assert.match(html, /numpy/);
  assert.match(html, /scipy/);
  assert.match(html, /Room-local Python runtime oluşturulur veya bozuksa onarılır/);
  assert.match(html, /data-lab-action="tool-install-confirm" data-lab-value="librosa"/);
  assert.match(html, /data-lab-action="tool-install-dismiss"/);
});


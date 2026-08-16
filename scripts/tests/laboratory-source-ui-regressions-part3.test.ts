import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createLabStore } from "../../rooms/laboratory/runtime/lab-store.ts";
import { renderLabDrawer } from "../../rooms/laboratory/ui/lab-drawer.ts";
import { renderLabProcessStrip } from "../../rooms/laboratory/ui/lab-process-strip.ts";
import { renderLabSourcePanel } from "../../rooms/laboratory/ui/lab-source-panel.ts";
import { createLabI18n } from "../../rooms/laboratory/ui/lab-i18n.ts";
import { renderReportOverlay } from "../../rooms/laboratory/ui/report-overlay.ts";
import { renderWorkspaceSurface } from "../../rooms/laboratory/ui/workspace-surface.ts";

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

void test("laboratory workspace panels show snapshot drift as a non-blocking visibility layer", () => {
  const store = createSeededState(true);
  const eventTimestamp = Date.now();

  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-scope",
      kind: "analysis-scope-updated",
      severity: "info",
      message: "Analysis scope locked",
      detail: null,
      timestamp: eventTimestamp,
      source: "host",
      action: "process-run",
      stage: "running",
      scope: "run",
      moduleId: null,
      rawLine: null,
      analysisScope: {
        focus: "visual",
        timeRange: {
          startMs: 1200,
          endMs: 5400,
        },
        hypothesis: "frozen clue",
      },
    },
  });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-complete",
      kind: "activity",
      severity: "success",
      message: "Analiz tamamlandi",
      detail: null,
      timestamp: eventTimestamp + 1,
      source: "host",
      action: "process-run",
      stage: "completed",
      scope: "run",
      moduleId: null,
      rawLine: null,
    },
  });
  store.dispatch({ type: "workspace-timeline-updated", startMs: 2400, endMs: 5600 });
  store.dispatch({ type: "workspace-hypothesis-updated", text: "live workspace clue" });
  store.dispatch({ type: "capability-set", capabilities: ["visual-forensics"] });

  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-motion",
      kind: "activity",
      severity: "info",
      message: "Motion analysis running",
      detail: "Motion analysis running",
      timestamp: eventTimestamp + 2,
      source: "host",
      action: "process-run",
      stage: "running",
      scope: "run",
      moduleId: "motion-anomaly",
      rawLine: null,
    },
  });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-visual",
      kind: "activity",
      severity: "error",
      message: "Visual signal failed",
      detail: "Visual signal failed",
      timestamp: eventTimestamp + 3,
      source: "host",
      action: "process-run",
      stage: "failed",
      scope: "run",
      moduleId: "frame-consistency",
      rawLine: null,
    },
  });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-audio",
      kind: "activity",
      severity: "info",
      message: "Audio queued",
      detail: "Audio queued",
      timestamp: eventTimestamp + 4,
      source: "host",
      action: "process-run",
      stage: "queued",
      scope: "run",
      moduleId: "audio",
      rawLine: null,
    },
  });

  const state = store.getState();
  const surface = renderWorkspaceSurface(state);
  const drawer = renderLabDrawer(state, surface);
  const strip = renderLabProcessStrip(state);

  assert.match(drawer, /Analysis Progress/);
  assert.match(drawer, /class="labx-drawer labx-context-panel" data-lab-region="context-panel"/);
  assert.match(drawer, /data-lab-running-stages="true"/);
  assert.match(drawer, /data-lab-running-plan="true"/);
  assert.match(drawer, /Analysis stages/);
  assert.match(drawer, /0\/3 modules/);
  assert.match(drawer, /Visual Forensics/);
  assert.match(drawer, /data-status="active"/);
  assert.doesNotMatch(drawer, /Motion Anomaly/);
  assert.doesNotMatch(drawer, /Frame Consistency/);
  assert.doesNotMatch(drawer, /labx-analysis-module--locked/);
  assert.doesNotMatch(drawer, /Pipeline/);
  assert.doesNotMatch(drawer, /Audio investigation/);
  assert.match(strip, /class="labx-process-strip"/);
  assert.match(strip, /data-lab-region="process-strip"/);
});

void test("laboratory running drawer keeps module summary visible without selected analysis state", () => {
  const store = createSeededState(true);
  const eventTimestamp = Date.now();

  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-run",
      kind: "activity",
      severity: "info",
      message: "Analiz basladi",
      detail: null,
      timestamp: eventTimestamp,
      source: "host",
      action: "process-run",
      stage: "running",
      scope: "run",
      moduleId: null,
      rawLine: null,
    },
  });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-module",
      kind: "activity",
      severity: "info",
      message: "Runtime module running",
      detail: "Runtime module running",
      timestamp: eventTimestamp + 1,
      source: "host",
      action: "process-run",
      stage: "running",
      scope: "run",
      moduleId: "visual-signal",
      rawLine: null,
    },
  });
  store.dispatch({ type: "capability-set", capabilities: [] });

  const drawer = renderLabDrawer(store.getState(), renderWorkspaceSurface(store.getState()));

  assert.match(drawer, /data-lab-running-stages="true"/);
  assert.match(drawer, /data-lab-running-plan="true"/);
  assert.match(drawer, /Active modules/);
  assert.doesNotMatch(drawer, /Visual Signal/);
  assert.doesNotMatch(drawer, /labx-analysis-module--locked/);
  assert.doesNotMatch(drawer, /Analiz plani hazirlaniyor/);
});

void test("laboratory transparency renderers tolerate sparse run payloads", () => {
  const store = createSeededState(true);
  const state = store.getState() as ReturnType<typeof store.getState> & {
    run: Record<string, unknown>;
    reports: Record<string, unknown>;
  };

  const sparseRunPayload = {
    id: undefined,
    state: "completed",
    startedAt: Date.now() - 1000,
    modules: {},
    moduleOrder: [],
    events: undefined,
    rawLog: undefined,
    artifacts: [],
    findings: [],
    liveFindings: undefined,
    warnings: [],
    error: null,
    targetLabel: null,
    progress: 100,
    emptyReason: null,
    analysisScope: {
      focus: "visual",
    },
    previewArtifacts: undefined,
    confidence: null,
    moduleTrace: undefined,
    comparisonVariants: undefined,
    hypothesisSummary: null,
  };
  state.run = sparseRunPayload as unknown as typeof state.run;
  state.reports = {
    user: null,
    ai: {
      manifest: {},
      findings: [],
      artifacts: [],
      warnings: [],
      errors: [],
      degradedConditions: [],
      moduleTrace: undefined,
      analysisScope: sparseRunPayload.analysisScope,
      comparisonVariants: [],
    },
    emptyReason: null,
  } as unknown as typeof state.reports;
  state.ui.workspace.reportOverlayOpen = true;

  assert.doesNotThrow(function () {
    renderReportOverlay(state);
  });
});

void test("laboratory process strip renders recent action history from user actions", () => {
  const store = createSeededState(true);

  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-frame-result",
      type: "frame",
      name: "frame_01.png",
      localPath: "/tmp/frame_01.png",
      createdAt: 200,
      sourceId: "source-1",
      runId: "run-1",
    },
  });

  store.dispatch({
    type: "user-action-added",
    actionEvent: {
      id: "user-action-running",
      type: "export-clip",
      label: "Klip çıkarılıyor",
      status: "running",
      startedAt: Date.now() - 3000,
      projectId: "project-1",
      requestId: "req-running",
      sourceAction: "export-timeline-clip",
    },
  });
  store.dispatch({
    type: "user-action-added",
    actionEvent: {
      id: "user-action-success",
      type: "grab-frame",
      label: "Frame alınıyor",
      status: "success",
      startedAt: Date.now() - 5000,
      finishedAt: Date.now() - 1000,
      message: "Frame alındı",
      projectId: "project-1",
      requestId: "req-success",
      resultAssetIds: ["asset-frame-result"],
      sourceAction: "export-frame-grab",
    },
  });

  const state = store.getState();
  const surface = renderWorkspaceSurface(state);

  assert.doesNotMatch(surface.main, /labx-topbar-actions/);
  assert.match(surface.inspector ?? "", /data-operation-id="clip-export"[\s\S]*Klip çıkarılıyor/);

  const collapsedStripHtml = renderLabProcessStrip(store.getState());
  assert.match(collapsedStripHtml, /data-process-view="compact"/);
  assert.match(collapsedStripHtml, /class="labx-strip-detail-toggle"/);
  assert.match(collapsedStripHtml, /aria-expanded="false"/);
  assert.doesNotMatch(collapsedStripHtml, /data-lab-process-expanded="true"/);
  assert.doesNotMatch(collapsedStripHtml, /class="labx-strip-expand"/);
  assert.doesNotMatch(collapsedStripHtml, /class="labx-strip-cancel"/);

  store.dispatch({ type: "workspace-process-view-toggled", force: true });
  const stripHtml = renderLabProcessStrip(store.getState());
  assert.match(stripHtml, /data-process-view="expanded"/);
  assert.match(stripHtml, /data-lab-process-expanded="true"/);
  assert.match(stripHtml, /aria-expanded="true"/);
  assert.match(stripHtml, /Analiz özeti/);
  assert.match(stripHtml, /Ham log/);
  assert.match(stripHtml, /Ham log yok/);
  assert.match(stripHtml, /Frame alındı/);
  assert.match(stripHtml, /frame_01\.png/);
});

void test("laboratory process strip renders multi-output action summaries with overflow counts", () => {
  const store = createSeededState(true);

  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-report-user",
      type: "report",
      name: "report-user.md",
      localPath: "/tmp/report-user.md",
      createdAt: 200,
      sourceId: "source-1",
      runId: "run-1",
    },
  });
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-report-ai",
      type: "report",
      name: "report-ai.json",
      localPath: "/tmp/report-ai.json",
      createdAt: 300,
      sourceId: "source-1",
      runId: "run-1",
    },
  });
  store.dispatch({
    type: "user-action-added",
    actionEvent: {
      id: "user-action-report-success",
      type: "custom",
      label: "Rapor dışa aktarılıyor",
      status: "success",
      startedAt: Date.now() - 5000,
      finishedAt: Date.now() - 1000,
      message: "Rapor dışa aktarıldı",
      projectId: "project-1",
      requestId: "req-report-success",
      resultAssetIds: ["asset-report-user", "asset-report-ai"],
      sourceAction: "report-export",
    },
  });

  const state = store.getState();
  const surface = renderWorkspaceSurface(state);

  assert.doesNotMatch(surface.main, /report-user\.md \+1/);
  store.dispatch({ type: "workspace-process-view-toggled", force: true });
  const stripHtml = renderLabProcessStrip(store.getState());
  assert.match(stripHtml, /report-user\.md, report-ai\.json/);
});

void test("laboratory source panel renders registry groups and workspace open actions", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "clip-local-1",
      type: "clip",
      name: "clip_01.mp4",
      localPath: "/tmp/clip_01.mp4",
      createdAt: 200,
      sourceId: "source-1",
      runId: "run-1",
      metadata: {
        durationMs: 1400,
      },
    },
  });
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "clip-remote-1",
      type: "clip",
      name: "remote_clip.mp4",
      url: "https://example.test/remote_clip.mp4",
      createdAt: 300,
    },
  });
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "report-1",
      type: "report",
      name: "run_report.md",
      localPath: "/tmp/run_report.md",
      createdAt: 400,
      runId: "run-1",
      metadata: {
        reportView: "user",
      },
    },
  });
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "artifact-png-1",
      type: "artifact",
      name: "reveal-frame.png",
      localPath: "/tmp/reveal-frame.png",
      createdAt: 500,
      runId: "run-1",
    },
  });

  const panelHtml = renderLabSourcePanel(store.getState());

  assert.match(panelHtml, /Klipler/);
  assert.match(panelHtml, /Raporlar/);
  assert.match(panelHtml, /clip_01\.mp4/);
  assert.match(panelHtml, /run_report\.md/);
  assert.match(panelHtml, /data-lab-action="open-report-overlay" data-lab-value="user"/);
  assert.match(panelHtml, /data-lab-action="asset-download"/);
  assert.match(panelHtml, /data-lab-action="asset-remove"/);
  assert.match(
    panelHtml,
    /class="labx-sp-asset__btn"[^>]*data-lab-action="workspace-asset-select" data-lab-value="clip-local-1"/
  );
  assert.match(
    panelHtml,
    /class="labx-sp-asset__btn"[^>]*data-lab-action="workspace-asset-select" data-lab-value="artifact-png-1"/
  );
  assert.match(panelHtml, /data-lab-action="workspace-asset-select" data-lab-value="clip-local-1"/);
  assert.match(
    panelHtml,
    /data-lab-action="workspace-asset-select" data-lab-value="clip-remote-1"/
  );
  assert.doesNotMatch(panelHtml, /data-lab-action="workspace-content-open"/);
  assert.doesNotMatch(panelHtml, /data-lab-action="source-activate-asset"/);
  assert.doesNotMatch(panelHtml, /data-lab-action="asset-use-as-source"/);
});

void test("laboratory source panel opens png artifacts from the primary click", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "artifact-png-1",
      type: "artifact",
      name: "reveal-frame.png",
      localPath: "/tmp/reveal-frame.png",
      createdAt: 500,
      runId: "run-1",
    },
  });

  const panelHtml = renderLabSourcePanel(store.getState());

  assert.match(
    panelHtml,
    /class="labx-sp-asset__btn"[^>]*data-lab-action="workspace-asset-select" data-lab-value="artifact-png-1"/
  );
  assert.doesNotMatch(panelHtml, /data-lab-action="source-activate-asset"/);
});

void test("laboratory source panel keeps asset order stable when active source timestamps change", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "source-stable-first",
      type: "source",
      name: "stable-first.mp4",
      localPath: "/tmp/stable-first.mp4",
      createdAt: 100,
    },
  });
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "source-active-newer",
      type: "source",
      name: "active-newer.mp4",
      localPath: "/tmp/active-newer.mp4",
      createdAt: 999_000,
    },
  });

  const panelHtml = renderLabSourcePanel(store.getState());

  assert.ok(panelHtml.indexOf("stable-first.mp4") < panelHtml.indexOf("active-newer.mp4"));
});

void test("laboratory source panel opens the selected workspace asset group", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-selected-audio",
      type: "audio",
      name: "selected-audio.wav",
      localPath: "/tmp/selected-audio.wav",
      createdAt: 300,
    },
  });
  store.dispatch({
    type: "workspace-asset-selected",
    assetId: "asset-selected-audio",
  });

  const panelHtml = renderLabSourcePanel(store.getState());

  assert.match(panelHtml, /<details class="labx-sp-group" open data-group-type="audio">/);
  assert.doesNotMatch(panelHtml, /<details class="labx-sp-group" open data-group-type="source">/);
});

void test("laboratory source panel marks only the workbench media as active", () => {
  const store = createSeededState(true);
  const state = store.getState();
  state.source = {
    ...state.source,
    metadata: {
      ...((state.source?.["metadata"]) ?? {}),
      originAssetId: "asset-active-source",
    },
  };
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-active-source",
      type: "source",
      name: "active-source.png",
      localPath: "/tmp/active-source.png",
      createdAt: 100,
      metadata: {
        kind: "image",
      },
    },
  });
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

  const panelHtml = renderLabSourcePanel(store.getState());

  assert.doesNotMatch(panelHtml, /data-asset-id="asset-active-source"[^>]*data-active="true"/);
  assert.match(panelHtml, /data-asset-id="asset-enhanced-frame"[^>]*data-active="true"/);
  assert.doesNotMatch(panelHtml, /data-workspace-selected=/);
  assert.doesNotMatch(panelHtml, /Aktif kaynak/);
});

void test("laboratory source panel marks only comparison pair assets as active", () => {
  const store = createSeededState(true);
  const state = store.getState();
  state.source = {
    ...state.source,
    metadata: {
      ...((state.source?.["metadata"]) ?? {}),
      originAssetId: "asset-active-source",
    },
  };
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-active-source",
      type: "source",
      name: "active-source.png",
      localPath: "/tmp/active-source.png",
      createdAt: 100,
      metadata: {
        kind: "image",
      },
    },
  });
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-reference-frame",
      type: "image",
      name: "reference-frame.png",
      localPath: "/tmp/reference-frame.png",
      createdAt: 300,
      metadata: {
        kind: "image",
      },
    },
  });
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-passive-frame",
      type: "image",
      name: "passive-frame.png",
      localPath: "/tmp/passive-frame.png",
      createdAt: 400,
      metadata: {
        kind: "image",
      },
    },
  });
  store.dispatch({
    type: "workspace-comparison-reference-set",
    assetId: "asset-reference-frame",
  });

  const panelHtml = renderLabSourcePanel(store.getState());

  assert.match(panelHtml, /data-asset-id="asset-active-source"[^>]*data-active="true"/);
  assert.match(panelHtml, /data-asset-id="asset-reference-frame"[^>]*data-active="true"/);
  assert.doesNotMatch(panelHtml, /data-asset-id="asset-passive-frame"[^>]*data-active="true"/);
  assert.doesNotMatch(panelHtml, /data-workspace-selected=/);
  assert.doesNotMatch(panelHtml, /Aktif kaynak/);
});

void test("laboratory comparison pair clicks only switch the active comparison side", () => {
  const store = createSeededState(true);
  const state = store.getState();
  state.source = {
    ...state.source,
    status: "ready",
    kind: "image",
    mode: "local",
    previewUrl: "file:///tmp/active-source.png",
    storedFileName: "active-source.png",
    storedPath: "/tmp/active-source.png",
    metadata: {
      originAssetId: "asset-active-source",
      width: 640,
      height: 480,
    },
  };
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-active-source",
      type: "source",
      name: "active-source.png",
      localPath: "/tmp/active-source.png",
      createdAt: 100,
      metadata: {
        kind: "image",
      },
    },
  });
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-reference-frame",
      type: "image",
      name: "reference-frame.png",
      localPath: "/tmp/reference-frame.png",
      createdAt: 300,
      metadata: {
        kind: "image",
      },
    },
  });
  store.dispatch({
    type: "workspace-comparison-reference-set",
    assetId: "asset-reference-frame",
  });

  store.dispatch({
    type: "workspace-asset-selected",
    assetId: "asset-active-source",
  });
  let current = store.getState();
  let surface = renderWorkspaceSurface(current);
  assert.equal(current.ui.activeWorkspaceAssetId, null);
  assert.equal(current.ui.workspace.comparisonReferenceAssetId, "asset-reference-frame");
  assert.equal(current.ui.workspace.comparisonRois.activeSide, "primary");
  assert.match(surface.main, /data-lab-workspace-comparison-stage="true"/);
  assert.match(surface.main, /data-side="primary" data-active="true"/);
  assert.match(surface.main, /data-side="reference" data-active="false"/);

  store.dispatch({
    type: "workspace-asset-selected",
    assetId: "asset-reference-frame",
  });
  current = store.getState();
  surface = renderWorkspaceSurface(current);
  assert.equal(current.ui.activeWorkspaceAssetId, null);
  assert.equal(current.ui.workspace.comparisonReferenceAssetId, "asset-reference-frame");
  assert.equal(current.ui.workspace.comparisonRois.activeSide, "reference");
  assert.match(surface.main, /data-lab-workspace-comparison-stage="true"/);
  assert.match(surface.main, /data-side="primary" data-active="false"/);
  assert.match(surface.main, /data-side="reference" data-active="true"/);
});

void test("laboratory selecting media outside the comparison pair returns to single view", () => {
  const store = createSeededState(true);
  const state = store.getState();
  state.source = {
    ...state.source,
    status: "ready",
    kind: "image",
    mode: "local",
    previewUrl: "file:///tmp/active-source.png",
    storedFileName: "active-source.png",
    storedPath: "/tmp/active-source.png",
    metadata: {
      originAssetId: "asset-active-source",
      width: 640,
      height: 480,
    },
  };
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-active-source",
      type: "source",
      name: "active-source.png",
      localPath: "/tmp/active-source.png",
      createdAt: 100,
      metadata: {
        kind: "image",
      },
    },
  });
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-reference-frame",
      type: "image",
      name: "reference-frame.png",
      localPath: "/tmp/reference-frame.png",
      createdAt: 300,
      metadata: {
        kind: "image",
      },
    },
  });
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-third-frame",
      type: "image",
      name: "third-frame.png",
      localPath: "/tmp/third-frame.png",
      createdAt: 400,
      metadata: {
        kind: "image",
      },
    },
  });
  store.dispatch({
    type: "workspace-comparison-reference-set",
    assetId: "asset-reference-frame",
  });
  store.dispatch({
    type: "workspace-asset-selected",
    assetId: "asset-third-frame",
  });

  const current = store.getState();
  const surface = renderWorkspaceSurface(current);
  const panelHtml = renderLabSourcePanel(current);

  assert.equal(current.ui.activeWorkspaceAssetId, "asset-third-frame");
  assert.equal(current.ui.workspace.comparisonReferenceAssetId, null);
  assert.equal(current.ui.workspace.comparisonRois.activeSide, "primary");
  assert.match(surface.main, /data-lab-preview-inspection-stage="true"/);
  assert.match(surface.main, /data-lab-workspace-asset-id="asset-third-frame"/);
  assert.doesNotMatch(surface.main, /data-lab-workspace-comparison-stage="true"/);
  assert.match(panelHtml, /data-asset-id="asset-third-frame"[^>]*data-active="true"/);
  assert.doesNotMatch(panelHtml, /data-asset-id="asset-active-source"[^>]*data-active="true"/);
  assert.doesNotMatch(panelHtml, /data-asset-id="asset-reference-frame"[^>]*data-active="true"/);
});

void test("laboratory source panel opens png artifacts from the primary click path", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "artifact-png-primary",
      type: "artifact",
      name: "artifact-primary.png",
      localPath: "/tmp/artifact-primary.png",
      createdAt: 500,
      runId: "run-1",
    },
  });

  const panelHtml = renderLabSourcePanel(store.getState());

  assert.match(
    panelHtml,
    /class="labx-sp-asset__btn"[\s\S]*data-lab-action="workspace-asset-select"[\s\S]*data-lab-value="artifact-png-primary"/
  );
});

void test("laboratory document artifacts open inside the shared overlay shell", () => {
  const store = createLabStore();
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "artifact-json-1",
      type: "artifact",
      name: "source-metadata.json",
      localPath: "/tmp/source-metadata.json",
      createdAt: 500,
      metadata: {
        format: "json",
      },
    },
  });
  store.dispatch({
    type: "document-overlay-opened",
    assetId: "artifact-json-1",
  });

  const html = renderReportOverlay(store.getState());

  assert.match(html, /id="lab-report-overlay-root"/);
  assert.match(html, /data-lab-document-overlay="true"/);
  assert.match(html, /data-lab-document-asset-id="artifact-json-1"/);
  assert.match(html, /source-metadata\.json/);
  assert.match(html, /class="labx-report-document-frame"/);
  assert.match(html, /src="file:\/\/\/tmp\/source-metadata\.json"/);
  assert.match(html, /data-lab-action="asset-download" data-lab-value="artifact-json-1"/);
  assert.doesNotMatch(html, /class="labx-report-tabs"/);
});

void test("laboratory report overlay renders snapshot summary and workspace-dirty freshness metadata", () => {
  const store = createLabStore();
  const baseWorkspace = store.getState().ui.workspace;

  store.dispatch({
    type: "hydrate",
    payload: {
      featureId: "media-analysis",
      projectIndex: {
        activeProjectId: "project-1",
        projects: [],
      },
      workbench: {},
      sourceProbeStatus: "completed",
      reports: {
        user: {
          summary: "Report summary",
          confidence: "medium",
          topFindings: [],
          suspiciousFrames: [],
          hypothesisResult: "frozen clue",
          elapsedSeconds: 5,
          moduleSummary: [],
        },
        ai: null,
        emptyReason: null,
      },
      reportView: "user",
      workspace: {
        ...baseWorkspace,
        reportOverlayOpen: true,
        timelineStartMs: 2400,
        timelineEndMs: 5600,
        hypothesis: "live workspace clue",
      },
      lastRun: {
        id: "run-1",
        state: "completed",
        startedAt: Date.now() - 5000,
        endedAt: Date.now() - 1000,
        modules: {},
        moduleOrder: [],
        events: [],
        rawLog: [],
        artifacts: [],
        findings: [],
        liveFindings: [],
        warnings: [],
        error: null,
        targetLabel: null,
        progress: 100,
        emptyReason: null,
        analysisScope: {
          focus: "visual",
          timeRange: {
            startMs: 1200,
            endMs: 5400,
          },
          hypothesis: "frozen clue",
        },
        previewArtifacts: [],
        confidence: "medium",
        moduleTrace: [],
        comparisonVariants: [],
        hypothesisSummary: "frozen clue",
      },
    },
  });

  const html = renderReportOverlay(store.getState());

  assert.match(html, /Snapshot Summary/);
  assert.match(html, /data-workspace-dirty="true"/);
  assert.match(html, /Workspace farklı/);
  assert.match(html, /Report still reflects the frozen snapshot/);

  const translatedHtml = renderReportOverlay(store.getState(), createTurkishCopy());
  assert.match(translatedHtml, /Snapshot Summary|Snapshot Ozeti/);
});

void test("laboratory report overlay keeps scoped report-level findings without grouping buckets", () => {
  const store = createLabStore();
  const baseWorkspace = store.getState().ui.workspace;

  store.dispatch({
    type: "hydrate",
    payload: {
      featureId: "media-analysis",
      projectIndex: {
        activeProjectId: "project-1",
        projects: [],
      },
      workbench: {},
      sourceProbeStatus: "completed",
      reports: {
        user: {
          summary: "Scoped report summary",
          confidence: "low",
          topFindings: [
            {
              id: "finding-report-1",
              title: "Belirgin anomali tespit edilmedi",
              detail: "Scoped run completed without a mapped module finding.",
              confidence: "low",
              evidence: ["report-summary.json"],
            },
          ],
          suspiciousFrames: [],
          hypothesisResult: null,
          elapsedSeconds: 3,
          moduleSummary: [],
        },
        ai: null,
        emptyReason: null,
      },
      reportView: "user",
      workspace: {
        ...baseWorkspace,
        reportOverlayOpen: true,
      },
      lastRun: {
        id: "run-scoped-report",
        state: "completed",
        startedAt: Date.now() - 4000,
        endedAt: Date.now() - 1000,
        modules: {},
        moduleOrder: [],
        events: [],
        rawLog: [],
        artifacts: [
          {
            id: "artifact-report-1",
            moduleId: null,
            kind: "report-summary",
            path: "/tmp/report-summary.json",
            fileName: "report-summary.json",
            previewUrl: null,
            createdAt: new Date().toISOString(),
          },
        ],
        findings: [
          {
            id: "finding-report-1",
            moduleId: "report",
            title: "Belirgin anomali tespit edilmedi",
            detail: "Scoped run completed without a mapped module finding.",
            level: "low",
            confidence: "low",
            kind: "derived",
            evidenceCount: 0,
            artifactIds: ["artifact-report-1"],
          },
        ],
        liveFindings: [],
        warnings: [],
        error: null,
        targetLabel: null,
        progress: 100,
        emptyReason: null,
        analysisScope: {
          focus: "visual",
        },
        previewArtifacts: [],
        confidence: "low",
        moduleTrace: [],
        comparisonVariants: [],
        hypothesisSummary: null,
      },
    },
  });

  const html = renderReportOverlay(store.getState());

  assert.match(html, /Belirgin anomali tespit edilmedi/);
  assert.match(html, /report-summary\.json/);
});

void test("laboratory report overlay lists transport-module evidence without selected analysis buckets", () => {
  const store = createLabStore();
  const baseWorkspace = store.getState().ui.workspace;

  store.dispatch({
    type: "hydrate",
    payload: {
      featureId: "media-analysis",
      projectIndex: {
        activeProjectId: "project-1",
        projects: [],
      },
      workbench: {},
      sourceProbeStatus: "completed",
      reports: {
        user: {
          summary: "Transport module report",
          confidence: "medium",
          topFindings: [
            {
              id: "finding-motion",
              title: "Motion spike",
              detail: "Movement anomaly detected",
              confidence: "medium",
              evidence: ["motion.png"],
            },
            {
              id: "finding-visual",
              title: "Reveal variant",
              detail: "Forensic reveal variant surfaced a suspicious edge",
              confidence: "medium",
              evidence: ["reveal.png"],
            },
            {
              id: "finding-audio",
              title: "Audio anomaly",
              detail: "Silence pockets detected during the sweep",
              confidence: "low",
              evidence: ["audio.png"],
            },
          ],
          suspiciousFrames: [],
          hypothesisResult: null,
          elapsedSeconds: 4,
          moduleSummary: [],
        },
        ai: null,
        emptyReason: null,
      },
      reportView: "user",
      workspace: {
        ...baseWorkspace,
        reportOverlayOpen: true,
      },
      lastRun: {
        id: "run-transport-groups",
        state: "completed",
        startedAt: Date.now() - 4000,
        endedAt: Date.now() - 1000,
        modules: {
          motion: {
            id: "motion",
            title: "motion",
            status: "completed",
          },
          "visual-signal": {
            id: "visual-signal",
            title: "visual-signal",
            status: "completed",
          },
          audio: {
            id: "audio",
            title: "audio",
            status: "completed",
          },
        },
        moduleOrder: ["motion", "visual-signal", "audio"],
        events: [],
        rawLog: [],
        artifacts: [
          {
            id: "artifact-motion",
            moduleId: "motion",
            kind: "frame-preview",
            path: "/tmp/motion.png",
            fileName: "motion.png",
            previewUrl: null,
            createdAt: new Date().toISOString(),
            metadata: {
              sourceModule: "motion-anomaly",
            },
          },
          {
            id: "artifact-visual",
            moduleId: "visual-signal",
            kind: "reveal-preview",
            path: "/tmp/reveal.png",
            fileName: "reveal.png",
            previewUrl: null,
            createdAt: new Date().toISOString(),
            metadata: {
              sourceModule: "visual-signal-amplification",
            },
          },
          {
            id: "artifact-audio",
            moduleId: "audio",
            kind: "spectrogram",
            path: "/tmp/audio.png",
            fileName: "audio.png",
            previewUrl: null,
            createdAt: new Date().toISOString(),
          },
        ],
        findings: [
          {
            id: "finding-motion",
            moduleId: "motion",
            sourceModule: "motion-anomaly",
            title: "Motion spike",
            detail: "Movement anomaly detected",
            level: "medium",
            confidence: "medium",
            kind: "derived",
            evidenceCount: 2,
            artifactIds: ["artifact-motion"],
          },
          {
            id: "finding-visual",
            moduleId: "visual-signal",
            sourceModule: "visual-signal-amplification",
            title: "Reveal variant",
            detail: "Forensic reveal variant surfaced a suspicious edge",
            level: "medium",
            confidence: "medium",
            kind: "derived",
            evidenceCount: 1,
            artifactIds: ["artifact-visual"],
          },
          {
            id: "finding-audio",
            moduleId: "audio",
            title: "Audio anomaly",
            detail: "Silence pockets detected during the sweep",
            level: "low",
            confidence: "low",
            kind: "derived",
            evidenceCount: 1,
            artifactIds: ["artifact-audio"],
          },
        ],
        liveFindings: [],
        warnings: [],
        error: null,
        targetLabel: null,
        progress: 100,
        emptyReason: null,
        analysisScope: {
          focus: "visual",
        },
        previewArtifacts: [],
        confidence: "medium",
        moduleTrace: [],
        comparisonVariants: [],
        hypothesisSummary: null,
      },
    },
  });

  const html = renderReportOverlay(store.getState());

  assert.match(html, /Motion spike/);
  assert.match(html, /Reveal variant/);
  assert.match(html, /Audio anomaly/);
});

void test("laboratory report overlay lists audio transport evidence once without analysis buckets", () => {
  const store = createLabStore();
  const baseWorkspace = store.getState().ui.workspace;

  store.dispatch({
    type: "hydrate",
    payload: {
      featureId: "media-analysis",
      projectIndex: {
        activeProjectId: "project-1",
        projects: [],
      },
      workbench: {},
      sourceProbeStatus: "completed",
      reports: {
        user: {
          summary: "Audio transport report",
          confidence: "medium",
          topFindings: [
            {
              id: "finding-audio",
              title: "Audio anomaly",
              detail: "Silence pockets detected during the sweep",
              confidence: "low",
              evidence: ["audio.png"],
            },
          ],
          suspiciousFrames: [],
          hypothesisResult: null,
          elapsedSeconds: 4,
          moduleSummary: [],
        },
        ai: null,
        emptyReason: null,
      },
      reportView: "user",
      workspace: {
        ...baseWorkspace,
        reportOverlayOpen: true,
      },
      lastRun: {
        id: "run-audio-transport-groups",
        state: "completed",
        startedAt: Date.now() - 4000,
        endedAt: Date.now() - 1000,
        modules: {
          audio: {
            id: "audio",
            title: "audio",
            status: "completed",
          },
        },
        moduleOrder: ["audio"],
        events: [],
        rawLog: [],
        artifacts: [
          {
            id: "artifact-audio",
            moduleId: "audio",
            kind: "spectrogram",
            path: "/tmp/audio.png",
            fileName: "audio.png",
            previewUrl: null,
            createdAt: new Date().toISOString(),
          },
        ],
        findings: [
          {
            id: "finding-audio",
            moduleId: "audio",
            title: "Audio anomaly",
            detail: "Silence pockets detected during the sweep",
            level: "low",
            confidence: "low",
            kind: "derived",
            evidenceCount: 1,
            artifactIds: ["artifact-audio"],
          },
        ],
        liveFindings: [],
        warnings: [],
        error: null,
        targetLabel: null,
        progress: 100,
        emptyReason: null,
        analysisScope: {
          focus: "audio",
        },
        previewArtifacts: [],
        confidence: "medium",
        moduleTrace: [],
        comparisonVariants: [],
        hypothesisSummary: null,
      },
    },
  });

  const html = renderReportOverlay(store.getState());

  assert.equal((html.match(/Audio anomaly/g) || []).length, 1);
});

void test("laboratory store applies optimistic source and workbench patches for source controls", () => {
  const store = createSeededState();
  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "audio",
      mode: "url",
    },
  });
  store.dispatch({
    type: "workbench-updated",
    workbench: {
      activeModuleId: "audio-analysis",
      availableModuleIds: ["media-analysis", "audio-analysis"],
      selectedModuleIds: ["media-analysis", "audio-analysis"],
    },
  });
  store.dispatch({ type: "tool-manager-toggled", open: true });

  const state = store.getState();
  assert.equal(state.source?.["kind"], "audio");
  assert.equal(state.source?.["mode"], "url");
  assert.equal(state.workbench["activeModuleId"], "audio-analysis");
  assert.equal(state.ui.toolManagerOpen, true);
});

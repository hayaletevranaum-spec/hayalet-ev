import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createLabStore } from "../../rooms/laboratory/runtime/lab-store.ts";
import { renderLabDrawer } from "../../rooms/laboratory/ui/lab-drawer.ts";
import { renderLabLeftRail, renderLabTopBar } from "../../rooms/laboratory/ui/lab-top-bar.ts";
import { createLabI18n } from "../../rooms/laboratory/ui/lab-i18n.ts";
import { renderPipeline } from "../../rooms/laboratory/ui/laboratory-layout.ts";
import { renderWorkspaceSurface } from "../../rooms/laboratory/ui/workspace-surface.ts";

const sourcePresets = JSON.parse(
  readFileSync("rooms/laboratory/tools/source-presets.json", "utf8")
);
const ytDlpForm = JSON.parse(readFileSync("rooms/laboratory/tools/yt-dlp.form.json", "utf8"));

function getPipelineBlockIds(markup: string): string[] {
  return Array.from(markup.matchAll(/data-block-id="([^"]+)"/g), function (match) {
    return match[1]!;
  });
}

function captureDebugLogs(run: () => void) {
  const descriptor = Object.getOwnPropertyDescriptor(console, "info");
  const logs: unknown[][] = [];
  Object.defineProperty(console, "info", {
    configurable: true,
    value(...args: unknown[]) {
      logs.push(args);
    },
  });
  try {
    run();
  } finally {
    if (descriptor) {
      Object.defineProperty(console, "info", descriptor);
    } else {
      Reflect.deleteProperty(console, "info");
    }
  }
  return logs;
}

function withDocumentStub<T>(documentStub: unknown, run: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentStub,
  });
  try {
    return run();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "document", descriptor);
    } else {
      Reflect.deleteProperty(globalThis, "document");
    }
  }
}

function withoutDocument<T>(run: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Reflect.deleteProperty(globalThis, "document");
  try {
    return run();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "document", descriptor);
    }
  }
}

function createTurkishCopy() {
  return createLabI18n({
    locale: "tr",
    translations: JSON.parse(readFileSync("rooms/laboratory/i18n/tr.json", "utf8")),
  });
}

function createEmptyReadyState() {
  const store = createLabStore();
  store.dispatch({
    type: "snapshot-received",
    payload: {
      featureId: "media-analysis",
      ready: true,
      activeProjectId: null,
      projects: [],
      activeProject: null,
      workbench: {
        activeModuleId: "media-analysis",
        availableModuleIds: ["media-analysis", "audio-analysis"],
        selectedModuleIds: ["media-analysis", "audio-analysis"],
      },
      sourcePresets,
      ytDlpForm,
      toolRegistry: [],
      toolState: {
        tools: {},
      },
      sourceProbeStatus: "idle",
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

function createDraftBootstrapState() {
  const store = createLabStore();
  store.dispatch({
    type: "snapshot-received",
    payload: {
      featureId: "media-analysis",
      ready: false,
      bootstrap: {
        status: "running",
        currentStepId: "refresh-tools",
      },
      activeProjectId: "draft-1",
      projects: [{ id: "draft-1", name: "Lab Session Draft", hasSource: false }],
      activeProject: {
        id: "draft-1",
        name: "Lab Session Draft",
        source: {
          status: "idle",
          kind: "video",
          mode: "local",
        },
        edit: {},
        profile: {},
        process: { records: {} },
        report: { records: {} },
        assets: [],
      },
      workbench: {
        activeModuleId: "media-analysis",
        availableModuleIds: ["media-analysis", "audio-analysis"],
        selectedModuleIds: ["media-analysis", "audio-analysis"],
      },
      sourcePresets,
      ytDlpForm,
      toolRegistry: [],
      toolState: {
        tools: {},
      },
      sourceProbeStatus: "idle",
      profileModels: [],
    },
  });
  return store;
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

void test("laboratory top bar reflects active v2 shell navigation", () => {
  const store = createSeededState();
  store.dispatch({ type: "tool-manager-toggled", open: true });
  const html = renderLabTopBar(store.getState());
  const leftRail = renderLabLeftRail(store.getState());

  assert.match(html, /class="labx-top-bar" data-lab-region="topbar"/);
  assert.equal(leftRail, "");
  assert.match(html, /data-lab-action="source-panel-toggle"/);
  assert.doesNotMatch(html, /data-lab-action="project-workspace-open"/);
  assert.doesNotMatch(html, /Project Management/);
  assert.match(html, /lab-demo\.mp4/);
  assert.match(html, /640×360/);
  assert.doesNotMatch(html, /2026-04-21 12-00 - lab-demo\.mp4/);
  assert.doesNotMatch(html, /data-lab-action="topbar-pill-source"/);
  assert.doesNotMatch(leftRail, /data-lab-action="topbar-pill-source"/);
  assert.doesNotMatch(leftRail, /data-lab-action="topbar-pill-analyze"/);
  assert.doesNotMatch(leftRail, /data-lab-action="topbar-pill-results"/);
  assert.match(html, /data-lab-action="toggle-tool-manager"/);
  assert.doesNotMatch(html, /Modül Yönetimi|Seçili Modüller|Yoğun operatör tezgahı/);
});

void test("laboratory right drawer defaults to the help tab before source preparation", () => {
  const store = createEmptyReadyState();
  const copy = createTurkishCopy();
  const state = store.getState();
  const surface = renderWorkspaceSurface(state, { copy });
  const drawer = renderLabDrawer(state, surface, copy);

  assert.match(drawer, /aria-label="Yardım"[\s\S]*data-pill-state="active"/);
  assert.match(drawer, /aria-label="Analiz"/);
  assert.match(drawer, /aria-label="İşlem"/);
  assert.match(drawer, /aria-label="Sonuc"/);
  assert.match(drawer, /labx-drawer__body--selection/);
  assert.doesNotMatch(drawer, /Zaman çizelgesinde bir alan seçin|labx-drawer__selection-empty/);
  assert.doesNotMatch(drawer, /data-block-id="analysis-prep"/);
});

void test("laboratory draft project renders empty workspace before full bootstrap readiness", () => {
  const store = createDraftBootstrapState();
  const copy = createTurkishCopy();
  const state = store.getState();
  const surface = renderWorkspaceSurface(state, { copy });
  const drawer = renderLabDrawer(state, surface, copy);

  assert.equal(state.bootReady, false);
  assert.doesNotMatch(surface.main, /data-lab-center-skeleton="true"/);
  assert.match(surface.main, /data-media-viewport-state="empty"/);
  assert.match(surface.main, /Proje kaynagi henuz hazir degil/);
  assert.doesNotMatch(drawer, /labx-drawer-skeleton/);
  assert.match(drawer, /aria-label="Yardım"[\s\S]*data-pill-state="active"/);
});

void test("laboratory inactive right-side regions stay mounted as hidden containers", () => {
  const bootStore = createLabStore();
  const bootSurface = renderWorkspaceSurface(bootStore.getState());

  assert.match(bootSurface.inspector ?? "", /data-lab-region="inspector-panel"/);
  assert.match(bootSurface.inspector ?? "", /data-empty="true"/);
  assert.match(bootSurface.inspector ?? "", /hidden aria-hidden="true"/);

  const store = createSeededState();
  store.dispatch({ type: "drawer-collapsed-toggled" });
  const surface = renderWorkspaceSurface(store.getState());
  const drawer = renderLabDrawer(store.getState(), surface);

  assert.match(drawer, /data-lab-region="context-panel"/);
  assert.match(drawer, /data-empty="true"/);
  assert.match(drawer, /hidden aria-hidden="true"/);
  assert.match(drawer, /class="labx-drawer__body"/);
  assert.doesNotMatch(drawer, /class="labx-pipeline-block"/);
});

void test("laboratory pipeline renderer escapes metadata and omits hidden or empty blocks", () => {
  const markup = renderPipeline(
    [
      {
        id: 'unsafe"&',
        render() {
          return "<span>Visible block</span>";
        },
        type: "section",
      },
      {
        id: "hidden",
        render() {
          return "<span>Hidden block</span>";
        },
        type: "action",
        visible() {
          return false;
        },
      },
      {
        id: "empty",
        render() {
          return "   ";
        },
        type: "status",
      },
    ],
    "setup"
  );

  assert.match(markup, /class="labx-pipeline-block"/);
  assert.match(markup, /data-block-id="unsafe&quot;&amp;"/);
  assert.match(markup, /data-block-type="section"/);
  assert.match(markup, /data-block-mode="setup"/);
  assert.match(markup, /Visible block/);
  assert.doesNotMatch(markup, /Hidden block|data-block-id="hidden"|data-block-id="empty"/);
  assert.doesNotMatch(markup, /class="labx-pipeline"/);
});

void test("laboratory pipeline trace is debug gated and follows rendered block order", () => {
  const blocks = [
    {
      id: "analysis-prep",
      render() {
        return "<span>Analysis prep</span>";
      },
      type: "section" as const,
    },
    {
      id: "hidden",
      render() {
        return "<span>Hidden</span>";
      },
      type: "action" as const,
      visible() {
        return false;
      },
    },
    {
      id: "empty",
      render() {
        return "";
      },
      type: "status" as const,
    },
    {
      id: "preflight",
      render() {
        return "<span>Preflight</span>";
      },
      type: "status" as const,
    },
  ];

  const noDocumentLogs = withoutDocument(function () {
    return captureDebugLogs(function () {
      renderPipeline(blocks, "setup");
    });
  });
  assert.equal(noDocumentLogs.length, 0);

  const noShellLogs = withDocumentStub(
    {
      querySelector() {
        return null;
      },
    },
    function () {
      return captureDebugLogs(function () {
        renderPipeline(blocks, "setup");
      });
    }
  );
  assert.equal(noShellLogs.length, 0);

  let debugShellPresent = true;
  const debugLogs = withDocumentStub(
    {
      querySelector(selector: string) {
        return selector === '.labx-shell[data-lab-debug-regions="true"]' && debugShellPresent
          ? {}
          : null;
      },
    },
    function () {
      const logs = captureDebugLogs(function () {
        renderPipeline(blocks, "setup");
      });
      debugShellPresent = false;
      const removedLogs = captureDebugLogs(function () {
        renderPipeline(blocks, "setup");
      });
      assert.equal(removedLogs.length, 0);
      return logs;
    }
  );

  assert.deepEqual(
    debugLogs.map(function (entry) {
      return entry[0];
    }),
    ["[lab][pipeline] setup -> analysis-prep (#0)", "[lab][pipeline] setup -> preflight (#1)"]
  );
  assert.deepEqual(debugLogs[0]?.[1], {
    blockId: "analysis-prep",
    index: 0,
    mode: "setup",
    type: "section",
  });
  assert.deepEqual(debugLogs[1]?.[1], {
    blockId: "preflight",
    index: 1,
    mode: "setup",
    type: "status",
  });
});

void test("laboratory v2 shell renders source intake in the setup drawer and preview media in center", () => {
  const store = createSeededState();
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "clip-setup-drawer",
      type: "clip",
      name: "setup_clip.mp4",
      localPath: "/tmp/setup_clip.mp4",
      createdAt: 200,
      sourceId: "source-1",
      runId: "run-1",
    },
  });
  store.dispatch({
    type: "workspace-bookmark-added",
    bookmark: {
      id: "bookmark-note-1",
      timeMs: 18565,
      frameIndex: null,
      note: "Red flash",
      createdAt: 1,
    },
  });
  const state = store.getState();
  const surface = renderWorkspaceSurface(state);
  const drawer = renderLabDrawer(state, surface);

  assert.match(surface.main, /lab-demo\.mp4/);
  assert.match(surface.main, /class="labx-media-workbench"[^>]*data-lab-region="main-stage-inner"/);
  assert.match(
    surface.main,
    /class="labx-workspace-preview labx-preview-area [^"]*"[^>]*data-lab-region="preview-area"/
  );
  assert.match(
    surface.main,
    /<div class="labx-media-workbench"[^>]*data-lab-region="main-stage-inner"[^>]*>[\s\S]*?<div class="labx-workspace-preview labx-preview-area [^"]*"[^>]*data-lab-region="preview-area"[^>]*>[\s\S]*?<\/div>\s*<div class="labx-timeline labx-timeline-area[^"]*" id="lab-timeline" data-lab-region="timeline-area"/
  );
  assert.match(
    surface.main,
    /<video class="labx-preview-media labx-preview-media--workspace-video"/
  );
  assert.doesNotMatch(
    surface.main,
    /labx-preview-media--workspace-video"[^>]*\scontrols(?:\s|>|=)/
  );
  assert.match(surface.main, /data-lab-selection-roi-controls-reserve="0"/);
  assert.match(surface.main, /data-lab-action="timeline-toggle-playback"/);
  assert.match(surface.main, /data-lab-role="timeline-volume"/);
  assert.match(surface.main, /data-lab-role="timeline-bookmark-note"/);
  assert.match(surface.main, /data-lab-action="timeline-add-bookmark"/);
  assert.match(surface.main, /data-lab-action="timeline-remove-bookmark"/);
  assert.match(surface.main, /labx-timeline__pin-popover/);
  assert.match(surface.main, /Red flash/);
  assert.match(surface.main, /data-lab-field="workspace\.previewVolume"/);
  assert.match(surface.main, /class="labx-workspace-stage"/);
  assert.doesNotMatch(surface.main, /data-lab-region="inspector-panel"/);
  assert.match(surface.inspector ?? "", /data-lab-region="inspector-panel"/);
  assert.match(surface.inspector ?? "", /data-lab-workspace-inspector="true"/);
  assert.match(surface.inspector ?? "", /data-open="true"/);
  assert.match(surface.inspector ?? "", /data-lab-action="workspace-controls-drawer-toggle"/);
  assert.match(surface.inspector ?? "", /data-lab-action="workspace-controls-tab-select"/);
  assert.match(surface.inspector ?? "", /data-inspector-panel="audio"[\s\S]*id="lab-audio-focus"/);
  assert.match(surface.inspector ?? "", /data-inspector-panel="visual"[\s\S]*labx-controls-card/);
  assert.doesNotMatch(surface.inspector ?? "", /labx-audio-focus__header/);
  assert.doesNotMatch(
    surface.inspector ?? "",
    /<h2 class="labx-card__title">(?:Görsel Ayarlar|Visual Adjustments)<\/h2>/
  );
  assert.doesNotMatch(surface.main, /class="labx-workspace-focus-row"/);
  assert.doesNotMatch(surface.main, /labx-timeline__range-info/);
  assert.doesNotMatch(surface.main, /labx-bookmarks/);
  assert.doesNotMatch(
    surface.main,
    /labx-timeline__header|Embedded audio|Preview and waveform share/
  );
  assert.doesNotMatch(surface.main, /Source setup controls/);
  assert.match(surface.side, /data-lab-selection-panel="true"/);
  assert.match(surface.side, /Önerilen Analizler/);
  assert.doesNotMatch(surface.side, /Önerilen İşlemler/);
  assert.doesNotMatch(
    surface.side,
    /data-lab-execution-plan|data-lab-execution-simulation|data-lab-execution-payload-preview|data-lab-execution-details/
  );
  assert.match(drawer, /class="labx-drawer labx-context-panel" data-lab-region="context-panel"/);
  assert.match(drawer, /data-drawer-mode="setup"/);
  assert.deepEqual(getPipelineBlockIds(drawer), ["analysis-prep", "analysis-cta"]);
  assert.match(drawer, /data-block-mode="setup"/);
  assert.match(drawer, /Analysis Modules/);
  assert.match(drawer, /data-lab-action="run-deep-analysis"/);
  assert.doesNotMatch(
    drawer,
    /Source setup controls|Project Assets|data-lab-action="save-project"/
  );
  assert.doesNotMatch(surface.main, /Kaynak Seçimi|Hızlı modül seçimi burada yapılır/);
});

void test("laboratory drawer keeps project assets visible in result and explore modes", () => {
  const store = createSeededState();
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "report-drawer-result",
      type: "report",
      name: "analysis-report.md",
      localPath: "/tmp/analysis-report.md",
      createdAt: 300,
      sourceId: "source-1",
      runId: "run-with-report",
    },
  });

  const state = store.getState() as ReturnType<typeof store.getState> & {
    run: Record<string, unknown>;
  };
  state.run = {
    id: "run-with-report",
    state: "completed",
    startedAt: Date.now() - 2000,
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
    analysisScope: null,
    previewArtifacts: [],
    confidence: null,
    moduleTrace: [],
    comparisonVariants: [],
    hypothesisSummary: null,
  };
  state.reports.user = {
    summary: "Report ready",
    confidence: "high",
    topFindings: [],
    suspiciousFrames: [],
    hypothesisResult: null,
    elapsedSeconds: 1,
    moduleSummary: [],
  };

  let surface = renderWorkspaceSurface(store.getState());
  let drawer = renderLabDrawer(store.getState(), surface);
  assert.match(drawer, /data-drawer-mode="result"/);
  assert.deepEqual(getPipelineBlockIds(drawer), [
    "context-summary",
    "report-action",
    "explore-toggle",
  ]);
  assert.match(drawer, /data-lab-action="open-report-overlay"/);
  assert.match(drawer, /data-lab-action="drawer-explore-toggled"/);
  assert.doesNotMatch(
    drawer,
    /analysis-report\.md|data-lab-action="asset-download"|data-lab-action="save-project"/
  );

  store.dispatch({ type: "drawer-explore-toggled" });
  surface = renderWorkspaceSurface(store.getState());
  drawer = renderLabDrawer(store.getState(), surface);
  assert.match(drawer, /data-drawer-mode="explore"/);
  assert.deepEqual(getPipelineBlockIds(drawer), [
    "workspace-comparison",
    "reanalyze-action",
    "result-toggle",
  ]);
  assert.match(drawer, /data-lab-action="run-deep-analysis"/);
  assert.doesNotMatch(drawer, /analysis-report\.md|data-lab-action="asset-preview"/);
});

void test("laboratory workspace treats reused local assets as ready sources", () => {
  const store = createSeededState();
  store.dispatch({
    type: "source-config-patched",
    patch: {
      routeLabel: "Asset reuse",
    },
  });
  store.dispatch({
    type: "workspace-bookmark-added",
    bookmark: {
      id: "bookmark-note-2",
      timeMs: 2200,
      frameIndex: null,
      note: "Audio pop",
      createdAt: 2,
    },
  });

  const state = store.getState();
  const surface = renderWorkspaceSurface(state);
  const drawer = renderLabDrawer(state, surface);

  assert.match(drawer, /data-drawer-mode="setup"/);
  assert.match(drawer, /Analysis Modules/);
  assert.match(
    surface.main,
    /<video class="labx-preview-media labx-preview-media--workspace-video"/
  );
  assert.doesNotMatch(
    surface.main,
    /labx-preview-media--workspace-video"[^>]*\scontrols(?:\s|>|=)/
  );
  assert.match(surface.main, /data-lab-selection-roi-controls-reserve="0"/);
  assert.match(surface.main, /data-lab-action="timeline-toggle-playback"/);
  assert.match(surface.main, /data-lab-role="timeline-volume"/);
  assert.match(surface.main, /data-lab-role="timeline-bookmark-note"/);
  assert.match(surface.main, /data-lab-action="timeline-add-bookmark"/);
  assert.match(surface.main, /data-lab-action="timeline-remove-bookmark"/);
  assert.match(surface.main, /labx-timeline__pin-popover/);
  assert.match(surface.main, /Audio pop/);
  assert.match(surface.main, /data-lab-field="workspace\.previewVolume"/);
  assert.doesNotMatch(surface.main, /labx-timeline__range-info/);
  assert.doesNotMatch(surface.main, /labx-bookmarks/);
  assert.doesNotMatch(
    surface.main,
    /labx-timeline__header|Embedded audio|Preview and waveform share/
  );
  assert.doesNotMatch(surface.main, /Awaiting source|Select a source to begin/);
});

void test("laboratory setup drawer previews analysis outcomes before the analysis CTA", () => {
  const store = createSeededState(true);

  let surface = renderWorkspaceSurface(store.getState());
  let drawer = renderLabDrawer(store.getState(), surface);
  assert.doesNotMatch(drawer, /Bu analiz .* tespit edecek/);

  store.dispatch({
    type: "capability-set",
    capabilities: ["visual-structure", "visual-forensics"],
  });

  surface = renderWorkspaceSurface(store.getState());
  drawer = renderLabDrawer(store.getState(), surface);
  assert.deepEqual(getPipelineBlockIds(drawer), ["analysis-prep", "preflight", "analysis-cta"]);
  assert.match(drawer, /Bu analiz .* üzerinde/);
  assert.match(drawer, /Visual Structure, Visual Forensics modüllerini çalıştıracak/);
  assert.doesNotMatch(drawer, /görsel ve işitsel anomali taraması yaparak/);
  assert.doesNotMatch(drawer, /olası anormallikler ve sınıflandırılmış ses olayları/);
});

void test("laboratory setup drawer owns active source selection controls under the analysis CTA", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 2400,
    endMs: 5600,
  });

  const surface = renderWorkspaceSurface(store.getState());
  const drawer = renderLabDrawer(store.getState(), surface);
  const ctaIndex = drawer.indexOf('data-lab-action="run-deep-analysis"');
  const selectionPanelIndex = drawer.indexOf("lab-selection-panel--drawer");

  assert.match(surface.main, /class="labx-timeline__selection lab-selection-overlay"/);
  assert.doesNotMatch(surface.main, /class="lab-selection-panel"/);
  assert.match(surface.side, /class="lab-selection-panel lab-selection-panel--drawer"/);
  assert.doesNotMatch(drawer, /class="lab-selection-panel lab-selection-panel--drawer"/);
  assert.deepEqual(getPipelineBlockIds(drawer), ["analysis-prep", "analysis-cta"]);
  assert.ok(ctaIndex > -1);
  assert.equal(selectionPanelIndex, -1);
});

void test("laboratory workspace inspector drawer persists collapsed visual tab state", () => {
  const store = createSeededState(true);
  store.dispatch({ type: "workspace-controls-tab-selected", tab: "visual" });
  store.dispatch({ type: "workspace-controls-drawer-toggled", force: false });

  const surface = renderWorkspaceSurface(store.getState());

  assert.match(surface.inspector ?? "", /data-lab-workspace-inspector="true"/);
  assert.match(surface.inspector ?? "", /data-lab-region="inspector-panel"/);
  assert.match(surface.inspector ?? "", /data-open="false"/);
  assert.match(surface.inspector ?? "", /data-active-tab="visual"/);
  assert.match(surface.inspector ?? "", /aria-expanded="false"/);
  assert.match(surface.inspector ?? "", /data-inspector-panel="visual"/);
});

void test("laboratory workspace focus layer classes map to preview timeline and inspector", () => {
  const store = createSeededState(true);

  let surface = renderWorkspaceSurface(store.getState());
  assert.match(surface.main, /class="labx-workspace-preview labx-preview-area labx-focus-primary"/);
  assert.match(surface.main, /class="labx-timeline labx-timeline-area labx-focus-passive"/);
  assert.match(
    surface.inspector ?? "",
    /class="labx-workspace-inspector labx-inspector-panel labx-focus-passive"/
  );

  store.dispatch({ type: "lab-focus-layer-changed", layer: "timeline" });
  surface = renderWorkspaceSurface(store.getState());
  assert.match(surface.main, /class="labx-workspace-preview labx-preview-area labx-focus-passive"/);
  assert.match(surface.main, /class="labx-timeline labx-timeline-area labx-focus-secondary"/);
  assert.match(
    surface.inspector ?? "",
    /class="labx-workspace-inspector labx-inspector-panel labx-focus-passive"/
  );

  store.dispatch({ type: "lab-focus-layer-changed", layer: "inspector" });
  surface = renderWorkspaceSurface(store.getState());
  assert.match(surface.main, /class="labx-workspace-preview labx-preview-area labx-focus-passive"/);
  assert.match(surface.main, /class="labx-timeline labx-timeline-area labx-focus-passive"/);
  assert.match(
    surface.inspector ?? "",
    /class="labx-workspace-inspector labx-inspector-panel labx-focus-secondary"/
  );
});

void test("laboratory workspace inspector exposes operation controls without selection-tab operation focus", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 2400,
    endMs: 5600,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "visual",
  });

  const surface = renderWorkspaceSurface(store.getState());

  assert.match(surface.inspector ?? "", /data-active-tab="audio"/);
  assert.match(surface.inspector ?? "", /data-inspector-panel="operations"/);
  assert.match(surface.inspector ?? "", /data-operation-id="enhanced-frame"/);
  assert.match(surface.inspector ?? "", /data-operation-id="before-after-variant"/);
  assert.match(surface.inspector ?? "", /data-operation-id="band-pass-voice"/);
  assert.match(surface.inspector ?? "", /data-operation-id="stem-separation"/);
  assert.doesNotMatch(
    surface.inspector ?? "",
    /data-operation-id="enhanced-frame"[\s\S]*data-active="true"/
  );
  assert.match(surface.inspector ?? "", /class="labx-settings-block labx-settings-block--inline"/);
  assert.doesNotMatch(surface.inspector ?? "", /data-lab-collapsible-panel="true"/);
  assert.match(surface.inspector ?? "", /data-panel-id="operationSettings\.enhanced-frame"/);
  assert.doesNotMatch(surface.inspector ?? "", /class="labx-settings-block__state"/);
  assert.doesNotMatch(surface.inspector ?? "", /class="labx-settings-block__action"/);
  assert.match(surface.inspector ?? "", /data-lab-operation-scope="timeRange"/);
  assert.doesNotMatch(surface.inspector ?? "", /data-lab-operation-scope="roi"/);
  assert.match(
    surface.inspector ?? "",
    /data-lab-field="operationSettings\.enhanced-frame\.preset"/
  );
  assert.match(surface.inspector ?? "", /data-lab-action="operation-settings-reset"/);
});

void test("laboratory icon rail keeps only runnable realtime and output operations", () => {
  const store = createSeededState(true);
  const surface = renderWorkspaceSurface(store.getState());

  assert.match(surface.main, /data-lab-region="icon-rail"/);
  assert.match(surface.main, /data-lab-value="audio-focus"/);
  assert.match(surface.main, /data-lab-value="roi-select"/);
  assert.match(surface.main, /data-lab-value="clip-export"/);
  assert.match(surface.main, /data-lab-value="enhanced-frame"/);
  assert.doesNotMatch(surface.main, /data-lab-value="image-comparison"/);
  assert.doesNotMatch(surface.main, /data-lab-value="before-after"/);
  assert.doesNotMatch(surface.main, /data-lab-value="stem-separate"/);
  assert.doesNotMatch(surface.main, /data-lab-value="stabilize"/);
});

void test("laboratory icon rail operation popovers mirror active timeline and ROI scope", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 2400,
    endMs: 5600,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "visual",
  });
  store.dispatch({
    type: "selection-roi-updated",
    roi: {
      height: 0.4,
      width: 0.3,
      x: 0.1,
      y: 0.2,
    },
  });
  store.dispatch({
    type: "icon-rail-slot-selected",
    slotId: "clip-export",
  });

  const surface = renderWorkspaceSurface(store.getState());

  assert.match(surface.main, /data-slot="clip-export"/);
  assert.match(surface.main, /data-slot="clip-export"[\s\S]*labx-icon-rail-popover__title/);
  assert.doesNotMatch(surface.main, /data-slot="clip-export"[\s\S]*<h3>/);
  assert.match(surface.main, /data-title-hidden="true"/);
  assert.match(surface.main, /data-lab-operation-scope="timeRange"/);
  assert.match(surface.main, /data-lab-operation-scope="roi"/);
  assert.match(
    surface.main,
    /data-lab-field="operationSettings\.clip-export\.applyRoiCrop"[\s\S]*checked/
  );
});

void test("laboratory video ROI without a timeline range stays ROI-only in operation scope", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "selection-roi-updated",
    roi: {
      height: 0.4,
      width: 0.3,
      x: 0.1,
      y: 0.2,
    },
  });
  store.dispatch({
    type: "icon-rail-slot-selected",
    slotId: "roi-select",
  });

  const state = store.getState();
  const surface = renderWorkspaceSurface(state);
  const operationMarkup = `${surface.main}${surface.inspector ?? ""}`;

  assert.equal(state.ui.workspace.activeSelection?.id, "selection-default:full-video");
  assert.equal(state.ui.workspace.timelineStartMs, null);
  assert.equal(state.ui.workspace.timelineEndMs, null);
  assert.match(surface.main, /data-lab-selection-roi-enabled="true"/);
  assert.doesNotMatch(surface.main, /data-slot="roi-select"[\s\S]*<h3>/);
  assert.match(surface.main, /data-title-hidden="true"/);
  assert.match(operationMarkup, /data-lab-operation-scope="roi"/);
  assert.doesNotMatch(operationMarkup, /data-lab-operation-scope="timeRange"/);
});

void test("laboratory source drawer tab remains report-analysis only", () => {
  const store = createSeededState(true);
  store.dispatch({ type: "drawer-mode-requested", mode: "setup" });
  store.dispatch({ type: "selection-tab-toggled", active: false });
  store.dispatch({ type: "analysis-prep-group-toggled", capabilityId: "visual-forensics" });

  const drawer = renderLabDrawer(store.getState(), renderWorkspaceSurface(store.getState()));

  assert.match(drawer, /data-drawer-mode="setup"/);
  assert.match(drawer, /data-block-id="analysis-prep"/);
  assert.match(drawer, /data-lab-action="run-deep-analysis"/);
  assert.match(drawer, /Analysis Modules/);
  assert.doesNotMatch(drawer, /labx-decision-header/);
  assert.doesNotMatch(drawer, /data-operation-id=/);
  assert.doesNotMatch(drawer, /operationSettings\./);
  assert.doesNotMatch(
    drawer,
    /data-lab-action="timeline-export-clip"|data-lab-action="workspace-audio-cleanup-export"|data-lab-action="workspace-enhanced-frame-export"|data-lab-action="operation-cancel"/
  );
});

void test("laboratory drawer keeps media operation controls out of report-analysis tabs", () => {
  const store = createSeededState(true);
  const sourceDrawer = renderLabDrawer(store.getState(), renderWorkspaceSurface(store.getState()));
  assert.doesNotMatch(sourceDrawer, /data-lab-drawer-workspace-controls="true"/);

  store.dispatch({ type: "workspace-controls-tab-selected", tab: "operations" });
  const operationDrawer = renderLabDrawer(
    store.getState(),
    renderWorkspaceSurface(store.getState())
  );

  assert.doesNotMatch(operationDrawer, /data-lab-drawer-workspace-controls="true"/);
  assert.doesNotMatch(operationDrawer, /data-lab-workspace-inspector="true"/);
  assert.doesNotMatch(operationDrawer, /data-operation-id=/);
  assert.match(operationDrawer, /data-lab-action="run-deep-analysis"/);
});

void test("laboratory operation buttons reflect scoped running action state", () => {
  const store = createSeededState(true);
  store.dispatch({
    type: "user-action-added",
    actionEvent: {
      id: "user-action-enhanced-frame",
      type: "custom",
      label: "İyileştirilmiş frame hazırlanıyor",
      status: "running",
      startedAt: 1,
      requestId: "request-enhanced-frame",
      projectId: "project-1",
      sourceAction: "export-enhanced-frame",
      progress: 42,
    },
  });

  const surface = renderWorkspaceSurface(store.getState());

  assert.match(
    surface.inspector ?? "",
    /data-operation-id="enhanced-frame"[\s\S]*data-action-status="running"/
  );
  assert.match(
    surface.inspector ?? "",
    /data-lab-operation-capability="enhanced-frame"[\s\S]*aria-busy="true"/
  );
  assert.match(
    surface.inspector ?? "",
    /data-lab-action="operation-cancel"[\s\S]*data-lab-value="enhanced-frame"/
  );
  assert.match(surface.inspector ?? "", />Cancel<\/button>/);
  assert.match(surface.inspector ?? "", /data-lab-operation-capability="audio-cleanup"/);
  assert.match(surface.inspector ?? "", /data-lab-operation-capability="band-pass-voice"/);
});

void test("laboratory workspace operations follow the selected asset media kind", () => {
  const store = createSeededState(true);
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

  const surface = renderWorkspaceSurface(store.getState());

  assert.match(surface.main, /data-lab-workspace-asset-kind="audio"/);
  assert.match(surface.inspector ?? "", /data-operation-id="audio-extract"/);
  assert.match(surface.inspector ?? "", /data-operation-id="audio-cleanup"/);
  assert.match(surface.inspector ?? "", /data-operation-id="band-pass-voice"/);
  assert.doesNotMatch(surface.inspector ?? "", /data-operation-id="enhanced-frame"/);
  assert.doesNotMatch(surface.inspector ?? "", /data-operation-id="frame-grab"/);
});


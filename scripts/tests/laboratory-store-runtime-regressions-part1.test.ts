import {
  assert,
  createLabHostBridge,
  createLabStore,
  extractFindings,
  parseProcessOutput,
  test,
} from "./laboratory-runtime-truth.helpers.ts";
import { loadLabPersistedState } from "../../rooms/laboratory/runtime/lab-persistence.ts";

void test("laboratory persistence drops stale runtime snapshots before boot hydrate", () => {
  const storage = new Map<string, string>();
  const windowRef = {
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
    },
  } as unknown as Window & typeof globalThis;

  storage.set(
    "hayalet-ev:laboratory-refactor:v4",
    JSON.stringify({
      schemaVersion: 4,
      selectedCapabilities: ["visual"],
      projectIndex: {
        activeProjectId: "project-old",
        projects: [{ id: "project-old", name: "Old Project" }],
      },
      workbench: {
        activeModuleId: "media-analysis",
        activePreviewArtifactId: "preview-old",
      },
      source: {
        kind: "video",
        status: "ready",
        storedPath: "/tmp/old.mp4",
      },
      sourceProbeStatus: "completed",
      editConfig: { output: "old" },
      profileConfig: { preflight: { status: "ready" } },
      preflight: { status: "ready" },
      lastRun: { id: "run-old", state: "completed" },
      reports: { user: { summary: "old" }, ai: null, emptyReason: null },
      reportExports: [{ id: "report-old" }],
      assets: [{ id: "asset-old", type: "source" }],
      profileModels: [{ modelId: "model-old" }],
      toolState: { ffmpeg: { installed: true } },
      activityFeed: [{ id: "event-old", message: "old" }],
      activePreviewArtifactId: "preview-old",
      sourceDrafts: {
        urlInput: "",
        youtubeUrl: "https://youtube.com/watch?v=abc123",
        youtubePreset: "custom",
        youtubeCustom: {},
        youtubeCaptureMode: "video+audio",
      },
      projectImport: {
        activeKind: "image",
        methods: { video: "local", audio: "local", image: "url" },
      },
      workspace: {
        timelineStartMs: 1000,
        timelineEndMs: 2000,
        activeSelection: { id: "selection-old" },
        roiRegions: [{ id: "roi-old" }],
        hypothesis: "old clue",
        previewVolume: 0.42,
        controlsDrawerTab: "operations",
        drawerCollapsed: true,
        activeIconRailSlot: "stabilize",
      },
    })
  );

  const loaded = loadLabPersistedState(windowRef) as Record<string, unknown>;
  assert.deepEqual(loaded["selectedCapabilities"], []);
  assert.deepEqual(loaded["projectIndex"], { activeProjectId: null, projects: [] });
  assert.equal(Object.keys((loaded["workbench"] ?? {}) as Record<string, unknown>).length, 0);
  assert.equal(loaded["source"], null);
  assert.equal(loaded["sourceProbeStatus"], "idle");
  assert.equal(loaded["editConfig"], null);
  assert.equal(loaded["profileConfig"], null);
  assert.equal(loaded["preflight"], null);
  assert.equal(loaded["lastRun"], null);
  assert.deepEqual(loaded["reportExports"], []);
  assert.deepEqual(loaded["assets"], []);
  assert.deepEqual(loaded["profileModels"], []);
  assert.deepEqual(loaded["toolState"], {});
  assert.deepEqual(loaded["activityFeed"], []);
  assert.equal(loaded["activePreviewArtifactId"], null);

  const workspace = loaded["workspace"] as Record<string, unknown>;
  assert.equal("timelineStartMs" in workspace, false);
  assert.equal("activeSelection" in workspace, false);
  assert.equal("roiRegions" in workspace, false);
  assert.equal("hypothesis" in workspace, false);
  assert.equal(workspace["previewVolume"], 0.42);
  assert.equal(workspace["controlsDrawerTab"], "operations");
  assert.equal(workspace["drawerCollapsed"], true);
  assert.equal(workspace["activeIconRailSlot"], "stabilize");

  const sourceDrafts = loaded["sourceDrafts"] as Record<string, unknown>;
  assert.equal(sourceDrafts["youtubeUrl"], "https://youtube.com/watch?v=abc123");
  const projectImport = loaded["projectImport"] as Record<string, unknown>;
  assert.equal(projectImport["activeKind"], "image");
});

void test("laboratory store tracks comparison capture controls without changing the reference", () => {
  const store = createLabStore();

  store.dispatch({ type: "workspace-comparison-reference-set", assetId: "asset-b" });
  store.dispatch({
    type: "workspace-comparison-updated",
    patch: {
      comparisonFindingNote: "Sol göz çevresi farkı",
      comparisonSplitPercent: 132,
      comparisonViewMode: "split",
    },
  });

  const workspace = store.getState().ui.workspace;
  assert.equal(workspace.comparisonReferenceAssetId, "asset-b");
  assert.equal(workspace.comparisonFindingNote, "Sol göz çevresi farkı");
  assert.equal(workspace.comparisonSplitPercent, 100);
  assert.equal(workspace.comparisonViewMode, "split");
  assert.equal(workspace.comparisonRois.activeSide, "reference");
  assert.equal(workspace.comparisonRois.reference, null);
});

void test("laboratory store keeps checked YouTube import state UI-only and non-persistent", () => {
  const store = createLabStore();
  assert.equal(store.getState().ui.labMode, "normal");
  assert.deepEqual(store.getState().ui.youtubeImport, {
    url: null,
    status: "idle",
    preview: null,
    formats: [],
    selectedVideoFormatId: null,
    selectedAudioFormatId: null,
  });

  store.dispatch({
    type: "source-drafts-updated",
    patch: {
      youtubeUrl: "https://youtube.com/watch?v=abc123",
      youtubePreset: "custom",
      youtubeCustom: {
        format: "best",
      },
    },
  });
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-source",
      type: "source",
      name: "source.mp4",
      createdAt: Date.now(),
      localPath: "/tmp/source.mp4",
      url: "file:///tmp/source.mp4",
      metadata: {},
    },
  });
  store.dispatch({
    type: "youtube-import-set-url",
    url: " https://www.youtube.com/watch?v=abc123DEF45 ",
  });
  assert.deepEqual(store.getState().ui.youtubeImport, {
    url: "https://www.youtube.com/watch?v=abc123DEF45",
    status: "idle",
    preview: null,
    formats: [],
    selectedVideoFormatId: null,
    selectedAudioFormatId: null,
  });
  const formatSelectionSnapshots = {
    sourceDrafts: JSON.parse(JSON.stringify(store.getState().ui.sourceDrafts)) as Record<string, unknown>,
    youtubeImportStableFields: {
      url: store.getState().ui.youtubeImport.url,
      status: store.getState().ui.youtubeImport.status,
      preview: store.getState().ui.youtubeImport.preview,
    },
    source: JSON.parse(JSON.stringify(store.getState().source)) as Record<string, unknown>,
    assets: JSON.parse(JSON.stringify(store.getState().assets)) as Record<string, unknown>,
    run: JSON.parse(JSON.stringify(store.getState().run)) as Record<string, unknown>,
    reports: JSON.parse(JSON.stringify(store.getState().reports)) as Record<string, unknown>,
  };
  assert.deepEqual(
    {
      url: store.getState().ui.youtubeImport.url,
      status: store.getState().ui.youtubeImport.status,
      preview: store.getState().ui.youtubeImport.preview,
    },
    formatSelectionSnapshots.youtubeImportStableFields
  );
  assert.deepEqual(store.getState().ui.sourceDrafts, formatSelectionSnapshots.sourceDrafts);
  assert.deepEqual(store.getState().source, formatSelectionSnapshots.source);
  assert.deepEqual(store.getState().assets, formatSelectionSnapshots.assets);
  assert.deepEqual(store.getState().run, formatSelectionSnapshots.run);
  assert.deepEqual(store.getState().reports, formatSelectionSnapshots.reports);
  store.dispatch({ type: "youtube-import-parse-start" });
  assert.equal(store.getState().ui.youtubeImport.status, "parsing");
  store.dispatch({
    type: "youtube-import-parse-success",
    url: "https://www.youtube.com/watch?v=stale00000",
    preview: {
      title: "Stale Video",
      duration: 1,
      thumbnail: "https://img.youtube.com/vi/stale00000/hqdefault.jpg",
    },
  });
  assert.equal(store.getState().ui.youtubeImport.status, "parsing");
  assert.equal(store.getState().ui.youtubeImport.preview, null);
  store.dispatch({
    type: "youtube-import-parse-success",
    url: "https://www.youtube.com/watch?v=abc123DEF45",
    preview: {
      title: "Sample Video Title",
      duration: 154,
      thumbnail: "https://img.youtube.com/vi/abc123DEF45/hqdefault.jpg",
    },
    formats: [
      { formatId: "137", label: "Video 1080p", kind: "video" },
      { formatId: "140", label: "Audio m4a", kind: "audio" },
    ],
    selectedVideoFormatId: "137",
    selectedAudioFormatId: "140",
  });
  assert.deepEqual(store.getState().ui.youtubeImport.preview, {
    title: "Sample Video Title",
    duration: 154,
    thumbnail: "https://img.youtube.com/vi/abc123DEF45/hqdefault.jpg",
  });
  assert.equal(store.getState().ui.youtubeImport.status, "ready");
  assert.equal(store.getState().ui.youtubeImport.selectedVideoFormatId, "137");
  assert.equal(store.getState().ui.youtubeImport.selectedAudioFormatId, "140");
  store.dispatch({
    type: "youtube-import-format-selected",
    videoFormatId: "999",
    audioFormatId: "140",
  });
  assert.equal(store.getState().ui.youtubeImport.selectedVideoFormatId, null);
  assert.equal(store.getState().ui.youtubeImport.selectedAudioFormatId, "140");
  store.dispatch({ type: "youtube-import-parse-error", reason: "invalid-url" });
  assert.deepEqual(store.getState().ui.youtubeImport, {
    url: "https://www.youtube.com/watch?v=abc123DEF45",
    status: "error",
    preview: null,
    formats: [],
    selectedVideoFormatId: null,
    selectedAudioFormatId: null,
  });
  store.dispatch({ type: "youtube-import-set-url", url: "   " });
  assert.deepEqual(store.getState().ui.youtubeImport, {
    url: null,
    status: "idle",
    preview: null,
    formats: [],
    selectedVideoFormatId: null,
    selectedAudioFormatId: null,
  });
  store.dispatch({ type: "youtube-import-clear" });
  assert.deepEqual(store.getState().ui.youtubeImport, {
    url: null,
    status: "idle",
    preview: null,
    formats: [],
    selectedVideoFormatId: null,
    selectedAudioFormatId: null,
  });
  store.dispatch({
    type: "youtube-import-set-url",
    url: "https://youtu.be/abc123DEF45",
  });
  store.dispatch({ type: "youtube-import-parse-start" });
  store.dispatch({ type: "youtube-import-clear" });
  assert.deepEqual(store.getState().ui.youtubeImport, {
    url: null,
    status: "idle",
    preview: null,
    formats: [],
    selectedVideoFormatId: null,
    selectedAudioFormatId: null,
  });

  const sourceDraftsBefore = store.getState().ui.sourceDrafts;
  const assetsBefore = store.getState().assets;
  assert.deepEqual(store.getState().ui.sourceDrafts, sourceDraftsBefore);
  assert.deepEqual(store.getState().assets, assetsBefore);

  store.dispatch({
    type: "youtube-import-set-url",
    url: "https://youtu.be/ready12345",
  });
  store.dispatch({
    type: "youtube-import-parse-success",
    url: "https://youtu.be/ready12345",
    preview: {
      title: "Ready Video",
      duration: 44,
      thumbnail: "https://img.youtube.com/vi/ready12345/hqdefault.jpg",
    },
    formats: [{ formatId: "18", label: "Muxed 360p", kind: "muxed" }],
    selectedVideoFormatId: "18",
    selectedAudioFormatId: "18",
  });
  assert.equal(store.getState().ui.labMode, "normal");

  store.dispatch({ type: "youtube-import-set-url", url: "https://youtu.be/abc123DEF45" });
  store.dispatch({ type: "youtube-import-parse-start" });
  store.dispatch({
    type: "hydrate",
    payload: {
      source: {
        kind: "video",
        mode: "youtube",
        status: "idle",
      },
      sourceDrafts: {
        urlInput: "",
        youtubeUrl: "https://youtube.com/watch?v=abc123",
        youtubePreset: "custom",
        youtubeCustom: {
          format: "best",
        },
        youtubeCaptureMode: "video+audio",
      },
    },
  });

  assert.equal(store.getState().ui.labMode, "normal");
  assert.deepEqual(store.getState().ui.youtubeImport, {
    url: null,
    status: "idle",
    preview: null,
    formats: [],
    selectedVideoFormatId: null,
    selectedAudioFormatId: null,
  });
  assert.equal("youtubeImport" in (store.getState().persisted as unknown as Record<string, unknown>), false);
  assert.equal(store.getState().ui.sourceDrafts.youtubeUrl, "https://youtube.com/watch?v=abc123");
});

void test("laboratory store tracks focus layer as guarded UI-only state", () => {
  const store = createLabStore();

  assert.equal(store.getState().ui.labFocusLayer, "preview");

  store.dispatch({ type: "lab-focus-layer-changed", layer: "timeline" });
  assert.equal(store.getState().ui.labFocusLayer, "timeline");

  store.dispatch({ type: "lab-focus-layer-changed", layer: "inspector" });
  assert.equal(store.getState().ui.labFocusLayer, "inspector");

  store.dispatch({
    type: "lab-focus-layer-changed",
    layer: "unknown",
  } as unknown as Parameters<typeof store.dispatch>[0]);
  assert.equal(store.getState().ui.labFocusLayer, "inspector");

  store.dispatch({ type: "hydrate", payload: null });
  assert.equal(store.getState().ui.labFocusLayer, "preview");
});

void test("laboratory store preserves persisted project import route across hydrate and source snapshots", () => {
  const store = createLabStore();

  store.dispatch({
    type: "hydrate",
    payload: {
      projectIndex: {
        activeProjectId: "project-1",
        projects: [{ id: "project-1", name: "Workspace Project", hasSource: true }],
      },
      source: {
        kind: "video",
        mode: "local",
        status: "ready",
        drafts: {
          urlInput: "",
          youtubeUrl: "",
          youtubePreset: null,
          youtubeCustom: {},
          youtubeCaptureMode: "video+audio",
        },
      },
      projectImport: {
        activeKind: "image",
        methods: {
          video: "youtube",
          audio: "url",
          image: "url",
        },
        drafts: {
          video: { urlInput: "", youtubeUrl: "", youtubePreset: null, youtubeCustom: {}, youtubeCaptureMode: "video+audio" },
          audio: { urlInput: "", youtubeUrl: "", youtubePreset: null, youtubeCustom: {}, youtubeCaptureMode: "video+audio" },
          image: {
            urlInput: "https://example.com/evidence.png",
            youtubeUrl: "",
            youtubePreset: null,
            youtubeCustom: {},
            youtubeCaptureMode: "video+audio",
          },
        },
        reviewFocus: "draft",
      },
    },
  });

  assert.equal(store.getState().ui.projectImport.activeKind, "image");
  assert.equal(store.getState().ui.projectImport.methods.image, "url");
  assert.equal(
    store.getState().ui.projectImport.drafts.image.urlInput,
    "https://example.com/evidence.png"
  );

  store.dispatch({
    type: "snapshot-received",
    payload: {
      ready: true,
      activeProjectId: "project-1",
      projects: [{ id: "project-1", name: "Workspace Project", hasSource: true }],
      activeProject: {
        id: "project-1",
        name: "Workspace Project",
        source: {
          kind: "video",
          mode: "local",
          status: "ready",
          drafts: {
            urlInput: "",
            youtubeUrl: "",
            youtubePreset: null,
            youtubeCustom: {},
            youtubeCaptureMode: "video+audio",
          },
        },
        edit: {},
        profile: { preflight: {} },
        process: { records: {} },
        report: { records: {} },
        assets: [],
      },
      workbench: {},
      toolState: { tools: {} },
    },
  });

  assert.equal(store.getState().ui.projectImport.activeKind, "image");
  assert.equal(store.getState().ui.projectImport.methods.image, "url");
  assert.equal(
    store.getState().ui.projectImport.drafts.image.urlInput,
    "https://example.com/evidence.png"
  );
});

void test("laboratory store resets project import drafts and checked YouTube state on demand", () => {
  const store = createLabStore();

  store.dispatch({
    type: "project-import-draft-updated",
    kind: "video",
    patch: { urlInput: "https://youtube.com/watch?v=abc123" },
  });
  store.dispatch({
    type: "project-import-url-check-started",
    url: "https://youtube.com/watch?v=abc123",
  });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-url-check",
      kind: "request-result",
      severity: "success",
      message: "URL check completed",
      detail: null,
      action: "project-import-check-url",
      stage: "completed",
      timestamp: Date.now(),
      source: "host",
      scope: "global",
      moduleId: null,
      rawLine: null,
      result: {
        url: "https://youtube.com/watch?v=abc123",
        isYoutube: true,
        kind: "video",
        preview: { title: "Evidence clip" },
        formats: [{ formatId: "18", label: "MP4 360p", kind: "muxed", extension: "mp4" }],
        selectedVideoFormatId: "18",
      },
    } as never,
  });

  assert.equal(store.getState().ui.projectImport.urlCheck.status, "ready");
  assert.equal(store.getState().ui.youtubeImport.status, "ready");

  store.dispatch({ type: "project-import-reset" });

  assert.equal(store.getState().ui.projectImport.urlCheck.status, "idle");
  assert.equal(store.getState().ui.projectImport.drafts.video.urlInput, "");
  assert.equal(store.getState().ui.projectImport.drafts.video.youtubeUrl, "");
  assert.equal(store.getState().ui.projectImport.lastAction, null);
  assert.equal(store.getState().ui.projectImport.lastRequestId, null);
  assert.deepEqual(store.getState().ui.youtubeImport, {
    url: null,
    status: "idle",
    preview: null,
    formats: [],
    selectedVideoFormatId: null,
    selectedAudioFormatId: null,
  });
});

void test("laboratory store resets project import check state when active project changes", () => {
  const store = createLabStore();

  store.dispatch({
    type: "snapshot-received",
    payload: {
      ready: true,
      featureId: "media-analysis",
      activeProjectId: "project-1",
      projects: [
        { id: "project-1", name: "Import Draft", hasSource: false },
        { id: "project-2", name: "Saved Project", hasSource: true },
      ],
      activeProject: {
        id: "project-1",
        name: "Import Draft",
        source: {
          kind: "video",
          mode: "youtube",
          status: "idle",
          drafts: {
            urlInput: "",
            youtubeUrl: "",
            youtubePreset: null,
            youtubeCustom: {},
            youtubeCaptureMode: "video+audio",
          },
        },
        edit: {},
        profile: { preflight: {} },
        process: { records: {} },
        report: { records: {} },
        assets: [],
      },
      workbench: {},
      toolState: { tools: {} },
    },
  });
  store.dispatch({
    type: "project-import-draft-updated",
    kind: "video",
    patch: { urlInput: "https://youtube.com/watch?v=abc123" },
  });
  store.dispatch({
    type: "project-import-url-check-started",
    url: "https://youtube.com/watch?v=abc123",
  });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-project-switch-url-check",
      kind: "request-result",
      severity: "success",
      message: "URL check completed",
      detail: null,
      action: "project-import-check-url",
      stage: "completed",
      timestamp: Date.now(),
      source: "host",
      scope: "global",
      moduleId: null,
      rawLine: null,
      result: {
        url: "https://youtube.com/watch?v=abc123",
        isYoutube: true,
        kind: "video",
        preview: { title: "Evidence clip" },
        formats: [{ formatId: "18", label: "MP4 360p", kind: "muxed", extension: "mp4" }],
        selectedVideoFormatId: "18",
      },
    } as never,
  });

  assert.equal(store.getState().ui.projectImport.urlCheck.status, "ready");
  assert.equal(store.getState().ui.youtubeImport.status, "ready");

  store.dispatch({
    type: "snapshot-received",
    payload: {
      ready: true,
      featureId: "media-analysis",
      activeProjectId: "project-2",
      projects: [
        { id: "project-1", name: "Import Draft", hasSource: false },
        { id: "project-2", name: "Saved Project", hasSource: true },
      ],
      activeProject: {
        id: "project-2",
        name: "Saved Project",
        source: {
          kind: "video",
          mode: "local",
          status: "ready",
          storedPath: "/tmp/saved.mp4",
          storedFileName: "saved.mp4",
          drafts: {
            urlInput: "",
            youtubeUrl: "",
            youtubePreset: null,
            youtubeCustom: {},
            youtubeCaptureMode: "video+audio",
          },
        },
        edit: {},
        profile: { preflight: {} },
        process: { records: {} },
        report: { records: {} },
        assets: [],
      },
      workbench: {},
      toolState: { tools: {} },
    },
  });

  assert.equal(store.getState().projectIndex.activeProjectId, "project-2");
  assert.equal(store.getState().ui.projectImport.urlCheck.status, "idle");
  assert.equal(store.getState().ui.projectImport.drafts.video.urlInput, "");
  assert.equal(store.getState().ui.projectImport.drafts.video.youtubeUrl, "");
  assert.equal(store.getState().ui.youtubeImport.status, "idle");
});

void test("laboratory store clears import controls after completed tracked YouTube add", () => {
  const store = createLabStore();

  store.dispatch({
    type: "project-import-draft-updated",
    kind: "video",
    patch: { urlInput: "https://youtube.com/watch?v=abc123" },
  });
  store.dispatch({
    type: "project-import-url-check-started",
    url: "https://youtube.com/watch?v=abc123",
  });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-url-check",
      kind: "request-result",
      severity: "success",
      message: "URL check completed",
      detail: null,
      action: "project-import-check-url",
      stage: "completed",
      timestamp: Date.now(),
      source: "host",
      scope: "global",
      moduleId: null,
      rawLine: null,
      result: {
        url: "https://youtube.com/watch?v=abc123",
        isYoutube: true,
        kind: "video",
        preview: { title: "Evidence clip" },
        formats: [{ formatId: "18", label: "MP4 360p", kind: "muxed", extension: "mp4" }],
        selectedVideoFormatId: "18",
      },
    } as never,
  });
  store.dispatch({
    type: "project-import-review-focused",
    focus: "running",
    action: "source-download-youtube",
    requestId: "req-add",
  });
  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "video",
      mode: "youtube",
      status: "ready",
      storedFileName: "clip.mp4",
      storedPath: "/tmp/clip.mp4",
      metadata: { duration: 12 },
    },
  });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-youtube-add",
      kind: "activity",
      severity: "success",
      message: "YouTube import completed",
      detail: null,
      action: "source-download-youtube",
      stage: "completed",
      timestamp: Date.now(),
      source: "host",
      scope: "global",
      moduleId: null,
      rawLine: null,
      requestId: "req-add",
    } as never,
  });

  assert.equal(store.getState().sourceProbeStatus, "completed");
  assert.equal(store.getState().ui.projectImport.reviewFocus, "completed");
  assert.equal(store.getState().ui.projectImport.lastAction, "source-download-youtube");
  assert.equal(store.getState().ui.projectImport.lastRequestId, "req-add");
  assert.equal(store.getState().ui.projectImport.urlCheck.status, "idle");
  assert.equal(store.getState().ui.projectImport.drafts.video.urlInput, "");
  assert.equal(store.getState().ui.youtubeImport.status, "idle");
  assert.equal((store.getState().source as Record<string, unknown>)["status"], "ready");
  assert.equal((store.getState().source as Record<string, unknown>)["storedFileName"], "clip.mp4");
});

void test("laboratory store preserves URL draft after failed tracked YouTube add", () => {
  const store = createLabStore();

  store.dispatch({
    type: "project-import-draft-updated",
    kind: "video",
    patch: { urlInput: "https://youtube.com/watch?v=abc123" },
  });
  store.dispatch({
    type: "project-import-url-check-started",
    url: "https://youtube.com/watch?v=abc123",
  });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-url-check",
      kind: "request-result",
      severity: "success",
      message: "URL check completed",
      detail: null,
      action: "project-import-check-url",
      stage: "completed",
      timestamp: Date.now(),
      source: "host",
      scope: "global",
      moduleId: null,
      rawLine: null,
      result: {
        url: "https://youtube.com/watch?v=abc123",
        isYoutube: true,
        kind: "video",
        preview: { title: "Evidence clip" },
        formats: [{ formatId: "18", label: "MP4 360p", kind: "muxed", extension: "mp4" }],
        selectedVideoFormatId: "18",
      },
    } as never,
  });
  store.dispatch({
    type: "project-import-review-focused",
    focus: "running",
    action: "source-download-youtube",
    requestId: "req-add",
  });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-youtube-add-failed",
      kind: "activity",
      severity: "error",
      message: "YouTube import failed",
      detail: "Network error",
      action: "source-download-youtube",
      stage: "failed",
      timestamp: Date.now(),
      source: "host",
      scope: "global",
      moduleId: null,
      rawLine: null,
      requestId: "req-add",
    } as never,
  });

  assert.equal(store.getState().sourceProbeStatus, "failed");
  assert.equal(store.getState().ui.projectImport.urlCheck.status, "ready");
  assert.equal(
    store.getState().ui.projectImport.drafts.video.urlInput,
    "https://youtube.com/watch?v=abc123"
  );
  assert.equal(store.getState().ui.youtubeImport.status, "ready");
});

void test("laboratory process output parser translates known ffmpeg and download lines", () => {
  const blackdetectEvent = parseProcessOutput("blackdetect=duration:0.42");
  const frameEvent = parseProcessOutput("frame= 248 fps=24");
  const downloadEvent = parseProcessOutput("[download] 42.1% of 12.31MiB");
  const mergeEvent = parseProcessOutput('Merging formats into "clip.mp4"');

  assert.equal(blackdetectEvent?.message, "Siyah sahne tespiti calisiyor");
  assert.equal(blackdetectEvent.moduleId, "motion");
  assert.equal(frameEvent?.detail, "248 kare incelendi");
  assert.equal(downloadEvent?.message, "Kaynak indiriliyor");
  assert.equal(downloadEvent.scope, "global");
  assert.equal(mergeEvent?.message, "Kaynak birlestiriliyor");
});

void test("laboratory process output parser leaves unknown lines in raw-log only flow", () => {
  const unknownEvent = parseProcessOutput("totally unknown tool output");
  assert.equal(unknownEvent, null);
});

void test("laboratory finding engine derives findings from semantic events and stays quiet on thin runs", () => {
  const anomalyFindings = extractFindings([
    {
      id: "evt-1",
      kind: "activity",
      severity: "info",
      message: "Siyah sahne segmenti bulundu",
      detail: "black_start:12.5",
      timestamp: Date.now(),
      source: "host",
      action: "process-run",
      stage: "stdout",
      scope: "run",
      moduleId: "motion",
      rawLine: "black_start:12.5",
    },
    {
      id: "evt-2",
      kind: "activity",
      severity: "info",
      message: "Freeze segmenti bulundu",
      detail: "freeze_duration:1.2",
      timestamp: Date.now(),
      source: "host",
      action: "process-run",
      stage: "stdout",
      scope: "run",
      moduleId: "motion",
      rawLine: "freeze_duration:1.2",
    },
  ]);

  assert.equal(anomalyFindings.length >= 2, true);
  assert.equal(
    anomalyFindings.some((entry) => entry.title.includes("Siyah sahne")),
    true
  );
  assert.equal(
    anomalyFindings.some((entry) => entry.title.includes("Freeze")),
    true
  );

  const noAnomalyFindings = extractFindings([
    {
      id: "evt-coverage",
      kind: "activity",
      severity: "info",
      message: "Kare analizi aktif",
      detail: "248 kare incelendi",
      timestamp: Date.now(),
      source: "host",
      action: "process-run",
      stage: "stdout",
      scope: "run",
      moduleId: "motion",
      rawLine: "frame=248",
    },
    {
      id: "evt-3",
      kind: "activity",
      severity: "success",
      message: "Analiz tamamlandi",
      detail: null,
      timestamp: Date.now(),
      source: "host",
      action: "process-run",
      stage: "completed",
      scope: "run",
      moduleId: null,
      rawLine: null,
    },
  ]);

  assert.equal(noAnomalyFindings.length, 1);
  assert.equal(noAnomalyFindings[0]?.title, "Belirgin anomali tespit edilmedi");

  const thinRunFindings = extractFindings([
    {
      id: "evt-4",
      kind: "activity",
      severity: "success",
      message: "Analiz tamamlandi",
      detail: null,
      timestamp: Date.now(),
      source: "host",
      action: "process-run",
      stage: "completed",
      scope: "run",
      moduleId: null,
      rawLine: null,
    },
  ]);

  assert.equal(thinRunFindings.length, 0);
});

void test("laboratory bridge forwards only canonical lab events into the store", () => {
  const emitted: string[] = [];
  const bridge = createLabHostBridge({
    emit(event) {
      emitted.push(event.type);
    },
  });

  bridge.handleHostMessage({
    type: "media-job",
    payload: {
      action: "process-run",
      stage: "queued",
      toolId: "ffmpeg",
      featureStage: "process",
    },
  });

  bridge.handleHostMessage({
    type: "lab-event",
    payload: {
      id: "evt-run-1",
      kind: "activity",
      severity: "info",
      message: "Analiz basladi",
      detail: null,
      timestamp: Date.now(),
      source: "host",
      action: "process-run",
      stage: "queued",
      scope: "run",
      moduleId: null,
      rawLine: null,
    },
  });

  assert.deepEqual(emitted, ["host-event-received"]);
});

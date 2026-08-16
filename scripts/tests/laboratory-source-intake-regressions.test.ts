import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createMediaUrlSourceIntakeRuntime } from "../../rooms/laboratory/features/media-analysis/host/source-intake-url.ts";
import { createMediaYoutubeSourceIntakeRuntime } from "../../rooms/laboratory/features/media-analysis/host/source-intake-youtube.ts";
import { createLabStore } from "../../rooms/laboratory/runtime/lab-store.ts";
import { resolveDrawerMode } from "../../rooms/laboratory/runtime/lab-selectors.ts";
import { renderLabSourcePanel } from "../../rooms/laboratory/ui/lab-source-panel.ts";
import { renderWorkspaceSurface } from "../../rooms/laboratory/ui/workspace-surface.ts";

const sourcePresets = JSON.parse(
  readFileSync("rooms/laboratory/tools/source-presets.json", "utf8")
) as Record<string, unknown>;
const ytDlpForm = JSON.parse(
  readFileSync("rooms/laboratory/tools/yt-dlp.form.json", "utf8")
) as Record<string, unknown>;

function toRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && Array.isArray(value) === false
    ? (value as Record<string, unknown>)
    : {};
}

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function createYoutubeArgsRuntime() {
  return createMediaYoutubeSourceIntakeRuntime({
    asNonEmptyString,
    callRoomTools: async function () {
      return {};
    },
    cancelJobsForProject: async function () {
      return null;
    },
    clearJob: function () {
      return undefined;
    },
    getActiveProject: function () {
      return null;
    },
    getPresetDefaultCustomValues: function (presetsValue, presetId) {
      return toRecord(
        toRecord(toRecord(toRecord(presetsValue)["youtubePresets"])[presetId])[
          "defaultCustomValues"
        ]
      );
    },
    getProjectSourceDir: function () {
      return "/tmp/lab-youtube-source";
    },
    normalizeMimeType: function () {
      return "video/mp4";
    },
    patchActiveProject: async function () {
      return null;
    },
    pushJobState: function () {
      return undefined;
    },
    registerJob: function () {
      return undefined;
    },
    resetEditForCurrentSource: function () {
      return undefined;
    },
    resetProfileForCurrentSource: function () {
      return undefined;
    },
    resolvePreparedSource: async function () {
      return {
        metadata: {},
        metadataError: null,
        mimeType: "video/mp4",
        storedFileName: "clip.mp4",
        storedPath: "/tmp/lab-youtube-source/clip.mp4",
      };
    },
    roomId: "laboratory",
    toRecord,
  });
}

function assertArgPair(args: string[], flag: string, value: string) {
  const flagIndex = args.indexOf(flag);
  assert.notEqual(flagIndex, -1);
  assert.equal(args[flagIndex + 1], value);
}

void test("laboratory YouTube probe accepts only single video URLs", async () => {
  const toolCalls: Array<Record<string, unknown>> = [];
  const runtime = createMediaYoutubeSourceIntakeRuntime({
    asNonEmptyString,
    async callRoomTools(payload) {
      toolCalls.push(payload);
      return {
        run: {
          stdout: JSON.stringify({
            title: "Evidence clip",
            duration: 154,
            thumbnail: "https://img.youtube.com/vi/abc123/0.jpg",
            webpage_url: "https://www.youtube.com/watch?v=abc123",
            formats: [
              {
                format_id: "18",
                ext: "mp4",
                vcodec: "avc1",
                acodec: "mp4a",
              },
            ],
          }),
        },
      };
    },
    cancelJobsForProject: async function () {
      return null;
    },
    clearJob: function () {
      return undefined;
    },
    getActiveProject: function () {
      return {
        id: "project-youtube-probe",
        source: {
          drafts: {},
        },
      };
    },
    getPresetDefaultCustomValues: function () {
      return {};
    },
    getProjectSourceDir: function () {
      return "/tmp/lab-youtube-source";
    },
    normalizeMimeType: function () {
      return "video/mp4";
    },
    patchActiveProject: async function () {
      return null;
    },
    pushJobState: function () {
      return undefined;
    },
    registerJob: function () {
      return undefined;
    },
    resetEditForCurrentSource: function () {
      return undefined;
    },
    resetProfileForCurrentSource: function () {
      return undefined;
    },
    resolvePreparedSource: async function () {
      return {
        metadata: {},
        metadataError: null,
        mimeType: "video/mp4",
        storedFileName: "clip.mp4",
        storedPath: "/tmp/lab-youtube-source/clip.mp4",
      };
    },
    roomId: "laboratory",
    toRecord,
  });
  const runtimeState = {
    toolState: {
      tools: {
        "yt-dlp": { installed: true },
      },
    },
  };
  const rejectedUrls = [
    "https://www.youtube.com/playlist?list=PL123",
    "https://www.youtube.com/@example-channel",
    "https://www.youtube.com/watch?v=abc123&list=PL123",
  ];

  async function rejectForUrl(url: string): Promise<void> {
    await assert.rejects(
      async () => await runtime.handleYoutubeProbe({}, runtimeState, "req-youtube-probe", url),
      /Only a single YouTube video URL is supported\./
    );
  }
  await Promise.all(rejectedUrls.map(rejectForUrl));

  assert.equal(toolCalls.length, 0);

  const result = await runtime.handleYoutubeProbe(
    {},
    runtimeState,
    "req-youtube-probe",
    "https://youtu.be/abc123?t=4"
  );

  assert.equal(toRecord(result)["kind"], "video");
  assert.deepEqual(toolCalls[0]?.["args"], [
    "--dump-single-json",
    "--skip-download",
    "--no-playlist",
    "https://youtu.be/abc123?t=4",
  ]);
});

function createWorkspaceState(overrides: {
  activityFeed?: Array<Record<string, unknown>>;
  sourceProbeStatus?: "idle" | "running" | "completed" | "failed";
  toolState?: Record<string, unknown>;
  projectImportKind?: "video" | "audio" | "image";
  projectImportMethod?: "local" | "url" | "youtube";
  urlCheckResult?: Record<string, unknown>;
  source: Record<string, unknown>;
}) {
  const store = createLabStore();
  store.dispatch({
    type: "snapshot-received",
    payload: {
      ready: true,
      featureId: "media-analysis",
      activeProjectId: "project-1",
      projects: [{ id: "project-1", name: "2026-04-21 12-00 - draft", hasSource: false }],
      activeProject: {
        id: "project-1",
        name: "2026-04-21 12-00 - draft",
        createdAt: "2026-04-21T12:00:00.000Z",
        source: overrides.source,
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
        selectedModuleIds: ["media-analysis"],
      },
      sourcePresets,
      ytDlpForm,
      toolState: overrides.toolState ?? { tools: {} },
      profileModels: [],
      sourceProbeStatus: overrides.sourceProbeStatus ?? "idle",
      activityFeed: overrides.activityFeed ?? [],
    },
  });
  (overrides.activityFeed ?? []).forEach(function (event) {
    store.dispatch({
      type: "host-event-received",
      event: event as never,
    });
  });
  const sourceKind = overrides.projectImportKind ?? String((overrides.source["kind"] as string | undefined) ?? "video");
  if (sourceKind === "video" || sourceKind === "audio" || sourceKind === "image") {
    store.dispatch({ type: "project-import-kind-changed", kind: sourceKind });
  }
  const sourceMethod = overrides.projectImportMethod ?? String((overrides.source["mode"] as string | undefined) ?? "local");
  if (sourceMethod === "local" || sourceMethod === "url" || sourceMethod === "youtube") {
    store.dispatch({
      type: "project-import-method-changed",
      method: sourceMethod,
    });
  }
  if (overrides.urlCheckResult) {
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
        result: overrides.urlCheckResult,
      } as never,
    });
  }
  return store.getState();
}

function renderProjectWorkspaceHtml(overrides: Parameters<typeof createWorkspaceState>[0]) {
  return renderLabSourcePanel(createWorkspaceState(overrides));
}

type ProjectImportSourceAction =
  | "source-pick-local"
  | "source-download-url"
  | "source-download-youtube";

function createTrackedProjectImportStore(
  requestId = "req-project-import",
  action: ProjectImportSourceAction = "source-download-url"
) {
  const store = createLabStore();
  store.dispatch({
    type: "snapshot-received",
    payload: {
      ready: true,
      featureId: "media-analysis",
      activeProjectId: "project-1",
      projects: [{ id: "project-1", name: "Import Project", hasSource: true }],
      activeProject: {
        id: "project-1",
        name: "Import Project",
        source: {
          kind: "video",
          mode: "url",
          status: "ready",
          storedFileName: "source.mp4",
          storedPath: "/tmp/source.mp4",
          routeLabel: "Direct URL",
          metadata: { durationSeconds: 4 },
          drafts: {},
        },
        edit: {},
        profile: { preflight: {} },
        process: { records: {} },
        report: { records: {} },
      },
      workbench: {
        activeModuleId: "media-analysis",
        availableModuleIds: ["media-analysis"],
        selectedModuleIds: ["media-analysis"],
      },
      sourcePresets,
      ytDlpForm,
      toolState: { tools: {} },
      profileModels: [],
      sourceProbeStatus: "idle",
      activityFeed: [],
    },
  });
  store.dispatch({ type: "drawer-mode-requested", mode: "result" });
  store.dispatch({ type: "report-overlay-toggled", open: true });
  store.dispatch({
    type: "project-import-review-focused",
    focus: "running",
    action,
    requestId,
  });
  return store;
}

void test("laboratory URL intake downloads image sources into the frame asset category", async () => {
  let activeProject: Record<string, unknown> = {
    id: "project-url-image",
    source: {
      kind: "image",
      drafts: {
        kind: "image",
        urlInput: "https://example.test/evidence.png",
      },
    },
    workbench: {},
    assets: [],
  };
  const toolCalls: Array<Record<string, unknown>> = [];

  const runtime = createMediaUrlSourceIntakeRuntime({
    asNonEmptyString,
    async callRoomTools(payload) {
      toolCalls.push(payload);
      return {
        download: {
          contentType: "image/png",
          fileName: "evidence.png",
          path: "/tmp/lab-project/sources/evidence.png",
        },
      };
    },
    cancelJobsForProject: async function () {
      return null;
    },
    clearJob: function () {
      return undefined;
    },
    deriveFilename() {
      return "evidence.png";
    },
    getActiveProject() {
      return activeProject;
    },
    getProjectSourceDir() {
      return "/tmp/lab-project/sources";
    },
    normalizeMimeType() {
      return "image/png";
    },
    patchActiveProject: async function (_runtime, updater) {
      activeProject = updater(activeProject);
    },
    pushJobState: function () {
      return undefined;
    },
    registerJob: function () {
      return undefined;
    },
    resetEditForCurrentSource: function () {
      return undefined;
    },
    resetProfileForCurrentSource: function () {
      return undefined;
    },
    resolvePreparedSource: async function (_runtime, _project, options) {
      return {
        metadata: {
          height: 720,
          width: 1280,
        },
        metadataError: null,
        mimeType: options["mimeType"] as string,
        storedFileName: options["storedFileName"] as string,
        storedPath: options["storedPath"] as string,
      };
    },
    roomId: "laboratory",
    toRecord,
  });

  await runtime.handleUrlDownload({}, {}, "req-url-image");

  assert.equal(toolCalls[0]?.["operation"], "download-file");
  const assets = Array.isArray(activeProject["assets"])
    ? (activeProject["assets"] as Array<Record<string, unknown>>)
    : [];
  const imageAsset = assets.find(function (asset) {
    return asset["type"] === "image";
  });
  assert.equal(imageAsset?.["localPath"], "/tmp/lab-project/sources/evidence.png");
  assert.equal(imageAsset?.["url"], "https://example.test/evidence.png");
  assert.equal(toRecord(imageAsset?.["metadata"])["flowKind"], "remote-url-import");
});

for (const action of [
  "source-pick-local",
  "source-download-url",
  "source-download-youtube",
] as const) {
  void test(`laboratory project import completion closes project management for ${action}`, () => {
    const store = createTrackedProjectImportStore("req-project-import", action);

    store.dispatch({
      type: "host-event-received",
      event: {
        id: `evt-import-complete-${action}`,
        kind: "request-result",
        severity: "success",
        message: "Project source imported",
        detail: null,
        action,
        stage: "completed",
        requestId: "req-project-import",
        timestamp: Date.now(),
        source: "host",
        scope: "global",
        moduleId: null,
        rawLine: null,
      },
    });

    const state = store.getState();
    assert.equal(state.sourceProbeStatus, "completed");
    assert.equal(state.ui.projectImport.reviewFocus, "completed");
    assert.equal(state.ui.workspace.sourceIntakeCollapsed, true);
    assert.equal(state.ui.workspace.reportOverlayOpen, false);
    assert.equal(state.ui.workspace.drawerModeOverride, "setup");
    assert.equal(resolveDrawerMode(state), "setup");
  });
}

void test("laboratory project import completion ignores unrelated source requests", () => {
  const store = createTrackedProjectImportStore();

  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-import-other-complete",
      kind: "request-result",
      severity: "success",
      message: "URL source downloaded",
      detail: null,
      action: "source-download-url",
      stage: "completed",
      requestId: "req-other",
      timestamp: Date.now(),
      source: "host",
      scope: "global",
      moduleId: null,
      rawLine: null,
    },
  });

  const state = store.getState();
  assert.equal(state.sourceProbeStatus, "completed");
  assert.equal(state.ui.projectImport.reviewFocus, "running");
  assert.equal(state.ui.workspace.reportOverlayOpen, true);
});

void test("laboratory workspace keeps import progress in project management instead of the center surface", () => {
  const state = createWorkspaceState({
    activityFeed: [
      {
        id: "evt-1",
        message: "YouTube source is being prepared",
        detail: "Fetching media streams and writing into the project source folder.",
        action: "source-download-youtube",
        stage: "running",
        percent: 42,
        timestamp: Date.now(),
        source: "host",
        kind: "activity",
        severity: "info",
        scope: "global",
        moduleId: null,
        rawLine: null,
      },
    ],
    sourceProbeStatus: "running",
    toolState: {
      tools: {
        "yt-dlp": { installed: true },
      },
    },
    source: {
      kind: "video",
      mode: "youtube",
      status: "idle",
      storedFileName: null,
      storedPath: null,
      routeLabel: null,
      metadata: {},
      drafts: {
        urlInput: "",
        youtubeUrl: "https://youtube.com/watch?v=abc123",
        youtubePreset: "custom",
        youtubeCustom: {
          format: "best[height<=720]/best",
          mergeOutputFormat: "mp4",
          recodeVideo: "none",
          audioFormat: "none",
          limitRate: "2M",
          retries: 12,
        },
      },
    },
  });
  const overlayHtml = renderLabSourcePanel(state);
  const centerHtml = renderWorkspaceSurface(state).main;

  assert.match(overlayHtml, /class="labx-source-panel"/);
  assert.match(overlayHtml, /class="labx-sp-url-overlay"/);
  assert.match(overlayHtml, /data-lab-action="project-import-local-add"/);
  assert.match(overlayHtml, /data-lab-action="project-import-check-url"/);
  assert.match(overlayHtml, /data-lab-field="project-import\.urlInput"/);
  assert.doesNotMatch(overlayHtml, /data-lab-action="project-import-kind"/);
  assert.doesNotMatch(overlayHtml, /data-lab-action="project-import-method"/);
  assert.match(overlayHtml, /class="labx-project-import__progress"[\s\S]*?42%/);
  assert.doesNotMatch(overlayHtml, /class="labx-project-import__details"/);
  assert.doesNotMatch(overlayHtml, /<img class="labx-import-review__media"/);
  assert.doesNotMatch(overlayHtml, /data-lab-field="source\.kind"/);
  assert.doesNotMatch(overlayHtml, /data-lab-field="source\.mode"/);
  assert.doesNotMatch(centerHtml, /data-lab-field="source\.kind"/);
  assert.doesNotMatch(centerHtml, /class="labx-source-bar/);
  assert.doesNotMatch(centerHtml, /class="labx-source-intake__progress"/);
  assert.doesNotMatch(
    centerHtml,
    /Fetching media streams and writing into the project source folder\./
  );
  assert.doesNotMatch(
    overlayHtml + centerHtml,
    /yt-dlp downloads the media into the project source folder and keeps the resolved preset with the project draft\./
  );
});

void test("laboratory workspace exposes one local picker and one URL checker for every media type", () => {
  const html = renderProjectWorkspaceHtml({
    source: {
      kind: "audio",
      mode: "url",
      status: "idle",
      storedFileName: null,
      storedPath: null,
      routeLabel: null,
      metadata: {},
      drafts: {
        urlInput: "https://example.com/clip.mp3",
        youtubeUrl: "",
        youtubePreset: "medium",
        youtubeCustom: {},
      },
    },
  });

  assert.match(html, /Yerel Dosya Ekle/);
  assert.match(html, /data-lab-action="project-import-local-add"/);
  assert.match(html, /data-lab-action="project-import-check-url"/);
  assert.doesNotMatch(html, /data-lab-action="project-import-url-add"/);
  assert.match(html, /data-lab-action="project-import-clear"/);
  assert.doesNotMatch(html, /data-lab-action="project-import-method"/);
  assert.match(html, /data-lab-field="project-import\.urlInput"/);
  assert.equal(html.includes("project-import." + "file" + "NameHint"), false);
});

void test("laboratory workspace surfaces missing yt-dlp after a checked YouTube URL", () => {
  const html = renderProjectWorkspaceHtml({
    toolState: { tools: {} },
    urlCheckResult: {
      url: "https://youtube.com/watch?v=abc123",
      isYoutube: true,
      kind: "video",
      preview: { title: "Evidence clip", thumbnail: "https://img.youtube.com/vi/abc123/0.jpg" },
      formats: [{ formatId: "18", label: "MP4 360p", kind: "muxed", extension: "mp4" }],
      selectedVideoFormatId: "18",
    },
    source: {
      kind: "video",
      mode: "youtube",
      status: "idle",
      storedFileName: null,
      storedPath: null,
      routeLabel: null,
      metadata: {},
      drafts: {
        urlInput: "",
        youtubeUrl: "https://youtube.com/watch?v=abc123",
        youtubePreset: "medium",
        youtubeCustom: {},
      },
    },
  });

  assert.match(html, /data-lab-action="project-import-url-add"[\s\S]*disabled/);
  assert.doesNotMatch(html, /data-lab-action="project-import-check-url"/);
  assert.match(html, /yt-dlp is required\./);
});

void test("laboratory workspace shows checked YouTube details and rich download controls", () => {
  const html = renderProjectWorkspaceHtml({
    toolState: {
      tools: {
        "yt-dlp": { installed: true },
      },
    },
    urlCheckResult: {
      url: "https://youtube.com/watch?v=abc123",
      isYoutube: true,
      kind: "video",
      preview: {
        title: "Evidence clip",
        duration: 154,
        thumbnail: "https://img.youtube.com/vi/abc123/0.jpg",
      },
      formats: [
        {
          formatId: "137",
          label: "Video 1080p",
          kind: "video",
          extension: "mp4",
          resolution: "1920x1080",
        },
        {
          formatId: "140",
          label: "Audio m4a",
          kind: "audio",
          extension: "m4a",
          bitrateKbps: 128,
        },
      ],
      selectedVideoFormatId: "137",
      selectedAudioFormatId: "140",
    },
    source: {
      kind: "video",
      mode: "youtube",
      status: "idle",
      storedFileName: null,
      storedPath: null,
      routeLabel: null,
      metadata: {},
      drafts: {
        urlInput: "",
        youtubeUrl: "https://youtube.com/watch?v=abc123",
        youtubePreset: "custom",
        youtubeCustom: {
          format: "best[height<=720]/best",
          mergeOutputFormat: "mp4",
          recodeVideo: "none",
          audioFormat: "none",
          limitRate: "2M",
          retries: 12,
        },
      },
    },
  });

  assert.match(html, /class="labx-project-import__youtube-result"/);
  assert.match(
    html,
    /class="labx-project-import__youtube-result"[\s\S]*class="labx-project-import__details"/
  );
  assert.equal((html.match(/class="labx-project-import__details"/g) ?? []).length, 1);
  assert.match(html, /data-lab-field="project-import\.youtubeVideoFormat"/);
  assert.match(html, /data-lab-field="project-import\.youtubeAudioFormat"/);
  assert.match(html, /<option value="137" selected>Video 1080p<\/option>/);
  assert.match(html, /<option value="140" selected>Audio m4a<\/option>/);
  assert.doesNotMatch(html, /class="labx-project-import__format-grid"/);
  assert.doesNotMatch(html, /class="labx-pw-inspector labx-import-review"/);
  assert.match(html, /data-lab-action="project-import-url-add"/);
  assert.doesNotMatch(html, /data-lab-action="project-import-check-url"/);
  assert.match(html, /data-lab-field="project-import\.youtubeCaptureMode"/);
  assert.doesNotMatch(html, /data-lab-field="project-import\.youtubeCustom\.format"/);
  assert.doesNotMatch(html, /data-lab-field="project-import\.youtubeCustom\.playlistItems"/);
  assert.doesNotMatch(html, /data-lab-field="project-import\.youtubeCustom\.writeSubtitles"/);
  assert.doesNotMatch(html, /data-lab-field="project-import\.youtubeCustom\.writeAutoSubtitles"/);
  assert.doesNotMatch(html, /data-lab-field="project-import\.youtubeCustom\.subtitlesLang"/);
  assert.match(html, /data-lab-field="project-import\.youtubeCustom\.mergeOutputFormat"/);
  assert.match(html, /data-lab-field="project-import\.youtubeCustom\.retries"/);
  assert.doesNotMatch(html, /data-lab-field="project-import\.youtubeCustom\.audioQuality"/);
  assert.doesNotMatch(html, /Source Import Workspace/);
  assert.doesNotMatch(html, /Kaynak Ice Aktarma Calisma Alani/);
  assert.doesNotMatch(html, />Video \/ YouTube</);
  assert.doesNotMatch(html, /data-lab-action="youtube-import-set-strategy"/);
  assert.doesNotMatch(html, /data-lab-field="youtube-import\.custom\.resolution"/);
  assert.doesNotMatch(html, /class="labx-source-intake__youtube-stack"/);
  assert.doesNotMatch(html, /data-lab-field="source\.youtubeCustom\.format"/);
  assert.doesNotMatch(
    html,
    /yt-dlp downloads the media into the project source folder and keeps the resolved preset with the project draft\./
  );
});

void test("laboratory workspace shows YouTube conversion quality only when audio conversion applies", () => {
  const enTranslations = JSON.parse(readFileSync("rooms/laboratory/i18n/en.json", "utf8")) as Record<string, unknown>;
  const trTranslations = JSON.parse(readFileSync("rooms/laboratory/i18n/tr.json", "utf8")) as Record<string, unknown>;
  const checkedYoutubeResult = {
    url: "https://youtube.com/watch?v=abc123",
    isYoutube: true,
    kind: "video",
    preview: { title: "Evidence clip" },
    formats: [
      { formatId: "137", label: "Video 1080p", kind: "video", extension: "mp4" },
      { formatId: "140", label: "Audio m4a", kind: "audio", extension: "m4a" },
    ],
    selectedVideoFormatId: "137",
    selectedAudioFormatId: "140",
  };
  const baseSource = {
    kind: "video",
    mode: "youtube",
    status: "idle",
    storedFileName: null,
    storedPath: null,
    routeLabel: null,
    metadata: {},
    drafts: {
      urlInput: "",
      youtubeUrl: "https://youtube.com/watch?v=abc123",
      youtubePreset: "custom",
      youtubeCaptureMode: "video+audio",
      youtubeCustom: {
        audioFormat: "none",
      },
    },
  };

  const keepOriginalHtml = renderProjectWorkspaceHtml({
    toolState: { tools: { "yt-dlp": { installed: true } } },
    urlCheckResult: checkedYoutubeResult,
    source: baseSource,
  });
  assert.doesNotMatch(
    keepOriginalHtml,
    /data-lab-field="project-import\.youtubeCustom\.audioQuality"/
  );

  const extractAudioHtml = renderProjectWorkspaceHtml({
    toolState: { tools: { "yt-dlp": { installed: true } } },
    urlCheckResult: checkedYoutubeResult,
    source: {
      ...baseSource,
      drafts: {
        ...baseSource.drafts,
        youtubeCustom: {
          audioFormat: "mp3",
        },
      },
    },
  });
  assert.match(extractAudioHtml, /data-lab-field="project-import\.youtubeCustom\.audioQuality"/);

  const audioOnlyHtml = renderProjectWorkspaceHtml({
    toolState: { tools: { "yt-dlp": { installed: true } } },
    urlCheckResult: checkedYoutubeResult,
    source: {
      ...baseSource,
      drafts: {
        ...baseSource.drafts,
        youtubeCaptureMode: "audio-only",
      },
    },
  });
  assert.match(audioOnlyHtml, /data-lab-field="project-import\.youtubeCustom\.audioQuality"/);
  assert.doesNotMatch(audioOnlyHtml, /data-lab-field="project-import\.youtubeVideoFormat"/);
  const enYouTubeRoot = enTranslations["mediaAnalysis"] as Record<string, unknown>;
  const trYouTubeRoot = trTranslations["mediaAnalysis"] as Record<string, unknown>;
  const enSource = enYouTubeRoot["source"] as Record<string, unknown>;
  const trSource = trYouTubeRoot["source"] as Record<string, unknown>;
  const enForm = enSource["youtubeForm"] as Record<string, unknown>;
  const trForm = trSource["youtubeForm"] as Record<string, unknown>;
  const enFields = enForm["fields"] as Record<string, unknown>;
  const trFields = trForm["fields"] as Record<string, unknown>;
  assert.equal(
    enFields["audioQuality"],
    "Conversion quality"
  );
  assert.equal(
    trFields["audioQuality"],
    "Donusturme kalitesi"
  );
});

void test("laboratory workspace hides URL check details while checking", () => {
  const store = createLabStore();
  store.dispatch({
    type: "snapshot-received",
    payload: {
      ready: true,
      featureId: "media-analysis",
      activeProjectId: "project-1",
      projects: [{ id: "project-1", name: "Draft", hasSource: false }],
      activeProject: {
        id: "project-1",
        name: "Draft",
        source: {
          kind: "video",
          mode: "youtube",
          status: "idle",
          drafts: {
            urlInput: "",
            youtubeUrl: "",
            youtubePreset: "medium",
            youtubeCustom: {},
          },
        },
        edit: {},
        profile: { preflight: {} },
        process: { records: {} },
        report: { records: {} },
      },
      sourcePresets,
      toolState: { tools: { "yt-dlp": { installed: true } } },
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
  const html = renderLabSourcePanel(store.getState());

  assert.match(html, /data-lab-action="project-import-check-url"[\s\S]*disabled/);
  assert.match(html, /YouTube format/i);
  assert.doesNotMatch(html, /class="labx-project-import__youtube-result"/);
  assert.doesNotMatch(html, /class="labx-project-import__details"/);
  assert.doesNotMatch(html, /data-lab-field="project-import\.youtubeCustom\.format"/);
  assert.doesNotMatch(html, /data-lab-field="project-import\.youtubeVideoFormat"/);
  assert.doesNotMatch(html, /data-lab-field="project-import\.youtubeAudioFormat"/);
});

void test("laboratory YouTube project import forwards selected yt-dlp streams to host args", () => {
  const runtime = createYoutubeArgsRuntime();
  const toolState = {
    ffmpeg: { installed: true },
    sourcePresets,
  };
  const project = {
    id: "project-youtube-stream-selection",
    source: {
      drafts: {
        youtubeUrl: "https://youtube.com/watch?v=abc123",
        youtubePreset: "custom",
        youtubeCaptureMode: "video-only",
        youtubeCustom: {
          format: "137",
          mergeOutputFormat: "mp4",
          recodeVideo: "none",
          playlistItems: "1-3",
          writeSubtitles: true,
          writeAutoSubtitles: true,
          subtitlesLang: "en.*",
        },
      },
    },
  };

  const videoOnlyArgs = runtime.buildYtDlpArgs(project, toolState, "/tmp/lab-source");

  assertArgPair(videoOnlyArgs, "-f", "137");
  assertArgPair(videoOnlyArgs, "--merge-output-format", "mp4");
  assert.equal(videoOnlyArgs.includes("bestvideo"), false);
  assert.equal(videoOnlyArgs.includes("--playlist-items"), false);
  assert.equal(videoOnlyArgs.includes("1-3"), false);
  assert.equal(videoOnlyArgs.includes("--write-subs"), false);
  assert.equal(videoOnlyArgs.includes("--write-auto-subs"), false);
  assert.equal(videoOnlyArgs.includes("--sub-langs"), false);
  assert.equal(videoOnlyArgs.includes("en.*"), false);
  assert.equal(videoOnlyArgs.includes("--no-playlist"), true);

  const audioOnlyArgs = runtime.buildYtDlpArgs(
    {
      ...project,
      source: {
        drafts: {
          youtubeUrl: "https://youtube.com/watch?v=abc123",
          youtubePreset: "custom",
          youtubeCaptureMode: "audio-only",
          youtubeCustom: {
            format: "140",
            audioFormat: "mp3",
            audioQuality: "2",
          },
        },
      },
    },
    toolState,
    "/tmp/lab-source"
  );

  assertArgPair(audioOnlyArgs, "-f", "140");
  assert.equal(audioOnlyArgs.includes("-x"), true);
  assertArgPair(audioOnlyArgs, "--audio-format", "mp3");
  assertArgPair(audioOnlyArgs, "--audio-quality", "2");
});

void test("laboratory workspace removes the legacy local-copy helper copy from the intake panel", () => {
  const html = renderProjectWorkspaceHtml({
    source: {
      kind: "video",
      mode: "local",
      status: "idle",
      storedFileName: null,
      storedPath: null,
      routeLabel: null,
      metadata: {},
      drafts: {
        urlInput: "",
        youtubeUrl: "",
        youtubePreset: "medium",
        youtubeCustom: {},
      },
    },
  });

  assert.match(html, /Yerel Dosya Ekle/);
  assert.match(html, /data-lab-action="project-import-local-add"/);
  assert.doesNotMatch(html, /Copy Local Source/);
  assert.doesNotMatch(
    html,
    /The selected file is copied into the active project source folder\. Your original local file stays untouched\./
  );
});

void test("laboratory controller keeps project import draft and add wiring on the active source flow", () => {
  const formActionControllerSource = readFileSync(
    "rooms/laboratory/runtime/controller/lab-form-action-controller.ts",
    "utf8"
  );
  const sourceDraftControllerSource = readFileSync(
    "rooms/laboratory/runtime/controller/lab-source-draft-controller.ts",
    "utf8"
  );
  const sourceActionControllerSource = readFileSync(
    "rooms/laboratory/runtime/controller/lab-source-action-controller.ts",
    "utf8"
  );

  assert.match(sourceDraftControllerSource, /function buildProjectImportDraftPatch/);
  assert.equal(formActionControllerSource.includes("project-import." + "file" + "NameHint"), false);
  assert.match(formActionControllerSource, /case "project-import\.urlInput":/);
  assert.match(formActionControllerSource, /case "project-import\.youtubeCaptureMode":/);
  assert.match(formActionControllerSource, /case "project-import\.youtubeVideoFormat":/);
  assert.match(formActionControllerSource, /case "project-import\.youtubeAudioFormat":/);
  assert.match(
    sourceActionControllerSource,
    /function selectProjectByValue[\s\S]*type: "project-import-reset"[\s\S]*sendMediaAction\("project-select"/
  );
  assert.match(
    formActionControllerSource,
    /case "project\.id":[\s\S]*selectProjectByValue\(String\(targetValue \|\| ""\)\)/
  );
  assert.match(
    formActionControllerSource,
    /field\.startsWith\("project-import\.youtubeCustom\."\)/
  );
  assert.match(formActionControllerSource, /type: "project-import-draft-updated"/);
  assert.match(formActionControllerSource, /type: "youtube-import-format-selected"/);
  assert.match(sourceActionControllerSource, /type: "project-import-reset"/);
  assert.match(sourceActionControllerSource, /function runProjectImportAdd/);
  assert.match(
    sourceActionControllerSource,
    /buildProjectImportHostAction\(deps\.store\.getState\(\)\)/
  );
  assert.match(sourceActionControllerSource, /buildProjectImportLocalHostAction/);
  assert.match(sourceActionControllerSource, /buildProjectImportUrlCheckAction/);
  assert.match(
    sourceActionControllerSource,
    /deps\.sendMediaAction\(importAction\.action, \{ fields: importAction\.fields \}\)/
  );
  assert.match(sourceActionControllerSource, /case "project-import-local-add":/);
  assert.match(sourceActionControllerSource, /case "project-import-check-url":/);
  assert.match(sourceActionControllerSource, /case "project-import-url-add":/);
  assert.match(sourceActionControllerSource, /case "project-import-add":/);
  assert.match(sourceActionControllerSource, /case "project-import-clear":/);
  assert.match(sourceActionControllerSource, /youtubeCustom: sourceDrafts\.youtubeCustom/);
  assert.match(sourceActionControllerSource, /case "source-youtube-preset":/);
  assert.match(formActionControllerSource, /field\.startsWith\("source\.youtubeCustom\."\)/);
  assert.match(formActionControllerSource, /mode: getDefaultSourceMode\(state, targetValue\)/);
  assert.match(formActionControllerSource, /case "source\.mode":/);
  assert.match(formActionControllerSource, /deps\.sendMediaAction\("source-set-mode"/);
  assert.doesNotMatch(formActionControllerSource, /enter-youtube-import-mode/);
  assert.match(
    sourceActionControllerSource,
    /sendMediaAction\("source-update-draft", \{\s*fields: mergeSourceDrafts\(state, patch\)/
  );
});

void test("laboratory YouTube import progress hides tool command streams", () => {
  const roomToolService = readFileSync("electron/room-tool-service.ts", "utf8");
  const progressRuntime = readFileSync(
    "rooms/laboratory/shared/host/room-tools-progress.ts",
    "utf8"
  );
  const runtimeEvents = readFileSync("rooms/laboratory/shared/host/runtime-events.ts", "utf8");

  assert.match(roomToolService, /message: "Tool run started\."/);
  assert.doesNotMatch(roomToolService, /message:\s*\(request\.args \?\? \[\]\)\.join/);
  assert.match(progressRuntime, /job\.action !== "source-download-youtube"/);
  assert.match(progressRuntime, /phaseLabel/);
  assert.match(runtimeEvents, /percent: typeof throttledPayload\["percent"\]/);
});

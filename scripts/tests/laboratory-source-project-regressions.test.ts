import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createLabStore } from "../../rooms/laboratory/runtime/lab-store.ts";
import {
  inferLabAssetContentKind,
  inferLabAssetSourceKind,
} from "../../rooms/laboratory/shared/lab-asset-kind.ts";
import { createLabI18n } from "../../rooms/laboratory/ui/lab-i18n.ts";
import { renderLabSourcePanel } from "../../rooms/laboratory/ui/lab-source-panel.ts";
import { readCssWithImports } from "./helpers/css-imports.ts";

const sourcePresets = JSON.parse(
  readFileSync("rooms/laboratory/tools/source-presets.json", "utf8")
) as Record<string, unknown>;
const ytDlpForm = JSON.parse(
  readFileSync("rooms/laboratory/tools/yt-dlp.form.json", "utf8")
) as Record<string, unknown>;

function readLabThemeSource() {
  return readCssWithImports("rooms/laboratory/ui/lab-theme.css");
}

function createSourceProjectState(
  _open: boolean,
  options: {
    activeProjectId?: string;
    assets?: Array<{
      id: string;
      type: "source" | "clip" | "frame" | "audio" | "image" | "report" | "artifact";
      name: string;
      localPath?: string;
      createdAt: number;
      metadata?: Record<string, unknown>;
      runId?: string;
    }>;
    projects?: Array<Record<string, unknown>>;
    selectedEntityIds?: string[];
  } = {}
) {
  const store = createLabStore();
  const activeProjectId = options.activeProjectId ?? "project-1";
  const projects = options.projects ?? [
    { id: "project-1", name: "Workspace Project", hasSource: true },
  ];
  store.dispatch({
    type: "snapshot-received",
    payload: {
      ready: true,
      featureId: "media-analysis",
      activeProjectId,
      projects,
      activeProject: {
        id: activeProjectId,
        name:
      String(
        (projects.find(function (project) {
          return String((project["id"] as string | undefined) ?? "") === activeProjectId;
        })?.["name"] as string | undefined) ?? "Workspace Project"
      ),
        createdAt: "2026-04-29T10:00:00.000Z",
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
        assets: [],
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
  options.assets?.forEach(function (asset) {
    store.dispatch({
      type: "asset-added",
      asset,
    });
  });
  return store.getState();
}

void test("laboratory shared asset kind helper keeps source and content routing consistent", () => {
  const baseAsset = {
    id: "asset-1",
    createdAt: 0,
    type: "artifact" as const,
  };

  assert.equal(
    inferLabAssetSourceKind({
      ...baseAsset,
      name: "camera-archive.avi",
      localPath: "/tmp/camera-archive.avi",
    }),
    "video"
  );
  assert.equal(
    inferLabAssetSourceKind({
      ...baseAsset,
      name: "evidence.mpeg",
      url: "https://example.test/evidence.mpeg",
    }),
    "video"
  );
  assert.equal(
    inferLabAssetSourceKind({
      ...baseAsset,
      name: "voice-note.webm",
      metadata: {
        sourceKind: "audio",
      },
    }),
    "audio"
  );
  assert.equal(
    inferLabAssetSourceKind({
      ...baseAsset,
      type: "audio",
      name: "captured-voice.webm",
      localPath: "/tmp/captured-voice.webm",
    }),
    "audio"
  );
  assert.equal(
    inferLabAssetSourceKind({
      ...baseAsset,
      type: "source",
      name: "imported-image.png",
      localPath: "/tmp/imported-image.png",
    }),
    "image"
  );
  assert.equal(
    inferLabAssetContentKind({
      ...baseAsset,
      name: "analysis-report.md",
      localPath: "/tmp/analysis-report.md",
    }),
    "document"
  );
});

void test("laboratory source project management owns controls without the retired workspace overlay", () => {
  const state = createSourceProjectState(true);
  const sourcePanel = renderLabSourcePanel(state);

  assert.match(sourcePanel, /class="labx-source-panel"/);
  assert.match(sourcePanel, /data-lab-action="project-import-local-add"/);
  assert.match(sourcePanel, /data-lab-action="project-import-check-url"/);
  assert.match(sourcePanel, /data-lab-action="project-import-clear"/);
  assert.doesNotMatch(sourcePanel, /data-lab-action="project-workspace-close"/);
  assert.doesNotMatch(sourcePanel, /data-lab-action="project-import-kind"/);
  assert.doesNotMatch(sourcePanel, /data-lab-action="project-import-method"/);
  assert.equal(sourcePanel.includes("project-import." + "file" + "NameHint"), false);
  assert.doesNotMatch(sourcePanel, /class="labx-pw-nav__intake"/);
  assert.doesNotMatch(sourcePanel, /data-lab-field="source\.kind"/);
  assert.doesNotMatch(sourcePanel, /data-lab-field="workspace\.hypothesis"/);
  assert.doesNotMatch(sourcePanel, /data-lab-field="project-workspace-sort"/);
  assert.doesNotMatch(sourcePanel, /data-lab-field="project-workspace-filter"/);
  assert.doesNotMatch(sourcePanel, /data-lab-field="project-workspace-group"/);
  assert.doesNotMatch(sourcePanel, /data-lab-field="project-workspace-search"/);
  assert.doesNotMatch(sourcePanel, /class="labx-pw-inspector/);
  assert.doesNotMatch(sourcePanel, /class="labx-pw-bar/);
});

void test("laboratory source project management keeps the active source-less project navigable", () => {
  const html = renderLabSourcePanel(
    createSourceProjectState(true, {
      activeProjectId: "project-draft-active",
      projects: [
        { id: "project-1", name: "Workspace Project", hasSource: true },
        { id: "project-draft-active", name: "Draft Intake", hasSource: false },
        { id: "project-draft-hidden", name: "Hidden Draft", hasSource: false },
      ],
    })
  );

  assert.match(html, /Workspace Project/);
  assert.match(html, /Draft Intake/);
  assert.match(html, /data-lab-action="project-create"/);
  assert.match(html, /data-lab-action="project-delete"/);
  assert.doesNotMatch(html, /Hidden Draft/);
});

void test("laboratory source project controls skip redundant button dispatches", () => {
  const source = readFileSync("rooms/laboratory/runtime/lab-run-controller.ts", "utf8");
  const sourceActionControllerSource = readFileSync(
    "rooms/laboratory/runtime/controller/lab-source-action-controller.ts",
    "utf8"
  );

  assert.match(sourceActionControllerSource, /state\.ui\.projectImport\.activeKind !== kind/);
  assert.match(
    sourceActionControllerSource,
    /state\.ui\.projectImport\.methods\[activeKind\] !== method/
  );
  assert.doesNotMatch(sourceActionControllerSource, /youtube-import-set-strategy/);
  assert.doesNotMatch(source, /projectWorkspaceSelectedEntityIds/);
  assert.doesNotMatch(source, /projectWorkspaceSort/);
  assert.doesNotMatch(source, /projectWorkspaceFilter/);
  assert.doesNotMatch(source, /projectWorkspaceGroup/);
});

void test("laboratory source panel renders localized asset groups and context actions", () => {
  const trTranslations = JSON.parse(readFileSync("rooms/laboratory/i18n/tr.json", "utf8")) as Record<string, unknown>;
  const trCopy = createLabI18n({ locale: "tr", translations: trTranslations });
  const html = renderLabSourcePanel(
    createSourceProjectState(true, {
      assets: [
        {
          id: "asset-source-1",
          type: "source",
          name: "source.mp4",
          localPath: "/tmp/source.mp4",
          createdAt: 100,
          metadata: { duration: 61, selectionStartMs: 1000, selectionEndMs: 3000 },
        },
        {
          id: "asset-clip-1",
          type: "clip",
          name: "clip.mp4",
          localPath: "/tmp/clip.mp4",
          createdAt: 200,
        },
        {
          id: "asset-frame-1",
          type: "frame",
          name: "frame.png",
          localPath: "/tmp/frame.png",
          createdAt: 300,
        },
        {
          id: "asset-audio-1",
          type: "audio",
          name: "audio.wav",
          localPath: "/tmp/audio.wav",
          createdAt: 400,
        },
        {
          id: "asset-image-1",
          type: "image",
          name: "image.png",
          localPath: "/tmp/image.png",
          createdAt: 500,
        },
        {
          id: "asset-report-1",
          type: "report",
          name: "report.md",
          localPath: "/tmp/report.md",
          createdAt: 600,
          metadata: { findingCount: 2 },
        },
        {
          id: "asset-artifact-1",
          type: "artifact",
          name: "artifact.json",
          localPath: "/tmp/artifact.json",
          createdAt: 700,
        },
      ],
      selectedEntityIds: ["asset-source-1", "asset-report-1"],
    }),
    trCopy
  );

  assert.match(html, /Kaynaklar/);
  assert.match(html, /Klipler/);
  assert.match(html, /Kareler/);
  assert.match(html, /Sesler/);
  assert.doesNotMatch(html, /Goruntuler/);
  assert.match(html, /Raporlar/);
  assert.match(html, /data-group-type="artifact"/);
  assert.match(html, /class="labx-sp-asset__thumb" data-kind="video"/);
  assert.match(html, /class="labx-sp-asset__thumb" data-kind="image"/);
  assert.match(html, /class="labx-sp-asset__badge labx-sp-asset__badge--audio"/);
  assert.match(html, /&sung;/);
  assert.match(html, /data-extension="md">MD<\/span>/);
  assert.match(html, /data-extension="json">JSON<\/span>/);
  assert.doesNotMatch(html, />SRC<\/span>/);
  assert.doesNotMatch(html, />AUD<\/span>/);
  assert.match(html, /report\.md/);
  assert.match(html, /artifact\.json/);
  assert.doesNotMatch(html, /secili/);
  assert.match(html, /data-lab-action="workspace-asset-select"/);
  assert.doesNotMatch(html, /data-lab-action="workspace-content-open"/);
  assert.doesNotMatch(html, /data-lab-action="source-activate-asset"/);
  assert.match(html, /data-lab-action="open-document-overlay" data-lab-value="asset-artifact-1"/);
  assert.match(html, /data-lab-action="open-report-overlay" data-lab-value="user"/);
  assert.doesNotMatch(html, /data-lab-action="asset-use-as-source"/);
  assert.match(html, /data-lab-action="asset-remove"/);
});

void test("laboratory source panel keeps selected assets separate from import progress review state", () => {
  const state = createSourceProjectState(true, {
    assets: [
      {
        id: "asset-image-1",
        type: "image",
        name: "selected-image.png",
        localPath: "/tmp/selected-image.png",
        createdAt: 500,
      },
    ],
    selectedEntityIds: ["asset-image-1"],
  });
  state.sourceProbeStatus = "completed";
  state.ui.projectImport.reviewFocus = "completed";
  state.ui.projectImport.lastAction = "source-pick-local";
  state.ui.projectImport.lastRequestId = "req-old-import";

  const html = renderLabSourcePanel(state);

  assert.match(html, /selected-image\.png/);
  assert.doesNotMatch(html, /Import Review/);
  assert.doesNotMatch(html, /class="labx-pw-inspector/);
});

void test("laboratory source panel keeps draft review content separate from committed source preview", () => {
  const state = createSourceProjectState(true);
  state.source = {
    kind: "video",
    mode: "local",
    status: "ready",
    storedFileName: "existing-source.mp4",
    storedPath: "/tmp/existing-source.mp4",
    previewUrl: "file:///tmp/existing-source.mp4",
    metadata: { durationSeconds: 99 },
  };
  state.ui.projectImport.activeKind = "image";
  state.ui.projectImport.reviewFocus = "draft";

  const html = renderLabSourcePanel(state);

  assert.doesNotMatch(html, /Import Review/);
  assert.doesNotMatch(html, /existing-source\.mp4/);
  assert.doesNotMatch(html, /file:\/\/\/tmp\/existing-source\.mp4/);
  assert.doesNotMatch(html, /1:39/);
});

void test("laboratory source panel hides download for assets without a file target", () => {
  const html = renderLabSourcePanel(
    createSourceProjectState(true, {
      assets: [
        {
          id: "asset-artifact-1",
          type: "artifact",
          name: "virtual artifact",
          createdAt: 700,
        },
      ],
      selectedEntityIds: ["asset-artifact-1"],
    })
  );

  assert.match(html, /virtual artifact/);
  assert.match(html, /data-lab-action="workspace-asset-select"/);
  assert.doesNotMatch(html, /data-lab-action="asset-download"/);
});

void test("laboratory source panel renders video source assets as workspace content rows", () => {
  const html = renderLabSourcePanel(
    createSourceProjectState(true, {
      assets: [
        {
          id: "asset-source-1",
          type: "source",
          name: "CGI Analizi -1.mp4",
          localPath: "/tmp/CGI Analizi -1.mp4",
          createdAt: 700,
          metadata: { kind: "video" },
        },
      ],
      selectedEntityIds: ["asset-source-1"],
    })
  );

  assert.match(html, /data-asset-type="source"/);
  assert.match(html, /CGI Analizi -1\.mp4/);
  assert.match(html, /data-lab-action="workspace-asset-select"/);
  assert.doesNotMatch(html, /data-lab-action="source-activate-asset"/);
  assert.doesNotMatch(html, /data-lab-action="asset-use-as-source"/);
  assert.match(html, /class="labx-sp-asset__thumb" data-kind="video"/);
  assert.doesNotMatch(html, /class="labx-pw-card__thumb-img/);
  assert.doesNotMatch(html, /class="labx-pw-inspector__preview-media/);
});

void test("laboratory source panel renders visual analysis artifacts as asset rows", () => {
  const html = renderLabSourcePanel(
    createSourceProjectState(true, {
      assets: [
        {
          id: "asset-artifact-preview-1",
          type: "artifact",
          name: "contrast-scan.png",
          localPath: "/tmp/lab-analysis-contrast-scan.png",
          createdAt: 800,
          metadata: { kind: "transform-preview" },
        },
      ],
      selectedEntityIds: ["asset-artifact-preview-1"],
    })
  );

  assert.match(html, /data-asset-type="artifact"/);
  assert.match(html, /contrast-scan\.png/);
  assert.match(html, /data-lab-action="asset-download"/);
  assert.match(html, /data-lab-action="asset-remove"/);
  assert.doesNotMatch(html, /class="labx-pw-card__thumb-img/);
  assert.doesNotMatch(html, /class="labx-pw-inspector__preview/);
});

void test("laboratory source project management i18n keys exist in English and Turkish catalogs", () => {
  const enTranslations = JSON.parse(readFileSync("rooms/laboratory/i18n/en.json", "utf8")) as Record<string, unknown>;
  const trTranslations = JSON.parse(readFileSync("rooms/laboratory/i18n/tr.json", "utf8")) as Record<string, unknown>;
  const sourceFiles = [
    "rooms/laboratory/ui/lab-source-panel.ts",
    "rooms/laboratory/ui/project-source-import.ts",
  ];
  const keys = new Set<string>();

  sourceFiles.forEach(function (filePath) {
    const source = readFileSync(filePath, "utf8");
    for (const match of source.matchAll(
      /copy\.t\("((?:mediaAnalysis\.(?:sourcePanel|projectImport))[^"]+)"/g
    )) {
      keys.add(match[1] as string);
    }
  });

  function readPath(record: Record<string, unknown>, key: string): unknown {
    return key.split(".").reduce<unknown>(function (current, part) {
      return current != null && typeof current === "object"
        ? (current as Record<string, unknown>)[part]
        : undefined;
    }, record);
  }

  assert.equal(readPath(enTranslations, "mediaAnalysis.projectWorkspace"), undefined);
  assert.equal(readPath(trTranslations, "mediaAnalysis.projectWorkspace"), undefined);
  assert.ok(keys.has("mediaAnalysis.sourcePanel.project.managementTitle"));
  assert.ok(keys.has("mediaAnalysis.projectImport.review.metadataName"));
  keys.forEach(function (key) {
    assert.equal(typeof readPath(enTranslations, key), "string", key);
    assert.equal(typeof readPath(trTranslations, key), "string", key);
  });
});

void test("laboratory source management css keeps active import styles without retired shell styles", () => {
  const styleSource = readFileSync("rooms/laboratory/ui/style.css", "utf8");
  const sourceImportCss = readFileSync("rooms/laboratory/ui/styles/lab-source-import.css", "utf8");
  const themeSource = readLabThemeSource();

  assert.match(styleSource, /@import "\.\/styles\/lab-source-import\.css";/);
  assert.doesNotMatch(sourceImportCss, /\.labx-pw-/);
  assert.doesNotMatch(sourceImportCss, /\.labx-import-review/);
  assert.doesNotMatch(sourceImportCss, /\.labx-import-/);
  assert.doesNotMatch(sourceImportCss, /\.labx-strategy-/);
  assert.match(sourceImportCss, /\.labx-project-import__progress\s*\{[\s\S]*display:\s*grid;/);
  assert.match(
    sourceImportCss,
    /\.labx-project-import__youtube-preview\s*\{[\s\S]*display:\s*grid;/
  );
  assert.match(sourceImportCss, /\.labx-project-import__yt-controls\s*\{[\s\S]*display:\s*grid;/);
  assert.match(sourceImportCss, /\.labx-project-import__yt-field\s*\{[\s\S]*display:\s*grid;/);
  assert.doesNotMatch(sourceImportCss, /\.labx-advanced-settings/);
  assert.doesNotMatch(themeSource, /\.labx-top-bar__project-btn\s*\{/);
  assert.match(themeSource, /\.labx-timeline__highlight\s*\{/);
  assert.match(
    themeSource,
    /\.labx-drawer__mode-nav \.labx-topbar-pill\s*\{[\s\S]*border:\s*var\(--lab-rail-processing-px-1\) solid var\(--lab-border-subtle\);[\s\S]*background:\s*var\(--lab-surface-2\);/
  );
  assert.match(
    themeSource,
    /\.lab-selection-panel--drawer \.lab-selection-panel__suggestion,[\s\S]*border-color:\s*var\(--lab-border-default\);[\s\S]*background:\s*var\(--lab-surface-3\);/
  );
  assert.match(
    themeSource,
    /\.lab-selection-panel--drawer \.lab-selection-panel__intent-pill\.is-active,[\s\S]*background:\s*var\(--lab-accent-bg-strong\);/
  );
  assert.match(
    themeSource,
    /\.lab-interpretation-panel\s*\{[\s\S]*border:\s*var\(--lab-workspace-px-1\) solid var\(--lab-border-default\);[\s\S]*background:[\s\S]*var\(--lab-surface-2\);/
  );
  assert.match(
    themeSource,
    /\.lab-interpretation-panel__item\s*\{[\s\S]*grid-template-columns:\s*var\(--lab-workspace-rem-1-8\) minmax\(0, 1fr\);[\s\S]*border-left-color:\s*var\(--lab-border-accent\);/
  );
  assert.match(
    themeSource,
    /\.lab-interpretation-panel__recommendation\s*\{[\s\S]*background:\s*var\(--lab-surface-1\);[\s\S]*color:\s*var\(--lab-text-default\);/
  );
});

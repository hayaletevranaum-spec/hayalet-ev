import { assert, test } from "./laboratory-runtime-truth.helpers.ts";
import type { LabPersistedState } from "../../rooms/laboratory/domain/lab-types.ts";
import {
  loadLabPersistedState,
  saveLabPersistedState,
} from "../../rooms/laboratory/runtime/lab-persistence.ts";

void test("laboratory persistence stores only boot-safe state and skips transient rewrites", () => {
  const storage = new Map<string, string>();
  let writes = 0;
  const windowRef = {
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        writes += 1;
        storage.set(key, value);
      },
    },
  } as unknown as Window & typeof globalThis;

  const persisted = {
    schemaVersion: 4,
    selectedCapabilities: ["visual"],
    projectIndex: {
      activeProjectId: "project-active",
      projects: [{ id: "project-active", name: "Active Project" }],
    },
    workbench: {
      activeModuleId: "media-analysis",
      activePreviewArtifactId: "preview-active",
    },
    source: {
      kind: "video",
      status: "ready",
      previewUrl: "blob:active-source",
      storedPath: "/tmp/active.mp4",
    },
    sourceProbeStatus: "completed",
    editConfig: { output: "preview" },
    profileConfig: { preflight: { status: "ready" } },
    preflight: { status: "ready" },
    lastRun: { id: "run-active", state: "completed" },
    reports: { user: { summary: "active" }, ai: null, emptyReason: null },
    reportExports: [{ id: "report-active" }],
    assets: [{ id: "asset-active", type: "source" }],
    profileModels: [{ modelId: "model-active" }],
    toolState: { ffmpeg: { installed: true } },
    activityFeed: [{ id: "event-active", message: "active" }],
    activePreviewArtifactId: "preview-active",
    sourceDrafts: {
      urlInput: "https://example.test/video.mp4",
    },
    workspace: {
      timelineStartMs: 1000,
      timelineEndMs: 2500,
      activeSelection: { id: "selection-active" },
      roiRegions: [{ id: "roi-active" }],
      hypothesis: "transient hypothesis",
      previewVolume: 0.42,
      controlsDrawerTab: "operations",
      drawerCollapsed: true,
      activeIconRailSlot: "stabilize",
    },
  } as unknown as LabPersistedState;

  saveLabPersistedState(windowRef, persisted);
  assert.equal(writes, 1);

  const raw = storage.get("hayalet-ev:laboratory-refactor:v4");
  assert.ok(raw);
  const saved = JSON.parse(raw) as Record<string, unknown>;
  assert.deepEqual(saved["selectedCapabilities"], []);
  assert.deepEqual(saved["assets"], []);
  assert.deepEqual(saved["reportExports"], []);
  assert.deepEqual(saved["profileModels"], []);
  assert.deepEqual(saved["toolState"], {});
  assert.deepEqual(saved["activityFeed"], []);
  assert.equal(saved["lastRun"], null);
  assert.equal(saved["activePreviewArtifactId"], null);

  const workspace = saved["workspace"] as Record<string, unknown>;
  assert.equal("timelineStartMs" in workspace, false);
  assert.equal("timelineEndMs" in workspace, false);
  assert.equal("activeSelection" in workspace, false);
  assert.equal("roiRegions" in workspace, false);
  assert.equal("hypothesis" in workspace, false);
  assert.equal(workspace["previewVolume"], 0.42);
  assert.equal(workspace["controlsDrawerTab"], "operations");
  assert.equal(workspace["drawerCollapsed"], true);
  assert.equal(workspace["activeIconRailSlot"], "stabilize");

  const transientOnlyChange = structuredClone(persisted);
  const transientWorkspace = transientOnlyChange.workspace as NonNullable<
    LabPersistedState["workspace"]
  >;
  transientWorkspace.timelineStartMs = 3000;
  transientWorkspace.timelineEndMs = 4500;
  transientWorkspace.hypothesis = "another transient hypothesis";
  saveLabPersistedState(windowRef, transientOnlyChange);
  assert.equal(writes, 1);

  const durableChange = structuredClone(transientOnlyChange);
  const durableWorkspace = durableChange.workspace as NonNullable<
    LabPersistedState["workspace"]
  >;
  durableWorkspace.previewVolume = 0.75;
  saveLabPersistedState(windowRef, durableChange);
  assert.equal(writes, 2);

  const loaded = loadLabPersistedState(windowRef) as Record<string, unknown>;
  const loadedWorkspace = loaded["workspace"] as Record<string, unknown>;
  assert.equal(loadedWorkspace["previewVolume"], 0.75);
  assert.equal("timelineStartMs" in loadedWorkspace, false);
});

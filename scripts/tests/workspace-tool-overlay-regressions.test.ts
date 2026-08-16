import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

async function readProjectFile(relativePath: string): Promise<string> {
  return await readFile(path.join(ROOT, relativePath), "utf8");
}

void test("workspace tool runtime exposes central open close and state events", async () => {
  const runtime = await readProjectFile("src/js/ui/workspace-tool-overlay.ts");

  assert.match(runtime, /WORKSPACE_TOOL_OPEN_EVENT/);
  assert.match(runtime, /WORKSPACE_TOOL_CLOSE_EVENT/);
  assert.match(runtime, /WORKSPACE_TOOL_STATE_EVENT/);
  assert.match(runtime, /toggleWorkspaceToolPage/);
  assert.match(runtime, /syncWorkspaceToolState/);
});

void test("topbar entrypoints route through the workspace tool runtime and external page helpers stay navigation-only", async () => {
  const topbarBindings = await readProjectFile("src/js/app/topbar-tool-overlays.ts");
  const externalPage = await readProjectFile("src/js/pages/shared/external-page.ts");
  const sceneNavigation = await readProjectFile("src/js/scene/navigation.ts");
  const navigation = await readProjectFile("src/js/app/navigation.ts");

  assert.match(topbarBindings, /setupTopbarWorkspaceTools/);
  assert.match(topbarBindings, /toggleWorkspaceToolPage/);
  assert.match(sceneNavigation, /openSceneWorkspaceTool/);
  assert.match(sceneNavigation, /openWorkspaceToolPage/);
  assert.doesNotMatch(externalPage, /openWorkspaceToolPage/);
  assert.doesNotMatch(externalPage, /closeWorkspaceToolPage/);
  assert.doesNotMatch(externalPage, /openExternalToolPage/);
  assert.doesNotMatch(externalPage, /closeExternalPage/);
  assert.doesNotMatch(externalPage, /settings-hub:open/);
  assert.doesNotMatch(sceneNavigation, /openSceneTool/);
  assert.doesNotMatch(navigation, /"settings", "archives", "whisper"/);
});

void test("settings lifecycle and workspace tool controllers no longer depend on settings-hub state-change", async () => {
  const settingsController = await readProjectFile("src/js/pages/settings/controller.ts");
  const backupPanel = await readProjectFile("src/js/pages/settings/panels/backup.ts");
  const roomsPanel = await readProjectFile("src/js/pages/settings/panels/rooms.ts");
  const liveLogOverlay = await readProjectFile("src/js/pages/settings/live-log/overlay.ts");
  const whisperController = await readProjectFile("src/js/pages/whisper/page-controller.ts");
  const archivesController = await readProjectFile("src/js/pages/archives/controller.ts");

  assert.match(settingsController, /registerSettingsPanelLifecycle/);
  assert.match(settingsController, /mountElementInOverlayHostLayer\(this\.page, OVERLAY_SURFACE_FAMILIES\.workspaceTool\)/);
  assert.match(settingsController, /workspace-tool-settings/);
  assert.match(backupPanel, /registerSettingsPanelLifecycle\("backup"/);
  assert.match(roomsPanel, /registerSettingsPanelLifecycle\("rooms"/);
  assert.match(liveLogOverlay, /registerSettingsPanelLifecycle\("live-log"/);
  assert.match(whisperController, /mountElementInOverlayHostLayer\(this\.pageRoot, OVERLAY_SURFACE_FAMILIES\.workspaceTool\)/);
  assert.match(whisperController, /workspace-tool-whisper/);
  assert.match(archivesController, /mountElementInOverlayHostLayer\(this\.overlayEl, OVERLAY_SURFACE_FAMILIES\.workspaceTool\)/);
  assert.match(archivesController, /workspace-tool-archives/);
  assert.doesNotMatch(backupPanel, /settings-hub:state-change/);
  assert.doesNotMatch(roomsPanel, /settings-hub:state-change/);
  assert.doesNotMatch(liveLogOverlay, /settings-hub:state-change/);
});

void test("scene controllers open workspace tools directly and do not depend on the scene-tool event bus", async () => {
  const entranceScene = await readProjectFile("src/js/pages/entrance/scene/scene-controller.ts");
  const analyzeController = await readProjectFile("src/js/pages/analyze.ts");
  const whisperController = await readProjectFile("src/js/pages/whisper/page-controller.ts");
  const archivesController = await readProjectFile("src/js/pages/archives/controller.ts");

  assert.match(entranceScene, /openSceneWorkspaceTool\("whisper"\)/);
  assert.match(analyzeController, /openSceneWorkspaceTool\("archives"\)/);
  assert.doesNotMatch(entranceScene, /SCENE_TOOL_/);
  assert.doesNotMatch(analyzeController, /SCENE_TOOL_/);
  assert.doesNotMatch(whisperController, /SCENE_TOOL_/);
  assert.doesNotMatch(archivesController, /SCENE_TOOL_/);
});

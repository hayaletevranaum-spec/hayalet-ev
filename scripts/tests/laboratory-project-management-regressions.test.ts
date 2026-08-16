import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createLabStore } from "../../rooms/laboratory/runtime/lab-store.ts";
import { renderLabSourcePanel } from "../../rooms/laboratory/ui/lab-source-panel.ts";
import { renderLabTopBar } from "../../rooms/laboratory/ui/lab-top-bar.ts";

function hydrateState(overrides: {
  activeProjectId: string | null;
  projects: Array<Record<string, unknown>>;
  source: Record<string, unknown> | null;
  sourceProbeStatus?: "idle" | "running" | "completed" | "failed";
}) {
  const store = createLabStore();
  store.dispatch({
    type: "hydrate",
    payload: {
      featureId: "media-analysis",
      projectIndex: {
        activeProjectId: overrides.activeProjectId,
        projects: overrides.projects,
      },
      workbench: {
        activeModuleId: "media-analysis",
        availableModuleIds: ["media-analysis", "audio-analysis"],
        selectedModuleIds: ["media-analysis"],
      },
      source:
        overrides.source ??
        ({
          status: "idle",
          kind: "video",
          mode: "local",
          storedFileName: null,
          routeLabel: null,
        }),
      sourceProbeStatus: overrides.sourceProbeStatus ?? "idle",
      reports: {
        user: null,
        ai: null,
        emptyReason: "Rapor henüz üretilmedi.",
      },
      activityFeed: [],
    },
  });
  return store.getState();
}

void test("laboratory top bar delegates project management to the source panel", () => {
  const state = hydrateState({
    activeProjectId: "draft-1",
    projects: [
      { id: "draft-1", name: "Lab Session 2026-04-21 11:00", hasSource: false },
      { id: "project-1", name: "2026-04-20 18-30 - evidence.mp4", hasSource: true },
    ],
    source: {
      status: "idle",
      kind: "video",
      mode: "local",
      storedFileName: null,
      routeLabel: null,
    },
  });
  const html = renderLabTopBar(state);
  const sourcePanel = renderLabSourcePanel(state);

  assert.match(html, /data-lab-action="source-panel-toggle"/);
  assert.doesNotMatch(html, /data-lab-action="project-workspace-open"/);
  assert.doesNotMatch(html, /Project Management/);
  assert.doesNotMatch(html, /Lab Session 2026-04-21 11:00/);
  assert.doesNotMatch(html, /data-lab-field="project\.id"/);
  assert.doesNotMatch(html, /<select/);
  assert.doesNotMatch(html, /2026-04-20 18-30 - evidence\.mp4/);
  assert.doesNotMatch(html, /workspace\.projectName/);
  assert.doesNotMatch(html, /toggle-report-view/);
  assert.match(sourcePanel, /data-lab-field="project\.id"/);
  assert.match(sourcePanel, /Lab Session 2026-04-21 11:00/);
  assert.match(sourcePanel, /2026-04-20 18-30 - evidence\.mp4/);
  assert.match(sourcePanel, /data-lab-action="project-create"/);
  assert.match(sourcePanel, /data-lab-action="project-delete"/);
});

void test("laboratory source panel owns the active project selector", () => {
  const state = hydrateState({
    activeProjectId: "project-1",
    projects: [{ id: "project-1", name: "2026-04-20 18-30 - evidence.mp4", hasSource: true }],
    source: {
      status: "ready",
      kind: "video",
      mode: "local",
      storedFileName: "evidence.mp4",
      routeLabel: "Local copy",
    },
    sourceProbeStatus: "completed",
  });
  const html = renderLabTopBar(state);
  const sourcePanel = renderLabSourcePanel(state);

  assert.doesNotMatch(html, /data-lab-action="project-workspace-open"/);
  assert.doesNotMatch(html, /Project Management/);
  assert.doesNotMatch(html, /2026-04-20 18-30 - evidence\.mp4/);
  assert.doesNotMatch(html, /data-lab-field="project\.id"/);
  assert.match(html, /data-lab-action="toggle-tool-manager"/);
  assert.match(sourcePanel, /data-lab-field="project\.id"/);
  assert.match(sourcePanel, /2026-04-20 18-30 - evidence\.mp4/);
});

void test("laboratory controller starts clean projects and keeps naming/delete safeguards", () => {
  const source = readFileSync("rooms/laboratory/runtime/lab-run-controller.ts", "utf8");
  const sourceDraftControllerSource = readFileSync(
    "rooms/laboratory/runtime/controller/lab-source-draft-controller.ts",
    "utf8"
  );
  const sourceActionControllerSource = readFileSync(
    "rooms/laboratory/runtime/controller/lab-source-action-controller.ts",
    "utf8"
  );
  const assetActionControllerSource = readFileSync(
    "rooms/laboratory/runtime/controller/lab-asset-action-controller.ts",
    "utf8"
  );
  const hostSource = readFileSync(
    "rooms/laboratory/features/media-analysis/host/action-handlers-project.ts",
    "utf8"
  );
  const lifecycleSource = readFileSync("rooms/laboratory/shared/host/project-lifecycle.ts", "utf8");

  assert.match(sourceActionControllerSource, /buildAutoProjectName,/);
  assert.match(sourceDraftControllerSource, /function buildEmptySourceState\(/);
  assert.match(sourceActionControllerSource, /function startCleanProjectSession\(\)/);
  assert.match(sourceActionControllerSource, /if \(projectValue === "new"\)/);
  assert.match(source, /case "project-create":/);
  assert.match(sourceActionControllerSource, /const resetSourceState = buildEmptySourceState\(state\);/);
  assert.match(sourceActionControllerSource, /type: "source-config-patched",\s*patch: resetSourceState/);
  assert.match(
    sourceActionControllerSource,
    /type: "source-drafts-updated",\s*patch: resetSourceState\.drafts/
  );
  assert.match(sourceActionControllerSource, /type: "source-drafts-committed"/);
  assert.match(sourceActionControllerSource, /sendMediaAction\("project-create"\)/);
  assert.match(assetActionControllerSource, /function removeAssetsWithConfirmation\(/);
  assert.doesNotMatch(source, /findBlankProjectId/);
  assert.doesNotMatch(source, /hasActiveSource/);
  assert.match(
    sourceActionControllerSource,
    /sendMediaAction\("project-rename", \{\s*name: buildAutoProjectName\(/
  );
  assert.match(sourceActionControllerSource, /deps\.windowRef\.confirm\(/);
  assert.match(hostSource, /rawResetSourceState = actionPayload\["resetSourceState"\]/);
  assert.match(hostSource, /await patchActiveProject\(runtime, function \(project\) \{/);
  assert.match(hostSource, /source: \{\s*\.\.\.resetSourceState,\s*\}/);
  assert.match(lifecycleSource, /function pruneEmptyDraftProjects\(/);
  assert.match(lifecycleSource, /function isEmptyProjectDraft\(/);
  assert.match(lifecycleSource, /operation: "delete-path"/);
  assert.match(lifecycleSource, /recursive: true/);
});

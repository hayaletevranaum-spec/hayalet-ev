import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { validateRoomManifest } from "../../src/types/rooms.ts";

const requiredForgeFiles = [
  "rooms/forge-room/manifest.json",
  "rooms/forge-room/host/index.ts",
  "rooms/forge-room/host/runtime.ts",
  "rooms/forge-room/host/forge-breakdown-runtime.ts",
  "rooms/forge-room/host/forge-capability-selector.ts",
  "rooms/forge-room/host/forge-session-storage.ts",
  "rooms/forge-room/host/forge-handoff-export.ts",
  "rooms/forge-room/host/forge-operator-profile-storage.ts",
  "rooms/forge-room/host/forge-preflight-invalidation.ts",
  "rooms/forge-room/host/forge-preflight-metadata.ts",
  "rooms/forge-room/host/forge-preflight-runtime.ts",
  "rooms/forge-room/host/forge-runtime-support.ts",
  "rooms/forge-room/host/forge-run-signature.ts",
  "rooms/forge-room/host/forge-synthesis-runtime.ts",
  "rooms/forge-room/host/forge-task-editor-runtime.ts",
  "rooms/forge-room/host/forge-task-runtime.ts",
  "rooms/forge-room/host/state/forge-runtime-state.ts",
  "rooms/forge-room/host/state/forge-runtime-reducer.ts",
  "rooms/forge-room/shared/forge-constants.ts",
  "rooms/forge-room/shared/data/persona-presets.ts",
  "rooms/forge-room/shared/data/role-catalog.ts",
  "rooms/forge-room/shared/types/forge-goal.ts",
  "rooms/forge-room/shared/types/forge-handoff.ts",
  "rooms/forge-room/shared/types/forge-preflight.ts",
  "rooms/forge-room/shared/types/forge-session.ts",
  "rooms/forge-room/shared/types/forge-workflow.ts",
  "rooms/forge-room/shared/ui/host-messages.ts",
  "rooms/forge-room/shared/ui/request-runtime.ts",
  "rooms/forge-room/shared/ui/state.ts",
  "rooms/forge-room/ui/index.html",
  "rooms/forge-room/ui/index.ts",
  "rooms/forge-room/ui/forge-room-ui-runtime.ts",
  "rooms/forge-room/ui/panels/draft-breakdown-panel.ts",
  "rooms/forge-room/ui/panels/approved-tasks-panel.ts",
  "rooms/forge-room/ui/panels/operator-profile-manager-panel.ts",
  "rooms/forge-room/ui/panels/panel-shell.ts",
  "rooms/forge-room/ui/panels/responses-panel.ts",
  "rooms/forge-room/ui/panels/synthesis-panel.ts",
  "rooms/forge-room/ui/panels/workbench-stage-panel.ts",
  "rooms/forge-room/shared/assets/room-background.svg",
  "rooms/forge-room/main-functions/forge-workbench/assets/forge-workbench-view.svg",
  "rooms/forge-room/main-functions/forge-workbench/protocols/forge-room-breakdown-architect.md",
  "rooms/forge-room/main-functions/forge-workbench/protocols/forge-room-preflight-pre-analysis.md",
  "rooms/forge-room/main-functions/forge-workbench/protocols/forge-room-synthesis.md",
  "rooms/forge-room/main-functions/forge-workbench/protocols/forge-room-task-response.md",
  "rooms/forge-room/main-functions/forge-workbench/protocols/en/forge-room-breakdown-architect.md",
  "rooms/forge-room/main-functions/forge-workbench/protocols/en/forge-room-preflight-pre-analysis.md",
  "rooms/forge-room/main-functions/forge-workbench/protocols/en/forge-room-synthesis.md",
  "rooms/forge-room/main-functions/forge-workbench/protocols/en/forge-room-task-response.md",
  "rooms/forge-room/main-functions/forge-workbench/protocols/tr/forge-room-breakdown-architect.md",
  "rooms/forge-room/main-functions/forge-workbench/protocols/tr/forge-room-preflight-pre-analysis.md",
  "rooms/forge-room/main-functions/forge-workbench/protocols/tr/forge-room-synthesis.md",
  "rooms/forge-room/main-functions/forge-workbench/protocols/tr/forge-room-task-response.md",
];

void test("forge-room workspace keeps the required Phase 1 package files", () => {
  requiredForgeFiles.forEach((filePath) => {
    assert.equal(existsSync(filePath), true, filePath);
  });
});

void test("forge-room manifest satisfies workbench and visible feature scene validation", () => {
  const manifest = JSON.parse(readFileSync("rooms/forge-room/manifest.json", "utf8")) as unknown;
  const validation = validateRoomManifest(manifest);
  const forgeFeature = validation.manifest?.features.find(
    (feature) => feature.id === "forge-workbench"
  );

  assert.equal(validation.valid, true);
  assert.equal(validation.manifest?.id, "forge-room");
  assert.equal(validation.manifest.workbench?.experienceId, "forge-workbench");
  assert.equal(validation.manifest.workbench.primaryFeatureId, "forge-workbench");
  assert.deepEqual(validation.manifest.workbench.availableFeatureIds, ["forge-workbench"]);
  assert.deepEqual(
    forgeFeature?.protocolSpecs?.map((spec) => spec.key),
    [
      "forge-room-breakdown-architect",
      "forge-room-preflight-pre-analysis",
      "forge-room-task-response",
      "forge-room-synthesis",
    ]
  );
  assert.equal(forgeFeature.scene?.hotspot.id, "forge-room-workbench");
  assert.equal(forgeFeature.scene.view.id, "forge-room-console");
  assert.equal(validation.manifest.scene?.roomsHotspot.id, "forge-room-door");
  assert.equal(validation.manifest.scene.backHotspot.id, "forge-room-back");
});

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readCssWithImports } from "./helpers/css-imports.ts";
import { loadWorkspaceScriptForVm } from "./helpers/room-workspace-script.ts";

void test("rooms expose the shared shell seams expected by the normalized layout contract", () => {
  [
    "rooms/game-room/shared/host/activation.ts",
    "rooms/game-room/shared/host/command-registry.ts",
    "rooms/game-room/shared/ui/feature-contract.ts",
    "rooms/game-room/shared/ui/scroll-runtime.ts",
    "rooms/game-room/shared/types/room-shell-contracts.ts",
    "rooms/game-room/ui/game-room-ui-runtime.ts",
    "rooms/game-room/host/runtime.ts",
    "rooms/laboratory/ui/lab-root.ts",
    "rooms/laboratory/ui/workspace-surface.ts",
    "rooms/laboratory/ui/tool-management-overlay.ts",
    "rooms/laboratory/ui/lab-theme.css",
  ].forEach((filePath) => {
    assert.equal(existsSync(filePath), true, filePath);
  });
});

void test("room root entrypoints stay orchestration-only after layout normalization", () => {
  const gameRoomHostIndexSource = loadWorkspaceScriptForVm("rooms/game-room/host/index.ts");
  const gameRoomHostRuntimeSource = loadWorkspaceScriptForVm("rooms/game-room/host/runtime.ts");
  const gameRoomHostActivationSource = loadWorkspaceScriptForVm(
    "rooms/game-room/shared/host/activation.ts"
  );
  const gameRoomUiIndexSource = loadWorkspaceScriptForVm("rooms/game-room/ui/index.ts");
  const gameRoomUiRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/ui/game-room-ui-runtime.ts"
  );
  const gameRoomIndexHtmlSource = readFileSync("rooms/game-room/ui/index.html", "utf8");
  const laboratoryHostIndexSource = readFileSync("rooms/laboratory/host/index.ts", "utf8");
  const laboratoryUiIndexSource = readFileSync("rooms/laboratory/ui/index.ts", "utf8");
  const laboratoryUiStyleSource = readFileSync("rooms/laboratory/ui/style.css", "utf8");
  const laboratoryThemeStyleSource = readCssWithImports("rooms/laboratory/ui/lab-theme.css");

  assert.match(gameRoomHostIndexSource, /from "\.\/runtime\.js"/);
  assert.match(gameRoomHostIndexSource, /export default createGameRoomHostRuntime\(\);/);
  assert.doesNotMatch(gameRoomHostIndexSource, /GameRoomTeamTetrisStart/);
  assert.match(gameRoomHostRuntimeSource, /createGameRoomCommandRegistry/);
  assert.match(gameRoomHostRuntimeSource, /createGameRoomHostLifecycle/);
  assert.match(gameRoomHostActivationSource, /pushActiveFeatureState\(api\)/);
  assert.match(gameRoomUiIndexSource, /createGameRoomUiRuntime\(\)\.start\(\);/);
  assert.doesNotMatch(gameRoomUiIndexSource, /message\.type === "team-tetris-state"/);
  assert.match(gameRoomUiRuntimeSource, /(messageType|message\.type) === "team-tetris-state"/);
  assert.match(gameRoomIndexHtmlSource, /shared\/ui\/feature-contract\.js/);
  assert.match(gameRoomIndexHtmlSource, /shared\/ui\/scroll-runtime\.js/);
  assert.match(gameRoomIndexHtmlSource, /game-room-ui-runtime\.js/);
  assert.match(
    laboratoryHostIndexSource,
    /import createLaboratoryHostRuntime from "\.\/runtime\.js";/
  );
  assert.match(laboratoryUiIndexSource, /import "\.\/lab-root\.js";/);
  assert.match(laboratoryUiStyleSource, /lab-theme\.css/);
  assert.doesNotMatch(laboratoryUiStyleSource, /shared\/styles\/shell\.css/);
  assert.doesNotMatch(laboratoryUiStyleSource, /main-functions\/media-analysis\/styles\.css/);
  assert.match(laboratoryThemeStyleSource, /\.labx-shell/);
  assert.match(laboratoryThemeStyleSource, /\.labx-source-intake__frame/);
  assert.match(laboratoryThemeStyleSource, /\.labx-process-strip/);
  assert.match(laboratoryThemeStyleSource, /\.labx-module-overlay/);
  assert.doesNotMatch(laboratoryUiStyleSource, /audio-analysis\/styles\.css/);
});

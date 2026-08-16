import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { validateRoomManifest } from "../../src/types/rooms.ts";
import { loadWorkspaceScriptForVm } from "./helpers/room-workspace-script.ts";

const requiredFiles = [
  "rooms/game-room/host/runtime.ts",
  "rooms/game-room/shared/host/activation.ts",
  "rooms/game-room/shared/host/command-registry.ts",
  "rooms/game-room/shared/ui/feature-contract.ts",
  "rooms/game-room/shared/ui/scroll-runtime.ts",
  "rooms/game-room/shared/types/room-shell-contracts.ts",
  "rooms/game-room/ui/game-room-ui-bootstrap.ts",
  "rooms/game-room/ui/game-room-ui-state-message-runtime.ts",
  "rooms/game-room/ui/game-room-ui-runtime.ts",
  "rooms/game-room/main-functions/team-tetris/protocols/game-room-team-tetris-ai-opening.md",
  "rooms/game-room/main-functions/team-tetris/protocols/game-room-team-tetris-ai-followup.md",
  "rooms/game-room/main-functions/team-tetris/protocols/game-room-team-tetris-us1-transport.md",
  "rooms/game-room/shared/host/command-args.ts",
  "rooms/game-room/main-functions/team-tetris/host/engine-schema.ts",
  "rooms/game-room/main-functions/team-tetris/host/engine-board.ts",
  "rooms/game-room/main-functions/team-tetris/host/engine-match.ts",
  "rooms/game-room/main-functions/team-tetris/host/engine-helpers.ts",
  "rooms/game-room/main-functions/team-tetris/host/runtime-protocol.ts",
  "rooms/game-room/main-functions/team-tetris/host/runtime-transport.ts",
  "rooms/game-room/main-functions/team-tetris/host/runtime-sync.ts",
  "rooms/game-room/main-functions/team-tetris/host/state.ts",
  "rooms/game-room/main-functions/team-tetris/host/runtime.ts",
  "rooms/game-room/main-functions/team-tetris/ui/draft-runtime.ts",
  "rooms/game-room/main-functions/team-tetris/ui/state-shape-runtime.ts",
  "rooms/game-room/main-functions/team-tetris/ui/state-view-runtime.ts",
  "rooms/game-room/main-functions/team-tetris/ui/state-runtime.ts",
  "rooms/game-room/main-functions/team-tetris/ui/module-card-runtime.ts",
  "rooms/game-room/main-functions/team-tetris/ui/module-shell-runtime.ts",
  "rooms/game-room/main-functions/team-tetris/ui/module.ts",
  "rooms/game-room/main-functions/team-tetris/styles.css",
  "rooms/game-room/main-functions/team-tetris/styles/layout.css",
  "rooms/game-room/main-functions/team-tetris/styles/board.css",
  "rooms/game-room/main-functions/team-tetris/styles/presentation.css",
  "rooms/game-room/ui/context-runtime.ts",
  "rooms/game-room/main-functions/backgammon/host/runtime.ts",
  "rooms/game-room/main-functions/team-tetris/assets/team-tetris-view.webp",
];

void test("game-room workspace keeps the required Team Tetris package files", () => {
  requiredFiles.forEach((filePath) => {
    assert.equal(existsSync(filePath), true, filePath);
  });
});

void test("game-room manifest exposes Team Tetris as a second feature with scene metadata", () => {
  const manifest = JSON.parse(readFileSync("rooms/game-room/manifest.json", "utf8")) as Record<string, unknown>;
  const validation = validateRoomManifest(manifest);

  assert.equal(validation.valid, true);
  const feature = validation.manifest?.features.find((entry) => entry.id === "team-tetris");

  assert.ok(feature);
  assert.equal(feature.scene?.hotspot.id, "game-room-team-tetris");
  assert.equal(feature.scene.view.id, "team-tetris-closeup");
  assert.equal(
    feature.scene.view.backgroundSrc,
    "main-functions/team-tetris/assets/team-tetris-view.webp"
  );
  assert.deepEqual(
    feature.commandSpecs?.map((entry) => entry.name),
    [
      "GameRoomTeamTetrisStart",
      "GameRoomTeamTetrisReset",
      "GameRoomTeamTetrisUserMove",
      "GameRoomTeamTetrisAiMove",
      "GameRoomTeamTetrisRemoteMove",
    ]
  );
  assert.deepEqual(
    feature.protocolSpecs?.map((entry) => entry.key),
    [
      "game-room-team-tetris-ai-opening",
      "game-room-team-tetris-ai-followup",
      "game-room-team-tetris-us1-transport",
    ]
  );
});

void test("game-room Team Tetris UI and host sources expose the new feature shell", () => {
  const uiEntrySource = loadWorkspaceScriptForVm("rooms/game-room/ui/index.ts");
  const uiRuntimeSource = loadWorkspaceScriptForVm("rooms/game-room/ui/game-room-ui-runtime.ts");
  const indexHtmlSource = readFileSync("rooms/game-room/ui/index.html", "utf8");
  const teamTetrisStylesSource = readFileSync(
    "rooms/game-room/main-functions/team-tetris/styles.css",
    "utf8"
  );
  const teamTetrisUiStateRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/ui/state-runtime.ts"
  );
  const teamTetrisUiStateShapeRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/ui/state-shape-runtime.ts"
  );
  const teamTetrisUiStateViewRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/ui/state-view-runtime.ts"
  );
  const teamTetrisUiSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/ui/module.ts"
  );
  const teamTetrisUiModuleCardRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/ui/module-card-runtime.ts"
  );
  const teamTetrisUiModuleShellRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/ui/module-shell-runtime.ts"
  );
  const teamTetrisEngineSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/host/engine.ts"
  );
  const teamTetrisEngineSchemaSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/host/engine-schema.ts"
  );
  const teamTetrisEngineBoardSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/host/engine-board.ts"
  );
  const teamTetrisEngineMatchSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/host/engine-match.ts"
  );
  const teamTetrisEngineHelpersSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/host/engine-helpers.ts"
  );
  const teamTetrisHostRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/host/runtime.ts"
  );
  const teamTetrisHostProtocolSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/host/runtime-protocol.ts"
  );
  const teamTetrisAiOpeningProtocolSource = readFileSync(
    "rooms/game-room/main-functions/team-tetris/protocols/game-room-team-tetris-ai-opening.md",
    "utf8"
  );
  const teamTetrisAiFollowupProtocolSource = readFileSync(
    "rooms/game-room/main-functions/team-tetris/protocols/game-room-team-tetris-ai-followup.md",
    "utf8"
  );
  const teamTetrisHostTransportSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/host/runtime-transport.ts"
  );
  const teamTetrisHostSyncSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/host/runtime-sync.ts"
  );
  const hostEntrySource = loadWorkspaceScriptForVm("rooms/game-room/host/index.ts");
  const hostActivationSource = loadWorkspaceScriptForVm(
    "rooms/game-room/shared/host/activation.ts"
  );
  const backgammonRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/host/runtime.ts"
  );
  const backgammonRuntimeSyncSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/host/runtime-sync.ts"
  );

  assert.match(indexHtmlSource, /<script src="\.\/context-runtime\.js"><\/script>/);
  assert.match(indexHtmlSource, /game-room-ui-bootstrap\.js/);
  assert.match(indexHtmlSource, /game-room-ui-state-message-runtime\.js/);
  assert.match(indexHtmlSource, /team-tetris\/ui\/draft-runtime\.js/);
  assert.match(indexHtmlSource, /team-tetris\/ui\/state-shape-runtime\.js/);
  assert.match(indexHtmlSource, /team-tetris\/ui\/state-view-runtime\.js/);
  assert.match(indexHtmlSource, /team-tetris\/ui\/state-runtime\.js/);
  assert.match(indexHtmlSource, /team-tetris\/ui\/module-card-runtime\.js/);
  assert.match(indexHtmlSource, /team-tetris\/ui\/module-shell-runtime\.js/);
  assert.match(indexHtmlSource, /shared\/ui\/feature-contract\.js/);
  assert.match(teamTetrisStylesSource, /@import "\.\/styles\/layout\.css"/);
  assert.match(teamTetrisStylesSource, /@import "\.\/styles\/board\.css"/);
  assert.match(teamTetrisStylesSource, /@import "\.\/styles\/presentation\.css"/);
  assert.match(indexHtmlSource, /game-room-ui-runtime\.js/);
  assert.match(uiEntrySource, /createGameRoomUiRuntime\(\)\.start\(\)/);
  assert.match(uiRuntimeSource, /(messageType|message\.type) === "team-tetris-state"/);
  assert.match(uiRuntimeSource, /getActiveFeatureId\(\) === teamTetrisFeatureId/);
  assert.match(teamTetrisUiStateRuntimeSource, /GameRoomTeamTetrisStart/);
  assert.match(teamTetrisUiStateRuntimeSource, /createTeamTetrisUiStateShapeRuntime/);
  assert.match(teamTetrisUiStateRuntimeSource, /createTeamTetrisUiStateViewRuntime/);
  assert.match(
    teamTetrisUiStateShapeRuntimeSource,
    /function sanitizeTeamTetrisState\(candidate\)/
  );
  assert.match(teamTetrisUiStateViewRuntimeSource, /function getTeamTetrisStatusText\(\)/);
  assert.match(teamTetrisUiSource, /createTeamTetrisUiStateRuntime/);
  assert.match(teamTetrisUiSource, /createTeamTetrisUiModuleCardRuntime/);
  assert.match(teamTetrisUiSource, /createTeamTetrisUiModuleShellRuntime/);
  assert.match(teamTetrisUiModuleCardRuntimeSource, /createTeamTetrisUiModuleCardRuntime/);
  assert.match(teamTetrisUiModuleShellRuntimeSource, /createTeamTetrisUiModuleShellRuntime/);
  assert.match(teamTetrisEngineSource, /from "\.\/engine-helpers\.js"/);
  assert.match(teamTetrisEngineHelpersSource, /from "\.\/engine-schema\.js"/);
  assert.match(teamTetrisEngineHelpersSource, /from "\.\/engine-board\.js"/);
  assert.match(teamTetrisEngineHelpersSource, /from "\.\/engine-match\.js"/);
  assert.match(teamTetrisEngineSchemaSource, /const TEAM_TETRIS_MOVE_SCHEMA = \{/);
  assert.match(
    teamTetrisEngineBoardSource,
    /function replayTeamTetrisPath\(board, pieceId, rotation, rowShifts\)/
  );
  assert.match(teamTetrisEngineBoardSource, /function clearTeamTetrisLines\(board\)/);
  assert.match(teamTetrisEngineMatchSource, /function createTeamTetrisMatch\(options\)/);
  assert.match(teamTetrisEngineMatchSource, /function buildTeamTetrisTurn\(match, turnIndex\)/);
  assert.match(teamTetrisHostRuntimeSource, /from "\.\/runtime-protocol\.js"/);
  assert.match(teamTetrisHostRuntimeSource, /from "\.\/runtime-transport\.js"/);
  assert.match(teamTetrisHostRuntimeSource, /from "\.\/runtime-sync\.js"/);
  assert.match(
    teamTetrisHostProtocolSource,
    /function buildTeamTetrisAiTurnMessage\(match, seatId\)/
  );
  assert.match(teamTetrisHostProtocolSource, /pieceGeometryCatalog/);
  assert.match(teamTetrisHostProtocolSource, /function buildTeamTetrisReferenceMove\(packet\)/);
  assert.match(teamTetrisHostProtocolSource, /keeps dropping the piece straight down/i);
  assert.match(teamTetrisEngineSource, /currentTurn\.role === "followup"/);
  assert.match(teamTetrisEngineSource, /team\.nextPieceId = nextTeamPieceId/);
  assert.match(teamTetrisEngineSource, /cells: \[\]/);
  assert.match(teamTetrisHostRuntimeSource, /function buildTeamTetrisFailureDebug/);
  assert.match(teamTetrisHostRuntimeSource, /function buildTeamTetrisSuccessDebug/);
  assert.match(teamTetrisHostRuntimeSource, /resolvedPath: null/);
  assert.match(teamTetrisHostRuntimeSource, /finalLockCells: null/);
  assert.equal(/"rowShifts":\[0\]/.test(teamTetrisAiOpeningProtocolSource), false);
  assert.equal(/"rowShifts":\[0\]/.test(teamTetrisAiFollowupProtocolSource), false);
  assert.match(teamTetrisAiOpeningProtocolSource, /keeps dropping the piece straight down/i);
  assert.match(teamTetrisAiFollowupProtocolSource, /authoritative geometry/i);
  assert.match(teamTetrisHostTransportSource, /async function sendTeamTetrisRemoteMove/);
  assert.match(
    teamTetrisHostSyncSource,
    /function serializeTeamTetrisState\(api, state, context\)/
  );
  assert.match(hostEntrySource, /createGameRoomHostRuntime\(\)/);
  assert.match(hostActivationSource, /pushActiveFeatureState\(api\)/);
  assert.match(backgammonRuntimeSource, /from "\.\/runtime-sync\.js"/);
  assert.match(backgammonRuntimeSyncSource, /resetTeamTetrisState\(api, "activeFeatureReset"\)/);
});

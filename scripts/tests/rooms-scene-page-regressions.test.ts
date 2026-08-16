import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

void test("rooms scene page keeps template, controller, and scene background wiring without static nav", () => {
  const appShellSource = readFileSync("src/index.html", "utf8");
  const pageInitSource = readFileSync("src/js/app/page-init.ts", "utf8");
  const pageSource = readFileSync("src/pages/rooms.html", "utf8");
  const controllerSource = readFileSync("src/js/pages/rooms.ts", "utf8");
  const sceneShellSource = readFileSync("src/styles/scene-system/shell.css", "utf8");

  assert.doesNotMatch(appShellSource, /data-page="rooms"/);
  assert.doesNotMatch(appShellSource, /data-shell-i18n-text="sideNav\.roomsLabel"/);
  assert.match(appShellSource, /href="\/styles\/rooms\.css"/);
  assert.match(pageInitSource, /RoomsController/);
  assert.match(pageInitSource, /roomsTemplate/);
  assert.match(pageInitSource, /controllers\["rooms"\]\s*=\s*new RoomsController\(\)/);
  assert.match(pageSource, /id="page-rooms"/);
  assert.match(pageSource, /id="rooms-scene-root"/);
  assert.match(pageSource, /id="rooms-classic-shell"/);
  assert.match(controllerSource, /createSceneDebugRuntimeSession\("rooms",\s*\{/);
  assert.match(controllerSource, /createRoomsCorridorSceneDebugStore\(\{/);
  assert.doesNotMatch(controllerSource, /createSceneDebugStore\("rooms"\)/);
  assert.match(controllerSource, /getSceneRoomBackgroundSrc\("rooms"\)/);
  assert.match(controllerSource, /isSceneDebugRoomActive\("rooms"\)/);
  assert.match(controllerSource, /RoomRegistry\.subscribe\(\(rooms\)\s*=>/);
  assert.match(
    controllerSource,
    /const installedRoom =\s*this\.installedRooms\.find\(\(entry\) => entry\.scene\?\.roomsHotspot\.id === id\)\s*\?\? null;/
  );
  assert.match(controllerSource, /navigateToScenePage\(getRoomPageName\(roomId\)\)/);
  assert.match(controllerSource, /if \(installedRoom !== null && this\.editor === null\) \{/);
  assert.match(controllerSource, /navigateToScenePage\(getRoomPageName\(installedRoom\.id\)\)/);
  assert.match(sceneShellSource, /\[data-ui-mode="scene"\] \.top-bar/);
  assert.match(sceneShellSource, /\[data-ui-mode="scene"\] \.main-content/);
});

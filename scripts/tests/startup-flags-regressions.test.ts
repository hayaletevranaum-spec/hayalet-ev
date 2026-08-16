import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPreloadAdditionalArguments,
  parseStartupFlagsFromArgv,
} from "../../electron/startup-flags.ts";

void test("reads startup flags from legacy CLI arguments", () => {
  const flags = parseStartupFlagsFromArgv([
    "electron",
    "./dist/electron/main.js",
    "--start-page=assistant",
    "--auto-connect",
  ]);

  assert.equal(flags.startPage, "assistant");
  assert.equal(flags.autoConnect, true);
  assert.equal(flags.uiMode, "classic");
});

void test("reads startup flags from app-prefixed preload arguments", () => {
  const flags = parseStartupFlagsFromArgv([
    "electron",
    "./dist/electron/main.js",
    "--app-start-page=assistant",
    "--app-auto-connect=1",
    "--app-ui-mode=scene",
    "--app-display-id=7",
  ]);

  assert.equal(flags.startPage, "assistant");
  assert.equal(flags.autoConnect, true);
  assert.equal(flags.uiMode, "scene");
  assert.equal(flags.displayId, 7);
});

void test("serializes startup flags into preload additional arguments", () => {
  const args = buildPreloadAdditionalArguments({
    startPage: "assistant",
    autoConnect: true,
    uiMode: "scene",
    sceneEditor: false,
    sceneDebug: false,
    displayId: 4,
    roomsSnapshot: null,
  });

  assert.deepEqual(args, [
    "--app-start-page=assistant",
    "--app-auto-connect=1",
    "--app-ui-mode=scene",
  ]);
});

void test("omits empty startup flags while serializing preload arguments", () => {
  const args = buildPreloadAdditionalArguments({
    startPage: null,
    autoConnect: false,
    uiMode: "classic",
    sceneEditor: false,
    sceneDebug: false,
    displayId: null,
    roomsSnapshot: null,
  });

  assert.deepEqual(args, []);
});

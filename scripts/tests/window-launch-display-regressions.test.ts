import assert from "node:assert/strict";
import test from "node:test";

import { resolveLaunchDisplay, type LaunchDisplay } from "../../electron/window-launch-display.ts";

const primaryDisplay: LaunchDisplay = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
};

const secondaryDisplay: LaunchDisplay = {
  id: 2,
  bounds: { x: 1920, y: 0, width: 1366, height: 768 },
  workArea: { x: 1920, y: 0, width: 1366, height: 728 },
};

void test("resolveLaunchDisplay prefers an explicit display id", () => {
  const display = resolveLaunchDisplay(
    [primaryDisplay, secondaryDisplay],
    primaryDisplay,
    { x: 20, y: 20 },
    { displayId: 2 }
  );

  assert.equal(display.id, 2);
});

void test("resolveLaunchDisplay falls back to the cursor display", () => {
  const display = resolveLaunchDisplay([primaryDisplay, secondaryDisplay], primaryDisplay, {
    x: 2200,
    y: 120,
  });

  assert.equal(display.id, 2);
});

void test("resolveLaunchDisplay uses the nearest display when the cursor is outside all bounds", () => {
  const display = resolveLaunchDisplay([primaryDisplay, secondaryDisplay], primaryDisplay, {
    x: 3350,
    y: 120,
  });

  assert.equal(display.id, 2);
});

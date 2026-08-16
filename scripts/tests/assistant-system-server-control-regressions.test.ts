import assert from "node:assert/strict";
import test from "node:test";

import { detectSystemActiveServerStatus } from "../../src/js/pages/assistant/system-server-control.ts";

type TestWindow = {
  electronAPI?: Record<string, unknown>;
};

function setWindow(api?: Record<string, unknown>): void {
  (globalThis as unknown as { window: TestWindow }).window =
    api === undefined
      ? {}
      : {
          electronAPI: api,
        };
}

void test("system server control returns live status from opencodeServeStatus", async () => {
  setWindow({
    opencodeServeStatus: () => ({ running: true, port: 4096 }),
  });

  const status = await detectSystemActiveServerStatus();

  assert.deepEqual(status, { running: true, port: 4096 });
});

void test("system server control falls back to findRunning when cached status is idle", async () => {
  setWindow({
    opencodeServeStatus: () => ({ running: false }),
    opencodeServeFindRunning: () => ({ running: true, port: 4101 }),
  });

  const status = await detectSystemActiveServerStatus();

  assert.deepEqual(status, { running: true, port: 4101 });
});

void test("system server control returns stopped when electron bridge is unavailable", async () => {
  setWindow();

  const status = await detectSystemActiveServerStatus();

  assert.deepEqual(status, { running: false });
});

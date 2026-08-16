import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readAssistantSlotSettingsReport } from "../lib/settings-status.mjs";

void test("reads assistant slot command capture state from project settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "hev-settings-status-"));
  const configDir = join(root, "config");
  await mkdir(configDir, { recursive: true });
  await writeFile(
    join(configDir, "settings.json"),
    `${JSON.stringify(
      {
        assistantSlot: {
          accountId: "ai0-demo-account",
          catchCommands: true,
        },
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const result = await readAssistantSlotSettingsReport(root);

  assert.equal(result.loaded, true);
  assert.equal(result.accountId, "ai0-demo-account");
  assert.equal(result.catchCommands, true);
  assert.equal(result.commandCaptureStatus, "enabled");
  assert.equal(result.error, null);
});

void test("reports unknown command capture state when project settings file is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "hev-settings-status-missing-"));

  const result = await readAssistantSlotSettingsReport(root);

  assert.equal(result.loaded, false);
  assert.equal(result.catchCommands, null);
  assert.equal(result.commandCaptureStatus, "unknown");
  assert.equal(result.errorCode, "ENOENT");
  assert.match(result.source, /config[\\/]settings\.json$/);
});

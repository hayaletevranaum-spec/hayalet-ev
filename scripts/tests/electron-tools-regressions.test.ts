import assert from "node:assert/strict";
import test from "node:test";

import { testElectron } from "../../mcp-server/tools/electron-tools.ts";

void test("testElectron should not start wrapper when runtime mode is already app", async () => {
  const calls: string[] = [];

  const runner = async (
    command: string,
    _options: { cwd: string; timeout: number }
  ): Promise<{ stdout: string; stderr: string }> => {
    calls.push(command);

    if (command === "npm run mode:status") {
      return { stdout: "\n> app@5.4.0 mode:status\n> node scripts/transition.mjs status\n\n{\n  \"success\": true,\n  \"mode\": \"app\"\n}\n", stderr: "" };
    }

    if (command === "npm run start") {
      throw new Error("start should not be invoked when app is already active");
    }

    return { stdout: "", stderr: "" };
  };

  const result = await testElectron("/tmp", {
    timeout: 5,
    _runCommand: runner,
  });

  const text = String(result.content[0]?.text ?? "");
  assert.equal(result.isError, undefined);
  assert.match(text, /zaten aktif/i);
  assert.deepEqual(calls, ["npm run mode:status"]);
});

void test("testElectron should not start wrapper when app window is already open in terminal mode", async () => {
  const calls: string[] = [];

  const runner = async (
    command: string,
    _options: { cwd: string; timeout: number }
  ): Promise<{ stdout: string; stderr: string }> => {
    calls.push(command);

    if (command === "npm run mode:status") {
      return { stdout: "\n> app@5.4.0 mode:status\n> node scripts/transition.mjs status\n\n{\n  \"success\": true,\n  \"mode\": \"terminal\",\n  \"appOpen\": true,\n  \"electronConnectionAvailable\": true\n}\n", stderr: "" };
    }

    if (command === "npm run start") {
      throw new Error("start should not be invoked when the app window is already active");
    }

    return { stdout: "", stderr: "" };
  };

  const result = await testElectron("/tmp", {
    timeout: 5,
    _runCommand: runner,
  });

  const text = String(result.content[0]?.text ?? "");
  assert.equal(result.isError, undefined);
  assert.match(text, /zaten aktif/i);
  assert.match(text, /terminal\/app-open/i);
  assert.deepEqual(calls, ["npm run mode:status"]);
});

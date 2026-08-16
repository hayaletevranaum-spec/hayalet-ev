import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  executeBash,
  shouldKeepCommandForegroundByDefault,
} from "../../mcp-server/tools/fs/bash-executor.ts";
import { createFilesystemMiscTools } from "../../mcp-server/core/handlers/filesystem/misc-tools.ts";

function getToolText(response: unknown): string {
  const maybeContent = (response as { content?: unknown }).content;
  if (!Array.isArray(maybeContent)) return "";

  return maybeContent
    .map((item) => (typeof (item as { text?: unknown }).text === "string" ? (item as { text: string }).text : ""))
    .join("\n");
}

function nodeEvalCommand(script: string): string {
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

void test("executeBash keeps explicit-timeout commands in foreground", async () => {
  const result = await executeBash(
    `${process.execPath} -e "setTimeout(() => console.log('done'), 40)"`,
    process.cwd(),
    1_000,
    { detachLongRunning: false, foregroundWaitMs: 1 }
  );

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), "done");
  assert.doesNotMatch(result.stdout, /Background process|arka plana|baslatildi/i);
});

void test("filesystem bash handler keeps explicit-timeout commands in foreground", async () => {
  const bashTool = createFilesystemMiscTools(process.cwd()).find(
    (entry) => (entry.definition as { name?: unknown }).name === "hev_fs_bash"
  );

  assert.ok(bashTool);

  const response = await bashTool.handler({
    command: `${process.execPath} -e "setTimeout(() => console.log('handler-done'), 40)"`,
    timeout: 1_000,
  });
  const text = getToolText(response);

  assert.match(text, /handler-done/);
  assert.doesNotMatch(text, /Command is still running/);
});

void test("executeBash can still detach long-running default-style commands", async () => {
  const result = await executeBash(
    `${process.execPath} -e "setTimeout(() => console.log('late'), 40)"`,
    process.cwd(),
    1_000,
    { detachLongRunning: true, foregroundWaitMs: 1 }
  );

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /PID:/);
  assert.match(result.stdout, /Command is still running/);
});

void test("validation commands stay foreground by default", () => {
  assert.equal(shouldKeepCommandForegroundByDefault("npm run scripts:typecheck"), true);
  assert.equal(shouldKeepCommandForegroundByDefault("npm run mcp:build"), true);
  assert.equal(shouldKeepCommandForegroundByDefault("npx tsc --noEmit -p scripts/tsconfig.json"), true);
  assert.equal(shouldKeepCommandForegroundByDefault(`${process.execPath} -e "setTimeout(() => {}, 40)"`), false);
});

void test("executeBash timeout terminates child process group", async () => {
  const tmpPath = mkdtempSync(join(tmpdir(), "hev-bash-timeout-"));
  const sentinelPath = join(tmpPath, "late-write.txt");
  const writerScript = `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(
    sentinelPath
  )}, "late"), 600)`;
  const parentScript = [
    'const { spawn } = require("node:child_process");',
    `const child = spawn(process.execPath, ["-e", ${JSON.stringify(writerScript)}], { stdio: "ignore" });`,
    "child.unref();",
    "setTimeout(() => {}, 5000);",
  ].join(" ");

  try {
    const result = await executeBash(nodeEvalCommand(parentScript), process.cwd(), 100, {
      detachLongRunning: false,
      foregroundWaitMs: 1,
    });
    await delay(900);

    assert.equal(result.timedOut, true);
    assert.equal(result.exitCode, 124);
    assert.equal(existsSync(sentinelPath), false);
  } finally {
    rmSync(tmpPath, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const projectRoot = join(import.meta.dirname, "..", "..");

void test("wrapper startup clears ELECTRON_RUN_AS_NODE from inherited environment", async () => {
  const wrapperSource = await readFile(join(projectRoot, "scripts", "ghost-agent-wrapper.mjs"), "utf8");
  assert.match(wrapperSource, /delete env\.ELECTRON_RUN_AS_NODE;/);
});

void test("rebuild pipeline includes electron runtime verification guard", async () => {
  const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")) as Record<string, unknown>;
  const scripts = packageJson["scripts"] as Record<string, string> | undefined;
  assert.equal(
    scripts?.["rebuild"],
    "npm run better-sqlite3:prepare:electron && node scripts/ensure-electron-runtime.mjs"
  );
});

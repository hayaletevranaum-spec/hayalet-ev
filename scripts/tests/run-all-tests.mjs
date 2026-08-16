import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const testsDir = join(process.cwd(), "scripts", "tests");

function isWrapperOnlyTest(filePath) {
  const lines = readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    lines.length > 0 &&
    lines.every((line) => /^import\s+["']\.\/[^"']+\.test\.ts["'];$/.test(line))
  );
}

const testFiles = readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.ts"))
  .map((name) => join(testsDir, name))
  .filter((filePath) => !isWrapperOnlyTest(filePath))
  .sort()
  .map((filePath) => relative(process.cwd(), filePath));

const result = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "--import",
    "./scripts/tests/register-asset-loader.mjs",
    "--test",
    "--test-concurrency=1",
    ...testFiles,
  ],
  {
    env: {
      ...process.env,
      TSX_DISABLE_CACHE: "1",
      TSX_TSCONFIG_PATH: process.env.TSX_TSCONFIG_PATH ?? "src/tsconfig.json",
    },
    stdio: "inherit",
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

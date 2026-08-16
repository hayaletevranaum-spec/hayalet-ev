import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const projectRoot = process.cwd();

void test("provider tester types import resolves without Vite-only aliases", () => {
  const script = [
    "import('./electron/provider-tester/types.ts')",
    "  .then(() => process.exit(0))",
    "  .catch((error) => {",
    "    console.error(error?.message ?? String(error));",
    "    process.exit(1);",
    "  });",
  ].join("\n");

  const nodeArgs = [
    "--import",
    "tsx",
    "--import",
    "./scripts/tests/register-asset-loader.mjs",
    "-e",
    script,
  ];

  const result = spawnSync(process.execPath, nodeArgs, {
    cwd: projectRoot,
    encoding: "utf-8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(
    result.status,
    0,
    `Expected provider tester types import to succeed.\nOutput:\n${output}`
  );
});

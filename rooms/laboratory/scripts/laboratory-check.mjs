import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const testsDir = resolve(repoRoot, "scripts/tests");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const ciMode = process.argv.includes("--ci");
const listOnly = process.argv.includes("--list");

const laboratoryTests = readdirSync(testsDir, { withFileTypes: true })
  .filter(function (entry) {
    if (!entry.isFile() || !/^laboratory-.*\.test\.ts$/.test(entry.name)) {
      return false;
    }
    const content = readFileSync(resolve(testsDir, entry.name), "utf8");
    return /\b(?:test|describe|it)\s*\(/.test(content);
  })
  .map(function (entry) {
    return `scripts/tests/${entry.name}`;
  })
  .sort();

if (laboratoryTests.length === 0) {
  console.error("[laboratory:check] No Laboratory regression tests were discovered.");
  process.exit(1);
}

const commonSteps = [
  {
    label: "dependency boundaries",
    args: ["run", "deps:check"],
  },
  {
    label: "dead-code gate",
    args: ["run", "laboratory:cleanup:gate"],
  },
];

const localOnlySteps = [
  {
    label: "room typecheck",
    args: ["run", "rooms:typecheck"],
  },
  {
    label: "room strict lint",
    args: ["run", "rooms:lint:strict"],
  },
];

const finalLocalSteps = [
  {
    label: "workspace room build",
    args: ["run", "rooms:build"],
  },
];

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

const testSteps = chunk(laboratoryTests, 20).map(function (testChunk, index, chunks) {
  return {
    label:
      chunks.length === 1
        ? `Laboratory regressions (${laboratoryTests.length})`
        : `Laboratory regressions ${index + 1}/${chunks.length}`,
    args: ["run", "rooms:test:file", "--", ...testChunk],
  };
});

const steps = ciMode
  ? [...commonSteps, ...testSteps]
  : [...localOnlySteps, ...commonSteps, ...testSteps, ...finalLocalSteps];

if (listOnly) {
  console.log(
    JSON.stringify(
      {
        ciMode,
        laboratoryTests,
        steps: steps.map(function (step) {
          return {
            command: [npmCommand, ...step.args].join(" "),
            label: step.label,
          };
        }),
      },
      null,
      2
    )
  );
  process.exit(0);
}

for (const step of steps) {
  console.log(`\n[laboratory:check] ${step.label}`);
  const result = spawnSync(npmCommand, step.args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`[laboratory:check] ${step.label} could not start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[laboratory:check] ${step.label} failed.`);
    process.exit(result.status ?? 1);
  }
}

console.log("\n[laboratory:check] All checks passed.");

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractTgz } from "./lib/extract-tgz.mjs";

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "..");
const require = createRequire(import.meta.url);

const libsqlPackagePath = join(dirname(require.resolve("libsql")), "package.json");
const libsqlVersion = require(libsqlPackagePath).version;
const targetPackageName = "@libsql/win32-x64-msvc";
const targetPackageDir = join(projectRoot, "node_modules", "@libsql", "win32-x64-msvc");
const targetPackageJsonPath = join(targetPackageDir, "package.json");
const targetBinaryPath = join(targetPackageDir, "index.node");

function resolveNodeExecutable() {
  const npmNodeExecPath = process.env["npm_node_execpath"]?.trim();
  if (npmNodeExecPath) {
    return npmNodeExecPath;
  }

  const nodeFromEnv = process.env["NODE"]?.trim();
  if (nodeFromEnv) {
    return nodeFromEnv;
  }

  return process.execPath;
}

function runCommand(command, args, label, cwd = projectRoot) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit code ${String(result.status)}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim()
    );
  }

  return result;
}

function runNpmCommand(args, label, cwd = projectRoot) {
  const npmExecPath = process.env["npm_execpath"]?.trim();
  return npmExecPath
    ? runCommand(resolveNodeExecutable(), [npmExecPath, ...args], label, cwd)
    : runCommand(process.platform === "win32" ? "npm.cmd" : "npm", args, label, cwd);
}

function extractTarball(tarballPath, destinationDir, label) {
  try {
    extractTgz(tarballPath, destinationDir);
  } catch (error) {
    throw new Error(
      `${label} failed.\n${(error instanceof Error ? error.message : String(error)).trim()}`,
      { cause: error }
    );
  }
}

function readInstalledVersion() {
  if (!existsSync(targetPackageJsonPath)) {
    return null;
  }

  const packageJson = JSON.parse(readFileSync(targetPackageJsonPath, "utf8"));
  return typeof packageJson.version === "string" ? packageJson.version : null;
}

function ensureWindowsRuntimePackage() {
  const installedVersion = readInstalledVersion();
  if (installedVersion === libsqlVersion && existsSync(targetBinaryPath)) {
    console.info(`[libsql:prepare:win] ${targetPackageName}@${libsqlVersion} already present`);
    return;
  }

  const tempRoot = mkdtempSync(join(tmpdir(), "libsql-win32-x64-msvc-"));

  try {
    const packResult = runNpmCommand(
      ["pack", `${targetPackageName}@${libsqlVersion}`, "--pack-destination", tempRoot],
      `Download ${targetPackageName}@${libsqlVersion}`
    );

    const tarballName = packResult.stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.endsWith(".tgz"))
      .at(-1);

    if (!tarballName) {
      throw new Error(
        `Could not determine packed tarball for ${targetPackageName}@${libsqlVersion}`
      );
    }

    const tarballPath = join(tempRoot, tarballName);
    extractTarball(tarballPath, tempRoot, `Extract ${tarballName}`);

    const extractedPackageDir = join(tempRoot, "package");
    if (!existsSync(extractedPackageDir)) {
      throw new Error(`Extracted package directory not found: ${extractedPackageDir}`);
    }

    rmSync(targetPackageDir, { recursive: true, force: true });
    mkdirSync(dirname(targetPackageDir), { recursive: true });
    cpSync(extractedPackageDir, targetPackageDir, { recursive: true });

    if (!existsSync(targetBinaryPath)) {
      throw new Error(
        `Windows libsql runtime binary missing after extraction: ${targetBinaryPath}`
      );
    }

    console.info(`[libsql:prepare:win] installed ${targetPackageName}@${libsqlVersion}`);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

ensureWindowsRuntimePackage();

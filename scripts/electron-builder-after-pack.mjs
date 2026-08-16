import { spawnSync } from "node:child_process";
import { cpSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "..");
const betterSqlite3Root = dirname(require.resolve("better-sqlite3/package.json"));
const prebuildInstallCli = require.resolve("prebuild-install/bin.js");
const electronVersion = require("electron/package.json").version;
const packagedWorkspaceMirrorPaths = [
  ".dependency-cruiser.cjs",
  ".gitignore",
  ".nvmrc",
  ".prettierignore",
  ".prettierrc",
  ".rovo",
  "AGENTS.md",
  "LICENSE",
  "PACKAGING.md",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "third-party-licenses",
  "android-companion",
  "config/backup-scopes.json",
  "data/protocols.json",
  "dist",
  "electron",
  "electron-builder.yml",
  "eslint.config.cjs",
  "ghost-agent",
  "knip.config.ts",
  "mcp-server",
  "package.json",
  "rooms",
  "scripts",
  "shared",
  "src",
  "electron/tsconfig.electron.json",
  "src/tsconfig.json",
  "mcp-server/tsconfig.mcp.json",
  "rooms/tsconfig.rooms.json",
  "vite.config.js",
];

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
}

function syncPackagedWorkspaceMirror(appOutDir) {
  const mirroredPaths = [];

  for (const relativePath of packagedWorkspaceMirrorPaths) {
    const sourcePath = join(projectRoot, relativePath);
    if (!existsSync(sourcePath)) {
      continue;
    }

    const targetPath = join(appOutDir, relativePath);
    mkdirSync(dirname(targetPath), { recursive: true });
    cpSync(sourcePath, targetPath, {
      force: true,
      recursive: true,
      filter: (entryPath) =>
        !entryPath.endsWith(".tsbuildinfo") &&
        !entryPath.replace(/\\/g, "/").includes("/rooms/.build"),
    });
    mirroredPaths.push(relativePath);
  }

  return mirroredPaths;
}

function injectWindowsBetterSqliteBinary(targetBinaryPath) {
  const tempRoot = mkdtempSync(join(tmpdir(), "better-sqlite3-win32-"));
  const packageCopyDir = join(tempRoot, "better-sqlite3");

  try {
    cpSync(betterSqlite3Root, packageCopyDir, { recursive: true });
    runCommand(
      resolveNodeExecutable(),
      [
        prebuildInstallCli,
        "--path",
        packageCopyDir,
        "--runtime",
        "electron",
        "--target",
        electronVersion,
        "--platform",
        "win32",
        "--arch",
        "x64",
        "--force",
      ],
      "Download Windows better-sqlite3 prebuild",
      packageCopyDir
    );

    const binaryPath = join(packageCopyDir, "build", "Release", "better_sqlite3.node");
    if (!existsSync(binaryPath)) {
      throw new Error(`Windows better-sqlite3 prebuild missing at ${binaryPath}`);
    }

    mkdirSync(dirname(targetBinaryPath), { recursive: true });
    copyFileSync(binaryPath, targetBinaryPath);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

export default async function afterPack(context) {
  if (context.electronPlatformName !== "linux" && context.electronPlatformName !== "win32") {
    return;
  }

  // NOTE: Packaged tooling resolves workspace paths from the unpacked app root, not app.asar.
  const mirroredPaths = syncPackagedWorkspaceMirror(context.appOutDir);
  console.info(
    `[afterPack] mirrored ${String(mirroredPaths.length)} workspace paths into ${context.appOutDir}`
  );

  if (context.electronPlatformName !== "win32") {
    return;
  }

  // NOTE: Cross-platform Windows packaging cannot reuse the host better-sqlite3 binary.
  const targetBinaryPath = join(
    context.appOutDir,
    "resources",
    "app.asar.unpacked",
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node"
  );

  injectWindowsBetterSqliteBinary(targetBinaryPath);
  console.info(`[afterPack] injected Windows better-sqlite3 prebuild into ${targetBinaryPath}`);
}

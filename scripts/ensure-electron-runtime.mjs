import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { arch, platform } from "node:process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

function resolveElectronPlatformPath(targetPlatform) {
  switch (targetPlatform) {
    case "darwin":
    case "mas":
      return "Electron.app/Contents/MacOS/Electron";
    case "freebsd":
    case "openbsd":
    case "linux":
      return "electron";
    case "win32":
      return "electron.exe";
    default:
      throw new Error(`Electron builds are not available on platform: ${targetPlatform}`);
  }
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runInstallScript(electronDir) {
  const installScriptPath = join(electronDir, "install.js");
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [installScriptPath], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if ((code ?? 1) !== 0) {
        rejectPromise(new Error(`Electron install.js exited with code ${code ?? 1}`));
        return;
      }
      resolvePromise();
    });
  });
}

async function runCommand(command, args, options = {}) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
      ...options,
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if ((code ?? 1) !== 0) {
        rejectPromise(new Error(`${command} exited with code ${code ?? 1}`));
        return;
      }
      resolvePromise();
    });
  });
}

async function downloadElectronArtifact(version, targetPlatform, targetArch) {
  const fileName = `electron-v${version}-${targetPlatform}-${targetArch}.zip`;
  const releaseUrl = `https://github.com/electron/electron/releases/download/v${version}/${fileName}`;
  const localZipPath = join(tmpdir(), fileName);
  const response = await fetch(releaseUrl);
  if (!response.ok) {
    throw new Error(`Failed to download Electron artifact (${response.status}) from ${releaseUrl}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(localZipPath, buffer);
  return localZipPath;
}

async function ensureElectronRuntimeFallback(electronDir, version) {
  const targetPlatform = process.env.npm_config_platform ?? platform;
  const targetArch = process.env.npm_config_arch ?? arch;
  const distDir = process.env.ELECTRON_OVERRIDE_DIST_PATH ?? join(electronDir, "dist");
  const platformPath = resolveElectronPlatformPath(targetPlatform);

  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  const zipPath = await downloadElectronArtifact(version, targetPlatform, targetArch);
  await runCommand("unzip", ["-o", zipPath, "-d", distDir]);

  const bundledTypesPath = join(distDir, "electron.d.ts");
  if (existsSync(bundledTypesPath)) {
    await rename(bundledTypesPath, join(electronDir, "electron.d.ts")).catch(() => {});
  }

  await writeFile(join(electronDir, "path.txt"), platformPath, "utf8");
  const versionMarkerPath = join(distDir, "version");
  if (!(await fileExists(versionMarkerPath))) {
    throw new Error("Fallback installer extracted Electron archive without version marker.");
  }
}

async function isElectronRuntimeReady(electronDir, version) {
  const targetPlatform = process.env.npm_config_platform ?? platform;
  const distDir = process.env.ELECTRON_OVERRIDE_DIST_PATH ?? join(electronDir, "dist");
  const platformPath = resolveElectronPlatformPath(targetPlatform);
  const versionPath = join(distDir, "version");
  const pathTxtPath = join(electronDir, "path.txt");
  const binaryPath = join(distDir, platformPath);

  if (!(await fileExists(versionPath)) || !(await fileExists(pathTxtPath)) || !(await fileExists(binaryPath))) {
    return false;
  }

  const installedVersion = (await readFile(versionPath, "utf8")).trim().replace(/^v/, "");
  const configuredPath = (await readFile(pathTxtPath, "utf8")).trim();
  return installedVersion === version && configuredPath === platformPath;
}

async function main() {
  const rootDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = dirname(rootDir);
  const electronDir = join(projectRoot, "node_modules", "electron");
  const electronPackagePath = join(electronDir, "package.json");

  if (!(await fileExists(electronPackagePath))) {
    console.warn("[electron-runtime] node_modules/electron not found, skipping.");
    return;
  }

  const electronPackage = JSON.parse(await readFile(electronPackagePath, "utf8"));
  const version = String(electronPackage.version ?? "").trim();
  if (version === "") {
    throw new Error("Electron package version is missing.");
  }

  if (await isElectronRuntimeReady(electronDir, version)) {
    console.info("[electron-runtime] Electron runtime already ready.");
    return;
  }

  console.info("[electron-runtime] Electron runtime missing; running install.js.");
  await runInstallScript(electronDir);
  if (await isElectronRuntimeReady(electronDir, version)) {
    console.info("[electron-runtime] Electron runtime recovered via install.js.");
    return;
  }

  console.warn("[electron-runtime] install.js completed but runtime is still incomplete; applying fallback installer.");
  await ensureElectronRuntimeFallback(electronDir, version);
  if (!(await isElectronRuntimeReady(electronDir, version))) {
    throw new Error("Electron runtime verification failed after fallback install.");
  }
  console.info("[electron-runtime] Electron runtime recovered via fallback installer.");
}

try {
  await main();
} catch (error) {
  console.error("[electron-runtime] Failed to ensure electron runtime.");
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}

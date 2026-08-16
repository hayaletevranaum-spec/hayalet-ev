import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");

async function buildNodeBundle(entryPoint, outfile, tsconfig) {
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [join(projectRoot, entryPoint)],
    outfile: join(projectRoot, outfile),
    bundle: true,
    platform: "node",
    packages: "external",
    tsconfig: join(projectRoot, tsconfig),
    format: "esm",
  });
}

async function copyIntoDir(files, outDir) {
  await mkdir(join(projectRoot, outDir), { recursive: true });
  await Promise.all(
    files.map(async (file) => {
      await copyFile(join(projectRoot, file), join(projectRoot, outDir, file.split(/[\\/]/).pop()));
    })
  );
}

async function buildMainElectron() {
  const tsconfig = "electron/tsconfig.electron.json";
  await buildNodeBundle("electron/main.ts", "dist/electron/main.js", tsconfig);
  await buildNodeBundle(
    "electron/packaged-wrapper-main.ts",
    "dist/electron/packaged-wrapper-main.js",
    tsconfig
  );
  await buildNodeBundle(
    "electron/packaged-wrapper-cli.ts",
    "dist/electron/packaged-wrapper-cli.js",
    tsconfig
  );
  await buildNodeBundle(
    "electron/provider-tester/index.ts",
    "dist/electron/provider-tester/index.js",
    tsconfig
  );
  await copyIntoDir(
    ["electron/preload.cjs", "electron/webview-preload.cjs", "electron/room-webview-preload.cjs"],
    "dist/electron"
  );
}

async function buildGhostElectron() {
  await buildNodeBundle(
    "ghost-agent/electron/main.ts",
    "dist/ghost-agent/electron/main.js",
    "ghost-agent/tsconfig.electron.json"
  );
  await copyIntoDir(["ghost-agent/electron/preload.cjs"], "dist/ghost-agent/electron");
}

async function main() {
  const target = process.argv[2] ?? "main";
  if (target === "main") {
    await buildMainElectron();
    return;
  }
  if (target === "ghost") {
    await buildGhostElectron();
    return;
  }
  throw new Error(`Unknown electron bundle target: ${target}`);
}

main().catch((error) => {
  console.error("electron bundle build failed:", error);
  process.exitCode = 1;
});

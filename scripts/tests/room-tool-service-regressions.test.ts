import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readRoomToolServiceTreeSource(): string {
  return [
    "electron/room-tool-service.ts",
    "electron/room-tool/types.ts",
    "electron/room-tool/archive-helper.ts",
    "electron/room-tool/python-manager.ts",
    "electron/room-tool/system-command-helper.ts",
  ]
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
}

void test("room tool run request supports companion executable selection", () => {
  const typeSource = readFileSync("src/types/room-tools.ts", "utf8");
  const serviceSource = readRoomToolServiceTreeSource();

  assert.match(typeSource, /export interface RoomToolRunRequest[\s\S]*executableName\?: string;/);
  assert.match(
    serviceSource,
    /const requestedExecutableName = asNonEmptyString\(request\.executableName\);/
  );
  assert.match(serviceSource, /let allowedExecutableNames: string\[\] = \[\];/);
  assert.match(serviceSource, /does not expose companion executable/);
});

void test("room tool service stays generic and avoids laboratory-specific branching", () => {
  const serviceSource = readRoomToolServiceTreeSource();
  const handlerSource = readFileSync("electron/handlers/ipc-room-tools.ts", "utf8");

  assert.match(handlerSource, /registerHandler\("room-tools-call"/);
  assert.match(handlerSource, /registerHandler\("room-tools-cancel"/);
  assert.match(serviceSource, /case "ensure-dir":/);
  assert.match(serviceSource, /private async ensureDirPath\(/);
  assert.match(serviceSource, /ensuredPath: targetPath,/);
  assert.match(serviceSource, /private async downloadToPath\(/);
  assert.match(
    serviceSource,
    /return await this\.downloadToPath\(event, request, \{ enforceRoomManagedPath: true \}\);/
  );
  assert.match(serviceSource, /\{ enforceRoomManagedPath: false \}/);
  assert.doesNotMatch(serviceSource, /ROOM_ID\s*=\s*"laboratory"/);
  assert.doesNotMatch(serviceSource, /yt-dlp command/i);
});

void test("room tool service keeps write roots narrow while allowing packaged tool cwd", () => {
  const serviceSource = readRoomToolServiceTreeSource();

  assert.match(
    serviceSource,
    /function ensureRoomManagedPath[\s\S]*const allowedRoots = \[paths\.storageDir, paths\.toolRuntimeDir\];/
  );
  assert.match(serviceSource, /function ensureRoomToolRunCwdPath\(/);
  assert.match(
    serviceSource,
    /const allowedRoots = \[\s*paths\.storageDir,\s*paths\.toolRuntimeDir,\s*paths\.packageToolsDir,\s*getInstalledSharedToolsDir\(paths\),\s*\];/
  );
  assert.match(serviceSource, /ensureRoomToolRunCwdPath\(request\.roomId, cwd\);/);
});

void test("room tool service supports app-managed installers and system-command probes", () => {
  const serviceSource = readRoomToolServiceTreeSource();
  const typeSource = readFileSync("src/types/room-tools.ts", "utf8");
  const manifestSource = readFileSync("rooms/laboratory/tools/toolchain.manifest.json", "utf8");
  const projectToolStatusSource = readFileSync(
    "rooms/laboratory/shared/host/project-tool-status.ts",
    "utf8"
  );
  const roomSnapshotSource = readFileSync("rooms/laboratory/shared/host/room-snapshot.ts", "utf8");
  const toolOverlaySource = readFileSync("rooms/laboratory/ui/tool-management-overlay.ts", "utf8");
  const manifest = JSON.parse(manifestSource) as {
    tools: Record<
      string,
      {
        availability?: string;
        probe?: { versionRegex?: string };
        systemCommand?: {
          candidatePaths?: string[];
          companionExecutables?: string[];
          envVarNames?: string[];
        };
      }
    >;
  };

  assert.match(
    serviceSource,
    /type ToolAvailability = "installable" \| "system-command" \| "planned";/
  );
  assert.match(serviceSource, /type SystemCommandSpec = \{/);
  assert.match(serviceSource, /type PythonVenvPipInstallerSpec = \{/);
  assert.match(serviceSource, /estimatedDownloadSize\?: string;/);
  assert.match(serviceSource, /estimatedInstalledSize\?: string;/);
  assert.match(serviceSource, /supportedPythonVersions\?: string\[\];/);
  assert.match(serviceSource, /type WebPageReleaseProvider = \{/);
  assert.match(
    serviceSource,
    /type ToolReleaseProvider = GitHubReleaseProvider \| WebPageReleaseProvider;/
  );
  assert.match(serviceSource, /type ToolInstallerSpec = PythonVenvPipInstallerSpec;/);
  assert.match(
    serviceSource,
    /const PYTHON_GET_PIP_URL = "https:\/\/bootstrap\.pypa\.io\/get-pip\.py";/
  );
  assert.match(serviceSource, /envVarNames\?: string\[\];/);
  assert.match(serviceSource, /candidatePaths\?: string\[\];/);
  assert.match(typeSource, /packageToolRuntimeDir: string;/);
  assert.match(serviceSource, /installer\?: ToolInstallerSpec;/);
  assert.match(serviceSource, /plannedReason\?: string;/);
  assert.match(serviceSource, /systemCommand\?: SystemCommandSpec;/);
  assert.match(serviceSource, /copyArchiveContents\?: boolean;/);
  assert.match(serviceSource, /downloadUrlTemplate\?: string;/);
  assert.match(serviceSource, /sourceExecutableName\?: string;/);
  assert.match(serviceSource, /releaseProvider\?: ToolReleaseProvider;/);
  assert.match(serviceSource, /availability: "system-command"/);
  assert.match(serviceSource, /installable: false/);
  assert.match(serviceSource, /function expandReleaseTemplate\(/);
  assert.match(serviceSource, /function getFileNameFromUrl\(/);
  assert.match(serviceSource, /async function findArchiveContentRoot\(/);
  assert.match(serviceSource, /await cp\(archiveContentRoot, installDir, \{ recursive: true \}\);/);
  assert.match(serviceSource, /function isCrossDeviceRenameError\(/);
  assert.match(serviceSource, /async function moveDownloadedFile\(/);
  assert.match(serviceSource, /await copyFile\(sourcePath, targetPath\);/);
  assert.match(serviceSource, /await moveDownloadedFile\(downloadResult\.path, binaryPath\);/);
  assert.match(serviceSource, /releaseProvider\.type === "web-page"/);
  assert.match(
    serviceSource,
    /const latestVersion = findVersion\(releasePage, releaseProvider\.versionRegex\);/
  );
  assert.match(serviceSource, /async function resolveSystemCommandBinaryPath\(/);
  assert.match(serviceSource, /async function resolveCompanionSystemCommandPath\(/);
  assert.match(serviceSource, /resolveCompanionSystemCommandPath\(selectedExecutableName/);
  assert.match(serviceSource, /allowPathLookup\?: boolean \| undefined;/);
  assert.match(serviceSource, /if \(options\?\.allowPathLookup === false\) \{\s*return null;\s*\}/);
  assert.match(serviceSource, /expandRuntimePathTemplate\(/);
  assert.match(serviceSource, /private isToolInstallable\(toolManifest: ToolManifest\): boolean/);
  assert.match(serviceSource, /private isSystemCommandTool\(toolManifest: ToolManifest\): boolean/);
  assert.match(
    serviceSource,
    /private getInstallerType\(toolManifest: ToolManifest\): ToolInstallerSpec\["type"\] \| null/
  );
  assert.match(serviceSource, /private resolvePythonVenvPipInstaller\(/);
  assert.match(serviceSource, /private async resolvePythonBootstrapInvocation\(/);
  assert.match(serviceSource, /function buildPythonBootstrapCandidates\(/);
  assert.match(serviceSource, /function killSpawnedProcessTree\(/);
  assert.match(serviceSource, /MANAGED_PYTHON_RELEASE_PROVIDER/);
  assert.match(serviceSource, /python-build-standalone/);
  assert.match(serviceSource, /install_only_stripped/);
  assert.match(serviceSource, /function getManagedPythonRuntimeDir\(/);
  assert.match(serviceSource, /private async downloadManagedPythonAsset\(/);
  assert.match(serviceSource, /private async ensureManagedPythonRuntime\(/);
  assert.match(serviceSource, /Managed room Python ready/);
  assert.match(serviceSource, /extractArchive\(archivePath, extractDir, "tar\.gz"\)/);
  assert.match(
    serviceSource,
    /mkdtemp\(join\(dirname\(runtimeDir\), `\.python-runtime-\$\{version\}-`\)\)/
  );
  assert.match(
    serviceSource,
    /supportedPythonVersions: normalizeStringArray\(installer\.supportedPythonVersions\)/
  );
  assert.match(serviceSource, /isPythonRuntimeVersionSupported\(/);
  assert.match(serviceSource, /private shouldUsePythonWithoutPipFallback\(/);
  assert.match(serviceSource, /private isMissingPythonPip\(/);
  assert.match(serviceSource, /private async bootstrapPythonVenvPip\(/);
  assert.match(serviceSource, /async function isPythonVenvReusable\(/);
  assert.match(serviceSource, /Repair room-local python runtime: \$\{venvDir\}/);
  assert.match(
    serviceSource,
    /await rm\(venvDir, \{ recursive: true, force: true \}\);\s*venvPythonPath = null;/
  );
  assert.match(serviceSource, /private async installPythonVenvPipTool\(/);
  assert.match(serviceSource, /private async checkPythonVenvPipUpdates\(/);
  assert.match(
    serviceSource,
    /allowPathLookup: false,\s*candidatePaths: resolved\.systemCommand\.candidatePaths,/
  );
  assert.match(serviceSource, /"list", "--outdated", "--format=json"/);
  assert.match(serviceSource, /updateAvailable: outdatedPackages\.length > 0/);
  assert.match(serviceSource, /private shouldUseSystemCommandFallback\(/);
  assert.match(serviceSource, /private async probeSystemCommandToolStatus\(/);
  assert.match(
    serviceSource,
    /const installerType = this\.getInstallerType\(resolved\.manifest\);\s*const binaryPath = await resolveSystemCommandBinaryPath\(resolved\.systemCommand\.executableName, \{\s*allowPathLookup: installerType !== "python-venv-pip",/
  );
  assert.match(
    serviceSource,
    /const allowPathLookup =\s*this\.getInstallerType\(resolvedSystemCommand\.manifest\) !== "python-venv-pip";/
  );
  assert.match(serviceSource, /installerType,/);
  assert.match(
    serviceSource,
    /args: \[\.\.\.bootstrap\.argsPrefix, "-m", "venv", "--without-pip", venvDir\]/
  );
  assert.match(serviceSource, /Download pip bootstrap: \$\{PYTHON_GET_PIP_URL\}/);
  assert.match(serviceSource, /phaseLabel: "Python paketleri indiriliyor ve kuruluyor"/);
  assert.match(serviceSource, /detailLines: pythonInstallDetailLines/);
  assert.match(typeSource, /lastError\?: string \| null;/);
  assert.match(typeSource, /phaseLabel\?: string \| null;/);
  assert.match(typeSource, /detailLines\?: string\[\];/);
  assert.match(serviceSource, /lastError: data\.lastError \?\? null,/);
  assert.match(
    serviceSource,
    /function summarizeCommandFailure\(result: \{ stderr: string; stdout: string \}\): string \| null/
  );
  assert.match(serviceSource, /async function resolveInstallableToolInstallDir\(/);
  assert.match(
    serviceSource,
    /packageToolRuntimeDir: join\(legacyInstalledDir, "tools", "runtime", platformKey\),/
  );
  assert.match(
    serviceSource,
    /toolRuntimeDir: join\(storageDir, "tools", "runtime", platformKey\),/
  );
  assert.match(
    serviceSource,
    /const legacyInstallDir = join\(paths\.packageToolRuntimeDir, installDirName\);/
  );
  assert.match(serviceSource, /await rename\(legacyInstallDir, preferredInstallDir\);/);
  assert.match(
    serviceSource,
    /lastError: probe\.exitCode === 0 \? null : summarizeCommandFailure\(probe\),/
  );
  assert.match(
    serviceSource,
    /throw new Error\(\s*asNonEmptyString\(probeTool\?\.lastError\) \?\?/
  );
  assert.match(
    projectToolStatusSource,
    /lastError:\s*typeof probeTool\["lastError"\] === "string"/
  );
  assert.match(roomSnapshotSource, /supportedPythonVersions/);
  assert.match(toolOverlaySource, /managedPythonRuntime/);
  assert.match(toolOverlaySource, /requiredPython/);
  assert.match(
    manifestSource,
    /"packages":\s*\[\s*"tensorflow",\s*"tensorflow_hub",\s*"numpy",\s*"scipy",\s*"setuptools<81"\s*\]/
  );
  assert.match(
    manifestSource,
    /"supportedPythonVersions":\s*\[\s*"3\.12",\s*"3\.11",\s*"3\.10"\s*\]/
  );
  assert.match(
    manifestSource,
    /"pyaudioanalysis"[\s\S]*"supportedPythonVersions":\s*\[\s*"3\.12",\s*"3\.11",\s*"3\.10"\s*\]/
  );
  assert.match(manifestSource, /"estimatedDownloadSize":\s*"3 - 5 GB"/);
  assert.match(
    manifestSource,
    /"packages":\s*\[\s*"pyAudioAnalysis",\s*"numpy",\s*"scipy",\s*"scikit-learn",\s*"hmmlearn",\s*"matplotlib",\s*"eyed3",\s*"pydub"\s*\]/
  );
  assert.match(manifestSource, /"visual-forensics-py"/);
  assert.match(
    manifestSource,
    /"packages":\s*\[\s*"opencv-contrib-python-headless",\s*"scikit-image",\s*"numpy",\s*"scipy"\s*\]/
  );
  assert.match(manifestSource, /"exiftool"[\s\S]*"availability":\s*"installable"/);
  assert.match(manifestSource, /"exiftool"[\s\S]*"type":\s*"web-page"/);
  assert.match(manifestSource, /"exiftool"[\s\S]*"copyArchiveContents":\s*true/);
  assert.match(manifestSource, /"exiftool"[\s\S]*"sourceExecutableName":\s*"exiftool\(-k\)\.exe"/);
  assert.match(manifestSource, /"mediainfo"[\s\S]*"availability":\s*"installable"/);
  assert.match(manifestSource, /"mediainfo"[\s\S]*"downloadUrlTemplate"/);
  assert.equal(manifest.tools["ffmpeg"]?.availability, "system-command");
  assert.deepEqual(manifest.tools["ffmpeg"].systemCommand?.envVarNames, [
    "HAYALET_FFMPEG_PATH",
    "FFMPEG_PATH",
  ]);
  assert.ok(
    (manifest.tools["ffmpeg"].systemCommand.candidatePaths ?? []).some((entry) =>
      entry.includes("${dataDir}/host-dependencies/ffmpeg/win32-x64/ffmpeg.exe")
    )
  );
  assert.ok(
    (manifest.tools["ffmpeg"].systemCommand.companionExecutables ?? []).includes("ffprobe.exe")
  );
  assert.equal(manifest.tools["ffmpeg-libvmaf"]?.probe?.versionRegex, "\\blibvmaf\\b");
  assert.equal(manifest.tools["ffmpeg-libvmaf"].availability, "system-command");
  assert.ok(
    (manifest.tools["ffmpeg-libvmaf"].systemCommand?.candidatePaths ?? []).some((entry) =>
      entry.includes("${dataDir}/host-dependencies/ffmpeg/win32-x64/ffmpeg.exe")
    )
  );
  assert.match(manifestSource, /"raft-optical-flow"[\s\S]*"availability":\s*"system-command"/);
  assert.match(
    manifestSource,
    /"raft-optical-flow"[\s\S]*"packages":\s*\[\s*"torch",\s*"torchvision",\s*"opencv-python-headless",\s*"numpy",\s*"scipy"\s*\]/
  );
  assert.match(toolOverlaySource, /verifySystemCommand/);
  assert.match(toolOverlaySource, /systemCommandVerified/);
  assert.match(toolOverlaySource, /lastCheckedAt/);
  assert.doesNotMatch(toolOverlaySource, /strategy\.systemCommand/);
  assert.doesNotMatch(manifestSource, /"audioop-lts"/);
  assert.match(
    serviceSource,
    /private resolveSystemCommandTool\(\s*manifest: ToolchainManifest,\s*toolId: string\s*\): \{/
  );
  assert.match(
    serviceSource,
    /private getPlannedToolMessage\(toolId: string, toolManifest: ToolManifest\): string/
  );
});

void test("room tool service resolves toolchain manifests from installed and workspace fallback layouts", () => {
  const serviceSource = readRoomToolServiceTreeSource();

  assert.match(
    serviceSource,
    /function getInstalledSharedToolsDir\(paths: RoomToolRuntimePaths\): string/
  );
  assert.match(
    serviceSource,
    /function getToolchainManifestCandidates\(paths: RoomToolRuntimePaths\): string\[\]/
  );
  assert.match(
    serviceSource,
    /join\(getInstalledSharedToolsDir\(paths\), "toolchain\.manifest\.json"\)/
  );
  assert.match(
    serviceSource,
    /join\(Paths\.getInstalledRoomDir\(paths\.roomId\), "tools", "toolchain\.manifest\.json"\)/
  );
  assert.match(
    serviceSource,
    /join\(\s*paths\.storageDir,\s*"build",\s*"workspace",\s*"tools",\s*"toolchain\.manifest\.json"\s*\)/
  );
  assert.match(
    serviceSource,
    /join\(\s*paths\.storageDir,\s*"build",\s*"workspace",\s*"shared",\s*"data",\s*"tools",\s*"toolchain\.manifest\.json"\s*\)/
  );
  assert.match(serviceSource, /join\(getWorkspaceToolsDir\(paths\), "toolchain\.manifest\.json"\)/);
  assert.match(
    serviceSource,
    /join\(\s*Paths\.getRoomsWorkspaceDir\(\),\s*paths\.roomId,\s*"shared",\s*"data",\s*"tools",\s*"toolchain\.manifest\.json"\s*\)/
  );
  assert.match(
    serviceSource,
    /const manifestPath = candidatePaths\.find\(\(candidate\) => existsSync\(candidate\)\);/
  );
  assert.match(serviceSource, /const allowedRoots = \[paths\.storageDir, paths\.toolRuntimeDir\];/);
});

void test("room tool preload and global typings expose the generic room-tools seam", () => {
  const preloadSource = readFileSync("electron/preload.cjs", "utf8");
  const globalTypes = readFileSync("src/js/global.d.ts", "utf8");

  assert.match(
    preloadSource,
    /roomToolsCall: \(request\) => ipcRenderer\.invoke\("room-tools-call", request\)/
  );
  assert.match(
    preloadSource,
    /roomToolsCancel: \(request\) => ipcRenderer\.invoke\("room-tools-cancel", request\)/
  );
  assert.match(preloadSource, /onRoomToolsProgress: \(callback\)/);
  assert.match(
    globalTypes,
    /roomToolsCall: \(request: RoomToolCallRequest\) => Promise<RoomToolCallResult>;/
  );
  assert.match(
    globalTypes,
    /roomToolsCancel: \(request: RoomToolCancelRequest\) => Promise<RoomToolCancelResult>;/
  );
});

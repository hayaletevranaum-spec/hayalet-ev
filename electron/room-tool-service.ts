import { once } from "events";
import { spawn } from "child_process";
import { createWriteStream, existsSync } from "fs";
import { cp, mkdtemp, readFile, rename, rm, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { tmpdir } from "os";
import type { IpcMainInvokeEvent } from "electron";
import { getLoggerCore } from "./logger/index.js";
import type {
  RoomFileDownloadResult,
  RoomToolCallRequest,
  RoomToolCallResult,
  RoomToolCancelRequest,
  RoomToolCancelResult,
  RoomToolProgressEvent,
  RoomToolRuntimePaths,
  RoomToolUpdateCheck,
} from "../src/types/room-tools.ts";
import { LogCategory, LogLevel } from "@shared/index.js";
import { transcriptService } from "./transcript-service.ts";

import {
  type PlatformKey,
  type ToolchainManifest,
  type ToolAvailability,
  type SystemCommandSpec,
  type ToolInstallerSpec,
  type ToolManifest,
  type InstallableToolManifest,
  type SystemCommandToolManifest,
  type ResolvedPythonVenvPipInstaller,
  type ToolAssetSpec,
  type GitHubReleaseAsset,
  type ToolReleaseInfo,
  MANAGED_PYTHON_RELEASE_PROVIDER,
  MANAGED_PYTHON_ASSET_TARGETS,
} from "./room-tool/types.ts";

import {
  ensureDir,
  runCommand,
  fetchText,
  fetchGitHubRelease,
  expandReleaseTemplate,
  getFileNameFromUrl,
  collectFilesRecursive,
  findArchiveContentRoot,
  resolveUniquePath,
  markExecutable,
  extractArchive,
  moveDownloadedFile,
} from "./room-tool/archive-helper.ts";

import {
  asNonEmptyString,
  normalizeStringArray,
  readPythonMajorMinor,
  isPythonRuntimeVersionSupported,
  buildPythonBootstrapCandidates,
  formatPythonVersionList,
  buildMissingPythonBootstrapMessage,
  selectManagedPythonAsset,
  killSpawnedProcessTree,
  isPythonVenvReusable,
  resolveExistingPythonVenvExecutable,
  getManagedPythonVersionCandidates,
  getManagedPythonRuntimeDir,
  resolveExistingManagedPythonExecutable,
  normalizePythonPackageName,
  parsePythonOutdatedPackages,
  normalizeRequestId,
  normalizeRoomId,
  normalizeJobId,
  detectPlatformKey,
  PYTHON_GET_PIP_URL,
} from "./room-tool/python-manager.ts";

import {
  ensureAbsolutePath,
  resolveRuntimePaths,
  expandRuntimePathTemplate,
  ensureRoomManagedPath,
  ensureRoomToolRunCwdPath,
  findVersion,
  compareLooseVersion,
  resolveSystemCommandBinaryPath,
  resolveCompanionSystemCommandPath,
  readJsonFile,
  normalizeToolStatus,
  summarizeCommandFailure,
  resolveInstallableToolInstallDir,
  buildProgressMetadata,
  getToolchainManifestCandidates,
} from "./room-tool/system-command-helper.ts";

const ROOM_TOOLS_PROGRESS_CHANNEL = "room-tools:progress";
const logger = getLoggerCore();

type SpawnedProcess = ReturnType<typeof spawn>;

type ActiveJob =
  | {
      roomId: string;
      jobId: string;
      cancel: () => void;
    }
  | undefined;

class RoomToolService {
  private activeJobs = new Map<string, ActiveJob>();

  async handleCall(
    event: IpcMainInvokeEvent,
    request: RoomToolCallRequest
  ): Promise<RoomToolCallResult> {
    const roomId = normalizeRoomId(request.roomId);
    if (roomId === "") {
      throw new Error("roomId is required for room-tools-call");
    }

    switch (request.operation) {
      case "resolve-paths":
        return await this.resolvePaths(request);
      case "ensure-dir":
        return await this.ensureDirPath(request);
      case "delete-path":
        return await this.deletePath(request);
      case "download-file":
        return await this.downloadFile(event, request);
      case "transcript-status":
        return await this.readTranscriptStatus(request);
      case "transcript-list-models":
        return await this.listTranscriptModels(request);
      case "transcript-transcribe-file":
        return await this.transcribeManagedFile(request);
      case "tool-probe":
        return await this.probeTool(request);
      case "tool-check-for-updates":
        return await this.checkForUpdates(request);
      case "tool-install":
        return await this.installTool(event, request, false);
      case "tool-update":
        return await this.installTool(event, request, true);
      case "tool-run":
        return await this.runTool(event, request);
      default:
        throw new Error(
          `Unsupported room-tools operation: ${String((request as { operation?: unknown }).operation)}`
        );
    }
  }

  cancel(request: RoomToolCancelRequest): RoomToolCancelResult {
    const roomId = normalizeRoomId(request.roomId);
    const jobId = asNonEmptyString(request.jobId);
    if (roomId === "" || jobId === null) {
      throw new Error("roomId and jobId are required for room-tools-cancel");
    }

    const active = this.activeJobs.get(jobId);
    if (active?.roomId !== roomId) {
      return {
        success: true,
        roomId,
        jobId,
        cancelled: false,
        requestId: normalizeRequestId(request.requestId),
      };
    }

    active.cancel();
    this.activeJobs.delete(jobId);
    return {
      success: true,
      roomId,
      jobId,
      cancelled: true,
      requestId: normalizeRequestId(request.requestId),
    };
  }

  private emitProgress(
    event: IpcMainInvokeEvent,
    payload: Omit<RoomToolProgressEvent, "timestamp">
  ): void {
    const nextPayload: RoomToolProgressEvent = {
      ...payload,
      timestamp: Date.now(),
    };
    event.sender.send(ROOM_TOOLS_PROGRESS_CHANNEL, nextPayload);
  }

  private async resolvePaths(
    request: Extract<RoomToolCallRequest, { operation: "resolve-paths" }>
  ): Promise<RoomToolCallResult> {
    const paths = resolveRuntimePaths(request.roomId);
    await Promise.all([
      ensureDir(paths.storageDir),
      ensureDir(paths.projectsDir),
      ensureDir(paths.toolRuntimeDir),
    ]);
    return {
      success: true,
      operation: request.operation,
      requestId: normalizeRequestId(request.requestId),
      paths,
    };
  }

  private async ensureDirPath(
    request: Extract<RoomToolCallRequest, { operation: "ensure-dir" }>
  ): Promise<RoomToolCallResult> {
    const targetPath = ensureAbsolutePath(request.targetPath);
    ensureRoomManagedPath(request.roomId, targetPath);
    await ensureDir(targetPath);
    return {
      success: true,
      operation: request.operation,
      requestId: normalizeRequestId(request.requestId),
      ensuredPath: targetPath,
    };
  }

  private async deletePath(
    request: Extract<RoomToolCallRequest, { operation: "delete-path" }>
  ): Promise<RoomToolCallResult> {
    const targetPath = ensureAbsolutePath(request.targetPath);
    ensureRoomManagedPath(request.roomId, targetPath);
    await rm(targetPath, { recursive: request.recursive === true, force: true });
    return {
      success: true,
      operation: request.operation,
      requestId: normalizeRequestId(request.requestId),
      deletedPath: targetPath,
    };
  }

  private async downloadFile(
    event: IpcMainInvokeEvent,
    request: {
      operation: RoomToolCallRequest["operation"];
      roomId: string;
      requestId?: string | null;
      jobId?: string | null;
      url: string;
      destinationPath: string;
      overwrite?: boolean;
      headers?: Record<string, string>;
    }
  ): Promise<RoomToolCallResult> {
    return await this.downloadToPath(event, request, { enforceRoomManagedPath: true });
  }

  private async readTranscriptStatus(
    request: Extract<RoomToolCallRequest, { operation: "transcript-status" }>
  ): Promise<RoomToolCallResult> {
    return {
      success: true,
      operation: request.operation,
      requestId: normalizeRequestId(request.requestId),
      transcriptStatus: await transcriptService.getStatus(),
    };
  }

  private async listTranscriptModels(
    request: Extract<RoomToolCallRequest, { operation: "transcript-list-models" }>
  ): Promise<RoomToolCallResult> {
    return {
      success: true,
      operation: request.operation,
      requestId: normalizeRequestId(request.requestId),
      transcriptModels: await transcriptService.listModels(),
    };
  }

  private async transcribeManagedFile(
    request: Extract<RoomToolCallRequest, { operation: "transcript-transcribe-file" }>
  ): Promise<RoomToolCallResult> {
    const result = await transcriptService.transcribeFile({
      ...request,
      roomId: request.roomId,
    });

    return {
      success: result.success === true,
      operation: request.operation,
      requestId: normalizeRequestId(request.requestId),
      ...(typeof request.jobId === "string" && request.jobId.trim() !== ""
        ? { jobId: request.jobId }
        : {}),
      ...(typeof result.error === "string" && result.error.trim() !== ""
        ? { error: result.error }
        : {}),
      transcription: result,
    };
  }

  private async downloadToPath(
    event: IpcMainInvokeEvent,
    request: {
      operation: RoomToolCallRequest["operation"];
      roomId: string;
      requestId?: string | null;
      jobId?: string | null;
      url: string;
      destinationPath: string;
      overwrite?: boolean;
      headers?: Record<string, string>;
    },
    options: {
      enforceRoomManagedPath: boolean;
    }
  ): Promise<RoomToolCallResult> {
    const roomId = request.roomId;
    const jobId = normalizeJobId(request.jobId, "room-download");
    const requestId = normalizeRequestId(request.requestId);
    const destinationPath = ensureAbsolutePath(request.destinationPath);
    if (options.enforceRoomManagedPath === true) {
      ensureRoomManagedPath(roomId, destinationPath);
    }

    const controller = new AbortController();
    this.activeJobs.set(jobId, {
      roomId,
      jobId,
      cancel: (): void => {
        controller.abort();
      },
    });

    this.emitProgress(event, {
      roomId,
      operation: request.operation,
      requestId,
      jobId,
      stage: "queued",
      message: "Download queued.",
    });

    try {
      const response = await fetch(request.url, {
        signal: controller.signal,
        ...(request.headers !== undefined ? { headers: request.headers } : {}),
      });
      if (!response.ok || response.body === null) {
        throw new Error(`Download failed (${response.status}) for ${request.url}`);
      }

      const targetPath =
        request.overwrite === true ? destinationPath : resolveUniquePath(destinationPath);
      await ensureDir(dirname(targetPath));
      const tempPath = `${targetPath}.part-${Date.now()}`;
      const fileStream = createWriteStream(tempPath);
      const totalBytesHeader = Number(response.headers.get("content-length") ?? "0");
      const totalBytes =
        Number.isFinite(totalBytesHeader) && totalBytesHeader > 0 ? totalBytesHeader : 0;
      let writtenBytes = 0;
      const reader = response.body.getReader();

      this.emitProgress(event, {
        roomId,
        operation: request.operation,
        requestId,
        jobId,
        stage: "running",
        bytesReceived: 0,
        ...(totalBytes > 0 ? { bytesTotal: totalBytes } : {}),
        message: "Download started.",
      });

      const pumpDownload = async (): Promise<void> => {
        const { done, value } = await reader.read();
        if (done) {
          return;
        }
        writtenBytes += value.byteLength;
        if (!fileStream.write(Buffer.from(value))) {
          await once(fileStream, "drain");
        }
        this.emitProgress(event, {
          roomId,
          operation: request.operation,
          requestId,
          jobId,
          stage: "downloading",
          bytesReceived: writtenBytes,
          ...(totalBytes > 0 ? { bytesTotal: totalBytes } : {}),
          ...(totalBytes > 0
            ? { percent: Math.min(100, Math.round((writtenBytes / totalBytes) * 100)) }
            : {}),
        });
        await pumpDownload();
      };

      await pumpDownload();

      await new Promise<void>((resolvePromise, rejectPromise) => {
        fileStream.end(() => {
          resolvePromise();
        });
        fileStream.once("error", rejectPromise);
      });

      await rename(tempPath, targetPath);
      this.emitProgress(event, {
        roomId,
        operation: request.operation,
        requestId,
        jobId,
        stage: "completed",
        bytesReceived: writtenBytes,
        ...(totalBytes > 0 ? { bytesTotal: totalBytes } : {}),
        percent: 100,
        message: "Download complete.",
      });

      return {
        success: true,
        operation: request.operation,
        requestId,
        jobId,
        download: {
          url: request.url,
          path: targetPath,
          fileName: targetPath.split(/[\\/]/).pop() ?? "download",
          bytesWritten: writtenBytes,
          contentType: response.headers.get("content-type"),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitProgress(event, {
        roomId,
        operation: request.operation,
        requestId,
        jobId,
        stage: controller.signal.aborted ? "cancelled" : "failed",
        message,
      });
      throw error;
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  private async probeTool(
    request: Extract<RoomToolCallRequest, { operation: "tool-probe" }>
  ): Promise<RoomToolCallResult> {
    const manifest = await this.loadToolchainManifest(request.roomId);
    const toolManifest = this.getToolManifest(manifest, request.toolId);
    const paths = resolveRuntimePaths(request.roomId);
    const installDir = await resolveInstallableToolInstallDir(
      paths,
      toolManifest.installDirName ?? request.toolId
    );
    const detectedPlatformKey = detectPlatformKey();
    const platformKey = detectedPlatformKey ?? `${process.platform}-${process.arch}`;

    if (this.getToolAvailability(toolManifest) === "planned") {
      return {
        success: true,
        operation: request.operation,
        requestId: normalizeRequestId(request.requestId),
        tool: normalizeToolStatus(request.toolId, {
          installed: false,
          installDir,
          details: {
            platformKey,
            availability: "planned",
            installable: false,
            plannedReason: asNonEmptyString(toolManifest.plannedReason),
          },
        }),
      };
    }

    if (
      this.isSystemCommandTool(toolManifest) === true ||
      this.shouldUseSystemCommandFallback(toolManifest, detectedPlatformKey) === true
    ) {
      return await this.probeSystemCommandToolStatus(
        request.toolId,
        toolManifest,
        paths,
        platformKey,
        normalizeRequestId(request.requestId),
        request.operation
      );
    }

    const resolved = this.resolveTool(manifest, request.toolId);
    const binaryPath = join(installDir, resolved.asset.executableName);

    if (!existsSync(binaryPath)) {
      return {
        success: true,
        operation: request.operation,
        requestId: normalizeRequestId(request.requestId),
        tool: normalizeToolStatus(request.toolId, {
          installed: false,
          installDir,
          details: {
            platformKey,
            availability: "installable",
            installable: true,
          },
        }),
      };
    }

    const probe = await runCommand(
      binaryPath,
      resolved.manifest.probe.args,
      installDir,
      undefined,
      12_000
    );
    const combinedOutput = `${probe.stdout}\n${probe.stderr}`;
    const version =
      probe.exitCode === 0
        ? findVersion(combinedOutput, resolved.manifest.probe.versionRegex)
        : null;

    return {
      success: true,
      operation: request.operation,
      requestId: normalizeRequestId(request.requestId),
      tool: normalizeToolStatus(request.toolId, {
        installed: probe.exitCode === 0,
        version,
        binaryPath,
        installDir,
        companionPaths: Object.fromEntries(
          (resolved.asset.companionExecutables ?? [])
            .map((name) => [name, join(installDir, name)] as const)
            .filter((entry) => existsSync(entry[1]))
        ),
        details: {
          platformKey,
          availability: "installable",
          installable: true,
        },
      }),
    };
  }

  private async checkForUpdates(
    request: Extract<RoomToolCallRequest, { operation: "tool-check-for-updates" }>
  ): Promise<RoomToolCallResult> {
    const manifest = await this.loadToolchainManifest(request.roomId);
    const toolManifest = this.getToolManifest(manifest, request.toolId);
    const platformKey = detectPlatformKey();
    if (this.getInstallerType(toolManifest) === "python-venv-pip") {
      return await this.checkPythonVenvPipUpdates(request, toolManifest);
    }
    if (this.isToolInstallable(toolManifest) !== true) {
      const update: RoomToolUpdateCheck = {
        toolId: request.toolId,
        installedVersion: asNonEmptyString(request.installedVersion),
        latestVersion: null,
        latestReleaseTag: null,
        latestReleaseName: null,
        updateAvailable: false,
        releaseUrl:
          this.isSystemCommandTool(toolManifest) === true
            ? null
            : asNonEmptyString(toolManifest.releaseProvider?.releaseUrl),
      };

      return {
        success: true,
        operation: request.operation,
        requestId: normalizeRequestId(request.requestId),
        update,
      };
    }

    if (this.shouldUseSystemCommandFallback(toolManifest, platformKey) === true) {
      const update: RoomToolUpdateCheck = {
        toolId: request.toolId,
        installedVersion: asNonEmptyString(request.installedVersion),
        latestVersion: null,
        latestReleaseTag: null,
        latestReleaseName: null,
        updateAvailable: false,
        releaseUrl: asNonEmptyString(toolManifest.releaseProvider?.releaseUrl),
      };

      return {
        success: true,
        operation: request.operation,
        requestId: normalizeRequestId(request.requestId),
        update,
      };
    }

    const resolved = this.resolveTool(manifest, request.toolId);
    const release = await this.resolveLatestToolRelease(resolved.manifest, resolved.asset);
    const latestVersion = release.tag ?? release.name;
    const installedReleaseTag = asNonEmptyString(request.installedReleaseTag);
    const installedReleaseName = asNonEmptyString(request.installedReleaseName);
    const installedVersion = asNonEmptyString(request.installedVersion);

    let updateAvailable = true;
    if (installedReleaseTag !== null && release.tag !== null) {
      updateAvailable = installedReleaseTag !== release.tag;
    } else if (installedReleaseName !== null && release.name !== null) {
      updateAvailable = installedReleaseName !== release.name;
    } else if (installedVersion !== null && latestVersion !== null) {
      updateAvailable = compareLooseVersion(latestVersion, installedVersion) > 0;
    }

    const update: RoomToolUpdateCheck = {
      toolId: request.toolId,
      installedVersion,
      latestVersion,
      latestReleaseTag: release.tag,
      latestReleaseName: release.name,
      updateAvailable,
      releaseUrl: release.releaseUrl,
    };

    return {
      success: true,
      operation: request.operation,
      requestId: normalizeRequestId(request.requestId),
      update,
    };
  }

  private async checkPythonVenvPipUpdates(
    request: Extract<RoomToolCallRequest, { operation: "tool-check-for-updates" }>,
    toolManifest: ToolManifest
  ): Promise<RoomToolCallResult> {
    const requestId = normalizeRequestId(request.requestId);
    const paths = resolveRuntimePaths(request.roomId);
    const resolved = this.resolvePythonVenvPipInstaller(toolManifest, request.toolId);
    const binaryPath = await resolveSystemCommandBinaryPath(resolved.systemCommand.executableName, {
      allowPathLookup: false,
      candidatePaths: resolved.systemCommand.candidatePaths,
      envVarNames: resolved.systemCommand.envVarNames,
      runtimePaths: paths,
    });

    if (binaryPath === null) {
      throw new Error(`${request.toolId} is not installed in the room-local Python runtime.`);
    }

    const probe = await runCommand(
      binaryPath,
      ["-m", "pip", "--disable-pip-version-check", "list", "--outdated", "--format=json"],
      dirname(binaryPath),
      undefined,
      60_000
    );
    if (probe.exitCode !== 0) {
      throw new Error(
        asNonEmptyString(probe.stderr) ??
          asNonEmptyString(probe.stdout) ??
          `${request.toolId} package update check failed.`
      );
    }

    const trackedPackages = new Set(
      resolved.installer.packages
        .map(normalizePythonPackageName)
        .filter((entry): entry is string => entry !== null)
    );
    const outdatedPackages = parsePythonOutdatedPackages(probe.stdout).filter(function (entry) {
      const packageName = normalizePythonPackageName(entry.name);
      return packageName !== null && trackedPackages.has(packageName);
    });
    const latestVersion =
      outdatedPackages.length === 0
        ? asNonEmptyString(request.installedVersion)
        : outdatedPackages
            .slice(0, 4)
            .map(function (entry) {
              return `${entry.name} ${entry.latestVersion ?? "latest"}`;
            })
            .join(", ");
    const update: RoomToolUpdateCheck = {
      toolId: request.toolId,
      installedVersion: asNonEmptyString(request.installedVersion),
      latestVersion,
      latestReleaseTag: null,
      latestReleaseName:
        outdatedPackages.length === 0
          ? null
          : `${String(outdatedPackages.length)} package update(s)`,
      updateAvailable: outdatedPackages.length > 0,
      releaseUrl: null,
    };

    return {
      success: true,
      operation: request.operation,
      requestId,
      update,
    };
  }

  private async installTool(
    event: IpcMainInvokeEvent,
    request: Extract<RoomToolCallRequest, { operation: "tool-install" | "tool-update" }>,
    isUpdate: boolean
  ): Promise<RoomToolCallResult> {
    const requestId = normalizeRequestId(request.requestId);
    const jobId = normalizeJobId(
      request.jobId,
      isUpdate ? "room-tool-update" : "room-tool-install"
    );
    const manifest = await this.loadToolchainManifest(request.roomId);
    const toolManifest = this.getToolManifest(manifest, request.toolId);
    if (this.isSystemCommandTool(toolManifest) === true) {
      if (this.getInstallerType(toolManifest) === "python-venv-pip") {
        return await this.installPythonVenvPipTool(event, request, toolManifest, jobId);
      }
      return await this.recheckSystemCommandTool(request);
    }
    if (this.shouldUseSystemCommandFallback(toolManifest, detectPlatformKey()) === true) {
      return await this.recheckSystemCommandTool(request);
    }
    if (this.isToolInstallable(toolManifest) !== true) {
      throw new Error(this.getPlannedToolMessage(request.toolId, toolManifest));
    }
    const resolved = this.resolveTool(manifest, request.toolId);
    const paths = resolveRuntimePaths(request.roomId);
    const installDir = join(paths.toolRuntimeDir, resolved.installDirName);
    await resolveInstallableToolInstallDir(paths, resolved.installDirName);
    const tempRoot = await mkdtemp(join(tmpdir(), `hayalet-room-tool-${request.toolId}-`));
    const downloadPath = join(tempRoot, resolved.releaseAssetNameHint);

    this.activeJobs.set(jobId, {
      roomId: request.roomId,
      jobId,
      cancel: () => {},
    });

    try {
      const release = await this.resolveLatestToolRelease(resolved.manifest, resolved.asset);
      this.emitProgress(event, {
        roomId: request.roomId,
        operation: request.operation,
        requestId,
        jobId,
        toolId: request.toolId,
        stage: "queued",
        message: release.asset.name,
      });

      const downloadResult = await this.downloadReleaseAsset(
        event,
        request.roomId,
        request.operation,
        requestId,
        jobId,
        release.asset.browser_download_url,
        downloadPath
      );

      await rm(installDir, { recursive: true, force: true });
      await ensureDir(installDir);

      if (resolved.asset.archive === "none") {
        const binaryPath = join(installDir, resolved.asset.executableName);
        await moveDownloadedFile(downloadResult.path, binaryPath);
        await markExecutable(binaryPath);
      } else {
        const extractDir = join(tempRoot, "extract");
        this.emitProgress(event, {
          roomId: request.roomId,
          operation: request.operation,
          requestId,
          jobId,
          toolId: request.toolId,
          stage: "extracting",
          message: resolved.asset.archive,
        });
        await extractArchive(downloadResult.path, extractDir, resolved.asset.archive);
        const archiveContentRoot = await findArchiveContentRoot(extractDir);
        if (resolved.asset.copyArchiveContents === true) {
          await cp(archiveContentRoot, installDir, { recursive: true });
        }
        const searchRoot =
          resolved.asset.copyArchiveContents === true ? installDir : archiveContentRoot;
        const files = await collectFilesRecursive(searchRoot);
        const executables = [
          {
            sourceName: resolved.asset.sourceExecutableName ?? resolved.asset.executableName,
            targetName: resolved.asset.executableName,
          },
          ...(resolved.asset.companionExecutables ?? []).map((executableName) => ({
            sourceName: executableName,
            targetName: executableName,
          })),
        ];

        await Promise.all(
          executables.map(async (executable): Promise<void> => {
            const sourcePath =
              files.find((filePath) => filePath.split(/[\\/]/).pop() === executable.sourceName) ??
              null;
            if (sourcePath === null) {
              throw new Error(
                `Could not find ${executable.sourceName} inside ${release.asset.name}`
              );
            }
            const targetPath = join(installDir, executable.targetName);
            if (sourcePath !== targetPath) {
              if (resolved.asset.copyArchiveContents === true) {
                await rm(targetPath, { force: true });
                await rename(sourcePath, targetPath);
              } else {
                const sourceBuffer = await readFile(sourcePath);
                await writeFile(targetPath, sourceBuffer);
              }
            }
            await markExecutable(targetPath);
          })
        );
      }

      const probed = await this.probeTool({
        operation: "tool-probe",
        roomId: request.roomId,
        requestId,
        toolId: request.toolId,
      });
      const nextTool = normalizeToolStatus(request.toolId, {
        ...(probed.tool ?? {}),
        releaseTag: release.tag,
        releaseName: release.name,
        installDir,
      });

      this.emitProgress(event, {
        roomId: request.roomId,
        operation: request.operation,
        requestId,
        jobId,
        toolId: request.toolId,
        stage: "completed",
        percent: 100,
        message: nextTool.binaryPath ?? installDir,
      });

      return {
        success: true,
        operation: request.operation,
        requestId,
        jobId,
        tool: nextTool,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitProgress(event, {
        roomId: request.roomId,
        operation: request.operation,
        requestId,
        jobId,
        toolId: request.toolId,
        stage: "failed",
        message,
      });
      throw error;
    } finally {
      this.activeJobs.delete(jobId);
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  private async runTool(
    event: IpcMainInvokeEvent,
    request: Extract<RoomToolCallRequest, { operation: "tool-run" }>
  ): Promise<RoomToolCallResult> {
    const requestId = normalizeRequestId(request.requestId);
    const jobId = normalizeJobId(request.jobId, "room-tool-run");
    const manifest = await this.loadToolchainManifest(request.roomId);
    const toolManifest = this.getToolManifest(manifest, request.toolId);
    if (this.isToolRunnable(toolManifest) !== true) {
      throw new Error(this.getPlannedToolMessage(request.toolId, toolManifest));
    }
    const paths = resolveRuntimePaths(request.roomId);
    const requestedExecutableName = asNonEmptyString(request.executableName);
    let binaryPath = "";
    let defaultCwd = paths.storageDir;
    let allowedExecutableNames: string[] = [];
    let defaultExecutableName = "";
    const detectedPlatformKey = detectPlatformKey();
    const useSystemCommandFallback =
      this.isSystemCommandTool(toolManifest) === true ||
      this.shouldUseSystemCommandFallback(toolManifest, detectedPlatformKey) === true;

    if (this.isToolInstallable(toolManifest) === true && useSystemCommandFallback !== true) {
      const resolved = this.resolveTool(manifest, request.toolId);
      const installDir = await resolveInstallableToolInstallDir(paths, resolved.installDirName);
      defaultCwd = installDir;
      allowedExecutableNames = [
        resolved.asset.executableName,
        ...(resolved.asset.companionExecutables ?? []),
      ];
      defaultExecutableName = resolved.asset.executableName;
    } else if (useSystemCommandFallback === true) {
      const resolved =
        this.isSystemCommandTool(toolManifest) === true
          ? this.resolveSystemCommandTool(manifest, request.toolId)
          : this.resolveToolSystemCommandSpec(toolManifest, request.toolId);
      allowedExecutableNames = [
        resolved.systemCommand.executableName,
        ...(resolved.systemCommand.companionExecutables ?? []),
      ];
      defaultExecutableName = resolved.systemCommand.executableName;
    }

    const selectedExecutableName =
      requestedExecutableName !== null && allowedExecutableNames.includes(requestedExecutableName)
        ? requestedExecutableName
        : requestedExecutableName === null
          ? defaultExecutableName
          : null;

    if (selectedExecutableName === null) {
      throw new Error(
        `${request.toolId} does not expose companion executable ${String(request.executableName)}`
      );
    }

    if (this.isToolInstallable(toolManifest) === true && useSystemCommandFallback !== true) {
      binaryPath = join(defaultCwd, selectedExecutableName);
      if (!existsSync(binaryPath)) {
        throw new Error(
          `${request.toolId}:${selectedExecutableName} is not installed for room ${request.roomId}`
        );
      }
    } else {
      const resolvedSystemCommand =
        this.isSystemCommandTool(toolManifest) === true
          ? this.resolveSystemCommandTool(manifest, request.toolId)
          : this.resolveToolSystemCommandSpec(toolManifest, request.toolId);
      const allowPathLookup =
        this.getInstallerType(resolvedSystemCommand.manifest) !== "python-venv-pip";
      const primaryBinaryPath = await resolveSystemCommandBinaryPath(
        resolvedSystemCommand.systemCommand.executableName,
        {
          allowPathLookup,
          envVarNames: resolvedSystemCommand.systemCommand.envVarNames,
          candidatePaths: resolvedSystemCommand.systemCommand.candidatePaths,
          runtimePaths: paths,
        }
      );
      const resolvedBinaryPath =
        selectedExecutableName === resolvedSystemCommand.systemCommand.executableName
          ? primaryBinaryPath
          : primaryBinaryPath !== null
            ? await resolveCompanionSystemCommandPath(selectedExecutableName, primaryBinaryPath)
            : await resolveSystemCommandBinaryPath(selectedExecutableName, {
                allowPathLookup,
                runtimePaths: paths,
              });
      if (resolvedBinaryPath === null) {
        throw new Error(
          `${request.toolId}:${selectedExecutableName} is not available on the shared transcript runtime or PATH for room ${request.roomId}`
        );
      }
      binaryPath = resolvedBinaryPath;
    }

    const cwd = asNonEmptyString(request.cwd) ?? defaultCwd;
    ensureRoomToolRunCwdPath(request.roomId, cwd);

    this.emitProgress(event, {
      roomId: request.roomId,
      operation: request.operation,
      requestId,
      jobId,
      toolId: request.toolId,
      stage: "queued",
      message: "Tool run queued.",
    });

    return await new Promise<RoomToolCallResult>((resolvePromise, rejectPromise) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      let cancelled = false;

      const child = spawn(binaryPath, request.args ?? [], {
        cwd,
        env: {
          ...process.env,
          ...Object.fromEntries(
            Object.entries(request.env ?? {}).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string"
            )
          ),
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      const finish = (error?: Error, exitCode?: number | null): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.activeJobs.delete(jobId);

        if (error) {
          this.emitProgress(event, {
            roomId: request.roomId,
            operation: request.operation,
            requestId,
            jobId,
            toolId: request.toolId,
            stage: cancelled ? "cancelled" : "failed",
            message: error.message,
          });
          rejectPromise(error);
          return;
        }

        this.emitProgress(event, {
          roomId: request.roomId,
          operation: request.operation,
          requestId,
          jobId,
          toolId: request.toolId,
          stage: cancelled ? "cancelled" : "completed",
          message: cancelled ? "Tool run cancelled." : "Tool run complete.",
          exitCode: exitCode ?? null,
        });

        resolvePromise({
          success: true,
          operation: request.operation,
          requestId,
          jobId,
          run: {
            toolId: request.toolId,
            binaryPath,
            exitCode: exitCode ?? null,
            cancelled,
            stdout,
            stderr,
          },
        });
      };

      this.activeJobs.set(jobId, {
        roomId: request.roomId,
        jobId,
        cancel: () => {
          cancelled = true;
          child.kill("SIGKILL");
        },
      });

      this.emitProgress(event, {
        roomId: request.roomId,
        operation: request.operation,
        requestId,
        jobId,
        toolId: request.toolId,
        stage: "running",
        message: "Tool run started.",
      });

      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stdout += text;
        this.emitProgress(event, {
          roomId: request.roomId,
          operation: request.operation,
          requestId,
          jobId,
          toolId: request.toolId,
          stage: "stdout",
          chunk: text,
        });
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stderr += text;
        this.emitProgress(event, {
          roomId: request.roomId,
          operation: request.operation,
          requestId,
          jobId,
          toolId: request.toolId,
          stage: "stderr",
          chunk: text,
        });
      });

      child.once("error", (error) => {
        finish(error);
      });
      child.once("close", (code) => {
        finish(undefined, code);
      });

      const timer = setTimeout(
        () => {
          cancelled = true;
          child.kill("SIGKILL");
        },
        Math.max(1_000, Number(request.timeoutMs) > 0 ? Number(request.timeoutMs) : 30 * 60_000)
      );
    });
  }

  private async loadToolchainManifest(roomId: string): Promise<ToolchainManifest> {
    const paths = resolveRuntimePaths(roomId);
    const candidatePaths = getToolchainManifestCandidates(paths);
    const manifestPath = candidatePaths.find((candidate) => existsSync(candidate));
    if (manifestPath === undefined) {
      throw new Error(`Room toolchain manifest missing: ${candidatePaths.join(" | ")}`);
    }
    return await readJsonFile<ToolchainManifest>(manifestPath);
  }

  private getToolManifest(manifest: ToolchainManifest, toolId: string): ToolManifest {
    const toolManifest = manifest.tools[toolId];
    if (!toolManifest) {
      throw new Error(`Tool ${toolId} is not declared in the room manifest`);
    }
    return toolManifest;
  }

  private getToolAvailability(toolManifest: ToolManifest): ToolAvailability {
    return toolManifest.availability ?? "installable";
  }

  private isToolInstallable(toolManifest: ToolManifest): boolean {
    return this.getToolAvailability(toolManifest) === "installable";
  }

  private isSystemCommandTool(toolManifest: ToolManifest): boolean {
    return this.getToolAvailability(toolManifest) === "system-command";
  }

  private isToolRunnable(toolManifest: ToolManifest): boolean {
    return (
      this.isToolInstallable(toolManifest) === true ||
      this.isSystemCommandTool(toolManifest) === true
    );
  }

  private getPlannedToolMessage(toolId: string, toolManifest: ToolManifest): string {
    return (
      asNonEmptyString(toolManifest.plannedReason) ??
      `${toolId} is planned and does not expose an install path yet.`
    );
  }

  private getSystemCommandSetupHint(toolId: string, toolManifest: ToolManifest): string {
    return (
      asNonEmptyString(toolManifest.systemCommand?.setupHint) ??
      `Install ${toolId} on the host system, make the binary available on PATH, and refresh the probe.`
    );
  }

  private getInstallerType(toolManifest: ToolManifest): ToolInstallerSpec["type"] | null {
    return toolManifest.installer?.type ?? null;
  }

  private resolvePythonVenvPipInstaller(
    toolManifest: ToolManifest,
    toolId: string
  ): ResolvedPythonVenvPipInstaller {
    const resolved = this.resolveToolSystemCommandSpec(toolManifest, toolId);
    const installer = toolManifest.installer;
    if (installer?.type !== "python-venv-pip") {
      throw new Error(`${toolId} does not expose a python-venv installer`);
    }

    const venvDir = asNonEmptyString(installer.venvDir);
    const packages = normalizeStringArray(installer.packages);
    if (venvDir === null || packages.length === 0) {
      throw new Error(`${toolId} installer is missing a venvDir or package list`);
    }

    return {
      manifest: resolved.manifest,
      probe: resolved.probe,
      systemCommand: resolved.systemCommand,
      installer: {
        type: "python-venv-pip",
        venvDir,
        packages,
        bootstrapExecutableNames: normalizeStringArray(installer.bootstrapExecutableNames),
        supportedPythonVersions: normalizeStringArray(installer.supportedPythonVersions),
      },
    };
  }

  private async downloadManagedPythonAsset(
    event: IpcMainInvokeEvent,
    options: {
      asset: GitHubReleaseAsset;
      destinationPath: string;
      getCancelled: () => boolean;
      jobId: string;
      operation: "tool-install" | "tool-update";
      requestId: string | null;
      roomId: string;
      setActiveAbortController: (controller: AbortController | null) => void;
      toolId: string;
    }
  ): Promise<string> {
    const controller = new AbortController();
    let tempPath: string | null = null;
    let fileStream: ReturnType<typeof createWriteStream> | null = null;
    options.setActiveAbortController(controller);

    try {
      const response = await fetch(options.asset.browser_download_url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "hayalet-ev-room-tools",
          Accept: "application/octet-stream, */*;q=0.1",
        },
      });
      if (!response.ok || response.body === null) {
        throw new Error(
          `Managed Python download failed (${response.status}) for ${options.asset.name}`
        );
      }

      await ensureDir(dirname(options.destinationPath));
      await rm(options.destinationPath, { force: true });
      tempPath = `${options.destinationPath}.part-${Date.now()}`;
      fileStream = createWriteStream(tempPath);
      const totalBytesHeader = Number(response.headers.get("content-length") ?? "0");
      const totalBytes =
        Number.isFinite(totalBytesHeader) && totalBytesHeader > 0 ? totalBytesHeader : 0;
      let writtenBytes = 0;
      const reader = response.body.getReader();

      this.emitProgress(event, {
        roomId: options.roomId,
        operation: options.operation,
        requestId: options.requestId,
        jobId: options.jobId,
        toolId: options.toolId,
        stage: "downloading",
        bytesReceived: 0,
        ...(totalBytes > 0 ? { bytesTotal: totalBytes } : {}),
        percent: 16,
        phaseCount: 5,
        phaseIndex: 1,
        phaseLabel: "Managed Python indiriliyor",
        detailLines: [options.asset.name],
        message: `Download managed room Python: ${options.asset.name}`,
      });

      const pumpDownload = async (): Promise<void> => {
        if (options.getCancelled()) {
          controller.abort();
          throw new Error("Managed Python download cancelled.");
        }
        const { done, value } = await reader.read();
        if (done) {
          return;
        }
        writtenBytes += value.byteLength;
        const activeFileStream = fileStream;
        if (activeFileStream === null) {
          throw new Error("Managed Python download stream closed unexpectedly.");
        }
        if (!activeFileStream.write(Buffer.from(value))) {
          await once(activeFileStream, "drain");
        }
        this.emitProgress(event, {
          roomId: options.roomId,
          operation: options.operation,
          requestId: options.requestId,
          jobId: options.jobId,
          toolId: options.toolId,
          stage: "downloading",
          bytesReceived: writtenBytes,
          ...(totalBytes > 0 ? { bytesTotal: totalBytes } : {}),
          ...(totalBytes > 0
            ? { percent: Math.min(32, 16 + Math.round((writtenBytes / totalBytes) * 16)) }
            : {}),
          phaseCount: 5,
          phaseIndex: 1,
          phaseLabel: "Managed Python indiriliyor",
          detailLines: [options.asset.name],
        });
        await pumpDownload();
      };

      await pumpDownload();
      await new Promise<void>((resolvePromise, rejectPromise) => {
        fileStream?.end(() => {
          resolvePromise();
        });
        fileStream?.once("error", rejectPromise);
      });
      fileStream = null;

      await rename(tempPath, options.destinationPath);
      tempPath = null;
      return options.destinationPath;
    } catch (error) {
      fileStream?.destroy();
      if (tempPath !== null) {
        await rm(tempPath, { force: true });
      }
      throw error;
    } finally {
      options.setActiveAbortController(null);
    }
  }

  /* eslint-disable no-await-in-loop -- Managed Python candidates mutate shared runtime directories and must be prepared one at a time. */
  private async ensureManagedPythonRuntime(
    event: IpcMainInvokeEvent,
    resolvedInstaller: ResolvedPythonVenvPipInstaller,
    options: {
      getCancelled: () => boolean;
      jobId: string;
      operation: "tool-install" | "tool-update";
      paths: RoomToolRuntimePaths;
      requestId: string | null;
      roomId: string;
      setActiveAbortController: (controller: AbortController | null) => void;
      toolId: string;
    }
  ): Promise<{ command: string; argsPrefix: string[] }> {
    const platformKey = detectPlatformKey();
    if (platformKey === null || MANAGED_PYTHON_ASSET_TARGETS[platformKey] === undefined) {
      throw new Error(
        `Managed room Python is not available for ${process.platform}-${process.arch}.`
      );
    }

    const versionCandidates = getManagedPythonVersionCandidates(
      resolvedInstaller.installer.supportedPythonVersions
    );
    for (const version of versionCandidates) {
      const runtimeDir = getManagedPythonRuntimeDir(options.paths, version);
      const pythonPath = resolveExistingManagedPythonExecutable(runtimeDir);
      if (
        pythonPath !== null &&
        (await isPythonRuntimeVersionSupported(pythonPath, [], [version])) === true
      ) {
        return { command: pythonPath, argsPrefix: [] };
      }
      if (pythonPath !== null || existsSync(runtimeDir)) {
        await rm(runtimeDir, { recursive: true, force: true });
      }
    }

    const release = await fetchGitHubRelease(MANAGED_PYTHON_RELEASE_PROVIDER);
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const failures: string[] = [];

    for (const version of versionCandidates) {
      if (options.getCancelled()) {
        throw new Error("Managed Python preparation cancelled.");
      }

      const asset = selectManagedPythonAsset(assets, version, platformKey);
      if (asset === null) {
        failures.push(`Python ${version}: release asset missing`);
        continue;
      }

      const runtimeDir = getManagedPythonRuntimeDir(options.paths, version);
      await ensureDir(dirname(runtimeDir));
      const tempRoot = await mkdtemp(join(dirname(runtimeDir), `.python-runtime-${version}-`));
      const archivePath = join(tempRoot, asset.name);
      const extractDir = join(tempRoot, "extract");
      try {
        await this.downloadManagedPythonAsset(event, {
          asset,
          destinationPath: archivePath,
          getCancelled: options.getCancelled,
          jobId: options.jobId,
          operation: options.operation,
          requestId: options.requestId,
          roomId: options.roomId,
          setActiveAbortController: options.setActiveAbortController,
          toolId: options.toolId,
        });

        this.emitProgress(event, {
          roomId: options.roomId,
          operation: options.operation,
          requestId: options.requestId,
          jobId: options.jobId,
          toolId: options.toolId,
          stage: "extracting",
          percent: 34,
          phaseCount: 5,
          phaseIndex: 1,
          phaseLabel: "Managed Python açılıyor",
          detailLines: [asset.name, runtimeDir],
          message: `Extract managed room Python: ${asset.name}`,
        });

        await extractArchive(archivePath, extractDir, "tar.gz");
        const extractedRuntimeDir = join(extractDir, "python");
        if (!existsSync(extractedRuntimeDir)) {
          throw new Error("Managed Python archive did not contain a python directory.");
        }

        await ensureDir(dirname(runtimeDir));
        await rm(runtimeDir, { recursive: true, force: true });
        await rename(extractedRuntimeDir, runtimeDir);
        const pythonPath = resolveExistingManagedPythonExecutable(runtimeDir);
        if (pythonPath === null) {
          throw new Error("Managed Python executable could not be resolved after extraction.");
        }

        await markExecutable(pythonPath);
        if ((await isPythonRuntimeVersionSupported(pythonPath, [], [version])) !== true) {
          const detectedVersion = await readPythonMajorMinor(pythonPath, [], dirname(pythonPath));
          throw new Error(
            `Managed Python version mismatch: expected ${version}, got ${detectedVersion ?? "unknown"}.`
          );
        }

        this.emitProgress(event, {
          roomId: options.roomId,
          operation: options.operation,
          requestId: options.requestId,
          jobId: options.jobId,
          toolId: options.toolId,
          stage: "running",
          percent: 36,
          phaseCount: 5,
          phaseIndex: 1,
          phaseLabel: "Managed Python hazır",
          detailLines: [pythonPath],
          message: `Managed room Python ready: ${pythonPath}`,
        });

        return { command: pythonPath, argsPrefix: [] };
      } catch (error) {
        await rm(runtimeDir, { recursive: true, force: true });
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`Python ${version}: ${message}`);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    }

    throw new Error(`Managed room Python could not be prepared. ${failures.join(" ")}`);
  }
  /* eslint-enable no-await-in-loop */

  private async resolvePythonBootstrapInvocation(
    resolvedInstaller: ResolvedPythonVenvPipInstaller,
    managedRuntimeOptions?: {
      event: IpcMainInvokeEvent;
      getCancelled: () => boolean;
      jobId: string;
      operation: "tool-install" | "tool-update";
      paths: RoomToolRuntimePaths;
      requestId: string | null;
      roomId: string;
      setActiveAbortController: (controller: AbortController | null) => void;
      toolId: string;
    }
  ): Promise<{ command: string; argsPrefix: string[] }> {
    const candidates = buildPythonBootstrapCandidates(resolvedInstaller);
    const attemptedLabels: string[] = [];
    let managedFailureMessage: string | null = null;

    if (
      managedRuntimeOptions !== undefined &&
      resolvedInstaller.installer.supportedPythonVersions.length > 0
    ) {
      try {
        return await this.ensureManagedPythonRuntime(
          managedRuntimeOptions.event,
          resolvedInstaller,
          managedRuntimeOptions
        );
      } catch (error) {
        if (managedRuntimeOptions.getCancelled()) {
          throw error;
        }
        managedFailureMessage = error instanceof Error ? error.message : String(error);
        attemptedLabels.push("managed room Python");
      }
    }

    const resolveCandidate = async (
      index: number
    ): Promise<{ command: string; argsPrefix: string[] } | null> => {
      const candidate = candidates[index];
      if (candidate === undefined) {
        return null;
      }

      attemptedLabels.push(candidate.label);
      const resolvedBinaryPath = await resolveSystemCommandBinaryPath(candidate.commandName);
      if (resolvedBinaryPath === null) {
        return await resolveCandidate(index + 1);
      }

      const versionSupported = await isPythonRuntimeVersionSupported(
        resolvedBinaryPath,
        candidate.argsPrefix,
        resolvedInstaller.installer.supportedPythonVersions
      );
      if (versionSupported !== true) {
        const detectedVersion = await readPythonMajorMinor(
          resolvedBinaryPath,
          candidate.argsPrefix,
          dirname(resolvedBinaryPath)
        );
        attemptedLabels[attemptedLabels.length - 1] =
          detectedVersion === null
            ? `${candidate.label} (unknown)`
            : `${candidate.label} (${detectedVersion})`;
        return await resolveCandidate(index + 1);
      }

      return {
        command: resolvedBinaryPath,
        argsPrefix: candidate.argsPrefix,
      };
    };

    const resolvedCandidate = await resolveCandidate(0);
    if (resolvedCandidate !== null) {
      return resolvedCandidate;
    }

    const missingMessage = buildMissingPythonBootstrapMessage(resolvedInstaller, attemptedLabels);
    throw new Error(
      managedFailureMessage === null
        ? missingMessage
        : `${missingMessage} Managed room Python failed: ${managedFailureMessage}`
    );
  }

  private async runProgressCommand(
    event: IpcMainInvokeEvent,
    options: {
      args: string[];
      command: string;
      cwd: string;
      detailLines?: string[];
      env?: Record<string, string | undefined>;
      getCancelled: () => boolean;
      jobId: string;
      message: string;
      operation: "tool-install" | "tool-update";
      percent?: number;
      phaseCount?: number;
      phaseIndex?: number;
      phaseLabel?: string;
      phasePercent?: number;
      requestId: string | null;
      roomId: string;
      setActiveChild: (child: SpawnedProcess | null) => void;
      timeoutMs: number;
      toolId: string;
    }
  ): Promise<{ cancelled: boolean; exitCode: number | null; stderr: string; stdout: string }> {
    return await new Promise((resolvePromise, rejectPromise) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      let timedOut = false;

      const child = spawn(options.command, options.args, {
        cwd: options.cwd,
        detached: process.platform !== "win32",
        env: {
          ...process.env,
          ...Object.fromEntries(
            Object.entries(options.env ?? {}).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string"
            )
          ),
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      options.setActiveChild(child);

      this.emitProgress(event, {
        roomId: options.roomId,
        operation: options.operation,
        requestId: options.requestId,
        jobId: options.jobId,
        toolId: options.toolId,
        stage: "running",
        message: options.message,
        ...buildProgressMetadata(options),
      });

      const finish = (payload: {
        cancelled: boolean;
        exitCode: number | null;
        stderr: string;
        stdout: string;
      }): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        options.setActiveChild(null);
        resolvePromise(payload);
      };

      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stdout += text;
        this.emitProgress(event, {
          roomId: options.roomId,
          operation: options.operation,
          requestId: options.requestId,
          jobId: options.jobId,
          toolId: options.toolId,
          stage: "stdout",
          chunk: text,
          message: options.message,
          ...buildProgressMetadata(options),
        });
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stderr += text;
        this.emitProgress(event, {
          roomId: options.roomId,
          operation: options.operation,
          requestId: options.requestId,
          jobId: options.jobId,
          toolId: options.toolId,
          stage: "stderr",
          chunk: text,
          message: options.message,
          ...buildProgressMetadata(options),
        });
      });

      child.once("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        options.setActiveChild(null);
        rejectPromise(error);
      });
      child.once("close", (code) => {
        finish({
          exitCode: code,
          stdout,
          stderr,
          cancelled: timedOut || options.getCancelled() === true,
        });
      });

      const timer = setTimeout(() => {
        timedOut = true;
        killSpawnedProcessTree(child);
      }, options.timeoutMs);
    });
  }

  private shouldUsePythonWithoutPipFallback(result: { stderr: string; stdout: string }): boolean {
    const combinedOutput = `${result.stderr}\n${result.stdout}`;
    return /ensurepip is not\s+available/i.test(combinedOutput);
  }

  private isMissingPythonPip(result: { stderr: string; stdout: string }): boolean {
    const combinedOutput = `${result.stderr}\n${result.stdout}`;
    return /No module named pip/i.test(combinedOutput);
  }

  private async bootstrapPythonVenvPip(
    event: IpcMainInvokeEvent,
    options: {
      getCancelled: () => boolean;
      jobId: string;
      operation: "tool-install" | "tool-update";
      requestId: string | null;
      roomId: string;
      setActiveChild: (child: SpawnedProcess | null) => void;
      toolId: string;
      venvPythonPath: string;
    }
  ): Promise<void> {
    const bootstrapDir = await mkdtemp(join(tmpdir(), "hayalet-ev-get-pip-"));
    const scriptPath = join(bootstrapDir, "get-pip.py");

    try {
      this.emitProgress(event, {
        roomId: options.roomId,
        operation: options.operation,
        requestId: options.requestId,
        jobId: options.jobId,
        toolId: options.toolId,
        stage: "running",
        message: `Download pip bootstrap: ${PYTHON_GET_PIP_URL}`,
        percent: 24,
        phaseCount: 5,
        phaseIndex: 2,
        phaseLabel: "pip bootstrap indiriliyor",
        detailLines: [PYTHON_GET_PIP_URL],
      });

      const scriptSource = await fetchText(PYTHON_GET_PIP_URL);
      await writeFile(scriptPath, scriptSource, "utf8");

      const bootstrapResult = await this.runProgressCommand(event, {
        command: options.venvPythonPath,
        args: [scriptPath],
        cwd: dirname(options.venvPythonPath),
        getCancelled: options.getCancelled,
        jobId: options.jobId,
        message: `Bootstrap pip for ${options.toolId}`,
        operation: options.operation,
        percent: 28,
        phaseCount: 5,
        phaseIndex: 2,
        phaseLabel: "pip bootstrap kuruluyor",
        detailLines: ["get-pip.py"],
        requestId: options.requestId,
        roomId: options.roomId,
        setActiveChild: options.setActiveChild,
        timeoutMs: 12 * 60_000,
        toolId: options.toolId,
      });

      if (bootstrapResult.cancelled === true) {
        throw new Error("Python package bootstrap cancelled.");
      }
      if (bootstrapResult.exitCode !== 0) {
        throw new Error(
          asNonEmptyString(bootstrapResult.stderr) ??
            asNonEmptyString(bootstrapResult.stdout) ??
            "Python package bootstrap failed."
        );
      }
    } finally {
      await rm(bootstrapDir, { recursive: true, force: true });
    }
  }

  private async installPythonVenvPipTool(
    event: IpcMainInvokeEvent,
    request: Extract<RoomToolCallRequest, { operation: "tool-install" | "tool-update" }>,
    toolManifest: ToolManifest,
    jobId: string
  ): Promise<RoomToolCallResult> {
    const requestId = normalizeRequestId(request.requestId);
    const paths = resolveRuntimePaths(request.roomId);
    const resolvedInstaller = this.resolvePythonVenvPipInstaller(toolManifest, request.toolId);
    const venvDir = expandRuntimePathTemplate(resolvedInstaller.installer.venvDir, paths);
    const packageListLabel = resolvedInstaller.installer.packages.join(", ");
    const pythonInstallDetailLines = [`Paketler: ${packageListLabel}`, `Hedef runtime: ${venvDir}`];
    let activeChild: SpawnedProcess | null = null;
    let activeAbortController: AbortController | null = null;
    const installState = {
      cancelled: false,
    };

    this.activeJobs.set(jobId, {
      roomId: request.roomId,
      jobId,
      cancel: () => {
        installState.cancelled = true;
        if (activeChild !== null) {
          killSpawnedProcessTree(activeChild);
        }
        activeAbortController?.abort();
      },
    });

    this.emitProgress(event, {
      roomId: request.roomId,
      operation: request.operation,
      requestId,
      jobId,
      toolId: request.toolId,
      stage: "queued",
      message: packageListLabel,
      percent: 2,
      phaseCount: 5,
      phaseIndex: 1,
      phaseLabel: "Kurulum planı hazır",
      detailLines: pythonInstallDetailLines,
    });

    try {
      await ensureDir(dirname(venvDir));
      let venvPythonPath = resolveExistingPythonVenvExecutable(venvDir);
      let pipBootstrapped = false;

      if (venvPythonPath !== null) {
        const venvReusable = await isPythonVenvReusable(venvPythonPath, venvDir);
        const venvVersionSupported = await isPythonRuntimeVersionSupported(
          venvPythonPath,
          [],
          resolvedInstaller.installer.supportedPythonVersions
        );
        if (venvReusable !== true || venvVersionSupported !== true) {
          const repairReason =
            venvReusable !== true
              ? `Repair room-local python runtime: ${venvDir}`
              : `Repair room-local python runtime: ${venvDir} (${formatPythonVersionList(
                  resolvedInstaller.installer.supportedPythonVersions
                )})`;
          this.emitProgress(event, {
            roomId: request.roomId,
            operation: request.operation,
            requestId,
            jobId,
            toolId: request.toolId,
            stage: "running",
            message: repairReason,
            percent: 8,
            phaseCount: 5,
            phaseIndex: 1,
            phaseLabel: "Yerel Python runtime onarılıyor",
            detailLines: [
              venvDir,
              formatPythonVersionList(resolvedInstaller.installer.supportedPythonVersions),
            ],
          });
          await rm(venvDir, { recursive: true, force: true });
          venvPythonPath = null;
        }
      }

      if (venvPythonPath === null) {
        const bootstrap = await this.resolvePythonBootstrapInvocation(resolvedInstaller, {
          event,
          getCancelled: () => installState.cancelled,
          jobId,
          operation: request.operation,
          paths,
          requestId,
          roomId: request.roomId,
          setActiveAbortController(controller) {
            activeAbortController = controller;
          },
          toolId: request.toolId,
        });
        const createVenvResult = await this.runProgressCommand(event, {
          command: bootstrap.command,
          args: [...bootstrap.argsPrefix, "-m", "venv", venvDir],
          cwd: paths.storageDir,
          getCancelled: () => installState.cancelled,
          jobId,
          message: `Create room-local python runtime: ${venvDir}`,
          operation: request.operation,
          percent: 12,
          phaseCount: 5,
          phaseIndex: 1,
          phaseLabel: "Python runtime hazırlanıyor",
          detailLines: [venvDir],
          requestId,
          roomId: request.roomId,
          setActiveChild(child) {
            activeChild = child;
          },
          timeoutMs: 10 * 60_000,
          toolId: request.toolId,
        });
        if (createVenvResult.cancelled === true) {
          throw new Error("Python runtime creation cancelled.");
        }
        if (createVenvResult.exitCode !== 0) {
          if (this.shouldUsePythonWithoutPipFallback(createVenvResult) !== true) {
            throw new Error(
              asNonEmptyString(createVenvResult.stderr) ??
                asNonEmptyString(createVenvResult.stdout) ??
                "Python runtime creation failed."
            );
          }

          await rm(venvDir, { recursive: true, force: true });

          const createWithoutPipResult = await this.runProgressCommand(event, {
            command: bootstrap.command,
            args: [...bootstrap.argsPrefix, "-m", "venv", "--without-pip", venvDir],
            cwd: paths.storageDir,
            getCancelled: () => installState.cancelled,
            jobId,
            message: `Create room-local python runtime without pip: ${venvDir}`,
            operation: request.operation,
            percent: 14,
            phaseCount: 5,
            phaseIndex: 1,
            phaseLabel: "Python runtime pip olmadan hazırlanıyor",
            detailLines: [venvDir],
            requestId,
            roomId: request.roomId,
            setActiveChild(child) {
              activeChild = child;
            },
            timeoutMs: 10 * 60_000,
            toolId: request.toolId,
          });
          if (createWithoutPipResult.cancelled === true) {
            throw new Error("Python runtime creation cancelled.");
          }
          if (createWithoutPipResult.exitCode !== 0) {
            throw new Error(
              asNonEmptyString(createWithoutPipResult.stderr) ??
                asNonEmptyString(createWithoutPipResult.stdout) ??
                "Python runtime creation failed."
            );
          }
          pipBootstrapped = true;
        }
        venvPythonPath = resolveExistingPythonVenvExecutable(venvDir);
      }

      if (venvPythonPath === null) {
        throw new Error(
          "Python runtime was created, but the venv executable could not be resolved."
        );
      }

      if (pipBootstrapped === true) {
        await this.bootstrapPythonVenvPip(event, {
          getCancelled: () => installState.cancelled,
          jobId,
          operation: request.operation,
          requestId,
          roomId: request.roomId,
          setActiveChild(child) {
            activeChild = child;
          },
          toolId: request.toolId,
          venvPythonPath,
        });
      }

      let bootstrapPipResult = await this.runProgressCommand(event, {
        command: venvPythonPath,
        args: ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"],
        cwd: paths.storageDir,
        getCancelled: () => installState.cancelled,
        jobId,
        message: `Bootstrap python tooling for ${request.toolId}`,
        operation: request.operation,
        percent: 38,
        phaseCount: 5,
        phaseIndex: 3,
        phaseLabel: "Python kurulum araçları hazırlanıyor",
        detailLines: ["pip", "setuptools", "wheel"],
        requestId,
        roomId: request.roomId,
        setActiveChild(child) {
          activeChild = child;
        },
        timeoutMs: 12 * 60_000,
        toolId: request.toolId,
      });
      if (bootstrapPipResult.cancelled === true) {
        throw new Error("Python package bootstrap cancelled.");
      }
      if (
        bootstrapPipResult.exitCode !== 0 &&
        this.isMissingPythonPip(bootstrapPipResult) === true
      ) {
        await this.bootstrapPythonVenvPip(event, {
          getCancelled: () => installState.cancelled,
          jobId,
          operation: request.operation,
          requestId,
          roomId: request.roomId,
          setActiveChild(child) {
            activeChild = child;
          },
          toolId: request.toolId,
          venvPythonPath,
        });
        bootstrapPipResult = await this.runProgressCommand(event, {
          command: venvPythonPath,
          args: ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"],
          cwd: paths.storageDir,
          getCancelled: () => installState.cancelled,
          jobId,
          message: `Bootstrap python tooling for ${request.toolId}`,
          operation: request.operation,
          percent: 38,
          phaseCount: 5,
          phaseIndex: 3,
          phaseLabel: "Python kurulum araçları hazırlanıyor",
          detailLines: ["pip", "setuptools", "wheel"],
          requestId,
          roomId: request.roomId,
          setActiveChild(child) {
            activeChild = child;
          },
          timeoutMs: 12 * 60_000,
          toolId: request.toolId,
        });
      }
      if (bootstrapPipResult.exitCode !== 0) {
        throw new Error(
          asNonEmptyString(bootstrapPipResult.stderr) ??
            asNonEmptyString(bootstrapPipResult.stdout) ??
            "Python package bootstrap failed."
        );
      }

      const installArgs = [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--prefer-binary",
        ...(request.operation === "tool-update" ? ["--upgrade"] : []),
        ...resolvedInstaller.installer.packages,
      ];
      const installPackagesResult = await this.runProgressCommand(event, {
        command: venvPythonPath,
        args: installArgs,
        cwd: paths.storageDir,
        getCancelled: () => installState.cancelled,
        jobId,
        message: `Install python packages for ${request.toolId}: ${packageListLabel}`,
        operation: request.operation,
        percent: 52,
        phaseCount: 5,
        phaseIndex: 4,
        phaseLabel: "Python paketleri indiriliyor ve kuruluyor",
        detailLines: pythonInstallDetailLines,
        requestId,
        roomId: request.roomId,
        setActiveChild(child) {
          activeChild = child;
        },
        timeoutMs: 45 * 60_000,
        toolId: request.toolId,
      });
      if (installPackagesResult.cancelled === true) {
        throw new Error("Python package installation cancelled.");
      }
      if (installPackagesResult.exitCode !== 0) {
        throw new Error(
          asNonEmptyString(installPackagesResult.stderr) ??
            asNonEmptyString(installPackagesResult.stdout) ??
            "Python package installation failed."
        );
      }

      this.emitProgress(event, {
        roomId: request.roomId,
        operation: request.operation,
        requestId,
        jobId,
        toolId: request.toolId,
        stage: "running",
        message: `Verify python package import for ${request.toolId}`,
        percent: 92,
        phaseCount: 5,
        phaseIndex: 5,
        phaseLabel: "Kurulum doğrulanıyor",
        detailLines: resolvedInstaller.probe.args,
      });

      const probeResult = await this.probeTool({
        operation: "tool-probe",
        roomId: request.roomId,
        requestId,
        toolId: request.toolId,
      });
      const probeTool = probeResult.tool;
      if (probeTool?.installed !== true) {
        throw new Error(
          asNonEmptyString(probeTool?.lastError) ??
            `${resolvedInstaller.manifest.displayName} probe failed after package installation.`
        );
      }

      this.emitProgress(event, {
        roomId: request.roomId,
        operation: request.operation,
        requestId,
        jobId,
        toolId: request.toolId,
        stage: "completed",
        percent: 100,
        message: venvPythonPath,
        phaseCount: 5,
        phaseIndex: 5,
        phaseLabel: "Kurulum tamamlandı",
        detailLines: [venvPythonPath],
      });

      return {
        ...probeResult,
        operation: request.operation,
        requestId,
        jobId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitProgress(event, {
        roomId: request.roomId,
        operation: request.operation,
        requestId,
        jobId,
        toolId: request.toolId,
        stage: installState.cancelled === true ? "cancelled" : "failed",
        message,
        phaseLabel: installState.cancelled === true ? "Kurulum iptal edildi" : "Kurulum başarısız",
      });
      throw error;
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  private hasPlatformAsset(toolManifest: ToolManifest, platformKey: PlatformKey | null): boolean {
    if (platformKey === null) {
      return false;
    }
    return toolManifest.assets?.[platformKey] !== undefined;
  }

  private shouldUseSystemCommandFallback(
    toolManifest: ToolManifest,
    platformKey: PlatformKey | null
  ): boolean {
    return (
      this.isToolInstallable(toolManifest) === true &&
      toolManifest.systemCommand !== undefined &&
      this.hasPlatformAsset(toolManifest, platformKey) !== true
    );
  }

  private resolveToolSystemCommandSpec(
    toolManifest: ToolManifest,
    toolId: string
  ): {
    manifest: ToolManifest;
    probe: NonNullable<ToolManifest["probe"]>;
    systemCommand: SystemCommandSpec;
  } {
    const probe = toolManifest.probe;
    if (probe === undefined) {
      throw new Error(`Tool ${toolId} is missing a probe declaration`);
    }
    const systemCommand = toolManifest.systemCommand;
    if (systemCommand === undefined) {
      throw new Error(`Tool ${toolId} is missing a system-command declaration`);
    }

    return {
      manifest: toolManifest,
      probe,
      systemCommand,
    };
  }

  private async probeSystemCommandToolStatus(
    toolId: string,
    toolManifest: ToolManifest,
    paths: RoomToolRuntimePaths,
    platformKey: string,
    requestId: string | null,
    operation: "tool-probe" | "tool-install" | "tool-update"
  ): Promise<RoomToolCallResult> {
    const resolved = this.resolveToolSystemCommandSpec(toolManifest, toolId);
    const setupHint = this.getSystemCommandSetupHint(toolId, resolved.manifest);
    const installerType = this.getInstallerType(resolved.manifest);
    const binaryPath = await resolveSystemCommandBinaryPath(resolved.systemCommand.executableName, {
      allowPathLookup: installerType !== "python-venv-pip",
      envVarNames: resolved.systemCommand.envVarNames,
      candidatePaths: resolved.systemCommand.candidatePaths,
      runtimePaths: paths,
    });

    if (binaryPath === null) {
      return {
        success: true,
        operation,
        requestId,
        tool: normalizeToolStatus(toolId, {
          installed: false,
          details: {
            platformKey,
            availability: "system-command",
            installable: false,
            executableName: resolved.systemCommand.executableName,
            companionExecutables: resolved.systemCommand.companionExecutables ?? [],
            installerType,
            setupHint,
          },
        }),
      };
    }

    const probe = await runCommand(
      binaryPath,
      resolved.probe.args,
      dirname(binaryPath),
      undefined,
      12_000
    );
    const combinedOutput = `${probe.stdout}\n${probe.stderr}`;
    const version =
      probe.exitCode === 0 ? findVersion(combinedOutput, resolved.probe.versionRegex) : null;
    const companionPaths: Record<string, string> = {};

    await Promise.all(
      (resolved.systemCommand.companionExecutables ?? []).map(
        async (companionName): Promise<void> => {
          const companionPath = await resolveCompanionSystemCommandPath(companionName, binaryPath);
          if (companionPath !== null) {
            companionPaths[companionName] = companionPath;
          }
        }
      )
    );

    return {
      success: true,
      operation,
      requestId,
      tool: normalizeToolStatus(toolId, {
        installed: probe.exitCode === 0,
        version,
        binaryPath,
        lastError: probe.exitCode === 0 ? null : summarizeCommandFailure(probe),
        installDir: dirname(binaryPath),
        companionPaths,
        details: {
          platformKey,
          availability: "system-command",
          installable: false,
          executableName: resolved.systemCommand.executableName,
          companionExecutables: resolved.systemCommand.companionExecutables ?? [],
          installerType,
          setupHint,
        },
      }),
    };
  }

  private async recheckSystemCommandTool(
    request: Extract<RoomToolCallRequest, { operation: "tool-install" | "tool-update" }>
  ): Promise<RoomToolCallResult> {
    const requestId = normalizeRequestId(request.requestId);
    const probeResult = await this.probeTool({
      operation: "tool-probe",
      roomId: request.roomId,
      requestId,
      toolId: request.toolId,
    });

    return {
      ...probeResult,
      operation: request.operation,
      requestId,
      jobId: normalizeJobId(
        request.jobId,
        request.operation === "tool-update" ? "room-tool-update" : "room-tool-install"
      ),
    };
  }

  private resolveTool(
    manifest: ToolchainManifest,
    toolId: string
  ): {
    manifest: InstallableToolManifest;
    asset: ToolAssetSpec;
    installDirName: string;
    releaseAssetNameHint: string;
  } {
    const toolManifest = this.getToolManifest(manifest, toolId);
    if (this.isToolInstallable(toolManifest) !== true) {
      throw new Error(this.getPlannedToolMessage(toolId, toolManifest));
    }

    const platformKey = detectPlatformKey();
    if (platformKey === null) {
      throw new Error(`Unsupported platform ${process.platform}/${process.arch}`);
    }

    const assets = toolManifest.assets ?? {};
    const asset = assets[platformKey];
    if (!asset) {
      throw new Error(`Tool ${toolId} does not support ${platformKey}`);
    }
    if (!toolManifest.probe) {
      throw new Error(`Tool ${toolId} is missing a probe declaration`);
    }
    if (!toolManifest.releaseProvider && !asset.releaseProvider) {
      throw new Error(`Tool ${toolId} is missing a release provider declaration`);
    }

    return {
      manifest: toolManifest as InstallableToolManifest,
      asset,
      installDirName: toolManifest.installDirName ?? toolId,
      releaseAssetNameHint:
        asset.archive === "none"
          ? asset.executableName
          : `${toolId}.${
              asset.archive === "tar.xz" ? "tar.xz" : asset.archive === "tar.gz" ? "tar.gz" : "zip"
            }`,
    };
  }

  private resolveSystemCommandTool(
    manifest: ToolchainManifest,
    toolId: string
  ): {
    manifest: SystemCommandToolManifest;
    systemCommand: SystemCommandSpec;
  } {
    const toolManifest = this.getToolManifest(manifest, toolId);
    if (this.isSystemCommandTool(toolManifest) !== true) {
      throw new Error(`${toolId} does not use the system-command tool runtime`);
    }
    const resolved = this.resolveToolSystemCommandSpec(toolManifest, toolId);

    return {
      manifest: resolved.manifest as SystemCommandToolManifest,
      systemCommand: resolved.systemCommand,
    };
  }

  private async resolveLatestToolRelease(
    manifest: ToolManifest,
    asset: ToolAssetSpec
  ): Promise<ToolReleaseInfo> {
    const releaseProvider = asset.releaseProvider ?? manifest.releaseProvider;
    if (!releaseProvider) {
      throw new Error(`Tool ${manifest.displayName} is missing a release provider declaration`);
    }

    if (releaseProvider.type === "web-page") {
      const releasePage = await fetchText(releaseProvider.latestPageUrl);
      const latestVersion = findVersion(releasePage, releaseProvider.versionRegex);
      const downloadUrlTemplate = asNonEmptyString(asset.downloadUrlTemplate);
      if (latestVersion === null) {
        throw new Error(`No latest version found for ${manifest.displayName}`);
      }
      if (downloadUrlTemplate === null) {
        throw new Error(`Tool ${manifest.displayName} is missing a download URL template`);
      }
      const downloadUrl = expandReleaseTemplate(downloadUrlTemplate, latestVersion);
      return {
        tag: latestVersion,
        name: latestVersion,
        releaseUrl: releaseProvider.releaseUrl,
        asset: {
          name: getFileNameFromUrl(downloadUrl, asset.executableName),
          browser_download_url: downloadUrl,
        },
      };
    }

    const payload = await fetchGitHubRelease(releaseProvider);
    const matcher = new RegExp(asset.assetMatch);
    const releaseAsset = (payload.assets ?? []).find((candidate) => matcher.test(candidate.name));

    if (!releaseAsset) {
      throw new Error(
        `No matching release asset found for ${manifest.displayName} (${asset.assetMatch})`
      );
    }

    return {
      tag: asNonEmptyString(payload.tag_name),
      name: asNonEmptyString(payload.name),
      releaseUrl: asNonEmptyString(payload.html_url) ?? releaseProvider.releaseUrl,
      asset: releaseAsset,
    };
  }

  private async downloadReleaseAsset(
    event: IpcMainInvokeEvent,
    roomId: string,
    operation: Extract<
      RoomToolCallRequest,
      { operation: "tool-install" | "tool-update" }
    >["operation"],
    requestId: string | null,
    jobId: string,
    url: string,
    destinationPath: string
  ): Promise<RoomFileDownloadResult> {
    const result = await this.downloadToPath(
      event,
      {
        operation,
        roomId,
        requestId,
        jobId,
        url,
        destinationPath,
        overwrite: true,
      },
      { enforceRoomManagedPath: false }
    );
    if (!result.download) {
      throw new Error(`Room tool asset download failed for ${url}`);
    }
    return result.download;
  }
}

export const roomToolService = new RoomToolService();

void logger.logInternal(LogCategory.SYSTEM, LogLevel.DEBUG, "roomToolService initialized");

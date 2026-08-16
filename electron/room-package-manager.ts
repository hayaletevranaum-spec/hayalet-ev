import { existsSync } from "fs";
import { readFile, rm } from "fs/promises";
import { dirname, join, relative, resolve } from "path";
import { formatErrorWithDetail } from "../shared/i18n/error-detail.ts";
import { Paths } from "./paths.ts";
import {
  copyDirectoryContents,
  deleteInstalledRoomCopies,
  ensureDir,
  INSTALLED_ROOM_FILE_SNAPSHOT,
  resolveInstalledRoomTrackedFiles,
} from "./rooms/room-install-files.ts";
import { buildInstalledRoomRecord } from "./rooms/installed-room-builder.ts";
import type { RoomOperationResult } from "./rooms/room-package-types.ts";
import {
  importRoomBundleFile,
  packageWorkspaceRoomBundle,
} from "./rooms/room-bundle-operations.ts";
import {
  hydrateInstalledRoomRecord,
  readRoomRegistry,
  writeRoomRegistry,
} from "./rooms/room-registry.ts";
import {
  deleteWorkspaceRoomOperation,
  exportInstalledRoomToWorkspaceOperation,
  installRoomFromWorkspace,
  removeInstalledRoomOperation,
} from "./rooms/workspace-room-operations.ts";
import {
  buildRoomWorkspaceRoots,
  pickPreferredWorkspaceRoom,
  readWorkspaceRoomsFromRoot,
} from "./rooms/workspace-discovery.ts";
import { collectWorkspaceRoomSourceBuildState } from "./rooms/workspace-room-build-support.ts";
import { buildWorkspaceRoomArtifact as buildWorkspaceRoomArtifactOperation } from "./rooms/workspace-room-build.ts";
import type { BuildWorkspaceRoomArtifactResult } from "./rooms/workspace-room-build.ts";
import type {
  InstalledRoomRecord,
  RoomRegistryState,
  RoomWorkspaceEntry,
  StartupRoomProtocolSnapshot,
  StartupRoomsSnapshot,
  StartupRoomsSyncResult,
} from "@shared/index.js";
import { translateElectronMessage } from "./i18n/language-service.ts";

interface RoomManagerOptions {
  workspaceRoot?: string;
  bundledWorkspaceRoot?: string;
  runtimeBuildRoot?: string;
  installedRoot?: string;
  dataRoot?: string;
  registryPath?: string;
}

interface RoomRuntimeResiduePaths {
  partitionRoot: string;
  policy: {
    cleanupTrigger: "deleteData";
    ownsPackageContent: false;
    preserveByDefault: true;
  };
  storageRoot: string;
}

export { buildInstalledRoomRecord };

function normalizeRoomPath(value: string): string {
  return resolve(value).replace(/[\\/]+$/, "");
}

function haveSameRelativePaths(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((path, index) => path === right[index]);
}

function isLegacyRoomSourceRestorePath(relativePath: string): boolean {
  const normalizedPath = relativePath.replace(/\\/g, "/");
  return (
    normalizedPath !== INSTALLED_ROOM_FILE_SNAPSHOT &&
    normalizedPath.startsWith("tools/runtime/") === false &&
    normalizedPath.startsWith("shared/data/tools/runtime/") === false &&
    normalizedPath.split("/").includes("__pycache__") === false
  );
}

async function roomPackageT(
  key: string,
  params?: Record<string, string | number | boolean>
): Promise<string> {
  return await translateElectronMessage(`electron.roomPackage.${key}`, params);
}

async function roomPackageError(
  key: string,
  detail?: unknown,
  params?: Record<string, string | number | boolean>
): Promise<string> {
  return formatErrorWithDetail(await roomPackageT(key, params), detail);
}

export class RoomPackageManager {
  private readonly workspaceRootOption: string | undefined;
  private readonly bundledWorkspaceRootOption: string | undefined;
  private readonly runtimeBuildRootOption: string | undefined;
  private readonly legacyInstalledRootOption: string | undefined;
  private readonly dataRootOption: string | undefined;
  private readonly registryPathOption: string | undefined;

  constructor(options: RoomManagerOptions = {}) {
    this.workspaceRootOption = options.workspaceRoot;
    this.bundledWorkspaceRootOption = options.bundledWorkspaceRoot;
    this.runtimeBuildRootOption = options.runtimeBuildRoot;
    this.legacyInstalledRootOption = options.installedRoot;
    this.dataRootOption =
      options.dataRoot ??
      (options.installedRoot !== undefined ? dirname(options.installedRoot) : undefined);
    this.registryPathOption = options.registryPath;
  }

  private getWorkspaceRoot(): string {
    return this.workspaceRootOption ?? Paths.getRoomsWorkspaceDir();
  }

  private getBundledWorkspaceRoot(): string {
    if (this.bundledWorkspaceRootOption !== undefined) {
      return this.bundledWorkspaceRootOption;
    }

    if (this.workspaceRootOption !== undefined) {
      return this.workspaceRootOption;
    }

    return Paths.getBundledRoomsDir();
  }

  private getRuntimeBuildRoot(): string {
    if (this.runtimeBuildRootOption !== undefined) {
      return this.runtimeBuildRootOption;
    }

    if (this.legacyInstalledRootOption !== undefined) {
      return this.legacyInstalledRootOption;
    }

    return this.workspaceRootOption === undefined
      ? Paths.getGeneratedRoomsDir()
      : join(this.getWorkspaceRoot(), ".build");
  }

  private getDataRoot(): string {
    return this.dataRootOption ?? Paths.getDataDir();
  }

  private getLegacyInstalledRoot(): string {
    if (this.legacyInstalledRootOption !== undefined) {
      return this.legacyInstalledRootOption;
    }

    return this.dataRootOption === undefined
      ? Paths.getInstalledRoomsDir()
      : join(this.getDataRoot(), "rooms");
  }

  private getRoomRuntimeBuildDir(roomId: string): string {
    if (this.runtimeBuildRootOption === undefined && this.legacyInstalledRootOption !== undefined) {
      return join(this.getRuntimeBuildRoot(), roomId);
    }

    return this.runtimeBuildRootOption === undefined && this.workspaceRootOption === undefined
      ? Paths.getRoomRuntimeBuildDir(roomId)
      : join(this.getRuntimeBuildRoot(), roomId, "runtime");
  }

  private getRoomStorageRoot(roomId: string): string {
    return this.dataRootOption === undefined
      ? Paths.getRoomStorageDir(roomId)
      : join(this.getDataRoot(), "room-storage", roomId);
  }

  private getRoomPartitionRoot(roomId: string): string {
    return this.dataRootOption === undefined
      ? Paths.getRoomPartitionDir(roomId)
      : join(this.getDataRoot(), "electron-user-data", "Partitions", `room-${roomId}`);
  }

  private getRoomRuntimeResidue(roomId: string): RoomRuntimeResiduePaths {
    return {
      partitionRoot: this.getRoomPartitionRoot(roomId),
      policy:
        this.dataRootOption === undefined
          ? Paths.getRoomRuntimeResiduePolicy()
          : {
              cleanupTrigger: "deleteData",
              ownsPackageContent: false,
              preserveByDefault: true,
            },
      storageRoot: this.getRoomStorageRoot(roomId),
    };
  }

  private async deletePersistentRoomData(roomId: string): Promise<void> {
    const residue = this.getRoomRuntimeResidue(roomId);
    // NOTE: This path only runs for explicit data deletion, so runtime residue is always removed here.
    await Promise.all([
      rm(residue.storageRoot, { recursive: true, force: true }),
      rm(residue.partitionRoot, { recursive: true, force: true }),
    ]);
  }

  private isPathInsideRuntimeBuildRoot(targetPath: string): boolean {
    const relativePath = relative(
      normalizeRoomPath(this.getRuntimeBuildRoot()),
      normalizeRoomPath(targetPath)
    );
    return (
      relativePath === "" ||
      (relativePath.startsWith("..") === false &&
        relativePath.includes(`..${process.platform === "win32" ? "\\" : "/"}`) === false)
    );
  }

  private isPathInsideLegacyInstalledRoot(targetPath: string): boolean {
    const relativePath = relative(
      normalizeRoomPath(this.getLegacyInstalledRoot()),
      normalizeRoomPath(targetPath)
    );
    return (
      relativePath === "" ||
      (relativePath.startsWith("..") === false &&
        relativePath.includes(`..${process.platform === "win32" ? "\\" : "/"}`) === false)
    );
  }

  private async restoreLegacyInstalledRoomSource(room: InstalledRoomRecord): Promise<boolean> {
    if (
      this.legacyInstalledRootOption !== undefined ||
      this.isPathInsideLegacyInstalledRoot(room.installedDir) === false ||
      existsSync(join(room.installedDir, "manifest.json")) === false
    ) {
      return false;
    }

    const workspaceSourceDir = join(this.getWorkspaceRoot(), room.id);
    if (existsSync(workspaceSourceDir)) {
      return false;
    }

    await copyDirectoryContents(room.installedDir, workspaceSourceDir, {
      includeRelativePath: isLegacyRoomSourceRestorePath,
    });
    return true;
  }

  private async deleteInstalledPackage(
    room: InstalledRoomRecord,
    options: { deleteData: boolean }
  ): Promise<void> {
    const usesLegacyDirectInstalledRoot =
      this.runtimeBuildRootOption === undefined && this.legacyInstalledRootOption !== undefined;

    if (
      usesLegacyDirectInstalledRoot === false &&
      this.isPathInsideRuntimeBuildRoot(room.installedDir)
    ) {
      const artifactRoot =
        normalizeRoomPath(room.installedDir) ===
        normalizeRoomPath(this.getRoomRuntimeBuildDir(room.id))
          ? dirname(room.installedDir)
          : room.installedDir;
      await rm(artifactRoot, { recursive: true, force: true });
      return;
    }

    if (options.deleteData === true) {
      await rm(room.installedDir, { recursive: true, force: true });
      return;
    }

    const trackedFiles = await resolveInstalledRoomTrackedFiles(room);
    await deleteInstalledRoomCopies(room.installedDir, trackedFiles);
  }

  private async deleteGeneratedRoomPackage(
    roomId: string,
    options: { deleteData: boolean }
  ): Promise<void> {
    const usesLegacyDirectInstalledRoot =
      this.runtimeBuildRootOption === undefined && this.legacyInstalledRootOption !== undefined;

    if (usesLegacyDirectInstalledRoot === true) {
      if (options.deleteData === true) {
        await rm(join(this.getRuntimeBuildRoot(), roomId), { recursive: true, force: true });
      }
      return;
    }

    await rm(join(this.getRuntimeBuildRoot(), roomId), { recursive: true, force: true });
  }

  private getRegistryPath(): string {
    return this.registryPathOption ?? Paths.getRoomsRegistryPath();
  }

  private async ensureWorkspaceRoot(): Promise<void> {
    await ensureDir(this.getWorkspaceRoot());
  }

  private async ensureInstalledRoot(): Promise<void> {
    await ensureDir(this.getRuntimeBuildRoot());
  }

  private async ensureRegistryRoot(): Promise<void> {
    await ensureDir(dirname(this.getRegistryPath()));
  }

  async ensureRoots(): Promise<void> {
    await Promise.all([
      this.ensureWorkspaceRoot(),
      this.ensureInstalledRoot(),
      this.ensureRegistryRoot(),
    ]);
  }

  async listWorkspaceRooms(): Promise<RoomWorkspaceEntry[]> {
    await this.ensureWorkspaceRoot();
    const rooms = (
      await Promise.all(
        buildRoomWorkspaceRoots(this.getWorkspaceRoot(), this.getBundledWorkspaceRoot()).map(
          async (rootConfig) => await readWorkspaceRoomsFromRoot(rootConfig)
        )
      )
    ).flat();

    const dedupedRooms = new Map<string, RoomWorkspaceEntry>();
    for (const room of rooms) {
      const roomKey = room.manifest?.id ?? room.dirName;
      const current = dedupedRooms.get(roomKey);
      dedupedRooms.set(
        roomKey,
        current === undefined ? room : pickPreferredWorkspaceRoom(current, room)
      );
    }

    return Array.from(dedupedRooms.values()).sort((left, right) =>
      left.dirName.localeCompare(right.dirName)
    );
  }

  private shouldUseWorkspaceFallbackInstalledRooms(): boolean {
    return this.usesDefaultRoomRoots() && Paths.isPackaged() !== true;
  }

  private usesDefaultRoomRoots(): boolean {
    return (
      this.workspaceRootOption === undefined &&
      this.bundledWorkspaceRootOption === undefined &&
      this.runtimeBuildRootOption === undefined &&
      this.legacyInstalledRootOption === undefined &&
      this.dataRootOption === undefined &&
      this.registryPathOption === undefined
    );
  }

  private async buildWorkspaceInstalledRoomRecord(
    room: RoomWorkspaceEntry
  ): Promise<InstalledRoomRecord | null> {
    if (room.valid !== true || room.manifest === undefined || room.readOnly === true) {
      return null;
    }

    const buildResult = await this.buildWorkspaceRoomArtifact(room.manifest.id);
    if (buildResult.success !== true) {
      return null;
    }

    const now = new Date().toISOString();
    return {
      ...buildInstalledRoomRecord(room.manifest, {
        sourceDir: room.dirPath,
        installedDir: buildResult.artifact.buildDir,
        installedAt: now,
        updatedAt: now,
      }),
      isWorkspaceFallback: true,
    };
  }

  private shouldBootstrapPackagedInstalledRooms(): boolean {
    return (
      this.usesDefaultRoomRoots() &&
      Paths.isPackaged() === true &&
      existsSync(this.getRegistryPath()) === false
    );
  }

  private async bootstrapPackagedInstalledRoomsFromWorkspace(): Promise<void> {
    const workspaceRooms = await this.listWorkspaceRooms();
    // NOTE: Bootstrap installs stay ordered because each run rewrites the shared registry file.
    await workspaceRooms.reduce(async (previousInstall, room) => {
      await previousInstall;
      if (room.valid !== true || room.manifest === undefined || room.readOnly === true) {
        return;
      }

      await this.installFromWorkspace(room.manifest.id);
    }, Promise.resolve());
  }

  private async hydrateInstalledRoomsFromRegistry(): Promise<InstalledRoomRecord[]> {
    const registry = await this.readRegistry();
    const hydrated = await Promise.all(
      registry.rooms.map(async (record) => await this.hydrateInstalledRoomRecord(record))
    );

    return hydrated
      .filter((record): record is InstalledRoomRecord => record !== null)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async listInstalledRooms(): Promise<InstalledRoomRecord[]> {
    const installedRooms = await this.hydrateInstalledRoomsFromRegistry();

    if (installedRooms.length > 0) {
      return installedRooms;
    }

    if (this.shouldBootstrapPackagedInstalledRooms()) {
      await this.bootstrapPackagedInstalledRoomsFromWorkspace();
      return await this.hydrateInstalledRoomsFromRegistry();
    }

    if (this.shouldUseWorkspaceFallbackInstalledRooms() === false) {
      return installedRooms;
    }

    const workspaceRooms = await this.listWorkspaceRooms();
    const builtWorkspaceRooms = await Promise.all(
      workspaceRooms.map(async (room) => await this.buildWorkspaceInstalledRoomRecord(room))
    );

    return builtWorkspaceRooms
      .filter((room): room is InstalledRoomRecord => room !== null)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private findLinkedWorkspaceRoom(
    room: InstalledRoomRecord,
    workspaceRooms: RoomWorkspaceEntry[]
  ): RoomWorkspaceEntry | null {
    const writableWorkspaceRooms = workspaceRooms.filter(
      (candidate) => candidate.readOnly !== true && candidate.sourceKind !== "bundle"
    );
    const sourcePath = normalizeRoomPath(room.sourceDir);
    const pathMatch =
      writableWorkspaceRooms.find(
        (candidate) => normalizeRoomPath(candidate.dirPath) === sourcePath
      ) ?? null;

    if (pathMatch !== null) {
      return pathMatch;
    }

    return writableWorkspaceRooms.find((candidate) => candidate.manifest?.id === room.id) ?? null;
  }

  private async workspaceRoomNeedsStartupSync(
    room: InstalledRoomRecord,
    workspaceRoom: RoomWorkspaceEntry
  ): Promise<boolean> {
    if (
      this.legacyInstalledRootOption === undefined &&
      this.isPathInsideLegacyInstalledRoot(room.installedDir)
    ) {
      return true;
    }

    if (
      existsSync(room.manifestPath) === false ||
      existsSync(room.runtimeEntryPath) === false ||
      existsSync(room.hostEntryPath) === false
    ) {
      return true;
    }

    const sourceState = await collectWorkspaceRoomSourceBuildState(workspaceRoom.dirPath);
    const trackedFiles = await resolveInstalledRoomTrackedFiles(room);
    if (haveSameRelativePaths(sourceState.outputRelativePaths, trackedFiles) === false) {
      return true;
    }

    const installedUpdatedAtMs = Date.parse(room.updatedAt);
    if (Number.isFinite(installedUpdatedAtMs) !== true) {
      return true;
    }

    return sourceState.latestSourceMtimeMs > installedUpdatedAtMs;
  }

  private async buildStartupProtocols(
    rooms: InstalledRoomRecord[]
  ): Promise<StartupRoomProtocolSnapshot[]> {
    const protocolEntries = await Promise.all(
      rooms.flatMap((room) =>
        (room.protocolSpecs ?? []).map(async (spec) => {
          const protocolPath = join(room.installedDir, "protocols", `${spec.key}.md`);
          const body =
            existsSync(protocolPath) === true
              ? await readFile(protocolPath, "utf8").catch(() => "")
              : "";

          return {
            roomId: room.id,
            key: spec.key,
            body,
          };
        })
      )
    );

    return protocolEntries;
  }

  private async buildManagedStartupSnapshot(): Promise<StartupRoomsSnapshot | null> {
    const rooms = await this.hydrateInstalledRoomsFromRegistry();
    if (rooms.length === 0) {
      return null;
    }

    return {
      rooms,
      protocols: await this.buildStartupProtocols(rooms),
    };
  }

  async syncLinkedWorkspaceRoomsOnStartup(): Promise<StartupRoomsSyncResult> {
    const registry = await this.readRegistry();
    if (registry.rooms.length === 0) {
      return {
        success: true,
        snapshot: null,
        syncedRoomIds: [],
      };
    }

    let workspaceRooms = await this.listWorkspaceRooms();
    const restoredLegacySources = await Promise.all(
      registry.rooms.map(async (room) => {
        if (this.findLinkedWorkspaceRoom(room, workspaceRooms) !== null) {
          return false;
        }

        return await this.restoreLegacyInstalledRoomSource(room);
      })
    );

    if (restoredLegacySources.some((restored) => restored)) {
      workspaceRooms = await this.listWorkspaceRooms();
    }

    const syncedRoomIds: string[] = [];
    const errors: string[] = [];
    const startupSyncPlan = await Promise.all(
      registry.rooms.map(async (room) => {
        const linkedWorkspaceRoom = this.findLinkedWorkspaceRoom(room, workspaceRooms);
        if (linkedWorkspaceRoom === null) {
          return null;
        }

        if (linkedWorkspaceRoom.valid !== true || linkedWorkspaceRoom.manifest === undefined) {
          return {
            roomId: room.id,
            status: "invalid" as const,
          };
        }

        const shouldSync = await this.workspaceRoomNeedsStartupSync(room, linkedWorkspaceRoom);
        if (shouldSync !== true) {
          return null;
        }

        return {
          manifestId: linkedWorkspaceRoom.manifest.id,
          status: "sync" as const,
        };
      })
    );

    await startupSyncPlan.reduce<Promise<void>>(async (previous, entry) => {
      await previous;
      if (entry === null) {
        return;
      }

      if (entry.status === "invalid") {
        errors.push(`${entry.roomId}: workspace source is invalid`);
        return;
      }

      // NOTE: Install writes shared registry state, so startup sync stays serialized even
      // though the "needs sync" probes can run in parallel.
      const installResult = await this.installFromWorkspace(entry.manifestId);
      if (installResult.success === true) {
        syncedRoomIds.push(entry.manifestId);
        return;
      }

      errors.push(`${entry.manifestId}: ${installResult.error ?? "workspace sync failed"}`);
    }, Promise.resolve());

    const snapshot = await this.buildManagedStartupSnapshot();
    if (errors.length > 0) {
      return {
        success: false,
        snapshot,
        syncedRoomIds,
        error: errors.join(" | "),
      };
    }

    return {
      success: true,
      snapshot,
      syncedRoomIds,
    };
  }

  async installFromWorkspace(roomId: string): Promise<RoomOperationResult> {
    return await installRoomFromWorkspace({
      ensureRoots: async () => {
        await this.ensureRoots();
      },
      prepareWorkspaceRoomBuild: async () => await this.buildWorkspaceRoomArtifact(roomId),
      readRegistry: async () => await this.readRegistry(),
      roomPackageT,
      writeRegistry: async (registry) => {
        await this.writeRegistry(registry);
      },
    });
  }

  async buildWorkspaceRoom(roomId: string): Promise<RoomOperationResult> {
    const result = await this.buildWorkspaceRoomArtifact(roomId);
    if (result.success !== true) {
      return {
        success: false,
        error: result.error,
      };
    }

    return {
      success: true,
      path: result.artifact.buildDir,
    };
  }

  async removeInstalledRoom(
    roomId: string,
    options: { deleteData?: boolean } = {}
  ): Promise<RoomOperationResult> {
    return await removeInstalledRoomOperation({
      deleteInstalledPackage: async (room, deleteOptions) => {
        await this.deleteInstalledPackage(room, deleteOptions);
      },
      deletePersistentRoomData: async (targetRoomId) => {
        await this.deletePersistentRoomData(targetRoomId);
      },
      options,
      readRegistry: async () => await this.readRegistry(),
      roomId,
      roomPackageT,
      writeRegistry: async (registry) => {
        await this.writeRegistry(registry);
      },
    });
  }

  async deleteWorkspaceRoom(
    roomId: string,
    options: { deleteData?: boolean } = {}
  ): Promise<RoomOperationResult> {
    return await deleteWorkspaceRoomOperation({
      deleteInstalledPackage: async (room, deleteOptions) => {
        await this.deleteInstalledPackage(room, deleteOptions);
      },
      deleteGeneratedRoomPackage: async (targetRoomId, deleteOptions) => {
        await this.deleteGeneratedRoomPackage(targetRoomId, deleteOptions);
      },
      deletePersistentRoomData: async (targetRoomId) => {
        await this.deletePersistentRoomData(targetRoomId);
      },
      listWorkspaceRooms: async () => await this.listWorkspaceRooms(),
      options,
      readRegistry: async () => await this.readRegistry(),
      roomId,
      roomPackageT,
      writeRegistry: async (registry) => {
        await this.writeRegistry(registry);
      },
    });
  }

  async exportInstalledRoomToWorkspace(
    roomId: string,
    options: { overwrite?: boolean } = {}
  ): Promise<RoomOperationResult> {
    return await exportInstalledRoomToWorkspaceOperation({
      ensureRoots: async () => {
        await this.ensureWorkspaceRoot();
      },
      options,
      readRegistry: async () => await this.readRegistry(),
      roomId,
      roomPackageT,
      workspaceRoot: this.getWorkspaceRoot(),
    });
  }

  async packageWorkspaceRoom(
    roomId: string,
    options: { outputFile?: string } = {}
  ): Promise<RoomOperationResult> {
    return await packageWorkspaceRoomBundle({
      prepareWorkspaceRoomBuild: async () => await this.buildWorkspaceRoomArtifact(roomId),
      ...(options.outputFile !== undefined ? { outputFile: options.outputFile } : {}),
    });
  }

  private async buildWorkspaceRoomArtifact(
    roomId: string
  ): Promise<BuildWorkspaceRoomArtifactResult> {
    return await buildWorkspaceRoomArtifactOperation({
      getRoomStorageRoot: (targetRoomId) => this.getRoomStorageRoot(targetRoomId),
      getRoomRuntimeBuildDir: (targetRoomId) => this.getRoomRuntimeBuildDir(targetRoomId),
      roomId,
      roomPackageError,
      roomPackageT,
      workspaceRooms: await this.listWorkspaceRooms(),
    });
  }

  async importBundleFile(
    bundleFile: string,
    options: { overwriteWorkspace?: boolean } = {}
  ): Promise<RoomOperationResult> {
    return await importRoomBundleFile({
      bundleFile,
      ensureRoots: async () => {
        await this.ensureRoots();
      },
      getWorkspaceRoot: () => this.getWorkspaceRoot(),
      installFromWorkspace: async (roomIdToInstall) =>
        await this.installFromWorkspace(roomIdToInstall),
      options,
      roomPackageError,
      roomPackageT,
    });
  }

  private async readRegistry(): Promise<RoomRegistryState> {
    return await readRoomRegistry(this.getRegistryPath(), async () => {
      await this.ensureRegistryRoot();
    });
  }

  private async writeRegistry(registry: RoomRegistryState): Promise<void> {
    await writeRoomRegistry(this.getRegistryPath(), registry, async () => {
      await this.ensureRegistryRoot();
    });
  }

  private async hydrateInstalledRoomRecord(
    record: InstalledRoomRecord
  ): Promise<InstalledRoomRecord | null> {
    return await hydrateInstalledRoomRecord(record);
  }
}

let roomPackageManagerSingleton: RoomPackageManager | null = null;

export function getRoomPackageManager(): RoomPackageManager {
  roomPackageManagerSingleton ??= new RoomPackageManager();
  return roomPackageManagerSingleton;
}

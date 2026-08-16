import {
  callRepairRoomTools,
  getRepairElectronApi,
  listRepairDirectory,
  readRepairJsonFile,
  writeRepairJsonFile,
} from "./electron-bridge.js";

type RepairHostIoRuntimeDeps = {
  roomId: string;
};

export function createRepairHostIoRuntime(deps: RepairHostIoRuntimeDeps) {
  const { roomId } = deps;

  async function ensureRuntimeDirectory(dirPath: string, requestId?: string | null) {
    await callRepairRoomTools({
      operation: "ensure-dir",
      roomId,
      targetPath: dirPath,
      ...(requestId ? { requestId } : {}),
    });
  }

  async function deleteRuntimePath(
    targetPath: string,
    options: { recursive?: boolean; requestId?: string | null } = {}
  ) {
    await callRepairRoomTools({
      operation: "delete-path",
      roomId,
      targetPath,
      recursive: options.recursive === true,
      ...(options.requestId ? { requestId: options.requestId } : {}),
    });
  }

  async function resolveRuntimePaths(requestId?: string | null) {
    const result = await callRepairRoomTools({
      operation: "resolve-paths",
      roomId,
      ...(requestId ? { requestId } : {}),
    });
    return result["paths"];
  }

  return {
    callRoomTools: callRepairRoomTools,
    deleteRuntimePath,
    ensureRuntimeDirectory,
    getElectronApi: getRepairElectronApi,
    listDirectory: listRepairDirectory,
    readJsonFile: readRepairJsonFile,
    resolveRuntimePaths,
    writeJsonFile: writeRepairJsonFile,
  };
}

export type RepairHostIoRuntime = ReturnType<typeof createRepairHostIoRuntime>;

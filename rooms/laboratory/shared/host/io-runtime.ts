import {
  callLaboratoryRoomTools,
  cancelLaboratoryRoomTool,
  digestLaboratorySha1,
  ensureLaboratoryProjectDirectories,
  ensureLaboratoryRuntimeDirectory,
  getLaboratoryElectronApi,
  listLaboratoryDirectory,
  readLaboratoryBinaryFileBytes,
  readLaboratoryJsonFile,
  readLaboratoryTextFile,
  writeLaboratoryJsonFile,
  writeLaboratoryTextFile,
} from "./electron-bridge.js";

type LaboratoryHostIoRuntimeDeps = {
  getProjectDirectoryFallbackMarkerList: (runtime: unknown, project: unknown) => string[];
  getProjectDirectoryList: (runtime: unknown, project: unknown) => string[];
  roomId: string;
};

export function createLaboratoryHostIoRuntime(deps: LaboratoryHostIoRuntimeDeps) {
  const { getProjectDirectoryFallbackMarkerList, getProjectDirectoryList, roomId } = deps;

  function getElectronApi() {
    return getLaboratoryElectronApi();
  }

  async function digestSha1(bytes: unknown) {
    if (!(bytes instanceof Uint8Array)) {
      throw new Error("SHA-1 digest requires Uint8Array input.");
    }
    return digestLaboratorySha1(bytes);
  }

  async function readJsonFile(filePath: string) {
    return readLaboratoryJsonFile(filePath);
  }

  async function readTextFile(filePath: string) {
    return readLaboratoryTextFile(filePath);
  }

  async function readBinaryFileBytes(filePath: string) {
    return readLaboratoryBinaryFileBytes(filePath);
  }

  async function writeJsonFile(filePath: string, value: unknown) {
    return writeLaboratoryJsonFile(filePath, value);
  }

  async function writeTextFile(filePath: string, value: string) {
    return writeLaboratoryTextFile(filePath, value);
  }

  async function listDirectory(dirPath: string) {
    return listLaboratoryDirectory(dirPath);
  }

  async function callRoomTools(request: Record<string, unknown>) {
    return callLaboratoryRoomTools(request as Parameters<typeof callLaboratoryRoomTools>[0]);
  }

  async function ensureRuntimeDirectory(dirPath: string, requestId?: string | null) {
    return ensureLaboratoryRuntimeDirectory({
      roomId,
      dirPath,
      ...(requestId ? { requestId } : {}),
    });
  }

  async function ensureProjectDirectories(
    runtime: unknown,
    project: unknown,
    requestId?: string | null
  ) {
    return ensureLaboratoryProjectDirectories({
      roomId,
      dirPaths: getProjectDirectoryList(runtime, project),
      fallbackMarkerPaths: getProjectDirectoryFallbackMarkerList(runtime, project),
      ...(requestId ? { requestId } : {}),
    });
  }

  async function cancelRoomTool(cancelRoomId: string, jobId: string, requestId: string) {
    return cancelLaboratoryRoomTool({
      roomId: cancelRoomId,
      jobId,
      requestId,
    });
  }

  async function readSharedTranscriptStatus() {
    const result = await callRoomTools({
      operation: "transcript-status",
      roomId,
    });
    return result["transcriptStatus"];
  }

  async function listSharedTranscriptModels() {
    const result = await callRoomTools({
      operation: "transcript-list-models",
      roomId,
    });
    const transcriptModels = result["transcriptModels"];
    if (!Array.isArray(transcriptModels)) {
      return [];
    }

    const models: unknown[] = transcriptModels;
    return models;
  }

  async function transcribeManagedAudioFile(payload: Record<string, unknown>) {
    const result = await callRoomTools({
      operation: "transcript-transcribe-file",
      roomId,
      ...payload,
    });
    return result["transcription"];
  }

  return {
    callRoomTools,
    cancelRoomTool,
    digestSha1,
    ensureProjectDirectories,
    ensureRuntimeDirectory,
    getElectronApi,
    listDirectory,
    listSharedTranscriptModels,
    readBinaryFileBytes,
    readJsonFile,
    readSharedTranscriptStatus,
    readTextFile,
    transcribeManagedAudioFile,
    writeJsonFile,
    writeTextFile,
  };
}

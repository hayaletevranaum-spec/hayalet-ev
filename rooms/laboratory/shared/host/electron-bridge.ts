type LaboratoryWritePayload = {
  data: string;
  encoding?: string;
  path: string;
};

type LaboratoryWriteResult = {
  error?: string;
  message?: string;
  path?: string;
  success?: boolean;
};

type LaboratoryOpenPathResult = {
  error?: string;
  message?: string;
  success?: boolean;
};

type LaboratoryOpenDialogResult = {
  canceled?: boolean;
  filePaths?: string[];
};

type LaboratoryDirectoryEntry = {
  isDirectory: boolean;
  name: string;
  path: string;
};

type LaboratoryRoomToolRequest = {
  [key: string]: unknown;
  jobId?: string | null;
  operation: string;
  requestId?: string | null;
  roomId: string;
};

type LaboratoryRoomToolResult = {
  [key: string]: unknown;
  error?: string;
  jobId?: string | null;
  operation?: string;
  requestId?: string | null;
  success: boolean;
};

type LaboratoryRoomToolCancelRequest = {
  jobId: string;
  requestId?: string | null;
  roomId: string;
};

type LaboratoryRoomToolCancelResult = {
  [key: string]: unknown;
  cancelled?: boolean;
  error?: string;
  success?: boolean;
};

type LaboratoryMaybeApiRecord = {
  [key: string]: unknown;
};

type LaboratoryElectronApi = {
  fmWriteFileAtomic: (payload: LaboratoryWritePayload) => Promise<LaboratoryWriteResult>;
  openPath: (path: string) => Promise<LaboratoryOpenPathResult>;
  readDirectoryFiles: (dirPath: string) => Promise<LaboratoryDirectoryEntry[]>;
  readFile: (path: string) => Promise<string | null>;
  roomToolsCall: (request: LaboratoryRoomToolRequest) => Promise<LaboratoryRoomToolResult>;
  roomToolsCancel: (
    request: LaboratoryRoomToolCancelRequest
  ) => Promise<LaboratoryRoomToolCancelResult>;
  showOpenDialog?: (options: LaboratoryMaybeApiRecord) => Promise<LaboratoryOpenDialogResult>;
};

function toApiRecord(value: unknown): LaboratoryMaybeApiRecord | null {
  return typeof value === "object" && value !== null ? (value as LaboratoryMaybeApiRecord) : null;
}

function isLaboratoryElectronApi(value: unknown): value is LaboratoryElectronApi {
  const record = toApiRecord(value);
  return (
    record !== null &&
    typeof record["readFile"] === "function" &&
    typeof record["openPath"] === "function" &&
    typeof record["fmWriteFileAtomic"] === "function" &&
    typeof record["readDirectoryFiles"] === "function" &&
    typeof record["roomToolsCall"] === "function" &&
    typeof record["roomToolsCancel"] === "function"
  );
}

export function getLaboratoryElectronApi(): LaboratoryElectronApi | null {
  if (typeof window === "undefined" || isLaboratoryElectronApi(window.electronAPI) !== true) {
    return null;
  }
  return window.electronAPI;
}

function decodeBase64Binary(base64Value: string): string | null {
  if (typeof base64Value !== "string" || base64Value.trim() === "") {
    return null;
  }

  try {
    return atob(base64Value);
  } catch (_error) {
    return null;
  }
}

function binaryToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function decodeLaboratoryBase64Text(base64Value: string): string | null {
  const binary = decodeBase64Binary(base64Value);
  if (binary === null) {
    return null;
  }
  return new TextDecoder("utf-8").decode(binaryToBytes(binary));
}

export function decodeLaboratoryBase64Bytes(base64Value: string): Uint8Array | null {
  const binary = decodeBase64Binary(base64Value);
  return binary === null ? null : binaryToBytes(binary);
}

function toHexString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let output = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index] ?? 0;
    output += byte.toString(16).padStart(2, "0");
  }
  return output;
}

export async function digestLaboratorySha1(bytes: Uint8Array): Promise<string> {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error("SHA-1 digest is unavailable in the current room host.");
  }
  const digestBytes = new Uint8Array(bytes.byteLength);
  digestBytes.set(bytes);
  return toHexString(await globalThis.crypto.subtle.digest("SHA-1", digestBytes));
}

export async function readLaboratoryJsonFile(filePath: string): Promise<unknown | null> {
  const electronApi = getLaboratoryElectronApi();
  if (electronApi === null) {
    return null;
  }

  const encoded = await electronApi.readFile(filePath);
  const raw = decodeLaboratoryBase64Text(encoded ?? "");
  if (typeof raw !== "string" || raw.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch (_error) {
    return null;
  }
}

export async function readLaboratoryTextFile(filePath: string): Promise<string | null> {
  const electronApi = getLaboratoryElectronApi();
  if (electronApi === null) {
    return null;
  }

  const encoded = await electronApi.readFile(filePath);
  return decodeLaboratoryBase64Text(encoded ?? "");
}

export async function readLaboratoryBinaryFileBytes(filePath: string): Promise<Uint8Array | null> {
  const electronApi = getLaboratoryElectronApi();
  if (electronApi === null) {
    return null;
  }

  const encoded = await electronApi.readFile(filePath);
  return decodeLaboratoryBase64Bytes(encoded ?? "");
}

function getOpenPathErrorMessage(result: LaboratoryOpenPathResult): string {
  if (typeof result.error === "string" && result.error.trim() !== "") {
    return result.error;
  }
  if (typeof result.message === "string" && result.message.trim() !== "") {
    return result.message;
  }
  return "Open path failed.";
}

export async function openLaboratoryPath(targetPath: string): Promise<void> {
  const electronApi = getLaboratoryElectronApi();
  if (electronApi === null) {
    throw new Error("Electron API is unavailable.");
  }

  const result = await electronApi.openPath(targetPath);
  if (result.success !== true) {
    throw new Error(getOpenPathErrorMessage(result));
  }
}

function getWriteErrorMessage(result: LaboratoryWriteResult): string {
  if (typeof result.error === "string" && result.error.trim() !== "") {
    return result.error;
  }
  if (typeof result.message === "string" && result.message.trim() !== "") {
    return result.message;
  }
  return "Write failed.";
}

async function writeElectronFile(payload: LaboratoryWritePayload): Promise<void> {
  const electronApi = getLaboratoryElectronApi();
  if (electronApi === null) {
    throw new Error("Electron API is unavailable.");
  }

  const result = await electronApi.fmWriteFileAtomic(payload);
  if (result.success !== true) {
    throw new Error(getWriteErrorMessage(result));
  }
}

export async function writeLaboratoryJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeElectronFile({
    path: filePath,
    data: JSON.stringify(value, null, 2),
  });
}

export async function writeLaboratoryTextFile(filePath: string, value: string): Promise<void> {
  await writeElectronFile({
    path: filePath,
    data: value,
  });
}

export async function listLaboratoryDirectory(
  dirPath: string
): Promise<LaboratoryDirectoryEntry[]> {
  const electronApi = getLaboratoryElectronApi();
  if (electronApi === null) {
    return [];
  }

  try {
    return await electronApi.readDirectoryFiles(dirPath);
  } catch (_error) {
    return [];
  }
}

export async function callLaboratoryRoomTools(
  request: LaboratoryRoomToolRequest
): Promise<LaboratoryRoomToolResult> {
  const electronApi = getLaboratoryElectronApi();
  if (electronApi === null) {
    throw new Error("Room tools bridge is unavailable.");
  }

  const result = await electronApi.roomToolsCall(request);
  if (result.success !== true) {
    throw new Error(result.error || "Room tools call failed.");
  }
  return result;
}

function isUnsupportedEnsureDirError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.indexOf("Unsupported room-tools operation: ensure-dir") !== -1;
}

async function ensureDirectoryMarker(dirPath: string): Promise<void> {
  await writeElectronFile({
    path: `${dirPath}/.keep`,
    data: "",
  });
}

export async function ensureLaboratoryRuntimeDirectory(options: {
  dirPath: string;
  requestId?: string;
  roomId: string;
}): Promise<void> {
  const { dirPath, requestId, roomId } = options;

  try {
    await callLaboratoryRoomTools({
      operation: "ensure-dir",
      roomId,
      requestId: requestId || null,
      targetPath: dirPath,
    });
    return;
  } catch (error) {
    if (isUnsupportedEnsureDirError(error) !== true) {
      throw error;
    }
  }

  await ensureDirectoryMarker(dirPath);
}

export async function ensureLaboratoryProjectDirectories(options: {
  dirPaths: string[];
  fallbackMarkerPaths: string[];
  requestId?: string;
  roomId: string;
}): Promise<void> {
  const { dirPaths, fallbackMarkerPaths, requestId, roomId } = options;

  try {
    for (let index = 0; index < dirPaths.length; index += 1) {
      // eslint-disable-next-line no-await-in-loop -- NOTE: keep ensure-dir attempts ordered before fallback.
      await callLaboratoryRoomTools({
        operation: "ensure-dir",
        roomId,
        requestId: requestId || null,
        targetPath: dirPaths[index],
      });
    }
    return;
  } catch (error) {
    if (isUnsupportedEnsureDirError(error) !== true) {
      throw error;
    }
  }

  await Promise.all(
    fallbackMarkerPaths.map(function (dirPath) {
      return ensureDirectoryMarker(dirPath);
    })
  );
}

export async function cancelLaboratoryRoomTool(options: {
  roomId: string;
  jobId: string;
  requestId?: string;
}): Promise<void> {
  const { roomId, jobId, requestId } = options;
  const electronApi = getLaboratoryElectronApi();
  if (electronApi === null) {
    return;
  }

  const request: LaboratoryRoomToolCancelRequest = {
    roomId,
    jobId,
    requestId: requestId || null,
  };
  await electronApi.roomToolsCancel(request);
}

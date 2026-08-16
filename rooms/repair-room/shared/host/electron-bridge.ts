type RepairWritePayload = {
  data: string;
  encoding?: string;
  path: string;
};

type RepairWriteResult = {
  error?: string;
  message?: string;
  path?: string;
  success?: boolean;
};

type RepairDirectoryEntry = {
  isDirectory: boolean;
  name: string;
  path: string;
};

type RepairRoomToolRequest = {
  [key: string]: unknown;
  operation: string;
  requestId?: string | null;
  roomId: string;
};

type RepairRoomToolResult = {
  [key: string]: unknown;
  error?: string;
  operation?: string;
  requestId?: string | null;
  success: boolean;
};

type RepairMaybeApiRecord = {
  [key: string]: unknown;
};

type RepairElectronApi = {
  fmWriteFileAtomic: (payload: RepairWritePayload) => Promise<RepairWriteResult>;
  readDirectoryFiles: (dirPath: string) => Promise<RepairDirectoryEntry[]>;
  readFile: (path: string) => Promise<string | null>;
  roomToolsCall: (request: RepairRoomToolRequest) => Promise<RepairRoomToolResult>;
};

function toApiRecord(value: unknown): RepairMaybeApiRecord | null {
  return typeof value === "object" && value !== null ? (value as RepairMaybeApiRecord) : null;
}

function isRepairElectronApi(value: unknown): value is RepairElectronApi {
  const record = toApiRecord(value);
  return (
    record !== null &&
    typeof record["readFile"] === "function" &&
    typeof record["fmWriteFileAtomic"] === "function" &&
    typeof record["readDirectoryFiles"] === "function" &&
    typeof record["roomToolsCall"] === "function"
  );
}

export function getRepairElectronApi(): RepairElectronApi | null {
  if (typeof window === "undefined" || isRepairElectronApi(window.electronAPI) !== true) {
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
  } catch {
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

export function decodeRepairBase64Text(base64Value: string): string | null {
  const binary = decodeBase64Binary(base64Value);
  if (binary === null) {
    return null;
  }
  return new TextDecoder("utf-8").decode(binaryToBytes(binary));
}

export async function readRepairJsonFile(filePath: string): Promise<unknown | null> {
  const electronApi = getRepairElectronApi();
  if (electronApi === null) {
    return null;
  }

  const encoded = await electronApi.readFile(filePath);
  const raw = decodeRepairBase64Text(encoded ?? "");
  if (typeof raw !== "string" || raw.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function getWriteErrorMessage(result: RepairWriteResult): string {
  if (typeof result.error === "string" && result.error.trim() !== "") {
    return result.error;
  }
  if (typeof result.message === "string" && result.message.trim() !== "") {
    return result.message;
  }
  return "Write failed.";
}

async function writeElectronFile(payload: RepairWritePayload): Promise<void> {
  const electronApi = getRepairElectronApi();
  if (electronApi === null) {
    throw new Error("Electron API is unavailable.");
  }

  const result = await electronApi.fmWriteFileAtomic(payload);
  if (result.success !== true) {
    throw new Error(getWriteErrorMessage(result));
  }
}

export async function writeRepairJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeElectronFile({
    path: filePath,
    data: JSON.stringify(value, null, 2),
  });
}

export async function listRepairDirectory(dirPath: string): Promise<RepairDirectoryEntry[]> {
  const electronApi = getRepairElectronApi();
  if (electronApi === null) {
    return [];
  }

  try {
    return await electronApi.readDirectoryFiles(dirPath);
  } catch {
    return [];
  }
}

export async function callRepairRoomTools(
  request: RepairRoomToolRequest
): Promise<RepairRoomToolResult> {
  const electronApi = getRepairElectronApi();
  if (electronApi === null) {
    throw new Error("Room tools bridge is unavailable.");
  }

  const result = await electronApi.roomToolsCall(request);
  if (result.success !== true) {
    throw new Error(result.error || "Room tools call failed.");
  }
  return result;
}

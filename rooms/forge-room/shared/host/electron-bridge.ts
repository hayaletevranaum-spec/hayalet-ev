type ForgeWritePayload = {
  data: string;
  encoding?: string;
  path: string;
};

type ForgeWriteResult = {
  error?: string;
  message?: string;
  path?: string;
  success?: boolean;
};

type ForgeDirectoryEntry = {
  isDirectory: boolean;
  name: string;
  path: string;
};

type ForgeRoomToolRequest = {
  [key: string]: unknown;
  operation: string;
  requestId?: string | null;
  roomId: string;
};

type ForgeRoomToolResult = {
  [key: string]: unknown;
  error?: string;
  operation?: string;
  requestId?: string | null;
  success: boolean;
};

type ForgeMaybeApiRecord = {
  [key: string]: unknown;
};

type ForgeElectronApi = {
  fmWriteFileAtomic: (payload: ForgeWritePayload) => Promise<ForgeWriteResult>;
  readDirectoryFiles: (dirPath: string) => Promise<ForgeDirectoryEntry[]>;
  readFile: (path: string) => Promise<string | null>;
  roomToolsCall: (request: ForgeRoomToolRequest) => Promise<ForgeRoomToolResult>;
};

function toApiRecord(value: unknown): ForgeMaybeApiRecord | null {
  return typeof value === "object" && value !== null ? (value as ForgeMaybeApiRecord) : null;
}

function isForgeElectronApi(value: unknown): value is ForgeElectronApi {
  const record = toApiRecord(value);
  return (
    record !== null &&
    typeof record["readFile"] === "function" &&
    typeof record["fmWriteFileAtomic"] === "function" &&
    typeof record["readDirectoryFiles"] === "function" &&
    typeof record["roomToolsCall"] === "function"
  );
}

export function getForgeElectronApi(): ForgeElectronApi | null {
  if (typeof window === "undefined" || isForgeElectronApi(window.electronAPI) !== true) {
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

export function decodeForgeBase64Text(base64Value: string): string | null {
  const binary = decodeBase64Binary(base64Value);
  if (binary === null) {
    return null;
  }
  return new TextDecoder("utf-8").decode(binaryToBytes(binary));
}

export async function readForgeJsonFile(filePath: string): Promise<unknown | null> {
  const electronApi = getForgeElectronApi();
  if (electronApi === null) {
    return null;
  }

  const encoded = await electronApi.readFile(filePath);
  const raw = decodeForgeBase64Text(encoded ?? "");
  if (typeof raw !== "string" || raw.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function readForgeTextFile(filePath: string): Promise<string | null> {
  const electronApi = getForgeElectronApi();
  if (electronApi === null) {
    return null;
  }

  const encoded = await electronApi.readFile(filePath);
  return decodeForgeBase64Text(encoded ?? "");
}

function getWriteErrorMessage(result: ForgeWriteResult): string {
  if (typeof result.error === "string" && result.error.trim() !== "") {
    return result.error;
  }
  if (typeof result.message === "string" && result.message.trim() !== "") {
    return result.message;
  }
  return "Write failed.";
}

async function writeElectronFile(payload: ForgeWritePayload): Promise<void> {
  const electronApi = getForgeElectronApi();
  if (electronApi === null) {
    throw new Error("Electron API is unavailable.");
  }

  const result = await electronApi.fmWriteFileAtomic(payload);
  if (result.success !== true) {
    throw new Error(getWriteErrorMessage(result));
  }
}

export async function writeForgeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeElectronFile({
    path: filePath,
    data: JSON.stringify(value, null, 2),
  });
}

export async function writeForgeTextFile(filePath: string, value: string): Promise<void> {
  await writeElectronFile({
    path: filePath,
    data: value,
  });
}

export async function listForgeDirectory(dirPath: string): Promise<ForgeDirectoryEntry[]> {
  const electronApi = getForgeElectronApi();
  if (electronApi === null) {
    return [];
  }

  try {
    return await electronApi.readDirectoryFiles(dirPath);
  } catch {
    return [];
  }
}

export async function callForgeRoomTools(
  request: ForgeRoomToolRequest
): Promise<ForgeRoomToolResult> {
  const electronApi = getForgeElectronApi();
  if (electronApi === null) {
    throw new Error("Room tools bridge is unavailable.");
  }

  const result = await electronApi.roomToolsCall(request);
  if (result.success !== true) {
    throw new Error(result.error || "Room tools call failed.");
  }
  return result;
}

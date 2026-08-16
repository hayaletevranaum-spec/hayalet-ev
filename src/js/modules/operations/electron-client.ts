import type {
  OperationAcquireResult,
  OperationCapability,
  OperationOwner,
  OperationReleaseResult,
  OperationsStatus,
} from "../../../types/operations.js";

const FALLBACK_OPERATIONS_STATUS: OperationsStatus = {
  records: [],
  updatedAt: 0,
};

function getElectronApi(): typeof window.electronAPI | undefined {
  return window.electronAPI;
}

function normalizeStatus(value: unknown): OperationsStatus {
  if (typeof value === "object" && value !== null && "records" in value && "updatedAt" in value) {
    return value as OperationsStatus;
  }

  return FALLBACK_OPERATIONS_STATUS;
}

export async function getOperationsStatus(): Promise<OperationsStatus> {
  const api = getElectronApi();
  const operationsStatus = api?.["operationsStatus"];
  if (typeof operationsStatus !== "function") {
    return FALLBACK_OPERATIONS_STATUS;
  }

  return normalizeStatus(await operationsStatus());
}

export async function acquireOperationCapability(
  capability: OperationCapability,
  owner: OperationOwner
): Promise<OperationAcquireResult> {
  const api = getElectronApi();
  const operationsAcquire = api?.["operationsAcquire"];
  if (typeof operationsAcquire !== "function") {
    return {
      success: false,
      error: "Electron operations bridge is unavailable.",
      status: FALLBACK_OPERATIONS_STATUS,
    };
  }

  return await operationsAcquire(capability, owner);
}

export async function releaseOperationCapability(
  capability: OperationCapability,
  owner: OperationOwner
): Promise<OperationReleaseResult> {
  const api = getElectronApi();
  const operationsRelease = api?.["operationsRelease"];
  if (typeof operationsRelease !== "function") {
    return {
      success: false,
      error: "Electron operations bridge is unavailable.",
      status: FALLBACK_OPERATIONS_STATUS,
    };
  }

  return await operationsRelease(capability, owner);
}

export function onOperationsStatus(callback: (status: OperationsStatus) => void): () => void {
  const api = getElectronApi();
  const operationsOnStatus = api?.["operationsOnStatus"];
  const operationsOffStatus = api?.["operationsOffStatus"];
  if (typeof operationsOnStatus !== "function" || typeof operationsOffStatus !== "function") {
    return () => {};
  }

  const handler = (payload: OperationsStatus): void => {
    callback(normalizeStatus(payload));
  };

  operationsOnStatus(handler);
  return () => {
    operationsOffStatus(handler);
  };
}

export const OPERATION_CAPABILITIES = [
  "local-microphone",
  "android-microphone",
  "android-camera",
  "local-tts",
  "android-tts",
  "android-torch",
  "ambient-listening",
  "live-feed",
] as const;

export type OperationCapability = (typeof OPERATION_CAPABILITIES)[number];

export interface OperationOwner {
  id: string;
  label: string;
  roomId?: string;
}

export interface OperationRecord {
  capability: OperationCapability;
  owner: OperationOwner;
  startedAt: number;
}

export interface OperationsStatus {
  records: OperationRecord[];
  updatedAt: number;
}

export type OperationAcquireResult =
  | {
      success: true;
      record: OperationRecord;
      status: OperationsStatus;
    }
  | {
      success: false;
      error: string;
      conflict?: OperationRecord;
      status: OperationsStatus;
    };

export type OperationReleaseResult =
  | {
      success: true;
      released: boolean;
      status: OperationsStatus;
    }
  | {
      success: false;
      error: string;
      conflict?: OperationRecord;
      status: OperationsStatus;
    };

export const OPERATIONS_STATUS_CHANNEL = "operations:status";

export function isOperationCapability(value: unknown): value is OperationCapability {
  return typeof value === "string" && OPERATION_CAPABILITIES.includes(value as OperationCapability);
}

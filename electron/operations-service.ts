import type {
  OperationAcquireResult,
  OperationCapability,
  OperationOwner,
  OperationRecord,
  OperationReleaseResult,
  OperationsStatus,
} from "../src/types/operations.ts";
import { OPERATION_CAPABILITIES, isOperationCapability } from "../src/types/operations.ts";

export type OperationsStatusListener = (status: OperationsStatus) => void;

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function normalizeOwner(value: unknown): OperationOwner | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const source = value as Record<string, unknown>;
  const id = readNonEmptyString(source["id"]);
  if (id === null) {
    return null;
  }

  const label = readNonEmptyString(source["label"]) ?? id;
  const roomId = readNonEmptyString(source["roomId"]);
  const owner: OperationOwner = { id, label };
  if (roomId !== null) {
    owner.roomId = roomId;
  }

  return owner;
}

function cloneOwner(owner: OperationOwner): OperationOwner {
  const cloned: OperationOwner = {
    id: owner.id,
    label: owner.label,
  };

  if (owner.roomId !== undefined) {
    cloned.roomId = owner.roomId;
  }

  return cloned;
}

function cloneRecord(record: OperationRecord): OperationRecord {
  return {
    capability: record.capability,
    owner: cloneOwner(record.owner),
    startedAt: record.startedAt,
  };
}

function createOperationRecord(
  capability: OperationCapability,
  owner: OperationOwner
): OperationRecord {
  return {
    capability,
    owner: cloneOwner(owner),
    startedAt: Date.now(),
  };
}

export class OperationsService {
  private readonly records = new Map<OperationCapability, OperationRecord>();
  private readonly listeners = new Set<OperationsStatusListener>();
  private updatedAt = Date.now();

  acquire(capabilityInput: unknown, ownerInput: unknown): OperationAcquireResult {
    if (!isOperationCapability(capabilityInput)) {
      return {
        success: false,
        error: "Invalid operation capability.",
        status: this.getStatus(),
      };
    }

    const owner = normalizeOwner(ownerInput);
    if (owner === null) {
      return {
        success: false,
        error: "Invalid operation owner.",
        status: this.getStatus(),
      };
    }

    const existing = this.records.get(capabilityInput);
    if (existing !== undefined) {
      if (existing.owner.id === owner.id) {
        const record = cloneRecord(existing);
        return {
          success: true,
          record,
          status: this.getStatus(),
        };
      }

      const conflict = cloneRecord(existing);
      return {
        success: false,
        error: `${capabilityInput} is already owned by ${conflict.owner.label}.`,
        conflict,
        status: this.getStatus(),
      };
    }

    const record = createOperationRecord(capabilityInput, owner);
    this.records.set(capabilityInput, record);
    this.updatedAt = Date.now();
    const status = this.getStatus();
    this.emit(status);

    return {
      success: true,
      record: cloneRecord(record),
      status,
    };
  }

  release(capabilityInput: unknown, ownerInput: unknown): OperationReleaseResult {
    if (!isOperationCapability(capabilityInput)) {
      return {
        success: false,
        error: "Invalid operation capability.",
        status: this.getStatus(),
      };
    }

    const owner = normalizeOwner(ownerInput);
    if (owner === null) {
      return {
        success: false,
        error: "Invalid operation owner.",
        status: this.getStatus(),
      };
    }

    const existing = this.records.get(capabilityInput);
    if (existing === undefined) {
      return {
        success: true,
        released: false,
        status: this.getStatus(),
      };
    }

    if (existing.owner.id !== owner.id) {
      const conflict = cloneRecord(existing);
      return {
        success: false,
        error: `${capabilityInput} is owned by ${conflict.owner.label}.`,
        conflict,
        status: this.getStatus(),
      };
    }

    this.records.delete(capabilityInput);
    this.updatedAt = Date.now();
    const status = this.getStatus();
    this.emit(status);

    return {
      success: true,
      released: true,
      status,
    };
  }

  getStatus(): OperationsStatus {
    return {
      records: OPERATION_CAPABILITIES.flatMap((capability) => {
        const record = this.records.get(capability);
        return record === undefined ? [] : [cloneRecord(record)];
      }),
      updatedAt: this.updatedAt,
    };
  }

  subscribe(listener: OperationsStatusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(status: OperationsStatus): void {
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}

export const operationsService = new OperationsService();

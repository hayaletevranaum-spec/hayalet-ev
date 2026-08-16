import { asLabRecord, asNonEmptyString } from "../domain/lab-types.js";
import type { LabEventFeedItem, LabStoreEvent } from "../domain/lab-types.js";

type LabBridgeDeps = {
  emit: (event: LabStoreEvent) => void;
};

function getSnapshotPayload(payload: Record<string, unknown>) {
  return payload["snapshot"] && typeof payload["snapshot"] === "object"
    ? asLabRecord(payload["snapshot"])
    : payload;
}

function getSnapshotPairKey(envelope: Record<string, unknown>, snapshot: Record<string, unknown>) {
  const activeProject = asLabRecord(snapshot["activeProject"]);
  const source = asLabRecord(activeProject["source"]);
  const requestId = asNonEmptyString(envelope["requestId"]);
  const action = asNonEmptyString(envelope["action"]);
  const activeProjectId =
    asNonEmptyString(snapshot["activeProjectId"]) || asNonEmptyString(activeProject["id"]);
  const storedPath = asNonEmptyString(source["storedPath"]);
  if (requestId === null && action === null && activeProjectId === null && storedPath === null) {
    return null;
  }
  return [
    requestId || "",
    action || "",
    activeProjectId || "",
    storedPath || "",
    snapshot["ready"] === true ? "ready" : "pending",
  ].join("\u001f");
}

export function createLabHostBridge(deps: LabBridgeDeps) {
  let pendingMediaStatePairKey: string | null = null;

  function handleHostMessage(message: unknown) {
    const record = asLabRecord(message);
    const type = typeof record["type"] === "string" ? (record["type"] as string) : "";
    const payload = asLabRecord(record["payload"]);
    const resolvedPayload = Object.keys(payload).length > 0 ? payload : record;

    if (type === "source-state") {
      const snapshot = getSnapshotPayload(resolvedPayload);
      const pairKey = getSnapshotPairKey(resolvedPayload, snapshot);
      const duplicatedMediaState = pairKey !== null && pairKey === pendingMediaStatePairKey;
      pendingMediaStatePairKey = null;
      if (duplicatedMediaState) {
        return;
      }
      deps.emit({
        type: "source-snapshot-received",
        payload: snapshot,
      });
      return;
    }

    if (type !== "media-state") {
      pendingMediaStatePairKey = null;
    }

    if (type === "host-context") {
      deps.emit({
        type: "context-received",
        payload: resolvedPayload,
      });
      return;
    }

    if (type === "media-state") {
      const snapshot = getSnapshotPayload(resolvedPayload);
      pendingMediaStatePairKey = getSnapshotPairKey(resolvedPayload, snapshot);
      deps.emit({
        type: "snapshot-received",
        payload: snapshot,
      });
      return;
    }

    if (type === "lab-event") {
      deps.emit({
        type: "host-event-received",
        event: resolvedPayload as unknown as LabEventFeedItem,
      });
      return;
    }
  }

  return {
    handleHostMessage,
  };
}

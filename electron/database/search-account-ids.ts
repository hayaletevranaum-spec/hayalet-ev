import { buildRemoteEmailAccountId } from "@shared/archive.js";

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function toAccountIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      const record = toRecord(item);
      if (record === null) {
        return "";
      }
      const id = record["id"];
      return typeof id === "string" ? id.trim() : "";
    })
    .filter((id) => id !== "");
}

function resolveSelectedUs1ProjectedAccountId(record: Record<string, unknown>): string | null {
  const us1Slot = toRecord(record["us1Slot"]);
  const selectedAccountIdRaw = us1Slot?.["selectedAccountId"];
  const selectedAccountId =
    typeof selectedAccountIdRaw === "string" ? selectedAccountIdRaw.trim() : "";
  if (selectedAccountId !== "") {
    return selectedAccountId;
  }

  const selectedRemoteUserIdRaw =
    us1Slot?.["selectedRemoteUserId"] ?? us1Slot?.["selectedIdentityId"];
  const selectedRemoteUserId =
    typeof selectedRemoteUserIdRaw === "string" ? selectedRemoteUserIdRaw.trim() : "";

  if (selectedRemoteUserId === "") {
    return null;
  }

  const remoteUsers = Array.isArray(record["remoteUsers"]) ? record["remoteUsers"] : [];
  const hasActiveIdentity = remoteUsers.some((item) => {
    const remoteUser = toRecord(item);
    if (remoteUser === null) {
      return false;
    }

    const identityIdRaw = remoteUser["remoteUserId"] ?? remoteUser["id"];
    const identityId = typeof identityIdRaw === "string" ? identityIdRaw.trim() : "";
    const handshakeState = remoteUser["handshakeState"];
    return identityId === selectedRemoteUserId && handshakeState === "active";
  });

  if (!hasActiveIdentity) {
    return null;
  }

  const accountId = buildRemoteEmailAccountId(selectedRemoteUserId);
  return accountId !== "" ? accountId : null;
}

export function collectSearchAccountIds(settings: unknown): string[] {
  const record = toRecord(settings);
  if (record === null) {
    return [];
  }

  const ids = new Set<string>();

  toAccountIds(record["accounts"]).forEach((id) => {
    ids.add(id);
  });

  const slots = toRecord(record["slots"]);
  if (slots !== null) {
    ["ai1", "ai2"].forEach((slot) => {
      const slotState = toRecord(slots[slot]);
      const accountId = slotState?.["accountId"];
      if (typeof accountId === "string" && accountId !== "") {
        ids.add(accountId);
      }
    });
  }

  const us1ProjectedAccountId = resolveSelectedUs1ProjectedAccountId(record);
  if (us1ProjectedAccountId !== null) {
    ids.add(us1ProjectedAccountId);
  }

  return Array.from(ids);
}

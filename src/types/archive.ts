export const ARCHIVE_PROVIDER_KEYS = ["ai1", "ai2", "us1"] as const;

export type ArchiveProviderKey = (typeof ARCHIVE_PROVIDER_KEYS)[number];

export function isArchiveProviderKey(value: unknown): value is ArchiveProviderKey {
  return typeof value === "string" && (ARCHIVE_PROVIDER_KEYS as readonly string[]).includes(value);
}

export const US1_PROJECTED_ACCOUNT_PREFIX = "us1_projected_";
export const REMOTE_EMAIL_ACCOUNT_PREFIX = "remote_email_";
const US1_SYNTHETIC_URI_PREFIX = "mail://remote-user/";

function encodeUs1Token(value: string): string {
  return encodeURIComponent(value.trim());
}

function decodeUs1Token(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function buildUs1ProjectedAccountId(remoteUserId: string): string {
  const normalizedRemoteUserId = encodeUs1Token(remoteUserId);
  if (normalizedRemoteUserId === "") {
    return "";
  }

  return `${US1_PROJECTED_ACCOUNT_PREFIX}${normalizedRemoteUserId}`;
}

export function buildRemoteEmailAccountId(email: string): string {
  const normalizedEmail = encodeUs1Token(email.toLowerCase());
  if (normalizedEmail === "") {
    return "";
  }

  return `${REMOTE_EMAIL_ACCOUNT_PREFIX}${normalizedEmail}`;
}

export function isUs1ProjectedAccountId(
  accountId: unknown
): accountId is `${typeof US1_PROJECTED_ACCOUNT_PREFIX}${string}` {
  return typeof accountId === "string" && accountId.startsWith(US1_PROJECTED_ACCOUNT_PREFIX);
}

export function isRemoteEmailAccountId(
  accountId: unknown
): accountId is `${typeof REMOTE_EMAIL_ACCOUNT_PREFIX}${string}` {
  return typeof accountId === "string" && accountId.startsWith(REMOTE_EMAIL_ACCOUNT_PREFIX);
}

export function extractUs1RemoteUserIdFromAccountId(accountId: string): string | null {
  if (!isUs1ProjectedAccountId(accountId)) {
    return null;
  }

  const encodedRemoteUserId = accountId.slice(US1_PROJECTED_ACCOUNT_PREFIX.length);
  if (encodedRemoteUserId === "") {
    return null;
  }

  return decodeUs1Token(encodedRemoteUserId);
}

export function extractRemoteEmailFromAccountId(accountId: string): string | null {
  if (!isRemoteEmailAccountId(accountId)) {
    return null;
  }

  const encodedEmail = accountId.slice(REMOTE_EMAIL_ACCOUNT_PREFIX.length);
  if (encodedEmail === "") {
    return null;
  }

  return decodeUs1Token(encodedEmail).toLowerCase();
}

export function extractUs1RemoteIdentityIdFromAccountId(accountId: string): string | null {
  return (
    extractRemoteEmailFromAccountId(accountId) ?? extractUs1RemoteUserIdFromAccountId(accountId)
  );
}

export function buildLegacyUs1ProjectedAccountIdFromRemoteAccountId(
  accountId: string
): string | null {
  const remoteIdentityId = extractRemoteEmailFromAccountId(accountId);
  if (remoteIdentityId === null) {
    return null;
  }

  return buildUs1ProjectedAccountId(remoteIdentityId);
}

export function buildUs1SyntheticSessionUri(remoteUserId: string, localSessionId: string): string {
  const normalizedRemoteUserId = encodeUs1Token(remoteUserId);
  const normalizedLocalSessionId = encodeUs1Token(localSessionId);

  if (normalizedRemoteUserId === "" || normalizedLocalSessionId === "") {
    return "";
  }

  return `${US1_SYNTHETIC_URI_PREFIX}${normalizedRemoteUserId}/session/${normalizedLocalSessionId}`;
}

export function isUs1SyntheticSessionUri(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(US1_SYNTHETIC_URI_PREFIX);
}

export function parseUs1SyntheticSessionUri(
  value: unknown
): { remoteUserId: string; localSessionId: string } | null {
  if (!isUs1SyntheticSessionUri(value)) {
    return null;
  }

  const raw = value.slice(US1_SYNTHETIC_URI_PREFIX.length);
  const sessionMarker = "/session/";
  const markerIndex = raw.indexOf(sessionMarker);
  if (markerIndex <= 0) {
    return null;
  }

  const encodedRemoteUserId = raw.slice(0, markerIndex);
  const encodedLocalSessionId = raw.slice(markerIndex + sessionMarker.length);
  if (encodedRemoteUserId === "" || encodedLocalSessionId === "") {
    return null;
  }

  return {
    remoteUserId: decodeUs1Token(encodedRemoteUserId),
    localSessionId: decodeUs1Token(encodedLocalSessionId),
  };
}

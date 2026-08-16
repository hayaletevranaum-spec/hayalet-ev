import type {
  AppSettings,
  MailTransportAccountConfig,
  MailTransportServerConfig,
  MailTransportSettings,
} from "@shared/settings.js";

export interface ResolvedMailTransportAccountConfig extends MailTransportAccountConfig {
  enabled: boolean;
  defaultMailbox: string;
  fetchBatchSize: number;
  binding: {
    remoteUserId: string | null;
    defaultLocalSessionId: string | null;
  };
}

export interface ResolvedMailTransportSettings extends MailTransportSettings {
  retryBaseMs: number;
  maxRetries: number;
  accounts: ResolvedMailTransportAccountConfig[];
}

const DEFAULT_RETRY_BASE_MS = 1500;
const DEFAULT_MAX_RETRIES = 2;

function toPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0) {
    return value;
  }
  return fallback;
}

function normalizeSecure(value: boolean | undefined, port: number, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (port === 465 || port === 993) {
    return true;
  }
  return fallback;
}

function getProviderDefaults(providerType: MailTransportAccountConfig["providerType"]): {
  imap: MailTransportServerConfig;
  smtp: MailTransportServerConfig;
} {
  if (providerType === "gmail") {
    return {
      imap: { host: "imap.gmail.com", port: 993, secure: true },
      smtp: { host: "smtp.gmail.com", port: 465, secure: true },
    };
  }

  return {
    imap: { host: "", port: 993, secure: true },
    smtp: { host: "", port: 465, secure: true },
  };
}

function resolveServerConfig(
  config: MailTransportServerConfig,
  fallback: MailTransportServerConfig
): MailTransportServerConfig {
  const hasCustomHost = typeof config.host === "string" && config.host.trim() !== "";
  const hasCustomPort =
    typeof config.port === "number" &&
    Number.isFinite(config.port) &&
    Number.isInteger(config.port) &&
    config.port > 0;
  const port = toPositiveInteger(config.port, fallback.port);
  const host =
    typeof config.host === "string" && config.host.trim() !== ""
      ? config.host.trim()
      : fallback.host;
  return {
    host,
    port,
    secure: normalizeSecure(
      hasCustomHost || hasCustomPort ? config.secure : undefined,
      port,
      fallback.secure
    ),
  };
}

export function applyMailTransportAccountDefaults(
  account: MailTransportAccountConfig
): ResolvedMailTransportAccountConfig {
  const providerDefaults = getProviderDefaults(account.providerType);
  const binding = account.binding ?? {};
  const auth = account.auth;

  return {
    ...account,
    enabled: account.enabled !== false,
    imap: resolveServerConfig(account.imap, providerDefaults.imap),
    smtp: resolveServerConfig(account.smtp, providerDefaults.smtp),
    auth: {
      ...auth,
      user:
        typeof auth.user === "string" && auth.user.trim() !== "" ? auth.user.trim() : account.email,
      password: typeof auth.password === "string" ? auth.password : "",
      accessToken: typeof auth.accessToken === "string" ? auth.accessToken : "",
      refreshToken: typeof auth.refreshToken === "string" ? auth.refreshToken : "",
      clientId: typeof auth.clientId === "string" ? auth.clientId : "",
      clientSecret: typeof auth.clientSecret === "string" ? auth.clientSecret : "",
      expiresAt:
        typeof auth.expiresAt === "number" && Number.isFinite(auth.expiresAt) ? auth.expiresAt : 0,
      loginMethod: typeof auth.loginMethod === "string" ? auth.loginMethod : "",
    },
    defaultMailbox:
      typeof account.defaultMailbox === "string" && account.defaultMailbox.trim() !== ""
        ? account.defaultMailbox.trim()
        : "INBOX",
    fetchBatchSize: toPositiveInteger(account.fetchBatchSize, 20),
    binding: {
      remoteUserId:
        typeof binding.remoteUserId === "string" && binding.remoteUserId.trim() !== ""
          ? binding.remoteUserId.trim()
          : null,
      defaultLocalSessionId:
        typeof binding.defaultLocalSessionId === "string" &&
        binding.defaultLocalSessionId.trim() !== ""
          ? binding.defaultLocalSessionId.trim()
          : null,
    },
  };
}

export function resolveMailTransportSettings(
  settings: Pick<AppSettings, "integrations"> | AppSettings | null | undefined
): ResolvedMailTransportSettings {
  const configured = settings?.integrations?.mailTransport;
  const accounts = Array.isArray(configured?.accounts)
    ? configured.accounts.map((account) => applyMailTransportAccountDefaults(account))
    : [];

  return {
    accounts,
    retryBaseMs: toPositiveInteger(configured?.retryBaseMs, DEFAULT_RETRY_BASE_MS),
    maxRetries: toPositiveInteger(configured?.maxRetries, DEFAULT_MAX_RETRIES),
  };
}

export function resolveMailTransportAccount(
  settings: Pick<AppSettings, "integrations"> | AppSettings | null | undefined,
  accountId: string
): ResolvedMailTransportAccountConfig {
  const resolved = resolveMailTransportSettings(settings);
  const normalizedAccountId = accountId.trim();
  const account = resolved.accounts.find((entry) => entry.id === normalizedAccountId);
  if (account === undefined) {
    throw new Error(`Mail transport account not found: ${normalizedAccountId}`);
  }
  return account;
}

import type { AppSettings } from "@shared/settings.js";

interface AssistantOpencodeAccount {
  id?: string;
  provider?: string;
  dbPath?: string | null;
}

export function normalizeOpencodePort(raw: unknown): number {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1024 && raw <= 65535) {
    return raw;
  }
  return 4096;
}

export function getOpencodePreferences(settings: AppSettings | null): {
  defaultPort: number;
} {
  const defaultPort = normalizeOpencodePort(settings?.assistants?.opencode?.defaultPort);
  return { defaultPort };
}

export function resolveOpencodeUiDbPath(settings: AppSettings | null): string {
  const accounts = settings?.assistantAccounts as AssistantOpencodeAccount[] | undefined;
  const assignedAccountId = settings?.assistantSlot?.accountId;

  const assignedAccount =
    typeof assignedAccountId === "string" && assignedAccountId !== ""
      ? accounts?.find((account) => account.id === assignedAccountId)
      : undefined;

  if (
    assignedAccount?.provider === "opencode-ui" &&
    typeof assignedAccount.dbPath === "string" &&
    assignedAccount.dbPath.trim() !== ""
  ) {
    return assignedAccount.dbPath.trim();
  }

  const providerAccount = accounts?.find((account) => account.provider === "opencode-ui");
  if (
    providerAccount?.dbPath !== undefined &&
    providerAccount.dbPath !== null &&
    typeof providerAccount.dbPath === "string"
  ) {
    return providerAccount.dbPath.trim();
  }

  return "";
}

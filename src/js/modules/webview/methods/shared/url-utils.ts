import { ProviderRegistry } from "../../provider-registry.js";
import { isAiProviderAccount } from "@shared/settings.js";
import type { AppSettings } from "@shared/settings.js";
import { SettingsManager } from "../../../settings-manager.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized !== "" ? normalized : null;
}

function resolveProviderIdForSlot(providerSlot: string): string | null {
  const settings = SettingsManager.getSnapshot() as AppSettings | null;
  if (settings === null) {
    return null;
  }

  if (providerSlot === "us1") {
    return "us1";
  }

  if (providerSlot === "ai0") {
    const accountId = readTrimmedString(settings.assistantSlot?.accountId);
    if (accountId === null || Array.isArray(settings.assistantAccounts) === false) {
      return null;
    }

    const account =
      settings.assistantAccounts.find((candidate) => candidate.id === accountId) ?? null;
    return typeof account?.provider === "string" ? account.provider : null;
  }

  if (providerSlot !== "ai1" && providerSlot !== "ai2") {
    return null;
  }

  const accountId = readTrimmedString(settings.slots[providerSlot].accountId);
  if (accountId === null) {
    return null;
  }

  const account = settings.accounts.find((candidate) => candidate.id === accountId) ?? null;
  return account !== null && isAiProviderAccount(account) ? account.provider : null;
}

export function normalizeUrl(url: string): string {
  if (url === "") return "";
  const parts = url.split("?");
  const beforeQuery = parts[0];
  if (beforeQuery === undefined || beforeQuery === "") return "";
  const hashParts = beforeQuery.split("#");
  const beforeHash = hashParts[0];
  if (beforeHash === undefined || beforeHash === "") return "";
  return beforeHash.replace(/\/+$/, "");
}

export function isDefaultPage(url: string, providerId: string): boolean {
  if (url === "" || providerId === "") return false;

  const config = ProviderRegistry.get(providerId);
  if (!isRecord(config)) return false;
  const baseUrl = typeof config["baseUrl"] === "string" ? config["baseUrl"] : "";
  if (baseUrl === "") return false;

  const normalizedUrl = normalizeUrl(url);
  const normalizedBase = normalizeUrl(baseUrl);

  if (normalizedUrl === normalizedBase) return true;

  const configWithPaths = config as { defaultPaths?: string[]; baseUrl: string };
  if (configWithPaths.defaultPaths) {
    for (const path of configWithPaths.defaultPaths) {
      const fullPath = normalizeUrl(`${String(config["baseUrl"])}${path}`);
      if (normalizedUrl === fullPath) return true;
    }
  }

  return false;
}

export function isUrlExcluded(url: string, excludedUrls: string[]): boolean {
  if (url === "" || excludedUrls.length === 0) return false;

  const normalizedUrl = normalizeUrl(url);

  for (const excluded of excludedUrls) {
    const normalizedExcluded = normalizeUrl(excluded);

    if (excluded.includes("*")) {
      const pattern = normalizedExcluded.replace(/\*/g, ".*");
      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(normalizedUrl)) return true;
    } else {
      if (normalizedUrl === normalizedExcluded) return true;
    }
  }

  return false;
}

export function isSlotUrlExcluded(providerSlot: string, url: string): boolean {
  if (providerSlot === "" || url === "") return false;

  const providerId = resolveProviderIdForSlot(providerSlot);
  if (providerId === null || providerId === "") return false;

  const cfg = ProviderRegistry.get(providerId);
  if (!isRecord(cfg)) return false;
  const excludedUrls = cfg["excludedUrls"];
  if (!Array.isArray(excludedUrls) || excludedUrls.length === 0) return false;

  return isUrlExcluded(url, excludedUrls as string[]);
}

type ProviderScenarioLockEntry = {
  runId?: string;
  scenarioId?: string;
  updatedAt?: number;
};

type ProviderScenarioLockMap = Record<string, ProviderScenarioLockEntry>;

function readProviderScenarioLocks(): ProviderScenarioLockMap | null {
  const locks = window.__providerScenarioLocks as unknown;
  if (typeof locks !== "object" || locks === null) {
    return null;
  }

  return locks as ProviderScenarioLockMap;
}

export function isProviderScenarioActive(slot: string): boolean {
  if (slot.trim() === "") {
    return false;
  }

  const locks = readProviderScenarioLocks();
  const entry = locks?.[slot];
  return entry !== undefined;
}

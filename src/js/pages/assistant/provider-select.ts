import type { AppSettings } from "@shared/settings.js";

interface ProviderOption {
  id: string;
  name: string;
}

interface PopulateProviderSelectOptions {
  providerSelect: HTMLSelectElement | null;
  providers: unknown[];
  settings: AppSettings | null;
  isProviderOption: (value: unknown) => value is ProviderOption;
}

export function populateAssistantProviderSelect({
  providerSelect,
  providers,
  settings,
  isProviderOption,
}: PopulateProviderSelectOptions): void {
  if (providerSelect == null) {
    return;
  }

  providerSelect.innerHTML = "";

  providers.forEach((provider) => {
    if (!isProviderOption(provider)) {
      return;
    }

    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.name;
    providerSelect.appendChild(option);
  });

  const assistantAccounts = settings?.assistantAccounts as
    { id: string; provider?: string }[] | undefined;
  const preferredProviderId = settings?.assistants?.preferred;
  if (
    typeof preferredProviderId === "string" &&
    providerSelect.querySelector(`option[value="${preferredProviderId}"]`) !== null
  ) {
    providerSelect.value = preferredProviderId;
    return;
  }
  const assistantSlot = settings?.assistantSlot as { accountId?: string } | undefined;
  const account = assistantAccounts?.find((entry) => entry.id === assistantSlot?.accountId);
  if (
    account?.provider !== undefined &&
    account.provider !== "" &&
    providerSelect.querySelector(`option[value="${account.provider}"]`) !== null
  ) {
    providerSelect.value = account.provider;
  }
}

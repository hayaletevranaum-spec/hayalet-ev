interface BindAssistantBasicEventsOptions {
  connectBtn: HTMLButtonElement | null;
  resumeLastSessionCheckbox: HTMLInputElement | null;
  keepServersOnAppCloseCheckbox: HTMLInputElement | null;
  catchCommandsCheckbox: HTMLInputElement | null;
  providerSelect: HTMLSelectElement | null;
  opencodeSettingsBtn: HTMLButtonElement | null;
  opencodeActionBtn: HTMLButtonElement | null;
  memoryBtn: HTMLButtonElement | null;
  devtoolsBtn: HTMLButtonElement | null;
  testBtn: HTMLButtonElement | null;
  onConnectClick: () => void;
  onResumeLastSessionChange: (enabled: boolean) => void;
  onKeepServersOnCloseChange: (enabled: boolean) => void;
  onCatchCommandsChange: (enabled: boolean) => void;
  onProviderChange: () => void;
  onOpencodeSettingsClick: () => void;
  onOpencodeActionClick: () => void;
  onMemoryClick: () => void;
  onDevtoolsClick: () => void;
  onTestClick: () => void;
}

export function bindAssistantBasicEvents(options: BindAssistantBasicEventsOptions): void {
  options.connectBtn?.addEventListener("click", options.onConnectClick);
  options.resumeLastSessionCheckbox?.addEventListener("change", () => {
    options.onResumeLastSessionChange(options.resumeLastSessionCheckbox?.checked === true);
  });
  options.keepServersOnAppCloseCheckbox?.addEventListener("change", () => {
    options.onKeepServersOnCloseChange(options.keepServersOnAppCloseCheckbox?.checked === true);
  });
  options.catchCommandsCheckbox?.addEventListener("change", () => {
    options.onCatchCommandsChange(options.catchCommandsCheckbox?.checked === true);
  });
  options.providerSelect?.addEventListener("change", options.onProviderChange);
  options.opencodeSettingsBtn?.addEventListener("click", options.onOpencodeSettingsClick);
  options.opencodeActionBtn?.addEventListener("click", options.onOpencodeActionClick);
  options.memoryBtn?.addEventListener("click", options.onMemoryClick);
  options.devtoolsBtn?.addEventListener("click", options.onDevtoolsClick);
  options.testBtn?.addEventListener("click", options.onTestClick);
}

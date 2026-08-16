import { WEBVIEW_TEST_SCENARIO } from "../shared/scenarios.ts";

export const OPENCODE_UI_DEFAULTS = {
  port: 4096,
  hostname: "127.0.0.1",
  cors: "http://localhost:5174",
  command: "opencode",
  portRange: { start: 4096, end: 4110 },
};

export const config = {
  id: "opencode-ui",
  name: "OpenCode UI",

  baseUrl: `http://${OPENCODE_UI_DEFAULTS.hostname}:${OPENCODE_UI_DEFAULTS.port}`,

  port: OPENCODE_UI_DEFAULTS.port,
  hostname: OPENCODE_UI_DEFAULTS.hostname,
  cors: OPENCODE_UI_DEFAULTS.cors,
  command: OPENCODE_UI_DEFAULTS.command,
  portRange: OPENCODE_UI_DEFAULTS.portRange,

  loginUrl: null,
  lastVerified: "2026-03-05",

  isAssistant: true,

  getServerUrl(port = OPENCODE_UI_DEFAULTS.port): string {
    return `http://${OPENCODE_UI_DEFAULTS.hostname}:${port}`;
  },

  getWorkspaceUrl(_workspace: string, port = OPENCODE_UI_DEFAULTS.port): string {
    return `http://${OPENCODE_UI_DEFAULTS.hostname}:${port}`;
  },

  getServerCommand(
    port = OPENCODE_UI_DEFAULTS.port,
    cors = OPENCODE_UI_DEFAULTS.cors,
    workspace?: string
  ): { command: string; args: string[] } {
    const args = [
      "serve",
      "--port",
      String(port),
      "--hostname",
      OPENCODE_UI_DEFAULTS.hostname,
      "--cors",
      cors,
    ];

    if (workspace !== undefined && workspace !== "") {
      args.push(workspace);
    }

    return {
      command: OPENCODE_UI_DEFAULTS.command,
      args,
    };
  },

  selectors: {
    sendButtonBase: "#send-btn",
    sendButton: '#send-btn:not([data-mode="stop"]):not([disabled])',
    sendButtonDisabled: '#send-btn:not([data-mode="stop"])[disabled]',
    stopButton: '#send-btn[data-mode="stop"]',
    inputField: "#chat-input",
    messageContainer: "#chat-messages",
    userMessage: ".ds-message--user .ds-message__bubble",
    assistantMessage: ".ds-message--assistant .ds-message__bubble",
    assistantMessageAlt: ".ds-message--assistant .ds-message__bubble",
    voiceButton: "#chat-dictation-btn",
    microphoneButton: "#chat-dictation-btn",
    filePreview: [".ds-file-chips"],
  },
  selectorMatrix: {
    selectors: {
      sendButton: {
        tr: '#send-btn:not([data-mode="stop"]):not([disabled])',
        en: '#send-btn:not([data-mode="stop"]):not([disabled])',
        fallbacks: ["#send-btn"],
      },
    },
  },

  inputType: "direct",

  scrollerSelectors: ["#chat-messages", ".ds-chat__messages"],

  scrapeSelectors: {
    preferred: ".ds-message",
    fallback: ".ds-message__bubble",
    userMessage: ".ds-message--user .ds-message__bubble",
    assistantMessage: ".ds-message--assistant .ds-message__bubble",
  },

  fileInputSelectors: ["#attach-file-btn"],

  uploadTargetSelectors: ["#chat-input", ".ds-chat__input-row"],

  criticalSelectors: ["#chat-input", "#send-btn", "#session-list"],

  contentContainers: ["div", "section", "article"],

  filters: {
    selectors: [] as string[],
    hosts: [] as string[],
    blockResourceTypes: [] as string[],
    dragOverlaySelectors: [] as string[],
    dragTextMatchers: [] as string[],
  },

  excludedUrls: [] as string[],

  telemetry: {
    endpoints: [] as string[],
    tokenPaths: [] as string[],
  },
  uiLanguage: {
    signals: {
      localStorageKeys: ["app-language", "opencode-ui-language"],
    },
  },
  scenarios: {
    webviewTest: WEBVIEW_TEST_SCENARIO,
  },
};

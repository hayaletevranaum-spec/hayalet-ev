import { WEBVIEW_TEST_SCENARIO } from "../shared/scenarios.ts";

export const OPENCODE_DEFAULTS = {
  port: 4096,
  hostname: "127.0.0.1",
  cors: "http://localhost:5174",
  command: "opencode",
  portRange: { start: 4096, end: 4110 },
};

function encodeWorkspaceSegment(workspace: string): string {
  const normalizedWorkspace = workspace.trim();
  if (normalizedWorkspace === "") {
    return "";
  }

  const bytes = new TextEncoder().encode(normalizedWorkspace);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

export const config = {
  id: "opencode",
  name: "OpenCode",

  baseUrl: `http://${OPENCODE_DEFAULTS.hostname}:${OPENCODE_DEFAULTS.port}`,

  port: OPENCODE_DEFAULTS.port,
  hostname: OPENCODE_DEFAULTS.hostname,
  cors: OPENCODE_DEFAULTS.cors,
  command: OPENCODE_DEFAULTS.command,
  portRange: OPENCODE_DEFAULTS.portRange,

  loginUrl: null,
  lastVerified: "2026-02-07",

  isAssistant: true,

  getServerUrl(port = OPENCODE_DEFAULTS.port): string {
    return `http://${OPENCODE_DEFAULTS.hostname}:${port}`;
  },

  getWorkspaceUrl(workspace: string, port = OPENCODE_DEFAULTS.port): string {
    const encodedWorkspace = encodeWorkspaceSegment(workspace);
    const serverUrl = config.getServerUrl(port);
    return encodedWorkspace === "" ? serverUrl : `${serverUrl}/${encodedWorkspace}`;
  },

  getServerCommand(
    port = OPENCODE_DEFAULTS.port,
    cors = OPENCODE_DEFAULTS.cors,
    workspace?: string
  ): { command: string; args: string[] } {
    const args = [
      "serve",
      "--port",
      String(port),
      "--hostname",
      OPENCODE_DEFAULTS.hostname,
      "--cors",
      cors,
    ];

    if (workspace !== undefined && workspace !== "") {
      args.push(workspace);
    }

    return {
      command: OPENCODE_DEFAULTS.command,
      args,
    };
  },

  selectors: {
    sendButtonBase: 'button[type="submit"][icon="arrow-up"][data-component="icon-button"]',

    sendButton:
      'button[type="submit"][icon="arrow-up"][data-component="icon-button"]:not([disabled])',

    sendButtonDisabled:
      'button[type="submit"][icon="arrow-up"][data-component="icon-button"][disabled]',

    stopButton: 'button[type="submit"][icon="stop"][data-component="icon-button"]',

    inputField: '[data-component="prompt-input"][contenteditable="true"]',

    messageContainer: '[data-slot="session-turn-message-content"]',

    userMessage: '[data-slot="user-message-text"]',

    assistantMessage: '[data-slot="session-turn-assistant-content"] [data-component="markdown"]',

    assistantMessageAlt: '[data-slot="text-part-body"] [data-component="markdown"]',

    voiceButton: "",

    filePreview: ['[data-type="file"]', '[data-component="file-attachment"]'],
  },
  selectorMatrix: {
    selectors: {
      sendButton: {
        tr: 'button[type="submit"][icon="arrow-up"][data-component="icon-button"]:not([disabled])',
        en: 'button[type="submit"][icon="arrow-up"][data-component="icon-button"]:not([disabled])',
        fallbacks: [],
      },
    },
  },

  inputType: "contenteditable",

  scrollerSelectors: [
    '[data-component="session-view"]',
    '[data-slot="session-content"]',
    ".overflow-y-auto",
    "main .overflow-auto",
  ],

  scrapeSelectors: {
    userMessage: '[data-slot="user-message-text"]',
    userWrapper: '[data-slot="user-message-text"]',
    assistantMessage: '[data-slot="session-turn-assistant-content"] [data-component="markdown"]',
    // NOTE: Keep wrapper/preferred/fallback selectors aligned for test compatibility.
    assistantWrapper: '[data-slot="session-turn-assistant-content"] [data-component="markdown"]',
    preferred: '[data-slot="session-turn-assistant-content"] [data-component="markdown"]',
    fallback:
      '[data-slot="text-part-body"] [data-component="markdown"], [data-slot="session-turn-markdown"], [data-slot="session-turn-summary-section"] [data-component="markdown"], [data-component="user-message"], [data-component="markdown"]',
  },

  fileInputSelectors: ['input[type="file"]'],

  uploadTargetSelectors: [
    '[data-component="prompt-input"]',
    '[data-slot="prompt-input-container"]',
  ],

  criticalSelectors: [
    '[data-component="prompt-input"]',
    'button[type="submit"][data-component="icon-button"]',
  ],

  contentContainers: ["div", "section", "article"],

  filters: {
    selectors: [] as string[],
    hosts: [] as string[],
    blockResourceTypes: [] as string[],
    dragOverlaySelectors: ["[data-dnd-overlay]", ".drag-overlay"],
    dragTextMatchers: ["drop", "dosya", "file"],
  },

  excludedUrls: [] as string[],

  telemetry: {
    endpoints: [] as string[],
    tokenPaths: [] as string[],
  },
  uiLanguage: {
    signals: {
      localStorageKeys: ["app-language", "opencode-language"],
    },
  },
  scenarios: {
    webviewTest: WEBVIEW_TEST_SCENARIO,
  },
};

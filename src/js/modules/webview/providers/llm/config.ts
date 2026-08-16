import { WEBVIEW_SYNC_SCENARIO, WEBVIEW_TEST_SCENARIO } from "../shared/scenarios.ts";

export const config = {
  id: "llm",
  name: "LLM",
  baseUrl: "http://127.0.0.1:9876",
  loginUrl: null,
  lastVerified: "2026-05-25",
  syncOnDefaultPage: true,
  preserveSyncUrlQuery: true,
  selectors: {
    sendButton: "#send-button",
    sendButtonDisabled: "#send-button:disabled",
    stopButton: "#stop-button",
    inputField: "#input-field",
    messageContainer: "#messages-container",
    generatedImage: "",
    filePreview: [],
  },
  selectorMatrix: {
    selectors: {
      sendButton: {
        tr: "#send-button",
        en: "#send-button",
        fallbacks: [],
      },
      inputField: {
        tr: "#input-field",
        en: "#input-field",
        fallbacks: [],
      },
    },
  },
  inputType: "direct",
  scrollerSelectors: ["#messages-container"],
  scrapeSelectors: {
    preferred: "[data-message-author-role]",
    fallback: ".message",
    messageWrapper: ".message",
    userWrapper: '[data-message-author-role="user"]',
    assistantWrapper: '[data-message-author-role="assistant"]',
  },
  messageIdStrategy: "content-hash",
  fileInputSelectors: ['input[type="file"]'],
  uploadTargetSelectors: ["#input-field"],
  criticalSelectors: [
    "#send-button",
    "#input-field",
    "#messages-container",
    "[data-message-author-role]",
  ],
  contentContainers: ["div"],
  filters: {
    selectors: [] as string[],
    hosts: [] as string[],
    blockResourceTypes: [] as string[],
    dragTextMatchers: [],
  },
  telemetry: {
    endpoints: [] as string[],
    tokenPaths: [] as string[],
  },
  excludedUrls: [] as string[],
  scenarios: {
    webviewTest: WEBVIEW_TEST_SCENARIO,
    webviewSync: WEBVIEW_SYNC_SCENARIO,
  },
  webviewSync: {
    readiness: "estimated" as const,
    sidebar: {
      openButtonSelectors: [] as string[],
      closeButtonSelectors: [] as string[],
    },
    history: {
      containerSelectors: [] as string[],
      itemSelectors: [] as string[],
      titleSelectors: [] as string[],
    },
  },
};

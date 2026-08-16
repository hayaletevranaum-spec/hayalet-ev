import { WEBVIEW_SYNC_SCENARIO, WEBVIEW_TEST_SCENARIO } from "../shared/scenarios.ts";

export const config = {
  id: "gemini",
  name: "Gemini",
  baseUrl: "https://gemini.google.com",
  defaultPaths: ["/app"],
  loginUrl: "https://gemini.google.com/",
  lastVerified: "2026-01-11",
  selectors: {
    sendButton: "button.send-button",
    stopButton: ".blue-circle.stop-icon",
    inputField: ".ql-editor.textarea",
    messageContainer: ".response-container-content",
    generatedImage:
      '.response-container-content img[alt*="generated image" i], .response-container-content figure img, message-content img[src^="https://lh3.googleusercontent.com/"]',
    attachButton: 'button[data-test-id="local-images-files-uploader-button"]',
  },
  selectorMatrix: {
    selectors: {
      sendButton: {
        tr: "button.send-button",
        en: "button.send-button",
        fallbacks: [],
      },
    },
  },
  inputType: "character-by-character",
  scrollerSelectors: [".chat-history"],
  scrapeSelectors: {
    preferred: ".message-content",
    fallback: ".user-query-bubble-with-background, .markdown-main-panel",
    messageId: '[id^="message-content-id-"]',
  },
  messageIdStrategy: "dom-id",
  roleSelectors: {
    user: ".user-query-bubble-with-background",
    assistant: ".markdown-main-panel",
    text: ".query-text",
  },
  fileInputSelectors: [
    'button[data-test-id="local-images-files-uploader-button"] input[type="file"]',
    'input[type="file"][multiple]',
    'input[type="file"]',
    'input[type="file"][accept]',
  ],
  criticalSelectors: [
    ".ql-editor.textarea",
    ".message-content",
    ".user-query-bubble-with-background",
    ".markdown-main-panel",
  ],
  contentContainers: ["div", "message-content"],
  uploadTargetSelectors: [
    "div[xapfileselectordropzone]",
    "file-drop-indicator",
    ".text-input-field",
    ".ql-editor.textarea",
    'rich-textarea .ql-editor[contenteditable="true"]',
  ],
  excludedUrls: [] as string[],

  filters: {
    selectors: [] as string[],
    hosts: [] as string[],
    blockResourceTypes: [] as string[],
    dragTextMatchers: ["drop", "file"],
  },
  telemetry: {
    endpoints: [] as string[],
    tokenPaths: [] as string[],
  },
  scenarios: {
    webviewTest: WEBVIEW_TEST_SCENARIO,
    webviewSync: WEBVIEW_SYNC_SCENARIO,
  },
  webviewSync: {
    readiness: "estimated",
    sidebar: {
      openButtonSelectors: [
        'button[aria-label="Open navigation menu"]',
        'button[aria-label="Navigasyon menüsünü aç"]',
      ],
      closeButtonSelectors: [
        'button[aria-label="Close navigation menu"]',
        'button[aria-label="Navigasyon menüsünü kapat"]',
      ],
    },
    history: {
      containerSelectors: ['nav[role="navigation"]', "nav", 'div[role="navigation"]'],
      itemSelectors: ['a[href^="/app/"]', 'a[href*="/app/"]'],
      titleSelectors: ["span"],
    },
  },
};

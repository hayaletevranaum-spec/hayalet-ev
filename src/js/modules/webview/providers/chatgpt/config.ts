import { WEBVIEW_SYNC_SCENARIO, WEBVIEW_TEST_SCENARIO } from "../shared/scenarios.ts";

export const config = {
  id: "chatgpt",
  name: "ChatGPT",
  baseUrl: "https://chatgpt.com",
  loginUrl: "https://chatgpt.com/auth/login",
  lastVerified: "2026-03-29",
  selectors: {
    sendButton:
      '#composer-submit-button[data-testid="send-button"], button[data-testid="send-button"][aria-label="Send prompt"], button[data-testid="send-button"][aria-label="İstem gönder"], button[data-testid="send-button"], #composer-submit-button',

    sendButtonDisabled:
      '#composer-submit-button[data-testid="send-button"][disabled], button[data-testid="send-button"][aria-label="İstem gönder"][disabled], button[data-testid="send-button"][aria-label="Send prompt"][disabled], #composer-submit-button[disabled]',

    stopButton:
      '[data-testid="stop-button"], #composer-submit-button[data-testid="stop-button"], button[aria-label="Stop streaming"], button[aria-label="Yanıtlamayı durdur"]',

    voiceButton:
      'button.composer-btn[aria-label="Dikteyi başlatma"], button.composer-btn[aria-label="Start dictation"], button.composer-btn[aria-label="Dictate button"], button.composer-btn[aria-label="Dikte düğmesi"], button.composer-btn[aria-label*="Dikte"], button.composer-btn[aria-label*="dictat"]',

    dictateButton:
      'button.composer-btn[aria-label="Dikteyi başlatma"], button.composer-btn[aria-label="Start dictation"], button.composer-btn[aria-label="Dictate button"], button.composer-btn[aria-label="Dikte düğmesi"], button.composer-btn[aria-label*="Dikte"], button.composer-btn[aria-label*="dictat"]',

    attachButton:
      '#composer-plus-btn[data-testid="composer-plus-btn"], button#composer-plus-btn[aria-haspopup="menu"], button[data-testid="composer-plus-btn"][aria-label="Add files and more"], button[data-testid="composer-plus-btn"][aria-label="Dosyaları ve çok daha fazlasını ekle"]',

    attachMenuItem:
      'div[role="menuitem"].group.__menu-item[data-orientation="vertical"], div[role="menuitem"][data-radix-collection-item]',

    inputField:
      'div#prompt-textarea.ProseMirror[contenteditable="true"][role="textbox"], #prompt-textarea[contenteditable="true"], #prompt-textarea',

    messageContainer: "main",

    generatedImage:
      '.group\\/imagegen-image, [id^="image-"].group\\/imagegen-image, [id^="image-"][role="button"], [data-testid="image-gen-overlay-actions"], img[src*="/backend-api/estuary/content?id=file_"], img[alt^="Üretilen görsel:"], img[alt^="Generated image:"], img[alt*="generated image" i]',

    filePreview: [
      '[data-testid="attachment-preview"]',
      '[data-testid*="file"]',
      ".group\\/attachment",
      '[class*="attachment"]',
      'button[aria-label*="Remove"]',
      'button[aria-label*="Kaldır"]',
    ],
  },
  selectorMatrix: {
    selectors: {
      sendButton: {
        tr: '#composer-submit-button[data-testid="send-button"]',
        en: '#composer-submit-button[data-testid="send-button"], button[data-testid="send-button"][aria-label="Send prompt"]',
        fallbacks: [
          'button[data-testid="send-button"][aria-label="Send prompt"]',
          'button[data-testid="send-button"][aria-label="İstem gönder"]',
          'button[data-testid="send-button"]',
          "#composer-submit-button",
        ],
      },
      inputField: {
        tr: 'div#prompt-textarea.ProseMirror[contenteditable="true"][role="textbox"], #prompt-textarea[contenteditable="true"]',
        en: 'div#prompt-textarea.ProseMirror[contenteditable="true"][role="textbox"], #prompt-textarea[contenteditable="true"]',
        fallbacks: ["#prompt-textarea"],
      },
      attachButton: {
        tr: 'button#composer-plus-btn[aria-haspopup="menu"], button[data-testid="composer-plus-btn"][aria-label="Dosyaları ve çok daha fazlasını ekle"]',
        en: 'button#composer-plus-btn[aria-haspopup="menu"], button[data-testid="composer-plus-btn"][aria-label="Add files and more"]',
        fallbacks: ['#composer-plus-btn[data-testid="composer-plus-btn"]'],
      },
    },
  },

  inputType: "direct",
  scrollerSelectors: [
    'div[data-scroll-root="true"]',
    "div:has(> main#main)",
    'div.relative.flex.min-h-0.min-w-0.flex-1.flex-col[class*="overflow-y-auto"]',
    "main#main",
    "main.min-h-0",
    "div.flex.h-full.flex-col.overflow-y-auto",
    "main div.overflow-y-auto",
    "main section.overflow-y-auto",
    'div[role="main"] .overflow-y-auto',
  ],
  scrapeSelectors: {
    preferred: "[data-message-author-role]",
    fallback: ".message-bubble, .markdown.prose",
    messageWrapper:
      '[data-testid="conversation-turn"], [data-testid^="conversation-turn"], [data-testid*="conversation-turn"], [data-message-id], [data-turn-id], main article',
    userWrapper: '[data-message-author-role="user"], .user-message-bubble-color',
    assistantWrapper: '[data-message-author-role="assistant"], .agent-turn',
  },
  messageIdStrategy: "content-hash",
  fileInputSelectors: ['input[type="file"][multiple]', 'input[type="file"]'],
  uploadTargetSelectors: [
    '#composer-plus-btn[data-testid="composer-plus-btn"]',
    'div#prompt-textarea.ProseMirror[contenteditable="true"][role="textbox"]',
    '[data-testid="upload-drop-target"]',
    '#prompt-textarea[contenteditable="true"]',
    "#prompt-textarea",
    "form textarea",
  ],
  dragDropCriticalSelectors: [
    '#composer-submit-button[data-testid="send-button"]',
    '#composer-plus-btn[data-testid="composer-plus-btn"]',
    'div#prompt-textarea.ProseMirror[contenteditable="true"][role="textbox"]',
  ],
  criticalSelectors: [
    '#composer-submit-button[data-testid="send-button"]',
    '#composer-plus-btn[data-testid="composer-plus-btn"]',
    'div#prompt-textarea.ProseMirror[contenteditable="true"][role="textbox"]',
    '#prompt-textarea[contenteditable="true"]',
    '[data-testid="conversation-turn"]',
    "[data-message-author-role]",
  ],
  contentContainers: ["div", "section", "article"],
  filters: {
    selectors: ["div.block.lg\\:hidden div.inline-flex.items-center.gap-1.rounded-full"],
    hosts: [],
    blockResourceTypes: [],
    dragOverlaySelectors: [
      "[data-dnd-overlay]",
      '[data-testid*="drop"]',
      '[data-testid*="drag"]',
      ".drag-overlay",
      ".drag-drop-overlay",
      ".file-drop-target",
      ".dnd-active-overlay",
    ],
    dragTextMatchers: ["drop", "file"],
  },
  excludedUrls: [
    "https://auth.openai.com/email-verification",
    "https://auth.openai.com/log-in-or-create-account",
    "https://auth.openai.com/log-in/password",
    "https://chatgpt.com/auth/login",
    "https://chatgpt.com/images/*",
    "https://chatgpt.com/apps/*",
  ],

  telemetry: {
    endpoints: [],
    tokenPaths: [],
  },
  scenarios: {
    webviewTest: WEBVIEW_TEST_SCENARIO,
    webviewSync: WEBVIEW_SYNC_SCENARIO,
  },
  webviewSync: {
    readiness: "verified",
    sidebar: {
      openButtonSelectors: [
        'button[data-testid="open-sidebar-button"]',
        'button[aria-label="Open sidebar"]',
        'button[aria-label="Kenar çubuğunu aç"]',
      ],
      closeButtonSelectors: [
        'button[data-testid="close-sidebar-button"]',
        'button[aria-label="Close sidebar"]',
        'button[aria-label="Kenar çubuğunu kapat"]',
      ],
    },
    history: {
      containerSelectors: ["#history"],
      itemSelectors: ['#history a[data-sidebar-item="true"][href^="/c/"]'],
      titleSelectors: ['span[dir="auto"]'],
    },
  },
};

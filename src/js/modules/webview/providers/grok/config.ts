import { WEBVIEW_SYNC_SCENARIO, WEBVIEW_TEST_SCENARIO } from "../shared/scenarios.ts";

export const config = {
  id: "grok",
  name: "Grok",
  baseUrl: "https://grok.com",
  loginUrl: "https://grok.com/",
  lastVerified: "2026-01-11",
  selectors: {
    sendButton:
      'button[type="submit"][aria-label="Gönder"], button[type="submit"][aria-label="Submit"], button[type="submit"]',

    stopButton:
      'button[aria-label="Model yanıtını durdur"], button[aria-label="Stop model response"], button[aria-label*="Stop" i]',

    voiceButton:
      'button[aria-label="Dikteyi başlat (Ctrl+D)"], button[aria-label="Start dictation (Ctrl+D)"], button[aria-label="Ses moduna gir"], button[aria-label="Enter voice mode"], button[aria-label*="dictation" i], button[aria-label*="voice mode" i]',

    dictateButton:
      'button[aria-label="Dikteyi başlat (Ctrl+D)"], button[aria-label="Start dictation (Ctrl+D)"], button[aria-label*="dictation" i]',

    attachButton:
      'button.group/attach-button[aria-label="Ekle"], button.group/attach-button[aria-label="Attach"], button[aria-label="Ekle"][aria-haspopup="menu"], button[aria-label="Attach"][aria-haspopup="menu"], button.group/attach-button[aria-haspopup="menu"]',

    attachMenuItem: 'div[role="menuitem"][data-radix-collection-item][data-orientation="vertical"]',

    inputField:
      '[data-testid="dmComposerTextInput"] .ProseMirror[contenteditable="true"], .ProseMirror[contenteditable="true"], textarea[aria-label="Grok\'a her şeyi sor"], textarea[aria-label="Ask Grok anything"], textarea[aria-label*="Grok"]',

    messageContainer: "main",

    generatedImage:
      '[data-message-author-role="assistant"] img[alt*="generated" i], [data-message-author-role="assistant"] img[alt*="image" i], [data-message-author-role="assistant"] picture img, .response-content-markdown img',
  },
  selectorMatrix: {
    selectors: {
      sendButton: {
        tr: 'button[type="submit"][aria-label="Gönder"]',
        en: 'button[type="submit"][aria-label="Submit"]',
        fallbacks: ['button[type="submit"]'],
      },
    },
  },

  inputType: "character-by-character",
  scrollerSelectors: [
    "div.flex.h-full.flex-col.overflow-y-auto",
    "main div.overflow-y-auto",
    'div[role="main"] .overflow-y-auto',
  ],
  scrapeSelectors: {
    preferred: "[data-message-author-role]",
    fallback: ".message-bubble",
    userWrapper: ".message-bubble.bg-surface-l1, .message-bubble.border-border-l1",
    assistantWrapper: ".message-bubble.max-w-none, .response-content-markdown",
  },
  messageIdStrategy: "content-hash",
  fileInputSelectors: ['input[data-testid="dmComposerAttachFileInput"]', 'input[type="file"]'],
  criticalSelectors: [
    'button.group/attach-button[aria-label="Ekle"]',
    'button.group/attach-button[aria-label="Attach"]',
    '.ProseMirror[contenteditable="true"]',
    'p[data-placeholder="Ask Grok"]',
    'p[data-placeholder="Grok\'a Sor"]',
    'textarea[aria-label="Ask Grok anything"]',
    'textarea[aria-label="Grok\'a her şeyi sor"]',
    '[data-testid="dmComposerTextInput"]',
    "[data-message-author-role]",
  ],
  contentContainers: ["div", "section", "article"],
  uploadTargetSelectors: [
    'button.group/attach-button[aria-label="Ekle"]',
    'button.group/attach-button[aria-label="Attach"]',
    '[data-testid="dmComposerTextInput"] .ProseMirror[contenteditable="true"]',
    '.ProseMirror[contenteditable="true"]',
    '[data-testid="dmComposerTextInput"]',
    "form textarea",
    'textarea[aria-label="Ask Grok anything"]',
    'textarea[aria-label="Grok\'a her şeyi sor"]',
  ],
  excludedUrls: [
    "https://accounts.x.ai/sign-in?redirect=grok-com",
    "https://accounts.x.ai/sign-in",
    "https://accounts.x.ai/account",
    "https://grok.com/sign-in",
    "https://grok.com/imagine/*",
    "https://grok.com/project",
    "https://accounts.x.ai/sign-in",
  ],

  filters: {
    selectors: [] as string[],
    hosts: [] as string[],
    blockResourceTypes: [] as string[],
    dragOverlaySelectors: ["[data-overlay]", ".drag-overlay", ".drop-overlay"],
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
    readiness: "verified",
    sidebar: {
      openButtonSelectors: [
        'button[aria-label="Toggle sidebar"]',
        'button[aria-label="Kenar çubuğunu aç/kapat"]',
      ],
      closeButtonSelectors: [
        'button[data-sidebar="trigger"]',
        'button[aria-label="Toggle sidebar"]',
        'button[aria-label="Kenar çubuğunu aç/kapat"]',
      ],
    },
    history: {
      containerSelectors: ['ul[data-sidebar="menu"]'],
      itemSelectors: ['ul[data-sidebar="menu"] a[href^="/c/"]'],
      titleSelectors: ["span[data-state]", "span.select-none", 'a[href^="/c/"] span'],
    },
  },
};

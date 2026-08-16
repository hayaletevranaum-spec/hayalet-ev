/**
 * shared/timeouts.ts
 *
 * Centralized timeout/interval/delay constants for the whole project.
 * Every layer (renderer, Electron, MCP server, ghost-agent) imports from here.
 *
 * Import:
 *   import {
 *     TIMEOUTS,
 *     DELAYS,
 *     CDP_TIMEOUTS,
 *     PROVIDER_TEST_TIMEOUTS,
 *     PROVIDER_TEST_DELAYS,
 *     PROVIDER_TEST_INTERVALS,
 *     PROVIDER_SCENARIO_DELAYS,
 *     PROVIDER_SCENARIO_TIMEOUTS,
 *   } from "@timeouts";
 *
 * All values are expressed in milliseconds (ms).
 */

// ============================================================
// RENDERER — UI / Webview Timeouts
// ============================================================

export const TIMEOUTS = {
  /** Wait until the DOM is ready (assistant connection). */
  DOM_READY: 30_000,
  /** Slot connection timeout. */
  CONNECTION: 30_000,
  /** AI response wait time. */
  RESPONSE_WAIT: 120_000,
  /** Wait for the send button to become enabled. */
  SEND_ENABLED: 4_000,
  /** Thinking cooldown duration. */
  THINKING_COOLDOWN: 5_000,
  /** Thinking deadline */
  THINKING_DEADLINE: 45_000,
  /** Webview load timeout. */
  WEBVIEW_LOAD: 10_000,
  /** Inactive webview cleanup interval (10 minutes). */
  CLEANUP_INTERVAL: 10 * 60 * 1_000,
} as const;

export const INTERVALS = {
  /** Standard polling interval. */
  POLL: 1_000,
  /** Fast polling interval. */
  POLL_FAST: 100,
  /** Minimum polling interval. */
  POLL_MIN: 250,
  /** State snapshot interval. */
  STATE_SNAPSHOT: 60_000,
  /** Auto-scroll check interval. */
  AUTO_SCROLL: 300,
  /** Maximum backoff value. */
  BACKOFF_MAX: 16_000,
  /** Thinking-state polling interval. */
  THINKING_TICK: 400,
} as const;

export const DELAYS = {
  /** Initial wait duration. */
  INITIAL_WAIT: 1_500,
  /** Retry delay. */
  RETRY: 500,
  /** UI update delay. */
  UI_UPDATE: 100,
  /** Debounce delay. */
  DEBOUNCE: 300,
  /** Delay before clearing the just-ended loading/thinking state. */
  STATE_CLEAR: 1_500,
} as const;

// ============================================================
// GHOST AGENT — Provider Readiness Timeouts
// ============================================================

export const GHOST_TIMEOUTS = {
  /** Maximum wait until the provider is ready. */
  PROVIDER_READY: 90_000,
  /** Provider-readiness polling interval. */
  PROVIDER_READY_POLL: 200,
  /** Stable URL wait time. */
  PROVIDER_READY_STABLE_URL: 1_500,
  /** Wait before ghost-agent shutdown. */
  EXIT_WAIT: 500,
  /** Log de-duplication window. */
  LOG_DUPLICATE_WINDOW: 400,
} as const;

// ============================================================
// ELECTRON — Server Manager / Provider Tester
// ============================================================

export const SERVER_TIMEOUTS = {
  /** Stabilization wait after server startup. */
  STARTUP_SETTLE: 200,
  /** OpenCode binary --version probe timeout */
  BINARY_PROBE: 8_000,
} as const;

export const PROVIDER_TEST_TIMEOUTS = {
  /** DOM test timeout */
  DOM_TEST: 3_000,
  /** Message send timeout. */
  SEND_MESSAGE: 8_000,
  /** Response wait timeout. */
  RESPONSE_WAIT: 15_000,
  /** Stop button timeout. */
  STOP_BUTTON: 2_000,
  /** Input clear timeout after sending. */
  INPUT_CLEAR: 3_000,
  /** Topbar send-indicator state change timeout. */
  SEND_INDICATOR: 4_000,
  /** Total test timeout. */
  TOTAL: 60_000,
  /** Retry delay. */
  RETRY_DELAY: 500,
} as const;

export const PROVIDER_TEST_DELAYS = {
  /** Short wait before observing send-button enabled state. */
  SEND_BUTTON_ENABLED_SETTLE: 500,
  /** Wait while observing the stop button during AI thinking. */
  STOP_BUTTON_THINKING_OBSERVE: 2_000,
  /** Scrape settle before user-message inspection. */
  USER_MESSAGE_INSPECT_SETTLE: 1_000,
} as const;

export const PROVIDER_TEST_INTERVALS = {
  /** Provider-tester condition polling interval. */
  POLL: 100,
} as const;

export const PROVIDER_SCENARIO_TIMEOUTS = {
  /** Generic scenario wait command fallback timeout */
  COMMAND_DEFAULT: 3_000,
  /** Wait until the sync sidebar is ready. */
  SIDEBAR_READY: 3_000,
  /** Loading-settle wait after navigation. */
  NAVIGATION_SETTLE: 4_000,
} as const;

export const PROVIDER_SCENARIO_DELAYS = {
  /** Minimum delay between steps in step-based scenarios. */
  MIN_STEP: 1_000,
  /** Required wait before each command in command-based scenarios. */
  COMMAND_START: 1_000,
  /** Delay after click commands. */
  COMMAND_CLICK: 100,
  /** Delay after wait commands. */
  COMMAND_WAIT: 100,
  /** Delay after check commands. */
  COMMAND_CHECK: 100,
  /** Delay after collect-session-urls commands. */
  COMMAND_COLLECT_SESSION_URLS: 100,
  /** Extra delay after navigate commands. */
  COMMAND_NAVIGATE: 0,
  /** Extra delay after sync commands. */
  COMMAND_SYNC_SESSION: 0,
  /** Extra delay after conversation-list refresh. */
  COMMAND_REFRESH_CONVERSATION_LIST: 0,
  /** Fallback when no command action matches. */
  COMMAND_DEFAULT: 50,
  /** Legacy open-sidebar step delay. */
  STEP_OPEN_SIDEBAR: 250,
  /** Legacy collect-session-urls step delay. */
  STEP_COLLECT_SESSION_URLS: 150,
  /** Legacy open-session-urls step delay. */
  STEP_OPEN_SESSION_URLS: 250,
  /** Legacy wait-loading-idle step delay. */
  STEP_WAIT_LOADING_IDLE: 250,
  /** Legacy report step delay. */
  STEP_REPORT: 0,
  /** Delay after default-page navigation. */
  STEP_NAVIGATE_DEFAULT: 700,
  /** Delay after sidebar-open steps. */
  STEP_ASSERT_SIDEBAR_OPEN: 250,
  /** Delay after session-list steps. */
  STEP_ASSERT_SESSION_LIST: 250,
  /** Delay after sidebar-close steps. */
  STEP_ASSERT_SIDEBAR_CLOSE: 250,
  /** Delay after input-preparation steps. */
  STEP_PREPARE_INPUT: 350,
  /** Delay after send-and-thinking steps. */
  STEP_SEND_AND_WAIT_THINKING: 700,
  /** Delay after attach-flow steps. */
  STEP_ASSERT_ATTACH_FLOW: 400,
  /** Delay after disabled-send steps. */
  STEP_ASSERT_DISABLED_SEND: 350,
  /** Delay after drag-drop steps. */
  STEP_ASSERT_DRAG_DROP_SURFACE: 350,
  /** Delay after prompt-injection steps. */
  STEP_INJECT_PROMPT: 350,
  /** Delay after enabled-send steps. */
  STEP_ASSERT_ENABLED_SEND: 350,
  /** Delay after final-bubbles steps. */
  STEP_ASSERT_FINAL_BUBBLES: 350,
  /** Delay after generated-image steps. */
  STEP_ASSERT_GENERATED_IMAGE: 350,
  /** Delay after generated-image archive steps. */
  STEP_ASSERT_GENERATED_IMAGE_ARCHIVE: 350,
  /** Delay after scroll-behavior steps. */
  STEP_ASSERT_SCROLL_BEHAVIOR: 350,
  /** Delay after provider-capability steps. */
  STEP_ASSERT_PROVIDER_CAPABILITIES: 350,
  /** Legacy step fallback */
  STEP_DEFAULT: 350,
} as const;

// ============================================================
// ASSISTANT - Connect Flow / Overlay Timeouts
// ============================================================

export const ASSISTANT_TIMEOUTS = {
  /** Short overlay stage transition delay */
  STAGE_TRANSITION_SHORT: 800,
  /** Medium overlay stage transition delay */
  STAGE_TRANSITION_MID: 1_000,
  /** Long overlay stage transition delay */
  STAGE_TRANSITION_LONG: 1_500,
  /** Conversation syncer wait */
  CONVERSATION_SYNC: 2_000,
  /** Lifecycle manager navigation settle */
  NAVIGATE_SETTLE: 100,
  /** Loading tracker debounce */
  LOADING_TRACKER_DEBOUNCE: 10,
  /** Conversation list micro-delay */
  CONVERSATION_LIST_MICRO: 0,
} as const;

export const WHISPER_TIMEOUTS = {
  /** Whisper check interval (60 seconds) */
  CHECK_INTERVAL: 60 * 1_000,
} as const;

// ============================================================
// MCP SERVER — CDP (Chrome DevTools Protocol)
// ============================================================

export const CDP_TIMEOUTS = {
  /** HTTP fetch timeout for target discovery */
  TARGET_DISCOVERY: 10_000,
  /** WebSocket connection timeout */
  WEBSOCKET_CONNECT: 10_000,
  /** Default CDP command timeout */
  COMMAND_DEFAULT: 15_000,
  /** Fast commands such as Page.enable and Runtime.enable */
  COMMAND_FAST: 10_000,
  /** Screenshot alma */
  SCREENSHOT: 15_000,
  /** DOM structure retrieval */
  DOM_STRUCTURE: 15_000,
  /** Element lookup and click operations */
  ELEMENT_INTERACTION: 10_000,
  /** Sayfa scroll */
  SCROLL: 10_000,
  /** Klavye input */
  KEYBOARD: 10_000,
} as const;

// ============================================================
// MCP SERVER — Web Tools
// ============================================================

export const WEB_TIMEOUTS = {
  /** SearXNG API arama timeout */
  SEARCH_API: 15_000,
  /** Web page fetch timeout */
  PAGE_FETCH: 15_000,
  /** URL availability check */
  URL_CHECK: 10_000,
} as const;

// ============================================================
// MCP SERVER — Filesystem Tools
// ============================================================

export const FS_TIMEOUTS = {
  /** Default Bash command timeout */
  BASH_DEFAULT: 10_000,
  /** Bash heredoc file write */
  BASH_HEREDOC: 30_000,
} as const;

// ============================================================
// MCP SERVER — Dev Tools
// ============================================================

export const DEV_TIMEOUTS = {
  /** ESLint run */
  LINT: 120_000,
  /** ESLint batch fix */
  LINT_BATCH_FIX: 900_000,
  /** Test run (Vitest/Jest) */
  TEST: 120_000,
  /** Git diff alma */
  GIT_DIFF: 30_000,
  /** Proje analizi */
  ANALYZE: 60_000,
  /** TypeScript check */
  TYPESCRIPT_CHECK: 60_000,
} as const;

// ============================================================
// MCP SERVER — Electron Tools
// ============================================================

export const ELECTRON_TIMEOUTS = {
  /** Default Electron test duration */
  TEST_DEFAULT: 10_000,
} as const;

// ============================================================
// Helper Functions
// ============================================================

/**
 * Convert a timeout value into a human-readable format.
 * @example formatTimeout(90000) => "1m 30s"
 */
export function formatTimeout(ms: number): string {
  if (ms >= 60_000) {
    const minutes = Math.floor(ms / 60_000);
    const seconds = (ms % 60_000) / 1_000;
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${ms / 1_000}s`;
}

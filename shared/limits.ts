/**
 * Shared Limit Constants
 *
 * Centralized limit/size constants shared across renderer, Electron, and MCP layers.
 * Available through the `@limits` alias.
 */

/** Maximum slot state-machine history size. */
export const MAX_HISTORY_SIZE = 50;

/** Maximum line count for the entrance report log panel (terminal/general). */
export const MAX_LOGS_TERMINAL = 100;

/** Maximum line count for the entrance live overlay (server log stream). */
export const MAX_LOGS_SERVER = 50;

/** Analyze page virtual list — number of messages rendered at once. */
export const VISIBLE_MESSAGE_COUNT = 50;

/** Analyze page virtual list — estimated message height (px). */
export const MESSAGE_HEIGHT_ESTIMATE = 80;

/** Log writer — maximum lines per chunk. */
export const MAX_CHUNK_LINES = 10000;

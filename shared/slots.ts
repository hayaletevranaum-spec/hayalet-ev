/**
 * Shared Slot & Session Constants
 *
 * Slot identity constants and Electron session partition names.
 * Accessed through the `@slots` alias.
 */

/** Renderer AI slot identifiers */
export const SLOTS = { AI1: "ai1", AI2: "ai2" } as const;

/** Assistant (AI0) slot identifier */
export const ASSISTANT_SLOT = "ai0";

/** AI-Assistant relay protocol key */
export const PROTOCOL_KEY = "AI-assistant";

/** Electron persist session partition names */
export const PARTITIONS = {
  MAIN: "persist:main", // Shared by AI1 + AI2
  ASSISTANT: "persist:ai0", // Assistant - isolated
} as const;

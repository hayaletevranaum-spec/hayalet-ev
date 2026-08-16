import type { KnipConfig } from "knip";

/**
 * Knip Configuration - unused code/dependency detection.
 *
 * Keep this map close to the repo's real execution surfaces:
 * Electron bundles, Vite page entries, MCP package entries, Ghost Agent,
 * dynamic room packages, scripts, tests, and shared TypeScript modules.
 */
const config: KnipConfig = {
  entry: [
    // Ghost Agent tooling entry
    "ghost-agent/vite.config.js",

    // Electron runtime and packaged wrapper entries
    "electron/main.ts",
    "electron/preload.cjs",
    "electron/webview-preload.cjs",
    "electron/room-webview-preload.cjs",
    "electron/packaged-wrapper-main.ts",
    "electron/packaged-wrapper-cli.ts",
    "electron/native/better-sqlite3-runtime.js",

    // Renderer entries loaded from HTML/preload and page shell routes
    "src/js/app.ts",
    "src/js/pages/*.ts",
    "src/js/pages/*/app.ts",
    "src/js/modules/commands/*.ts",
    "src/js/ui/index.ts",

    // MCP runtime entries
    "mcp-server/index.ts",
    "mcp-server/standalone.ts",

    // Ghost Agent entries
    "ghost-agent/electron/main.ts",
    "ghost-agent/electron/preload.cjs",
    "ghost-agent/src/renderer/index.ts",

    // Room package convention entries loaded through manifests/registries
    "rooms/*/host/index.ts",
    "rooms/*/host/runtime.ts",
    "rooms/*/ui/index.ts",
    "rooms/*/ui/bootstrap.ts",
    "rooms/*/scripts/*.ts",

    // Script entries invoked by package scripts, Electron hooks, or child processes
    "scripts/backup-cli.mjs",
    "scripts/dev-restart-helper.mjs",
    "scripts/electron-builder-after-pack.mjs",
    "scripts/public-snapshot-sanitize.mjs",
    "scripts/sync-mcp-dist.mjs",
    "scripts/rooms/build-room-bundle.mjs",
    "scripts/rooms/build-workspace-rooms.ts",
    "scripts/rooms/clean-generated-room-artifacts.ts",
    "scripts/rooms/report-room-paths.ts",
    "scripts/tests/register-asset-loader.mjs",
    "scripts/tests/run-all-tests.mjs",

    // Game room IIFE modules are loaded through HTML script tags
    "rooms/game-room/ui/*.ts",
    "rooms/game-room/shared/ui/*.ts",
    "rooms/game-room/shared/vendor/konva.min.js",
    "rooms/game-room/main-functions/*/ui/*.ts",

    // Test runner discovers these dynamically
    "scripts/tests/**/*.test.ts",
    "scripts/tests/**/*.helpers.ts",
  ],

  project: [
    "electron/**/*.{ts,cjs,js}",
    "src/js/**/*.{js,ts,d.ts}",
    "src/types/**/*.ts",
    "shared/**/*.ts",
    "mcp-server/**/*.{js,ts}",
    "ghost-agent/**/*.{js,cjs,ts,d.ts}",
    "rooms/**/*.{js,ts,d.ts}",
    "scripts/**/*.{js,mjs,ts}",
    "*.config.{js,cjs,ts}",
  ],

  ignoreFiles: [],

  ignoreDependencies: [
    "depcheck", // manual dependency audit fallback
    "eslint-formatter-compact", // kept for ad-hoc ESLint formatter runs
    "@electron/rebuild", // invoked via node_modules path from better-sqlite3 runtime helper
  ],

  // Barrel exports and room/MCP public APIs often re-export symbols for dynamic registries.
  ignoreExportsUsedInFile: true,

  // Intentional false positives — exports/types that look unused but are consumed dynamically.
  ignoreIssues: {
    // SceneEditor aliases (SceneDebug API wrapper for future use)
    "src/js/scene-editor/scene-debug-room-registry.ts": ["exports", "types"],
    "src/js/scene-editor/scene-debug-runtime-session.ts": ["exports"],
    // isHtmlDocumentPayload — used by regression test via source string-match
    "src/js/pages/opencode-ui/api.ts": ["exports"],

    // Dynamic MCP tool registration — every tool/module is registered via framework, not direct import
    "mcp-server/**/*.ts": ["exports", "types"],

    // Room packages — dynamically registered via manifest/registry pattern
    "rooms/**/*.ts": ["exports", "types"],

    // Shared constants and utilities — consumed by bundler, not direct importer analysis
    "shared/**/*.ts": ["exports", "types"],

    // Script helpers — shared library files for the script CLI system
    "scripts/**/*.{js,mjs}": ["exports", "types"],

    // Electron internals — logger/capture/provider-tester used dynamically via IPC, CDP, or packaging
    "electron/**/*.{ts,cjs}": ["exports", "types"],

    // Ghost Agent — IPC bridge exports consumed by Electron main process
    "ghost-agent/**/*.ts": ["exports", "types"],

    // Module singletons — dynamic getter pattern: consumers call getXxx() on import
    "src/js/modules/catch-manager.ts": ["exports"],
    "src/js/modules/conversation-list-manager.ts": ["exports"],
    "src/js/modules/protocol-handler.ts": ["exports"],
    "src/js/modules/relay-manager.ts": ["exports"],
    "src/js/modules/settings-manager.ts": ["exports"],
    "src/js/modules/slot-presence-store.ts": ["exports"],
    "src/js/modules/upload-manager.ts": ["exports"],
    "src/js/modules/webview-manager.ts": ["exports"],
    "src/js/modules/logger/Logger.ts": ["exports"],

    // Core engine — ServerCommandsRef re-export used as public type surface
    "src/js/modules/core-engine.ts": ["types"],

    // Webview provider method files — dynamically registered via opencodeUiProvider map
    "src/js/modules/webview/**/*.ts": ["exports"],

    // Barrel re-exports — consumed by importing the barrel, not the leaf file
    "src/js/scene-system/scene-clickable-theme.ts": ["exports"],
    "src/js/app/ui-mode/state.ts": ["exports"],
    "src/js/app/ui-mode/index.ts": ["exports", "types"],
    "src/js/constants/index.ts": ["exports"],
    "src/js/modules/logger/index.ts": ["exports", "types"],
    "src/js/scene-system/index.ts": ["exports", "types"],
    "src/js/pages/opencode-ui/tools-prompts.ts": ["exports", "types"],
    "src/types/index.ts": ["exports", "types"],
    "src/types/rooms.ts": ["exports", "types"],

    // Room manifest helpers and type guards — used dynamically by room loader/registry
    "src/types/room-manifest-helpers.ts": ["exports", "types"],
    "src/types/room-manifest-readers.ts": ["exports", "types"],
    "src/types/room-manifest-validation.ts": ["exports", "types"],
    "src/types/room-scene-guards.ts": ["exports", "types"],
    "src/types/room-scene-readers.ts": ["exports", "types"],
    "src/types/room-validation-primitives.ts": ["exports", "types"],

    // Type definitions — exported as public API surface, consumed by downstream packages
    "src/types/commands.ts": ["exports", "types"],
    "src/types/common.ts": ["types"],
    "src/types/database.ts": ["types"],
    "src/types/ipc-channels.ts": ["types"],
    "src/types/logging-core.ts": ["types"],
    "src/types/provider.ts": ["types"],
    "src/types/relay.ts": ["types"],
    "src/types/settings.ts": ["types"],
    "src/types/traffic.ts": ["types"],
    "src/types/transcript.ts": ["types"],
    "src/types/us1-mail.ts": ["types"],
    "src/types/room-schema-version.ts": ["types"],

    // Page-level type exports — part of page API surface
    "src/js/pages/entrance/scene/scene-connect-actions.ts": ["types"],
    "src/js/pages/opencode-ui/types.ts": ["types"],

    // Outbound bridge metadata — dynamic consumer resolution
    "src/js/modules/webview/outbound-bridge-metadata.ts": ["exports"],
  },

  // Public API/type/enum surface findings stay visible without breaking strict gates.
  rules: {
    exports: "warn",
    types: "warn",
    enumMembers: "warn",
  },

  eslint: {
    config: ["eslint.config.cjs"],
  },

  typescript: {
    config: [
      "src/tsconfig.json",
      "electron/tsconfig.electron.json",
      "mcp-server/tsconfig.mcp.json",
      "ghost-agent/tsconfig.json",
      "ghost-agent/tsconfig.electron.json",
      "rooms/tsconfig.rooms.json",
      "scripts/tsconfig.json",
    ],
  },
};

export default config;

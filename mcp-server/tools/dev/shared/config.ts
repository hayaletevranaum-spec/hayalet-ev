export const DEV_CONFIG = {
  srcDirs: ["src/js", "electron", "mcp-server"],
  ignoreDirs: ["node_modules", ".git", "dist", ".vite", "logs", "data", "test-screenshots"],
  extensions: [".ts", ".js", ".cjs", ".mjs"],
  safeModules: [
    "file-utils.ts",
    "url-utils.ts",
    "provider-registry.ts",
    "device-manager.ts",
    "screenshot-manager.ts",
    "whisper-manager.ts",
    "googledrive-manager.ts",
    "server-commands.ts",
  ],
};

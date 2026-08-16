import { defineConfig } from "vite";
import { resolve, dirname } from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BREAKPOINT_TOKENS_PATH = resolve(__dirname, "src/styles/design-system/tokens/breakpoints.css");

function loadCustomMediaTokens() {
  const source = readFileSync(BREAKPOINT_TOKENS_PATH, "utf8");
  const tokens = new Map();
  const tokenPattern = /@custom-media\s+(--[A-Za-z0-9_-]+)\s+([^;]+);/g;
  let match = tokenPattern.exec(source);
  while (match !== null) {
    tokens.set(match[1], match[2].trim());
    match = tokenPattern.exec(source);
  }
  return tokens;
}

function customMediaResolver() {
  return {
    postcssPlugin: "hayalet-ev-custom-media-resolver",
    Once(root) {
      const tokens = loadCustomMediaTokens();

      root.walkAtRules("custom-media", (atRule) => {
        atRule.remove();
      });

      root.walkAtRules("media", (atRule) => {
        atRule.params = atRule.params.replace(
          /\(\s*(--[A-Za-z0-9_-]+)\s*\)/g,
          (fullMatch, tokenName) => {
            const resolvedToken = tokens.get(tokenName);
            if (resolvedToken === undefined) {
              throw atRule.error(`Unknown custom media token ${tokenName}`);
            }
            return resolvedToken;
          }
        );
      });
    },
  };
}
customMediaResolver.postcss = true;

export default defineConfig({
  root: "src",
  base: "./",
  css: {
    postcss: {
      plugins: [customMediaResolver()],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared": resolve(__dirname, "src/types"),
      "@theme-source": resolve(__dirname, "shared/themes"),
      "@electron": resolve(__dirname, "electron"),
      "@timeouts": resolve(__dirname, "shared/timeouts.ts"),
      "@limits": resolve(__dirname, "shared/limits.ts"),
      "@slots": resolve(__dirname, "shared/slots.ts"),
      "@ui-constants": resolve(__dirname, "shared/ui-constants.ts"),
    },
  },
  build: {
    outDir: "../dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/index.html"),
        entrance: resolve(__dirname, "src/pages/entrance.html"),
        assistant: resolve(__dirname, "src/pages/assistant.html"),
        analyze: resolve(__dirname, "src/pages/analyze.html"),
        server: resolve(__dirname, "src/pages/server.html"),
        archives: resolve(__dirname, "src/pages/archives.html"),
        settings: resolve(__dirname, "src/pages/settings.html"),
        whisper: resolve(__dirname, "src/pages/whisper.html"),
        opencodeUi: resolve(__dirname, "src/pages/opencode-ui.html"),
      },
      output: {
        manualChunks(id) {
          if (id.includes("/shared/languages/en/")) {
            return "i18n-en";
          }

          if (id.includes("/shared/languages/tr/")) {
            return "i18n-tr";
          }

          if (id.includes("/shared/i18n/")) {
            return "i18n-core";
          }

          return undefined;
        },
      },
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    fs: {
      // Allow serving files from src directory
      allow: [".."],
    },
  },
  appType: "mpa", // Multi-page app mode - disable SPA fallback
  optimizeDeps: {
    exclude: ["@xterm/xterm", "@xterm/addon-fit"],
  },
});

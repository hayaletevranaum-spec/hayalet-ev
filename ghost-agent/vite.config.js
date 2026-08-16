import { defineConfig } from "vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  root: "src",
  base: "./",
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
      "@ghost": resolve(__dirname, "src/renderer"),
      "@timeouts": resolve(__dirname, "../shared/timeouts.ts"),
      "@limits": resolve(__dirname, "../shared/limits.ts"),
      "@slots": resolve(__dirname, "../shared/slots.ts"),
      "@ui-constants": resolve(__dirname, "../shared/ui-constants.ts"),
    },
  },
  build: {
    outDir: resolve(__dirname, "../dist/ghost-agent/renderer"),
    emptyOutDir: true,
    rollupOptions: {
      input: [resolve(__dirname, "src/renderer/index.html")],
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    fs: {
      allow: ["..", "../.."],
    },
  },
  appType: "mpa",
});

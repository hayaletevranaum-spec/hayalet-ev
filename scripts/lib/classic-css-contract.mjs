import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, "../..");

export function resolveRepoPath(relativePath) {
  return path.join(REPO_ROOT, relativePath);
}

export function readRepoFile(relativePath) {
  return fs.readFileSync(resolveRepoPath(relativePath), "utf8");
}

export function extractStylesheetHrefs(htmlSource) {
  return Array.from(
    htmlSource.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/g),
    (match) => match[1]
  );
}

export function extractRawTemplateImports(source) {
  return Array.from(
    source.matchAll(/import\s+\w+\s+from\s+["']([^"']+\?raw)["'];?/g),
    (match) => match[1]
  );
}

export function extractDynamicCssImports(source) {
  return Array.from(
    source.matchAll(/import\(\s*["']([^"']+\.css)["']\s*\)/g),
    (match) => match[1]
  );
}

export function createLinkedStylesheetDelivery(stylesheet) {
  return {
    type: "linked-stylesheet",
    stylesheet,
  };
}

export function createLazyRuntimeStylesheetDelivery(stylesheet, sourceTs) {
  return {
    type: "lazy-runtime-stylesheet",
    stylesheet,
    sourceTs,
  };
}

export function extractPageIds(htmlSource) {
  return Array.from(htmlSource.matchAll(/\bid=["'](page-[^"']+)["']/g), (match) => match[1]);
}

function normalizeBuiltHref(href) {
  return href.replace(/\?.*$/, "");
}

export function resolveBuiltHtmlPath(candidates) {
  for (const candidate of candidates) {
    const resolved = resolveRepoPath(candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }
  return null;
}

export function collectBuiltStylesheetContents(candidates) {
  const htmlPath = resolveBuiltHtmlPath(candidates);
  if (htmlPath === null) {
    return null;
  }

  const htmlSource = fs.readFileSync(htmlPath, "utf8");
  const hrefs = extractStylesheetHrefs(htmlSource);
  const cssSources = hrefs
    .map((href) => path.resolve(path.dirname(htmlPath), normalizeBuiltHref(href)))
    .filter((cssPath) => fs.existsSync(cssPath))
    .map((cssPath) => fs.readFileSync(cssPath, "utf8"));

  return {
    htmlPath,
    hrefs,
    combinedCss: cssSources.join("\n"),
  };
}

export const CLASSIC_SOURCE_ENTRYPOINTS = [
  {
    name: "main-shell",
    kind: "shell-document",
    sourceHtml: "src/index.html",
    buildHtmlCandidates: ["dist/renderer/index.html"],
    expectedStylesheets: [
      "/styles/main.css",
      "/styles/entrance.css",
      "/styles/analyze.css",
      "/styles/server.css",
      "/styles/rooms.css",
      "/styles/assistant.css",
    ],
    expectedPageIds: [],
    expectedBuiltSelectors: [
      ".top-bar",
      ".slot-grid",
      ".analyze-wrapper",
      ".assistant-topbar",
      ".server-room",
      ".rooms-page",
    ],
  },
  {
    name: "archives",
    kind: "standalone-document",
    sourceHtml: "src/pages/archives.html",
    buildHtmlCandidates: ["dist/renderer/pages/archives.html", "dist/renderer/archives.html"],
    expectedStylesheets: ["/styles/main.css", "/styles/archives.css"],
    expectedPageIds: ["page-archives"],
    expectedBuiltSelectors: [".archives-page", ".archives-wrapper", ".room-shell-hero"],
  },
  {
    name: "whisper",
    kind: "standalone-document",
    sourceHtml: "src/pages/whisper.html",
    buildHtmlCandidates: ["dist/renderer/pages/whisper.html", "dist/renderer/whisper.html"],
    expectedStylesheets: ["/styles/main.css", "/styles/whisper.css"],
    expectedPageIds: ["page-whisper"],
    expectedBuiltSelectors: [".whisper-page", ".whisper-dock__toggle", ".whisper-dock__record"],
  },
  {
    name: "settings",
    kind: "standalone-document",
    sourceHtml: "src/pages/settings.html",
    buildHtmlCandidates: ["dist/renderer/pages/settings.html", "dist/renderer/settings.html"],
    expectedStylesheets: ["/styles/main.css"],
    expectedPageIds: ["page-settings"],
    expectedBuiltSelectors: [".settings-hub-shell", ".settings-hub-layout", ".settings-theme-grid"],
  },
  {
    name: "opencode-ui",
    kind: "standalone-document",
    sourceHtml: "src/pages/opencode-ui.html",
    buildHtmlCandidates: [
      "dist/renderer/pages/opencode-ui.html",
      "dist/renderer/pages/opencodeUi.html",
      "dist/renderer/opencodeUi.html",
      "dist/renderer/opencode-ui.html",
    ],
    expectedStylesheets: ["/styles/main.css"],
    expectedPageIds: [],
    expectedBuiltSelectors: [".app-shell--opencode", ".ds-layout-3col", ".ds-chat__messages"],
  },
];

export const CLASSIC_FRAGMENT_INPUTS = [
  {
    name: "entrance",
    sourceHtml: "src/pages/entrance.html",
    pageId: "page-entrance",
    ownership: ["shell page-runtime", "embedded fragment", "scene-specific"],
    delivery: {
      shell: createLinkedStylesheetDelivery("/styles/entrance.css"),
    },
  },
  {
    name: "analyze",
    sourceHtml: "src/pages/analyze.html",
    pageId: "page-analyze",
    ownership: ["shell page-runtime", "embedded fragment", "scene-specific"],
    delivery: {
      shell: createLinkedStylesheetDelivery("/styles/analyze.css"),
    },
  },
  {
    name: "server",
    sourceHtml: "src/pages/server.html",
    pageId: "page-server",
    ownership: ["shell page-runtime", "embedded fragment", "scene-specific"],
    delivery: {
      shell: createLinkedStylesheetDelivery("/styles/server.css"),
    },
  },
  {
    name: "rooms",
    sourceHtml: "src/pages/rooms.html",
    pageId: "page-rooms",
    ownership: ["shell page-runtime", "embedded fragment"],
    delivery: {
      shell: createLinkedStylesheetDelivery("/styles/rooms.css"),
    },
  },
  {
    name: "assistant",
    sourceHtml: "src/pages/assistant.html",
    pageId: "page-assistant",
    ownership: ["shell page-runtime", "embedded fragment", "scene-specific"],
    delivery: {
      shell: createLinkedStylesheetDelivery("/styles/assistant.css"),
    },
  },
  {
    name: "settings",
    sourceHtml: "src/pages/settings.html",
    pageId: "page-settings",
    ownership: ["standalone page", "shell page-runtime", "embedded fragment", "scene-specific"],
    delivery: {
      shell: createLinkedStylesheetDelivery("/styles/main.css"),
      standalone: createLinkedStylesheetDelivery("/styles/main.css"),
    },
  },
  {
    name: "archives",
    sourceHtml: "src/pages/archives.html",
    pageId: "page-archives",
    ownership: ["standalone page", "shell page-runtime", "embedded fragment"],
    delivery: {
      shell: createLazyRuntimeStylesheetDelivery(
        "/styles/archives.css",
        "src/js/app/runtime-page-styles.ts"
      ),
      standalone: createLinkedStylesheetDelivery("/styles/archives.css"),
    },
  },
  {
    name: "whisper",
    sourceHtml: "src/pages/whisper.html",
    pageId: "page-whisper",
    ownership: ["standalone page", "shell page-runtime", "embedded fragment"],
    delivery: {
      shell: createLazyRuntimeStylesheetDelivery(
        "/styles/whisper.css",
        "src/js/app/runtime-page-styles.ts"
      ),
      standalone: createLinkedStylesheetDelivery("/styles/whisper.css"),
    },
  },
];

export const PAGE_INIT_RAW_IMPORTS = [
  "../../pages/entrance.html?raw",
  "../../pages/analyze.html?raw",
  "../../pages/server.html?raw",
  "../../pages/rooms.html?raw",
  "../../pages/assistant.html?raw",
  "../../pages/settings.html?raw",
  "../../pages/archives.html?raw",
  "../../pages/whisper.html?raw",
];

export const RUNTIME_PAGE_STYLE_ENTRYPOINT = {
  sourceTs: "src/js/app/runtime-page-styles.ts",
  expectedCssImports: ["../../styles/archives.css", "../../styles/whisper.css"],
  expectedLazyStyleKeys: ["archives", "whisper"],
};

export const CLASSIC_CSS_OWNERSHIP = [
  {
    stylesheet: "src/styles/main.css",
    ownership: ["shared shell", "standalone page"],
    notes: "Owns the main shell runtime, settings workbench layout, and opencode standalone shell on top of the shared design-system imports.",
  },
  {
    stylesheet: "src/styles/design-system/components/page-shells.css",
    ownership: ["shared shell", "standalone page", "embedded fragment"],
    notes: "Owns reusable room-shell, archives shell, settings page, and workspace-tool overlay scaffolds extracted from main.css.",
  },
  {
    stylesheet: "src/styles/entrance.css",
    ownership: ["shell page-runtime", "embedded fragment", "scene-specific"],
    notes: "Owns the classic entrance slot grid and imports entrance scene/account/report layers.",
  },
  {
    stylesheet: "src/styles/analyze.css",
    ownership: ["shell page-runtime", "embedded fragment", "scene-specific"],
    notes: "Owns the analyze conversation grid and embedded archives scene panel skin.",
  },
  {
    stylesheet: "src/styles/assistant.css",
    ownership: ["shell page-runtime", "embedded fragment", "scene-specific"],
    notes: "Owns the assistant topbar, provider panel, scene screen shell, and assistant-specific overlays.",
  },
  {
    stylesheet: "src/styles/server.css",
    ownership: ["shell page-runtime", "embedded fragment", "scene-specific"],
    notes: "Owns the server command workspace and scene screen shell.",
  },
  {
    stylesheet: "src/styles/rooms.css",
    ownership: ["shell page-runtime", "embedded fragment"],
    notes: "Owns the rooms classic shell and runtime-installed room page surfaces.",
  },
  {
    stylesheet: "src/styles/archives.css",
    ownership: ["standalone page", "shell page-runtime", "embedded fragment"],
    notes: "Owns standalone archives plus shell-hosted archives loaded on demand through src/js/app/runtime-page-styles.ts.",
  },
  {
    stylesheet: "src/styles/whisper.css",
    ownership: ["standalone page", "shell page-runtime", "embedded fragment"],
    notes: "Owns standalone whisper plus shell-hosted whisper loaded on demand through src/js/app/runtime-page-styles.ts.",
  },
];

export const RUNTIME_SELECTOR_CONTRACTS = [
  {
    name: "splash-screen",
    producer: "src/js/ui/splash-screen.ts",
    backingCss: ["src/styles/design-system/components/splash.css"],
    selectors: [
      "splash",
      "splash-content",
      "splash-scene-stage",
      "splash-scene-frame",
      "splash-hiding",
    ],
  },
  {
    name: "room-manager-overlay",
    producer: "src/js/modules/rooms/room-overlay-markup.ts",
    backingCss: ["src/styles/main.css"],
    selectors: [
      "room-manager-chip",
      "room-manager-card",
      "room-manager-state-badge",
      "room-manager-empty",
    ],
  },
  {
    name: "whisper-runtime",
    producer: "src/js/pages/whisper/controller.ts",
    backingCss: ["src/styles/whisper.css", "src/styles/entrance/scene.css"],
    selectors: [
      "whisper-dock__empty-state",
      "whisper-dock__record",
      "whisper-dock__record-actions",
      "whisper-dock__badge--slot",
    ],
  },
  {
    name: "backup-overlay",
    producer: "src/js/pages/settings/panels/backup-markup.ts",
    backingCss: ["src/styles/main.css"],
    selectors: [
      "backup-scope-row",
      "backup-bundle-row",
      "backup-preview-grid",
      "backup-preview-warning",
    ],
  },
  {
    name: "settings-account-row",
    producer: "src/js/pages/settings/accounts/account-panel.ts",
    backingCss: ["src/styles/entrance/account.css", "src/styles/main.css"],
    selectors: ["account-row", "account-row editing", "account-avatar-2row", "account-info-grid"],
  },
  {
    name: "live-log-overlay",
    producer: "src/js/pages/settings/live-log/overlay-render.ts",
    backingCss: ["src/styles/entrance/report.css", "src/styles/server.css"],
    selectors: ["ds-log-entry__header", "ds-log-time", "ds-log-level-badge", "ds-log-message"],
  },
  {
    name: "settings-scene-theme-option",
    producer: "src/js/pages/settings/panels/theme.ts",
    backingCss: ["src/styles/design-system/components/theme-settings.css"],
    selectors: [
      "settings-scene-theme-option",
      "settings-scene-theme-option__icon",
      "settings-scene-theme-option__copy",
    ],
  },
];

export const TARGET_TOKEN_TAXONOMY = [
  {
    layer: "primitive",
    owner: "src/styles/design-system/tokens/*.css",
    purpose: "Core scales for color, spacing, layout, size, shadow, effect, border, animation, z-index, and breakpoint tokens.",
  },
  {
    layer: "semantic theme",
    owner: "src/styles/design-system/themes/theme-*.css",
    purpose: "Theme-resolved semantic aliases such as surfaces, text colors, scene shell states, and page-level semantic slots.",
  },
  {
    layer: "component alias",
    owner: "src/styles/design-system/components/*.css",
    purpose: "Reusable component-scoped override hooks that adapt shared primitives without redefining raw palette values.",
  },
  {
    layer: "page alias",
    owner: "src/styles/*.css and src/styles/entrance/*.css",
    purpose: "Page-scoped semantic aliases that describe local layout intent, not raw palette literals or duplicated component tokens.",
  },
  {
    layer: "scene scale alias",
    owner: "planned shared token file under src/styles/design-system/tokens/",
    purpose: "Shared ownership for --scene-rem-*, --scene-px-*, and --scene-em-* so consumers stop depending on entrance/scene.css import order.",
  },
];

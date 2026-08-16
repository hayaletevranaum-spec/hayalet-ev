#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");
const SRC_ROOT = join(PROJECT_ROOT, "src");
const ROOMS_ROOT = join(PROJECT_ROOT, "rooms");
const BASELINE_PATH = join(
  PROJECT_ROOT,
  "scripts",
  "baselines",
  "design-system-audit-baseline.json"
);
const SHARED_SCENE_SCALE_PATH = join(
  PROJECT_ROOT,
  "src",
  "styles",
  "design-system",
  "tokens",
  "scene-scale.css"
);

const SCAN_EXTENSIONS = new Set([".css", ".html", ".js", ".ts"]);
const IGNORED_DIRS = new Set(["node_modules", "dist", ".git", ".vite", "coverage", "logs"]);
const HEX_COLOR_RE = /#[0-9A-Fa-f]{3,8}\b/g;
const COLOR_FUNCTION_RE = /\b(?:rgb|rgba|hsl|hsla|lab|lch|oklab|oklch)\((?:[^()]|\([^()]*\))*\)/g;
const INLINE_STYLE_RE = /\bstyle\s*=\s*["']/g;
const EXTERNAL_ASSET_RE = /\b(?:href|src)\s*=\s*["']https?:\/\/(?!fonts\.(googleapis|gstatic))/g;
const CSS_VAR_DEFINE_RE = /(^|[\s{;])(--[A-Za-z0-9_-]+)\s*:/gm;
const CSS_VAR_DECL_RE = /(^|[\s{;])(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/gm;
const CSS_VAR_USE_RE = /var\(\s*(--[A-Za-z0-9_-]+)\b/g;
const CUSTOM_MEDIA_DEFINE_RE = /@custom-media\s+(--[A-Za-z0-9_-]+)\s+([^;]+);/g;
const CUSTOM_MEDIA_USE_RE = /@media[^{]*\(\s*(--[A-Za-z0-9_-]+)\s*\)/g;
const RAW_MEDIA_QUERY_RE = /@media\s*\((?:max-width|min-width):\s*[0-9]+px\)/g;
const RAW_CSS_UNIT_RE = /(^|[^\w-])(-?\d*\.?\d+(?:px|rem|em))\b/g;
const CUSTOM_PROP_DECL_RE = /--[A-Za-z0-9_-]+\s*:\s*[^;]+;/g;
const GRADIENT_RE = /\b(?:linear|radial|conic)-gradient\((?:[^()]|\([^()]*\))*\)/g;
const SCENE_SCALE_VAR_RE = /var\(\s*(--scene-(?:rem|px|em)-[A-Za-z0-9_-]+)\b/g;

const issues = [];

function parseArgs(argv) {
  const options = {
    format: "text",
    scope: "src",
    updateBaseline: false,
    useBaseline: true,
  };

  for (const arg of argv) {
    if (arg === "--format=json") {
      options.format = "json";
      continue;
    }
    if (arg === "--update-baseline") {
      options.updateBaseline = true;
      continue;
    }
    if (arg === "--no-baseline") {
      options.useBaseline = false;
      continue;
    }
    if (arg.startsWith("--scope=")) {
      const scope = arg.slice("--scope=".length);
      if (!["all", "rooms", "src"].includes(scope)) {
        throw new Error(`Unknown design audit scope: ${scope}`);
      }
      options.scope = scope;
    }
  }

  return options;
}

function isIgnoredDirectory(dirPath) {
  const projectPath = toProjectPath(dirPath);
  return (
    projectPath === "rooms/.build" ||
    projectPath.startsWith("rooms/.build/") ||
    projectPath.endsWith("/shared/vendor") ||
    projectPath.includes("/shared/vendor/")
  );
}

function walkFiles(dirPath, acc = []) {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || isIgnoredDirectory(fullPath)) continue;
      walkFiles(fullPath, acc);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!SCAN_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
    acc.push(fullPath);
  }
  return acc;
}

function resolveScanRoots(scope) {
  if (scope === "all") {
    return [SRC_ROOT, ROOMS_ROOT];
  }

  if (scope === "rooms") {
    return [ROOMS_ROOT];
  }

  return [SRC_ROOT];
}

function toProjectPath(filePath) {
  return relative(PROJECT_ROOT, filePath).replaceAll("\\", "/");
}

function isTokenFile(projectPath) {
  return (
    projectPath.startsWith("src/styles/design-system/tokens/") ||
    /^rooms\/[^/]+\/ui\/tokens\.css$/.test(projectPath) ||
    /^rooms\/[^/]+\/ui\/styles\/[^/]*tokens\.css$/.test(projectPath)
  );
}

function isThemeFile(projectPath) {
  return projectPath.startsWith("src/styles/design-system/themes/");
}

function isInfrastructureStyleFile(projectPath) {
  return (
    projectPath.startsWith("src/styles/scene-system/") ||
    projectPath.startsWith("src/styles/scene-editor/")
  );
}

function isTokenOrThemeFile(projectPath) {
  return (
    isTokenFile(projectPath) || isThemeFile(projectPath) || isInfrastructureStyleFile(projectPath)
  );
}

function pushIssue(filePath, line, rule, detail) {
  issues.push({
    filePath: toProjectPath(filePath),
    line,
    rule,
    detail,
  });
}

function getLineNumber(content, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (content.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function collectPatternIssues(filePath, content, regex, rule, detailFactory) {
  regex.lastIndex = 0;
  let match = regex.exec(content);
  while (match !== null) {
    pushIssue(filePath, getLineNumber(content, match.index), rule, detailFactory(match[0], match));
    match = regex.exec(content);
  }
}

function maskCustomPropertyDeclarations(content) {
  return content.replace(CUSTOM_PROP_DECL_RE, (match) => match.replace(/[^\n]/g, " "));
}

function normalizeCssValue(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function getEnclosingCssSelector(content, offset) {
  let cursor = offset;
  while (cursor >= 0) {
    const openIndex = content.lastIndexOf("{", cursor);
    if (openIndex === -1) {
      return null;
    }

    const closeIndex = content.lastIndexOf("}", cursor);
    if (closeIndex > openIndex) {
      cursor = openIndex - 1;
      continue;
    }

    const previousBoundary = content.lastIndexOf("}", openIndex - 1);
    const selector = content
      .slice(previousBoundary + 1, openIndex)
      .replace(/\s+/g, " ")
      .trim();

    return selector === "" ? null : selector;
  }

  return null;
}

function isGlobalCssOverrideSelector(selector) {
  if (selector === null) {
    return true;
  }

  return (
    selector.startsWith(":root") ||
    selector.startsWith("html") ||
    selector.startsWith("body") ||
    selector.startsWith("[data-theme=") ||
    selector.startsWith("[data-theme-surface=")
  );
}

function isIntentionalScopedDuplicateVar(varName, selector) {
  // Scene-view overrides for component-scoped custom properties — check BEFORE global selector filter
  if (selector !== null && selector.includes('data-presentation-mode="scene-view"]') && varName.startsWith("--tt-")) {
    return true;
  }

  if (isGlobalCssOverrideSelector(selector)) {
    return false;
  }

  if (varName.startsWith("--field-")) {
    return true;
  }

  if (varName.startsWith("--ds-choice-")) {
    return true;
  }

  if (varName.startsWith("--modal-")) {
    return true;
  }

  if (varName.startsWith("--app-shell-") && selector.includes(".app-shell--")) {
    return true;
  }

  if (varName.startsWith("--repair-")) {
    return true;
  }

  return false;
}

function collectDefinedCssVars(cssFiles) {
  const definedVars = new Set();
  for (const filePath of cssFiles) {
    const content = readFileSync(filePath, "utf8");
    CSS_VAR_DEFINE_RE.lastIndex = 0;
    let match = CSS_VAR_DEFINE_RE.exec(content);
    while (match !== null) {
      definedVars.add(match[2]);
      match = CSS_VAR_DEFINE_RE.exec(content);
    }
  }
  return definedVars;
}

function collectDefinedCustomMedia(cssFiles) {
  const definedMedia = new Set();
  for (const filePath of cssFiles) {
    const content = readFileSync(filePath, "utf8");
    CUSTOM_MEDIA_DEFINE_RE.lastIndex = 0;
    let match = CUSTOM_MEDIA_DEFINE_RE.exec(content);
    while (match !== null) {
      definedMedia.add(match[1]);
      match = CUSTOM_MEDIA_DEFINE_RE.exec(content);
    }
  }
  return definedMedia;
}

function collectUndefinedVarIssues(cssFiles, definedVars) {
  for (const filePath of cssFiles) {
    const projectPath = toProjectPath(filePath);
    if (isTokenOrThemeFile(projectPath)) continue;

    const content = readFileSync(filePath, "utf8");
    CSS_VAR_USE_RE.lastIndex = 0;
    let match = CSS_VAR_USE_RE.exec(content);
    while (match !== null) {
      const variableName = match[1];
      if (!definedVars.has(variableName)) {
        pushIssue(
          filePath,
          getLineNumber(content, match.index),
          "undefined-css-var",
          `Undefined custom property ${variableName}`
        );
      }
      match = CSS_VAR_USE_RE.exec(content);
    }
  }
}

function collectUndefinedCustomMediaIssues(cssFiles, definedMedia) {
  for (const filePath of cssFiles) {
    const projectPath = toProjectPath(filePath);
    if (isTokenOrThemeFile(projectPath)) continue;

    const content = readFileSync(filePath, "utf8");
    CUSTOM_MEDIA_USE_RE.lastIndex = 0;
    let match = CUSTOM_MEDIA_USE_RE.exec(content);
    while (match !== null) {
      const mediaName = match[1];
      if (!definedMedia.has(mediaName)) {
        pushIssue(
          filePath,
          getLineNumber(content, match.index),
          "undefined-custom-media",
          `Undefined custom media token ${mediaName}`
        );
      }
      match = CUSTOM_MEDIA_USE_RE.exec(content);
    }
  }
}

function collectDuplicateGradientIssues(cssFiles) {
  const gradients = new Map();

  for (const filePath of cssFiles) {
    const projectPath = toProjectPath(filePath);
    if (isTokenOrThemeFile(projectPath)) continue;

    const content = readFileSync(filePath, "utf8");
    GRADIENT_RE.lastIndex = 0;
    let match = GRADIENT_RE.exec(content);
    while (match !== null) {
      const normalized = normalizeCssValue(match[0]);
      if (!gradients.has(normalized)) {
        gradients.set(normalized, []);
      }
      gradients.get(normalized).push({
        filePath,
        line: getLineNumber(content, match.index),
      });
      match = GRADIENT_RE.exec(content);
    }
  }

  for (const locations of gradients.values()) {
    if (locations.length < 2) continue;
    const [canonical, ...duplicates] = locations.sort((left, right) => {
      const leftPath = toProjectPath(left.filePath);
      const rightPath = toProjectPath(right.filePath);
      if (leftPath === rightPath) return left.line - right.line;
      return leftPath.localeCompare(rightPath);
    });

    for (const duplicate of duplicates) {
      pushIssue(
        duplicate.filePath,
        duplicate.line,
        "duplicate-gradient",
        `Duplicate gradient also used in ${toProjectPath(canonical.filePath)}:${canonical.line}`
      );
    }
  }
}

function collectDuplicateVarDefinitionIssues(cssFiles) {
  const definitions = new Map();

  for (const filePath of cssFiles) {
    const content = readFileSync(filePath, "utf8");
    CSS_VAR_DECL_RE.lastIndex = 0;
    let match = CSS_VAR_DECL_RE.exec(content);
    while (match !== null) {
      const projectPath = toProjectPath(filePath);
      const varName = match[2];
      const value = normalizeCssValue(match[3]);
      if (!definitions.has(varName)) {
        definitions.set(varName, []);
      }
      definitions.get(varName).push({
        filePath,
        projectPath,
        line: getLineNumber(content, match.index),
        selector: getEnclosingCssSelector(content, match.index),
        value,
      });
      match = CSS_VAR_DECL_RE.exec(content);
    }
  }

  for (const [varName, locations] of definitions.entries()) {
    const uniquePaths = new Set(locations.map((location) => location.projectPath));
    if (uniquePaths.size < 2) continue;

    if (locations.every((location) => isThemeFile(location.projectPath))) {
      continue;
    }

    const canonical =
      locations.find((location) => isTokenFile(location.projectPath)) ??
      locations.find((location) => isThemeFile(location.projectPath)) ??
      locations[0];

    for (const duplicate of locations) {
      if (duplicate.projectPath === canonical.projectPath) continue;
      if (isThemeFile(duplicate.projectPath)) continue;
      if (isIntentionalScopedDuplicateVar(varName, duplicate.selector)) continue;
      pushIssue(
        duplicate.filePath,
        duplicate.line,
        "duplicate-css-var-definition",
        `Duplicate ${varName} also defined in ${canonical.projectPath}:${canonical.line}`
      );
    }
  }
}

function collectSceneScaleConsumerIssues(cssFiles) {
  if (existsSync(SHARED_SCENE_SCALE_PATH)) {
    return;
  }

  for (const filePath of cssFiles) {
    const projectPath = toProjectPath(filePath);
    if (
      projectPath === "src/styles/entrance/scene.css" ||
      projectPath.startsWith("src/styles/design-system/tokens/")
    ) {
      continue;
    }

    const content = readFileSync(filePath, "utf8");
    const usedSceneVars = new Set();
    SCENE_SCALE_VAR_RE.lastIndex = 0;
    let match = SCENE_SCALE_VAR_RE.exec(content);
    let firstLine = 1;
    while (match !== null) {
      usedSceneVars.add(match[1]);
      if (usedSceneVars.size === 1) {
        firstLine = getLineNumber(content, match.index);
      }
      match = SCENE_SCALE_VAR_RE.exec(content);
    }

    if (usedSceneVars.size === 0) {
      continue;
    }

    pushIssue(
      filePath,
      firstLine,
      "scene-scale-import-order",
      `Uses shared scene scale vars without owning their definition: ${Array.from(usedSceneVars).sort().join(", ")}`
    );
  }
}

function formatIssue(issue) {
  return `${issue.filePath}:${issue.line} [${issue.rule}] ${issue.detail}`;
}

function issueFingerprint(issue) {
  return `${issue.rule}|${issue.filePath}|${issue.line}|${issue.detail}`;
}

function sortIssues(inputIssues) {
  return [...inputIssues].sort((left, right) => {
    if (left.filePath === right.filePath) {
      if (left.line === right.line) {
        if (left.rule === right.rule) {
          return left.detail.localeCompare(right.detail);
        }
        return left.rule.localeCompare(right.rule);
      }
      return left.line - right.line;
    }
    return left.filePath.localeCompare(right.filePath);
  });
}

function summarizeIssues(inputIssues) {
  const byRule = {};
  for (const issue of inputIssues) {
    byRule[issue.rule] = (byRule[issue.rule] ?? 0) + 1;
  }
  return byRule;
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    return null;
  }
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

function writeBaseline(sortedIssues) {
  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  const payload = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    totalIssues: sortedIssues.length,
    byRule: summarizeIssues(sortedIssues),
    issues: sortedIssues.map((issue) => ({
      ...issue,
      fingerprint: issueFingerprint(issue),
    })),
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function emitJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function emitTextPass(files, definedVars, sortedIssues, baselineMatched) {
  const summary = summarizeIssues(sortedIssues);
  const summaryText = Object.entries(summary)
    .sort(([leftRule], [rightRule]) => leftRule.localeCompare(rightRule))
    .map(([rule, count]) => `${rule}=${count}`)
    .join(", ");

  if (sortedIssues.length === 0) {
    console.log(
      `Design system audit passed. Scanned ${files.length} files, ${definedVars.size} custom properties.`
    );
    return;
  }

  const baselineText = baselineMatched ? "baselined" : "tracked";
  console.log(
    `Design system audit passed with ${sortedIssues.length} ${baselineText} issue(s). Scanned ${files.length} files, ${definedVars.size} custom properties.`
  );
  console.log(summaryText === "" ? "No issue summary available." : `Issue summary: ${summaryText}`);
}

function emitTextFailure(header, diffs, sortedIssues) {
  console.error(`${header}\n`);

  if (diffs.added.length > 0) {
    console.error("Added issues:");
    for (const issue of diffs.added) {
      console.error(`+ ${formatIssue(issue)}`);
    }
    console.error("");
  }

  if (diffs.removed.length > 0) {
    console.error("Removed baseline issues:");
    for (const issue of diffs.removed) {
      console.error(`- ${formatIssue(issue)}`);
    }
    console.error("");
  }

  if (sortedIssues.length > 0) {
    console.error("Current issue summary:");
    for (const issue of sortedIssues) {
      console.error(formatIssue(issue));
    }
    console.error(`\nFound ${sortedIssues.length} issue(s).`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = resolveScanRoots(options.scope).flatMap((rootPath) =>
    existsSync(rootPath) ? walkFiles(rootPath) : []
  );
  const cssFiles = files.filter((filePath) => extname(filePath).toLowerCase() === ".css");
  const htmlFiles = files.filter((filePath) => extname(filePath).toLowerCase() === ".html");
  const scriptFiles = files.filter((filePath) => {
    const extension = extname(filePath).toLowerCase();
    return extension === ".js" || extension === ".ts";
  });

  const definedVars = collectDefinedCssVars(cssFiles);
  const definedCustomMedia = collectDefinedCustomMedia(cssFiles);
  collectUndefinedVarIssues(cssFiles, definedVars);
  collectUndefinedCustomMediaIssues(cssFiles, definedCustomMedia);
  collectDuplicateGradientIssues(cssFiles);
  collectDuplicateVarDefinitionIssues(cssFiles);
  collectSceneScaleConsumerIssues(cssFiles);

  for (const filePath of cssFiles) {
    const projectPath = toProjectPath(filePath);
    if (isTokenOrThemeFile(projectPath)) continue;

    const content = readFileSync(filePath, "utf8");
    collectPatternIssues(filePath, content, RAW_MEDIA_QUERY_RE, "raw-breakpoint-media", (value) => {
      return `Raw responsive media query must use breakpoint token syntax: ${value}`;
    });
    collectPatternIssues(
      filePath,
      maskCustomPropertyDeclarations(content),
      RAW_CSS_UNIT_RE,
      "raw-unit-token",
      (_, match) => `Raw CSS unit must be promoted to a token: ${match[2]}`
    );
    collectPatternIssues(filePath, content, HEX_COLOR_RE, "hardcoded-color", (value) => {
      return `Hardcoded color token ${value}`;
    });
    collectPatternIssues(filePath, content, COLOR_FUNCTION_RE, "hardcoded-color", (value) => {
      return `Hardcoded color function ${normalizeCssValue(value)}`;
    });
  }

  for (const filePath of scriptFiles) {
    const projectPath = toProjectPath(filePath);
    if (isTokenOrThemeFile(projectPath)) continue;

    const content = readFileSync(filePath, "utf8");
    collectPatternIssues(filePath, content, HEX_COLOR_RE, "hardcoded-color", (value) => {
      return `Hardcoded color token ${value}`;
    });
  }

  for (const filePath of htmlFiles) {
    const content = readFileSync(filePath, "utf8");
    collectPatternIssues(filePath, content, INLINE_STYLE_RE, "inline-style", () => {
      return "Inline style attribute is not allowed";
    });
    collectPatternIssues(filePath, content, EXTERNAL_ASSET_RE, "external-asset", (value) => {
      return `External asset reference ${value}`;
    });
  }

  const sortedIssues = sortIssues(issues);

  if (options.updateBaseline) {
    writeBaseline(sortedIssues);
    if (options.format === "json") {
      emitJson({
        updatedBaseline: true,
        baselinePath: toProjectPath(BASELINE_PATH),
        totalIssues: sortedIssues.length,
        byRule: summarizeIssues(sortedIssues),
      });
      return;
    }
    console.log(
      `Design system audit baseline updated at ${toProjectPath(BASELINE_PATH)} with ${sortedIssues.length} issue(s).`
    );
    return;
  }

  if (options.useBaseline) {
    const baseline = loadBaseline();
    if (baseline !== null) {
      const currentByFingerprint = new Map(
        sortedIssues.map((issue) => [issueFingerprint(issue), issue])
      );
      const baselineByFingerprint = new Map(
        (baseline.issues ?? []).map((issue) => [issue.fingerprint, issue])
      );

      const added = [...currentByFingerprint.entries()]
        .filter(([fingerprint]) => !baselineByFingerprint.has(fingerprint))
        .map(([, issue]) => issue);
      const removed = [...baselineByFingerprint.entries()]
        .filter(([fingerprint]) => !currentByFingerprint.has(fingerprint))
        .map(([, issue]) => issue);

      if (options.format === "json") {
        emitJson({
          passed: added.length === 0 && removed.length === 0,
          baselinePath: toProjectPath(BASELINE_PATH),
          totalIssues: sortedIssues.length,
          byRule: summarizeIssues(sortedIssues),
          added,
          removed,
        });
        process.exitCode = added.length === 0 && removed.length === 0 ? 0 : 1;
        return;
      }

      if (added.length === 0 && removed.length === 0) {
        emitTextPass(files, definedVars, sortedIssues, true);
        return;
      }

      emitTextFailure(
        "Design system audit baseline drift detected.",
        { added, removed },
        sortedIssues
      );
      process.exitCode = 1;
      return;
    }
  }

  if (options.format === "json") {
    emitJson({
      passed: sortedIssues.length === 0,
      totalIssues: sortedIssues.length,
      byRule: summarizeIssues(sortedIssues),
      issues: sortedIssues.map((issue) => ({
        ...issue,
        fingerprint: issueFingerprint(issue),
      })),
    });
    process.exitCode = sortedIssues.length === 0 ? 0 : 1;
    return;
  }

  if (sortedIssues.length > 0) {
    console.error("Design system audit failed.\n");
    for (const issue of sortedIssues) {
      console.error(formatIssue(issue));
    }
    console.error(`\nFound ${sortedIssues.length} issue(s).`);
    process.exitCode = 1;
    return;
  }

  emitTextPass(files, definedVars, sortedIssues, false);
}

main();

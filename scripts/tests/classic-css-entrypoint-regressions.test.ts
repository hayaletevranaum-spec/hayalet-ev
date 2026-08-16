import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  CLASSIC_FRAGMENT_INPUTS,
  CLASSIC_SOURCE_ENTRYPOINTS,
  PAGE_INIT_RAW_IMPORTS,
  collectBuiltStylesheetContents,
  extractDynamicCssImports,
  extractPageIds,
  extractRawTemplateImports,
  extractStylesheetHrefs,
  RUNTIME_PAGE_STYLE_ENTRYPOINT,
  readRepoFile,
  resolveRepoPath,
} from "../lib/classic-css-contract.mjs";

void test("classic source entrypoints keep the expected stylesheet ownership graph", () => {
  for (const entrypoint of CLASSIC_SOURCE_ENTRYPOINTS) {
    const htmlSource = readRepoFile(entrypoint.sourceHtml);
    const stylesheetHrefs = extractStylesheetHrefs(htmlSource);

    assert.deepEqual(
      stylesheetHrefs,
      entrypoint.expectedStylesheets,
      `${entrypoint.sourceHtml} stylesheet graph drifted`
    );

    if (entrypoint.expectedPageIds.length > 0) {
      const pageIds = extractPageIds(htmlSource);
      for (const expectedPageId of entrypoint.expectedPageIds) {
        assert.ok(pageIds.includes(expectedPageId), `${entrypoint.sourceHtml} lost ${expectedPageId}`);
      }
    }
  }
});

void test("page-init raw template imports stay aligned with the shell fragment contract", () => {
  const pageInitSource = readRepoFile("src/js/app/page-init.ts");
  const importedTemplates = extractRawTemplateImports(pageInitSource);

  assert.deepEqual(importedTemplates, PAGE_INIT_RAW_IMPORTS);

  for (const fragment of CLASSIC_FRAGMENT_INPUTS) {
    const fragmentSource = readRepoFile(fragment.sourceHtml);
    assert.match(fragmentSource, new RegExp(`id=["']${fragment.pageId}["']`));
  }
});

void test("fragment delivery contract distinguishes linked and lazy shell stylesheet delivery", () => {
  const lazyShellFragments = CLASSIC_FRAGMENT_INPUTS.filter(
    (fragment) => fragment.delivery.shell.type === "lazy-runtime-stylesheet"
  ).map((fragment) => fragment.name);
  const linkedShellFragments = CLASSIC_FRAGMENT_INPUTS.filter(
    (fragment) => fragment.delivery.shell.type === "linked-stylesheet"
  ).map((fragment) => fragment.name);

  assert.deepEqual(lazyShellFragments, RUNTIME_PAGE_STYLE_ENTRYPOINT.expectedLazyStyleKeys);
  assert.deepEqual(linkedShellFragments, [
    "entrance",
    "analyze",
    "server",
    "rooms",
    "assistant",
    "settings",
  ]);
  assert.equal(
    CLASSIC_FRAGMENT_INPUTS.find((fragment) => fragment.name === "archives")?.delivery.standalone
      ?.stylesheet,
    "/styles/archives.css"
  );
  assert.equal(
    CLASSIC_FRAGMENT_INPUTS.find((fragment) => fragment.name === "whisper")?.delivery.standalone
      ?.stylesheet,
    "/styles/whisper.css"
  );
});

void test("runtime page stylesheet loader keeps lazy shell page styles aligned", () => {
  const runtimeLoaderSource = readRepoFile(RUNTIME_PAGE_STYLE_ENTRYPOINT.sourceTs);
  const runtimeCssImports = extractDynamicCssImports(runtimeLoaderSource);

  assert.deepEqual(runtimeCssImports, RUNTIME_PAGE_STYLE_ENTRYPOINT.expectedCssImports);
});

void test("classic docs capture ownership and token taxonomy guardrails", () => {
  const ownershipDoc = readRepoFile(".rovo/classic-css-ownership-matrix.md");
  const taxonomyDoc = readRepoFile(".rovo/classic-theme-token-taxonomy.md");

  assert.match(ownershipDoc, /shell page-runtime/);
  assert.match(ownershipDoc, /embedded fragment/);
  assert.match(ownershipDoc, /candidate for deletion/);
  assert.match(ownershipDoc, /src\/js\/app\/page-init\.ts/);
  assert.match(taxonomyDoc, /scene scale alias/);
  assert.match(taxonomyDoc, /obsidian/);
  assert.match(taxonomyDoc, /assistant\.css/);
});

void test("built renderer html keeps the classic selector coverage contract", (t) => {
  if (process.env["CHECK_DIST_RENDERER_CSS_GRAPH"] !== "1") {
    t.skip("Set CHECK_DIST_RENDERER_CSS_GRAPH=1 after npm run build to validate dist/renderer.");
    return;
  }

  const distRoot = resolveRepoPath("dist/renderer");
  if (!fs.existsSync(distRoot)) {
    t.skip("Run npm run build before validating dist/renderer ownership.");
    return;
  }

  for (const entrypoint of CLASSIC_SOURCE_ENTRYPOINTS) {
    const freshestSourceMtime = [
      entrypoint.sourceHtml,
      ...entrypoint.expectedStylesheets.map((href) => `src${href}`),
    ].reduce((latest, relativePath) => {
      const stats = fs.statSync(resolveRepoPath(relativePath));
      return Math.max(latest, stats.mtimeMs);
    }, 0);

    const buildAssets = collectBuiltStylesheetContents(entrypoint.buildHtmlCandidates);
    if (buildAssets === null) {
      t.skip(`Missing built html for ${entrypoint.name}; run npm run build first.`);
      return;
    }

    const buildStats = fs.statSync(buildAssets.htmlPath);
    if (buildStats.mtimeMs < freshestSourceMtime) {
      t.skip("dist/renderer is stale relative to source CSS ownership inputs. Run npm run build.");
      return;
    }

    assert.ok(
      buildAssets.hrefs.length > 0,
      `${path.basename(buildAssets.htmlPath)} did not emit any linked stylesheet assets`
    );

    for (const selector of entrypoint.expectedBuiltSelectors) {
      assert.match(
        buildAssets.combinedCss,
        new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        `${path.basename(buildAssets.htmlPath)} lost selector ${selector}`
      );
    }
  }
});

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

const ASSET_PATTERN = /\.(?:css|png|jpe?g|gif|webp|bmp|ico|svg)(?:\?.*)?$/i;
const RAW_SVG_PATTERN = /\.svg\?raw$/i;

function isAssetSpecifier(value) {
  return ASSET_PATTERN.test(value);
}

function splitSpecifier(specifier) {
  const queryIndex = specifier.indexOf("?");
  if (queryIndex === -1) {
    return { path: specifier, query: "" };
  }
  return {
    path: specifier.slice(0, queryIndex),
    query: specifier.slice(queryIndex),
  };
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!isAssetSpecifier(specifier)) {
      return nextResolve(specifier, context);
    }

    const { path, query } = splitSpecifier(specifier);
    const parentUrl = context.parentURL;
    const basePath =
      typeof parentUrl === "string" && parentUrl.startsWith("file:")
        ? dirname(fileURLToPath(parentUrl))
        : process.cwd();
    const absolutePath = path.startsWith("/")
      ? path
      : resolve(basePath, path);
    const assetUrl = pathToFileURL(absolutePath);
    assetUrl.search = query;

    return {
      shortCircuit: true,
      url: assetUrl.href,
    };
  },

  load(url, context, nextLoad) {
    if (!isAssetSpecifier(url)) {
      return nextLoad(url, context);
    }

    const assetUrl = new URL(url);
    const assetPath = fileURLToPath(assetUrl);
    const source = RAW_SVG_PATTERN.test(`${assetUrl.pathname}${assetUrl.search}`)
      ? `export default ${JSON.stringify(readFileSync(assetPath, "utf8"))};`
      : `export default ${JSON.stringify(assetPath)};`;

    return {
      format: "module",
      shortCircuit: true,
      source,
    };
  },
});

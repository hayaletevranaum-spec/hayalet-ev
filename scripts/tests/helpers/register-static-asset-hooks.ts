import { registerHooks } from "node:module";

const STATIC_ASSET_PATTERN = /\.(?:png|jpe?g|gif|webp|svg)$/i;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      typeof context.parentURL === "string" &&
      context.parentURL !== "" &&
      STATIC_ASSET_PATTERN.test(specifier)
    ) {
      return {
        shortCircuit: true,
        url: new URL(specifier, context.parentURL).href,
      };
    }

    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (STATIC_ASSET_PATTERN.test(url)) {
      return {
        shortCircuit: true,
        format: "module",
        source: `export default ${JSON.stringify(url)};`,
      };
    }

    return nextLoad(url, context);
  },
});

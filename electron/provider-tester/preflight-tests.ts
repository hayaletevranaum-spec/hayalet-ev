import type { ProviderTestResult } from "../../src/types/provider.ts";
import type { TestContext } from "./types.ts";
export async function testExcludedUrl(ctx: TestContext): Promise<ProviderTestResult> {
  const start = Date.now();
  const currentUrl = ctx.webview.getURL();

  const isExcluded = ctx.config.excludedUrls.some((pattern: string) => {
    if (pattern.includes("*")) {
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      return regex.test(currentUrl);
    }
    return currentUrl.startsWith(pattern);
  });

  if (isExcluded) {
    return {
      id: "excluded-url-check",
      name: await ctx.t("preflight.excludedUrlCheck.name"),
      category: "preflight",
      status: "fail",
      message: await ctx.t("preflight.excludedUrlCheck.pageExcluded"),
      details: {
        selector: currentUrl,
        error: await ctx.t("preflight.excludedUrlCheck.urlListedError"),
      },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  }

  return {
    id: "excluded-url-check",
    name: await ctx.t("preflight.excludedUrlCheck.name"),
    category: "preflight",
    status: "pass",
    message: await ctx.t("preflight.excludedUrlCheck.pageValid"),
    details: { selector: currentUrl },
    duration: Date.now() - start,
    timestamp: Date.now(),
  };
}

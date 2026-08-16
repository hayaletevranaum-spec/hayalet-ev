import type { ProviderTestResult } from "../../src/types/provider.ts";
import type { TestContext, SelectorCheckResult } from "./types.ts";

export async function runDOMTests(ctx: TestContext): Promise<ProviderTestResult[]> {
  const results: ProviderTestResult[] = [];

  results.push(await testInputField(ctx));
  results.push(await testAttachButton(ctx));
  results.push(await testFileInput(ctx));
  results.push(await testUploadTarget(ctx));
  results.push(await testCriticalSelectors(ctx));

  return results;
}

export async function testInputField(ctx: TestContext): Promise<ProviderTestResult> {
  return await ctx.testSelector({
    id: "input-field",
    name: await ctx.t("dom.inputField.name"),
    selector: ctx.config.selectors.inputField,
    category: "dom",
    checks: ["exists", "visible", "editable"],
  });
}

export async function testAttachButton(ctx: TestContext): Promise<ProviderTestResult> {
  if (ctx.config.selectors.attachButton === undefined || ctx.config.selectors.attachButton === "") {
    return ctx.createSkipResult(
      "attach-button",
      await ctx.t("dom.attachButton.name"),
      "dom",
      await ctx.t("dom.attachButton.selectorMissing")
    );
  }
  return await ctx.testSelector({
    id: "attach-button",
    name: await ctx.t("dom.attachButton.name"),
    selector: ctx.config.selectors.attachButton,
    category: "dom",
    checks: ["exists", "visible"],
  });
}

export async function testFileInput(ctx: TestContext): Promise<ProviderTestResult> {
  const start = Date.now();
  if (ctx.config.fileInputSelectors.length === 0) {
    return ctx.createSkipResult(
      "file-input",
      await ctx.t("dom.fileInput.name"),
      "dom",
      await ctx.t("dom.fileInput.selectorMissing")
    );
  }

  try {
    const checks = await Promise.all(
      ctx.config.fileInputSelectors.map(async (selector) => {
        const exists = (await ctx.executeScript(
          `(function() { return !!document.querySelector(${JSON.stringify(selector)}); })()`
        )) as boolean;
        return { selector, exists };
      })
    );
    const found = checks.find((item) => item.exists);
    if (found !== undefined) {
      return {
        id: "file-input",
        name: await ctx.t("dom.fileInput.name"),
        category: "dom",
        status: "pass",
        message: await ctx.t("dom.fileInput.found"),
        details: { selector: found.selector },
        duration: Date.now() - start,
        timestamp: Date.now(),
      };
    }

    return {
      id: "file-input",
      name: await ctx.t("dom.fileInput.name"),
      category: "dom",
      status: "fail",
      message: await ctx.t("dom.fileInput.notFound"),
      details: { selector: ctx.config.fileInputSelectors.join(", ") },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      id: "file-input",
      name: await ctx.t("dom.fileInput.name"),
      category: "dom",
      status: "fail",
      message: await ctx.t("dom.fileInput.failed"),
      details: { error: (error as Error).message },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  }
}

export async function testUploadTarget(ctx: TestContext): Promise<ProviderTestResult> {
  const start = Date.now();
  if (ctx.config.uploadTargetSelectors.length === 0) {
    return ctx.createSkipResult(
      "upload-target",
      await ctx.t("dom.uploadTarget.name"),
      "dom",
      await ctx.t("dom.uploadTarget.selectorMissing")
    );
  }

  try {
    const checks = await Promise.all(
      ctx.config.uploadTargetSelectors.map(async (selector) => {
        const exists = (await ctx.executeScript(
          `(function() { return !!document.querySelector(${JSON.stringify(selector)}); })()`
        )) as boolean;
        return { selector, exists };
      })
    );
    const found = checks.find((item) => item.exists);
    if (found !== undefined) {
      return {
        id: "upload-target",
        name: await ctx.t("dom.uploadTarget.name"),
        category: "dom",
        status: "pass",
        message: await ctx.t("dom.uploadTarget.found"),
        details: { selector: found.selector },
        duration: Date.now() - start,
        timestamp: Date.now(),
      };
    }

    return {
      id: "upload-target",
      name: await ctx.t("dom.uploadTarget.name"),
      category: "dom",
      status: "warning",
      message: await ctx.t("dom.uploadTarget.notFound"),
      details: { selector: ctx.config.uploadTargetSelectors.join(", ") },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      id: "upload-target",
      name: await ctx.t("dom.uploadTarget.name"),
      category: "dom",
      status: "fail",
      message: await ctx.t("dom.uploadTarget.failed"),
      details: { error: (error as Error).message },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  }
}

export async function testCriticalSelectors(
  ctx: TestContext,
  selectors = ctx.config.criticalSelectors
): Promise<ProviderTestResult> {
  const start = Date.now();
  if (selectors.length === 0) {
    return ctx.createSkipResult(
      "critical-selectors",
      await ctx.t("dom.criticalSelectors.name"),
      "dom",
      await ctx.t("dom.criticalSelectors.selectorMissing")
    );
  }

  try {
    const results = await Promise.all(
      selectors.map(async (selector: string) => {
        const exists = (await ctx.executeScript(
          `(function() { return !!document.querySelector(${JSON.stringify(selector)}); })()`
        )) as boolean;
        return { selector, exists };
      })
    );

    const failed = results.filter((r: SelectorCheckResult) => !r.exists);

    if (failed.length === 0) {
      return {
        id: "critical-selectors",
        name: await ctx.t("dom.criticalSelectors.name"),
        category: "dom",
        status: "pass",
        message: await ctx.t("dom.criticalSelectors.allFound", { count: results.length }),
        duration: Date.now() - start,
        timestamp: Date.now(),
      };
    }

    return {
      id: "critical-selectors",
      name: await ctx.t("dom.criticalSelectors.name"),
      category: "dom",
      status: "warning",
      message: await ctx.t("dom.criticalSelectors.missingCount", {
        missing: failed.length,
        total: results.length,
      }),
      details: { selector: failed.map((f: SelectorCheckResult) => f.selector).join(", ") },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      id: "critical-selectors",
      name: await ctx.t("dom.criticalSelectors.name"),
      category: "dom",
      status: "fail",
      message: await ctx.t("dom.criticalSelectors.failed"),
      details: { error: (error as Error).message },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  }
}

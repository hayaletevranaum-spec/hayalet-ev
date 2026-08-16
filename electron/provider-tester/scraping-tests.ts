import type { ProviderTestResult } from "../../src/types/provider.ts";
import type { TestContext, MessageScrapingResult } from "./types.ts";
import { PROVIDER_TEST } from "./types.ts";

export async function runScrapingTests(ctx: TestContext): Promise<ProviderTestResult[]> {
  const results: ProviderTestResult[] = [];

  results.push(await testStopButton(ctx));
  results.push(await testAssistantMessageScraping(ctx));
  results.push(await testGeneratedImage(ctx));
  results.push(await testMessageContainer(ctx));

  return results;
}

export async function runAdvancedTests(ctx: TestContext): Promise<ProviderTestResult[]> {
  const results: ProviderTestResult[] = [];

  if (ctx.config.selectors.voiceButton !== undefined && ctx.config.selectors.voiceButton !== "") {
    results.push(await testVoiceButton(ctx));
  }

  return results;
}

export async function testStopButton(ctx: TestContext): Promise<ProviderTestResult> {
  const start = Date.now();
  try {
    const visible = await ctx.waitForCondition(async () => {
      return await ctx.isElementVisible(ctx.config.selectors.stopButton);
    }, PROVIDER_TEST.TIMEOUT_STOP_BUTTON);

    if (visible) {
      return {
        id: "stop-button",
        name: await ctx.t("scraping.stopButton.name"),
        category: "scraping",
        status: "pass",
        message: await ctx.t("scraping.stopButton.visible"),
        details: { selector: ctx.config.selectors.stopButton },
        duration: Date.now() - start,
        timestamp: Date.now(),
      };
    }

    return {
      id: "stop-button",
      name: await ctx.t("scraping.stopButton.name"),
      category: "scraping",
      status: "skip",
      message: await ctx.t("scraping.stopButton.skippedFastResponse"),
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      id: "stop-button",
      name: await ctx.t("scraping.stopButton.name"),
      category: "scraping",
      status: "warning",
      message: await ctx.t("scraping.stopButton.notDetected"),
      details: { error: (error as Error).message },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  }
}

export async function testAssistantMessageScraping(ctx: TestContext): Promise<ProviderTestResult> {
  const start = Date.now();
  try {
    const selector =
      ctx.config.scrapeSelectors.assistantWrapper ?? ctx.config.scrapeSelectors.preferred;
    const hasResponse = await ctx.waitForCondition(async () => {
      const count = (await ctx.executeScript(
        "(function() {" +
          "  const selector = " +
          JSON.stringify(selector) +
          ";" +
          "  return document.querySelectorAll(selector).length;" +
          "})()"
      )) as number;
      return count > 0;
    }, PROVIDER_TEST.TIMEOUT_RESPONSE_WAIT);

    if (!hasResponse) throw new Error(await ctx.t("scraping.assistantMessage.noResponse"));

    const script =
      "(function() {" +
      "  const assistantSelector = " +
      JSON.stringify(selector) +
      ";" +
      "  const messages = Array.from(document.querySelectorAll(assistantSelector));" +
      "  const lastMessage = messages[messages.length - 1];" +
      "  if (!lastMessage) throw new Error(" +
      JSON.stringify(await ctx.t("scraping.assistantMessage.noAssistantMessage")) +
      ");" +
      '  const text = lastMessage.textContent || lastMessage.innerText || "";' +
      "  return { found: true, text: text.trim().slice(0, 100) };" +
      "})()";

    const result = (await ctx.executeScript(script)) as MessageScrapingResult;

    if (result.found === true && result.text !== undefined && result.text.length > 0) {
      return {
        id: "assistant-message-scraping",
        name: await ctx.t("scraping.assistantMessage.name"),
        category: "scraping",
        status: "pass",
        message: await ctx.t("scraping.assistantMessage.scraped"),
        details: {
          ...(ctx.config.scrapeSelectors.assistantWrapper !== undefined &&
          ctx.config.scrapeSelectors.assistantWrapper !== ""
            ? { selector: ctx.config.scrapeSelectors.assistantWrapper }
            : {}),
          element: { tagName: "div", visible: true, enabled: true, textContent: result.text },
        },
        duration: Date.now() - start,
        timestamp: Date.now(),
      };
    }

    throw new Error(await ctx.t("scraping.assistantMessage.empty"));
  } catch (error) {
    return {
      id: "assistant-message-scraping",
      name: await ctx.t("scraping.assistantMessage.name"),
      category: "scraping",
      status: "fail",
      message: await ctx.t("scraping.assistantMessage.failed"),
      details: { error: (error as Error).message },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  }
}

export async function testMessageContainer(ctx: TestContext): Promise<ProviderTestResult> {
  return await ctx.testSelector({
    id: "message-container",
    name: await ctx.t("scraping.messageContainer.name"),
    selector: ctx.config.selectors.messageContainer,
    category: "scraping",
    checks: ["exists", "visible"],
  });
}

export async function testGeneratedImage(ctx: TestContext): Promise<ProviderTestResult> {
  const selector = ctx.config.selectors.generatedImage;
  if (selector === undefined || selector === "") {
    return ctx.createSkipResult(
      "generated-image",
      await ctx.t("scraping.generatedImage.name"),
      "scraping",
      await ctx.t("scraping.generatedImage.selectorMissing")
    );
  }

  const start = Date.now();

  try {
    let result = (await ctx.executeScript(`
      (function() {
        const selector = ${JSON.stringify(selector)};
        const root = document.querySelector(selector);
        if (!root) return { found: false };

        const image = root instanceof HTMLImageElement ? root : root.querySelector('img');
        const target = image ?? root;
        const rect = target.getBoundingClientRect();
        const styles = window.getComputedStyle(target);
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          styles.display !== 'none' &&
          styles.visibility !== 'hidden' &&
          styles.opacity !== '0';

        return {
          found: true,
          tagName: target.tagName,
          classes: target.className ?? '',
          visible,
          enabled: true,
          width: rect.width,
          height: rect.height,
          textContent: target.textContent?.trim() ?? '',
          src: image?.getAttribute('src') ?? '',
          alt: image?.getAttribute('alt') ?? '',
        };
      })()
    `)) as {
      found: boolean;
      tagName?: string;
      classes?: string;
      visible?: boolean;
      enabled?: boolean;
      width?: number;
      height?: number;
      textContent?: string;
      src?: string;
      alt?: string;
    };

    const found = await ctx.waitForCondition(async () => {
      result = (await ctx.executeScript(`
        (function() {
          const selector = ${JSON.stringify(selector)};
          const root = document.querySelector(selector);
          if (!root) return { found: false };

          const image = root instanceof HTMLImageElement ? root : root.querySelector('img');
          const target = image ?? root;
          const rect = target.getBoundingClientRect();
          const styles = window.getComputedStyle(target);
          const visible =
            rect.width > 0 &&
            rect.height > 0 &&
            styles.display !== 'none' &&
            styles.visibility !== 'hidden' &&
            styles.opacity !== '0';

          return {
            found: true,
            tagName: target.tagName,
            classes: target.className ?? '',
            visible,
            enabled: true,
            width: rect.width,
            height: rect.height,
            textContent: target.textContent?.trim() ?? '',
            src: image?.getAttribute('src') ?? '',
            alt: image?.getAttribute('alt') ?? '',
          };
        })()
      `)) as {
        found: boolean;
        visible?: boolean;
      };

      return result.found === true && result.visible === true;
    }, PROVIDER_TEST.TIMEOUT_RESPONSE_WAIT);

    if (found) {
      return {
        id: "generated-image",
        name: await ctx.t("scraping.generatedImage.name"),
        category: "scraping",
        status: "pass",
        message: await ctx.t("scraping.generatedImage.found"),
        details: {
          selector,
          element: {
            tagName: result.tagName ?? "unknown",
            visible: result.visible === true,
            enabled: result.enabled !== false,
            ...(typeof result.alt === "string" && result.alt !== ""
              ? { textContent: result.alt }
              : {}),
          },
        },
        duration: Date.now() - start,
        timestamp: Date.now(),
      };
    }

    return {
      id: "generated-image",
      name: await ctx.t("scraping.generatedImage.name"),
      category: "scraping",
      status: "warning",
      message: await ctx.t("scraping.generatedImage.notFound"),
      details: { selector },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      id: "generated-image",
      name: await ctx.t("scraping.generatedImage.name"),
      category: "scraping",
      status: "warning",
      message: await ctx.t("scraping.generatedImage.failed"),
      details: {
        selector,
        error: (error as Error).message,
      },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  }
}

export async function testVoiceButton(ctx: TestContext): Promise<ProviderTestResult> {
  if (ctx.config.selectors.voiceButton === undefined || ctx.config.selectors.voiceButton === "") {
    return ctx.createSkipResult(
      "voice-button",
      await ctx.t("scraping.voiceButton.name"),
      "advanced",
      await ctx.t("scraping.voiceButton.selectorMissing")
    );
  }
  return await ctx.testSelector({
    id: "voice-button",
    name: await ctx.t("scraping.voiceButton.name"),
    selector: ctx.config.selectors.voiceButton,
    category: "advanced",
    checks: ["exists", "visible"],
  });
}

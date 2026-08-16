import { PROVIDER_TEST_DELAYS } from "../../shared/timeouts.ts";
import { formatErrorWithDetail } from "../../shared/i18n/error-detail.ts";
import type { ProviderTestResult } from "../../src/types/provider.ts";
import type { TestContext, ElementCheckResult, InteractiveTestsResult } from "./types.ts";
import { PROVIDER_TEST } from "./types.ts";
import { resolveSelectorCandidates } from "../../shared/provider-selector-resolution.ts";
export type { InteractiveTestsResult } from "./types.ts";

async function interactiveT(
  ctx: TestContext,
  key: string,
  params?: Record<string, string | number | boolean>
): Promise<string> {
  return await ctx.t(`interactive.${key}`, params);
}

function normalizeComparableText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function runInteractiveTests(ctx: TestContext): Promise<InteractiveTestsResult> {
  const results: ProviderTestResult[] = [];
  let aborted = false;

  results.push(await testInputFieldAccessibility(ctx));
  results.push(await testPrepareInput(ctx));

  results.push(await testSendButtonDisabled(ctx));

  results.push(await testMicrophoneButton(ctx));

  const injectResult = await testTextInjection(ctx);
  results.push(injectResult);
  if (injectResult.status === "fail") {
    return { results, aborted: true };
  }

  results.push(await testSendButtonEnabled(ctx));

  results.push(await testFileUpload(ctx));

  const sendResult = await testSendMessage(ctx);
  results.push(sendResult);
  if (sendResult.status === "fail") {
    aborted = true;
    return { results, aborted };
  }

  results.push(await testStopButtonWhileThinking(ctx));

  results.push(await testUserMessageInspect(ctx));

  results.push(await testAIResponseInspect(ctx));

  return { results, aborted };
}

export async function testPrepareInput(ctx: TestContext): Promise<ProviderTestResult> {
  const start = Date.now();
  try {
    const selectorEntry =
      ctx.config.selectorMatrix?.selectors?.["inputField"] ?? ctx.config.selectors.inputField;
    const selectorCandidates = resolveSelectorCandidates(selectorEntry, ctx.appLanguage);
    const candidates =
      selectorCandidates.length > 0 ? selectorCandidates : [ctx.config.selectors.inputField];

    const result = (await ctx.executeScript(`(function() {
      const selectorCandidates = ${JSON.stringify(candidates)};
      const resolveInput = () => {
        for (const selector of selectorCandidates) {
          try {
            const found = document.querySelector(selector);
            if (found) return { element: found, selector };
          } catch (_) {
            void 0;
          }
        }
        return null;
      };

      const resolvedInput = resolveInput();
      if (!resolvedInput) {
        return { exists: false };
      }

      const input = resolvedInput.element;
      const readValue = () => {
        if (typeof input.value === 'string') return input.value;
        return input.textContent || input.innerText || '';
      };

      const beforeValue = readValue();
      const hadContent = beforeValue.trim() !== '';
      const isEditable =
        input.isContentEditable ||
        input.contentEditable === 'true' ||
        input.classList.contains('ProseMirror') ||
        input.id === 'prompt-textarea';

      input.focus();

      if (hadContent) {
        if (isEditable) {
          input.innerHTML = '<p><br class="ProseMirror-trailingBreak"></p>';
          input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        } else {
          if (typeof input.value === 'string') {
            input.value = '';
          }
          if (typeof input.textContent === 'string') {
            input.textContent = '';
          }
          input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        }
      }

      const afterValue = readValue();
      const visible =
        input instanceof HTMLElement
          ? input.offsetWidth > 0 || input.offsetHeight > 0 || input.getClientRects().length > 0
          : true;
      const enabled = input.getAttribute('aria-disabled') !== 'true' && input.disabled !== true;

      return {
        exists: true,
        visible,
        enabled,
        matchedSelector: resolvedInput.selector,
        hadContent,
        cleared: afterValue.trim() === '',
        tagName: input.tagName,
        beforeValue,
        afterValue,
      };
    })();`)) as {
      exists?: boolean;
      visible?: boolean;
      enabled?: boolean;
      matchedSelector?: string;
      hadContent?: boolean;
      cleared?: boolean;
      tagName?: string;
      beforeValue?: string;
      afterValue?: string;
    };

    if (result.exists !== true) {
      throw new Error("Input field not found");
    }

    if (result.cleared !== true) {
      throw new Error("Input field could not be cleared");
    }

    return {
      id: "prepare-input",
      name: "Prepare Input",
      category: "interactive",
      status: "pass",
      message: result.hadContent === true ? "Input field content cleared" : "Input field is ready",
      details: {
        selector: result.matchedSelector ?? ctx.config.selectors.inputField,
        element: {
          tagName: result.tagName ?? "unknown",
          visible: result.visible === true,
          enabled: result.enabled !== false,
          ...(typeof result.afterValue === "string" ? { textContent: result.afterValue } : {}),
        },
      },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      id: "prepare-input",
      name: "Prepare Input",
      category: "interactive",
      status: "fail",
      message: "Input field preparation failed",
      details: { error: (error as Error).message },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  }
}

export async function testInputFieldAccessibility(ctx: TestContext): Promise<ProviderTestResult> {
  const start = Date.now();
  try {
    const selector = ctx.config.selectors.inputField;
    const script =
      "(function() {" +
      "  try {" +
      "    const input = document.querySelector(" +
      JSON.stringify(selector) +
      ");" +
      "    if (!input) return { exists: false };" +
      "    const rect = input.getBoundingClientRect();" +
      "    const styles = window.getComputedStyle(input);" +
      "    return {" +
      "      exists: true," +
      '      visible: styles.display !== "none" && styles.visibility !== "hidden",' +
      "      tagName: input.tagName," +
      '      type: input.type || "contenteditable",' +
      '      disabled: input.disabled || input.getAttribute("aria-disabled") === "true",' +
      '      placeholder: input.placeholder || input.getAttribute("placeholder"),' +
      "      width: rect.width," +
      "      height: rect.height" +
      "    };" +
      "  } catch (err) {" +
      "    return { exists: false, error: err.message };" +
      "  }" +
      "})()";

    const result = (await ctx.executeScript(script)) as ElementCheckResult;

    if (!result.exists) {
      throw new Error(
        formatErrorWithDetail(
          await interactiveT(ctx, "inputFieldAccessibility.notFound"),
          result.error
        )
      );
    }

    if (!result.visible) {
      throw new Error(await interactiveT(ctx, "inputFieldAccessibility.notVisible"));
    }

    return {
      id: "input-field-accessibility",
      name: await interactiveT(ctx, "inputFieldAccessibility.name"),
      category: "interactive",
      status: "pass",
      message: await interactiveT(ctx, "inputFieldAccessibility.accessible"),
      details: {
        selector: ctx.config.selectors.inputField,
        element: result,
      },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      id: "input-field-accessibility",
      name: await interactiveT(ctx, "inputFieldAccessibility.name"),
      category: "interactive",
      status: "fail",
      message: await interactiveT(ctx, "inputFieldAccessibility.failed"),
      details: {
        selector: ctx.config.selectors.inputField,
        error: (error as Error).message,
      },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  }
}

export async function testSendButtonDisabled(ctx: TestContext): Promise<ProviderTestResult> {
  const start = Date.now();
  try {
    const selector = ctx.config.selectors.sendButtonDisabled ?? ctx.config.selectors.sendButton;
    const script = `
      (function() {
        try {
          const btn = document.querySelector(${JSON.stringify(selector)});
          if (!btn) return { exists: false };
          
          return {
            exists: true,
            disabled: btn.disabled || btn.getAttribute('aria-disabled') === 'true' || btn.classList.contains('disabled'),
            tagName: btn.tagName,
            classes: btn.className
          };
        } catch (err) {
          return { exists: false, error: err.message };
        }
      })()
    `;

    const result = (await ctx.executeScript(script)) as ElementCheckResult;

    if (!result.exists) {
      return {
        id: "send-button-disabled",
        name: await interactiveT(ctx, "sendButtonDisabled.name"),
        category: "interactive",
        status: "fail",
        message: await interactiveT(ctx, "sendButtonDisabled.notFound"),
        details: { selector: ctx.config.selectors.sendButton },
        duration: Date.now() - start,
        timestamp: Date.now(),
      };
    }

    if (result.disabled === true) {
      return {
        id: "send-button-disabled",
        name: await interactiveT(ctx, "sendButtonDisabled.name"),
        category: "interactive",
        status: "pass",
        message: await interactiveT(ctx, "sendButtonDisabled.disabledAsExpected"),
        details: { selector: ctx.config.selectors.sendButton, element: result },
        duration: Date.now() - start,
        timestamp: Date.now(),
      };
    } else {
      return {
        id: "send-button-disabled",
        name: await interactiveT(ctx, "sendButtonDisabled.name"),
        category: "interactive",
        status: "warning",
        message: await interactiveT(ctx, "sendButtonDisabled.enabledUnexpectedly"),
        details: { selector: ctx.config.selectors.sendButton, element: result },
        duration: Date.now() - start,
        timestamp: Date.now(),
      };
    }
  } catch (error) {
    return {
      id: "send-button-disabled",
      name: await interactiveT(ctx, "sendButtonDisabled.name"),
      category: "interactive",
      status: "fail",
      message: await interactiveT(ctx, "sendButtonDisabled.scriptFailed"),
      details: { error: (error as Error).message },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  }
}

export async function testMicrophoneButton(ctx: TestContext): Promise<ProviderTestResult> {
  const selectorsWithMic = ctx.config.selectors as { microphoneButton?: string };
  if (selectorsWithMic.microphoneButton === undefined || selectorsWithMic.microphoneButton === "") {
    return {
      id: "microphone-button",
      name: await interactiveT(ctx, "microphoneButton.name"),
      category: "interactive",
      status: "skip",
      message: await interactiveT(ctx, "microphoneButton.selectorMissing"),
      duration: 0,
      timestamp: Date.now(),
    };
  }

  return await ctx.testSelector({
    id: "microphone-button",
    name: await interactiveT(ctx, "microphoneButton.name"),
    selector: selectorsWithMic.microphoneButton,
    category: "interactive",
    checks: ["exists", "visible"],
  });
}

export async function testTextInjection(
  ctx: TestContext,
  message: string = PROVIDER_TEST.TEST_MESSAGE
): Promise<ProviderTestResult> {
  const start = Date.now();
  try {
    const safeMessage = JSON.stringify(message);
    const selectorEntry =
      ctx.config.selectorMatrix?.selectors?.["inputField"] ?? ctx.config.selectors.inputField;
    const selectorCandidates = resolveSelectorCandidates(selectorEntry, ctx.appLanguage);
    const candidates =
      selectorCandidates.length > 0 ? selectorCandidates : [ctx.config.selectors.inputField];
    const injectedProviderConfig = {
      id: ctx.config.id,
      inputType: ctx.config.inputType,
      selectors: {
        inputField: ctx.config.selectors.inputField,
      },
    };

    const injectScript = `(function() {
      try {
        const message = ${safeMessage};
        const inputSelectorCandidates = ${JSON.stringify(candidates)};
        const fallbackConfig = ${JSON.stringify(injectedProviderConfig)};
        const config =
          window.__app_provider_config && window.__app_provider_config.selectors
            ? window.__app_provider_config
            : fallbackConfig;

        if (!window.__app_provider_config || !window.__app_provider_config.selectors) {
          window.__app_provider_config = config;
        }

        const resolveInput = () => {
          for (const selector of inputSelectorCandidates) {
            try {
              const found = document.querySelector(selector);
              if (found) {
                return { element: found, selector };
              }
            } catch (_) {
              void 0;
            }
          }
          return null;
        };

        const resolvedInput = resolveInput();
        if (!resolvedInput) {
          return {
            success: false,
            error:
              ${JSON.stringify(await interactiveT(ctx, "textInjection.inputElementMissingPrefix"))} +
              inputSelectorCandidates.join(', '),
          };
        }

        const textarea = resolvedInput.element;
        const readValue = () => {
          if (typeof textarea.value === 'string') return textarea.value;
          return textarea.textContent || textarea.innerText || '';
        };
        const inputType = config.inputType || 'direct';

        if (inputType === 'character-by-character') {
          textarea.focus();
          if (typeof textarea.value === 'string') {
            const nativeSetter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype,
              'value'
            )?.set;
            if (nativeSetter) {
              nativeSetter.call(textarea, '');
            } else {
              textarea.value = '';
            }
          }
          if (typeof textarea.textContent === 'string') {
            textarea.textContent = '';
          }

          let currentValue = '';
          for (let i = 0; i < message.length; i += 1) {
            currentValue += message[i] ?? '';
            if (typeof textarea.value === 'string') {
              const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype,
                'value'
              )?.set;
              if (nativeSetter) {
                nativeSetter.call(textarea, currentValue);
              } else {
                textarea.value = currentValue;
              }
            } else {
              textarea.textContent = currentValue;
            }
            textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          }

          textarea.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          return {
            success: true,
            matchedSelector: resolvedInput.selector,
            value: readValue(),
          };
        }

        const isEditable =
          textarea.classList.contains('ProseMirror') ||
          textarea.id === 'prompt-textarea' ||
          textarea.contentEditable === 'true' ||
          textarea.isContentEditable;

        textarea.focus();

        if (isEditable) {
          let inserted = false;
          try {
            inserted = document.execCommand('insertText', false, message);
          } catch (_) {
            inserted = false;
          }

          if (!inserted) {
            const lines = message.split('\\n');
            const html = lines
              .map((line) => {
                if (line.trim() === '') return '<p><br class="ProseMirror-trailingBreak"></p>';
                const escaped = line
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;');
                return '<p>' + escaped + '</p>';
              })
              .join('');
            textarea.innerHTML = html;
          }

          if (typeof InputEvent === 'function') {
            textarea.dispatchEvent(
              new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                data: message,
                inputType: 'insertText',
              })
            );
          } else {
            textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          }

          return {
            success: true,
            matchedSelector: resolvedInput.selector,
            value: readValue(),
          };
        }

        if (typeof textarea.value === 'string') {
          const nativeSetter = Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(textarea),
            'value'
          )?.set;
          if (nativeSetter) {
            nativeSetter.call(textarea, '');
            nativeSetter.call(textarea, message);
          } else {
            textarea.value = '';
            textarea.value = message;
          }
        } else {
          textarea.textContent = message;
        }

        textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

        return {
          success: true,
          matchedSelector: resolvedInput.selector,
          value: readValue(),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })();`;

    const result = (await ctx.executeScript(injectScript)) as {
      success?: boolean;
      error?: string;
      matchedSelector?: string;
      value?: string;
    };

    if (result.success === true && result.value === message) {
      return {
        id: "text-injection",
        name: await interactiveT(ctx, "textInjection.name"),
        category: "interactive",
        status: "pass",
        message: await interactiveT(ctx, "textInjection.injected"),
        details: {
          selector: result.matchedSelector ?? ctx.config.selectors.inputField,
        },
        duration: Date.now() - start,
        timestamp: Date.now(),
      };
    }

    if (result.success !== true) {
      throw new Error(
        result.error ?? (await interactiveT(ctx, "textInjection.providerConfigMissing"))
      );
    }

    throw new Error(
      await interactiveT(ctx, "textInjection.mismatch", {
        expected: message,
        actual: result.value ?? "",
      })
    );
  } catch (error) {
    return {
      id: "text-injection",
      name: await interactiveT(ctx, "textInjection.name"),
      category: "interactive",
      status: "fail",
      message: await interactiveT(ctx, "textInjection.failed"),
      details: { error: (error as Error).message },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  }
}

export async function testSendButtonEnabled(ctx: TestContext): Promise<ProviderTestResult> {
  await new Promise((resolve) =>
    setTimeout(resolve, PROVIDER_TEST_DELAYS.SEND_BUTTON_ENABLED_SETTLE)
  );

  const selectorEntry =
    ctx.config.selectorMatrix?.selectors?.["sendButton"] ?? ctx.config.selectors.sendButton;
  const selectorCandidates = resolveSelectorCandidates(selectorEntry, ctx.appLanguage);

  return await ctx.testSelector({
    id: "send-button-enabled",
    name: await interactiveT(ctx, "sendButtonEnabled.name"),
    selector: ctx.config.selectors.sendButton,
    selectorCandidates,
    category: "interactive",
    checks: ["exists", "visible", "enabled"],
    evidence: {
      group: "selectors",
      key: "sendButton",
      selector: ctx.config.selectors.sendButton,
      promotable: true,
    },
  });
}

export async function testFileUpload(ctx: TestContext): Promise<ProviderTestResult> {
  const start = Date.now();

  if (ctx.config.fileInputSelectors.length === 0) {
    return {
      id: "file-upload",
      name: await interactiveT(ctx, "fileUpload.name"),
      category: "interactive",
      status: "skip",
      message: await interactiveT(ctx, "fileUpload.selectorMissing"),
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
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
        id: "file-upload",
        name: await interactiveT(ctx, "fileUpload.name"),
        category: "interactive",
        status: "pass",
        message: await interactiveT(ctx, "fileUpload.found"),
        details: { selector: found.selector },
        duration: Date.now() - start,
        timestamp: Date.now(),
      };
    }

    return {
      id: "file-upload",
      name: await interactiveT(ctx, "fileUpload.name"),
      category: "interactive",
      status: "fail",
      message: await interactiveT(ctx, "fileUpload.notFound"),
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      id: "file-upload",
      name: await interactiveT(ctx, "fileUpload.name"),
      category: "interactive",
      status: "fail",
      message: await interactiveT(ctx, "fileUpload.failed"),
      details: { error: (error as Error).message },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  }
}

export async function testSendMessage(ctx: TestContext): Promise<ProviderTestResult> {
  const start = Date.now();
  try {
    const clicked = await ctx.clickElement(ctx.config.selectors.sendButton);
    if (!clicked) throw new Error(await interactiveT(ctx, "sendMessage.clickFailed"));

    const selector = ctx.config.selectors.inputField;
    const cleared = await ctx.waitForCondition(async (): Promise<boolean> => {
      const isEmpty = (await ctx.executeScript(
        "(function() {" +
          "  const input = document.querySelector(" +
          JSON.stringify(selector) +
          ");" +
          "  if (!input) return false;" +
          '  const value = input.value || input.textContent || "";' +
          '  return value.trim() === "";' +
          "})()"
      )) as boolean;
      return Boolean(isEmpty);
    }, PROVIDER_TEST.TIMEOUT_INPUT_CLEAR);

    if (!cleared) throw new Error(await interactiveT(ctx, "sendMessage.inputNotCleared"));

    return {
      id: "send-message",
      name: await interactiveT(ctx, "sendMessage.name"),
      category: "interactive",
      status: "pass",
      message: await interactiveT(ctx, "sendMessage.sent"),
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      id: "send-message",
      name: await interactiveT(ctx, "sendMessage.name"),
      category: "interactive",
      status: "fail",
      message: await interactiveT(ctx, "sendMessage.failed"),
      details: { error: (error as Error).message },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  }
}

export async function testStopButtonWhileThinking(ctx: TestContext): Promise<ProviderTestResult> {
  const start = Date.now();

  try {
    if (ctx.config.selectors.stopButton === "") {
      return {
        id: "stop-button-thinking",
        name: await interactiveT(ctx, "stopButtonThinking.name"),
        category: "interactive",
        status: "skip",
        message: await interactiveT(ctx, "stopButtonThinking.selectorMissing"),
        duration: Date.now() - start,
        timestamp: Date.now(),
      };
    }

    const selector = ctx.config.selectors.stopButton;
    let lastResult: ElementCheckResult = {
      exists: false,
      visible: false,
      enabled: false,
      tagName: "UNKNOWN",
    };
    const script = `
      (function() {
        const stopBtn = document.querySelector(${JSON.stringify(selector)});
        if (!stopBtn) return { exists: false };
        
        const styles = window.getComputedStyle(stopBtn);
        return {
          exists: true,
          visible: styles.display !== 'none' && styles.visibility !== 'hidden',
          disabled: stopBtn.disabled || false,
          tagName: stopBtn.tagName
        };
      })()
    `;

    const visible = await ctx.waitForCondition(
      async () => {
        const result = (await ctx.executeScript(script)) as ElementCheckResult;
        lastResult = result;
        return result.exists === true && result.visible === true;
      },
      Math.max(PROVIDER_TEST.TIMEOUT_STOP_BUTTON, PROVIDER_TEST_DELAYS.STOP_BUTTON_THINKING_OBSERVE)
    );

    if (visible) {
      return {
        id: "stop-button-thinking",
        name: await interactiveT(ctx, "stopButtonThinking.name"),
        category: "interactive",
        status: "pass",
        message: await interactiveT(ctx, "stopButtonThinking.visible"),
        details: { selector: ctx.config.selectors.stopButton, element: lastResult },
        duration: Date.now() - start,
        timestamp: Date.now(),
      };
    } else {
      return {
        id: "stop-button-thinking",
        name: await interactiveT(ctx, "stopButtonThinking.name"),
        category: "interactive",
        status: "warning",
        message: await interactiveT(ctx, "stopButtonThinking.notVisible"),
        details: { selector: ctx.config.selectors.stopButton, element: lastResult },
        duration: Date.now() - start,
        timestamp: Date.now(),
      };
    }
  } catch (error) {
    return {
      id: "stop-button-thinking",
      name: await interactiveT(ctx, "stopButtonThinking.name"),
      category: "interactive",
      status: "fail",
      message: await interactiveT(ctx, "stopButtonThinking.failed"),
      details: { error: (error as Error).message },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  }
}

export async function testUserMessageInspect(
  ctx: TestContext,
  expectedMessage: string = PROVIDER_TEST.TEST_MESSAGE
): Promise<ProviderTestResult> {
  const start = Date.now();
  try {
    const selector = ctx.config.scrapeSelectors.userWrapper ?? ctx.config.scrapeSelectors.preferred;
    const script = `
      (function() {
        const userSelector = ${JSON.stringify(selector)};
        const messages = Array.from(document.querySelectorAll(userSelector));
        const lastMessage = messages[messages.length - 1];
        
        if (!lastMessage) return { found: false };
        
        const rect = lastMessage.getBoundingClientRect();
        const styles = window.getComputedStyle(lastMessage);
        const text = lastMessage.textContent || lastMessage.innerText || '';
        
        return {
          found: true,
          tagName: lastMessage.tagName,
          classes: lastMessage.className,
          textContent: text.trim(),
          visible: styles.display !== 'none' && styles.visibility !== 'hidden',
          width: rect.width,
          height: rect.height,
          backgroundColor: styles.backgroundColor,
          color: styles.color
        };
      })()
    `;

    let result = (await ctx.executeScript(script)) as {
      found: boolean;
      textContent?: string;
      visible: boolean;
      enabled: boolean;
      tagName: string;
    };
    const expectedText = normalizeComparableText(expectedMessage);

    const matched = await ctx.waitForCondition(async () => {
      result = (await ctx.executeScript(script)) as {
        found: boolean;
        textContent?: string;
        visible: boolean;
        enabled: boolean;
        tagName: string;
      };

      if (result.found !== true) {
        return false;
      }

      const actualText = normalizeComparableText(result.textContent ?? "");
      return actualText.includes(expectedText);
    }, PROVIDER_TEST.TIMEOUT_RESPONSE_WAIT);

    if (matched) {
      return {
        id: "user-message-inspect",
        name: await interactiveT(ctx, "userMessageInspect.name"),
        category: "scraping",
        status: "pass",
        message: await interactiveT(ctx, "userMessageInspect.found"),
        details: {
          ...(ctx.config.scrapeSelectors.userWrapper !== undefined &&
          ctx.config.scrapeSelectors.userWrapper !== ""
            ? { selector: ctx.config.scrapeSelectors.userWrapper }
            : {}),
          element: result,
        },
        duration: Date.now() - start,
        timestamp: Date.now(),
      };
    }

    throw new Error(await interactiveT(ctx, "userMessageInspect.notFoundOrMismatch"));
  } catch (error) {
    return {
      id: "user-message-inspect",
      name: await interactiveT(ctx, "userMessageInspect.name"),
      category: "scraping",
      status: "fail",
      message: await interactiveT(ctx, "userMessageInspect.failed"),
      details: { error: (error as Error).message },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  }
}

export async function testAIResponseInspect(ctx: TestContext): Promise<ProviderTestResult> {
  const start = Date.now();
  try {
    const selector =
      ctx.config.scrapeSelectors.assistantWrapper ?? ctx.config.scrapeSelectors.preferred;

    const hasResponse = await ctx.waitForCondition(async () => {
      const count = (await ctx.executeScript(`
        (function() {
          const selector = ${JSON.stringify(selector)};
          return document.querySelectorAll(selector).length;
        })()
      `)) as number;
      return count > 0;
    }, PROVIDER_TEST.TIMEOUT_RESPONSE_WAIT);

    if (!hasResponse) {
      throw new Error(await interactiveT(ctx, "aiResponseInspect.noResponse"));
    }

    const script = `
      (function() {
        const assistantSelector = ${JSON.stringify(selector)};
        const messages = Array.from(document.querySelectorAll(assistantSelector));
        const lastMessage = messages[messages.length - 1];
        
        if (!lastMessage) return { found: false };
        
        const rect = lastMessage.getBoundingClientRect();
        const styles = window.getComputedStyle(lastMessage);
        const text = lastMessage.textContent || lastMessage.innerText || '';
        
        return {
          found: true,
          tagName: lastMessage.tagName,
          classes: lastMessage.className,
          textContent: text.trim().slice(0, 100),
          visible: styles.display !== 'none' && styles.visibility !== 'hidden',
          width: rect.width,
          height: rect.height,
          backgroundColor: styles.backgroundColor,
          color: styles.color
        };
      })()
    `;

    const result = (await ctx.executeScript(script)) as {
      found: boolean;
      tagName: string;
      visible: boolean;
      enabled: boolean;
      textContent?: string;
    };

    if (result.found === true && result.textContent !== undefined && result.textContent !== "") {
      return {
        id: "ai-response-inspect",
        name: await interactiveT(ctx, "aiResponseInspect.name"),
        category: "scraping",
        status: "pass",
        message: await interactiveT(ctx, "aiResponseInspect.found"),
        details: {
          ...(ctx.config.scrapeSelectors.assistantWrapper !== undefined &&
          ctx.config.scrapeSelectors.assistantWrapper !== ""
            ? { selector: ctx.config.scrapeSelectors.assistantWrapper }
            : {}),
          element: result,
        },
        duration: Date.now() - start,
        timestamp: Date.now(),
      };
    }

    throw new Error(await interactiveT(ctx, "aiResponseInspect.notFound"));
  } catch (error) {
    return {
      id: "ai-response-inspect",
      name: await interactiveT(ctx, "aiResponseInspect.name"),
      category: "scraping",
      status: "fail",
      message: await interactiveT(ctx, "aiResponseInspect.failed"),
      details: { error: (error as Error).message },
      duration: Date.now() - start,
      timestamp: Date.now(),
    };
  }
}

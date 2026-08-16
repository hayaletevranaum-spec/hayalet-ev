import {
  getRuntimeProviderConfig,
  getRuntimeSelectorCandidates,
} from "../shared/runtime-selectors.js";
import { AppI18n } from "../../../i18n/index.js";

interface WebviewElement extends HTMLElement {
  executeJavaScript: (code: string) => Promise<unknown>;
  sendInputEvent: (event: { type: string; keyCode: string }) => void;
}

function composerT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.messageComposer.${key}`, params);
}

export async function sendMessage(
  webview: WebviewElement,
  { message }: { message: string }
): Promise<{ success: boolean; message: string }> {
  const fullText = ` ${message}`;
  const runtimeConfig = await getRuntimeProviderConfig(webview);
  const inputCandidates = getRuntimeSelectorCandidates(runtimeConfig, "inputField");

  const focusScript = `(function() {
    const inputSelectorCandidates = ${JSON.stringify(inputCandidates)};
    if (!inputSelectorCandidates.length) {
      return false;
    }

    let textarea = null;
    for (const selector of inputSelectorCandidates) {
      try {
        textarea = document.querySelector(selector);
        if (textarea) {
          break;
        }
      } catch (_) {
        void 0;
      }
    }
    if (textarea) {
      textarea.focus();
      if (typeof textarea.value !== 'undefined') textarea.value = '';
      if (typeof textarea.textContent !== 'undefined') textarea.textContent = '';
      return true;
    }
    return false;
  })();`;

  const focused = await webview.executeJavaScript(focusScript);
  if (focused !== true) {
    return { success: false, message: composerT("textareaMissing") };
  }

  try {
    for (const ch of fullText) {
      webview.sendInputEvent({ type: "char", keyCode: ch });
    }
  } catch (err) {
    return {
      success: false,
      message: composerT("writeFailed", {
        message: err instanceof Error ? err.message : String(err),
      }),
    };
  }

  return {
    success: true,
    message: composerT("characterByCharacterWritten"),
  };
}

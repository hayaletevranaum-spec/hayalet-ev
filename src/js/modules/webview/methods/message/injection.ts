import {
  getRuntimeProviderConfig,
  getRuntimeSelectorCandidates,
} from "../shared/runtime-selectors.js";
import { AppI18n } from "../../../i18n/index.js";

interface InjectResult {
  success?: boolean;
  message?: string;
  inputType?: string;
  providerId?: string;
  inserted?: boolean;
}

interface WebviewElement extends HTMLElement {
  executeJavaScript: (code: string) => Promise<InjectResult | undefined>;
  sendInputEvent: (event: { type: string; keyCode: string }) => void;
}

function composerT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.messageComposer.${key}`, params);
}

export async function sendMessage(
  webview: WebviewElement,
  { message }: { message: string }
): Promise<{ success: boolean; message: string }> {
  const safeMessage = JSON.stringify(message);
  const runtimeConfig = await getRuntimeProviderConfig(webview);
  const inputCandidates = getRuntimeSelectorCandidates(runtimeConfig, "inputField");
  const inputCandidatesLiteral = JSON.stringify(inputCandidates);
  const localizedMessages = JSON.stringify({
    providerConfigMissing: composerT("providerConfigMissing"),
    inputSelectorMissing: composerT("inputSelectorMissing"),
    focusPrepared: composerT("focusPrepared"),
    contentEditableWritten: composerT("contentEditableWritten"),
    textareaWritten: composerT("textareaWritten"),
  });

  const injectScript = `(function() {
    const message = ${safeMessage};
    const inputSelectorCandidates = ${inputCandidatesLiteral};
    const localizedMessages = ${localizedMessages};

    const config = window.__app_provider_config;
    if (!config || !config.selectors) {
      return { success: false, message: localizedMessages.providerConfigMissing };
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
      return { success: false, message: localizedMessages.inputSelectorMissing };
    }

    const textarea = resolvedInput.element;

    const inputType = config.inputType || 'direct';

    if (inputType === 'character-by-character') {
      textarea.focus();
      if (typeof textarea.value !== 'undefined') textarea.value = '';
      if (typeof textarea.textContent !== 'undefined') textarea.textContent = '';
      return {
        success: true,
        message: localizedMessages.focusPrepared,
        providerId: config.id,
        inputType: inputType
      };
    }

    const isProseMirror = textarea.classList.contains('ProseMirror') || 
                          !!textarea.querySelector('.ProseMirror') ||
                          !!textarea.querySelector('[class*="ProseMirror"]') ||
                          textarea.id === 'prompt-textarea';

    if (isProseMirror || textarea.contentEditable === 'true' || textarea.isContentEditable) {
      textarea.focus();
      
      textarea.innerHTML = '';
      
      const lines = message.split('\\n');
      const html = lines.map(line => {
        if (line.trim() === '') {
          return '<p><br></p>';
        }
        const escaped = line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return '<p>' + escaped + '</p>';
      }).join('');
      
      textarea.innerHTML = html;
      textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      
      return {
        success: true,
        message: localizedMessages.contentEditableWritten,
        providerId: config.id,
        inputType: inputType,
        isProseMirror: isProseMirror
      };
    }

    textarea.focus();
    
    textarea.value = '';
    
    textarea.value = message;

    textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

    return {
      success: true,
      message: localizedMessages.textareaWritten,
      providerId: config.id,
      inputType: inputType
    };
  })();`;

  const result = await webview.executeJavaScript(injectScript);
  if (result?.success !== true) {
    return { success: false, message: result?.message ?? composerT("inputWriteFailed") };
  }

  if (result.inputType === "character-by-character") {
    const fullText = ` ${message}`;
    try {
      const seedChar = fullText[0] ?? "";
      if (seedChar !== "") {
        if (seedChar === "\n") {
          await webview.executeJavaScript(`(function() {
            const inputSelectorCandidates = ${inputCandidatesLiteral};
            let el = document.activeElement;
            for (const selector of inputSelectorCandidates) {
              try {
                const found = document.querySelector(selector);
                if (found) {
                  el = found;
                  break;
                }
              } catch (_) {
                void 0;
              }
            }
            if (!el) return;
            const keydownEvent = new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              shiftKey: true,
              bubbles: true,
              cancelable: true
            });
            el.dispatchEvent(keydownEvent);
            const keyupEvent = new KeyboardEvent('keyup', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              shiftKey: true,
              bubbles: true,
              cancelable: true
            });
            el.dispatchEvent(keyupEvent);
          })();`);
        } else {
          webview.sendInputEvent({ type: "char", keyCode: seedChar });
        }
      }

      const remainingText = fullText.slice(1);
      let insertedFast = false;

      if (remainingText.length > 0) {
        const safeRemaining = JSON.stringify(remainingText);
        const bulkResult = await webview.executeJavaScript(`(function() {
          try {
            const inputSelectorCandidates = ${inputCandidatesLiteral};
            const text = ${safeRemaining};
            let el = document.activeElement;
            for (const selector of inputSelectorCandidates) {
              try {
                const found = document.querySelector(selector);
                if (found) {
                  el = found;
                  break;
                }
              } catch (_) {
                void 0;
              }
            }
            if (!el || !text) return { success: false, inserted: false };

            const editableTarget =
              (el.matches?.('[contenteditable="true"]') ? el : null) ||
              el.querySelector?.('.ProseMirror[contenteditable="true"], [contenteditable="true"]') ||
              null;

            if (editableTarget) {
              editableTarget.focus();
              let inserted = false;
              try {
                inserted = document.execCommand('insertText', false, text);
              } catch (_) {
                inserted = false;
              }

              if (!inserted) {
                const lines = text.split('\\n');
                const frag = document.createDocumentFragment();
                for (let i = 0; i < lines.length; i += 1) {
                  frag.appendChild(document.createTextNode(lines[i] || ''));
                  if (i < lines.length - 1) frag.appendChild(document.createElement('br'));
                }
                editableTarget.appendChild(frag);
              }

              editableTarget.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
              return { success: true, inserted: true };
            }

            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
              const valueSetter = Object.getOwnPropertyDescriptor(
                Object.getPrototypeOf(el),
                'value'
              )?.set;
              const nextValue = String(el.value ?? '') + text;
              if (valueSetter) {
                valueSetter.call(el, nextValue);
              } else {
                el.value = nextValue;
              }
              el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              return { success: true, inserted: true };
            }

            return { success: false, inserted: false };
          } catch (_) {
            return { success: false, inserted: false };
          }
        })();`);
        insertedFast = bulkResult?.success === true && bulkResult.inserted !== false;
      }

      if (insertedFast) {
        return {
          success: true,
          message: composerT("fastInsertWritten"),
        };
      }

      const writeChar = async (index: number): Promise<void> => {
        if (index >= fullText.length) return;
        const ch = fullText[index] ?? "";
        if (ch === "\n") {
          await webview.executeJavaScript(`(function() {
            const inputSelectorCandidates = ${inputCandidatesLiteral};
            let el = document.activeElement;
            for (const selector of inputSelectorCandidates) {
              try {
                const found = document.querySelector(selector);
                if (found) {
                  el = found;
                  break;
                }
              } catch (_) {
                void 0;
              }
            }
            if (!el) return;
            
            const keydownEvent = new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              shiftKey: true,
              bubbles: true,
              cancelable: true
            });
            el.dispatchEvent(keydownEvent);
            
            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
              const start = el.selectionStart || el.value.length;
              const end = el.selectionEnd || el.value.length;
              el.value = el.value.substring(0, start) + '\\n' + el.value.substring(end);
              el.selectionStart = el.selectionEnd = start + 1;
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
            
            const keyupEvent = new KeyboardEvent('keyup', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              shiftKey: true,
              bubbles: true,
              cancelable: true
            });
            el.dispatchEvent(keyupEvent);
          })();`);
        } else {
          webview.sendInputEvent({ type: "char", keyCode: ch });
        }
        await writeChar(index + 1);
      };
      await writeChar(1);
    } catch (err) {
      return {
        success: false,
        message: composerT("writeFailed", {
          message: err instanceof Error ? err.message : String(err),
        }),
      };
    }
  }

  return {
    success: true,
    message: composerT("textareaWritten"),
  };
}

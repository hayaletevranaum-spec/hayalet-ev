import { AppI18n } from "../../../i18n/index.js";
import { waitForDomReady } from "../shared/file-utils.js";
import { validateFiles, createErrorResponse } from "../shared/file-utils.js";
import {
  getRuntimeConfigCandidates,
  getRuntimeProviderConfig,
  getRuntimeSelectorCandidates,
} from "../shared/runtime-selectors.js";

interface FilePayload {
  name: string;
  path?: string;
  base64?: string;
  mimeType?: string;
}

function uploadT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.upload.${key}`, params);
}

export async function attachFiles(
  webview: HTMLElement,
  { files }: { files: FilePayload[] }
): Promise<{
  success: boolean;
  message: string;
  count?: number;
  errors?: unknown[];
  injected?: boolean;
}> {
  await waitForDomReady(webview);

  const validation = validateFiles(files);
  if (!validation.valid) {
    return createErrorResponse(validation.message ?? uploadT("validationFailed"));
  }

  const emptyFilesMessage = JSON.stringify(uploadT("noFiles"));
  const dropTargetNotFoundMessage = JSON.stringify(uploadT("dropTargetNotFound"));
  const dragDropSuccessMessage = JSON.stringify(uploadT("dragDropSuccess"));
  const dragDropAttemptedMessage = uploadT("dragDropAttempted");
  const querySelectorFailedMessage = JSON.stringify(uploadT("querySelectorFailed"));
  const shadowQueryFailedMessage = JSON.stringify(uploadT("shadowQueryFailed"));
  const targetResolutionFailedMessage = JSON.stringify(uploadT("targetResolutionFailed"));
  const boundsReadFailedMessage = JSON.stringify(uploadT("boundsReadFailed"));
  const dataTransferConfigFailedMessage = JSON.stringify(uploadT("dataTransferConfigFailed"));
  const dragEnterDispatchFailedMessage = JSON.stringify(uploadT("dragEnterDispatchFailed"));
  const dragOverDispatchFailedMessage = JSON.stringify(uploadT("dragOverDispatchFailed"));
  const dropDispatchFailedMessage = JSON.stringify(uploadT("dropDispatchFailed"));
  const filesPayload = JSON.stringify(files);
  const runtimeConfig = await getRuntimeProviderConfig(webview);
  const uploadTargetCandidates = getRuntimeConfigCandidates(
    runtimeConfig?.uploadTargetSelectors ??
      runtimeConfig?.selectors?.["inputField"] ?? ["textarea", "form"]
  );
  const previewCandidates = getRuntimeSelectorCandidates(runtimeConfig, "filePreview");
  const dropScript = `(async function() {
    const files = ${filesPayload};
    const uploadTargetCandidates = ${JSON.stringify(uploadTargetCandidates)};
    const previewSelectorCandidates = ${JSON.stringify(previewCandidates)};
    if (!files.length) {
      return { success: false, message: ${emptyFilesMessage} };
    }

    function base64ToUint8(base64) {
      const binary = atob(base64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }

    const dataTransfer = new DataTransfer();
    files.forEach((file) => {
      const bytes = base64ToUint8(file.base64);
      const f = new File([bytes], file.name, { type: file.mimeType ?? 'application/octet-stream' });
      dataTransfer.items.add(f);
    });

    const cleanupDragOverlay = () => {
      const config = window.__app_provider_config;
      
      let overlaySelectors = [
        '[data-dnd-overlay]',
        '[data-testid*="drop"]',
        '[data-testid*="drag"]',
        '.drag-overlay',
        '.drag-drop-overlay',
        '.file-drop-target',
        '.dnd-active-overlay'
      ];
      
      if (
        Array.isArray(config?.filters?.dragOverlaySelectors) &&
        config.filters.dragOverlaySelectors.length
      ) {
        overlaySelectors = config.filters.dragOverlaySelectors;
      }

      let criticalSelectors = [
        'textarea',
        'input[type="text"]',
        'input[type="search"]',
        '[contenteditable="true"]',
        '[data-message-author-role]'
      ];
      
      if (config?.criticalSelectors) {
        criticalSelectors = config.criticalSelectors;
      }

      const isCritical = (node) => {
        if (!node) return false;
        if (node === document.body || node === document.documentElement) return true;
        return criticalSelectors.some((sel) => {
          try { 
            return node.matches?.(sel) || !!node.querySelector?.(sel); 
          } catch (_) { 
            return false; 
          }
        });
      };

      overlaySelectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((overlay) => {
          if (isCritical(overlay)) return;
          
          const rect = overlay.getBoundingClientRect();
          const style = getComputedStyle(overlay);
          const isLarge = rect.width >= window.innerWidth * 0.25 && rect.height >= window.innerHeight * 0.25;
          const isFloating = style.position === 'fixed' || style.position === 'absolute';
          
          if (isLarge && isFloating) {
            const textContent = overlay.textContent?.toLowerCase() ?? '';
            let containsDragText = false;
            
            let textMatchers = ['sürükleyin', 'drop', 'dosya', 'file'];
            if (config?.filters?.dragTextMatchers) {
              textMatchers = config.filters.dragTextMatchers;
            }
            
            for (const matcher of textMatchers) {
              if (textContent.includes(matcher.toLowerCase())) {
                containsDragText = true;
                break;
              }
            }
            
              if (containsDragText) {
                try {
                  overlay.remove();
                } catch (_) {
                  // NOTE: Keep inline as a last-resort hide for third-party overlays.
                  overlay.style.display = 'none';
                }
              }
          }
        });
      });
    };

    cleanupDragOverlay();

    const config = window.__app_provider_config;

    function querySelectorDeep(selector) {
      try {
        const direct = document.querySelector(selector);
        if (direct) return direct;
      } catch (err) {
        console.warn(${querySelectorFailedMessage}, err);
      }

      const all = Array.from(document.querySelectorAll("*"));
      for (const el of all) {
        const sr = el.shadowRoot;
        if (!sr) continue;
        try {
          const found = sr.querySelector(selector);
          if (found) return found;
        } catch (err) {
          console.warn(${shadowQueryFailedMessage}, err);
        }
      }
      return null;
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    let target = null;
    for (let attempt = 0; attempt < 8 && !target; attempt++) {
      for (const selector of uploadTargetCandidates) {
        try {
          const el = querySelectorDeep(selector);
          if (el) {
            target = el;
            break;
          }
        } catch (err) {
          console.warn(${targetResolutionFailedMessage}, err);
        }
      }
      if (!target) {
        await sleep(120);
      }
    }

    if (!target) {
      target = document.body;
    }

    if (!target) {
      return { success: false, message: ${dropTargetNotFoundMessage} };
    }

    let cx = 10;
    let cy = 10;
    try {
      const rect = target?.getBoundingClientRect?.();
      if (rect) {
        cx = Math.round(rect.left + rect.width / 2);
        cy = Math.round(rect.top + rect.height / 2);
      }
    } catch (err) {
      console.warn(${boundsReadFailedMessage}, err);
    }

    try {
      dataTransfer.dropEffect = 'copy';
      dataTransfer.effectAllowed = 'all';
    } catch (err) {
      console.warn(${dataTransferConfigFailedMessage}, err);
    }

    const dragEnterEvent = new DragEvent('dragenter', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: cx,
      clientY: cy,
      dataTransfer: dataTransfer
    });

    const dragOverEvent = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: cx,
      clientY: cy,
      dataTransfer: dataTransfer
    });

    const dropEvent = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: cx,
      clientY: cy,
      dataTransfer: dataTransfer
    });

    const dropTarget = target ?? document.body;

    return new Promise((resolve) => {
      try { dropTarget.dispatchEvent(dragEnterEvent); } catch (err) {
        console.warn(${dragEnterDispatchFailedMessage}, err);
      }

      setTimeout(() => {
        try { dropTarget.dispatchEvent(dragOverEvent); } catch (err) {
          console.warn(${dragOverDispatchFailedMessage}, err);
        }
        setTimeout(() => {
          try { dropTarget.dispatchEvent(dropEvent); } catch (err) {
            console.warn(${dropDispatchFailedMessage}, err);
          }

          setTimeout(() => {
            const config = window.__app_provider_config;
            let previewSelectors = [
              'uploader-file-preview',
              '.file-preview-wrapper',
              '[data-test-id="image-preview"]',
              '[data-testid*="attachment"]',
              '[data-testid*="file"]',
              '.attachment-preview',
              '.file-attachment'
            ];

            if (previewSelectorCandidates.length) {
              previewSelectors = previewSelectorCandidates;
            } else if (config?.selectors?.filePreview) {
              previewSelectors = Array.isArray(config.selectors.filePreview)
                ? config.selectors.filePreview
                : [config.selectors.filePreview];
            }

            const hasPreview = previewSelectors.some((sel) => {
              try {
                return !!document.querySelector(sel);
              } catch (_) {
                return false;
              }
            });
            
            const providerName = config?.name ?? config?.id ?? 'Provider';

            resolve({
              success: hasPreview,
              message: hasPreview
                ? ${dragDropSuccessMessage}
                : ${JSON.stringify(uploadT("dragDropPreviewMissing"))}
                    .replace('{{provider}}', providerName),
              count: dataTransfer.files.length,
              target: (target?.tagName ?? 'unknown').toLowerCase() + (target?.id ? '#' + target.id : ''),
            });
          }, 600);
        }, 80);
      }, 80);
    });
  })();`;

  const result = (await webview.executeJavaScript?.(dropScript)) as
    { success?: boolean; message?: string; count?: number } | undefined;
  return {
    success: result?.success === true,
    message: result?.message ?? dragDropAttemptedMessage,
    count: result?.count ?? files.length,
  };
}

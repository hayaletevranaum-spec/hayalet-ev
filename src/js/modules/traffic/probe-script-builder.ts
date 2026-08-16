import { ProviderRegistry } from "../webview/provider-registry.js";
import { AppState } from "../app-state.js";
import { AppI18n } from "../i18n/index.js";
import { Logger } from "../logger/index.js";
import { LogCategory } from "@shared/index.js";
import { SettingsManager } from "../settings-manager.js";
import { resolveSelectorLanguage } from "../../../../shared/i18n/locale.js";
import { resolveSelectorCandidates } from "../../../../shared/provider-selector-resolution";
import type { SelectorLanguage } from "@shared/i18n.js";

function getSelectorLanguage(): SelectorLanguage {
  const settings = SettingsManager.getSnapshot() as { general?: { language?: unknown } } | null;
  return resolveSelectorLanguage(settings?.general?.language);
}

export function buildProbeScript(provider: string): string {
  const providerId = AppState.getProviderIdForSlot(provider) ?? "";
  const cfgRaw = providerId !== "" ? ProviderRegistry.get(providerId) : null;

  if (cfgRaw === null || typeof cfgRaw !== "object") {
    Logger.errorT(
      LogCategory.TRAFFIC,
      "app.logs.traffic.providerConfigMissing",
      { provider },
      {
        provider,
        providerId,
      }
    );
    return `// No config for provider: ${JSON.stringify(providerId)}`;
  }

  const cfg = cfgRaw as {
    selectors?: {
      sendButtonBase?: string;
      sendButton?: string;
      stopButton?: string;
      voiceButton?: string;
    };
    selectorMatrix?: {
      selectors?: Record<string, unknown>;
    };
    scrollerSelectors?: string[];
    contentContainers?: string[];
  };

  const selectors = cfg.selectors ?? {};
  const locale = getSelectorLanguage();
  const probeScrollerQueryFailedMessage = JSON.stringify(
    AppI18n.t("app.logs.traffic.probeScrollerQueryFailed")
  );
  const matrixSelectors = cfg.selectorMatrix?.selectors ?? {};
  const sendSel = resolveSelectorCandidates(
    (matrixSelectors["sendButton"] ?? selectors.sendButtonBase ?? selectors.sendButton ?? "") as
      string | string[] | Record<string, unknown>,
    locale
  );
  const stopSel = resolveSelectorCandidates(selectors.stopButton ?? "", locale);
  const voiceSel = resolveSelectorCandidates(selectors.voiceButton ?? "", locale);
  const scrollerSels = cfg.scrollerSelectors ?? [];
  const contentContainers = cfg.contentContainers ?? ["main", "section", "div", "article"];

  return `(() => {
    try {
      const sendSelectorCandidates = ${JSON.stringify(sendSel)};
      const stopSelectorCandidates = ${JSON.stringify(stopSel)};
      const voiceSelectorCandidates = ${JSON.stringify(voiceSel)};
      const scrollerSelectors = ${JSON.stringify(scrollerSels)};
      const contentContainers = ${JSON.stringify(contentContainers)};
      const now = Date.now();

      const isVisible = (element) => {
        if (!element || typeof getComputedStyle !== 'function') return false;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }
        const rect = element.getBoundingClientRect?.();
        return !rect || rect.width > 0 || rect.height > 0;
      };

      const findFirst = (candidates) => {
        for (const selector of candidates) {
          try {
            const found = document.querySelector(selector);
            if (found && isVisible(found)) return found;
          } catch (_) {
            void 0;
          }
        }
        return null;
      };
      
      const findSendButton = () => {
        return findFirst(sendSelectorCandidates);
      };
      
      const findStopButton = () => {
        return findFirst(stopSelectorCandidates);
      };
      
      const findVoiceButton = () => {
        return findFirst(voiceSelectorCandidates);
      };
      
      const recordSend = () => {
        const slot = window.__codexState ?? (window.__codexState = {});
        slot.lastSend = Date.now();
      };
      
      const slot = window.__codexState ?? (window.__codexState = {});
      if (!slot.lastSend) slot.lastSend = 0;
      
      if (!slot.sendListenersAttached) {
        document.addEventListener('submit', () => recordSend(), true);
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey && (e.target?.tagName === 'TEXTAREA' || e.target?.getAttribute('contenteditable') === 'true')) recordSend();
        }, true);
        document.addEventListener('click', (e) => {
          const selectors = [...sendSelectorCandidates, ...stopSelectorCandidates].filter(Boolean);
          const btn = selectors.some((sel) => e.target?.closest(sel)) || e.target?.closest('button');
          if (btn) recordSend();
        }, true);
        [...sendSelectorCandidates, ...stopSelectorCandidates].filter(Boolean).forEach((sel) => {
          document.addEventListener('mousedown', (ev) => {
            if (ev.target?.closest(sel)) recordSend();
          }, true);
          document.addEventListener('mouseup', (ev) => {
            if (ev.target?.closest(sel)) recordSend();
          }, true);
        });
        slot.sendListenersAttached = true;
      }
      
      const ensureScrollState = () => {
        if (!slot.scrollData) {
          slot.scrollData = { scrollTop: 0, scrollHeight: 0, clientHeight: 0, atBottom: false, lastChange: now };
        }
        return slot.scrollData;
      };
      
      const findChatScroller = () => {
        for (const sel of scrollerSelectors) {
          try {
            const el = document.querySelector(sel);
            if (el) return el;
          } catch (err) {
            console.warn(${probeScrollerQueryFailedMessage}, err);
          }
        }
        return null;
      };
      
      const findFallbackScroller = () => {
        const candidates = [];
        const pushIfScrollable = (el) => {
          if (!el) return;
          const style = getComputedStyle(el);
          if (style.overflowY === 'hidden') return;
          const gap = el.scrollHeight - el.clientHeight;
          if (gap > 8 && el.clientHeight > 120) candidates.push({ el, gap });
        };
        pushIfScrollable(document.scrollingElement);
        pushIfScrollable(document.documentElement);
        pushIfScrollable(document.body);
        for (const tag of contentContainers) {
          try {
            const list = document.querySelectorAll(tag);
            for (let i = 0; i < list.length && i < 250; i += 1) pushIfScrollable(list[i]);
          } catch (_) {}
        }
        candidates.sort((a, b) => b.gap - a.gap);
        return candidates[0]?.el ?? document.scrollingElement ?? document.documentElement ?? document.body;
      };
      
      const scrollData = ensureScrollState();
      let scroller = findChatScroller() ?? slot.scroller ?? findFallbackScroller();
      
      const updateScrollSnapshot = () => {
        if (!scroller || !scrollData) return;
        const top = scroller.scrollTop ?? 0;
        const height = scroller.scrollHeight ?? 0;
        const client = scroller.clientHeight ?? 0;
        const atBottom = height ? Math.abs(height - top - client) < 8 : false;
        if (scrollData.scrollHeight !== height || scrollData.clientHeight !== client || Math.abs(scrollData.scrollTop - top) > 1) {
          scrollData.lastChange = Date.now();
        }
        scrollData.scrollTop = top;
        scrollData.scrollHeight = height;
        scrollData.clientHeight = client;
        scrollData.atBottom = atBottom;
      };
      
      if (scroller && scroller !== slot.scroller) {
        if (slot.scroller && slot.scrollHandler) {
          try {
            slot.scroller.removeEventListener('scroll', slot.scrollHandler);
          } catch (_) {
            void 0;
          }
        }
        if (slot.scrollObserver) {
          try {
            slot.scrollObserver.disconnect();
          } catch (_) {
            void 0;
          }
        }
        slot.scroller = scroller;
        slot.scrollHandler = () => updateScrollSnapshot();
        scroller.addEventListener('scroll', slot.scrollHandler, { passive: true });
        slot.scrollObserver = new MutationObserver(() => { scrollData.lastMut = Date.now(); updateScrollSnapshot(); });
        slot.scrollObserver.observe(scroller, { childList: true, subtree: true });
        updateScrollSnapshot();
      } else {
        updateScrollSnapshot();
      }
      
      const atBottom = scrollData.atBottom;
      const sendBtn = findSendButton();
      const stopBtn = findStopButton();
      const voiceBtn = findVoiceButton();
      
      let sendState = 'missing';
      if (sendBtn) {
        const disabledAttr = sendBtn.disabled ?? sendBtn.getAttribute('aria-disabled') === 'true';
        const disabledStyle = getComputedStyle(sendBtn).pointerEvents === 'none';
        const disabledClass = /disabled|opacity-4|opacity-5|cursor-not-allowed/i.test(sendBtn.className ?? '');
        const disabledParent = sendBtn.closest('button[disabled], [aria-disabled="true"], [data-disabled="true"]');
        const disabled = disabledAttr || disabledStyle || disabledClass || !!disabledParent;
        sendState = disabled ? 'disabled' : 'enabled';
      }
      
      return {
        atBottom,
        sendState,
        stopVisible: !!stopBtn,
        voiceMode: !!voiceBtn,
        lastSend: slot.lastSend ?? 0,
        href: location.href,
        scroll: {
          scrollTop: scrollData.scrollTop,
          scrollHeight: scrollData.scrollHeight,
          clientHeight: scrollData.clientHeight,
          atBottom: scrollData.atBottom,
          lastChange: scrollData.lastChange,
        },
      };
    } catch (err) {
      return { error: String(err) };
    }
  })();`;
}

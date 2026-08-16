import { ProviderRegistry } from "../webview/provider-registry.js";
import { AppState } from "../app-state.js";
import { isDefaultPage } from "../webview/methods/shared/url-utils.js";
import { Logger } from "../logger/index.js";
import { LogCategory, LogLevel } from "@shared/index.js";
import type { BaseProviderConfig } from "@shared/provider.js";

interface LoadingConfig {
  loading: {
    maxWaitForScrollMs: number;
    autoScrollIntervalMs: number;
    noScrollChangeTimeoutMs: number;
  };
}

interface WebviewElement {
  isDestroyed?: () => boolean;
  getWebContentsId?: () => number;
  isLoading?: () => boolean;
  executeJavaScript: (script: string, userGesture?: boolean) => Promise<unknown>;
}

interface ViewState {
  status?: { loading?: string };
  lastHref?: string;
  loadingActive?: boolean;
  loadingStartTime?: number;
  loadingScrollAppeared?: boolean;
  lastScrollChange?: number;
  lastAutoScrollAt?: number;
  loadingJustEnded?: boolean;
  loadingEndedAt?: number;
}

interface ProbeData {
  scroll?: {
    scrollHeight?: number;
    clientHeight?: number;
    lastChange?: number;
    atBottom?: boolean;
  };
  sendState?: string;
}

interface LoadingEvent {
  type: string;
  messageKey: string;
  messageParams?: Record<string, string>;
}

interface CheckResult {
  shouldEnd: boolean;
  reason: string | null;
  newState: ViewState;
}

interface ProbeResult {
  indicator: string;
  newState: ViewState;
  event: LoadingEvent | null;
}

export class LoadingTracker {
  config: LoadingConfig;
  private probeCount = 0;

  constructor(config: LoadingConfig) {
    this.config = config;
  }

  async scrollToBottom(provider: string, webview: WebviewElement): Promise<boolean> {
    if (webview.isDestroyed?.() === true) return false;

    try {
      if (typeof webview.getWebContentsId !== "function") return false;
      webview.getWebContentsId();
      if (webview.isLoading?.() === true) return false;
    } catch (_) {
      return false;
    }

    const providerId = AppState.getProviderIdForSlot(provider) ?? "";
    const cfg = providerId.length > 0 ? ProviderRegistry.get(providerId) : null;
    const cfgWithSelectors = cfg as BaseProviderConfig | null;
    const scrollerSelectors = cfgWithSelectors?.scrollerSelectors ?? [
      "div.flex.h-full.flex-col.overflow-y-auto",
      "main div.overflow-y-auto",
      "main section.overflow-y-auto",
      'div[role="main"] .overflow-y-auto',
    ];
    const contentContainers = cfgWithSelectors?.contentContainers ?? [
      "main",
      "section",
      "div",
      "article",
    ];

    const _scrollDebounceMs = 10;
    const script = `(async () => {
      const scrollerSelectors = ${JSON.stringify(scrollerSelectors)};
      const contentContainers = ${JSON.stringify(contentContainers)};
      
      const findChatScroller = () => {
        for (const sel of scrollerSelectors) {
          try {
            const el = document.querySelector(sel);
            if (el) {
              const style = getComputedStyle(el);
              const gap = el.scrollHeight - el.clientHeight;
              const isScrollable = gap > 12 && (style.overflowY === 'auto' || style.overflowY === 'scroll');
              
              if (isScrollable) {
                return el;
              }
              
              const scrollableChild = el.querySelector('[class*="overflow-y"]');
              if (scrollableChild) {
                const childStyle = getComputedStyle(scrollableChild);
                const childGap = scrollableChild.scrollHeight - scrollableChild.clientHeight;
                if (childGap > 12 && (childStyle.overflowY === 'auto' || childStyle.overflowY === 'scroll')) {
                  return scrollableChild;
                }
              }
              
              return el;
            }
          } catch (_) {}
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
          if (gap > 8 && el.clientHeight > 120) {
            const priority = (style.overflowY === 'auto' || style.overflowY === 'scroll') ? gap * 2 : gap;
            candidates.push({ el, gap, priority });
          }
        };
        pushIfScrollable(document.scrollingElement);
        pushIfScrollable(document.documentElement);
        pushIfScrollable(document.body);
        for (const tag of contentContainers) {
          try {
            const list = document.querySelectorAll(tag);
            for (let i = 0; i < list.length && i < 250; i += 1) {
              pushIfScrollable(list[i]);
            }
          } catch (_) {}
        }
        candidates.sort((a, b) => b.priority - a.priority);
        return candidates[0]?.el ?? document.scrollingElement ?? document.documentElement ?? document.body;
      };
      
      const scroller = findChatScroller() || findFallbackScroller();
      if (!scroller) return false;
      
      try {
        const scrollHeight = scroller.scrollHeight;
        const clientHeight = scroller.clientHeight;
        const maxScroll = scrollHeight - clientHeight;
        
        const scrollMethods = [
          () => { scroller.scrollTop = maxScroll; },
          () => { scroller.scrollTop = scrollHeight; },
          () => { scroller.scrollTop = 999999; },
          () => { if (scroller.scrollTo) scroller.scrollTo({ top: maxScroll, behavior: 'auto' }); },
          () => { if (scroller.scrollTo) scroller.scrollTo({ top: scrollHeight, behavior: 'auto' }); },
          () => { if (scroller.scrollTo) scroller.scrollTo({ top: 999999, behavior: 'auto' }); },
          () => { if (scroller.scrollTo) scroller.scrollTo({ top: maxScroll, behavior: 'instant' }); },
          () => { if (scroller.scrollTo) scroller.scrollTo(0, maxScroll); },
        ];
        
        let bestScrollTop = scroller.scrollTop ?? 0;
        const maxAttempts = 12;
        
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          for (const method of scrollMethods) {
            try {
              method();
              const newScrollTop = scroller.scrollTop ?? 0;
              if (newScrollTop > bestScrollTop) {
                bestScrollTop = newScrollTop;
              }
            } catch (_) { void 0; }
          }
          
          const currentTop = scroller.scrollTop ?? 0;
          const currentHeight = scroller.scrollHeight ?? 0;
          const currentClient = scroller.clientHeight ?? 0;
          const gap = Math.abs(currentHeight - currentTop - currentClient);
          
          if (gap < 8) {
            return true;
          }
          
          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, ${_scrollDebounceMs}));
          }
        }
        
        const finalTop = scroller.scrollTop ?? 0;
        const finalHeight = scroller.scrollHeight ?? 0;
        const finalClient = scroller.clientHeight ?? 0;
        const finalGap = Math.abs(finalHeight - finalTop - finalClient);
        return finalGap < 8;
      } catch (_) { 
        return false; 
      }
    })();`;

    try {
      const result = await webview.executeJavaScript(script, true);
      return typeof result === "boolean" ? result : false;
    } catch (_) {
      return false;
    }
  }

  async handleProbe(
    provider: string,
    viewState: ViewState,
    data: ProbeData,
    now: number,
    webview: WebviewElement,
    currentHref: string
  ): Promise<ProbeResult> {
    this.probeCount++;
    let indicator = viewState.status?.loading ?? "busy";
    let event = null;

    if (currentHref.length > 0 && currentHref !== viewState.lastHref) {
      viewState.lastHref = currentHref;

      this.startLoading(viewState, now);
      indicator = "busy";
      event = {
        type: "loading-started",
        messageKey: "app.logs.traffic.loadingStartedEvent",
        messageParams: { provider, href: currentHref },
      };

      Logger.panelT(
        LogCategory.TRAFFIC,
        LogLevel.INFO,
        "app.logs.traffic.loadingStartedPanel",
        { provider, href: currentHref },
        {
          provider,
          href: currentHref,
          probeCount: this.probeCount,
        }
      );
    }

    if (viewState.loadingActive === true) {
      const result = await this.checkLoadingEnd(
        provider,
        viewState,
        data,
        now,
        webview,
        currentHref
      );

      if (result.shouldEnd) {
        indicator = "idle";
        event = {
          type: "loading-ended",
          messageKey: "app.logs.traffic.loadingEndedEvent",
          messageParams: {
            provider,
            reason: result.reason ?? "unknown",
            href: currentHref,
          },
        };

        Logger.panelT(
          LogCategory.TRAFFIC,
          LogLevel.INFO,
          "app.logs.traffic.loadingEndedPanel",
          { provider, reason: result.reason ?? "unknown", href: currentHref },
          {
            provider,
            reason: result.reason,
            href: currentHref,
            probeCount: this.probeCount,
          }
        );
      } else {
        indicator = "busy";
      }

      viewState = result.newState;
    }

    return { indicator, newState: viewState, event };
  }

  startLoading(viewState: ViewState, now: number): ViewState {
    viewState.loadingActive = true;
    viewState.loadingStartTime = now;
    viewState.loadingScrollAppeared = false;
    viewState.lastScrollChange = 0;
    viewState.lastAutoScrollAt = 0;
    return viewState;
  }

  async checkLoadingEnd(
    provider: string,
    viewState: ViewState,
    data: ProbeData,
    now: number,
    webview: WebviewElement,
    currentUrl = ""
  ): Promise<CheckResult> {
    if (viewState.loadingActive !== true) {
      return { shouldEnd: false, reason: null, newState: viewState };
    }

    const scroll = data.scroll ?? {};
    const loadingElapsed = now - (viewState.loadingStartTime ?? now);

    const providerId = AppState.getProviderIdForSlot(provider) ?? "";
    const onDefaultPage = isDefaultPage(currentUrl, providerId);

    if (onDefaultPage) {
      const sendButtonFound = data.sendState === "enabled" || data.sendState === "disabled";

      if (sendButtonFound) {
        return {
          shouldEnd: true,
          reason: "default page ready (send button found)",
          newState: this.endLoading(viewState, now),
        };
      }

      if (loadingElapsed > 5000) {
        return {
          shouldEnd: true,
          reason: "default page timeout",
          newState: this.endLoading(viewState, now),
        };
      }

      return { shouldEnd: false, reason: null, newState: viewState };
    }

    const scrollGap = (scroll.scrollHeight ?? 0) - (scroll.clientHeight ?? 0);
    const hasScroll = scrollGap > 12;
    const scrollChanged =
      typeof scroll.lastChange === "number" && scroll.lastChange !== viewState.lastScrollChange;

    if (scrollChanged) {
      if (typeof scroll.lastChange === "number") {
        viewState.lastScrollChange = scroll.lastChange;
      }
    }

    if (loadingElapsed > this.config.loading.maxWaitForScrollMs) {
      return {
        shouldEnd: true,
        reason: "timeout",
        newState: this.endLoading(viewState, now),
      };
    }

    if (!hasScroll) {
      return { shouldEnd: false, reason: null, newState: viewState };
    }

    if (viewState.loadingScrollAppeared !== true) {
      viewState.loadingScrollAppeared = true;
      viewState.lastScrollChange = scroll.lastChange ?? now;
    }

    const atBottom = scroll.atBottom ?? false;
    const timeSinceLastScroll = now - (viewState.lastAutoScrollAt ?? 0);

    if (!atBottom && timeSinceLastScroll >= this.config.loading.autoScrollIntervalMs) {
      try {
        const scrolled = await this.scrollToBottom(provider, webview);
        viewState.lastAutoScrollAt = now;
        if (scrolled) {
          viewState.loadingScrollAppeared = true;
          viewState.lastScrollChange = Date.now();
        }
      } catch (_) {
        viewState.lastAutoScrollAt = now;
      }
    }

    if ((viewState.lastScrollChange ?? 0) > 0) {
      const timeSinceLastScrollChange = now - (viewState.lastScrollChange ?? 0);
      if (timeSinceLastScrollChange >= this.config.loading.noScrollChangeTimeoutMs) {
        return {
          shouldEnd: true,
          reason: "no more scroll",
          newState: this.endLoading(viewState, now),
        };
      }
    }

    return { shouldEnd: false, reason: null, newState: viewState };
  }

  endLoading(viewState: ViewState, now: number): ViewState {
    viewState.loadingActive = false;
    viewState.loadingJustEnded = true;
    viewState.loadingEndedAt = now;
    return viewState;
  }

  clearJustEnded(viewState: ViewState): ViewState {
    viewState.loadingJustEnded = false;
    return viewState;
  }
}

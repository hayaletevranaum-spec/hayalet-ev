/* global window */

(function (global: GameRoomUiGlobal) {
  type ScrollSelectorKey = keyof typeof FEATURE_SCROLL_SELECTORS;
  type ScrollState = Partial<Record<ScrollSelectorKey, number>>;
  type QuerySelectorRoot = {
    querySelector: (selector: string) => Element | null;
  };

  const FEATURE_SCROLL_SELECTORS = {
    backgammonRail: ".backgammon-rail",
    backgammonStage: ".backgammon-stage",
    teamTetrisRail: ".tt-rail",
    teamTetrisStage: ".tt-stage",
  };

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && Array.isArray(value) === false;
  }

  function canQuerySelector(value: unknown): value is QuerySelectorRoot {
    return (
      typeof value === "object" &&
      value !== null &&
      typeof (value as { querySelector?: unknown }).querySelector === "function"
    );
  }

  function isScrollableElement(value: unknown): value is HTMLElement {
    return value instanceof HTMLElement;
  }

  const registry: GameRoomUiScrollRuntimeRegistry =
    global.GameRoomUiScrollRuntime || (global.GameRoomUiScrollRuntime = {});

  registry.createGameRoomUiScrollRuntime = function createGameRoomUiScrollRuntime() {
    return {
      capture(root: HTMLElement): ScrollState {
        if (!canQuerySelector(root)) {
          return {};
        }

        const scrollState: ScrollState = {};
        (Object.entries(FEATURE_SCROLL_SELECTORS) as Array<[ScrollSelectorKey, string]>).forEach(
          function ([key, selector]) {
            const element = root.querySelector(selector);
            if (isScrollableElement(element)) {
              scrollState[key] = element.scrollTop;
            }
          }
        );
        return scrollState;
      },
      restore(root: HTMLElement, scrollState: unknown) {
        if (isRecord(scrollState) === false || !canQuerySelector(root)) {
          return;
        }

        (Object.entries(FEATURE_SCROLL_SELECTORS) as Array<[ScrollSelectorKey, string]>).forEach(
          function ([key, selector]) {
            const top = scrollState[key];
            if (typeof top !== "number") {
              return;
            }

            const element = root.querySelector(selector);
            if (isScrollableElement(element)) {
              element.scrollTop = top;
            }
          }
        );
      },
    };
  };
})(window as unknown as GameRoomUiGlobal);

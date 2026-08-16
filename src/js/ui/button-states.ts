import { Logger } from "../modules/logger/index.js";
import { LogCategory } from "@shared/logging-core";
import { DEFAULT_SUCCESS_DURATION, DEFAULT_ERROR_DURATION } from "@ui-constants";

type ButtonState = "idle" | "loading" | "success" | "error";

interface ButtonData {
  originalText: string;
  originalDisabled: boolean;
  state: ButtonState;
  timeoutId?: ReturnType<typeof setTimeout>;
}

const STATE_CLASSES = {
  loading: "btn-loading",
  success: "btn-state-success",
  error: "btn-state-error",
};

const STATE_ICONS = {
  success: "✓",
  error: "✕",
};

const buttonDataMap: WeakMap<HTMLButtonElement, ButtonData> = new WeakMap();

function getButtonData(button: HTMLButtonElement): ButtonData {
  let data = buttonDataMap.get(button);
  if (!data) {
    data = {
      originalText: button.textContent.trim(),
      originalDisabled: button.disabled,
      state: "idle",
    };
    buttonDataMap.set(button, data);
  }
  return data;
}

function clearStateClasses(button: HTMLButtonElement): void {
  button.classList.remove(STATE_CLASSES.loading, STATE_CLASSES.success, STATE_CLASSES.error);
}

function clearTimeout(data: ButtonData): void {
  if (data.timeoutId) {
    globalThis.clearTimeout(data.timeoutId);
    delete data.timeoutId;
  }
}

const buttonStates = {
  setLoading(button: HTMLButtonElement, text?: string): void {
    const data = getButtonData(button);

    clearTimeout(data);

    if (data.state === "idle") {
      data.originalText = button.textContent.trim();
      data.originalDisabled = button.disabled;
    }

    clearStateClasses(button);
    button.classList.add(STATE_CLASSES.loading);
    button.disabled = true;
    data.state = "loading";

    if (text != null && text !== "") {
      button.textContent = text;
    }

    Logger.debugT(LogCategory.UI, "app.logs.uiButtonStates.loadingSet", undefined, {
      text: text ?? data.originalText,
    });
  },

  setSuccess(
    button: HTMLButtonElement,
    text?: string,
    duration: number = DEFAULT_SUCCESS_DURATION
  ): void {
    const data = getButtonData(button);

    clearTimeout(data);

    clearStateClasses(button);
    button.classList.add(STATE_CLASSES.success);
    button.disabled = false;
    data.state = "success";

    if (text != null && text !== "") {
      button.textContent = `${STATE_ICONS.success} ${text}`;
    } else {
      button.textContent = `${STATE_ICONS.success} ${data.originalText}`;
    }

    if (duration > 0) {
      data.timeoutId = globalThis.setTimeout(() => {
        buttonStates.reset(button);
      }, duration);
    }

    Logger.debugT(LogCategory.UI, "app.logs.uiButtonStates.successSet", undefined, {
      text: text ?? data.originalText,
    });
  },

  setError(
    button: HTMLButtonElement,
    text?: string,
    duration: number = DEFAULT_ERROR_DURATION
  ): void {
    const data = getButtonData(button);

    clearTimeout(data);

    clearStateClasses(button);
    button.classList.add(STATE_CLASSES.error);
    button.disabled = false;
    data.state = "error";

    if (text != null && text !== "") {
      button.textContent = `${STATE_ICONS.error} ${text}`;
    } else {
      button.textContent = `${STATE_ICONS.error} ${data.originalText}`;
    }

    if (duration > 0) {
      data.timeoutId = globalThis.setTimeout(() => {
        buttonStates.reset(button);
      }, duration);
    }

    Logger.debugT(LogCategory.UI, "app.logs.uiButtonStates.errorSet", undefined, {
      text: text ?? data.originalText,
    });
  },

  reset(button: HTMLButtonElement): void {
    const data = getButtonData(button);

    clearTimeout(data);

    clearStateClasses(button);

    button.textContent = data.originalText;
    button.disabled = data.originalDisabled;
    data.state = "idle";

    Logger.debugT(LogCategory.UI, "app.logs.uiButtonStates.reset", undefined, {
      text: data.originalText,
    });
  },

  getState(button: HTMLButtonElement): ButtonState {
    const data = buttonDataMap.get(button);
    return data?.state ?? "idle";
  },

  isLoading(button: HTMLButtonElement): boolean {
    return buttonStates.getState(button) === "loading";
  },

  destroy(): void {
    Logger.debugT(LogCategory.UI, "app.logs.uiButtonStates.destroyed");
  },

  async wrap<T>(
    button: HTMLButtonElement,
    fn: () => Promise<T>,
    options?: {
      loadingText?: string;
      successText?: string;
      errorText?: string;
    }
  ): Promise<T> {
    buttonStates.setLoading(button, options?.loadingText);

    try {
      const result = await fn();
      buttonStates.setSuccess(button, options?.successText);
      return result;
    } catch (error) {
      buttonStates.setError(button, options?.errorText);
      throw error;
    }
  },
};

export { buttonStates as ButtonStates };

export interface ExpectedCommandCaptureFailureDetail {
  provider: string;
  webUrl?: string;
  text?: string;
}

export const EXPECTED_COMMAND_CAPTURE_FAILURE_EVENT = "room-expected-command-capture-failed";

export function dispatchExpectedCommandCaptureFailure(
  detail: ExpectedCommandCaptureFailureDetail
): void {
  try {
    window.dispatchEvent(
      new CustomEvent(EXPECTED_COMMAND_CAPTURE_FAILURE_EVENT, {
        detail: {
          provider: detail.provider,
          ...(typeof detail.webUrl === "string" ? { webUrl: detail.webUrl } : {}),
          ...(typeof detail.text === "string" ? { text: detail.text } : {}),
        },
      })
    );
  } catch {
    // NOTE: Ignore dispatch errors from optional room feedback hooks.
  }
}

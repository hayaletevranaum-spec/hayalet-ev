export type GhostLoadingSettleState = "pending" | "success" | "timeout";

export type GhostLoadingSettleReason = "not-started" | "url-stable" | "loading-stopped" | "timeout";

export interface GhostLoadingProbeInput {
  nowMs: number;
  startedAtMs: number;
  firstNavigatedAtMs: number | null;
  url: string;
  isLoading: boolean;
  timeoutMs: number;
  stableUrlMs: number;
}

export interface GhostLoadingProbeResult {
  settle: GhostLoadingSettleState;
  reason: GhostLoadingSettleReason;
  firstNavigatedAtMs: number | null;
}

export function evaluateGhostLoadingReadiness(
  input: GhostLoadingProbeInput
): GhostLoadingProbeResult {
  const normalizedUrl = input.url.trim();
  const hasNavigated = normalizedUrl !== "" && normalizedUrl !== "about:blank";
  const nextFirstNavigatedAtMs = input.firstNavigatedAtMs ?? (hasNavigated ? input.nowMs : null);

  if (hasNavigated && input.isLoading === false) {
    return {
      settle: "success",
      reason: "loading-stopped",
      firstNavigatedAtMs: nextFirstNavigatedAtMs,
    };
  }

  if (
    hasNavigated &&
    nextFirstNavigatedAtMs !== null &&
    input.nowMs - nextFirstNavigatedAtMs >= input.stableUrlMs
  ) {
    return {
      settle: "success",
      reason: "url-stable",
      firstNavigatedAtMs: nextFirstNavigatedAtMs,
    };
  }

  if (input.nowMs - input.startedAtMs >= input.timeoutMs) {
    return {
      settle: "timeout",
      reason: "timeout",
      firstNavigatedAtMs: nextFirstNavigatedAtMs,
    };
  }

  return {
    settle: "pending",
    reason: hasNavigated ? "url-stable" : "not-started",
    firstNavigatedAtMs: nextFirstNavigatedAtMs,
  };
}

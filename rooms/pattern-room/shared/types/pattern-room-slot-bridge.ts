export type SlotBridgeEnvelope = {
  action: string;
  clientRequestId?: string;
  replyToSlot?: string | null;
  reqId?: string;
  wait?: boolean;
  [key: string]: unknown;
};

export type SlotBridgeResult = {
  success: boolean;
  code?: string;
  error?: string;
  message?: string;
  reqId?: string;
  clientRequestId?: string;
  brokerMessageId?: string;
  reply?: Record<string, unknown> | null;
};

# SlotBridge Contract

## Public command surface
- Public entrypoint: `++cmd:SlotBridge({...})`
- Supported actions:
  - `message.send`
  - `message.sendWait`
  - `connection.ensure`
  - `session.open`
  - `session.switch`
  - `session.sync`
  - `room.command`
- Canonical outbound send actions:
  - `message.send`
  - `message.sendWait`
- Retired actions rejected at the bridge boundary:
  - `message.sendWithAttachments`
  - `file.send`

## Envelope
- Core fields:
  - `version`
  - `reqId`
  - `action`
  - `fromSlot`
  - `toSlot`
  - `toSlots`
  - `replyToSlot`
  - `delivery`
  - `wait`
  - `timeoutMs`
  - `force`
  - `connectPolicy`
  - `sessionRef`
  - `payload`
  - `attachments`
- `force: true` remains accepted at the public edge and normalizes to `connectPolicy: "ensure"` internally.
- `message.sendWait` accepts exactly one effective target.
- `message.send` may target one slot with `toSlot` or many slots with `toSlots`.

## Result shape
- Standard result fields:
  - `success`
  - `ok`
  - `reqId`
  - `code`
  - `message`
  - `reply`
  - `session`
  - `artifacts`
  - `data`
- `message.sendWait` resolves replies from the archive-backed sync path and can return persisted attachments, including generated images.

## Protocol composition
- `message.send` and `message.sendWait` may compose protocol text through `payload.protocol`.
- Supported protocol descriptor fields:
  - `room`
  - `scenario`
  - `protocolKey`
  - `fallbackTitle`
  - `preface`
  - `context`
  - `textPosition`
- `textPosition` merge rules:
  - `after`: protocol first, plain text second
  - `before`: plain text first, protocol second
  - `replace`: protocol body only
- Supported combined payload shapes:
  - plain text only
  - attachments only
  - protocol only
  - protocol plus text
  - protocol plus attachments
  - protocol plus text plus attachments

## Attachment contract
- Public file-bearing actions should prefer attachment references, not arbitrary local paths.
- Supported descriptor styles:
  - `kind: "attachment-ref"` with `ref: "archive:<slot>:<conversationId>:<messageId>:<name>"`
  - archived reply artifacts returned by `message.sendWait`
  - internal filesystem paths only from trusted sources such as `room-ui`, `system`, or `user`
- AI-authored payloads from `ai0`, `ai1`, or `ai2` do not get direct raw filesystem access.

## US1 parity
- `message.send` supports `toSlot: "us1"` under the same public envelope as AI slots.
- `message.sendWait` also supports `us1`, but remains single-target only.
- `session.sync` is the canonical US1 mailbox/session refresh action.
- `us1` attachments use the same public attachment descriptors; transport-specific conversion happens behind the bridge.
- `us1` room events and room commands remain transport metadata inside `payload`, not a second public send action family.

## Room-owned derived state
- Rooms may persist bridge-derived continuity data such as `sessionRef`, `remoteUserId`, or dedupe cursors in room state when a feature needs to continue an existing US1 thread or reject duplicate transport events.
- Those fields are derived state only. They do not authorize direct transport calls and do not replace `SlotBridge`.
- Every outbound send, waited reply, and mailbox refresh still enters through `message.send`, `message.sendWait`, or `session.sync`.

## Room command model
- Room actions stay internal and dispatch through `action: "room.command"`.
- Room manifests can mark action specs with `exposure: "internal"` so the public catalog does not leak room-local action ids.
- Room UI still uses `roomAPI.sendCommand(...)`; the host converts that request into a `SlotBridge` room action.

## Legacy adapters
- `AIAssistantSend` and `AssistantAISend` are removed and must not be emitted by prompts or docs.
- `CoreEngine.sendBatch`, `CoreEngine.sendMessage`, `CoreEngine.sendToTargets`, and room-host helper seams are no longer alternate delivery paths; public callers must enter through `SlotBridge`.

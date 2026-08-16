# Rovo Interaction Protocol

This protocol defines the repo-local transport used by the `Rovo Interaction Layer`.

## V1 Token

Append one final token to the assistant message:

`[rovo-ui:v1:<base64url-json>]`

Rules:

- The token should appear at the end of the assistant message
- The visible assistant message must still be valid plain text without special rendering
- The JSON payload inside the token must be UTF-8 JSON encoded as base64url
- The payload `fallbackText` must contain the exact plain text fallback that should be shown when special rendering is unavailable

## V1 Payload Requirements

All V1 payloads must include:

- `id`
- `version`
- `type`
- `title`
- `fallbackText`

Supported V1 payload types:

- `change-approval`
- `plan-harder-local`

## `change-approval`

Purpose:

- render the project-standard approval block as a structured card
- preserve `evet` as the canonical approval answer

Required fields:

- `issue`
- `solution`
- `canonicalReply`

Optional fields:

- `modeLabel`
- `counterpartyLabel`
- `files`
- `body`
- `canonicalReplyLabel`

## `plan-harder-local`

Purpose:

- collect structured planning answers inside OpenCode UI
- submit a generated planning reply instead of a raw approval answer

Required fields:

- `questions`

Optional fields:

- `body`
- `submitLabel`
- `clearLabel`
- `responseTitle`
- `responsePreamble`
- `persistDraft`

Supported question kinds:

- `single-choice`
- `short-text`
- `long-text`

## Draft Persistence

`plan-harder-local` may optionally persist draft answers by using the existing local memory store.

V1 convention:

- namespace: `rovo-interactions`
- tags: `interaction-draft`, `plan-harder-local`, `card:<payload.id>`
- persistence is best-effort and must not block plain text fallback or submit

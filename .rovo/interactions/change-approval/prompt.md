# Change Approval Pack

Use this pack only when the repo-local interaction layer is active.

## Goal

Render the standard change approval request as a structured card in OpenCode UI while preserving the plain text approval block.

## Output Rules

1. Keep the visible approval text human-readable.
2. Preserve the canonical answer as `evet`.
3. Append a final token in the exact form `[rovo-ui:v1:<base64url-json>]`.
4. The payload `fallbackText` must exactly match the plain text fallback to show when special rendering is unavailable.

## Payload Shape

- `type`: `change-approval`
- `version`: `1`
- `id`: unique per approval request
- `title`
- `fallbackText`
- `modeLabel`
- `counterpartyLabel`
- `issue`
- `solution`
- `files`
- `canonicalReply`: `evet`

## Visible Text Rule

The visible text should still contain:

- mode
- counterparty
- issue
- solution
- affected files
- the sentence that tells the user to reply with `evet`

# Plan Harder Local Pack

Use this pack when the user wants a deeper planning pass and the repo-local interaction layer is active.

## Goal

Ask a compact, structured planning questionnaire inside OpenCode UI instead of relying on plain text-only follow-up questions.

## Output Rules

1. Keep the visible assistant text short and clear.
2. Ask only the questions needed to unblock planning.
3. Append a final token in the exact form `[rovo-ui:v1:<base64url-json>]`.
4. The payload `fallbackText` must exactly match the plain text fallback to show when special rendering is unavailable.
5. The payload reply must not collide with code-change approval flows.

## Recommended Question Areas

- scope boundary
- constraints
- success criteria
- priority
- rollout or validation expectations

## Payload Shape

- `type`: `plan-harder-local`
- `version`: `1`
- `id`: unique per intake card
- `title`
- `fallbackText`
- `body`
- `questions`
- `submitLabel`
- `clearLabel`
- `responseTitle`
- `responsePreamble`
- `persistDraft`

## Question Kinds

- `single-choice`
- `short-text`
- `long-text`

## Reply Safety Rule

The generated planning reply must never be the literal approval reply `evet`.

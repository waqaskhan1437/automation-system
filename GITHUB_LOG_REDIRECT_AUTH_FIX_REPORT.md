# GitHub Log Redirect Auth Fix

## Problem

The UI/API log fetch endpoint was returning an Azure XML error:

```txt
InvalidAuthenticationInfo: The access token was missing or malformed.
```

This happened while downloading GitHub Actions job logs.

## Root cause

GitHub Actions job log endpoints do not return the log text directly in all environments. They return a short-lived redirect URL in the `Location` header. The previous Worker code used automatic redirect following with the GitHub `Authorization: Bearer ...` header still attached to the request chain. The redirected URL is a signed storage URL, so the GitHub bearer token must not be sent there. When storage receives that header, it can treat it as malformed storage authentication and return `InvalidAuthenticationInfo`.

## Fix

Updated both log readers:

- `worker/src/routes/jobs.ts`
- `worker/src/routes/ai-access.ts`

The new logic is:

1. Call GitHub API with PAT and `redirect: "manual"`.
2. Read the short-lived signed URL from the `Location` header.
3. Fetch that signed URL without any GitHub `Authorization` header.
4. Return/analyze the downloaded text.
5. Keep truncation and error snippet analysis in place.

## Expected result after deploy

These endpoints should now fetch logs instead of returning the Azure XML auth error:

```txt
GET /api/jobs/:id/logs?include_log_text=1
GET /api/ai/jobs/:id/diagnostics?include_log_text=1&ai_token=...
```

If the underlying PAT is missing/invalid, the GitHub API call will still fail before redirect with a clear GitHub API error. If logs are available, the UI should show snippets and cookie/sign-in/yt-dlp/ffmpeg diagnosis.

## Validation

- Targeted TypeScript transpile check for changed Worker route files: pass.
- ZIP integrity check: pass.

Full project `tsc --noEmit` was not reliable in the sandbox due timeout behavior, so validation was targeted to changed files plus package integrity.

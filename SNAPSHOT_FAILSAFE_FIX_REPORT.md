# Snapshot / Monitor Fail-Safe Fix

## Problem fixed
`GET /api/ai/snapshot?ai_token=...` could hang when one internal section was slow, especially GitHub metadata/file-tree fetches or any DB section inside the combined snapshot bundle. Browser/ChatGPT-style tools then saw a timeout instead of a useful partial diagnostic response.

## Changes made

### `worker/src/routes/ai-access.ts`
- Added section-level timeout helpers:
  - `SNAPSHOT_TIMEOUT_MS = 2500`
  - `SNAPSHOT_GITHUB_TIMEOUT_MS = 3000`
  - `collectSnapshotSection(...)`
  - `unwrapSnapshotSection(...)`
- Updated `/api/ai/snapshot` to be fail-safe:
  - Returns partial data instead of hanging.
  - Adds `partial` and `section_status` fields.
  - Each section reports `ok`, `duration_ms`, `timed_out`, and `error` when unavailable.
- Changed default snapshot behavior:
  - Fast browser snapshot no longer performs remote GitHub fetch by default.
  - GitHub remote fetch runs only with `include_github=1` or `include_tree=1`.
  - File tree fetch runs only with `include_tree=1`.
- Updated `/api/ai/monitor` to return a partial `206` response instead of hanging on slow DB reads.
- Wrapped runtime API-key migration in a short timeout so route startup work cannot block the AI endpoint indefinitely.

### `worker/src/services/ai-developer.ts`
- Added GitHub API timeout protection:
  - `GITHUB_API_TIMEOUT_MS = 15000`
  - `AbortController` cancels slow GitHub requests.
- Made GitHub JSON parsing safer when GitHub returns non-JSON text.

## New recommended test URLs

Fast browser snapshot:

```txt
/api/ai/snapshot?ai_token=YOUR_KEY
```

Snapshot with GitHub repo metadata:

```txt
/api/ai/snapshot?ai_token=YOUR_KEY&include_github=1
```

Snapshot with file tree, capped at 500 files:

```txt
/api/ai/snapshot?ai_token=YOUR_KEY&include_tree=1
```

Monitor only:

```txt
/api/ai/monitor?ai_token=YOUR_KEY
```

## Expected behavior after deploy
- Snapshot should return quickly even if GitHub or logs are slow.
- If a section fails, response still includes available sections plus `section_status`.
- A slow GitHub request reports timeout instead of blocking the whole Worker response.
- Query token remains GET/read-only. POST/PATCH/DELETE still require Authorization header.

## Validation performed in sandbox
- TypeScript transpile/syntax validation passed for changed files:
  - `worker/src/routes/ai-access.ts`
  - `worker/src/services/ai-developer.ts`
- Final ZIP integrity check passed with `unzip -t`.

## Note
Full `tsc --noEmit` was attempted, but the sandbox command timed out. Changed files were validated with TypeScript transpilation diagnostics and manual route review.

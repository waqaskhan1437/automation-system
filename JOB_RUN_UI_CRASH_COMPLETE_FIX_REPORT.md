# Complete Job Run / UI Crash Audit Fix

## Live root cause found
The latest monitor response showed job 908 failed before reaching GitHub Actions:

`GitHub API error: 422 - Workflow does not have 'workflow_dispatch' trigger`

That means the Worker was trying to dispatch `video-automation.yml`, but the repository branch being dispatched did not contain a dispatchable workflow file. The previous generated ZIP also missed the `.github` workflows, so pushing it could delete or omit the runner workflow from the repo.

## Fixes included

### 1. GitHub Actions runner workflow restored
- Re-added `.github/workflows/video-automation.yml`
- Re-added `.github/workflows/image-automation.yml`
- Re-added reusable runner actions under `.github/actions/`
- Removed duplicate `deploy-worker.yml` workflow to avoid duplicate deployment checks
- Updated production deploy flow so Worker checks/deploys before frontend/Vercel

### 2. Video runner exit code fixed
`video-automation.yml` now preserves `node main.js` exit code. If the runner fails, GitHub Actions fails correctly instead of showing success while the app marks the job failed.

### 3. GitHub workflow dispatch made more robust
`worker/src/services/github.ts` now:
- retries dispatch by resolved GitHub workflow ID when filename dispatch fails
- lists available workflows to provide a useful error when workflow files are missing
- returns clearer dispatch errors with workflow/path hints

### 4. `/api/automations/:id/run` no longer causes frontend crash
Expected dispatch/preflight failures now return a structured JSON body instead of a raw 500-only response. The UI can show the exact job ID/error without crashing.

### 5. Automations dashboard made fail-safe
`/api/automations/dashboard` now:
- does not fail the whole dashboard if schedule backfill fails
- does not fail the whole dashboard if scheduled-post sync fails
- does not fail the whole dashboard if link queue status fails for one automation
- safely handles old post metadata where `scheduled_accounts` is missing

### 6. Frontend "Cannot read length" crash fixed
Automations UI now:
- normalizes `steps` before reading `.length`
- keeps a safe failed job state if run API fails quickly
- shows a useful failure step in logs instead of crashing
- handles API errors from `ApiError` with exact backend message
- guards scheduled post arrays before reading `.length`

## Files changed
- `.github/workflows/deploy-production.yml`
- `.github/workflows/video-automation.yml`
- `.github/workflows/image-automation.yml`
- `.github/actions/setup-runner-node/action.yml`
- `.github/actions/upload-runner-artifacts/action.yml`
- `worker/src/services/github.ts`
- `worker/src/routes/automations.ts`
- `frontend/src/app/automations/page.tsx`
- `frontend/src/components/ui/ScheduledPostsModal.tsx`

## Validation
- ZIP integrity: pass
- YAML workflows parse: pass
- Static brace/parenthesis validation for changed TS/TSX: pass
- Full TypeScript build could not be completed in sandbox because dependencies/node_modules are not installed in the extracted ZIP.

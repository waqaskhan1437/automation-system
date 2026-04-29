# Dispatch Nonce Compatibility Fix

## Problem

GitHub workflow dispatch failed before the runner started:

```txt
GitHub API error while dispatching video-automation.yml: 422 - {"message":"Unexpected inputs provided: [\"dispatch_nonce\"]"}
```

This happens when the Cloudflare Worker has been updated to send the new `dispatch_nonce` input, but GitHub's default-branch workflow file has not yet accepted that input. GitHub rejects unknown `workflow_dispatch` inputs and no runner is started.

## Fix applied

1. `.github/workflows/video-automation.yml` declares optional `dispatch_nonce`.
2. `.github/workflows/image-automation.yml` declares optional `dispatch_nonce`.
3. `worker/src/services/github.ts` is now backward-compatible:
   - First tries dispatch with `dispatch_nonce` for exact run correlation.
   - If GitHub returns `422 Unexpected inputs provided: ["dispatch_nonce"]`, it automatically retries without `dispatch_nonce`.
   - The job still reaches GitHub Actions instead of failing pre-runner.
   - A warning is saved so the UI/monitor explains that legacy workflow inputs were used.
   - Run lookup remains safe: it uses nonce when accepted, otherwise job-id/title fallback only; it does not blindly attach the latest run.

## Files changed

- `worker/src/services/github.ts`
- `.github/workflows/video-automation.yml`
- `.github/workflows/image-automation.yml`

## Deploy order

Push this ZIP to GitHub so workflow YAML and Worker code are both in sync. After Cloudflare deploys, retry the automation. Even if the Worker deploy goes live before GitHub shows the new workflow input, the compatibility retry prevents the job from failing with the `dispatch_nonce` 422 error.

## Expected behavior after deploy

- No more pre-runner failure for `Unexpected inputs provided: ["dispatch_nonce"]`.
- Jobs should dispatch to GitHub Actions.
- If workflow YAML is updated, exact nonce correlation is used.
- If workflow YAML is temporarily stale, fallback dispatch starts the job and monitor shows a compatibility warning.

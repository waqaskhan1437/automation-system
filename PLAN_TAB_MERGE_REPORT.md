# Create Automation Plan Tab Merge Report

## Goal
Merge the separate **Plan** step into the **Basic** tab so Create Automation is easier to understand and manage.

## What changed

### Frontend UI
- Removed the separate **Plan** item from the Create/Edit Automation modal step list.
- Moved Workflow Mode, Prompt Source Setup, AI Prompt Reader, Short Merge Output, and Generated Plan Preview into the **Basic** tab.
- In **Short with Prompt** mode, the old normal multi-source selector is now hidden instead of being disabled with confusing text.
- Added a clear inline note in Basic mode explaining that prompt source/AI plan setup is managed in the same Basic tab.
- Updated Social tab copy from "Plan tab" to "Basic tab".

### Files changed
- `frontend/src/components/automations/AutomationModal.tsx`
- `frontend/src/components/automations/BasicTab.tsx`
- `frontend/src/components/automations/tabs/PlanTab.tsx`
- `frontend/src/components/automations/tabs/SocialTab.tsx`

## New Create Automation flow

1. Basic
   - Workflow Mode
   - Normal video source OR Short with Prompt source
   - AI prompt reader and generated plan preview
   - Skip upload/output folder
   - Schedule
2. Video
3. Taglines
4. Social
5. Publish

## Validation
- Targeted TS/TSX transpile validation passed for changed files.
- Full `npm run check` was attempted but timed out in the sandbox environment, consistent with previous checks on this project.
- Final ZIP integrity verified with `unzip -t`.

## Backend impact
No backend changes were required. Existing config keys are preserved, so saved automations and runner behavior should remain compatible.

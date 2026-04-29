# React Error #31 Fix - Prompt Mode

## Problem
Clicking **Short with Prompt** in the Create Automation Basic tab triggered:

`Minified React error #31: object with keys {id, label, tier}`

## Root cause
The frontend normalized `/api/settings/ai/models` incorrectly in `AutomationModal.tsx`:

- Older UI code expected `models` as `string[]`.
- The backend now returns model objects like `{ id, label, tier }`.
- The UI wrapped each returned model again as `{ id: modelObject, label: modelObject }`.
- When Prompt mode opened the AI model dropdown, React tried to render `model.label`, but `model.label` was an object, not text.

## Fix applied
Added defensive AI catalog normalization in `frontend/src/lib/ai.ts` and used it in:

- `frontend/src/components/automations/AutomationModal.tsx`
- `frontend/src/components/automations/image/ImageAutomationEditor.tsx`

The UI now supports both response shapes safely:

- `models: ["model-id"]`
- `models: [{ "id": "model-id", "label": "Model Name", "tier": "free" }]`

## Result
- Prompt mode no longer renders model objects directly.
- Provider/model dropdown labels are always strings.
- Existing AI provider/model auto-selection still works.
- Image automation AI catalog also fixed to prevent the same bug elsewhere.

## Validation
Targeted TypeScript transpile/syntax checks passed for changed files:

- `src/lib/ai.ts`
- `src/components/automations/AutomationModal.tsx`
- `src/components/automations/image/ImageAutomationEditor.tsx`
- `src/components/automations/BasicTab.tsx`
- `src/components/automations/tabs/PlanTab.tsx`

ZIP integrity check passed.

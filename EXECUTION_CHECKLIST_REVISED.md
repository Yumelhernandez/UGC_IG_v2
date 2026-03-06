# Executable Checklist (Strict Remediation Runbook)

Date: 2026-02-10
Scope: Enforce PRD V2 patched gates after observed failures in rendered outputs.

## Why this stricter checklist exists
The original goals were not met in real output quality. Reported failures included:
- duplicate on-screen message lines in rendered videos,
- format drift toward conversation-style presentation where slideshow-style behavior was expected,
- batch-level gate failures (`qa`, viral mechanics, and reliability checks did not consistently pass together).

This runbook is blocking. No posting until all gates pass for the same date batch.

## Inputs
- PRD: `PRD_Viral_Replication_V2_PATCHED_2026-02-10.md`
- Handoff log: `IMPLEMENTATION_HANDOFF_2026-02-10.md`
- Target batch: `scripts/<DATE>/` and `renders/<DATE>/`

## Gate 0: Set date and initialize run log
1. Set target date variable:
- `export DATE=<YYYY-MM-DD>`
2. Append a new run header in `IMPLEMENTATION_HANDOFF_2026-02-10.md`.

Pass criteria:
- Run header exists with timestamp and owner.

## Gate 1: Generate
1. Run:
- `npm run generate -- --date="$DATE" --count=10`

Pass criteria:
- 10 scripts exist in `scripts/$DATE/`.
- Required metadata present in every script:
- `meta.arc_type`
- `meta.spice_tier`
- `meta.controversy_tier`
- `meta.beat_plan`

If fail:
- Fix generation/schema issue and rerun Gate 1.

## Gate 2: Structural QA
1. Run:
- `npm run qa -- --date="$DATE"`

Pass criteria:
- 10/10 pass.
- No duplicate-line failures.
- No first-gap hard-fail violations.

If fail:
- Fix root cause and rerun Gates 1-2.

## Gate 3: Viral mechanics
1. Run:
- `npm run validate-viral-mechanics -- --date="$DATE" --min-total=10`

Pass criteria:
- PASS.
- Arc integrity 100%.
- Hook uniqueness pass.
- Shareable moment checks pass.

If fail:
- Fix mechanics logic and rerun Gates 1-3.

## Gate 4: Reliability
1. Run:
- `npm run reliability-check -- --date="$DATE" --min-total=10`

Pass criteria:
- PASS with no schema/timeline consistency errors.

If fail:
- Fix issue and rerun Gates 1-4.

## Gate 5: Render and visual validation
1. Sample render:
- `npm run render -- --date="$DATE" --count=2 --only-pass`
2. If sample passes, full render:
- `npm run render -- --date="$DATE" --count=10 --only-pass`
3. Visual spot check at least 4 videos:
- no visible duplicate message artifacts,
- expected format behavior (no unintended conversation drift),
- DM-first visible on opening frames.

Pass criteria:
- Sample and full renders complete.
- Visual checks clear.

If fail:
- Fix renderer/timing/layout and rerun Gates 1-5.

## Gate 6: Go/No-Go report
1. Run:
- `npm run go-live-report -- --date="$DATE" --batch-size=10`

Pass criteria:
- Report exists: `logs/validation/go_live_validation_report_$DATE.md`
- Final decision is `GO`.

If fail:
- `NO_GO` blocks posting. Fix failing gates and rerun full checklist.

## Gate 7: Handoff persistence (required every loop)
Update `IMPLEMENTATION_HANDOFF_2026-02-10.md` after each loop with:
- commands executed,
- pass/fail per gate,
- files changed,
- exact next step.

Pass criteria:
- Another model can resume immediately from the handoff file without additional context.

## Completion definition
A run is complete only when Gates 1-6 pass for the same `$DATE` and Gate 7 is updated.

# QA Spec v2 (9/10 Ready)

This spec is designed for the current pipeline and existing taxonomy in `tools/generate.js`:
- `number_exchange`
- `rejection`
- `plot_twist`
- `cliffhanger`

It does not replace current QA overnight. It layers onto existing checks with high-confidence gating first.

## Goals
- Block unsafe/broken/off-mechanic scripts before render.
- Never render scripts that fail QA.
- Preserve a feedback loop so failed scripts teach the next generation cycle.

## Existing QA Stack (Keep + Extend)
- Script validator: `tools/lib/qa.js`
- QA runner and logs: `tools/qa.js` -> `logs/<date>/qa.json`
- Mechanics validator: `tests/validate-viral-mechanics.js`
- Batch orchestration: `tools/batch.js`
- Render filter: `tools/render.js --only-pass`

## Stage A: Hard Gates (Per Script)
These are strict blockers.

1. Schema and required fields
- `meta`, `story`, `reply`, `persona`, `messages` present and valid.

2. Safety/compliance
- Banned phrase and safety-risk phrase checks.

3. Message integrity
- Every message has non-empty `text`.
- Every message has numeric `type_at`.
- `type_at` values are non-decreasing.

4. Readability hard cap
- No single message exceeds 15 words.

5. Conversation size guardrail
- Total messages in `[2, 22]`.

6. Arc contradiction checks
- `number_exchange`: cannot end without a conversion signal.
- `rejection`: cannot include phone-number drop and must end with rejection cue.
- `plot_twist`: must include twist marker in latter half.
- `cliffhanger`: cannot include clean lock-in ending cues.

7. Terminal beat presence
- Final segment must contain a clear terminal beat aligned to arc.

8. Batch-level exact duplicate blockers
- No exact duplicate hook line in same batch.
- No exact duplicate final girl close line in same batch.

9. Beat-plan metadata contract (current pipeline)
- Require `hook/test/escalation/shift/close` markers for newly generated batches.
- Legacy backfills can be advisory-only if needed.

## Stage B: Weighted Score (Per Script)
Run only when Stage A passes.

Scoring:
- Hook curiosity gap: 20
- Tension progression: 20
- Boy recovery quality: 15
- Payoff clarity: 20
- DM authenticity/read-speed: 15
- Novelty/anti-template: 10

Decision:
- Pass: `>= 78`
- Borderline: `70-77` (one regenerate pass)
- Fail: `< 70`

Auto-cap:
- If Hook `< 10/20` or Payoff `< 10/20`, cannot be full pass.

## Stage C: Batch Drift Checks
Advisory or batch-level fail depending on severity.

- Arc distribution drift vs `config.arc_distribution` (sample-size aware).
- Median words/message target: `4-7`.
- p90 words/message advisory ceiling: `<= 11`.
- Median message count target: `8-12`.
- Pushback prevalence advisory floor: `>= 70%`.
- Exact duplicate rate target: `0%`.

## Stage D: Render-Tier Checks
Separate from script text QA.

- Hook visibility in first 1-3s.
- DM context visible early.
- Context-aligned cutaway/reaction cadence.
- Ending beat visually legible.

## Render Gating Policy (Required)
- Only QA-passing scripts can render.
- If QA pass count is zero, block render.
- If QA pass count is partial:
  - Default: block unless `--allow-partial`.
  - With `--allow-partial`: render only pass set.

## Feedback Loop Artifacts (Required)
Per date in `logs/<date>/`:

- `qa.json`
  - Canonical script pass/fail + reasons.
- `qa-feedback.json`
  - Aggregated reason counts, bucket counts, top reasons, suggested remediation actions.
- `qa-feedback.txt`
  - Human-readable quick summary.
- `render-gate.json`
  - Render decision (`blocked`, `partial_render_only_pass`, `render_completed_only_pass`) and cause.

These artifacts are intended to feed prompt tuning and generator repairs.

## Implementation Mapping
- `tools/lib/qa.js`
  - Keep current core checks, tighten only high-confidence hard gates.
- `tools/qa.js`
  - Produce `qa-feedback.json` and `qa-feedback.txt`.
- `tools/batch.js`
  - Enforce no-render-on-fail policy and write `render-gate.json`.
  - Never fall back to rendering all scripts when QA pass is zero.
- `tools/render.js`
  - Continue using `--only-pass` to filter render set.

## Rollout
1. Pilot in current flow with existing commands.
2. Watch `qa-feedback.json` and `render-gate.json` daily.
3. Calibrate weighted score thresholds on a labeled set before making score strictly blocking.

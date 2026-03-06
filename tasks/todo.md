# PRD V2 Implementation Checklist — Verifier/Fatigue/Repair/Logging

## Hotfix — Format B Render Slot Collision (2026-03-03)
- [x] Reproduce slot-collision path from `video-002-b-long-comedy.json` and confirm duplicate/too-close `afterShotIndex` values are emitted in `getConversationPlan`.
- [x] Patch `remotion/src/utils/timing.ts` so forced in-between slot backfill preserves uniqueness and Format B spacing constraints.
- [x] Verify with a targeted render of `video-002-b-long-comedy.json` and ensure the previous `Format B media pauses too close` error is gone.

## Scope Guard
- [x] Only implement: verifier, fatigue constraints, payoff-punch repair loop, logging/instrumentation, and minimal wiring into existing batch flow.
- [x] No unrelated product features or large refactors.

## Phase 1 — Baseline Mapping
- [x] Confirm batch CLI args and generation/QA/render sequence in `tools/batch.js`.
- [x] Confirm generation slot controls in `tools/generate.js` (arc/format/variant hooks).
- [x] Confirm render filtering mechanism in `tools/render.js`.

## Phase 2 — Core Modules
- [x] Add `tools/lib/logger.js` with synchronous JSONL writes, append mode, `run_complete` on close.
- [x] Add `tools/lib/fatigue.js` with:
  - [x] `computeCaps(daily_count)`
  - [x] `buildSlate(config, date, run_seed, daily_count, logger?)`
  - [x] `checkFatigueCaps(slateItem, counters, caps)`
  - [x] `validateSlate(scriptsDir, caps)`
  - [x] `classifyHookType(script)` / `classifyPayoffType(script)`
- [x] Add `tools/lib/verifier.js` as pure stateless `verifyScript(script, config, options)`:
  - [x] Group 1 schema (fail-fast)
  - [x] Group 2 safety (fail-fast)
  - [x] Group 3 quality with stage-aware payoff severity and fatigue checks
- [x] Add `tools/repair.js` with bounded rounds/candidates, deterministic tie-breaks, logging, and repair artifact writes.

## Phase 3 — Pipeline Wiring
- [x] Update `tools/batch.js` parse args and flow for:
  - [x] `--count`
  - [x] `--seed`
  - [x] `--allow-shortfall`
  - [x] `--allow-repair-failed`
  - [x] `--dry-run` (skip render only)
- [x] In `batch.js`, initialize logger + `run_started` (with config MD5 and daily_count).
- [x] Build slate before generation; write `logs/<date>/slate-manifest.json`; log `slate_created`.
- [x] Run generation with slate-informed slot metadata/controls (minimal generate wiring).
- [x] For each script: post-generate verify -> repair -> post-repair verify -> save final script -> script events.
- [x] Run existing QA unchanged.
- [x] Run final fatigue `validateSlate` pass and pre-render verifier pass.
- [x] Render gate based on PRD (`renderSet` rules + shortfall behavior).
- [x] Write mandatory `run_summary` and close logger.

## Phase 4 — Minimal Supporting Wiring
- [x] Update `tools/generate.js` minimally to accept slate-driven per-slot controls required by batch wiring.
- [x] Update `tools/render.js` minimally to render a filtered file set from batch (if needed).
- [x] Add/update schemas only if required by implemented contracts.

## Phase 5 — Tests
- [x] Add `tests/verifier.test.js` (core AT-V behaviors + non-throw fuzz).
- [x] Add `tests/fatigue.test.js` (caps for N=1/3/4/10, determinism, validation).
- [x] Add `tests/repair.test.js` (bounded loop + invariants on context/from/type_at).
- [x] Add `tests/logger.test.js` (jsonl append/order/required fields).
- [x] Add regression determinism golden test for slate outputs (`N=3`, `N=4`, plus one golden fixture).

## Phase 6 — Verification
- [x] Run smallest relevant unit/regression tests and record pass/fail.
- [x] Run dry batch (`npm run batch -- --count=3 --seed=42 --dry-run --date=<test-date>`).
- [x] Verify artifacts: `logs/<date>/run.jsonl`, `slate-manifest.json`, `repairs/`, finalized scripts meta, run_summary.
- [x] Provide concise changed-files summary + commands + expected artifacts.

## Checkpoint Push — 2026-03-05
- [ ] Confirm branch/remote and inspect pending changes.
- [ ] Create checkpoint commit for current workspace state.
- [ ] Push checkpoint to `origin/main`.
- [ ] Verify `main` is up to date with `origin/main`.
